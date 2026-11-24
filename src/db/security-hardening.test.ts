// @vitest-environment node
/** 0005_security_hardening.sql: atomic throttle hit, session revocation, volume caps. Runs the migration in PGlite. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, SECURITY_HARDENING_MIGRATION_PATH, type Harness } from './test-harness';
import { attemptInsert } from './fixtures';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const hit = (key: string, threshold = 5) => h.asService((s) => s.scalar<number>(`select public.auth_throttle_hit($1, $2)`, [key, threshold]));

describe('auth_throttle_hit', () => {
  it('lets the first 5 attempts through, the 5th starts a 30 second wait, and waiting attempts are refused and not counted', async () => {
    const out: number[] = [];
    for (let i = 0; i < 5; i++) out.push(await hit('h:basic'));
    expect(out).toEqual([0, 0, 0, 0, 0]);
    const refused = [await hit('h:basic'), await hit('h:basic'), await hit('h:basic')];
    for (const w of refused) {
      expect(w).toBeGreaterThan(25);
      expect(w).toBeLessThanOrEqual(30);
    }
    // Refused attempts did not count, so they did not lengthen the wait.
    const failures = await h.asOwner((s) => s.scalar<number>(`select failures from public.auth_throttle where key = 'h:basic'`));
    expect(failures).toBe(5);
  });

  it('after the wait the next attempt is tried again, and the following wait doubles', async () => {
    for (let i = 0; i < 5; i++) await hit('h:escalate');
    await h.asOwner((s) => s.run(`update public.auth_throttle set locked_until = now() - interval '1 second' where key = 'h:escalate'`));
    expect(await hit('h:escalate')).toBe(0);
    const w = await hit('h:escalate');
    expect(w).toBeGreaterThan(55);
    expect(w).toBeLessThanOrEqual(60);
  });

  it('is a fixed window: an hour after it began the count starts again, however slowly attempts came', async () => {
    for (let i = 0; i < 4; i++) await hit('h:window');
    await h.asOwner((s) => s.run(`update public.auth_throttle set window_started_at = now() - interval '61 minutes' where key = 'h:window'`));
    // Four more would be 8 in total under an idle-timeout rule; with a fixed window they are 4 of a new hour.
    for (let i = 0; i < 4; i++) expect(await hit('h:window')).toBe(0);
  });

  it('clear forgets it', async () => {
    for (let i = 0; i < 6; i++) await hit('h:clear');
    await h.asService((s) => s.run(`select public.auth_throttle_clear('h:clear')`));
    expect(await hit('h:clear')).toBe(0);
  });

  it('refuses a bad key or threshold, and only the secret key may call it', async () => {
    for (const [k, t] of [['', 5], ['x'.repeat(101), 5], ['ok', 0]] as const) {
      expect((await h.asService((s) => s.fails(`select public.auth_throttle_hit($1, $2)`, [k, t]))).code).toBe('22023');
    }
    const id = await h.newUser();
    expect((await h.asUser(id, (s) => s.fails(`select public.auth_throttle_hit('x', 5)`))).code).toBe('42501');
    expect((await h.asAnon((s) => s.fails(`select public.auth_throttle_hit('x', 5)`))).code).toBe('42501');
  });
});

describe('revoke_user_sessions', () => {
  it('deletes every session and refresh token of that user and nobody else\'s', async () => {
    const a = await h.newUser();
    const b = await h.newUser();
    await h.asOwner(async (s) => {
      for (const [uid, n] of [[a, 3], [b, 2]] as const) {
        for (let i = 0; i < n; i++) {
          const sid = await s.scalar<string>(`insert into auth.sessions (user_id) values ($1) returning id`, [uid]);
          await s.run(`insert into auth.refresh_tokens (token, user_id, session_id, revoked) values ($1, $2, $3, false)`, [`t-${uid}-${i}`, uid, sid]);
        }
        // A refresh token whose session row is already gone must go too.
        await s.run(`insert into auth.refresh_tokens (token, user_id, revoked) values ($1, $2, false)`, [`orphan-${uid}`, uid]);
      }
    });
    const removed = await h.asService((s) => s.scalar<number>(`select public.revoke_user_sessions($1)`, [a]));
    expect(removed).toBe(3);
    const count = (table: string, col: string, uid: string) =>
      h.asOwner((s) => s.scalar<string>(`select count(*) from auth.${table} where ${col} = $1`, [uid])).then(Number);
    expect(await count('sessions', 'user_id', a)).toBe(0);
    expect(await count('refresh_tokens', 'user_id', a)).toBe(0);
    expect(await count('sessions', 'user_id', b)).toBe(2);
    expect(await count('refresh_tokens', 'user_id', b)).toBe(3);
  });

  it('only the secret key may call it', async () => {
    const id = await h.newUser();
    expect((await h.asUser(id, (s) => s.fails(`select public.revoke_user_sessions($1)`, [id]))).code).toBe('42501');
    expect((await h.asAnon((s) => s.fails(`select public.revoke_user_sessions($1)`, [id]))).code).toBe('42501');
    expect((await h.asService((s) => s.fails(`select public.revoke_user_sessions(null)`))).code).toBe('22023');
  });
});

describe('auth_user_id_by_synthetic_email', () => {
  it('finds only made-up addresses, and only for the secret key', async () => {
    const id = await h.newUser({ email: 'real-user-xyz@accounts.invalid' });
    const real = await h.newUser({ email: 'sam@example.com' });
    expect(await h.asService((s) => s.scalar(`select public.auth_user_id_by_synthetic_email('real-user-xyz@accounts.invalid')`))).toBe(id);
    expect(await h.asService((s) => s.scalar(`select public.auth_user_id_by_synthetic_email('sam@example.com')`))).toBeNull();
    expect(real).toBeTruthy();
    expect((await h.asUser(id, (s) => s.fails(`select public.auth_user_id_by_synthetic_email('x@accounts.invalid')`))).code).toBe('42501');
  });
});

/** Bulk fixture rows as the owner with triggers off (the caps would otherwise count the fixture itself). */
const bulk = (sql: string, params: unknown[]) =>
  h.asOwner(async (s) => {
    await s.run(`set session_replication_role = replica`);
    try {
      await s.run(sql, params);
    } finally {
      await s.run(`set session_replication_role = origin`);
    }
  });

