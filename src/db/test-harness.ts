/**
 * Test harness for the Supabase migration (P1-01).
 *
 * Boots an in-process Postgres (PGlite), builds the minimum Supabase-shaped
 * environment the migration expects, applies supabase/migrations/0001_init.sql
 * UNMODIFIED, and offers helpers that act as a signed-in user, as anon, or as
 * the service role for the length of a callback.
 *
 * Nothing here talks to a network or a real Supabase project.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const ROOT = join(__dirname, '..', '..');
export const MIGRATION_PATH = join(ROOT, 'supabase', 'migrations', '0001_init.sql');
export const THROTTLE_MIGRATION_PATH = join(ROOT, 'supabase', 'migrations', '0002_auth_throttle.sql');
export const QUESTION_TYPES_MIGRATION_PATH = join(ROOT, 'supabase', 'migrations', '0003_question_types.sql');
export const PROFILE_METADATA_MIGRATION_PATH = join(ROOT, 'supabase', 'migrations', '0004_profile_from_metadata.sql');
export const SECURITY_HARDENING_MIGRATION_PATH = join(ROOT, 'supabase', 'migrations', '0005_security_hardening.sql');
export const SEED_PATH = join(ROOT, 'supabase', 'seed', 'blocked_names.sql');

/** What Supabase gives the migration before it runs (roles, auth schema, default privileges). */
const SUPABASE_SHAPE = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb not null default '{}'::jsonb,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  -- The columns of Supabase's auth.sessions and auth.refresh_tokens that 0005 uses (user_id is text in refresh_tokens).
  create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
  );
  create table auth.refresh_tokens (
    id bigint generated always as identity primary key,
    token text,
    user_id varchar(255),
    session_id uuid references auth.sessions (id) on delete cascade,
    revoked boolean
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  -- Supabase's default privileges: everything created in public is open to the
  -- API roles until the migration says otherwise. The migration must undo this.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  affectedRows?: number;
}

export interface PgError {
  code: string;
  message: string;
}

/** Connection-like object handed to callbacks. */
export interface Session {
  /** Run SQL, return rows. Throws on a database error. */
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL and return the full result (affectedRows). */
  run(sql: string, params?: unknown[]): Promise<QueryResult>;
  /** Run SQL that must fail; returns the Postgres error. Fails the test if it succeeds. */
  fails(sql: string, params?: unknown[]): Promise<PgError>;
  /** First row's first column. */
  scalar<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

export interface Harness {
  db: PGlite;
  /** Create an auth user (as the superuser) and return its id. A profile row appears via the migration's trigger. */
  newUser(opts?: NewUserOptions): Promise<string>;
  asUser<T>(id: string, fn: (s: Session) => Promise<T>): Promise<T>;
  asAnon<T>(fn: (s: Session) => Promise<T>): Promise<T>;
  asService<T>(fn: (s: Session) => Promise<T>): Promise<T>;
  /** As the database owner (superuser). For fixtures and catalog checks only. */
  asOwner<T>(fn: (s: Session) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface NewUserOptions {
  id?: string;
  codeName?: string;
  ageBand?: 'under_18' | 'adult';
  email?: string | null;
  emailConfirmed?: boolean;
}

function toPgError(err: unknown): PgError {
  const e = err as { code?: string; message?: string };
  return { code: e.code ?? '', message: e.message ?? String(err) };
}

function makeSession(db: PGlite): Session {
  const run = async (sql: string, params: unknown[] = []) => {
    const r = await db.query(sql, params);
    return { rows: r.rows as Record<string, unknown>[], affectedRows: r.affectedRows };
  };
  return {
    async q<T>(sql: string, params: unknown[] = []) {
      const r = await db.query(sql, params);
      return r.rows as T[];
    },
    run,
    async fails(sql, params = []) {
      try {
        await db.query(sql, params);
      } catch (err) {
        return toPgError(err);
      }
      throw new Error(`Expected this statement to fail but it succeeded: ${sql}`);
    },
    async scalar<T>(sql: string, params: unknown[] = []) {
      const r = await db.query(sql, params);
      const row = r.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw new Error(`No row returned: ${sql}`);
      return Object.values(row)[0] as T;
    },
  };
}

/** Boot PGlite, build the Supabase-shaped environment, apply the migration file as written. */
export async function createHarness(options: { migrationSql?: string; seed?: boolean; throttle?: boolean; profileMetadata?: boolean } = {}): Promise<Harness> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(SUPABASE_SHAPE);
  await db.exec(options.migrationSql ?? readFileSync(MIGRATION_PATH, 'utf8'));
  // 0003 (question types) is applied to the real project, so the harness always mirrors it.
  if (options.migrationSql === undefined) {
    await db.exec(readFileSync(QUESTION_TYPES_MIGRATION_PATH, 'utf8'));
    if (options.profileMetadata !== false) await db.exec(readFileSync(PROFILE_METADATA_MIGRATION_PATH, 'utf8'));
  }
  if (options.migrationSql === undefined) {
    // 0002 and 0005 are applied to (or about to be applied to) the real project, so the harness always mirrors them.
    // `throttle: false` keeps the database as it was before 0002, for the tests of 0002 itself.
    if (options.throttle !== false) {
      await db.exec(readFileSync(THROTTLE_MIGRATION_PATH, 'utf8'));
      await db.exec(readFileSync(SECURITY_HARDENING_MIGRATION_PATH, 'utf8'));
    }
  } else if (options.throttle) await db.exec(readFileSync(THROTTLE_MIGRATION_PATH, 'utf8'));
  if (options.seed) await db.exec(readFileSync(SEED_PATH, 'utf8'));

  // One connection: serialise role switches so callbacks never interleave.
  let chain: Promise<unknown> = Promise.resolve();
  function withRole<T>(role: string | null, sub: string, fn: (s: Session) => Promise<T>): Promise<T> {
    const result = chain.then(async () => {
      if (role) await db.query(`set role ${role}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
      try {
        return await fn(makeSession(db));
      } finally {
        await db.query('reset role');
        await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
      }
    });
    chain = result.catch(() => undefined);
    return result;
  }

  return {
    db,
    async newUser(opts = {}) {
      const id = opts.id ?? randomUUID();
      const meta: Record<string, string> = {};
      if (opts.codeName) meta.code_name = opts.codeName;
      if (opts.ageBand === 'adult') meta.age_band = 'adult';
      const email = opts.email === undefined ? `${id}@accounts.invalid` : opts.email;
      await withRole(null, '', async (s) => {
        await s.run(
          `insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
           values ($1, $2, $3, $4::jsonb)`,
          [id, email, opts.emailConfirmed ? new Date().toISOString() : null, JSON.stringify(meta)],
        );
      });
      return id;
    },
    asUser: (id, fn) => withRole('authenticated', id, fn),
    asAnon: (fn) => withRole('anon', '', fn),
    asService: (fn) => withRole('service_role', '', fn),
    asOwner: (fn) => withRole(null, '', fn),
    close: () => db.close(),
  };
}
