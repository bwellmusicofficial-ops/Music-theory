/**
 * The server-side seam for saving a signed-in learner's progress (P1-03). Route handlers know only this
 * interface. Two implementations: `SupabaseProgressStore` (the signed-in user's own session, so row level
 * security applies) and `MemoryProgressStore` (tests and the end-to-end run).
 *
 * A store is already bound to one signed-in user: there is no user id to pass, and so none to get wrong.
 * Every method is safe to repeat with the same input (the browser replays after a lost answer).
 */
import type { AttemptWire, GameWire, LessonWire, MockWire, SnapshotWire } from '@/sync/wire';

export interface MergeCounts {
  lessons_merged: number;
  lessons_skipped: number;
  attempts_inserted: number;
  attempts_duplicate: number;
  attempts_skipped: number;
}

/** Thrown when the database refuses for a reason that is worth retrying later (its per-minute attempts cap). */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterSeconds = 60) {
    super('rate limited');
  }
}

export interface ProgressStore {
  /** The signed-in user's id. Only for keying rate limits; never sent to the browser. */
  readonly userId: string;
  /** Everything held for this user, bounded (newest attempts only). */
  snapshot(): Promise<SnapshotWire>;
  /** Keeps the more advanced state, the greater best score and the further position per lesson. Never regresses. */
  saveLessons(items: readonly LessonWire[]): Promise<{ skipped: number }>;
  /** Append only; an attempt already stored (same lesson, step, question and time) is left alone. */
  recordAttempts(items: readonly AttemptWire[]): Promise<{ inserted: number }>;
  /** Stores a score only when it beats the best already stored for that game id. */
  saveGameBests(items: readonly GameWire[]): Promise<{ saved: number }>;
  /** Stores a result unless this grade already has one with exactly this score and breakdown. */
  saveMockResults(items: readonly MockWire[]): Promise<{ saved: number }>;
  /** `merge_guest_progress`: lessons and attempts from a device that was used before the account existed. */
  mergeGuest(payload: { lessons: readonly LessonWire[]; attempts: readonly AttemptWire[] }): Promise<MergeCounts>;
}
