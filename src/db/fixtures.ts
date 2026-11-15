/** Shared data builders for the database tests. Test code only. */
import type { Harness, Session } from './test-harness';

export const BCRYPT_SAMPLE = `$2b$10$${'a'.repeat(53)}`;

export const ATTEMPT_COLUMNS =
  'user_id, lesson_id, step, question_id, skill, type, correct, score, ms_taken, occurred_at';

/** SQL and params for a valid attempt row. `n` makes the dedupe key unique. */
export function attemptInsert(uid: string, n = 1): [string, unknown[]] {
  return [
    `insert into public.attempts (${ATTEMPT_COLUMNS})
     values ($1, 'g1-rhythm-01', 'practice', $2, 'rhythm.note.value', 'multiple-choice', true, 1, 1200, $3)`,
    [uid, `q-${n}`, new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()],
  ];
}

/** One row in every per-user table for `uid`, written as the service role. */
export async function seedUserData(h: Harness, uid: string): Promise<void> {
  await h.asService(async (s: Session) => {
    await s.run(`insert into public.lesson_progress (user_id, lesson_id, state, step, question_index, best_score)
                 values ($1, 'g1-rhythm-01', 'complete', 'recap', 0, 0.9)`, [uid]);
    const [sql, params] = attemptInsert(uid, 1);
    await s.run(sql, params);
    await s.run(`insert into public.game_scores (user_id, game_id, score, summary)
                 values ($1, 'note-rush', 120, '{"streak": 7}'::jsonb)`, [uid]);
    await s.run(`insert into public.mock_results (user_id, grade, score, breakdown)
                 values ($1, '1', 0.75, '{"rhythm": 0.5, "pitch.treble": 1}'::jsonb)`, [uid]);
    await s.run(`insert into public.account_secrets (user_id, recovery_code_hash, failed_attempts)
                 values ($1, $2, 2)`, [uid, BCRYPT_SAMPLE]);
  });
}

/** Adds an adult_contacts row (user must be adult). */
export async function seedAdultContact(h: Harness, uid: string, fullName = 'Alex Example'): Promise<void> {
  await h.asService((s) =>
    s.run(`insert into public.adult_contacts (user_id, full_name) values ($1, $2)`, [uid, fullName]),
  );
}

export const USER_TABLES = [
  'profiles',
  'adult_contacts',
  'account_secrets',
  'lesson_progress',
  'attempts',
  'game_scores',
  'mock_results',
] as const;

export const ALL_TABLES = [...USER_TABLES, 'blocked_names'] as const;

export async function countRows(h: Harness, table: string, uid: string): Promise<number> {
  return h.asOwner(async (s) =>
    Number(await s.scalar(`select count(*) from public.${table} where user_id = $1`, [uid])),
  );
}

/** Run `fn` with the given extra statements applied as owner, always undone afterwards. */
export async function withTemporarily<T>(
  h: Harness,
  apply: string,
  undo: string,
  fn: () => Promise<T>,
): Promise<T> {
  await h.db.exec(apply);
  try {
    return await fn();
  } finally {
    await h.db.exec(undo);
  }
}

/** GRANT statements that reproduce a role's current table and column privileges. */
async function captureGrants(h: Harness, role: string): Promise<string[]> {
  return h.asOwner(async (s) => {
    const tables = await s.q<{ stmt: string }>(
      `select format('grant %s on %s to %I', x.privilege_type, c.oid::regclass, $1::text) as stmt
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       cross join lateral aclexplode(c.relacl) x
       join pg_roles r on r.oid = x.grantee and r.rolname = $1
       where c.relkind = 'r'`,
      [role],
    );
    const cols = await s.q<{ stmt: string }>(
      `select format('grant %s (%I) on %s to %I', x.privilege_type, a.attname, c.oid::regclass, $1::text) as stmt
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       cross join lateral aclexplode(a.attacl) x
       join pg_roles r on r.oid = x.grantee and r.rolname = $1
       where c.relkind = 'r' and a.attacl is not null`,
      [role],
    );
    return [...tables, ...cols].map((r) => r.stmt);
  });
}

/**
 * Give a role every table privilege, so that only row level security stands
 * between it and the data. Proves the policies do not depend on the grants.
 * The role's real privileges are restored afterwards.
 */
export async function withFullGrants<T>(h: Harness, role: 'anon' | 'authenticated', fn: () => Promise<T>): Promise<T> {
  const tables = ALL_TABLES.map((t) => `public.${t}`).join(', ');
  const saved = await captureGrants(h, role);
  await h.asOwner((s) => s.run(`grant select, insert, update, delete on ${tables} to ${role}`));
  try {
    return await fn();
  } finally {
    await h.asOwner(async (s) => {
      await s.run(`revoke all on ${tables} from ${role}`);
      for (const stmt of saved) await s.run(stmt);
    });
  }
}

/** Capture the outcome of a statement without throwing. */
export async function attempt(
  s: Session,
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: true; count: number } | { ok: false; code: string; message: string }> {
  try {
    const r = await s.run(sql, params);
    return { ok: true, count: r.affectedRows ?? r.rows.length };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code ?? '', message: err.message ?? '' };
  }
}
