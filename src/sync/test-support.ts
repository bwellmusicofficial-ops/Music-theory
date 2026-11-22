/** Shared by the sync tests: a pretend server (the real route handlers over the memory backend) and devices. */
import { MemoryAccountBackend } from '@/accounts/backend/memory';
import { handleProgressGet, handleProgressMerge, handleProgressSync } from '@/accounts/progress-handlers';
import { TestJar } from '@/accounts/test-support/jar';
import type { AttemptEvent, LessonProgress } from '@/lesson/contracts';
import { MemoryStorage } from '@/lesson/player/test-fixtures';
import { createLocalProgressSink } from '@/lesson/progress';
import { createEngine, type EngineOptions } from './engine';
import { createFetchTransport } from './transport';

export const PASSWORD = 'purple elephants';

export function createServer() {
  const backend = new MemoryAccountBackend();
  const requests: { path: string; method: string }[] = [];
  const state = { down: false, failNext: 0 };

  /** A `fetch` for one browser (its own cookie jar), answered by the real handlers. */
  const fetchFor = (jar: TestJar): typeof fetch =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:3000');
      requests.push({ path: url.pathname, method: init?.method ?? 'GET' });
      if (state.down) throw new TypeError('offline');
      if (state.failNext > 0) {
        state.failNext--;
        return new Response('{}', { status: 503 });
      }
      const req = new Request(url, init);
      const load = async () => ({ backend, jar });
      if (url.pathname === '/api/account/progress') return handleProgressGet(req, load);
      if (url.pathname === '/api/account/progress/sync') return handleProgressSync(req, load);
      if (url.pathname === '/api/account/progress/merge') return handleProgressMerge(req, load);
      return new Response(null, { status: 404 });
    }) as typeof fetch;

  return { backend, requests, state, fetchFor };
}
export type Server = ReturnType<typeof createServer>;

let n = 0;
export const uniqueName = (stem = 'Learner') => `${stem}${++n}`.slice(0, 20);

/** One browser: its own storage, cookie jar and engine, pointed at the pretend server. */
export function createDevice(server: Server, options: Partial<EngineOptions> & { storage?: MemoryStorage; jar?: TestJar } = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const jar = options.jar ?? new TestJar();
  const changes = { count: 0 };
  const engine = createEngine({
    storage,
    transport: createFetchTransport(server.fetchFor(jar)),
    onLocalChange: () => void changes.count++,
    ...options,
    syncer: { random: () => 1, ...options.syncer },
  });
  const sink = createLocalProgressSink(storage);
  return {
    storage, jar, engine, sink, changes,
    async signUp(codeName = uniqueName()) {
      const r = await server.backend.signUp({ codeName, password: PASSWORD, ageBand: 'under_18' }, jar);
      if (!r.ok) throw new Error('sign up failed');
      return r.user;
    },
    async signIn(codeName: string) {
      const r = await server.backend.signIn({ codeName, password: PASSWORD }, jar);
      if (!r.ok) throw new Error('sign in failed');
      return r.user;
    },
    async signOut() {
      await server.backend.signOut(jar);
      engine.afterSignOut();
    },
  };
}
export type Device = ReturnType<typeof createDevice>;

export const lessonProgress = (over: Partial<LessonProgress> = {}): LessonProgress => ({
  lessonId: 'g1-rhythm-01', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: null, updatedAt: new Date().toISOString(), ...over,
});

const BASE_TIME = Date.now() - 3_600_000;
export const attemptEvent = (i: number, over: Partial<AttemptEvent> = {}): AttemptEvent => ({
  lessonId: 'g1-rhythm-01', step: 'practice', questionId: `q-${i}`, skill: 'rhythm.note.value', type: 'multiple-choice', correct: true, score: 1,
  msTaken: 1200, at: new Date(BASE_TIME + i * 1000).toISOString(), ...over,
});

/** Lets queued promises (sends, pulls) finish. */
export async function flush(times = 40): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

/** Does what a learner does on a device that holds an account: save locally, then tell the engine. */
export async function learn(d: Device, p: LessonProgress, attempts: AttemptEvent[] = []) {
  for (const a of attempts) {
    await d.sink.recordAttempt(a);
    d.engine.enqueueAttempt(a);
  }
  await d.sink.saveLessonProgress(p);
  d.engine.enqueueLesson(p);
}
