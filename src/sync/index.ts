/**
 * The only file the rest of the app imports from the sync code: fire-and-forget calls that say "this was just
 * saved on the device". With accounts switched off at build time the engine is not even imported (the constant
 * below is replaced by a literal and the dead branch is dropped, so a normal build holds none of the sync code
 * and `scripts/check-no-account-ui.mjs` can prove it). With them on, the engine decides: a device with no
 * account progress on it ignores every call, so guests are exactly as before.
 *
 * The engine module is requested as soon as this file loads, so by the time a lesson ends it is already here
 * and the call is queued in the same turn; the provider mounted in the root layout makes sure it is loaded
 * on every page.
 */
import type { AttemptEvent, LessonProgress, ProgressSink } from '@/lesson/contracts';
import type { LocalProgressSink } from '@/lesson/progress';
import type { MockAttempt, MockResultSink } from '@/mock/store';

const ON = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === '1';
const engine = ON ? import('./engine') : null;

function warn(what: string, e: unknown) {
  console.warn(`[sync] ${what} failed:`, e instanceof Error ? e.message : 'unknown error');
}

export function syncLesson(progress: LessonProgress): void {
  engine?.then((m) => m.enqueueLesson(progress)).catch((e) => warn('queueing progress', e));
}
export function syncAttempt(attempt: AttemptEvent): void {
  engine?.then((m) => m.enqueueAttempt(attempt)).catch((e) => warn('queueing an attempt', e));
}
/** `variant` is null for a game with one best (Note Rush), else the key the game stores its best under. */
export function syncGameBest(game: string, variant: string | null, score: number): void {
  engine?.then((m) => m.enqueueGameBest(game, variant, score)).catch((e) => warn('queueing a best score', e));
}
export function syncMockResult(attempt: MockAttempt): void {
  engine?.then((m) => m.enqueueMock(attempt)).catch((e) => warn('queueing a mock result', e));
}

/** The local sink, plus the call that queues each write for the account. The local write always happens first. */
export function withAccountSync(local: LocalProgressSink): LocalProgressSink;
export function withAccountSync(local: ProgressSink): ProgressSink;
export function withAccountSync(local: ProgressSink): ProgressSink {
  return {
    ...local,
    async recordAttempt(event) {
      await local.recordAttempt(event);
      syncAttempt(event);
    },
    async saveLessonProgress(progress) {
      await local.saveLessonProgress(progress);
      syncLesson(progress);
    },
  };
}

export function withAccountSyncMock(local: MockResultSink): MockResultSink {
  return {
    ...local,
    async save(attempt) {
      await local.save(attempt);
      syncMockResult(attempt);
    },
  };
}
