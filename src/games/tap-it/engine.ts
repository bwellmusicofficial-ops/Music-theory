/**
 * Tap It: pure game engine.
 *
 * No React, no timers, no audio. The round clock only moves when the caller passes `dtMs` to
 * `tick`; the timing of each tap is judged elsewhere (the rhythm pad) and arrives here as
 * `judge(state, index, verdict)` and `extraTap(state)`. Randomness only comes from the
 * injected `Rng`. Every step returns `{ state, events }` and never mutates its input (the
 * Rng held inside the state is the one stateful part).
 *
 * Rules, with the numbers a test can check by hand:
 *
 * - A round is a run of two-bar rhythms (`generateRhythm`). Level 1 to 8 picks the
 *   vocabulary and tempo (see `levels.ts`).
 * - Score per onset: perfect 10, close 5, miss 0, times the multiplier. `multiplier =
 *   min(4, 1 + floor(streak / 8))` using the streak before this onset, so hits 1-8 are x1,
 *   9-16 x2, 17-24 x3 and 25+ x4. A hit (perfect or close) adds 1 to the streak; a miss or an
 *   extra tap resets it to 0.
 * - A rhythm in which every onset is perfect earns a flat bonus of 25 (not multiplied).
 * - Rhythm accuracy = hits (perfect or close) / onsets. Level up after two rhythms in a row
 *   at 85% or better; level down after two in a row below 50%. A change clears that pair.
 * - The round ends when `timeLeftMs` is 0 or less at the end of a rhythm (`completeRhythm`);
 *   the rhythm being played is always finished.
 * - Practice mode (slow, for the untimed setting): no clock, no score, no streak, fixed level,
 *   `practiceRhythms` rhythms, wide timing tolerance. Results report hits and misses only.
 * - Nothing here ends a round early on mistakes: there are no lives.
 */
import type { Rng } from '@/engine/types';
import { clampLevel, levelSpec, MAX_LEVEL, MIN_LEVEL } from './levels';
import { generateRhythm, rhythmKey, type TapRhythm } from './rhythms';

export type Verdict = 'perfect' | 'close' | 'miss';
export type StartChoice = 1 | 3 | 5;

export interface TapItConfig {
  /** Seconds of play in a timed round. */
  roundSeconds: number;
  startLevel: number;
  /** Slow, unscored practice. */
  practice: boolean;
  practiceRhythms: number;
}

export const DEFAULT_CONFIG: TapItConfig = {
  roundSeconds: 60,
  startLevel: 1,
  practice: false,
  practiceRhythms: 6,
};

export const POINTS = { perfect: 10, close: 5, miss: 0 } as const;
export const STREAK_STEP = 8;
export const MAX_MULTIPLIER = 4;
export const PERFECT_RHYTHM_BONUS = 25;
export const LEVEL_UP_ACCURACY = 0.85;
export const LEVEL_DOWN_BELOW = 0.5;
export const PRACTICE_BPM = 50;

/** Timing thresholds, in ms from the beat. Practice is wide on purpose. */
export const TIMING = { perfectMs: 60, toleranceMs: 150 } as const;
export const PRACTICE_TIMING = { perfectMs: 120, toleranceMs: 300 } as const;

export function timingFor(config: Pick<TapItConfig, 'practice'>): { perfectMs: number; toleranceMs: number } {
  return config.practice ? PRACTICE_TIMING : TIMING;
}

export function resolveConfig(partial?: Partial<TapItConfig>): TapItConfig {
  const clean = Object.fromEntries(Object.entries(partial ?? {}).filter(([, v]) => v !== undefined)) as Partial<TapItConfig>;
  const merged = { ...DEFAULT_CONFIG, ...clean };
  return {
    ...merged,
    roundSeconds: merged.roundSeconds > 0 ? merged.roundSeconds : DEFAULT_CONFIG.roundSeconds,
    startLevel: clampLevel(merged.startLevel),
    practiceRhythms: merged.practiceRhythms >= 1 ? Math.floor(merged.practiceRhythms) : DEFAULT_CONFIG.practiceRhythms,
  };
}

/** Score multiplier for a count of consecutive hits. */
export function multiplierForStreak(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, streak) / STREAK_STEP));
}

// --- state ---------------------------------------------------------------------------

export interface Tally {
  score: number;
  streak: number;
  bestStreak: number;
  perfects: number;
  closes: number;
  misses: number;
  extraTaps: number;
}

export interface RhythmRecord {
  /** 1-based position in the round. */
  number: number;
  level: number;
  onsets: number;
  perfect: number;
  close: number;
  miss: number;
  accuracy: number;
  bonus: number;
  /** Points earned in this rhythm including the bonus. */
  points: number;
}

