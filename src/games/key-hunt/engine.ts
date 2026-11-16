/**
 * Key Hunt: pure game engine.
 *
 * No React, no timers, no DOM. Time only moves when the caller passes `dtMs` to `tick`.
 * Randomness only comes from the injected `Rng`. Every step returns `{ state, events }` and
 * never mutates its input (the Rng held inside the state is the one stateful part).
 *
 * Rules, with the numbers a test can check by hand:
 *
 * - One question at a time (see `questions.ts`). A question has a time bar:
 *   `questionMs(level)`, from 8 s at level 1 down to 3 s at level 8. Untimed mode has no bar.
 * - Score on a correct answer: `(10 + speedBonus) * multiplier`. `speedBonus = floor(10 *
 *   timeLeft / questionMs)` (0 in untimed mode). `multiplier = min(4, 1 + floor(streak / 5))`
 *   using the streak before this answer: answers 1-5 are x1, 6-10 x2, 11-15 x3, 16+ x4.
 * - A wrong answer or a timeout resets the streak, shows the right answer and its reason
 *   for `REVEAL_MS` (untimed: until `next`), then moves on. It never ends the game.
 * - A correct answer moves straight on to the next question.
 * - The same key is never asked twice in a row.
 * - Adaptive level (1..8), judged after every outcome: up when 5 answers have been correct
 *   since the last level change and at least 80% of the last 6 outcomes were correct; down
 *   when 3 or more of the last 5 outcomes were wrong or timed out. A change clears the window.
 * - Timed round: `roundSeconds` on a clock that also runs during the reveal; the round ends
 *   when it reaches 0. Untimed round: ends after `untimedQuestions` questions have been
 *   answered (right or wrong).
 */
import type { Clef, Key, Rng } from '@/engine/types';
import { pitch } from '@/engine/pitch';
import { DEFAULT_GRADE, gradePool, poolKeys, type GradeId } from './pools';
import { buildQuestion, keyId, type AskMode, type Question, type QuestionKind } from './questions';

export interface KeyHuntConfig {
  mode: AskMode;
  grade: GradeId;
  /** Round length in seconds (timed mode). */
  roundSeconds: number;
  untimed: boolean;
  untimedQuestions: number;
  startLevel: number;
}

export const DEFAULT_CONFIG: KeyHuntConfig = {
  mode: 'sig-to-key',
  grade: DEFAULT_GRADE,
  roundSeconds: 60,
  untimed: false,
  untimedQuestions: 15,
  startLevel: 1,
};

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 8;
export const BASE_POINTS = 10;
export const MAX_SPEED_BONUS = 10;
export const STREAK_STEP = 5;
export const MAX_MULTIPLIER = 4;
export const LEVEL_UP_CORRECT = 5;
export const LEVEL_UP_ACCURACY = 0.8;
export const ACCURACY_WINDOW = 6;
export const FAIL_WINDOW = 5;
export const FAIL_LIMIT = 3;
export const REVEAL_MS = 2400;
const EPS = 1e-9;

/** Seconds on the time bar, level 1 to 8. */
const QUESTION_MS: readonly number[] = [8000, 7000, 6200, 5500, 4800, 4200, 3600, 3000];

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

export function questionMs(level: number): number {
  return QUESTION_MS[clampLevel(level) - 1] as number;
}

export function multiplierForStreak(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, streak) / STREAK_STEP));
}

export function resolveConfig(partial?: Partial<KeyHuntConfig>): KeyHuntConfig {
  const clean = Object.fromEntries(Object.entries(partial ?? {}).filter(([, v]) => v !== undefined)) as Partial<KeyHuntConfig>;
  const merged = { ...DEFAULT_CONFIG, ...clean };
  return {
    ...merged,
    roundSeconds: merged.roundSeconds > 0 ? merged.roundSeconds : DEFAULT_CONFIG.roundSeconds,
    untimedQuestions: merged.untimedQuestions >= 1 ? Math.floor(merged.untimedQuestions) : DEFAULT_CONFIG.untimedQuestions,
    startLevel: clampLevel(merged.startLevel),
  };
}

// --- state ---------------------------------------------------------------------------

export interface KeyMistake {
  key: Key;
  /** "G major". */
  name: string;
  /** Sharps (positive) or flats (negative). */
  signature: number;
  wrong: number;
  timedOut: number;
  total: number;
}

export interface GameResult {
  score: number;
  correct: number;
  wrong: number;
  timedOut: number;
  /** correct / (correct + wrong + timedOut), 0 when nothing was answered. */
  accuracy: number;
  bestStreak: number;
  maxLevel: number;
  /** Most mistakes first, ties by name. */
  mistakes: KeyMistake[];
  untimed: boolean;
}

