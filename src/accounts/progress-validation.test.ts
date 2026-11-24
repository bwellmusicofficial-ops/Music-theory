// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- test helper reads untyped JSON */
/** P1-17 finding 2 and 6: ids are checked against the real lists, requests are limited per learner, payloads are capped. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listLessons } from '@/content/load';
import { GAMES } from '@/components/site/games';
import { MemoryAccountBackend } from './backend/memory';
import { handleSignUp, type LoadDeps } from './handlers';
import { isKnownGameId, knownLessonIds } from './known-ids.server';
import { handleProgressMerge, handleProgressSync } from './progress-handlers';
import { TestJar } from './test-support/jar';
import { MERGE_REQUESTS_PER_HOUR, SYNC_REQUESTS_PER_HOUR } from './throttle';

// The real lists, not the permissive stand-in the other tests use (src/test/setup.ts).
vi.unmock('@/accounts/known-ids.server');

let backend: MemoryAccountBackend;
beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
  backend = new MemoryAccountBackend();
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
});

const BASE = 'http://localhost:3000/api/account/progress';
const post = (path: string, body: unknown, headers: Record<string, string> = {}, raw?: string) =>
  new Request(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw ?? JSON.stringify(body) });
const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });

async function learner(codeName: string) {
  const jar = new TestJar();
  const load: LoadDeps = async () => ({ backend, jar });
  const r = await handleSignUp(
    new Request('http://localhost:3000/api/account/sign-up', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ codeName, password: 'purple elephants', ageBand: 'under_18' }),
    }),
    load,
  );
  expect(r.status).toBe(200);
  return { jar, load };
}

const REAL = listLessons()[0]!.id;
const lesson = (lessonId: string) => ({ lessonId, state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: 0.5 });
const attempt = (lessonId: string, i: number) => ({
  lessonId, step: 'practice', questionId: `q-${i}`, skill: 'rhythm.note.value', type: 'multiple-choice',
  correct: true, score: 1, msTaken: 1000, at: new Date(Date.now() - 60_000 + i).toISOString(),
});

describe('the real lists', () => {
  it('knows every lesson in content/ and every registered game, and nothing made up', () => {
    const ids = knownLessonIds();
    expect(ids.size).toBe(listLessons().length);
    expect(ids.has(REAL)).toBe(true);
    expect(ids.has('made-up-lesson')).toBe(false);
    for (const g of GAMES) {
      expect(isKnownGameId(g.id)).toBe(true);
      expect(isKnownGameId(`${g.id}-grade-1-colon-sig-to-key-colon-timed`)).toBe(true);
    }
    expect(isKnownGameId('made-up-game')).toBe(false);
    expect(isKnownGameId('note-rushing')).toBe(false);
  });
});

describe('sync keeps only real lesson ids and game ids', () => {
  it('counts unknown ones as skipped and stores none of them', async () => {
    const { load, jar } = await learner('Validator1');
    const r = await read(await handleProgressSync(post('/sync', {
      lessons: [lesson(REAL), lesson('made-up-lesson')],
      attempts: [attempt(REAL, 1), attempt('made-up-lesson', 2)],
      games: [{ gameId: 'note-rush', score: 10 }, { gameId: 'made-up-game', score: 10 }],
    }), load));
    expect(r.body.skipped).toEqual({ lessons: 1, attempts: 1, games: 1, mocks: 0 });
    const snap = await (await backend.progress(jar))!.snapshot();
    expect(snap.lessons.map((l) => l.lessonId)).toEqual([REAL]);
    expect(snap.attempts).toHaveLength(1);
    expect(Object.keys(snap.games)).toEqual(['note-rush']);
  });
});

describe('merge keeps only real lesson ids', () => {
  it('skips unknown lessons and attempts', async () => {
    const { load } = await learner('Validator2');
    const r = await read(await handleProgressMerge(post('/merge', {
      lessons: [lesson(REAL), lesson('made-up-lesson')], attempts: [attempt(REAL, 1), attempt('made-up-lesson', 2)],
    }), load));
    expect(r.body).toMatchObject({ lessons_merged: 1, lessons_skipped: 1, attempts_inserted: 1, attempts_skipped: 1 });
  });
});

describe('finding 2 and 6: requests are limited per learner, whatever they carry', () => {
  it(`sync: request number ${SYNC_REQUESTS_PER_HOUR + 1} in an hour gets 429 with a wait`, async () => {
    const { load } = await learner('Limited1');
    // Empty, duplicate and invalid requests all count.
    for (let i = 0; i < SYNC_REQUESTS_PER_HOUR; i++) {
      const r = await handleProgressSync(post('/sync', i % 3 === 0 ? {} : { lessons: [lesson('made-up-lesson')] }), load);
      if (r.status !== 200) throw new Error(`request ${i} got ${r.status}`);
    }
    const over = await read(await handleProgressSync(post('/sync', { lessons: [lesson(REAL)] }), load));
    expect(over.status).toBe(429);
    expect(over.body.retryAfterSeconds).toBeGreaterThan(0);
  }, 120_000);

  it('a request that is not valid JSON, or is refused for size, still counts', async () => {
    const { load } = await learner('Limited2');
    for (let i = 0; i < MERGE_REQUESTS_PER_HOUR; i++) {
      const r = await handleProgressMerge(post('/merge', null, {}, i % 2 ? '{broken' : JSON.stringify({ pad: 'x'.repeat(3 * 1024 * 1024) })), load);
      expect([400, 413]).toContain(r.status);
    }
    expect((await handleProgressMerge(post('/merge', { lessons: [lesson(REAL)], attempts: [] }), load)).status).toBe(429);
  });

  it(`merge: ${MERGE_REQUESTS_PER_HOUR} an hour, duplicates included`, async () => {
    const { load } = await learner('Limited3');
    const same = { lessons: [lesson(REAL)], attempts: [attempt(REAL, 1)] };
    for (let i = 0; i < MERGE_REQUESTS_PER_HOUR; i++) expect((await handleProgressMerge(post('/merge', same), load)).status).toBe(200);
    expect((await handleProgressMerge(post('/merge', same), load)).status).toBe(429);
  });

  it('the limit is per learner: another learner is not affected', async () => {
    const a = await learner('Limited4');
    const b = await learner('Limited5');
    for (let i = 0; i < MERGE_REQUESTS_PER_HOUR; i++) await handleProgressMerge(post('/merge', {}), a.load);
    expect((await handleProgressMerge(post('/merge', {}), a.load)).status).toBe(429);
    expect((await handleProgressMerge(post('/merge', {}), b.load)).status).toBe(200);
  });

  it('an unsigned request is refused before it is counted or read', async () => {
    const load: LoadDeps = async () => ({ backend, jar: new TestJar() });
    expect((await handleProgressSync(post('/sync', {}), load)).status).toBe(401);
  });
});

describe('finding 2: the merge payload is capped', () => {
  it('refuses a body over 2 MiB, and one that declares a much larger size, before reading it', async () => {
    const { load } = await learner('Capped1');
    expect((await handleProgressMerge(post('/merge', null, {}, JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024 + 5) })), load)).status).toBe(413);
    const declared = new Request(`${BASE}/merge`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(50 * 1024 * 1024) }, body: '{}' });
    expect((await handleProgressMerge(declared, load)).status).toBe(413);
  });

  it('accepts the biggest honest merge: 5000 attempts and 500 lessons fit under the cap', async () => {
    const lessons = Array.from({ length: 500 }, (_, i) => lesson(`lesson-number-${i}-with-a-long-enough-id-to-be-realistic`));
    const attempts = Array.from({ length: 5000 }, (_, i) => ({ ...attempt(REAL, i), questionId: `question-number-${i}-in-a-long-lesson`, skill: 'rhythm.note.value.beaming' }));
    expect(JSON.stringify({ lessons, attempts }).length).toBeLessThan(2 * 1024 * 1024);
  });
});
