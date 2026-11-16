/**
 * Term Blitz: pure game engine.
 *
 * No React, no timers, no DOM. Time only moves when the caller passes `dtMs` to `tick`.
 * Randomness only comes from the injected `Rng`. `createGame(config, bank, rng)` returns a
 * state; `tick`, `answer` and `continueRound` each return `{ state, events }` and never mutate
 * their input (the Rng held inside the state is the one stateful part).
 *
 * Rules, with the numbers a test can check by hand:
 *
 * - One card at a time (see cards.ts for the three types). Which entry comes next is the
 *   scheduler's job (scheduler.ts): wrong cards come back after 3 to 5 others.
 * - Card clock (timed mode): `cardTimeMs(streak) = 6000 - 300 * min(streak, 10)`, so 6 s at
 *   streak 0 shortening to 3 s from streak 10. It is set when the card appears, from the
 *   streak at that moment. When it runs out the card is a timeout: it counts as wrong.
 * - Round clock (timed mode): 60 s by default. It keeps running while a wrong answer is shown.
 *   When it runs out the round ends at once, even with a card on screen (that card is not counted).
 * - Score: `(10 + speedBonus) * multiplier`. `speedBonus = floor(10 * cardLeft / cardLimit)` at the
 *   moment of the answer (0 in untimed mode). `multiplier = min(4, 1 + floor(streak / 5))` using
 *   the streak before this answer, so right answers 1-5 are x1, 6-10 x2, 11-15 x3, 16+ x4.
 * - A wrong answer or a timeout resets the streak to 0, shows the correct pairing for
 *   `REVEAL_MS` (timed; the player may continue sooner) or until the player continues
 *   (untimed), and never ends the round.
 * - Untimed: no clocks; the round ends after `untimedCards` cards have been answered.
 * - "Quick" for the scheduler: answered with at least half of the card clock left (timed), or within
 *   3 s of the card appearing (untimed).
 */
import type { Rng } from '@/engine/types';
import type { Bank } from './bank';
import { ROUND_SECONDS, UNTIMED_CARDS } from './deck-data';
import { buildableTypes, buildCard, OPTION_COUNT, type Card, type CardType } from './cards';
import {
  createScheduler,
  nextEntry,
  recordOutcome,
  retire,
  type SchedState,
} from './scheduler';

export interface TermBlitzConfig {
  /** Entry ids of the deck. Entries that cannot make a card are dropped. */
  poolIds: readonly string[];
  roundSeconds: number;
  untimed: boolean;
  untimedCards: number;
}

export const DEFAULT_CONFIG: TermBlitzConfig = {
  poolIds: [],
  roundSeconds: ROUND_SECONDS,
  untimed: false,
  untimedCards: UNTIMED_CARDS,
};

export const BASE_POINTS = 10;
export const MAX_SPEED_BONUS = 10;
export const STREAK_STEP = 5;
export const MAX_MULTIPLIER = 4;
export const CARD_MAX_MS = 6000;
export const CARD_MIN_MS = 3000;
export const CARD_STEP_MS = 300;
export const REVEAL_MS = 2200;
export const FAST_FRACTION = 0.5;
export const FAST_UNTIMED_MS = 3000;
const EPS = 1e-9;

export function cardTimeMs(streak: number): number {
  return Math.max(CARD_MIN_MS, CARD_MAX_MS - CARD_STEP_MS * Math.max(0, Math.floor(streak)));
}

export function multiplierForStreak(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, streak) / STREAK_STEP));
}

export interface Reveal {
  card: Card;
  /** The button chosen, or null for a timeout. */
  guessIndex: number | null;
  reason: 'wrong' | 'timeout';
  /** Time left before it moves on by itself; null in untimed mode. */
  leftMs: number | null;
}

export interface MissedTerm {
  entryId: string;
  count: number;
}

export interface GameResult {
  score: number;
  correct: number;
  wrong: number;
  timedOut: number;
  /** Cards answered or timed out: the "cards seen". */
  answered: number;
  /** correct / answered, 0 when nothing was answered. */
  accuracy: number;
  bestStreak: number;
  /** Entries answered wrong or timed out, most often first, ties in the order first missed. */
  missed: MissedTerm[];
  untimed: boolean;
}

export type GameEvent =
  | { type: 'card'; card: Card }
  | { type: 'correct'; card: Card; points: number; speedBonus: number; multiplier: number; streak: number }
  | { type: 'wrong'; card: Card; guessIndex: number }
  | { type: 'timeout'; card: Card }
  | { type: 'finished'; result: GameResult };

export type GameEventType = GameEvent['type'];

