// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryAccountBackend } from './backend/memory';
import { handleSignOut, handleSignUp, type LoadDeps } from './handlers';
import { handleProgressGet, handleProgressMerge, handleProgressSync } from './progress-handlers';
import { RateLimitedError, type ProgressStore } from './progress/types';
import { TestJar } from './test-support/jar';

let backend: MemoryAccountBackend;
const original = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
  backend = new MemoryAccountBackend();
});
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
  else process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = original;
});

const loadFor = (jar: TestJar): LoadDeps => async () => ({ backend, jar });
const BASE = 'http://localhost:3000/api/account/progress';
const post = (path: string, body: unknown, headers: Record<string, string> = {}, raw?: string) =>
  new Request(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw ?? JSON.stringify(body) });
const get = () => new Request(BASE);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });

async function learner(codeName: string) {
  const jar = new TestJar();
  const r = await handleSignUp(
    new Request('http://localhost:3000/api/account/sign-up', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ codeName, password: 'purple elephants', ageBand: 'under_18' }),
    }),
    loadFor(jar),
  );
  expect(r.status).toBe(200);
  return { jar, load: loadFor(jar) };
}

const lesson = { lessonId: 'g1-rhythm-01', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: 0.5 };
const attempt = (i: number) => ({
  lessonId: 'g1-rhythm-01', step: 'practice', questionId: `q-${i}`, skill: 'rhythm.note.value', type: 'multiple-choice',
  correct: true, score: 1, msTaken: 1000, at: new Date(Date.now() - 60_000 + i).toISOString(),
});

describe('switch off: every progress route is a 404 and does nothing', () => {
  it.each([
    ['get', (l: LoadDeps) => handleProgressGet(get(), l)],
    ['sync', (l: LoadDeps) => handleProgressSync(post('/sync', {}), l)],
    ['merge', (l: LoadDeps) => handleProgressMerge(post('/merge', {}), l)],
  ])('%s', async (_n, call) => {
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    const boom: LoadDeps = async () => {
      throw new Error('must not be called');
    };
    const r = await call(boom);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('');
  });
});

describe('signing in is required', () => {
  it.each([
    ['get', (l: LoadDeps) => handleProgressGet(get(), l)],
    ['sync', (l: LoadDeps) => handleProgressSync(post('/sync', { lessons: [lesson] }), l)],
    ['merge', (l: LoadDeps) => handleProgressMerge(post('/merge', { lessons: [lesson], attempts: [] }), l)],
  ])('%s answers 401 with no session', async (_n, call) => {
    const r = await read(await call(loadFor(new TestJar())));
    expect(r).toEqual({ status: 401, body: { error: 'not-signed-in' } });
  });

  it('answers 401 again once signed out, and the body is not even read', async () => {
    const { jar, load } = await learner('SignedOutKid');
    await handleSignOut(new Request('http://localhost:3000/api/account/sign-out', { method: 'POST' }), load);
    expect((await read(await handleProgressSync(post('/sync', {}, {}, 'not json'), load))).status).toBe(401);
    expect(jar.getAll().find((c) => c.name.includes('session'))).toBeUndefined();
  });

  it('never reads a user id from the request: the cookie decides', async () => {
    const a = await learner('LearnerAlpha');
    const b = await learner('LearnerBravo');
    const sent = { userId: 'someone-else', user_id: 'someone-else', lessons: [lesson] };
    expect((await read(await handleProgressSync(post('/sync', sent), a.load))).status).toBe(200);
    expect((await read(await handleProgressGet(get(), a.load))).body.lessons).toHaveLength(1);
    expect((await read(await handleProgressGet(get(), b.load))).body.lessons).toEqual([]);
  });
});

