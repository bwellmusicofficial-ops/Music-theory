/**
 * Note Rush: pure game engine.
 *
 * No React, no timers, no DOM. Time only moves when the caller passes
 * `dtMs` to `tick`. Randomness only comes from the injected `Rng`.
 *
 * Shape: `createGame(config, rng)` returns a state; `tick(state, dtMs)` and
 * `answer(state, guess)` each return `{ state, events }` and never mutate
 * their input (the Rng held inside the state is the one stateful part).
 *
 * Rules, with the numbers a test can check by hand:
 *
 * - Lane: a note's `x` runs from 1 (just spawned, right edge) to 0 (on the
 *   target line). It moves `dt / travelMs(level)` per step; reaching 0 is a miss.
 * - Spawn: the first note appears on the first tick, then every
 *   `spawnMs(level)`. A note that spawns part-way through a step is placed
 *   `overshoot / travelMs` further left so that timing never depends on how
 *   frames fall. Never the same pitch twice in a row (unless the pool has one
 *   position).
 * - Score: `(10 + speedBonus) * multiplier`. `speedBonus = floor(10 * x)` at the
 *   moment of the answer (0 in untimed mode). `multiplier = min(4, 1 +
 *   floor(streak / 5))` using the streak before this answer, so answers 1-5 are
 *   x1, 6-10 x2, 11-15 x3 and 16+ x4.
 * - Adaptive level (1..8), judged after every outcome (correct, wrong or miss):
 *   up when 8 correct answers have been given since the last level change AND
 *   at least 85% of the last 10 outcomes were correct; down when 3 or more of
 *   the last 6 outcomes were wrong or missed. A change clears the recent window.
 * - Pool: positions `range.low..range.high` (default 0..8, the five lines and
 *   four spaces), widened by level 3 -> 2, 5 -> 4, 7 -> 6 positions each way
 *   (one, two and three ledger lines) when `widenRange` is true.
 * - Untimed: nothing moves, one note at a time, the round ends once
 *   `untimedNotes` notes have been answered correctly. Wrong answers keep the note.
 * - Nothing here ever ends a round early or removes a learner's chance to
 *   continue: there are no lives.
 */
import { pitch } from '@/engine/pitch';
import type { Letter, Pitch, Rng } from '@/engine/types';

export type RushClef = 'treble' | 'bass';
export type AnswerMode = 'letters' | 'keyboard';

/** Inclusive range of stave positions (0 = bottom line, 8 = top line, negative = below). */
export interface PositionRange {
  low: number;
  high: number;
}

export interface NoteRushConfig {
  clef: RushClef;
  range: PositionRange;
  /** Round length in seconds (timed mode). */
  roundSeconds: number;
  answerMode: AnswerMode;
  /** Notes do not move; one at a time; round ends after `untimedNotes`. */
  untimed: boolean;
  untimedNotes: number;
  startLevel: number;
  /** Let higher levels add ledger lines to the pool. */
  widenRange: boolean;
}

export const DEFAULT_CONFIG: NoteRushConfig = {
  clef: 'treble',
  range: { low: 0, high: 8 },
  roundSeconds: 90,
  answerMode: 'letters',
  untimed: false,
  untimedNotes: 20,
  startLevel: 1,
  widenRange: true,
};

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 8;
export const BASE_POINTS = 10;
export const MAX_SPEED_BONUS = 10;
export const STREAK_STEP = 5;
export const MAX_MULTIPLIER = 4;
export const LEVEL_UP_CORRECT = 8;
export const LEVEL_UP_ACCURACY = 0.85;
export const ACCURACY_WINDOW = 10;
export const FAIL_WINDOW = 6;
export const FAIL_LIMIT = 3;
/** Longest slice of time simulated in one go, so big `dtMs` values stay faithful. */
export const MAX_STEP_MS = 50;
/** Tolerance so that floating-point drift never delays a miss by a whole step. */
const EPS = 1e-9;
/** Widest widening: three ledger lines each way, matching the stave's own default range. */
export const MAX_EXTRA_POSITIONS = 6;

