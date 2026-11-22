/**
 * The slice of the supabase-js query builder that `SupabaseProgressStore` uses, turned into the SQL PostgREST
 * would run and executed in PGlite AS THE SIGNED-IN USER (role `authenticated`, `auth.uid()` set), so the real
 * column grants, row level security, triggers and `merge_guest_progress` apply. Test code only.
 *
 * What it assumes about PostgREST, and the owner's Preview test is what checks: a plain insert or upsert sends
 * exactly the columns given; `ignoreDuplicates` becomes `ON CONFLICT (...) DO NOTHING`; `.select()` after a
 * write returns the written rows (representation); `rpc` passes named arguments to the function.
 */
import type { Harness } from '@/db/test-harness';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (c: string) => {
  if (!IDENT.test(c)) throw new Error(`fake user client: bad identifier ${c}`);
  return c;
};
const TABLES = new Set(['lesson_progress', 'attempts', 'game_scores', 'mock_results']);

type Err = { message: string; code?: string } | null;
type Result = { data: unknown; error: Err };

const asParam = (v: unknown): [unknown, string] =>
  typeof v === 'object' && v !== null ? [JSON.stringify(v), '::jsonb'] : [v, ''];

class UserQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'upsert' = 'select';
  private cols = '*';
  private rows: Record<string, unknown>[] = [];
  private conflict: string[] = [];
  private filters: [string, unknown][] = [];
  private ordering: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private returning = false;

  constructor(private readonly h: Harness, private readonly uid: string, private readonly table: string) {
    if (!TABLES.has(table)) throw new Error(`fake user client: table ${table} not supported`);
  }

  select(cols = '*') {
    this.cols = cols;
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(v: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = 'insert';
    this.rows = Array.isArray(v) ? v : [v];
    return this;
  }
  upsert(v: Record<string, unknown>[], o: { onConflict: string; ignoreDuplicates: true }) {
    if (o.ignoreDuplicates !== true) throw new Error('fake user client: only ignoreDuplicates upserts are supported');
    this.op = 'upsert';
    this.rows = v;
    this.conflict = o.onConflict.split(',').map((c) => ident(c.trim()));
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([ident(col), val]);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    const asc = o?.ascending !== false;
    this.ordering = { col: ident(col), asc };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, bad);
  }

  private async run(): Promise<Result> {
    const params: unknown[] = [];
    const colList = this.cols.split(',').map((c) => (c.trim() === '*' ? '*' : ident(c.trim()))).join(', ');
    let sql: string;
    if (this.op === 'select') {
      const where = this.filters.map(([c, v]) => (params.push(v), `${c} = $${params.length}`));
      sql = `select ${colList} from public.${this.table}${where.length ? ` where ${where.join(' and ')}` : ''}`;
      if (this.ordering) sql += ` order by ${this.ordering.col} ${this.ordering.asc ? 'asc' : 'desc'}`;
      if (this.max !== null) sql += ` limit ${Number(this.max)}`;
    } else {
      const keys = Object.keys(this.rows[0] ?? {}).map(ident);
      const tuples = this.rows.map((row) => {
        const cells = keys.map((k) => {
          const [v, cast] = asParam(row[k]);
          params.push(v);
          return `$${params.length}${cast}`;
        });
        return `(${cells.join(', ')})`;
      });
      sql = `insert into public.${this.table} (${keys.join(', ')}) values ${tuples.join(', ')}`;
      if (this.op === 'upsert') sql += ` on conflict (${this.conflict.join(', ')}) do nothing`;
      if (this.returning) sql += ` returning ${colList}`;
    }
    try {
      const rows = await this.h.asUser(this.uid, (s) => s.q(sql, params));
      return { data: this.op === 'select' || this.returning ? rows : null, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
    }
  }
}

export function userClient(h: Harness, uid: string) {
  return {
    from: (table: string) => new UserQuery(h, uid, table),
    rpc: async (name: string, args: Record<string, unknown>): Promise<Result> => {
      const vals = Object.values(args).map((v) => asParam(v));
      const sql = `select public.${ident(name)}(${vals.map(([, cast], i) => `$${i + 1}${cast}`).join(', ')}) as r`;
      try {
        const rows = await h.asUser(uid, (s) => s.q<{ r: unknown }>(sql, vals.map(([v]) => v)));
        return { data: rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
      }
    },
  };
}
