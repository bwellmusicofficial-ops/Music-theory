// @vitest-environment node
/**
 * One set of scenarios for BOTH progress stores. The Supabase store runs the real SQL of migration 0001 in
 * PGlite as the signed-in user (row level security, column grants, triggers, merge_guest_progress), with
 * Supabase Auth and PostgREST imitated by test-support. That is as close as can be proved without the real
 * project.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '@/db/test-harness';
import type { AttemptWire, LessonWire } from '@/sync/wire';
import { MemoryAccountBackend } from '../backend/memory';
import { SupabaseAccountBackend } from '../backend/supabase';
import type { AccountBackend } from '../backend/types';
import { createFakeSupabase } from '../test-support/fake-supabase';
import { TestJar } from '../test-support/jar';
import { RateLimitedError, type ProgressStore } from './types';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ seed: true, throttle: true });
}, 60_000);
afterAll(async () => {
  await h.close();
});

const makers: Record<string, () => AccountBackend> = {
  memory: () => new MemoryAccountBackend(),
  supabase: () => {
    const fake = createFakeSupabase(h);
    return new SupabaseAccountBackend({ admin: fake.admin, sessionClient: fake.sessionClient });
  },
};

let n = 0;
const name = (stem: string) => `${stem}${++n}x${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);

async function signedIn(b: AccountBackend): Promise<{ store: ProgressStore; jar: TestJar }> {
  const jar = new TestJar();
  const r = await b.signUp({ codeName: name('Prog'), password: 'correct horse', ageBand: 'under_18' }, jar);
  expect(r.ok).toBe(true);
  const store = await b.progress(jar);
  expect(store).not.toBeNull();
  return { store: store!, jar };
}

const lesson = (over: Partial<LessonWire> = {}): LessonWire => ({
  lessonId: 'g1-rhythm-01', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: null, ...over,
});
const at = (s: number) => new Date(Date.UTC(2026, 5, 1, 10, 0, s)).toISOString();
const attempt = (i: number, over: Partial<AttemptWire> = {}): AttemptWire => ({
  lessonId: 'g1-rhythm-01', step: 'practice', questionId: `q-${i}`, skill: 'rhythm.note.value', type: 'multiple-choice',
  correct: i % 2 === 0, score: i % 2 === 0 ? 1 : 0, msTaken: 1500, at: at(i), ...over,
});

describe.each(Object.keys(makers))('%s progress store', (kind) => {
  const make = () => makers[kind]!();

  it('is null with no session, and null again after sign-out', async () => {
    const b = make();
    expect(await b.progress(new TestJar())).toBeNull();
    const { jar } = await signedIn(b);
    await b.signOut(jar);
    expect(await b.progress(jar)).toBeNull();
  });

  it('starts empty', async () => {
    const { store } = await signedIn(make());
    expect(await store.snapshot()).toEqual({ lessons: [], attempts: [], games: {}, mocks: [] });
  });

  it('saves a lesson and reads it back', async () => {
    const { store } = await signedIn(make());
    expect(await store.saveLessons([lesson({ bestScore: 0.5 })])).toEqual({ skipped: 0 });
    const snap = await store.snapshot();
    expect(snap.lessons).toHaveLength(1);
    expect(snap.lessons[0]).toMatchObject({ lessonId: 'g1-rhythm-01', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: 0.5 });
    expect(Date.parse(snap.lessons[0]!.updatedAt)).not.toBeNaN();
  });

  it('never lowers a best score, never un-completes a lesson, never moves the position back', async () => {
    const { store } = await signedIn(make());
    await store.saveLessons([lesson({ state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9 })]);
    await store.saveLessons([lesson({ state: 'in-progress', step: 'hook', questionIndex: 0, bestScore: 0.4 })]);
    const l = (await store.snapshot()).lessons[0]!;
    expect(l).toMatchObject({ state: 'complete', step: 'recap', bestScore: 0.9 });
    await store.saveLessons([lesson({ state: 'complete', step: 'recap', bestScore: 0.95 })]);
    expect((await store.snapshot()).lessons[0]!.bestScore).toBe(0.95);
  });

  it('replaying the same lesson save is harmless', async () => {
    const { store } = await signedIn(make());
    for (let i = 0; i < 3; i++) await store.saveLessons([lesson({ bestScore: 0.7 })]);
    const snap = await store.snapshot();
    expect(snap.lessons).toHaveLength(1);
    expect(snap.lessons[0]!.bestScore).toBe(0.7);
  });

  it('stores attempts once however often they are sent, and reads them back newest first', async () => {
    const { store } = await signedIn(make());
    const batch = [attempt(1), attempt(2, { seed: 4242 }), attempt(3)];
    expect(await store.recordAttempts(batch)).toEqual({ inserted: 3 });
    expect(await store.recordAttempts(batch)).toEqual({ inserted: 0 });
    expect(await store.recordAttempts([attempt(3), attempt(4)])).toEqual({ inserted: 1 });
    const { attempts } = await store.snapshot();
    expect(attempts.map((a) => a.questionId)).toEqual(['q-4', 'q-3', 'q-2', 'q-1']);
    expect(attempts.find((a) => a.questionId === 'q-2')).toMatchObject({ seed: 4242, correct: true, msTaken: 1500, at: at(2) });
    expect(attempts.find((a) => a.questionId === 'q-1')).not.toHaveProperty('seed');
  });

  it('keeps a game best only when beaten', async () => {
    const { store } = await signedIn(make());
    expect(await store.saveGameBests([{ gameId: 'note-rush', score: 120 }])).toEqual({ saved: 1 });
    expect(await store.saveGameBests([{ gameId: 'note-rush', score: 120 }])).toEqual({ saved: 0 });
    expect(await store.saveGameBests([{ gameId: 'note-rush', score: 90 }])).toEqual({ saved: 0 });
    expect(await store.saveGameBests([{ gameId: 'note-rush', score: 150 }, { gameId: 'tap-it-60', score: 40 }])).toEqual({ saved: 2 });
    expect((await store.snapshot()).games).toEqual({ 'note-rush': 150, 'tap-it-60': 40 });
  });

  it('stores a mock result once per identical result', async () => {
    const { store } = await signedIn(make());
    const m = { grade: '1' as const, score: 0.75, breakdown: { 'rhythm.note.value': 1, 'pitch.treble.lines': 0.5 } };
    expect(await store.saveMockResults([m])).toEqual({ saved: 1 });
    expect(await store.saveMockResults([{ ...m, breakdown: { 'pitch.treble.lines': 0.5, 'rhythm.note.value': 1 } }])).toEqual({ saved: 0 });
    expect(await store.saveMockResults([{ ...m, score: 0.8 }])).toEqual({ saved: 1 });
    const { mocks } = await store.snapshot();
    expect(mocks.map((x) => x.score).sort()).toEqual([0.75, 0.8]);
    expect(mocks[0]).toMatchObject({ grade: '1' });
  });

  it("merges a device's guest progress, and a second merge of the same thing adds nothing", async () => {
    const { store } = await signedIn(make());
    await store.saveLessons([lesson({ state: 'complete', step: 'recap', bestScore: 0.6 })]);
    const guest = {
      lessons: [lesson({ state: 'in-progress', step: 'hook', bestScore: 0.9 }), lesson({ lessonId: 'g1-pitch-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.8 })],
      attempts: [attempt(1), attempt(2)],
    };
    const first = await store.mergeGuest(guest);
    expect(first).toMatchObject({ lessons_merged: 2, lessons_skipped: 0, attempts_inserted: 2, attempts_duplicate: 0 });
    const again = await store.mergeGuest(guest);
    expect(again).toMatchObject({ attempts_inserted: 0, attempts_duplicate: 2 });
    const snap = await store.snapshot();
    const byId = Object.fromEntries(snap.lessons.map((l) => [l.lessonId, l]));
    expect(byId['g1-rhythm-01']).toMatchObject({ state: 'complete', bestScore: 0.9 });
    expect(byId['g1-pitch-01']).toMatchObject({ state: 'complete', bestScore: 0.8 });
    expect(snap.attempts).toHaveLength(2);
  });

  it('keeps one learner out of another learner\'s progress', async () => {
    const b = make();
    const a = await signedIn(b);
    const c = await signedIn(b);
    await a.store.saveLessons([lesson({ bestScore: 0.5 })]);
    await a.store.recordAttempts([attempt(1)]);
    await a.store.saveGameBests([{ gameId: 'note-rush', score: 77 }]);
    await a.store.saveMockResults([{ grade: '1', score: 0.5, breakdown: {} }]);
    expect(await c.store.snapshot()).toEqual({ lessons: [], attempts: [], games: {}, mocks: [] });
    // C's writes do not touch A's rows either.
    await c.store.saveLessons([lesson({ state: 'complete', step: 'recap', bestScore: 1 })]);
    expect((await a.store.snapshot()).lessons[0]).toMatchObject({ state: 'in-progress', bestScore: 0.5 });
  });
});

describe('supabase progress store: the database cap', () => {
  it('turns the per-minute attempts cap into a retryable error and loses nothing already stored', async () => {
    const b = makers.supabase!();
    const { store } = await signedIn(b);
    const many = Array.from({ length: 250 }, (_, i) => attempt(i, { questionId: `q-${i}`, at: at(i % 50) }));
    // Distinct keys: question ids differ.
    await expect(store.recordAttempts(many)).rejects.toBeInstanceOf(RateLimitedError);
    // The statement is all or nothing, so a later retry of the same batch in smaller pieces is fine.
    expect((await store.snapshot()).attempts).toHaveLength(0);
    expect(await store.recordAttempts(many.slice(0, 200))).toEqual({ inserted: 200 });
    await expect(store.recordAttempts(many.slice(200))).rejects.toBeInstanceOf(RateLimitedError);
  });
});