export interface GameResult {
  score: number;
  /** Hits (perfect or close) over onsets, 0 when nothing was played. */
  accuracy: number;
  bestStreak: number;
  maxLevel: number;
  rhythms: number;
  onsets: number;
  perfects: number;
  closes: number;
  misses: number;
  extraTaps: number;
  /** The level where most onsets were missed (the higher one on a tie), or null with no misses. */
  weakLevel: number | null;
  /** "Practise ..." naming that level's vocabulary, or null. */
  practise: string | null;
  practice: boolean;
}

export type GameEvent =
  | { type: 'hit'; index: number; verdict: 'perfect' | 'close'; points: number; multiplier: number; streak: number }
  | { type: 'miss'; index: number }
  | { type: 'extra' }
  | { type: 'rhythmDone'; record: RhythmRecord }
  | { type: 'levelUp'; level: number }
  | { type: 'levelDown'; level: number }
  | { type: 'finished'; result: GameResult };

export interface GameState extends Tally {
  readonly config: TapItConfig;
  readonly rng: Rng;
  readonly phase: 'playing' | 'finished';
  readonly elapsedMs: number;
  readonly level: number;
  readonly maxLevel: number;
  /** The rhythm to play (or being played). */
  readonly current: TapRhythm;
  /** 1-based number of `current`. */
  readonly rhythmNumber: number;
  /** Verdict per onset index of `current`, as judged so far. */
  readonly judged: Readonly<Record<number, Verdict>>;
  /** Totals as they stood when `current` began, for `restartRhythm`. */
  readonly checkpoint: Tally;
  /** Accuracy of the last rhythms, newest last, at most 2. */
  readonly recentAccuracy: readonly number[];
  readonly completed: number;
  readonly missesByLevel: Readonly<Record<number, number>>;
  readonly onsetsPlayed: number;
  readonly history: readonly RhythmRecord[];
  readonly result: GameResult | null;
}

export interface Step {
  state: GameState;
  events: GameEvent[];
}

const ZERO_TALLY: Tally = { score: 0, streak: 0, bestStreak: 0, perfects: 0, closes: 0, misses: 0, extraTaps: 0 };

function tallyOf(s: Tally): Tally {
  return {
    score: s.score,
    streak: s.streak,
    bestStreak: s.bestStreak,
    perfects: s.perfects,
    closes: s.closes,
    misses: s.misses,
    extraTaps: s.extraTaps,
  };
}

function newRhythm(config: TapItConfig, level: number, rng: Rng, previous?: TapRhythm): TapRhythm {
  const r = generateRhythm(level, rng, previous ? rhythmKey(previous.time, previous.bars) : undefined);
  return config.practice ? { ...r, bpm: PRACTICE_BPM } : r;
}

export function createGame(config: Partial<TapItConfig> | TapItConfig, rng: Rng): GameState {
  const cfg = resolveConfig(config);
  return {
    ...ZERO_TALLY,
    config: cfg,
    rng,
    phase: 'playing',
    elapsedMs: 0,
    level: cfg.startLevel,
    maxLevel: cfg.startLevel,
    current: newRhythm(cfg, cfg.startLevel, rng),
    rhythmNumber: 1,
    judged: {},
    checkpoint: { ...ZERO_TALLY },
    recentAccuracy: [],
    completed: 0,
    missesByLevel: {},
    onsetsPlayed: 0,
    history: [],
    result: null,
  };
}

/** Milliseconds left on the round clock (never negative); null in practice. */
export function timeLeftMs(state: GameState): number | null {
  if (state.config.practice) return null;
  return Math.max(0, state.config.roundSeconds * 1000 - state.elapsedMs);
}

export function isTimeUp(state: GameState): boolean {
  return !state.config.practice && state.elapsedMs >= state.config.roundSeconds * 1000;
}

/** Advance the round clock. Does nothing in practice or once finished. */
export function tick(state: GameState, dtMs: number): Step {
  if (state.phase === 'finished' || state.config.practice || !(dtMs > 0)) return { state, events: [] };
  return { state: { ...state, elapsedMs: state.elapsedMs + dtMs }, events: [] };
}

/** One onset of the current rhythm has been judged by the pad. Repeats and unknown indexes are ignored. */
export function judge(state: GameState, index: number, verdict: Verdict): Step {
  if (
    state.phase === 'finished' ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.current.onsets ||
    state.judged[index] !== undefined
  ) {
    return { state, events: [] };
  }
  const judged = { ...state.judged, [index]: verdict };
  const scoring = !state.config.practice;
  if (verdict === 'miss') {
    const next: GameState = { ...state, judged, misses: state.misses + 1, streak: 0 };
    return { state: next, events: [{ type: 'miss', index }] };
  }
  const multiplier = multiplierForStreak(state.streak);
  const points = scoring ? POINTS[verdict] * multiplier : 0;
  const streak = state.streak + 1;
  const next: GameState = {
    ...state,
    judged,
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    perfects: state.perfects + (verdict === 'perfect' ? 1 : 0),
    closes: state.closes + (verdict === 'close' ? 1 : 0),
  };
  return { state: next, events: [{ type: 'hit', index, verdict, points, multiplier, streak }] };
}