export interface GameState {
  readonly config: TermBlitzConfig;
  readonly rng: Rng;
  readonly bank: Bank;
  readonly pool: readonly string[];
  readonly phase: 'playing' | 'reveal' | 'finished';
  readonly elapsedMs: number;
  /** Null in untimed mode. */
  readonly roundLeftMs: number | null;
  readonly card: Card | null;
  readonly cardElapsedMs: number;
  /** Null in untimed mode. */
  readonly cardLeftMs: number | null;
  /** The clock the card started with, null in untimed mode. */
  readonly cardLimitMs: number | null;
  readonly reveal: Reveal | null;
  readonly sched: SchedState;
  readonly seq: number;
  readonly lastType: CardType | null;
  readonly lastTypeByEntry: Readonly<Record<string, CardType>>;
  readonly score: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly correct: number;
  readonly wrong: number;
  readonly timedOut: number;
  readonly answered: number;
  readonly missed: Readonly<Record<string, number>>;
  readonly missedOrder: readonly string[];
  readonly result: GameResult | null;
}

export interface Step {
  state: GameState;
  events: GameEvent[];
}

export function resolveConfig(partial?: Partial<TermBlitzConfig>): TermBlitzConfig {
  const merged = { ...DEFAULT_CONFIG, ...Object.fromEntries(Object.entries(partial ?? {}).filter(([, v]) => v !== undefined)) };
  return {
    ...merged,
    roundSeconds: merged.roundSeconds > 0 ? merged.roundSeconds : DEFAULT_CONFIG.roundSeconds,
    untimedCards: merged.untimedCards >= 1 ? Math.floor(merged.untimedCards) : DEFAULT_CONFIG.untimedCards,
  };
}

/** Entries of `ids` that can be asked at least one way from this pool. */
export function playableIds(bank: Bank, ids: readonly string[]): string[] {
  const known = ids.filter((id) => bank.byId.has(id));
  return known.filter((id) => buildableTypes(bank, known, id).length > 0);
}

export function createGame(config: Partial<TermBlitzConfig>, bank: Bank, rng: Rng): GameState {
  const cfg = resolveConfig(config);
  const pool = playableIds(bank, cfg.poolIds);
  if (pool.length < OPTION_COUNT) throw new Error(`Term Blitz needs at least ${OPTION_COUNT} playable entries, got ${pool.length}`);
  const base: GameState = {
    config: cfg,
    rng,
    bank,
    pool,
    phase: 'playing',
    elapsedMs: 0,
    roundLeftMs: cfg.untimed ? null : cfg.roundSeconds * 1000,
    card: null,
    cardElapsedMs: 0,
    cardLeftMs: null,
    cardLimitMs: null,
    reveal: null,
    sched: createScheduler(pool, rng),
    seq: 0,
    lastType: null,
    lastTypeByEntry: {},
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    timedOut: 0,
    answered: 0,
    missed: {},
    missedOrder: [],
    result: null,
  };
  return dealCard(base, []);
}

export function buildResult(state: GameState): GameResult {
  const order = new Map(state.missedOrder.map((id, i) => [id, i]));
  const missed = state.missedOrder
    .map((entryId) => ({ entryId, count: state.missed[entryId] }))
    .sort((a, b) => b.count - a.count || order.get(a.entryId)! - order.get(b.entryId)!);
  return {
    score: state.score,
    correct: state.correct,
    wrong: state.wrong,
    timedOut: state.timedOut,
    answered: state.answered,
    accuracy: state.answered === 0 ? 0 : state.correct / state.answered,
    bestStreak: state.bestStreak,
    missed,
    untimed: state.config.untimed,
  };
}

// --- internals ---------------------------------------------------------------------------

/** Chooses and builds the next card. Entries that cannot make one are retired. */
function dealCard(state: GameState, events: GameEvent[]): GameState {
  let sched = state.sched;
  const { rng, bank, pool } = state;
  for (;;) {
    const next = nextEntry(sched, rng);
    if (!next) throw new Error('Term Blitz: no entry left to ask');
    sched = next.state;
    const types = buildableTypes(bank, pool, next.id);
    if (types.length === 0) {
      sched = retire(sched, next.id);
      continue;
    }
    const lastForEntry = state.lastTypeByEntry[next.id];
    const fresh = types.filter((t) => t !== lastForEntry);
    const varied = fresh.filter((t) => t !== state.lastType);
    const type = rng.pick(varied.length > 0 ? varied : fresh.length > 0 ? fresh : types);
    const card = buildCard(bank, pool, next.id, type, rng, state.seq + 1);
    if (!card) {
      sched = retire(sched, next.id);
      continue;
    }
    const limit = state.config.untimed ? null : cardTimeMs(state.streak);
    events.push({ type: 'card', card });
    return {
      ...state,
      sched,
      card,
      seq: card.seq,
      phase: 'playing',
      reveal: null,
      cardElapsedMs: 0,
      cardLeftMs: limit,
      cardLimitMs: limit,
      lastType: type,
      lastTypeByEntry: { ...state.lastTypeByEntry, [next.id]: type },
    };
  }
}

function finish(state: GameState, events: GameEvent[]): GameState {
  const done: GameState = { ...state, phase: 'finished', reveal: null };
  const result = buildResult(done);
  events.push({ type: 'finished', result });
  return { ...done, result };
}

