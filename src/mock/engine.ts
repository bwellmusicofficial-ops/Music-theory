/**
 * The mock test engine: pure TypeScript, no React, no timers of its own.
 *
 * Differences from a lesson (see src/lesson/player/machine.ts):
 * - the whole paper is built up front from a config and a seed (same seed,
 *   same paper), using the lesson player's seed derivation;
 * - there is NO feedback while the test runs: answers are only stored, can be
 *   changed freely, and are marked together when the test is submitted;
 * - one clock for the whole paper, injected so tests control it; when it runs
 *   out the test submits itself with the answers held at that moment;
 * - unanswered questions count as wrong.
 */

import { createRng } from '@/engine/rng';
import type { Rng, Terminology } from '@/engine/types';
import type { GeneratorRegistry, MarkResult, QuestionTypeRegistry } from '@/lesson/contracts';
import { deriveSeed } from '@/lesson/player';
import type { QuestionTypeId, Strand } from '@/lesson/schema';
import { itemQuestionCount, type MockConfig } from './schema';

// --- paper -----------------------------------------------------------------------

export interface PaperQuestion {
  /** Position in the whole paper, from 0. */
  index: number;
  /** Unique within the paper: "<section>.<item>.<n>" or, for authored ones, "<section>.<question id>". */
  id: string;
  sectionId: string;
  itemId: string;
  skill: string;
  type: QuestionTypeId;
  /** Already validated by the type's payloadSchema. */
  payload: unknown;
  prompt: string;
  /** Present for generated questions, so the question can be replayed. */
  seed?: number;
}

export interface PaperSection {
  id: string;
  title: string;
  strand: Strand;
  /** Paper indices of this section's questions, in order. */
  indices: number[];
}

export interface Paper {
  configId: string;
  seed: number;
  questions: PaperQuestion[];
  sections: PaperSection[];
  /** Questions that could not be built (unknown generator, bad params, invalid payload). They are left out. */
  problems: string[];
}

export interface BuildPaperOptions {
  generators: GeneratorRegistry;
  questionTypes: QuestionTypeRegistry;
  terminology?: Terminology;
}

/** How many times a generator is re-drawn to avoid giving the same question twice in a paper. */
const MAX_REDRAWS = 12;

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Builds a paper. Deterministic: the same config, seed, registries and
 * terminology always give the same paper. Questions that cannot be built are
 * reported in `problems` instead of throwing, so one bad item cannot stop a test.
 */
export function buildPaper(config: MockConfig, seed: number, options: BuildPaperOptions): Paper {
  const { generators, questionTypes, terminology = 'uk' } = options;
  const seedKey = `${config.id}:${seed}`;
  const questions: PaperQuestion[] = [];
  const sections: PaperSection[] = [];
  const problems: string[] = [];

  const add = (q: Omit<PaperQuestion, 'index'>, section: PaperSection) => {
    const index = questions.length;
    questions.push({ ...q, index });
    section.indices.push(index);
  };

  for (const sectionConfig of config.sections) {
    const section: PaperSection = {
      id: sectionConfig.id,
      title: sectionConfig.title,
      strand: sectionConfig.strand,
      indices: [],
    };
    sections.push(section);

    for (const item of sectionConfig.items) {
      const where = `${sectionConfig.id}/${item.id}`;

      if (item.kind === 'authored') {
        const rng: Rng = createRng(deriveSeed(seedKey, `${sectionConfig.id}.${item.id}`, 0));
        const draw = item.draw ?? item.bank.length;
        const picked = rng.shuffle(item.bank).slice(0, draw);
        for (const q of picked) {
          const mod = questionTypes[q.type];
          if (!mod) {
            problems.push(`${where}/${q.id}: no question type "${q.type}" is registered`);
            continue;
          }
          const parsed = mod.payloadSchema.safeParse(q.payload);
          if (!parsed.success) {
            problems.push(`${where}/${q.id}: invalid ${q.type} payload: ${parsed.error.message}`);
            continue;
          }
          add(
            {
              id: `${sectionConfig.id}.${q.id}`,
              sectionId: sectionConfig.id,
              itemId: item.id,
              skill: q.skill,
              type: q.type,
              payload: parsed.data,
              prompt: q.prompt,
            },
            section,
          );
        }
        continue;
      }

      const generator = generators[item.generator.id];
      if (!generator) {
        problems.push(`${where}: no generator is registered with id "${item.generator.id}"`);
        continue;
      }
      const params = generator.paramsSchema.safeParse(item.generator.params);
      if (!params.success) {
        problems.push(`${where}: generator "${item.generator.id}" rejected its params: ${params.error.message}`);
        continue;
      }

      const seen = new Set<string>();
      for (let n = 0; n < itemQuestionCount(item); n++) {
        let built: Omit<PaperQuestion, 'index'> | null = null;
        let lastError = '';
        for (let attempt = 0; attempt <= MAX_REDRAWS; attempt++) {
          const questionSeed = deriveSeed(seedKey, `${sectionConfig.id}.${item.id}.${n}`, attempt);
          try {
            const made = generator.generate(params.data, createRng(questionSeed), terminology);
            const mod = questionTypes[made.type];
            if (!mod) {
              lastError = `no question type "${made.type}" is registered`;
              break;
            }
            const parsed = mod.payloadSchema.safeParse(made.payload);
            if (!parsed.success) {
              lastError = `invalid ${made.type} payload: ${parsed.error.message}`;
              continue;
            }
            const fingerprint = `${made.prompt ?? ''}|${JSON.stringify(parsed.data)}`;
            built = {
              id: `${sectionConfig.id}.${item.id}.${n + 1}`,
              sectionId: sectionConfig.id,
              itemId: item.id,
              skill: item.skill,
              type: made.type,
              payload: parsed.data,
              prompt: made.prompt || item.prompt || 'Answer this question.',
              seed: questionSeed,
            };
            if (!seen.has(fingerprint)) {
              seen.add(fingerprint);
              break;
            }
            // A repeat of a question already on this paper: draw again, keeping the last as a fallback.
          } catch (e) {
            lastError = `generator "${item.generator.id}" threw: ${describeError(e)}`;
          }
        }
        if (built) add(built, section);
        else problems.push(`${where}: ${lastError || 'the question could not be built'}`);
      }
    }
  }

  return { configId: config.id, seed, questions, sections, problems };
}

