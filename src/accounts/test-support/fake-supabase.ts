/**
 * A stand-in for the supabase-js clients that `SupabaseAccountBackend` uses, backed by the REAL
 * migrations in PGlite: `code_name_available()`, the profiles trigger and unique index, `account_secrets`
 * and the throttle functions are the actual SQL. Only Supabase Auth itself (users, passwords, sessions)
 * is imitated, in a few dozen lines. Test code only.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Harness } from '@/db/test-harness';
import type { CookieJar } from '../backend/types';
import { userClient } from './fake-user-client';

const COOKIE = 'sb-fake-auth-token';
const TABLES = new Set(['profiles', 'account_secrets']);
const COLUMN = /^[a-z_]+$/;

type Err = { message: string; status?: number; code?: string } | null;

class Query implements PromiseLike<{ data: unknown; error: Err }> {
  private op: 'select' | 'insert' | 'update' = 'select';
  private cols = '*';
  private values: Record<string, unknown> = {};
  private filters: [string, unknown][] = [];
  private single = false;

  constructor(private readonly h: Harness, private readonly table: string) {
    if (!TABLES.has(table)) throw new Error(`fake supabase: table ${table} not supported`);
  }
  select(cols = '*') { this.op = this.op === 'select' ? 'select' : this.op; this.cols = cols; return this; }
  insert(v: Record<string, unknown>) { this.op = 'insert'; this.values = v; return this; }
  update(v: Record<string, unknown>) { this.op = 'update'; this.values = v; return this; }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
  maybeSingle() { this.single = true; return this; }

  then<R1 = { data: unknown; error: Err }, R2 = never>(
    ok?: ((v: { data: unknown; error: Err }) => R1 | PromiseLike<R1>) | null,
    bad?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(ok, bad);
  }

  private async run(): Promise<{ data: unknown; error: Err }> {
    const ident = (c: string) => { if (!COLUMN.test(c)) throw new Error('bad column'); return c; };
    const keys = Object.keys(this.values).map(ident);
    const params: unknown[] = keys.map((k) => this.values[k]);
    const cond = this.filters.map(([c, v]) => { params.push(v); return `${ident(c)} = $${params.length}`; });
    const whereSql = cond.length ? ` where ${cond.join(' and ')}` : '';
    let sql: string;
    if (this.op === 'insert') {
      sql = `insert into public.${this.table} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`;
    } else if (this.op === 'update') {
      sql = `update public.${this.table} set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}${whereSql}`;
    } else {
      sql = `select ${this.cols} from public.${this.table}${whereSql}`;
    }
    try {
      const rows = await this.h.asService((s) => s.q(sql, params));
      return { data: this.op === 'select' ? (this.single ? (rows[0] ?? null) : rows) : null, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
    }
  }
}

export interface FakeSupabase {
  admin: SupabaseClient;
  sessionClient(jar: CookieJar): SupabaseClient;
}

export function createFakeSupabase(h: Harness): FakeSupabase {
  const passwords = new Map<string, string>(); // user id -> bcrypt hash
  const sessions = new Map<string, string>(); // token -> user id

  const userByEmail = async (email: string) =>
    (await h.asOwner((s) => s.q<{ id: string }>(`select id from auth.users where email = $1`, [email])))[0] ?? null;
  const userById = async (id: string) =>
    (await h.asOwner((s) => s.q<{ id: string; email: string }>(`select id, email from auth.users where id = $1`, [id])))[0] ?? null;

  const rpcNames = new Set(['code_name_available', 'auth_throttle_check', 'auth_throttle_fail', 'auth_throttle_clear']);
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (!rpcNames.has(name)) throw new Error(`fake supabase: rpc ${name} not supported`);
      const vals = Object.values(args);
      const sql = `select public.${name}(${vals.map((_, i) => `$${i + 1}`).join(', ')}) as r`;
      try {
        const rows = await h.asService((s) => s.q<{ r: unknown }>(sql, vals));
        return { data: rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    from: (table: string) => new Query(h, table),
    auth: {
      admin: {
        createUser: async (a: { email: string; password: string; email_confirm?: boolean; app_metadata?: Record<string, unknown> }) => {
          const id = randomUUID();
          try {
            // Like real Supabase Auth: the user row is inserted with only the provider metadata, and the
            // custom app_metadata is written by a later UPDATE (found on the real project, 23 Nov 2026).
            await h.asOwner((s) =>
              s.run(`insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values ($1, $2, now(), '{"provider":"email","providers":["email"]}'::jsonb)`, [id, a.email]),
            );
            await h.asOwner((s) =>
              s.run(`update auth.users set raw_app_meta_data = raw_app_meta_data || $2::jsonb where id = $1`, [id, JSON.stringify(a.app_metadata ?? {})]),
            );
          } catch {
            // Supabase hides the trigger's reason behind this generic message.
            return { data: { user: null }, error: { message: 'Database error creating new user', status: 500 } };
          }
          passwords.set(id, await bcrypt.hash(a.password, 4));
          return { data: { user: { id, email: a.email } }, error: null };
        },
        getUserById: async (id: string) => {
          const u = await userById(id);
          return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'User not found', status: 404 } };
        },
        updateUserById: async (id: string, attrs: { password?: string }) => {
          if (!(await userById(id))) return { data: { user: null }, error: { message: 'User not found' } };
          if (attrs.password) passwords.set(id, await bcrypt.hash(attrs.password, 4));
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          // Like the real admin API: a user that is not there is a 404, not a success.
          if (!(await userById(id))) return { data: { user: null }, error: { message: 'User not found', status: 404, code: 'user_not_found' } };
          await h.asOwner((s) => s.run(`delete from auth.users where id = $1`, [id]));
          passwords.delete(id);
          return { data: null, error: null };
        },
        signOut: async (token: string, scope: 'global' | 'local' | 'others') => {
          const uid = sessions.get(token);
          if (uid && scope === 'others') for (const [t, u] of sessions) if (u === uid && t !== token) sessions.delete(t);
          return { data: null, error: null };
        },
      },
    },
  };

  const sessionClient = (jar: CookieJar) => {
    const token = () => jar.getAll().find((c) => c.name === COOKIE)?.value;
    // Data calls run as the signed-in user (role `authenticated`), so row level security applies.
    const asUser = () => {
      const t = token();
      const uid = t ? sessions.get(t) : undefined;
      if (!uid) throw new Error('fake supabase: no signed-in user for a data call');
      return userClient(h, uid);
    };
    return {
      from: (table: string) => asUser().from(table),
      rpc: (name: string, args: Record<string, unknown> = {}) => asUser().rpc(name, args),
      auth: {
        signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
          const u = await userByEmail(email);
          const hash = u ? passwords.get(u.id) : undefined;
          if (!u || !hash || !(await bcrypt.compare(password, hash))) {
            return { data: { session: null }, error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' } };
          }
          const t = randomUUID();
          sessions.set(t, u.id);
          jar.setAll([{ name: COOKIE, value: t, options: { httpOnly: true, path: '/' } }]);
          return { data: { session: { access_token: t } }, error: null };
        },
        getSession: async () => {
          const t = token();
          return { data: { session: t && sessions.has(t) ? { access_token: t } : null }, error: null };
        },
        getUser: async () => {
          const t = token();
          const uid = t ? sessions.get(t) : undefined;
          // Like the real auth server, a session whose user has been deleted is no session at all.
          return uid && (await userById(uid))
            ? { data: { user: { id: uid } }, error: null }
            : { data: { user: null }, error: { message: 'no session' } };
        },
        signOut: async () => {
          const t = token();
          if (t) sessions.delete(t);
          jar.setAll([{ name: COOKIE, value: '', options: { maxAge: 0 } }]);
          return { error: null };
        },
      },
    };
  };

  return {
    admin: admin as unknown as SupabaseClient,
    sessionClient: (jar) => sessionClient(jar) as unknown as SupabaseClient,
  };
}
