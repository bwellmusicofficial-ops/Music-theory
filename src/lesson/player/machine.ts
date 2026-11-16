/**
 * The lesson player's state machine: a pure reducer with no React and no clock.
 * Every action carries `now` (ms since the epoch) so behaviour is reproducible.
 *
 * Rules (from schema.ts and the authoring guide):
 * - Practice: one question at a time. A first wrong answer shows the hint and
 *   gives a second attempt; the second result stands. A question without a
 *   hint gets no second attempt. Practice never blocks progress.
 * - Challenge: `count` questions sampled from the pool by a seeded shuffle
 *   (see `drawChallengeQuestions`). A `seconds` timer runs from Start unless the round is untimed. When time runs
 *   out, unanswered questions count as wrong. No hints, one attempt each. Pass
 *   when correct/total >= passMark. The result screen offers retry or continue.
 * - Replay: bestScore never goes down, and a completed lesson stays complete.
 * - Every answer given (including a first wrong practice answer) is one
 *   AttemptEvent. Skipped and timed-out questions give no event.
 */

import { createRng } from '@/engine/rng';
import type { Terminology } from '@/engine/types';
import type { AttemptEvent, GeneratorRegistry, LessonProgress, LessonState, MarkResult } from '../contracts';
import { STEP_ORDER, type Lesson, type Question, type QuestionTypeId, type StepId } from '../schema';

// --- types -----------------------------------------------------------------------

export interface MachineContext {
  lesson: Lesson;
  generators: GeneratorRegistry;
  terminology: Terminology;
}

/** A question ready to show: generated ones already drawn with a stored seed. */
export interface ResolvedQuestion {
  /** Position in its list (practice index, or challenge slot). */
  slot: number;
  questionId: string;
  skill: string;
  type: QuestionTypeId;
  payload: unknown;
  prompt: string;
  hint?: string;
  /** Present for generated questions. */
  seed?: number;
  /** Set when the question could not be built (unknown generator, bad params). */
  error?: string;
}

export type QuestionPhase = 'answering' | 'feedback';
/** 'retry' is a first wrong answer that earned a hint and a second attempt. */
export type QuestionOutcome = 'correct' | 'wrong' | 'retry' | 'skipped';

export interface QuestionRun {
  phase: QuestionPhase;
  attempt: 1 | 2;
  startedAt: number;
  result: MarkResult | null;
  outcome: QuestionOutcome | null;
}

export interface PracticeState {
  items: ResolvedQuestion[];
  index: number;
  run: QuestionRun;
  /** Final outcome per question; null until settled. */
  outcomes: (QuestionOutcome | null)[];
}

export interface ChallengeResult {
  correct: number;
  total: number;
  fraction: number;
  passed: boolean;
  timedOut: boolean;
}

export type ChallengePhase = 'intro' | 'running' | 'result';

export interface ChallengeState {
  phase: ChallengePhase;
  timed: boolean;
  items: ResolvedQuestion[];
  index: number;
  run: QuestionRun;
  deadline: number | null;
  secondsLeft: number | null;
  /** true/false per slot, null while unanswered. */
  answers: (boolean | null)[];
  result: ChallengeResult | null;
}

export interface MachineState {
  lessonId: string;
  step: StepId;
  exploreInteracted: boolean;
  exploreNeedsInteraction: boolean;
  nameIndex: number;
  nameCount: number;
  alternativeShown: boolean;
  practice: PracticeState | null;
  challenge: ChallengeState;
  /** Passed the challenge now or in an earlier session. Never goes back to false. */
  completed: boolean;
  mastered: boolean;
  bestScore: number | null;
  /** Drawn from for generated-question seeds; increases on every draw. */
  attemptCounter: number;
  /** Every AttemptEvent made this session, in order. */
  events: AttemptEvent[];
}

export type Action =
  | { type: 'CONTINUE'; now: number }
  | { type: 'BACK'; now: number }
  | { type: 'SHOW_ALTERNATIVE' }
  | { type: 'EXPLORE_INTERACTED' }
  | { type: 'ANSWER'; result: MarkResult; now: number }
  | { type: 'SKIP'; now: number }
  | { type: 'START_CHALLENGE'; now: number; timed: boolean }
  | { type: 'RETRY_CHALLENGE'; now: number }
  | { type: 'TICK'; now: number };