// --- results -----------------------------------------------------------------------

export type MockBand = 'distinction' | 'merit' | 'pass' | 'not-yet';

export const BAND_LABEL: Record<MockBand, string> = {
  distinction: 'Distinction',
  merit: 'Merit',
  pass: 'Pass',
  'not-yet': 'Not yet passed',
};

export interface Tally {
  /** Questions fully right. */
  correct: number;
  total: number;
  /** Marks gained: the sum of each question's score (partial credit counts). */
  points: number;
  /** points / total, 0 when there are no questions. */
  fraction: number;
}

export interface SectionResult extends Tally {
  id: string;
  title: string;
  strand: Strand;
}

export interface SkillResult extends Tally {
  skill: string;
}

export interface QuestionResult {
  index: number;
  id: string;
  sectionId: string;
  skill: string;
  type: QuestionTypeId;
  prompt: string;
  payload: unknown;
  answered: boolean;
  /** What the learner gave (undefined when unanswered). */
  answer: unknown;
  correct: boolean;
  score: number;
  /** The question type's own mark, with a reason when wrong. */
  mark: MarkResult;
  /** Why it was wrong, as RichText; for unanswered questions, a note saying so. */
  reason?: string;
  flagged: boolean;
}

export interface WeakSkill extends SkillResult {
  /** Lessons that teach this skill, in the order the lesson list gave them. */
  lessonIds: string[];
}

export interface MockResult {
  configId: string;
  seed: number;
  score: Tally;
  band: MockBand;
  passed: boolean;
  sections: SectionResult[];
  skills: SkillResult[];
  questions: QuestionResult[];
  /** Up to three skills with marks lost, weakest first. */
  weakest: WeakSkill[];
  answeredCount: number;
  unansweredCount: number;
  timedOut: boolean;
  /** Milliseconds from start to submit (the full allowance when time ran out). */
  elapsedMs: number;
}

/** What the engine needs to know about a lesson to point at it. */
export interface LessonRef {
  id: string;
  skills: readonly string[];
}

const EPSILON = 1e-9;

export function bandFor(fraction: number, config: Pick<MockConfig, 'passMark' | 'meritMark' | 'distinctionMark'>): MockBand {
  if (fraction + EPSILON >= config.distinctionMark) return 'distinction';
  if (fraction + EPSILON >= config.meritMark) return 'merit';
  if (fraction + EPSILON >= config.passMark) return 'pass';
  return 'not-yet';
}

function tally(correct: number, points: number, total: number): Tally {
  return { correct, total, points, fraction: total > 0 ? points / total : 0 };
}

function clampScore(score: number): number {
  return Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
}

export const UNANSWERED_REASON = 'You did not answer this question.';

