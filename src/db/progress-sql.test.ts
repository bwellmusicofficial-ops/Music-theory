// @vitest-environment node
/**
 * P1-03: the exact statements the progress routes make (see src/accounts/progress/supabase.ts), run as the
 * signed-in user under the real grants and row level security, and the same statements aimed at someone
 * else's rows. Also keeps the app's id lists and the database's enums in step.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userClient } from '@/accounts/test-support/fake-user-client';
import { QUESTION_TYPES } from '@/lesson/schema';
import { DB_QUESTION_TYPES } from '@/sync/wire';
import { createHarness, type Harness } from './test-harness';

let h: Harness;
let a: string;
let b: string;
beforeAll(async () => {
  h = await createHarness({ seed: true });
  a = await h.newUser({ codeName: 'ProgressA' });
  b = await h.newUser({ codeName: 'ProgressB' });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const at = (s: number) => new Date(Date.UTC(2026, 5, 1, 10, 0, s)).toISOString();
const attemptRow = (uid: string, i: number) => ({
  user_id: uid, lesson_id: 'g1-rhythm-01', step: 'practice', question_id: `q-${i}`, skill: 'rhythm.note.value',
  type: 'multiple-choice', correct: true, score: 1, ms_taken: 900, seed: null, source: 'authored', occurred_at: at(i),
});
const KEY = 'user_id,lesson_id,step,question_id,occurred_at';
const countAs = (uid: string, table: string) => h.asUser(uid, async (s) => Number(await s.scalar(`select count(*) from public.${table}`)));

describe('the database enums and the app agree', () => {
  it('question_type holds exactly DB_QUESTION_TYPES', async () => {
    const rows = await h.asOwner((s) => s.q<{ v: string }>(`select unnest(enum_range(null::public.question_type))::text as v`));
    expect(rows.map((r) => r.v)).toEqual([...DB_QUESTION_TYPES]);
  });

  it('the app syncs every question type, and the database (0001 plus 0003) holds exactly those', async () => {
    expect([...DB_QUESTION_TYPES].sort()).toEqual([...QUESTION_TYPES].sort());
    const r = await h.asOwner((s) => s.q<{ v: string }>('select unnest(enum_range(null::public.question_type))::text as v'));
    expect(r.map((x) => x.v).sort()).toEqual([...QUESTION_TYPES].sort());
  });

  it('lesson_state, lesson_step and grade match the app', async () => {
    const enumOf = (t: string) => h.asOwner((s) => s.q<{ v: string }>(`select unnest(enum_range(null::public.${t}))::text as v`)).then((r) => r.map((x) => x.v));
    expect(await enumOf('lesson_state')).toEqual(['not-started', 'in-progress', 'complete', 'mastered']);
    expect(await enumOf('lesson_step')).toEqual(['hook', 'explore', 'name', 'practice', 'challenge', 'recap']);
    expect(await enumOf('grade')).toEqual(['start', '1', '2', '3', '4', '5', '6', '7', '8']);
  });
});

describe('as the signed-in user, the statements the routes make succeed', () => {
  it('merge_guest_progress for lessons, then reading them back', async () => {
    const c = userClient(h, a);
    const r = await c.rpc('merge_guest_progress', { payload: { lessons: [{ lessonId: 'g1-rhythm-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.8 }], attempts: [] } });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ lessons_merged: 1, lessons_skipped: 0 });
    const read = await c.from('lesson_progress').select('lesson_id, state, best_score');
    expect(read.data).toEqual([{ lesson_id: 'g1-rhythm-01', state: 'complete', best_score: 0.8 }]);
  });

  it('attempt upsert with ignoreDuplicates, with the returned rows being only the new ones', async () => {
    const c = userClient(h, a);
    const first = await c.from('attempts').upsert([attemptRow(a, 1), attemptRow(a, 2)], { onConflict: KEY, ignoreDuplicates: true }).select('id');
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(2);
    const second = await c.from('attempts').upsert([attemptRow(a, 2), attemptRow(a, 3)], { onConflict: KEY, ignoreDuplicates: true }).select('id');
    expect(second.data).toHaveLength(1);
    expect(await countAs(a, 'attempts')).toBe(3);
  });

  it('game score and mock result inserts, and the reads the route uses', async () => {
    const c = userClient(h, a);
    expect((await c.from('game_scores').insert({ user_id: a, game_id: 'key-hunt-grade-1-colon-sig-to-key-colon-timed', score: 310, summary: {} })).error).toBeNull();
    expect((await c.from('mock_results').insert({ user_id: a, grade: '1', score: 0.7, breakdown: { 'rhythm.note.value': 0.5 } })).error).toBeNull();
    const best = await c.from('game_scores').select('score').eq('game_id', 'key-hunt-grade-1-colon-sig-to-key-colon-timed').order('score', { ascending: false }).limit(1);
    expect(best.data).toEqual([{ score: 310 }]);
    const mocks = await c.from('mock_results').select('grade, score, created_at').order('created_at', { ascending: false }).limit(200);
    expect(mocks.data).toHaveLength(1);
  });

  it('refuses game ids and mock breakdowns the checks do not allow', async () => {
    const c = userClient(h, a);
    expect((await c.from('game_scores').insert({ user_id: a, game_id: 'Bad Id', score: 1, summary: {} })).error).not.toBeNull();
    expect((await c.from('game_scores').insert({ user_id: a, game_id: 'note-rush', score: -1, summary: {} })).error).not.toBeNull();
    expect((await c.from('mock_results').insert({ user_id: a, grade: '1', score: 0.5, breakdown: { 'Bad Key': 0.5 } })).error).not.toBeNull();
  });
});

describe('one learner cannot read or write another learner\'s rows', () => {
  beforeAll(async () => {
    const cb = userClient(h, b);
    await cb.rpc('merge_guest_progress', { payload: { lessons: [{ lessonId: 'g1-pitch-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1 }], attempts: [] } });
    await cb.from('attempts').upsert([attemptRow(b, 1)], { onConflict: KEY, ignoreDuplicates: true });
    await cb.from('game_scores').insert({ user_id: b, game_id: 'note-rush', score: 999, summary: {} });
    await cb.from('mock_results').insert({ user_id: b, grade: '2', score: 0.9, breakdown: {} });
  });

  it('A sees none of B\'s rows in any table', async () => {
    const ca = userClient(h, a);
    expect((await ca.from('lesson_progress').select('lesson_id')).data).toEqual([{ lesson_id: 'g1-rhythm-01' }]);
    expect(await countAs(a, 'attempts')).toBe(3);
    expect((await ca.from('game_scores').select('game_id')).data).not.toContainEqual({ game_id: 'note-rush' });
    expect((await ca.from('mock_results').select('grade')).data).toEqual([{ grade: '1' }]);
  });

  it('A cannot write rows as B (the policies refuse a user_id that is not theirs)', async () => {
    const ca = userClient(h, a);
    expect((await ca.from('attempts').upsert([attemptRow(b, 50)], { onConflict: KEY, ignoreDuplicates: true }).select('id')).error).not.toBeNull();
    expect((await ca.from('game_scores').insert({ user_id: b, game_id: 'tap-it-60', score: 5, summary: {} })).error).not.toBeNull();
    expect((await ca.from('mock_results').insert({ user_id: b, grade: '1', score: 0.1, breakdown: {} })).error).not.toBeNull();
    expect(await countAs(b, 'attempts')).toBe(1);
  });

  it('merge_guest_progress always writes to the caller, whatever the payload says', async () => {
    const ca = userClient(h, a);
    const r = await ca.rpc('merge_guest_progress', {
      payload: { lessons: [{ lessonId: 'g1-pitch-01', userId: b, user_id: b, state: 'mastered', step: 'recap', questionIndex: 0, bestScore: 0.1 }], attempts: [] },
    });
    expect(r.error).toBeNull();
    const bRows = await h.asUser(b, (s) => s.q<{ state: string; best_score: number }>(`select state, best_score from public.lesson_progress where lesson_id = 'g1-pitch-01'`));
    expect(bRows).toEqual([{ state: 'complete', best_score: 1 }]);
  });

  it('a signed-out request reads nothing and cannot call merge', async () => {
    expect(await h.asAnon((s) => s.q(`select 1 from public.lesson_progress limit 1`).then(() => 'read', () => 'denied'))).toBe('denied');
    const err = await h.asAnon((s) => s.fails(`select public.merge_guest_progress('{}'::jsonb)`));
    expect(err.message).toMatch(/permission denied/i);
  });

  it('the user cannot set server-owned columns (merged, id, created_at, updated_at)', async () => {
    const ca = userClient(h, a);
    expect((await ca.from('attempts').upsert([{ ...attemptRow(a, 90), merged: true }], { onConflict: KEY, ignoreDuplicates: true }).select('id')).error).not.toBeNull();
    expect((await ca.from('lesson_progress').insert({ user_id: a, lesson_id: 'g1-x-01', state: 'in-progress', step: 'hook', question_index: 0, best_score: null, updated_at: '2001-01-01T00:00:00Z' })).error).not.toBeNull();
  });
});