export type Outcome = { correct: true } | { correct: false; picked: number | null };

export type GameEvent =
  | { type: 'correct'; points: number; speedBonus: number; multiplier: number; streak: number }
  | { type: 'wrong'; picked: number; correct: number; reason: string }
  | { type: 'timeout'; correct: number; reason: string }
  | { type: 'levelUp'; level: number }
  | { type: 'levelDown'; level: number }
  | { type: 'question'; number: number }
  | { type: 'finished'; result: GameResult };

export interface GameState {
  readonly config: KeyHuntConfig;
  readonly rng: Rng;
  readonly keys: readonly Key[];
  readonly phase: 'asking' | 'reveal' | 'finished';
  /** Null in untimed mode. */
  readonly roundLeftMs: number | null;
  readonly question: Question;
  /** 1-based number of `question`. */
  readonly questionNumber: number;
  /** Total time on this question's bar; null in untimed mode. */
  readonly questionTotalMs: number | null;
  readonly questionLeftMs: number | null;
  /** In the reveal: time left before moving on (null when the learner must press next, or not revealing). */
  readonly revealLeftMs: number | null;
  /** What the learner did on the question being revealed. */
  readonly outcome: Outcome | null;
  readonly score: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly correct: number;
  readonly wrong: number;
  readonly timedOut: number;
  readonly level: number;
  readonly maxLevel: number;
  readonly recent: readonly boolean[];
  readonly correctSinceLevel: number;
  readonly mistakes: Readonly<Record<string, KeyMistake>>;
  readonly lastKind: QuestionKind | null;
  readonly lastClef: Clef | null;
  readonly result: GameResult | null;
}

export interface Step {
  state: GameState;
  events: GameEvent[];
}

function withQuestion(state: GameState, number: number): GameState {
  const question = buildQuestion(
    state.config.mode,
    { keys: state.keys, level: state.level, lastKey: number === 1 ? null : state.question.key, lastKind: state.lastKind, lastClef: state.lastClef },
    state.rng,
  );
  const total = state.config.untimed ? null : questionMs(state.level);
  return {
    ...state,
    phase: 'asking',
    question,
    questionNumber: number,
    questionTotalMs: total,
    questionLeftMs: total,
    revealLeftMs: null,
    outcome: null,
    lastKind: question.kind,
    lastClef: question.kind === 'sig-to-key' || question.kind === 'key-to-sig' ? question.clef : state.lastClef,
  };
}

export function createGame(config: Partial<KeyHuntConfig> | KeyHuntConfig, rng: Rng): GameState {
  const cfg = resolveConfig(config);
  const keys = poolKeys(gradePool(cfg.grade));
  const blank = {
    config: cfg,
    rng,
    keys,
    phase: 'asking' as const,
    roundLeftMs: cfg.untimed ? null : cfg.roundSeconds * 1000,
    questionNumber: 0,
    questionTotalMs: null,
    questionLeftMs: null,
    revealLeftMs: null,
    outcome: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    timedOut: 0,
    level: cfg.startLevel,
    maxLevel: cfg.startLevel,
    recent: [],
    correctSinceLevel: 0,
    mistakes: {},
    lastKind: null,
    lastClef: null,
    result: null,
  };
  // The first question is built by withQuestion; a placeholder satisfies the type until then.
  return withQuestion({ ...blank, question: undefined as unknown as Question }, 1);
}

export function buildResult(state: GameState): GameResult {
  const attempts = state.correct + state.wrong + state.timedOut;
  const mistakes = Object.values(state.mistakes).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return {
    score: state.score,
    correct: state.correct,
    wrong: state.wrong,
    timedOut: state.timedOut,
    accuracy: attempts === 0 ? 0 : state.correct / attempts,
    bestStreak: state.bestStreak,
    maxLevel: state.maxLevel,
    mistakes,
    untimed: state.config.untimed,
  };
}

// --- internals ---------------------------------------------------------------------------

function addMistake(mistakes: Readonly<Record<string, KeyMistake>>, key: Key, kind: 'wrong' | 'timedOut'): Record<string, KeyMistake> {
  const id = keyId(key);
  const prev = mistakes[id] ?? { key, name: id, signature: pitch.keySignature(key), wrong: 0, timedOut: 0, total: 0 };
  return { ...mistakes, [id]: { ...prev, [kind]: prev[kind] + 1, total: prev.total + 1 } };
}

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
  if (correctSinceLevel >= LEVEL_UP_CORRECT && accuracy >= LEVEL_UP_ACCURACY - EPS && state.level < MAX_LEVEL) {
    const level = state.level + 1;
    events.push({ type: 'levelUp', level });
    return { ...state, level, maxLevel: Math.max(state.maxLevel, level), recent: [], correctSinceLevel: 0 };
  }
  return { ...state, recent, correctSinceLevel };
}