/** Records a wrong answer or a timeout and opens the reveal. */
function fail(state: GameState, guessIndex: number | null, events: GameEvent[]): GameState {
  const card = state.card!;
  const entryId = card.entryId;
  const reason = guessIndex === null ? 'timeout' : 'wrong';
  events.push(guessIndex === null ? { type: 'timeout', card } : { type: 'wrong', card, guessIndex });
  const sched = recordOutcome(state.sched, entryId, { correct: false, fast: false }, state.rng);
  const firstMiss = state.missed[entryId] === undefined;
  return {
    ...state,
    sched,
    phase: 'reveal',
    streak: 0,
    answered: state.answered + 1,
    wrong: state.wrong + (reason === 'wrong' ? 1 : 0),
    timedOut: state.timedOut + (reason === 'timeout' ? 1 : 0),
    missed: { ...state.missed, [entryId]: (state.missed[entryId] ?? 0) + 1 },
    missedOrder: firstMiss ? [...state.missedOrder, entryId] : state.missedOrder,
    reveal: { card, guessIndex, reason, leftMs: state.config.untimed ? null : REVEAL_MS },
  };
}

/** Moves on from the reveal: the next card, or the end of an untimed round. */
function moveOn(state: GameState, events: GameEvent[]): GameState {
  if (state.config.untimed && state.answered >= state.config.untimedCards) return finish(state, events);
  return dealCard(state, events);
}

// --- public steps --------------------------------------------------------------------------

/** Advance the clocks. Does nothing once the round has finished. */
export function tick(input: GameState, dtMs: number): Step {
  const events: GameEvent[] = [];
  if (input.phase === 'finished' || !(dtMs > 0)) return { state: input, events };
  let state = input;
  if (state.config.untimed) {
    // Nothing runs out; the card's age is kept only to tell a quick answer from a slow one.
    if (state.phase === 'playing') state = { ...state, cardElapsedMs: state.cardElapsedMs + dtMs, elapsedMs: state.elapsedMs + dtMs };
    return { state, events };
  }
  let rem = dtMs;
  while (rem > 0 && state.phase !== 'finished') {
    const roundLeft = state.roundLeftMs ?? 0;
    if (state.phase === 'playing') {
      const cardLeft = state.cardLeftMs ?? 0;
      const step = Math.min(rem, roundLeft, cardLeft);
      state = {
        ...state,
        elapsedMs: state.elapsedMs + step,
        roundLeftMs: roundLeft - step,
        cardLeftMs: cardLeft - step,
        cardElapsedMs: state.cardElapsedMs + step,
      };
      rem -= step;
      if ((state.roundLeftMs ?? 0) <= EPS) state = finish({ ...state, roundLeftMs: 0 }, events);
      else if ((state.cardLeftMs ?? 0) <= EPS) state = fail({ ...state, cardLeftMs: 0 }, null, events);
    } else {
      const reveal = state.reveal!;
      const revealLeft = reveal.leftMs ?? 0;
      const step = Math.min(rem, roundLeft, revealLeft);
      state = {
        ...state,
        elapsedMs: state.elapsedMs + step,
        roundLeftMs: roundLeft - step,
        reveal: { ...reveal, leftMs: revealLeft - step },
      };
      rem -= step;
      if ((state.roundLeftMs ?? 0) <= EPS) state = finish({ ...state, roundLeftMs: 0 }, events);
      else if ((state.reveal?.leftMs ?? 0) <= EPS) state = moveOn(state, events);
    }
  }
  return { state, events };
}

/** Answer the card with button `index` (0 to 3). Ignored unless a card is waiting for an answer. */
export function answer(state: GameState, index: number): Step {
  const events: GameEvent[] = [];
  const card = state.card;
  if (state.phase !== 'playing' || !card || !Number.isInteger(index) || index < 0 || index >= card.options.length) {
    return { state, events };
  }
  if (index !== card.correctIndex) return { state: fail(state, index, events), events };

  const untimed = state.config.untimed;
  const limit = state.cardLimitMs ?? 1;
  const left = state.cardLeftMs ?? 0;
  const speedBonus = untimed ? 0 : Math.floor(MAX_SPEED_BONUS * Math.min(1, Math.max(0, left / limit)) + EPS);
  const multiplier = multiplierForStreak(state.streak);
  const points = (BASE_POINTS + speedBonus) * multiplier;
  const streak = state.streak + 1;
  const fast = untimed ? state.cardElapsedMs <= FAST_UNTIMED_MS : left >= limit * FAST_FRACTION - EPS;
  events.push({ type: 'correct', card, points, speedBonus, multiplier, streak });
  let next: GameState = {
    ...state,
    sched: recordOutcome(state.sched, card.entryId, { correct: true, fast }, state.rng),
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correct: state.correct + 1,
    answered: state.answered + 1,
  };
  next = moveOn(next, events);
  return { state: next, events };
}

/** Leaves the reveal early (the player pressed Continue). Ignored in any other phase. */
export function continueRound(state: GameState): Step {
  const events: GameEvent[] = [];
  if (state.phase !== 'reveal') return { state, events };
  return { state: moveOn(state, events), events };
}