// --- seeds and resolution ------------------------------------------------------------

/** FNV-1a over "lessonId:questionId:counter", as an unsigned 32-bit integer. */
export function deriveSeed(lessonId: string, questionId: string, counter: number): number {
  const text = `${lessonId}:${questionId}:${counter}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function resolveQuestion(
  ctx: MachineContext,
  q: Question,
  slot: number,
  counter: number,
): ResolvedQuestion {
  const base = { slot, questionId: q.id, skill: q.skill, hint: q.hint };
  if (q.source === 'authored') {
    return { ...base, type: q.type, payload: q.payload, prompt: q.prompt };
  }
  const seed = deriveSeed(ctx.lesson.id, q.id, counter);
  const failed = (error: string): ResolvedQuestion => ({
    ...base,
    type: q.type,
    payload: undefined,
    prompt: q.prompt,
    seed,
    error,
  });
  const generator = ctx.generators[q.generator.id];
  if (!generator) return failed(`No generator is registered with id "${q.generator.id}".`);
  const params = generator.paramsSchema.safeParse(q.generator.params);
  if (!params.success) {
    return failed(`Generator "${q.generator.id}" rejected its params: ${params.error.message}`);
  }
  try {
    const made = generator.generate(params.data, createRng(seed), ctx.terminology);
    return { ...base, type: made.type, payload: made.payload, prompt: made.prompt ?? q.prompt, seed };
  } catch (e) {
    return failed(`Generator "${q.generator.id}" threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Resolves a list, drawing one counter value per generated question. */
function resolveAll(
  ctx: MachineContext,
  questions: Question[],
  counter: number,
): { items: ResolvedQuestion[]; counter: number } {
  let c = counter;
  const items = questions.map((q, slot) => {
    const item = resolveQuestion(ctx, q, slot, c);
    if (q.source === 'generated') c += 1;
    return item;
  });
  return { items, counter: c };
}

/**
 * The questions for one challenge round: `count` entries sampled from `pool`.
 * The pool is shuffled with a seed from the lesson id and the attempt counter
 * and dealt out; no entry repeats until the whole pool has been dealt, then it
 * is shuffled again (with the next seed) and dealt on. When the pool has two or
 * more question types, the round always contains at least two of them.
 * Deterministic for the same arguments.
 */
export function drawChallengeQuestions(
  pool: readonly Question[],
  count: number,
  lessonId: string,
  attemptCounter: number,
): Question[] {
  const drawn: Question[] = [];
  for (let pass = 0; drawn.length < count; pass += 1) {
    const rng = createRng(deriveSeed(lessonId, 'challenge-draw', attemptCounter + pass));
    drawn.push(...rng.shuffle(pool));
  }
  drawn.length = count;
  const types = new Set(drawn.map((q) => q.type));
  if (types.size < 2) {
    // Only possible when count is below the pool size, so every entry of another type is still undrawn.
    const other = pool.find((q) => !types.has(q.type));
    if (other && drawn.length > 0) drawn[drawn.length - 1] = other;
  }
  return drawn;
}

// --- construction --------------------------------------------------------------------

function freshRun(now: number): QuestionRun {
  return { phase: 'answering', attempt: 1, startedAt: now, result: null, outcome: null };
}

function emptyChallenge(): ChallengeState {
  return {
    phase: 'intro',
    timed: false,
    items: [],
    index: 0,
    run: freshRun(0),
    deadline: null,
    secondsLeft: null,
    answers: [],
    result: null,
  };
}

export interface InitOptions {
  progress?: LessonProgress | null;
  /** Starting value for the seed counter. The player passes a time-derived value so replays differ. */
  attemptBase?: number;
  now?: number;
}

export function createInitialState(ctx: MachineContext, options: InitOptions = {}): MachineState {
  const { lesson } = ctx;
  const { progress = null, attemptBase = 0, now = 0 } = options;
  const mine = progress && progress.lessonId === lesson.id ? progress : null;
  const done = mine?.state === 'complete' || mine?.state === 'mastered';
  const explore = lesson.steps.explore;
  const base: MachineState = {
    lessonId: lesson.id,
    step: 'hook',
    exploreInteracted: false,
    exploreNeedsInteraction: !(explore.instrument === 'stave' && !explore.exhibit),
    nameIndex: 0,
    nameCount: lesson.steps.name.cards.length,
    alternativeShown: false,
    practice: null,
    challenge: emptyChallenge(),
    completed: done,
    mastered: mine?.state === 'mastered',
    bestScore:
      mine && typeof mine.bestScore === 'number' && Number.isFinite(mine.bestScore)
        ? Math.min(1, Math.max(0, mine.bestScore))
        : null,
    attemptCounter: attemptBase,
    events: [],
  };
  // Resume only an unfinished lesson. A finished one replays from the start.
  if (!mine || mine.state !== 'in-progress' || !STEP_ORDER.includes(mine.step)) return base;

  const step = mine.step;
  const state: MachineState = { ...base, step, exploreInteracted: STEP_ORDER.indexOf(step) > 1 };
  if (step === 'practice') {
    return enterPractice(state, ctx, mine.questionIndex, now);
  }
  return state;
}

function enterPractice(state: MachineState, ctx: MachineContext, index: number, now: number): MachineState {
  const { items, counter } = resolveAll(ctx, ctx.lesson.steps.practice.questions, state.attemptCounter);
  const i = Number.isFinite(index) ? Math.min(items.length - 1, Math.max(0, Math.trunc(index))) : 0;
  return {
    ...state,
    step: 'practice',
    attemptCounter: counter,
    practice: { items, index: i, run: freshRun(now), outcomes: items.map(() => null) },
  };
}

// --- events and derived values ---------------------------------------------------------

function makeEvent(
  state: MachineState,
  item: ResolvedQuestion,
  run: QuestionRun,
  result: MarkResult,
  now: number,
): AttemptEvent {
  const event: AttemptEvent = {
    lessonId: state.lessonId,
    step: state.step,
    questionId: item.questionId,
    skill: item.skill,
    type: item.type,
    correct: result.correct,
    score: Math.min(1, Math.max(0, result.score)),
    msTaken: Math.max(0, Math.round(now - run.startedAt)),
    at: new Date(now).toISOString(),
  };
  if (item.seed !== undefined) event.seed = item.seed;
  return event;
}

export function lessonStateOf(state: MachineState): LessonState {
  if (state.mastered) return 'mastered';
  if (state.completed) return 'complete';
  return 'in-progress';
}

export function toProgress(state: MachineState, now: number): LessonProgress {
  return {
    lessonId: state.lessonId,
    state: lessonStateOf(state),
    step: state.step,
    questionIndex: state.step === 'practice' && state.practice ? state.practice.index : 0,
    bestScore: state.bestScore,
    updatedAt: new Date(now).toISOString(),
  };
}

/** 0..1 across the six steps, for the thin progress bar. */
export function progressFraction(state: MachineState): number {
  const idx = STEP_ORDER.indexOf(state.step);
  let within = 0;
  switch (state.step) {
    case 'name':
      within = state.nameCount > 0 ? state.nameIndex / state.nameCount : 0;
      break;
    case 'practice': {
      const p = state.practice;
      if (p && p.items.length > 0) {
        const settled = p.run.phase === 'feedback' && p.run.outcome !== 'retry' ? 1 : 0;
        within = (p.index + settled) / p.items.length;
      }
      break;
    }
    case 'challenge': {
      const c = state.challenge;
      if (c.phase === 'result') within = 1;
      else if (c.phase === 'running' && c.items.length > 0) {
        within = c.answers.filter((a) => a !== null).length / c.items.length;
      }
      break;
    }
    case 'recap':
      within = 1;
      break;
    default:
      break;
  }
  return Math.min(1, (idx + within) / STEP_ORDER.length);
}

export function isExploreDone(state: MachineState): boolean {
  return state.exploreInteracted || !state.exploreNeedsInteraction;
}

// --- challenge -------------------------------------------------------------------------------

const EPSILON = 1e-9;

function finishChallenge(state: MachineState, ctx: MachineContext, timedOut: boolean): MachineState {
  const c = state.challenge;
  const total = c.items.length;
  const correct = c.answers.filter((a) => a === true).length;
  const fraction = total > 0 ? correct / total : 0;
  const passed = fraction + EPSILON >= ctx.lesson.steps.challenge.passMark;
  const result: ChallengeResult = { correct, total, fraction, passed, timedOut };
  return {
    ...state,
    completed: state.completed || passed,
    bestScore: state.bestScore === null ? fraction : Math.max(state.bestScore, fraction),
    challenge: { ...c, phase: 'result', result, secondsLeft: c.timed ? 0 : null },
  };
}

function nextChallengeQuestion(state: MachineState, ctx: MachineContext, now: number): MachineState {
  const c = state.challenge;
  if (c.index + 1 >= c.items.length) return finishChallenge(state, ctx, false);
  return { ...state, challenge: { ...c, index: c.index + 1, run: freshRun(now) } };
}

function nextPracticeQuestion(state: MachineState, now: number): MachineState {
  const p = state.practice;
  if (!p) return state;
  if (p.index + 1 >= p.items.length) {
    return { ...state, step: 'challenge', practice: null, challenge: emptyChallenge() };
  }
  return { ...state, practice: { ...p, index: p.index + 1, run: freshRun(now) } };
}

function timeUp(c: ChallengeState, now: number): boolean {
  return c.phase === 'running' && c.timed && c.deadline !== null && now >= c.deadline;
}

// --- reducer -------------------------------------------------------------------------------------

export function reduce(state: MachineState, action: Action, ctx: MachineContext): MachineState {
  switch (action.type) {
    case 'SHOW_ALTERNATIVE':
      return state.step === 'name' && !state.alternativeShown ? { ...state, alternativeShown: true } : state;

    case 'EXPLORE_INTERACTED':
      return state.step === 'explore' && !state.exploreInteracted ? { ...state, exploreInteracted: true } : state;

    case 'CONTINUE':
      return onContinue(state, action.now, ctx);

    case 'BACK':
      return onBack(state);

    case 'ANSWER':
      return onAnswer(state, action, ctx);

    case 'SKIP':
      return onSkip(state, action.now, ctx);

    case 'START_CHALLENGE': {
      const c = state.challenge;
      if (state.step !== 'challenge' || c.phase !== 'intro') return state;
      const spec = ctx.lesson.steps.challenge;
      const drawn = drawChallengeQuestions(spec.questions, spec.count, ctx.lesson.id, state.attemptCounter);
      const { items, counter } = resolveAll(ctx, drawn, state.attemptCounter);
      return {
        ...state,
        // At least one more per round, so a retry reshuffles even when the pool has no generated question.
        attemptCounter: counter + 1,
        challenge: {
          phase: 'running',
          timed: action.timed,
          items,
          index: 0,
          run: freshRun(action.now),
          deadline: action.timed ? action.now + spec.seconds * 1000 : null,
          secondsLeft: action.timed ? spec.seconds : null,
          answers: items.map(() => null),
          result: null,
        },
      };
    }

    case 'RETRY_CHALLENGE':
      if (state.step !== 'challenge' || state.challenge.phase !== 'result') return state;
      return { ...state, challenge: emptyChallenge() };

    case 'TICK': {
      const c = state.challenge;
      if (state.step !== 'challenge' || c.phase !== 'running' || !c.timed || c.deadline === null) return state;
      if (timeUp(c, action.now)) return finishChallenge(state, ctx, true);
      const left = Math.max(0, Math.ceil((c.deadline - action.now) / 1000));
      return left === c.secondsLeft ? state : { ...state, challenge: { ...c, secondsLeft: left } };
    }
  }
}

function onContinue(state: MachineState, now: number, ctx: MachineContext): MachineState {
  switch (state.step) {
    case 'hook':
      return { ...state, step: 'explore' };
    case 'explore':
      return isExploreDone(state) ? { ...state, step: 'name', nameIndex: 0, alternativeShown: false } : state;
    case 'name':
      if (state.nameIndex + 1 < state.nameCount) {
        return { ...state, nameIndex: state.nameIndex + 1, alternativeShown: false };
      }
      return enterPractice(state, ctx, 0, now);
    case 'practice': {
      const p = state.practice;
      if (!p || p.run.phase !== 'feedback') return state;
      if (p.run.outcome === 'retry') {
        return {
          ...state,
          practice: { ...p, run: { phase: 'answering', attempt: 2, startedAt: now, result: null, outcome: null } },
        };
      }
      return nextPracticeQuestion(state, now);
    }
    case 'challenge': {
      const c = state.challenge;
      if (c.phase === 'running' && c.run.phase === 'feedback') {
        if (timeUp(c, now)) return finishChallenge(state, ctx, true);
        return nextChallengeQuestion(state, ctx, now);
      }
      if (c.phase === 'result') return { ...state, step: 'recap' };
      return state;
    }
    case 'recap':
      return state;
  }
}

function onBack(state: MachineState): MachineState {
  switch (state.step) {
    case 'explore':
      return { ...state, step: 'hook' };
    case 'name':
      if (state.nameIndex > 0) return { ...state, nameIndex: state.nameIndex - 1, alternativeShown: false };
      return { ...state, step: 'explore' };
    case 'practice': {
      const p = state.practice;
      if (p && p.index === 0 && p.run.phase === 'answering' && p.run.attempt === 1) {
        return { ...state, step: 'name', practice: null, nameIndex: Math.max(0, state.nameCount - 1), alternativeShown: false };
      }
      return state;
    }
    default:
      // No going back from the hook, during the challenge, or from the recap.
      return state;
  }
}

function onAnswer(
  state: MachineState,
  action: Extract<Action, { type: 'ANSWER' }>,
  ctx: MachineContext,
): MachineState {
  const { result, now } = action;

  if (state.step === 'practice' && state.practice) {
    const p = state.practice;
    if (p.run.phase !== 'answering') return state;
    const item = p.items[p.index];
    const outcome: QuestionOutcome = result.correct
      ? 'correct'
      : p.run.attempt === 1 && item.hint
        ? 'retry'
        : 'wrong';
    const outcomes = p.outcomes.slice();
    if (outcome !== 'retry') outcomes[p.index] = outcome;
    return {
      ...state,
      events: [...state.events, makeEvent(state, item, p.run, result, now)],
      practice: { ...p, outcomes, run: { ...p.run, phase: 'feedback', result, outcome } },
    };
  }

  if (state.step === 'challenge') {
    const c = state.challenge;
    if (c.phase !== 'running' || c.run.phase !== 'answering') return state;
    if (timeUp(c, now)) return finishChallenge(state, ctx, true);
    const item = c.items[c.index];
    const answers = c.answers.slice();
    answers[c.index] = result.correct;
    return {
      ...state,
      events: [...state.events, makeEvent(state, item, c.run, result, now)],
      challenge: {
        ...c,
        answers,
        run: { ...c.run, phase: 'feedback', result, outcome: result.correct ? 'correct' : 'wrong' },
      },
    };
  }
  return state;
}

function onSkip(state: MachineState, now: number, ctx: MachineContext): MachineState {
  if (state.step === 'practice' && state.practice) {
    const p = state.practice;
    if (p.run.phase !== 'answering') return state;
    const outcomes = p.outcomes.slice();
    outcomes[p.index] = 'skipped';
    return nextPracticeQuestion({ ...state, practice: { ...p, outcomes } }, now);
  }
  if (state.step === 'challenge') {
    const c = state.challenge;
    if (c.phase !== 'running' || c.run.phase !== 'answering') return state;
    if (timeUp(c, now)) return finishChallenge(state, ctx, true);
    const answers = c.answers.slice();
    answers[c.index] = false;
    return nextChallengeQuestion({ ...state, challenge: { ...c, answers } }, ctx, now);
  }
  return state;
}
