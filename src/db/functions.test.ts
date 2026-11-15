// @vitest-environment node
/** merge_guest_progress, export_my_data (Acceptance 9), delete_my_account (Acceptance 8). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './test-harness';
import { ALL_TABLES, USER_TABLES, attemptInsert, seedAdultContact, seedUserData, countRows } from './fixtures';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const merge = (uid: string, payload: unknown) =>
  h.asUser(uid, (s) => s.scalar<Record<string, number>>(`select public.merge_guest_progress($1::jsonb)`, [JSON.stringify(payload)]));
const mergeFails = (uid: string, payload: unknown) =>
  h.asUser(uid, (s) => s.fails(`select public.merge_guest_progress($1::jsonb)`, [JSON.stringify(payload)]));

const att = (n: number, over: Record<string, unknown> = {}) => ({
  lessonId: 'g1-rhythm-01', step: 'practice', questionId: `q-${n}`, skill: 'rhythm.note.value',
  type: 'multiple-choice', correct: true, score: 1, msTaken: 900, at: new Date(Date.UTC(2026, 5, 1, 10, 0, n)).toISOString(), ...over,
});
const les = (id: string, over: Record<string, unknown> = {}) => ({ lessonId: id, state: 'in-progress', step: 'practice', questionIndex: 1, bestScore: 0.5, ...over });

const count = async (t: string, uid: string) => countRows(h, t, uid);
const lesson = (uid: string, id: string) =>
  h.asOwner((s) => s.q<{ state: string; step: string; question_index: number; best_score: number | null }>(
    `select state, step, question_index, best_score from public.lesson_progress where user_id = $1 and lesson_id = $2`, [uid, id]).then((r) => r[0]));

describe('merge_guest_progress', () => {
  it('good payload: rows are written for the caller and flagged merged', async () => {
    const u = await h.newUser();
    const r = await merge(u, { lessons: [les('g1-rhythm-01'), les('g1-pitch-01', { state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9 })], attempts: [att(1), att(2, { correct: false, score: 0, source: 'generated', seed: 77 })] });
    expect(r).toEqual({ lessons_merged: 2, lessons_skipped: 0, attempts_inserted: 2, attempts_duplicate: 0, attempts_skipped: 0 });
    expect(await count('lesson_progress', u)).toBe(2);
    expect(await count('attempts', u)).toBe(2);
    const rows = await h.asOwner((s) => s.q<{ merged: boolean; source: string; seed: string | null }>(`select merged, source, seed from public.attempts where user_id = $1 order by id`, [u]));
    expect(rows.map((x) => x.merged)).toEqual([true, true]);
    expect(rows[1].source).toBe('generated');
    expect(Number(rows[1].seed)).toBe(77);
  });

  it('repeating the same payload adds nothing (dedupe key: user, lesson, step, question, at)', async () => {
    const u = await h.newUser();
    const payload = { lessons: [les('g1-rhythm-01')], attempts: [att(1), att(2), att(3)] };
    await merge(u, payload);
    const before = await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1 order by id`, [u]));
    const r2 = await merge(u, payload);
    expect(r2).toMatchObject({ attempts_inserted: 0, attempts_duplicate: 3, attempts_skipped: 0 });
    expect(await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1 order by id`, [u]))).toEqual(before);
    expect(await count('lesson_progress', u)).toBe(1);
  });

  it('duplicates inside one payload are inserted once', async () => {
    const u = await h.newUser();
    const r = await merge(u, { attempts: [att(1), att(1), att(1)] });
    expect(r).toMatchObject({ attempts_inserted: 1, attempts_duplicate: 2 });
  });

  it('an attempt differing in the key (another time) is a new attempt', async () => {
    const u = await h.newUser();
    await merge(u, { attempts: [att(1)] });
    const r = await merge(u, { attempts: [att(1, { at: '2026-06-02T00:00:00.000Z' })] });
    expect(r).toMatchObject({ attempts_inserted: 1 });
  });

  it('keeps the better best_score and the more advanced state, in either order', async () => {
    for (const order of ['existing-first', 'incoming-first']) {
      const u = await h.newUser();
      const strong = les('g1-rhythm-01', { state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9 });
      const weak = les('g1-rhythm-01', { state: 'in-progress', step: 'hook', questionIndex: 0, bestScore: 0.4 });
      if (order === 'existing-first') {
        await merge(u, { lessons: [strong] });
        await merge(u, { lessons: [weak] });
      } else {
        await merge(u, { lessons: [weak] });
        await merge(u, { lessons: [strong] });
      }
      expect(await lesson(u, 'g1-rhythm-01'), order).toEqual({ state: 'complete', step: 'recap', question_index: 0, best_score: 0.9 });
    }
  });
  it('a better score with a worse state keeps both maxima separately; mastered beats complete', async () => {
    const u = await h.newUser();
    await merge(u, { lessons: [les('g1-rhythm-01', { state: 'complete', bestScore: 0.6, step: 'recap', questionIndex: 0 })] });
    await merge(u, { lessons: [les('g1-rhythm-01', { state: 'in-progress', bestScore: 0.95 })] });
    expect(await lesson(u, 'g1-rhythm-01')).toMatchObject({ state: 'complete', best_score: 0.95 });
    await merge(u, { lessons: [les('g1-rhythm-01', { state: 'mastered', bestScore: null, step: 'recap', questionIndex: 0 })] });
    expect(await lesson(u, 'g1-rhythm-01')).toMatchObject({ state: 'mastered', best_score: 0.95 });
  });
  it('resume position comes from the further-along row at the same state', async () => {
    const u = await h.newUser();
    await merge(u, { lessons: [les('g1-rhythm-01', { step: 'practice', questionIndex: 2 })] });
    await merge(u, { lessons: [les('g1-rhythm-01', { step: 'practice', questionIndex: 1 })] });
    expect(await lesson(u, 'g1-rhythm-01')).toMatchObject({ step: 'practice', question_index: 2 });
    await merge(u, { lessons: [les('g1-rhythm-01', { step: 'challenge', questionIndex: 0 })] });
    expect(await lesson(u, 'g1-rhythm-01')).toMatchObject({ step: 'challenge', question_index: 0 });
  });

  it('a forged user id inside the payload is ignored', async () => {
    const a = await h.newUser();
    const b = await h.newUser();
    await seedUserData(h, b);
    const bBefore = await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1`, [b]));
    const r = await merge(a, {
      user_id: b, userId: b,
      lessons: [{ ...les('g1-pitch-01'), user_id: b, userId: b }],
      attempts: [{ ...att(5), user_id: b, userId: b }, { ...att(6), user_id: a }],
    });
    expect(r).toMatchObject({ lessons_merged: 1, attempts_inserted: 2 });
    expect(await count('attempts', a)).toBe(2);
    expect(await count('lesson_progress', a)).toBe(1);
    expect(await h.asOwner((s) => s.q(`select * from public.attempts where user_id = $1`, [b]))).toEqual(bBefore);
    expect(await count('lesson_progress', b)).toBe(1); // only B's seeded row
    // And overwriting B's lesson via a forged id fails to touch it.
    await merge(a, { lessons: [{ ...les('g1-rhythm-01', { state: 'mastered', bestScore: 1 }), user_id: b }] });
    expect(await lesson(b, 'g1-rhythm-01')).toMatchObject({ state: 'complete', best_score: 0.9 });
  });

  it('malformed elements are skipped and counted; good ones still go in', async () => {
    const u = await h.newUser();
    const badLessons = [
      null, 'x', 7, [], {}, les('Bad Id'), les('g1-rhythm-01', { state: 'finished' }), les('g1-rhythm-01', { step: 'warmup' }),
      les('g1-rhythm-01', { questionIndex: -1 }), les('g1-rhythm-01', { questionIndex: 1.5 }), les('g1-rhythm-01', { questionIndex: '3' }),
      les('g1-rhythm-01', { questionIndex: 99999 }), les('g1-rhythm-01', { bestScore: 1.2 }), les('g1-rhythm-01', { bestScore: -1 }),
      les('g1-rhythm-01', { bestScore: 'high' }), les('g1-rhythm-01', { lessonId: 5 }), les('x'.repeat(101)),
    ];
    const badAttempts = [
      null, 'x', 3, [], {}, att(1, { lessonId: 'Bad Id' }), att(1, { step: 'x' }), att(1, { type: 'x' }), att(1, { skill: 'nodots' }),
      att(1, { questionId: 'Q 1' }), att(1, { correct: 'yes' }), att(1, { correct: 1 }), att(1, { score: 2 }), att(1, { score: -0.5 }),
      att(1, { score: '1' }), att(1, { msTaken: -5 }), att(1, { msTaken: 9e9 }), att(1, { msTaken: 1.5 }), att(1, { at: 'yesterday' }),
      att(1, { at: '2026-13-45T10:00:00Z' }), att(1, { at: '1999-01-01T00:00:00Z' }), att(1, { at: '2999-01-01T00:00:00Z' }),
      att(1, { at: 12345 }), att(1, { seed: 1.5 }), att(1, { seed: 'a' }), att(1, { source: 'typed' }), att(1, { questionId: undefined }),
    ];
    // JSON.stringify cannot produce 1e400, so splice a raw out-of-range number in by hand.
    const huge = JSON.stringify(att(1)).replace('"score":1', '"score":1e400');
    const raw = JSON.stringify({ lessons: [...badLessons, les('g1-pitch-01')], attempts: [...badAttempts, att(2)] })
      .replace('"attempts":[', `"attempts":[${huge},`);
    const r = await h.asUser(u, (s) => s.scalar<Record<string, number>>(`select public.merge_guest_progress($1::jsonb)`, [raw]));
    expect(r.lessons_merged).toBe(1);
    expect(r.lessons_skipped).toBe(badLessons.length);
    expect(r.attempts_inserted).toBe(1);
    expect(r.attempts_skipped).toBe(badAttempts.length + 1);
    expect(await count('lesson_progress', u)).toBe(1);
    expect(await count('attempts', u)).toBe(1);
  });

  it('non-object payloads and wrong array types are refused outright', async () => {
    const u = await h.newUser();
    for (const p of [null, [], 'x', 5, true]) {
      const r = await h.asUser(u, (s) => s.fails(`select public.merge_guest_progress($1::jsonb)`, [JSON.stringify(p)]));
      expect(r.code, JSON.stringify(p)).toBe('22023');
    }
    expect((await h.asUser(u, (s) => s.fails(`select public.merge_guest_progress(null)`))).code).toBe('22023');
    expect((await mergeFails(u, { lessons: {} })).code).toBe('22023');
    expect((await mergeFails(u, { attempts: 'x' })).code).toBe('22023');
    expect(await merge(u, {})).toEqual({ lessons_merged: 0, lessons_skipped: 0, attempts_inserted: 0, attempts_duplicate: 0, attempts_skipped: 0 });
  });

  it('oversized payloads are refused and write nothing', async () => {
    const u = await h.newUser();
    const lessons = Array.from({ length: 501 }, (_, i) => les(`lesson-${i}`));
    expect((await mergeFails(u, { lessons })).code).toBe('54000');
    expect(await count('lesson_progress', u)).toBe(0);
    const ok500 = await merge(u, { lessons: lessons.slice(0, 500) });
    expect(ok500.lessons_merged).toBe(500);

    const attempts = Array.from({ length: 5001 }, (_, i) => att(i + 1, { at: new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + i * 1000).toISOString() }));
    expect((await mergeFails(u, { attempts })).code).toBe('54000');
    expect(await count('attempts', u)).toBe(0);

    expect((await mergeFails(u, { attempts: [att(1, { questionId: 'a'.repeat(3_200_000) })] })).code).toBe('54000');
    expect(await count('attempts', u)).toBe(0);
  }, 60_000);

  it('accepts 1000 attempts at once (merge is not subject to the per-minute cap)', async () => {
    const u = await h.newUser();
    const attempts = Array.from({ length: 1000 }, (_, i) => att(i + 1, { at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() }));
    const r = await merge(u, { attempts });
    expect(r.attempts_inserted).toBe(1000);
    // Live attempts right afterwards are still allowed: merged rows do not count against the cap.
    const [sql, params] = attemptInsert(u, 2000);
    await h.asUser(u, (s) => s.run(sql, params));
  }, 60_000);

  it('merge cannot be used as a flood: 10000 merged attempts per hour', async () => {
    const u = await h.newUser();
    await h.asOwner((s) => s.run(
      `insert into public.attempts (user_id, lesson_id, step, question_id, skill, type, correct, score, ms_taken, occurred_at, merged)
       select $1, 'g1-rhythm-01', 'practice', 'q-' || g, 'rhythm.note.value', 'multiple-choice', true, 1, 10, '2026-01-01'::timestamptz + (g || ' seconds')::interval, true
       from generate_series(1, 9999) g`, [u]));
    expect((await mergeFails(u, { attempts: [att(1), att(2)] })).code).toBe('53400');
    expect((await merge(u, { attempts: [att(1)] })).attempts_inserted).toBe(1);
  }, 60_000);

  it('needs a signed-in caller', async () => {
    expect((await h.asAnon((s) => s.fails(`select public.merge_guest_progress('{}'::jsonb)`))).code).toBe('42501');
    expect((await h.asService((s) => s.fails(`select public.merge_guest_progress('{}'::jsonb)`))).code).toBe('42501');
  });
});

describe('Acceptance 9: export_my_data returns only the caller rows', () => {
  it('every table, with another user holding data too', async () => {
    const a = await h.newUser({ ageBand: 'adult', codeName: 'ExportA', email: 'export-a@example.com' });
    const b = await h.newUser({ ageBand: 'adult', codeName: 'ExportB', email: 'export-b@example.com' });
    for (const u of [a, b]) {
      await seedUserData(h, u);
      await seedAdultContact(h, u, u === a ? 'Alice A' : 'Bob B');
    }
    await h.asService((s) => s.run(`insert into public.game_scores (user_id, game_id, score) values ($1,'note-rush',5)`, [a]));
    const out = await h.asUser(a, (s) => s.scalar<Record<string, unknown>>(`select public.export_my_data()`));
    const text = JSON.stringify(out);
    expect(text).not.toContain(b);
    expect(text).not.toContain('ExportB');
    expect(text).not.toContain('Bob B');
    expect(text).not.toContain('export-b@example.com');
    expect(text).not.toContain('$2b$'); // no credential hash
    expect((out.profile as { user_id: string }).user_id).toBe(a);
    expect((out.adult_contact as { full_name: string }).full_name).toBe('Alice A');
    expect((out.account as { email: string }).email).toBe('export-a@example.com');
    expect(out.account_secrets).toMatchObject({ has_recovery_code: true, failed_attempts: 2 });
    for (const key of ['lesson_progress', 'attempts', 'game_scores', 'mock_results']) {
      const rows = out[key] as { user_id: string }[];
      expect(rows.length, key).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === a), key).toBe(true);
    }
    // Counts match the database.
    expect((out.game_scores as unknown[]).length).toBe(await count('game_scores', a));
    expect((out.attempts as unknown[]).length).toBe(await count('attempts', a));
  });
  it('the synthetic address is not exported; a user with no data gets empty lists', async () => {
    const u = await h.newUser({ codeName: 'EmptyOne' });
    const out = await h.asUser(u, (s) => s.scalar<Record<string, unknown>>(`select public.export_my_data()`));
    expect((out.account as { email: unknown }).email).toBeNull();
    expect(out.attempts).toEqual([]);
    expect(out.adult_contact).toBeNull();
    expect(out.account_secrets).toBeNull();
    expect(JSON.stringify(out)).not.toContain('accounts.invalid');
  });
  it('anon and the service role cannot call it', async () => {
    expect((await h.asAnon((s) => s.fails(`select public.export_my_data()`))).code).toBe('42501');
    expect((await h.asService((s) => s.fails(`select public.export_my_data()`))).code).toBe('42501');
  });
});

describe('Acceptance 8: delete_my_account leaves no row for that user in any table', () => {
  it('removes everything for the caller and nothing for anyone else', async () => {
    const a = await h.newUser({ ageBand: 'adult', codeName: 'DeleteMe1', email: 'del@example.com', emailConfirmed: true });
    const b = await h.newUser({ ageBand: 'adult', codeName: 'KeepMe1' });
    for (const u of [a, b]) {
      await seedUserData(h, u);
      await seedAdultContact(h, u);
    }
    await merge(a, { lessons: [les('g1-pitch-01')], attempts: [att(9)] });
    for (const t of USER_TABLES) expect(await count(t, a), `${t} before`).toBeGreaterThan(0);
    const bBefore: Record<string, number> = {};
    for (const t of USER_TABLES) bBefore[t] = await count(t, b);

    await h.asUser(a, (s) => s.run(`select public.delete_my_account()`));

    for (const t of USER_TABLES) expect(await count(t, a), `${t} after`).toBe(0);
    expect(Number(await h.asOwner((s) => s.scalar<string>(`select count(*) from auth.users where id = $1`, [a])))).toBe(0);
    for (const t of USER_TABLES) expect(await count(t, b), `${t} (other user)`).toBe(bBefore[t]);
    // The code name is free again.
    expect(await h.asService((s) => s.scalar<boolean>(`select public.code_name_available('DeleteMe1')`))).toBe(true);
    // Sweep: no table anywhere in public holds the id (guards against a table added without a cascade).
    await h.asOwner(async (s) => {
      for (const t of ALL_TABLES.filter((x) => x !== 'blocked_names')) {
        expect(Number(await s.scalar<string>(`select count(*) from public.${t} where user_id = $1`, [a])), t).toBe(0);
      }
    });
  });
  it('anon and the service role cannot call it; a second call is harmless', async () => {
    expect((await h.asAnon((s) => s.fails(`select public.delete_my_account()`))).code).toBe('42501');
    expect((await h.asService((s) => s.fails(`select public.delete_my_account()`))).code).toBe('42501');
    const u = await h.newUser();
    await h.asUser(u, (s) => s.run(`select public.delete_my_account()`));
    await h.asUser(u, (s) => s.run(`select public.delete_my_account()`));
  });
});
