/**
 * Term Blitz: spaced repetition inside one round. Pure; randomness only through the injected Rng.
 *
 * The unit is an entry id. Rules, with the numbers a test can check:
 *
 * - First pass: every entry comes up once, in a shuffled order, before any entry comes up
 *   for a second time as a fresh card.
 * - A wrong answer (or a timeout) comes back after 3 to 5 other cards, and needs two right
 *   answers in a row of appearances to be done: after the first right answer it comes back once
 *   more after 6 to 9 other cards; a wrong answer at any point starts again at 3 to 5.
 * - A due card always goes before a fresh one. If several are due, the one due longest goes first.
 * - Once every entry has been seen, the next card is drawn at random with weights: an entry that
 *   was ever answered wrong weighs 2, one answered right but slowly weighs 1, one answered right
 *   quickly weighs 0.25. So a quick right answer makes a card rare, not gone.
 * - The card just shown is never drawn again straight away unless it is the only one.
 */
import type { Rng } from '@/engine/types';

export const WRONG_GAP_MIN = 3;
export const WRONG_GAP_MAX = 5;
export const RETRY_GAP_MIN = 6;
export const RETRY_GAP_MAX = 9;
/** Right answers needed after a wrong one. */
export const RIGHT_NEEDED = 2;
export const WEIGHT_EVER_WRONG = 2;
export const WEIGHT_SLOW_RIGHT = 1;
export const WEIGHT_FAST_RIGHT = 0.25;

export interface SchedEntry {
  readonly id: string;
  readonly seen: number;
  readonly wrong: number;
  /** Right answers still needed; 0 when not in trouble. */
  readonly needRight: number;
  /** Index of the card at which this entry is due again, or null. */
  readonly dueAt: number | null;
  /** Index at which the entry was last shown, or -1. */
  readonly shownAt: number;
  /** Whether the last right answer was quick (null before any right answer). */
  readonly lastFast: boolean | null;
  /** Taken out of circulation (its card cannot be built). */
  readonly retired: boolean;
}

export interface SchedState {
  readonly entries: Readonly<Record<string, SchedEntry>>;
  /** Entries not yet shown, in the order they will come. */
  readonly queue: readonly string[];
  /** Cards shown so far; the next card has this index. */
  readonly shown: number;
  readonly last: string | null;
}

export function createScheduler(ids: readonly string[], rng: Rng): SchedState {
  const unique = [...new Set(ids)];
  const entries: Record<string, SchedEntry> = {};
  for (const id of unique) {
    entries[id] = { id, seen: 0, wrong: 0, needRight: 0, dueAt: null, shownAt: -1, lastFast: null, retired: false };
  }
  return { entries, queue: rng.shuffle(unique), shown: 0, last: null };
}

function patch(state: SchedState, id: string, change: Partial<SchedEntry>): SchedState {
  return { ...state, entries: { ...state.entries, [id]: { ...state.entries[id], ...change } } };
}

/** Takes an entry out of circulation for the rest of the round. */
export function retire(state: SchedState, id: string): SchedState {
  if (!state.entries[id]) return state;
  return { ...patch(state, id, { retired: true, dueAt: null }), queue: state.queue.filter((q) => q !== id) };
}

export function activeCount(state: SchedState): number {
  return Object.values(state.entries).filter((e) => !e.retired).length;
}

function weight(e: SchedEntry): number {
  if (e.wrong > 0) return WEIGHT_EVER_WRONG;
  return e.lastFast ? WEIGHT_FAST_RIGHT : WEIGHT_SLOW_RIGHT;
}

/** The entry for the next card, or null when no entry is left in circulation. */
export function nextEntry(state: SchedState, rng: Rng): { id: string; state: SchedState } | null {
  const live = Object.values(state.entries).filter((e) => !e.retired);
  if (live.length === 0) return null;
  const turn = state.shown;
  const avoid = live.length > 1 ? state.last : null;

  let id: string | null = null;
  // 1. A due card, longest overdue first.
  const due = live
    .filter((e) => e.dueAt !== null && e.dueAt <= turn && e.id !== avoid)
    .sort((a, b) => a.dueAt! - b.dueAt!);
  if (due.length > 0) id = due[0].id;

  // 2. A card not yet shown.
  let queue = state.queue;
  if (id === null) {
    const at = queue.findIndex((q) => q !== avoid);
    if (at >= 0) {
      id = queue[at];
    }
  }

  // 3. A weighted draw among entries that are not waiting for their due time.
  if (id === null) {
    let pool = live.filter((e) => e.dueAt === null && e.id !== avoid);
    if (pool.length === 0) pool = live.filter((e) => e.id !== avoid);
    if (pool.length === 0) pool = live;
    const total = pool.reduce((sum, e) => sum + weight(e), 0);
    let r = rng.next() * total;
    id = pool[pool.length - 1].id;
    for (const e of pool) {
      r -= weight(e);
      if (r < 0) {
        id = e.id;
        break;
      }
    }
  }

  queue = queue.filter((q) => q !== id);
  const entry = state.entries[id];
  const next = patch({ ...state, queue, shown: turn + 1, last: id }, id, {
    seen: entry.seen + 1,
    shownAt: turn,
    dueAt: null,
  });
  return { id, state: next };
}

export interface Outcome {
  correct: boolean;
  /** Right and quick (see the game's definition of quick). */
  fast: boolean;
}

/** Records the answer to the card for `id` (the entry last returned by `nextEntry`). */
export function recordOutcome(state: SchedState, id: string, outcome: Outcome, rng: Rng): SchedState {
  const e = state.entries[id];
  if (!e) return state;
  if (!outcome.correct) {
    const gap = rng.int(WRONG_GAP_MIN, WRONG_GAP_MAX);
    return patch(state, id, { wrong: e.wrong + 1, needRight: RIGHT_NEEDED, dueAt: e.shownAt + 1 + gap });
  }
  const needRight = Math.max(0, e.needRight - 1);
  if (needRight > 0) {
    const gap = rng.int(RETRY_GAP_MIN, RETRY_GAP_MAX);
    return patch(state, id, { needRight, dueAt: e.shownAt + 1 + gap, lastFast: outcome.fast });
  }
  return patch(state, id, { needRight: 0, dueAt: null, lastFast: outcome.fast });
}