describe('sync', () => {
  it('saves everything it is given and reads it back, and the same batch twice changes nothing', async () => {
    const { load } = await learner('SyncHappy');
    const batch = {
      lessons: [lesson], attempts: [attempt(1), attempt(2)], games: [{ gameId: 'note-rush', score: 40 }],
      mocks: [{ grade: '1', score: 0.7, breakdown: { 'rhythm.note.value': 0.5 } }],
    };
    for (let i = 0; i < 2; i++) {
      const r = await read(await handleProgressSync(post('/sync', batch), load));
      expect(r).toEqual({ status: 200, body: { ok: true, skipped: { lessons: 0, attempts: 0, games: 0, mocks: 0 } } });
    }
    const snap = (await read(await handleProgressGet(get(), load))).body;
    expect(snap.lessons).toHaveLength(1);
    expect(snap.attempts).toHaveLength(2);
    expect(snap.games).toEqual({ 'note-rush': 40 });
    expect(snap.mocks).toHaveLength(1);
  });

  it('answers with no-store', async () => {
    const { load } = await learner('SyncHeaders');
    expect((await handleProgressSync(post('/sync', {}), load)).headers.get('cache-control')).toBe('no-store');
    expect((await handleProgressGet(get(), load)).headers.get('cache-control')).toBe('no-store');
  });

  it('skips items that fail validation and keeps the rest', async () => {
    const { load } = await learner('SyncBadItems');
    const r = await read(
      await handleProgressSync(
        post('/sync', {
          lessons: [lesson, { ...lesson, lessonId: 'Not Kebab' }, { ...lesson, state: 'finished' }, { ...lesson, lessonId: 'g1-b', bestScore: 1.5 }],
          attempts: [attempt(1), { ...attempt(2), type: 'place-bar-lines' }, { ...attempt(3), at: '1999-01-01T00:00:00Z' }, { ...attempt(4), msTaken: -1 }, { ...attempt(5), skill: 'nodots' }],
          games: [{ gameId: 'note-rush', score: 5 }, { gameId: 'Bad Id', score: 5 }, { gameId: 'x', score: 2_000_000 }],
          mocks: [{ grade: '9', score: 0.5, breakdown: {} }, { grade: '1', score: 0.5, breakdown: { 'Bad Key': 1 } }],
        }),
        load,
      ),
    );
    expect(r.body.skipped).toEqual({ lessons: 3, attempts: 4, games: 2, mocks: 2 });
    const snap = (await read(await handleProgressGet(get(), load))).body;
    expect(snap.lessons).toHaveLength(1);
    expect(snap.attempts).toHaveLength(1);
    expect(snap.games).toEqual({ 'note-rush': 5 });
    expect(snap.mocks).toEqual([]);
  });

  it('refuses a malformed request: not JSON, not an object, a section that is not an array, too many items, too big', async () => {
    const { load } = await learner('SyncMalformed');
    expect((await handleProgressSync(post('/sync', null, {}, 'nope'), load)).status).toBe(400);
    expect((await handleProgressSync(post('/sync', [1]), load)).status).toBe(400);
    expect((await handleProgressSync(post('/sync', { lessons: 'x' }), load)).status).toBe(400);
    expect((await handleProgressSync(post('/sync', { attempts: Array.from({ length: 201 }, (_, i) => attempt(i)) }), load)).status).toBe(400);
    expect((await handleProgressSync(post('/sync', { x: 'y'.repeat(600 * 1024) }), load)).status).toBe(413);
    expect((await handleProgressSync(post('/sync', {}, { 'content-type': 'text/plain' }), load)).status).toBe(415);
  });

  it('refuses a cross-site post', async () => {
    const { load } = await learner('SyncCrossSite');
    expect((await handleProgressSync(post('/sync', {}, { origin: 'https://evil.example' }), load)).status).toBe(403);
    expect((await handleProgressMerge(post('/merge', {}, { origin: 'https://evil.example' }), load)).status).toBe(403);
    expect((await handleProgressSync(post('/sync', {}, { origin: 'http://localhost:3000' }), load)).status).toBe(200);
  });

  it('does not let a lower or older save undo progress', async () => {
    const { load } = await learner('SyncMonotonic');
    await handleProgressSync(post('/sync', { lessons: [{ ...lesson, state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9 }] }), load);
    await handleProgressSync(post('/sync', { lessons: [{ ...lesson, bestScore: 0.2 }] }), load);
    const l = (await read(await handleProgressGet(get(), load))).body.lessons[0];
    expect(l).toMatchObject({ state: 'complete', step: 'recap', bestScore: 0.9 });
  });

  it('answers 429 with the wait when the store says it is rate limited', async () => {
    const limited = { saveLessons: async () => ({ skipped: 0 }), saveGameBests: async () => ({ saved: 0 }), saveMockResults: async () => ({ saved: 0 }),
      recordAttempts: async () => { throw new RateLimitedError(60); } } as unknown as ProgressStore;
    const fake = { progress: async () => limited } as unknown as MemoryAccountBackend;
    const r = await handleProgressSync(post('/sync', { attempts: [attempt(1)] }), async () => ({ backend: fake, jar: new TestJar() }));
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(await r.json()).toEqual({ error: 'rate-limited', retryAfterSeconds: 60 });
  });

  it('answers a fixed server-error and never echoes the cause', async () => {
    const broken = { progress: async () => { throw new Error('secret detail 12345'); } } as unknown as MemoryAccountBackend;
    const r = await read(await handleProgressGet(get(), async () => ({ backend: broken, jar: new TestJar() })));
    expect(r).toEqual({ status: 500, body: { error: 'server-error' } });
  });
});

describe('merge', () => {
  it('adds a device\'s guest progress, reports counts, and a repeat adds no attempts', async () => {
    const { load } = await learner('MergeHappy');
    const body = { lessons: [lesson], attempts: [attempt(1), attempt(2), attempt(3)] };
    const first = await read(await handleProgressMerge(post('/merge', body), load));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ lessons_merged: 1, attempts_inserted: 3, attempts_skipped: 0 });
    const again = await read(await handleProgressMerge(post('/merge', body), load));
    expect(again.body).toMatchObject({ attempts_inserted: 0, attempts_duplicate: 3 });
  });

  it('counts invalid items as skipped and refuses oversize requests', async () => {
    const { load } = await learner('MergeBad');
    const r = await read(await handleProgressMerge(post('/merge', { lessons: [lesson, { nope: 1 }], attempts: [{ nope: 1 }] }), load));
    expect(r.body).toMatchObject({ lessons_merged: 1, lessons_skipped: 1, attempts_skipped: 1 });
    expect((await handleProgressMerge(post('/merge', { lessons: Array.from({ length: 501 }, () => lesson) }), load)).status).toBe(400);
    expect((await handleProgressMerge(post('/merge', { lessons: 'x' }), load)).status).toBe(400);
  });

  it('only ever writes to the signed-in learner', async () => {
    const a = await learner('MergeOwnerA');
    const b = await learner('MergeOwnerB');
    await handleProgressMerge(post('/merge', { userId: 'x', lessons: [lesson], attempts: [attempt(1)] }), a.load);
    const bSnap = (await read(await handleProgressGet(get(), b.load))).body;
    expect(bSnap).toEqual({ lessons: [], attempts: [], games: {}, mocks: [] });
  });
});