/** Marks one question. Never throws: a question that cannot be marked is wrong, with the problem as its reason. */
export function markQuestion(
  question: PaperQuestion,
  answer: unknown,
  questionTypes: QuestionTypeRegistry,
): { mark: MarkResult; answered: boolean } {
  if (answer === undefined) {
    return { mark: { correct: false, score: 0, reason: UNANSWERED_REASON }, answered: false };
  }
  const mod = questionTypes[question.type];
  if (!mod) {
    return { mark: { correct: false, score: 0, reason: 'This question could not be marked.' }, answered: true };
  }
  try {
    const mark = mod.mark(question.payload, answer);
    const score = clampScore(mark.score);
    return { mark: { ...mark, score, correct: mark.correct }, answered: true };
  } catch {
    return { mark: { correct: false, score: 0, reason: 'Your answer could not be marked.' }, answered: true };
  }
}

export interface MarkPaperInput {
  config: MockConfig;
  paper: Paper;
  /** Indexed by question index; undefined means unanswered. */
  answers: readonly unknown[];
  flagged?: readonly boolean[];
  questionTypes: QuestionTypeRegistry;
  lessons?: readonly LessonRef[];
  timedOut?: boolean;
  elapsedMs?: number;
}

/** Marks a whole paper. Pure. */
export function markPaper(input: MarkPaperInput): MockResult {
  const { config, paper, answers, questionTypes, lessons = [], timedOut = false } = input;
  const flagged = input.flagged ?? [];

  const questions: QuestionResult[] = paper.questions.map((q) => {
    const { mark, answered } = markQuestion(q, answers[q.index], questionTypes);
    const result: QuestionResult = {
      index: q.index,
      id: q.id,
      sectionId: q.sectionId,
      skill: q.skill,
      type: q.type,
      prompt: q.prompt,
      payload: q.payload,
      answered,
      answer: answers[q.index],
      correct: mark.correct,
      score: mark.score,
      mark,
      flagged: flagged[q.index] === true,
    };
    if (!mark.correct) result.reason = mark.reason ?? 'That is not the right answer.';
    return result;
  });

  const sum = (list: QuestionResult[]): Tally =>
    tally(
      list.filter((r) => r.correct).length,
      list.reduce((n, r) => n + r.score, 0),
      list.length,
    );

  const sections: SectionResult[] = paper.sections.map((s) => ({
    id: s.id,
    title: s.title,
    strand: s.strand,
    ...sum(s.indices.map((i) => questions[i])),
  }));

  const skillOrder: string[] = [];
  const bySkill = new Map<string, QuestionResult[]>();
  for (const r of questions) {
    if (!bySkill.has(r.skill)) {
      bySkill.set(r.skill, []);
      skillOrder.push(r.skill);
    }
    bySkill.get(r.skill)!.push(r);
  }
  const skills: SkillResult[] = skillOrder.map((skill) => ({ skill, ...sum(bySkill.get(skill)!) }));

  // Weakest first: lowest fraction, then the skill with more questions (more evidence), then paper order.
  const weakest: WeakSkill[] = skills
    .map((s, order) => ({ s, order }))
    .filter(({ s }) => s.fraction < 1 - EPSILON)
    .sort((a, b) => a.s.fraction - b.s.fraction || b.s.total - a.s.total || a.order - b.order)
    .slice(0, 3)
    .map(({ s }) => ({
      ...s,
      lessonIds: lessons.filter((l) => l.skills.includes(s.skill)).map((l) => l.id),
    }));

  const score = sum(questions);
  const band = bandFor(score.fraction, config);
  const answeredCount = questions.filter((r) => r.answered).length;

  return {
    configId: config.id,
    seed: paper.seed,
    score,
    band,
    passed: band !== 'not-yet',
    sections,
    skills,
    questions,
    weakest,
    answeredCount,
    unansweredCount: questions.length - answeredCount,
    timedOut,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs ?? 0)),
  };
}

// --- the running test -----------------------------------------------------------------

