/**
 * The outbox: progress written on this device that the account has not confirmed yet.
 *
 * Kept in localStorage (key `mtn:v1:outbox`, so "Clear everything on this device" clears it too) and
 * re-read for every operation, so a refresh loses nothing and two tabs share one queue. It is a log with
 * a little coalescing: a lesson's newer save replaces its older one, a game's lower score is dropped for
 * its higher one. Attempts and mock results are appended. Nothing here talks to the network.
 *
 * Replaying any entry is harmless (the routes are idempotent), which is what lets a retry after a lost
 * answer be simple: send it again.
 */
import { LIMITS, type AttemptWire, type BatchWire, type GameWire, type LessonWire, type MockWire } from './wire';

export const OUTBOX_KEY = 'mtn:v1:outbox';
/** The most entries kept. Past this the oldest attempts go first: they are history, not progress. */
export const MAX_OUTBOX = 6000;

export type OutboxEntry =
  | { id: number; k: 'lesson'; v: LessonWire }
  | { id: number; k: 'attempt'; v: AttemptWire }
  | { id: number; k: 'game'; v: GameWire }
  | { id: number; k: 'mock'; v: MockWire };

type NewEntry =
  | { k: 'lesson'; v: LessonWire }
  | { k: 'attempt'; v: AttemptWire }
  | { k: 'game'; v: GameWire }
  | { k: 'mock'; v: MockWire };

interface Saved {
  v: 1;
  next: number;
  entries: OutboxEntry[];
}

/** Attempts are the same attempt when the database would key them the same; mock results when their content is equal. */
const dedupeKey = (e: NewEntry | OutboxEntry): string =>
  e.k === 'attempt' ? `a|${e.v.lessonId}|${e.v.step}|${e.v.questionId}|${Date.parse(e.v.at)}` : `m|${JSON.stringify(e.v)}`;

export class Outbox {
  /** Used only when storage fails; it then wins over whatever storage holds. */
  private fallback: Saved | null = null;

  constructor(private readonly storage: Storage | undefined) {}

  private load(): Saved {
    if (this.fallback) return this.fallback;
    try {
      const raw = this.storage?.getItem(OUTBOX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Saved>;
        if (parsed && parsed.v === 1 && Array.isArray(parsed.entries) && typeof parsed.next === 'number') {
          return { v: 1, next: parsed.next, entries: parsed.entries.filter(isEntry) };
        }
      }
    } catch {
      /* unreadable reads as empty */
    }
    return { v: 1, next: 1, entries: [] };
  }

  private save(s: Saved): void {
    if (s.entries.length > MAX_OUTBOX) {
      let drop = s.entries.length - MAX_OUTBOX;
      const kept: OutboxEntry[] = [];
      for (const e of s.entries) {
        if (drop > 0 && e.k === 'attempt') drop--;
        else kept.push(e);
      }
      s.entries = kept.length > MAX_OUTBOX ? kept.slice(-MAX_OUTBOX) : kept;
    }
    if (this.fallback) {
      this.fallback = s;
      return;
    }
    try {
      if (!this.storage) throw new Error('no storage');
      if (s.entries.length === 0) this.storage.removeItem(OUTBOX_KEY);
      else this.storage.setItem(OUTBOX_KEY, JSON.stringify(s));
    } catch {
      this.fallback = s;
    }
  }

  size(): number {
    return this.load().entries.length;
  }

  entries(): OutboxEntry[] {
    return this.load().entries;
  }

  add(items: readonly NewEntry[]): void {
    if (items.length === 0) return;
    const s = this.load();
    // Keys of what is already queued, built once, so adding a big batch stays fast.
    const seen = new Set<string>(s.entries.filter((e) => e.k === 'attempt' || e.k === 'mock').map(dedupeKey));
    for (const item of items) {
      if (item.k === 'lesson') {
        s.entries = s.entries.filter((e) => !(e.k === 'lesson' && e.v.lessonId === item.v.lessonId));
      } else if (item.k === 'game') {
        const same = s.entries.find((e) => e.k === 'game' && e.v.gameId === item.v.gameId);
        if (same && same.k === 'game' && same.v.score >= item.v.score) continue;
        s.entries = s.entries.filter((e) => !(e.k === 'game' && e.v.gameId === item.v.gameId));
      } else if (item.k === 'attempt' || item.k === 'mock') {
        const key = dedupeKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      s.entries.push({ id: s.next++, ...item } as OutboxEntry);
    }
    this.save(s);
  }

  /** The next batch, oldest first, within the per-request limits. `ids` says what to remove once it is confirmed. */
  nextBatch(): { batch: BatchWire; ids: number[] } | null {
    const batch: BatchWire = { lessons: [], attempts: [], games: [], mocks: [] };
    const ids: number[] = [];
    const room = { lesson: LIMITS.syncLessons, attempt: LIMITS.syncAttempts, game: LIMITS.syncGames, mock: LIMITS.syncMocks };
    for (const e of this.load().entries) {
      if (room[e.k] <= 0) continue;
      room[e.k]--;
      ids.push(e.id);
      if (e.k === 'lesson') batch.lessons.push(e.v);
      else if (e.k === 'attempt') batch.attempts.push(e.v);
      else if (e.k === 'game') batch.games.push(e.v);
      else batch.mocks.push(e.v);
    }
    return ids.length ? { batch, ids } : null;
  }

  remove(ids: readonly number[]): void {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    const s = this.load();
    const kept = s.entries.filter((e) => !gone.has(e.id));
    if (kept.length === s.entries.length) return;
    s.entries = kept;
    this.save(s);
  }

  clear(): void {
    this.fallback = null;
    try {
      this.storage?.removeItem(OUTBOX_KEY);
    } catch {
      /* nothing to clear */
    }
  }
}

function isEntry(e: unknown): e is OutboxEntry {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as { id?: unknown; k?: unknown; v?: unknown };
  return typeof x.id === 'number' && ['lesson', 'attempt', 'game', 'mock'].includes(x.k as string) && typeof x.v === 'object' && x.v !== null;
}