/** Runs `fn` as the learner and returns the error code, or null when it succeeded. */
async function codeOf(uid: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await h.asUser(uid, (s) => s.run(sql, params));
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown';
  }
}

describe('volume caps (a learner\'s own token cannot fill the database)', () => {
  it('game_scores: at most 200 inserts an hour (53400)', async () => {
    const uid = await h.newUser();
    // 200 different game ids, one row each (so the per-game prune does not hide them).
    await h.asUser(uid, async (s) => {
      for (let i = 0; i < 200; i++) await s.run(`insert into public.game_scores (user_id, game_id, score) values ($1, $2, 1)`, [uid, `g-${i}`]);
    });
    expect(await codeOf(uid, `insert into public.game_scores (user_id, game_id, score) values ($1, 'one-more', 1)`, [uid])).toBe('53400');
    expect(Number(await h.asOwner((s) => s.scalar(`select count(*) from public.game_scores where user_id = $1`, [uid])))).toBe(200);
  });

  it('game_scores: only the best 10 rows per game id are kept', async () => {
    const uid = await h.newUser();
    await h.asUser(uid, async (s) => {
      for (let i = 1; i <= 15; i++) await s.run(`insert into public.game_scores (user_id, game_id, score) values ($1, 'note-rush', $2)`, [uid, i * 10]);
    });
    const scores = await h.asOwner((s) => s.q<{ score: number }>(`select score from public.game_scores where user_id = $1 order by score desc`, [uid]));
    expect(scores.map((r) => r.score)).toEqual([150, 140, 130, 120, 110, 100, 90, 80, 70, 60]);
  });

  it('game_scores: a user may hold at most 1000 rows (54000)', async () => {
    const uid = await h.newUser();
    await bulk(`insert into public.game_scores (user_id, game_id, score) select $1, 'bulk-' || g, 1 from generate_series(1, 1000) g`, [uid]);
    expect(await codeOf(uid, `insert into public.game_scores (user_id, game_id, score) values ($1, 'one-more', 1)`, [uid])).toBe('54000');
  });

  it('mock_results: 30 inserts an hour (53400)', async () => {
    const uid = await h.newUser();
    await h.asUser(uid, async (s) => {
      for (let i = 0; i < 30; i++) await s.run(`insert into public.mock_results (user_id, grade, score) values ($1, '1', 0.5)`, [uid]);
    });
    expect(await codeOf(uid, `insert into public.mock_results (user_id, grade, score) values ($1, '1', 0.5)`, [uid])).toBe('53400');
  });

  it('mock_results: at most 500 rows (54000)', async () => {
    const uid = await h.newUser();
    await bulk(`insert into public.mock_results (user_id, grade, score) select $1, '1', 0.5 from generate_series(1, 500)`, [uid]);
    expect(await codeOf(uid, `insert into public.mock_results (user_id, grade, score) values ($1, '1', 0.5)`, [uid])).toBe('54000');
  });

  it('lesson_progress: at most 1000 lessons (54000), but an existing one can still be updated', async () => {
    const uid = await h.newUser();
    await bulk(`insert into public.lesson_progress (user_id, lesson_id) select $1, 'lesson-' || g from generate_series(1, 1000) g`, [uid]);
    expect(await codeOf(uid, `insert into public.lesson_progress (user_id, lesson_id) values ($1, 'one-more')`, [uid])).toBe('54000');
    expect(await codeOf(uid, `update public.lesson_progress set question_index = 3 where user_id = $1 and lesson_id = 'lesson-7'`, [uid])).toBeNull();
  });

  it('lesson_progress: 1500 writes an hour, updates included (53400)', async () => {
    const uid = await h.newUser();
    await h.asUser(uid, (s) => s.run(`insert into public.lesson_progress (user_id, lesson_id) values ($1, 'g1-a')`, [uid]));
    await h.asOwner((s) => s.run(`update private.user_write_counters set n = 1499 where user_id = $1 and kind = 'lesson_progress'`, [uid]));
    expect(await codeOf(uid, `update public.lesson_progress set question_index = 1 where user_id = $1`, [uid])).toBeNull();
    expect(await codeOf(uid, `update public.lesson_progress set question_index = 2 where user_id = $1`, [uid])).toBe('53400');
    // A new hour starts the count again.
    await h.asOwner((s) => s.run(`update private.user_write_counters set window_started_at = now() - interval '61 minutes' where user_id = $1`, [uid]));
    expect(await codeOf(uid, `update public.lesson_progress set question_index = 2 where user_id = $1`, [uid])).toBeNull();
  });

  it('attempts: 5000 direct inserts an hour (53400), on top of 0001\'s 240 a minute', async () => {
    const uid = await h.newUser();
    const [sql, params] = attemptInsert(uid, 1);
    await h.asUser(uid, (s) => s.run(sql, params));
    await h.asOwner((s) => s.run(`update private.user_write_counters set n = 4999 where user_id = $1 and kind = 'attempts_hour'`, [uid]));
    const [sql2, params2] = attemptInsert(uid, 2);
    expect(await codeOf(uid, sql2, params2)).toBeNull();
    const [sql3, params3] = attemptInsert(uid, 3);
    expect(await codeOf(uid, sql3, params3)).toBe('53400');
  });

  it('attempts: 30000 rows a day, merged rows included (53400)', async () => {
    const uid = await h.newUser();
    const [sql, params] = attemptInsert(uid, 1);
    await h.asUser(uid, (s) => s.run(sql, params));
    await h.asOwner((s) => s.run(`update private.user_write_counters set n = 30000 where user_id = $1 and kind = 'attempts_day'`, [uid]));
    const [sql2, params2] = attemptInsert(uid, 2);
    expect(await codeOf(uid, sql2, params2)).toBe('53400');
    // Through merge the same cap applies; merge counts the refused row as skipped instead of failing the call.
    const r = await h.asUser(uid, (q) => q.scalar<{ attempts_inserted: number; attempts_skipped: number }>(`select public.merge_guest_progress($1::jsonb)`, [JSON.stringify({ lessons: [], attempts: [{
      lessonId: 'g1-a', step: 'practice', questionId: 'q-9', skill: 'rhythm.note.value', type: 'multiple-choice', correct: true, score: 1, msTaken: 1, at: '2026-01-01T00:00:00Z' }] })]));
    expect(r.attempts_inserted).toBe(0);
    expect(r.attempts_skipped).toBe(1);
  });

  it('a normal learner is nowhere near any cap: a full guest merge still works', { timeout: 60_000 }, async () => {
    const uid = await h.newUser();
    const attempts = Array.from({ length: 5000 }, (_, i) => ({
      lessonId: 'g1-a', step: 'practice', questionId: `q-${i}`, skill: 'rhythm.note.value', type: 'multiple-choice', correct: true, score: 1, msTaken: 100,
      at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    }));
    const lessons = Array.from({ length: 300 }, (_, i) => ({ lessonId: `lesson-${i}`, state: 'in-progress', step: 'hook', questionIndex: 0 }));
    const r = await h.asUser(uid, (s) => s.scalar<{ attempts_inserted: number; lessons_merged: number }>(`select public.merge_guest_progress($1::jsonb)`, [JSON.stringify({ lessons, attempts })]));
    expect(r.attempts_inserted).toBe(5000);
    expect(r.lessons_merged).toBe(300);
  });

  it('merge refuses a payload over 2 MiB', async () => {
    const uid = await h.newUser();
    const big = { lessons: [], attempts: [], pad: 'x'.repeat(2 * 1024 * 1024 + 10) };
    const err = await h.asUser(uid, (s) => s.fails(`select public.merge_guest_progress($1::jsonb)`, [JSON.stringify(big)]));
    expect(err.code).toBe('54000');
  });

  it('the counters are not readable by a learner, and go when the user does', async () => {
    const uid = await h.newUser();
    await h.asUser(uid, (s) => s.run(`insert into public.mock_results (user_id, grade, score) values ($1, '1', 0.5)`, [uid]));
    expect((await h.asUser(uid, (s) => s.fails(`select * from private.user_write_counters`))).code).toBe('42501');
    await h.asOwner((s) => s.run(`delete from auth.users where id = $1`, [uid]));
    expect(Number(await h.asOwner((s) => s.scalar(`select count(*) from private.user_write_counters where user_id = $1`, [uid])))).toBe(0);
  });
});