function finish(state: GameState, events: GameEvent[]): GameState {
  const done: GameState = { ...state, phase: 'finished', roundLeftMs: state.roundLeftMs === null ? null : Math.max(0, state.roundLeftMs) };
  const result = buildResult(done);
  events.push({ type: 'finished', result });
  return { ...done, result };
}

/** Untimed rounds end once enough questions have been answered. */
function untimedDone(state: GameState): boolean {
  return state.config.untimed && state.correct + state.wrong + state.timedOut >= state.config.untimedQuestions;
}

function moveOn(state: GameState, events: GameEvent[]): GameState {
  if (untimedDone(state)) return finish(state, events);
  const next = withQuestion(state, state.questionNumber + 1);
  events.push({ type: 'question', number: next.questionNumber });
  return next;
}

function failQuestion(state: GameState, picked: number | null, events: GameEvent[]): GameState {
  const q = state.question;
  if (picked === null) events.push({ type: 'timeout', correct: q.correct, reason: q.reason });
  else events.push({ type: 'wrong', picked, correct: q.correct, reason: q.reason });
  let next: GameState = {
    ...state,
    phase: 'reveal',
    streak: 0,
    wrong: state.wrong + (picked === null ? 0 : 1),
    timedOut: state.timedOut + (picked === null ? 1 : 0),
    mistakes: addMistake(state.mistakes, q.key, picked === null ? 'timedOut' : 'wrong'),
    outcome: { correct: false, picked },
    questionLeftMs: picked === null ? 0 : state.questionLeftMs,
    revealLeftMs: state.config.untimed ? null : REVEAL_MS,
  };
  next = recordOutcome(next, false, events);
  return next;
}

// --- public steps --------------------------------------------------------------------------

/** Advance the clocks. Does nothing in untimed mode or once finished. */
export function tick(state: GameState, dtMs: number): Step {
  const events: GameEvent[] = [];
  if (state.phase === 'finished' || state.config.untimed || !(dtMs > 0)) return { state, events };
  let remaining = dtMs;
  let s = state;
  while (remaining > EPS && s.phase !== 'finished') {
    const roundLeft = s.roundLeftMs ?? 0;
    const phaseLeft = s.phase === 'asking' ? (s.questionLeftMs ?? Infinity) : (s.revealLeftMs ?? Infinity);
    const slice = Math.min(remaining, roundLeft, phaseLeft);
    remaining -= slice;
    s = {
      ...s,
      roundLeftMs: roundLeft - slice,
      questionLeftMs: s.phase === 'asking' && s.questionLeftMs !== null ? s.questionLeftMs - slice : s.questionLeftMs,
      revealLeftMs: s.phase === 'reveal' && s.revealLeftMs !== null ? s.revealLeftMs - slice : s.revealLeftMs,
    };
    if ((s.roundLeftMs ?? 0) <= EPS) {
      s = finish(s, events);
    } else if (s.phase === 'asking' && (s.questionLeftMs ?? 1) <= EPS) {
      s = failQuestion(s, null, events);
    } else if (s.phase === 'reveal' && s.revealLeftMs !== null && s.revealLeftMs <= EPS) {
      s = moveOn(s, events);
    }
  }
  return { state: s, events };
}

/** The learner picked option `index` (0-based). Ignored unless a question is open. */
export function answer(state: GameState, index: number): Step {
  const events: GameEvent[] = [];
  if (state.phase !== 'asking' || !Number.isInteger(index) || index < 0 || index >= state.question.options.length) {
    return { state, events };
  }
  if (index !== state.question.correct) return { state: failQuestion(state, index, events), events };

  const multiplier = multiplierForStreak(state.streak);
  const fraction = state.questionTotalMs && state.questionLeftMs !== null ? Math.min(1, Math.max(0, state.questionLeftMs / state.questionTotalMs)) : 0;
  const speedBonus = state.config.untimed ? 0 : Math.floor(MAX_SPEED_BONUS * fraction + EPS);
  const points = (BASE_POINTS + speedBonus) * multiplier;
  const streak = state.streak + 1;
  events.push({ type: 'correct', points, speedBonus, multiplier, streak });
  let next: GameState = {
    ...state,
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correct: state.correct + 1,
  };
  next = recordOutcome(next, true, events);
  return { state: moveOn(next, events), events };
}

/** Leave the reveal now (the learner pressed Next, or the untimed round is waiting for them). */
export function next(state: GameState): Step {
  const events: GameEvent[] = [];
  if (state.phase !== 'reveal') return { state, events };
  return { state: moveOn(state, events), events };
}
