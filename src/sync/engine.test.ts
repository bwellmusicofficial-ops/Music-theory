// @vitest-environment node
/**
 * The whole path with no browser: the local sink, the engine (outbox, syncer, transport) and the REAL route
 * handlers over the memory backend, with each "device" having its own storage and cookies. What it cannot show is
 * real timers, real fetch or real Supabase: those are the e2e run and the owner's Preview test.
 */
import { describe, expect, it } from 'vitest';
import { PROGRESS_KEY } from '@/lesson/progress/local';
import { SETTINGS_KEY } from '@/settings/storage';
import { OUTBOX_KEY } from './outbox';
import { OWNER_KEY, STASH_KEY, hasProgress, readGameBests, readMocks } from './local-cache';
import { attemptEvent, createDevice, createServer, flush, learn, lessonProgress } from './test-support';

process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';

const done = lessonProgress({ state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9 });

async function remote(server: ReturnType<typeof createServer>, d: ReturnType<typeof createDevice>) {
  const store = await server.backend.progress(d.jar);
  return store!.snapshot();
}

describe('guest progress: offered, never merged silently', () => {
  it('a device with guest progress is offered it; nothing is sent until the answer is Add', async () => {
    const server = createServer();
    const d = createDevice(server);
    await d.sink.saveLessonProgress(done);
    await d.sink.recordAttempt(attemptEvent(1));
    const user = await d.signUp();
    d.engine.signedIn(user);
    await flush();
    expect(d.engine.getStatus()).toMatchObject({ phase: 'offered', active: false });
    expect(server.requests).toEqual([]);
    expect((await remote(server, d)).lessons).toEqual([]);
    // Learning while the offer is open stays guest progress: not queued, not sent.
    await learn(d, lessonProgress({ lessonId: 'g1-pitch-01' }));
    expect(d.engine._outbox.size()).toBe(0);
  });

  it('Add: merges lessons and attempts into the account, the device copy becomes the cache, and best scores follow', async () => {
    const server = createServer();
    const d = createDevice(server);
    await d.sink.saveLessonProgress(done);
    await d.sink.recordAttempt(attemptEvent(1));
    await d.sink.recordAttempt(attemptEvent(2));
    d.storage.setItem('mtn:v1:note-rush-best', '88');
    const user = await d.signUp();
    d.engine.signedIn(user);
    expect(await d.engine.addGuestProgress()).toBe(true);
    await flush();
    expect(d.engine.getStatus()).toMatchObject({ phase: 'idle', active: true, pending: 0, failing: false });
    const snap = await remote(server, d);
    expect(snap.lessons[0]).toMatchObject({ lessonId: 'g1-rhythm-01', state: 'complete', bestScore: 0.9 });
    expect(snap.attempts).toHaveLength(2);
    expect(snap.games).toEqual({ 'note-rush': 88 });
    // The device still shows it all.
    expect((await d.sink.loadAllLessonProgress())[0]).toMatchObject({ state: 'complete' });
    expect(d.storage.getItem(OWNER_KEY)).not.toBeNull();
  });

  it('Add that fails (offline) keeps the offer open with a plain message, and merges nothing', async () => {
    const server = createServer();
    const d = createDevice(server);
    await d.sink.saveLessonProgress(done);
    d.engine.signedIn(await d.signUp());
    server.state.down = true;
    expect(await d.engine.addGuestProgress()).toBe(false);
    expect(d.engine.getStatus()).toMatchObject({ phase: 'offered', error: expect.stringContaining('Check your connection') });
    expect(d.storage.getItem(OWNER_KEY)).toBeNull();
    server.state.down = false;
    expect(await d.engine.addGuestProgress()).toBe(true);
    expect((await remote(server, d)).lessons).toHaveLength(1);
  });

  it('Not now: guest progress is set aside, the account\'s progress is shown, and signing out gives the guest progress back', async () => {
    const server = createServer();
    // The account already has progress from another device.
    const other = createDevice(server);
    const user = await other.signUp();
    other.engine.signedIn(user);
    await learn(other, lessonProgress({ lessonId: 'g1-pitch-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1 }));
    await flush();

    const d = createDevice(server);
    await d.sink.saveLessonProgress(done);
    await d.signIn(user.codeName);
    d.engine.signedIn(user);
    d.engine.keepSeparate();
    await flush();
    const ids = (await d.sink.loadAllLessonProgress()).map((p) => p.lessonId);
    expect(ids).toEqual(['g1-pitch-01']); // the account's, not the guest's
    expect((await remote(server, d)).lessons.map((l) => l.lessonId)).toEqual(['g1-pitch-01']);
    expect(d.engine.getStatus().hasSetAside).toBe(true);

    await d.signOut();
    expect((await d.sink.loadAllLessonProgress()).map((p) => p.lessonId)).toEqual(['g1-rhythm-01']);
    expect(d.storage.getItem(STASH_KEY)).toBeNull();
    expect(d.storage.getItem(OWNER_KEY)).toBeNull();
  });

  it('progress set aside by Not now can be added later', async () => {
    const server = createServer();
    const d = createDevice(server);
    await d.sink.saveLessonProgress(done);
    d.engine.signedIn(await d.signUp());
    d.engine.keepSeparate();
    await flush();
    expect((await remote(server, d)).lessons).toEqual([]);
    expect(await d.engine.addSetAsideProgress()).toBe(true);
    await flush();
    expect((await remote(server, d)).lessons.map((l) => l.lessonId)).toEqual(['g1-rhythm-01']);
    expect((await d.sink.loadAllLessonProgress()).map((p) => p.lessonId)).toEqual(['g1-rhythm-01']);
    expect(d.engine.getStatus().hasSetAside).toBe(false);
  });

  it('a device with nothing on it is not asked anything', async () => {
    const server = createServer();
    const d = createDevice(server);
    d.engine.signedIn(await d.signUp());
    expect(d.engine.getStatus()).toMatchObject({ phase: 'idle', active: true });
  });
});

describe('saving while signed in', () => {
  it('writes go to the device at once and reach the account, and a second device sees them', async () => {
    const server = createServer();
    const a = createDevice(server);
    const user = await a.signUp();
    a.engine.signedIn(user);
    await learn(a, done, [attemptEvent(1), attemptEvent(2)]);
    expect((await a.sink.loadLessonProgress('g1-rhythm-01'))?.state).toBe('complete'); // before any network
    await flush();
    expect(a.engine.getStatus()).toMatchObject({ pending: 0, failing: false });

    const b = createDevice(server);
    await b.signIn(user.codeName);
    b.engine.signedIn(user);
    await flush();
    expect(await b.sink.loadAllLessonProgress()).toEqual([expect.objectContaining({ lessonId: 'g1-rhythm-01', state: 'complete', bestScore: 0.9 })]);
    expect(await b.sink.loadAttempts()).toHaveLength(2);
    expect(b.changes.count).toBeGreaterThan(0); // screens were told to re-read
  });

  it('offline: nothing is lost, the status says it is waiting, and it all arrives once back online', async () => {
    const server = createServer();
    const d = createDevice(server);
    const user = await d.signUp();
    d.engine.signedIn(user);
    await flush();
    server.state.down = true;
    await learn(d, done, [attemptEvent(1)]);
    await flush();
    expect(d.engine.getStatus()).toMatchObject({ pending: 2, failing: true });
    expect((await d.sink.loadLessonProgress('g1-rhythm-01'))?.state).toBe('complete');
    server.state.down = false;
    d.engine.online();
    await flush();
    expect(d.engine.getStatus()).toMatchObject({ pending: 0, failing: false });
    const snap = await remote(server, d);
    expect(snap.lessons).toHaveLength(1);
    expect(snap.attempts).toHaveLength(1);
  });

  it('a refresh while offline loses nothing: the outbox is still in storage and a new engine sends it', async () => {
    const server = createServer();
    const d = createDevice(server);
    const user = await d.signUp();
    d.engine.signedIn(user);
    server.state.down = true;
    await learn(d, done, [attemptEvent(1), attemptEvent(2)]);
    await flush();
    expect(d.storage.getItem(OUTBOX_KEY)).not.toBeNull();

    // "Reload": a brand new engine over the same storage and cookies.
    server.state.down = false;
    const reloaded = createDevice(server, { storage: d.storage, jar: d.jar });
    expect(reloaded.engine.getStatus().pending).toBe(3);
    reloaded.engine.signedIn(user);
    await flush();
    expect(reloaded.engine.getStatus()).toMatchObject({ pending: 0, active: true });
    expect((await remote(server, d)).attempts).toHaveLength(2);
  });

  it('a send answered 503 is retried and, when the first try had actually landed, the replay changes nothing', async () => {
    const server = createServer();
    const d = createDevice(server);
    d.engine.signedIn(await d.signUp());
    await flush();
    await learn(d, done, [attemptEvent(1)]);
    await flush();
    // Pretend the answer was lost after the server saved: put the same entries back and send again.
    const before = await remote(server, d);
    d.engine.enqueueLesson(done);
    d.engine.enqueueAttempt(attemptEvent(1));
    await flush();
    expect(await remote(server, d)).toEqual({ ...before, lessons: [expect.objectContaining({ lessonId: 'g1-rhythm-01', state: 'complete', bestScore: 0.9 })] });
    expect((await remote(server, d)).attempts).toHaveLength(1);
  });

  it('a guest (no account on the device) queues nothing and sends nothing', async () => {
    const server = createServer();
    const d = createDevice(server);
    await learn(d, done, [attemptEvent(1)]);
    await flush();
    expect(d.engine._outbox.size()).toBe(0);
    expect(server.requests).toEqual([]);
    expect(d.storage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it('saves attempts at the four question types added by migration 0003', async () => {
    const server = createServer();
    const d = createDevice(server);
    d.engine.signedIn(await d.signUp());
    const types = ['place-bar-lines', 'fix-beaming', 'write-key-signature', 'find-in-passage'] as const;
    types.forEach((type, i) => d.engine.enqueueAttempt(attemptEvent(i + 1, { type })));
    await flush();
    expect((await remote(server, d)).attempts.map((a) => a.questionId).sort()).toEqual(['q-1', 'q-2', 'q-3', 'q-4']);
  });

  it('syncs game bests and mock results, and a second device gets them under the keys the games read', async () => {
    const server = createServer();
    const a = createDevice(server);
    const user = await a.signUp();
    a.engine.signedIn(user);
    a.engine.enqueueGameBest('key-hunt', 'grade-1:sig-to-key:timed', 310);
    a.engine.enqueueGameBest('note-rush', null, 120);
    a.engine.enqueueGameBest('tap-it', '60', 45);
    a.engine.enqueueMock({
      configId: 'grade-1', at: new Date().toISOString(), seed: 7, score: 0.8, correct: 16, total: 20, band: 'merit', timedOut: false, elapsedMs: 1000,
      sections: [], skills: [{ skill: 'rhythm.note.value', correct: 3, total: 4 }, { skill: 'pitch.treble.lines', correct: 0, total: 0 }],
    });
    await flush();

    const b = createDevice(server);
    await b.signIn(user.codeName);
    b.engine.signedIn(user);
    await flush();
    expect(JSON.parse(b.storage.getItem('mtn:v1:key-hunt-best')!)).toEqual({ 'grade-1:sig-to-key:timed': 310 });
    expect(b.storage.getItem('mtn:v1:note-rush-best')).toBe('120');
    expect(JSON.parse(b.storage.getItem('mtn:v1:tap-it-best')!)).toEqual({ '60': 45 });
    const mocks = readMocks(b.storage);
    expect(mocks).toHaveLength(1);
    expect(mocks[0]).toMatchObject({ configId: 'grade-1', score: 0.8, band: 'merit', total: 0 });
  });
});

describe('reading: the account merged with what is on the device', () => {
  it('newer wins per lesson, and a best score or a completed state is never lowered', async () => {
    const server = createServer();
    const a = createDevice(server);
    const user = await a.signUp();
    a.engine.signedIn(user);
    await learn(a, lessonProgress({ state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9, updatedAt: '2026-06-01T10:00:00.000Z' }));
    await flush();

    // A second device made lower, later progress while it was not signed in to this account's cache.
    const b = createDevice(server);
    await b.signIn(user.codeName);
    b.engine.signedIn(user);
    await flush();
    await b.sink.saveLessonProgress(lessonProgress({ state: 'in-progress', step: 'hook', questionIndex: 0, bestScore: 0.4, updatedAt: new Date(Date.now() + 60_000).toISOString() }));
    await b.engine.pull();
    const local = (await b.sink.loadLessonProgress('g1-rhythm-01'))!;
    expect(local.state).toBe('complete');
    expect(local.bestScore).toBe(0.9);
    expect(local.step).toBe('hook'); // newer position
    // And the account was not moved backwards by it.
    expect((await remote(server, b)).lessons[0]).toMatchObject({ state: 'complete', bestScore: 0.9 });
  });

  it('a lesson with a save still waiting keeps its own position when the account answers with an older one', async () => {
    const server = createServer();
    const d = createDevice(server);
    d.engine.signedIn(await d.signUp());
    await learn(d, lessonProgress({ step: 'hook', questionIndex: 0 }));
    await flush();
    server.state.down = true;
    await learn(d, lessonProgress({ step: 'name', questionIndex: 1, updatedAt: new Date(Date.now() - 1000).toISOString() }));
    server.state.down = false;
    // The account answers (its copy is stamped with the server's later clock) before the second save is sent.
    const store = await server.backend.progress(d.jar);
    const snapshot = await store!.snapshot();
    expect(snapshot.lessons[0]).toMatchObject({ step: 'hook' });
    const { applySnapshot } = await import('./local-cache');
    applySnapshot(d.storage, snapshot, new Set(['g1-rhythm-01']));
    expect((await d.sink.loadLessonProgress('g1-rhythm-01'))?.step).toBe('name');
    applySnapshot(d.storage, snapshot, new Set());
    expect((await d.sink.loadLessonProgress('g1-rhythm-01'))?.step).toBe('hook'); // with nothing waiting, the newer stamp wins
  });

  it('progress made on the device before the account was known is sent after the next look', async () => {
    const server = createServer();
    const a = createDevice(server);
    const user = await a.signUp();
    a.engine.signedIn(user);
    await flush();
    // Saved locally but never queued (as if the page had not finished starting up).
    await a.sink.saveLessonProgress(done);
    a.storage.setItem('mtn:v1:note-rush-best', '50');
    await a.engine.pull();
    await flush();
    const snap = await remote(server, a);
    expect(snap.lessons).toHaveLength(1);
    expect(snap.games).toEqual({ 'note-rush': 50 });
  });

  it('a pull while offline changes nothing and does not throw', async () => {
    const server = createServer();
    const d = createDevice(server);
    d.engine.signedIn(await d.signUp());
    await flush();
    server.state.down = true;
    await expect(d.engine.pull()).resolves.toBeUndefined();
  });
});

describe('signing out on a shared computer', () => {
  it('removes the account\'s progress from the device, keeps settings, and the next person starts clean', async () => {
    const server = createServer();
    const d = createDevice(server);
    d.storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'light' }));
    const user = await d.signUp();
    d.engine.signedIn(user);
    await learn(d, done, [attemptEvent(1)]);
    d.engine.enqueueGameBest('note-rush', null, 70);
    await flush();
    expect(hasProgress(d.storage)).toBe(true);

    expect(await d.engine.prepareSignOut()).toBe(0);
    await d.signOut();
    expect(hasProgress(d.storage)).toBe(false);
    expect(d.storage.getItem(PROGRESS_KEY)).toBeNull();
    expect(d.storage.getItem(OUTBOX_KEY)).toBeNull();
    expect(d.storage.getItem(OWNER_KEY)).toBeNull();
    expect(d.storage.getItem(SETTINGS_KEY)).toBe(JSON.stringify({ theme: 'light' }));
    expect(readGameBests(d.storage)).toEqual({});

    // Signing back in brings it back from the account.
    await d.signIn(user.codeName);
    d.engine.signedIn(user);
    await flush();
    expect((await d.sink.loadAllLessonProgress())[0]).toMatchObject({ state: 'complete' });
    expect(readGameBests(d.storage)).toEqual({ 'note-rush': 70 });
  });

  it('says how much is still unsent when it cannot be sent, so the person can choose', async () => {
    const server = createServer();
    const d = createDevice(server);
    d.engine.signedIn(await d.signUp());
    await flush();
    server.state.down = true;
    await learn(d, done);
    expect(await d.engine.prepareSignOut(50)).toBe(1);
  });

  it('another learner signing in on the same device never inherits the previous learner\'s progress', async () => {
    const server = createServer();
    const d = createDevice(server);
    const first = await d.signUp('FirstKid');
    d.engine.signedIn(first);
    await learn(d, done);
    await flush();
    // Session lapsed with no sign-out; a different learner signs in.
    const second = await d.signUp('SecondKid');
    d.engine.signedIn(second);
    await flush();
    expect(await d.sink.loadAllLessonProgress()).toEqual([]);
    expect((await remote(server, d)).lessons).toEqual([]);
    expect(d.engine.getStatus().phase).toBe('idle'); // not offered someone else's progress as guest progress
  });

  it('a confirmed sign-out with nothing waiting clears the cache; with unsent work it keeps it for the next sign-in', async () => {
    const server = createServer();
    const clean = createDevice(server);
    clean.engine.signedIn(await clean.signUp());
    await learn(clean, done);
    await flush();
    clean.engine.confirmedSignedOut();
    expect(hasProgress(clean.storage)).toBe(false);

    const dirty = createDevice(server);
    const user = await dirty.signUp();
    dirty.engine.signedIn(user);
    await flush();
    server.state.down = true;
    await learn(dirty, done);
    dirty.engine.confirmedSignedOut();
    expect(hasProgress(dirty.storage)).toBe(true);
    expect(dirty.engine.getStatus().pending).toBe(1);
    server.state.down = false;
    dirty.engine.signedIn(user);
    await flush();
    expect(dirty.engine.getStatus().pending).toBe(0);
    expect((await remote(server, dirty)).lessons).toHaveLength(1);
  });
});