/** A tap that matched no onset: resets the streak, takes no points. */
export function extraTap(state: GameState): Step {
  if (state.phase === 'finished') return { state, events: [] };
  return { state: { ...state, streak: 0, extraTaps: state.extraTaps + 1 }, events: [{ type: 'extra' }] };
}

/** Throw away what was judged in the current rhythm (it was interrupted) so it can be played again. */
export function restartRhythm(state: GameState): GameState {
  if (state.phase === 'finished') return state;
  return { ...state, ...state.checkpoint, judged: {} };
}

export function weakestLevel(missesByLevel: Readonly<Record<number, number>>): number | null {
  let best: number | null = null;
  let most = 0;
  for (const [key, count] of Object.entries(missesByLevel)) {
    const level = Number(key);
    if (count > most || (count === most && count > 0 && best !== null && level > best)) {
      most = count;
      best = level;
    }
  }
  return most > 0 ? best : null;
}

export function buildResult(state: GameState): GameResult {
  const hits = state.perfects + state.closes;
  const weakLevel = weakestLevel(state.missesByLevel);
  return {
    score: state.score,
    accuracy: state.onsetsPlayed === 0 ? 0 : hits / state.onsetsPlayed,
    bestStreak: state.bestStreak,
    maxLevel: state.maxLevel,
    rhythms: state.completed,
    onsets: state.onsetsPlayed,
    perfects: state.perfects,
    closes: state.closes,
    misses: state.misses,
    extraTaps: state.extraTaps,
    weakLevel,
    practise: weakLevel === null ? null : `Practise ${levelSpec(weakLevel).focus}`,
    practice: state.config.practice,
  };
}

/**
 * The pad has finished the current rhythm. Onsets nobody judged count as misses. Scores the
 * bonus, adapts the level, then either finishes the round (time is up, or practice is done)
 * or prepares the next rhythm.
 */
export function completeRhythm(state: GameState): Step {
  if (state.phase === 'finished') return { state, events: [] };
  const events: GameEvent[] = [];
  let s = state;
  for (let i = 0; i < s.current.onsets; i += 1) {
    if (s.judged[i] === undefined) {
      const step = judge(s, i, 'miss');
      s = step.state;
      events.push(...step.events);
    }
  }
  const before = s.checkpoint;
  const perfect = s.perfects - before.perfects;
  const close = s.closes - before.closes;
  const miss = s.misses - before.misses;
  const onsets = s.current.onsets;
  const scoring = !s.config.practice;
  const bonus = scoring && perfect === onsets ? PERFECT_RHYTHM_BONUS : 0;
  const accuracy = (perfect + close) / onsets;
  const record: RhythmRecord = {
    number: s.rhythmNumber,
    level: s.level,
    onsets,
    perfect,
    close,
    miss,
    accuracy,
    bonus,
    points: s.score - before.score + bonus,
  };
  events.push({ type: 'rhythmDone', record });
  s = {
    ...s,
    score: s.score + bonus,
    completed: s.completed + 1,
    onsetsPlayed: s.onsetsPlayed + onsets,
    missesByLevel: miss > 0 ? { ...s.missesByLevel, [s.level]: (s.missesByLevel[s.level] ?? 0) + miss } : s.missesByLevel,
    history: [...s.history, record],
  };

  // Adapt the level (never in practice).
  let level = s.level;
  let recentAccuracy = [...s.recentAccuracy, accuracy].slice(-2);
  if (scoring && recentAccuracy.length === 2) {
    if (recentAccuracy.every((a) => a >= LEVEL_UP_ACCURACY) && level < MAX_LEVEL) {
      level += 1;
      recentAccuracy = [];
      events.push({ type: 'levelUp', level });
    } else if (recentAccuracy.every((a) => a < LEVEL_DOWN_BELOW) && level > MIN_LEVEL) {
      level -= 1;
      recentAccuracy = [];
      events.push({ type: 'levelDown', level });
    }
  }
  s = { ...s, level, maxLevel: Math.max(s.maxLevel, level), recentAccuracy };

  const over = s.config.practice ? s.completed >= s.config.practiceRhythms : isTimeUp(s);
  if (over) {
    const done: GameState = { ...s, phase: 'finished' };
    const result = buildResult(done);
    events.push({ type: 'finished', result });
    return { state: { ...done, result }, events };
  }
  const current = newRhythm(s.config, level, s.rng, s.current);
  return {
    state: {
      ...s,
      current,
      rhythmNumber: s.rhythmNumber + 1,
      judged: {},
      checkpoint: tallyOf(s),
    },
    events,
  };
}