describe('the migration', () => {
  it('is safe to run a second time and changes nothing the first time made', async () => {
    const sql = readFileSync(SECURITY_HARDENING_MIGRATION_PATH, 'utf8');
    const uid = await h.newUser();
    await h.asUser(uid, (s) => s.run(`insert into public.mock_results (user_id, grade, score) values ($1, '1', 0.5)`, [uid]));
    await h.db.exec(sql);
    await h.db.exec(sql);
    expect(Number(await h.asOwner((s) => s.scalar(`select count(*) from public.mock_results where user_id = $1`, [uid])))).toBe(1);
    expect(await hit('h:after-rerun')).toBe(0);
  });

  it('refuses to run without 0002 (the throttle table)', async () => {
    const { createHarness: make } = await import('./test-harness');
    const bare = await make({ migrationSql: 'create schema private; select 1' });
    await expect(bare.db.exec(readFileSync(SECURITY_HARDENING_MIGRATION_PATH, 'utf8'))).rejects.toThrow(/0002_auth_throttle/);
    await bare.close();
  });

  it('every function it adds is closed to anon and the learner (private helpers) or open only to service_role', async () => {
    const rows = await h.asOwner((s) => s.q<{ sig: string; anon: boolean; auth: boolean; svc: boolean }>(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as svc
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname in ('auth_throttle_hit', 'revoke_user_sessions', 'auth_user_id_by_synthetic_email')
          or p.proname like 'cap\\_%' or p.proname like '%\\_caps' or p.proname in ('bump_write_counter', 'lock_user_rows', 'game_scores_prune')`));
    expect(rows.length).toBeGreaterThan(14);
    for (const r of rows) {
      expect(r.anon, r.sig).toBe(false);
      expect(r.auth, r.sig).toBe(false);
    }
    for (const sig of ['public.auth_throttle_hit(text,integer)', 'public.revoke_user_sessions(uuid)', 'public.auth_user_id_by_synthetic_email(text)']) {
      expect(rows.find((r) => r.sig.endsWith(sig.replace('public.', '')))?.svc, sig).toBe(true);
    }
  });
});