export interface Clock {
  /** Milliseconds since the epoch (or any steady origin). */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export type TestPhase = 'running' | 'submitted';

export interface TestState {
  phase: TestPhase;
  /** Index of the question on screen. */
  current: number;
  /** Per question: the learner's answer, or undefined. */
  answers: readonly unknown[];
  flagged: readonly boolean[];
  /** Seconds left (rounded up), or null when untimed. */
  secondsLeft: number | null;
  /** Total time allowed in seconds, or null when untimed. */
  secondsAllowed: number | null;
  timedOut: boolean;
  result: MockResult | null;
}

export interface MockTestOptions {
  config: MockConfig;
  paper: Paper;
  questionTypes: QuestionTypeRegistry;
  clock?: Clock;
  /** settings.untimed: no clock, no auto-submit. */
  untimed?: boolean;
  /** Lessons to point weak skills at. */
  lessons?: readonly LessonRef[];
}

export interface MockTest {
  readonly paper: Paper;
  getState(): TestState;
  subscribe(listener: () => void): () => void;
  /** Moves to a question (clamped to the paper). */
  goTo(index: number): void;
  next(): void;
  previous(): void;
  /** Stores or replaces the answer. Ignored after submission. */
  setAnswer(index: number, answer: unknown): void;
  /** Removes an answer, so the question counts as unanswered again. */
  clearAnswer(index: number): void;
  toggleFlag(index: number): void;
  /** Marks everything and ends the test. Safe to call twice. */
  submit(): MockResult;
  /** Re-reads the clock: updates `secondsLeft` and auto-submits when time is up. Call it on an interval. */
  tick(): void;
  /** Milliseconds left, read from the clock now; null when untimed. */
  remainingMs(): number | null;
}

export function createMockTest(options: MockTestOptions): MockTest {
  const { config, paper, questionTypes, lessons = [], clock = systemClock, untimed = false } = options;
  const n = paper.questions.length;
  const startedAt = clock.now();
  const allowedMs = untimed ? null : config.minutes * 60_000;
  const deadline = allowedMs === null ? null : startedAt + allowedMs;

  const listeners = new Set<() => void>();
  let state: TestState = {
    phase: 'running',
    current: 0,
    answers: Array.from({ length: n }, () => undefined),
    flagged: Array.from({ length: n }, () => false),
    secondsLeft: allowedMs === null ? null : Math.ceil(allowedMs / 1000),
    secondsAllowed: allowedMs === null ? null : Math.ceil(allowedMs / 1000),
    timedOut: false,
    result: null,
  };

  function set(next: TestState) {
    if (next === state) return;
    state = next;
    for (const l of Array.from(listeners)) l();
  }

  function finish(timedOut: boolean): MockResult {
    if (state.result) return state.result;
    const end = clock.now();
    const elapsed = deadline !== null && timedOut ? allowedMs! : end - startedAt;
    const result = markPaper({
      config,
      paper,
      answers: state.answers,
      flagged: state.flagged,
      questionTypes,
      lessons,
      timedOut,
      elapsedMs: elapsed,
    });
    set({ ...state, phase: 'submitted', timedOut, secondsLeft: deadline === null ? null : timedOut ? 0 : state.secondsLeft, result });
    return result;
  }

  /** Submits if the deadline has passed. Returns true when the test is over. */
  function expireIfDue(): boolean {
    if (state.phase === 'submitted') return true;
    if (deadline !== null && clock.now() >= deadline) {
      finish(true);
      return true;
    }
    return false;
  }

  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < n;

  function goTo(index: number) {
    if (expireIfDue() || n === 0 || !Number.isFinite(index)) return;
    const target = Math.min(n - 1, Math.max(0, Math.trunc(index)));
    if (target !== state.current) set({ ...state, current: target });
  }

  return {
    paper,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    goTo,
    next: () => goTo(state.current + 1),
    previous: () => goTo(state.current - 1),
    setAnswer(index, answer) {
      if (expireIfDue() || !inRange(index) || answer === undefined) return;
      const answers = state.answers.slice();
      answers[index] = answer;
      set({ ...state, answers });
    },
    clearAnswer(index) {
      if (expireIfDue() || !inRange(index) || state.answers[index] === undefined) return;
      const answers = state.answers.slice();
      answers[index] = undefined;
      set({ ...state, answers });
    },
    toggleFlag(index) {
      if (expireIfDue() || !inRange(index)) return;
      const flagged = state.flagged.slice();
      flagged[index] = !flagged[index];
      set({ ...state, flagged });
    },
    submit() {
      if (state.result) return state.result;
      // A submit that arrives after the deadline is the timeout, not a late finish.
      return finish(deadline !== null && clock.now() >= deadline);
    },
    tick() {
      if (expireIfDue() || deadline === null) return;
      const left = Math.max(0, Math.ceil((deadline - clock.now()) / 1000));
      if (left !== state.secondsLeft) set({ ...state, secondsLeft: left });
    },
    remainingMs() {
      if (deadline === null) return null;
      if (state.phase === 'submitted') return 0;
      return Math.max(0, deadline - clock.now());
    },
  };
}

// --- helpers for screens ---------------------------------------------------------------

export function answeredCount(state: Pick<TestState, 'answers'>): number {
  return state.answers.filter((a) => a !== undefined).length;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The announcement for the live region: only at the 5 minute and 1 minute marks. */
export function timeWarning(secondsLeft: number | null): '' | 'five-minutes' | 'one-minute' {
  if (secondsLeft === null) return '';
  if (secondsLeft <= 60) return 'one-minute';
  if (secondsLeft <= 300) return 'five-minutes';
  return '';
}