export interface LevelParams {
  /** Time for a note to cross the lane, in ms. */
  travelMs: number;
  /** Time between spawns, in ms. */
  spawnMs: number;
  /** Positions added below the low end and above the high end. */
  extra: number;
}

const LEVELS: readonly LevelParams[] = [
  { travelMs: 8000, spawnMs: 3000, extra: 0 },
  { travelMs: 7000, spawnMs: 2700, extra: 0 },
  { travelMs: 6200, spawnMs: 2400, extra: 2 },
  { travelMs: 5500, spawnMs: 2100, extra: 2 },
  { travelMs: 4800, spawnMs: 1850, extra: 4 },
  { travelMs: 4200, spawnMs: 1600, extra: 4 },
  { travelMs: 3700, spawnMs: 1400, extra: 6 },
  { travelMs: 3200, spawnMs: 1200, extra: 6 },
];

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

export function levelParams(level: number): LevelParams {
  return LEVELS[clampLevel(level) - 1];
}

/** Score multiplier for a given count of consecutive correct answers. */
export function multiplierForStreak(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, streak) / STREAK_STEP));
}

export function resolveConfig(partial?: Partial<NoteRushConfig>): NoteRushConfig {
  const merged: NoteRushConfig = { ...DEFAULT_CONFIG, ...stripUndefined(partial ?? {}) };
  let { low, high } = merged.range;
  low = Math.round(low);
  high = Math.round(high);
  if (low > high) [low, high] = [high, low];
  return {
    ...merged,
    range: { low, high },
    roundSeconds: merged.roundSeconds > 0 ? merged.roundSeconds : DEFAULT_CONFIG.roundSeconds,
    untimedNotes: merged.untimedNotes >= 1 ? Math.floor(merged.untimedNotes) : DEFAULT_CONFIG.untimedNotes,
    startLevel: clampLevel(merged.startLevel),
  };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** The stave positions notes may use at a level, lowest first. */
export function poolForLevel(config: NoteRushConfig, level: number): number[] {
  const extra = config.widenRange ? levelParams(level).extra : 0;
  const out: number[] = [];
  for (let p = config.range.low - extra; p <= config.range.high + extra; p++) out.push(p);
  return out;
}

/** The widest pool the game can reach, for sizing the stave once. */
export function widestRange(config: NoteRushConfig): PositionRange {
  const extra = config.widenRange ? MAX_EXTRA_POSITIONS : 0;
  return { low: config.range.low - extra, high: config.range.high + extra };
}

// --- state ---------------------------------------------------------------------------

export interface FlyingNote {
  id: number;
  pitch: Pitch;
  letter: Letter;
  position: number;
  /** 1 at spawn, 0 on the target line. Always 1 in untimed mode. */
  x: number;
  wrongGuesses: number;
}

export interface PitchMistake {
  pitch: Pitch;
  /** ASCII form, e.g. "G4". */
  key: string;
  wrong: number;
  missed: number;
  total: number;
}

export interface GameResult {
  score: number;
  correct: number;
  wrong: number;
  missed: number;
  /** correct / (correct + wrong + missed), 0 when nothing happened. */
  accuracy: number;
  bestStreak: number;
  maxLevel: number;
  /** Most mistakes first, ties by lower pitch first. */
  mistakes: PitchMistake[];
  untimed: boolean;
}

export type GameEvent =
  | {
      type: 'correct';
      noteId: number;
      letter: Letter;
      points: number;
      speedBonus: number;
      multiplier: number;
      streak: number;
    }
  /** The correct name is deliberately absent. */
  | { type: 'wrong'; noteId: number; guess: Letter | null }
  | { type: 'miss'; noteId: number; letter: Letter; pitch: Pitch }
  | { type: 'levelUp'; level: number }
  | { type: 'levelDown'; level: number }
  | { type: 'finished'; result: GameResult };

export type GameEventType = GameEvent['type'];

export interface GameState {
  readonly config: NoteRushConfig;
  readonly rng: Rng;
  readonly phase: 'playing' | 'finished';
  readonly elapsedMs: number;
  /** Null in untimed mode. */
  readonly timeLeftMs: number | null;
  /** Oldest (leftmost, the one an answer applies to) first. */
  readonly notes: readonly FlyingNote[];
  readonly nextId: number;
  readonly spawnInMs: number;
  readonly lastPosition: number | null;
  readonly score: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly correct: number;
  readonly wrong: number;
  readonly missed: number;
  readonly level: number;
  readonly maxLevel: number;
  /** Last outcomes, true = correct, newest last, at most ACCURACY_WINDOW long. */
  readonly recent: readonly boolean[];
  readonly correctSinceLevel: number;
  readonly mistakes: Readonly<Record<string, PitchMistake>>;
  readonly result: GameResult | null;
}

export interface Step {
  state: GameState;
  events: GameEvent[];
}

export function createGame(config: Partial<NoteRushConfig> | NoteRushConfig, rng: Rng): GameState {
  const cfg = resolveConfig(config);
  const base: GameState = {
    config: cfg,
    rng,
    phase: 'playing',
    elapsedMs: 0,
    timeLeftMs: cfg.untimed ? null : cfg.roundSeconds * 1000,
    notes: [],
    nextId: 1,
    spawnInMs: 0,
    lastPosition: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    missed: 0,
    level: cfg.startLevel,
    maxLevel: cfg.startLevel,
    recent: [],
    correctSinceLevel: 0,
    mistakes: {},
    result: null,
  };
  return cfg.untimed ? spawnNote(base, 1) : base;
}

export function leadingNote(state: GameState): FlyingNote | null {
  return state.notes[0] ?? null;
}

export function buildResult(state: GameState): GameResult {
  const attempts = state.correct + state.wrong + state.missed;
  const mistakes = Object.values(state.mistakes).sort(
    (a, b) => b.total - a.total || pitch.toMidi(a.pitch) - pitch.toMidi(b.pitch),
  );
  return {
    score: state.score,
    correct: state.correct,
    wrong: state.wrong,
    missed: state.missed,
    accuracy: attempts === 0 ? 0 : state.correct / attempts,
    bestStreak: state.bestStreak,
    maxLevel: state.maxLevel,
    mistakes,
    untimed: state.config.untimed,
  };
}

// --- internals ---------------------------------------------------------------------------

function spawnNote(state: GameState, x: number): GameState {
  const pool = poolForLevel(state.config, state.level);
  const candidates = pool.length > 1 ? pool.filter((p) => p !== state.lastPosition) : pool;
  const position = state.rng.pick(candidates);
  const p = pitch.pitchAtStavePosition(position, state.config.clef);
  const note: FlyingNote = {
    id: state.nextId,
    pitch: p,
    letter: p.letter,
    position,
    x,
    wrongGuesses: 0,
  };
  return { ...state, notes: [...state.notes, note], nextId: state.nextId + 1, lastPosition: position };
}

function addMistake(
  mistakes: Readonly<Record<string, PitchMistake>>,
  p: Pitch,
  kind: 'wrong' | 'missed',
): Record<string, PitchMistake> {
  const key = pitch.formatPitch(p);
  const prev = mistakes[key] ?? { pitch: p, key, wrong: 0, missed: 0, total: 0 };
  return { ...mistakes, [key]: { ...prev, [kind]: prev[kind] + 1, total: prev.total + 1 } };
}

/** Records an outcome in the recent window and applies a level change if one is earned. */
function recordOutcome(state: GameState, correct: boolean, events: GameEvent[]): GameState {
  const recent = [...state.recent, correct].slice(-ACCURACY_WINDOW);
  const correctSinceLevel = state.correctSinceLevel + (correct ? 1 : 0);
  const failures = recent.slice(-FAIL_WINDOW).filter((c) => !c).length;
  if (failures >= FAIL_LIMIT && state.level > MIN_LEVEL) {
    const level = state.level - 1;
    events.push({ type: 'levelDown', level });
    return { ...state, level, recent: [], correctSinceLevel: 0 };
  }
  const accuracy = recent.filter(Boolean).length / recent.length;
  if (
    correctSinceLevel >= LEVEL_UP_CORRECT &&
    accuracy >= LEVEL_UP_ACCURACY &&
    state.level < MAX_LEVEL
  ) {
    const level = state.level + 1;
    events.push({ type: 'levelUp', level });
    return { ...state, level, maxLevel: Math.max(state.maxLevel, level), recent: [], correctSinceLevel: 0 };
  }
  return { ...state, recent, correctSinceLevel };
}

function finish(state: GameState, events: GameEvent[]): GameState {
  const done: GameState = { ...state, phase: 'finished' };
  const result = buildResult(done);
  events.push({ type: 'finished', result });
  return { ...done, result };
}

function advance(input: GameState, stepMs: number, events: GameEvent[]): GameState {
  let state: GameState = {
    ...input,
    elapsedMs: input.elapsedMs + stepMs,
    timeLeftMs: (input.timeLeftMs ?? 0) - stepMs,
  };
  const travel = levelParams(state.level).travelMs;
  state = { ...state, notes: state.notes.map((n) => ({ ...n, x: n.x - stepMs / travel })) };

  // Misses, oldest first.
  while (state.notes.length > 0 && state.notes[0].x <= EPS) {
    const [gone, ...rest] = state.notes;
    events.push({ type: 'miss', noteId: gone.id, letter: gone.letter, pitch: gone.pitch });
    state = {
      ...state,
      notes: rest,
      streak: 0,
      missed: state.missed + 1,
      mistakes: addMistake(state.mistakes, gone.pitch, 'missed'),
    };
    state = recordOutcome(state, false, events);
  }

  if ((state.timeLeftMs ?? 0) <= 0) return finish({ ...state, timeLeftMs: 0 }, events);

  // Spawn.
  let spawnIn = state.spawnInMs - stepMs;
  if (spawnIn <= 0) {
    const { travelMs, spawnMs } = levelParams(state.level);
    state = spawnNote(state, 1 + spawnIn / travelMs);
    spawnIn += spawnMs;
  }
  return { ...state, spawnInMs: spawnIn };
}

// --- public steps --------------------------------------------------------------------------

/** Advance the clock. Large `dtMs` is simulated in slices of at most MAX_STEP_MS. */
export function tick(state: GameState, dtMs: number): Step {
  const events: GameEvent[] = [];
  if (state.phase === 'finished' || state.config.untimed || !(dtMs > 0)) return { state, events };
  let remaining = Math.min(dtMs, state.timeLeftMs ?? 0);
  let current = state;
  while (remaining > 0 && current.phase === 'playing') {
    const slice = Math.min(MAX_STEP_MS, remaining);
    current = advance(current, slice, events);
    remaining -= slice;
  }
  return { state: current, events };
}

/**
 * Answer the leading note. `guess` is a letter name, or null for a press that
 * cannot be a natural note name (a black key), which is simply wrong.
 */
export function answer(state: GameState, guess: Letter | null): Step {
  const events: GameEvent[] = [];
  const lead = state.notes[0];
  if (state.phase === 'finished' || !lead) return { state, events };

  if (guess !== lead.letter) {
    events.push({ type: 'wrong', noteId: lead.id, guess });
    let next: GameState = {
      ...state,
      notes: [{ ...lead, wrongGuesses: lead.wrongGuesses + 1 }, ...state.notes.slice(1)],
      streak: 0,
      wrong: state.wrong + 1,
      mistakes: addMistake(state.mistakes, lead.pitch, 'wrong'),
    };
    next = recordOutcome(next, false, events);
    return { state: next, events };
  }

  const multiplier = multiplierForStreak(state.streak);
  const speedBonus = state.config.untimed ? 0 : Math.floor(MAX_SPEED_BONUS * Math.min(1, Math.max(0, lead.x)) + EPS);
  const points = (BASE_POINTS + speedBonus) * multiplier;
  const streak = state.streak + 1;
  events.push({ type: 'correct', noteId: lead.id, letter: lead.letter, points, speedBonus, multiplier, streak });
  let next: GameState = {
    ...state,
    notes: state.notes.slice(1),
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correct: state.correct + 1,
  };
  next = recordOutcome(next, true, events);
  if (next.config.untimed) {
    if (next.correct >= next.config.untimedNotes) return { state: finish(next, events), events };
    next = spawnNote(next, 1);
  }
  return { state: next, events };
}
