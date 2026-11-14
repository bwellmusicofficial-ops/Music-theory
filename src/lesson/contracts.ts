/**
 * Lesson runtime contracts: question-type modules, generators, progress.
 *
 * CONTRACT FILE (P0-01). Owned by the orchestrator.
 *
 * How the pieces fit:
 *
 *   lesson JSON --(schema.ts)--> Lesson
 *   Question.source = 'generated' --(QuestionGenerator)--> payload
 *   payload --(QuestionTypeModule.payloadSchema)--> typed payload
 *   QuestionTypeModule.Component renders it and calls onAnswer
 *   QuestionTypeModule.mark decides right or wrong and says why
 *   the lesson player emits an AttemptEvent to the ProgressSink
 *
 * A question type never talks to storage, routing or the lesson player's
 * state. It receives props and reports an answer. That keeps each type
 * buildable and testable on its own, and reusable inside games.
 */

import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { Rng, Terminology } from '../engine/types';
import type { QuestionTypeId, StepId } from './schema';

// --- marking -------------------------------------------------------------------

export interface MarkResult {
  correct: boolean;
  /** 0..1. Usually 0 or 1; rhythm tapping and multi-part answers give partial credit. */
  score: number;
  /**
   * Required when `correct` is false: one sentence saying specifically what
   * was wrong ("That note is on the second line, which is G, not A").
   * Never just "Incorrect". This is RichText (see schema.ts), rendered by the
   * lesson player's renderer, which applies the US terminology swap.
   */
  reason?: string;
}

// --- question-type modules --------------------------------------------------------

export interface QuestionProps<Payload, Answer> {
  payload: Payload;
  terminology: Terminology;
  /** True once an answer is submitted and feedback is showing. */
  locked: boolean;
  /** Set while feedback is showing, so the component can highlight right and wrong. */
  result: MarkResult | null;
  /**
   * Call once when the learner commits an answer. Components with a natural
   * commit action (tapping a choice) call it directly; others render their own
   * "Check" button.
   */
  onAnswer: (answer: Answer) => void;
}

export interface QuestionTypeModule<Payload = unknown, Answer = unknown> {
  type: QuestionTypeId;
  /** Validates authored and generated payloads for this type. */
  payloadSchema: z.ZodType<Payload>;
  Component: ComponentType<QuestionProps<Payload, Answer>>;
  /** Pure. Must not depend on anything outside its arguments. */
  mark: (payload: Payload, answer: Answer) => MarkResult;
}

/**
 * Registry: `src/lesson/questions/index.ts` exports
 *   `export const questionTypes: Partial<Record<QuestionTypeId, QuestionTypeModule<any, any>>>`
 * Each type lives in `src/lesson/questions/<type>/` and is added to the
 * registry by the orchestrator, not by the task that builds it.
 */
export type QuestionTypeRegistry = Partial<
  Record<QuestionTypeId, QuestionTypeModule<any, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
>;

// --- generators -------------------------------------------------------------------

export interface GeneratedQuestion {
  type: QuestionTypeId;
  /** Must satisfy that type's payloadSchema. */
  payload: unknown;
  /** Optional replacement for the authored prompt when it depends on the draw. */
  prompt?: string;
}

export interface QuestionGenerator<Params = Record<string, unknown>> {
  /** Matches `generator.id` in lesson files. */
  id: string;
  paramsSchema: z.ZodType<Params>;
  /** Pure given the Rng: the same seed and params give the same question. */
  generate: (params: Params, rng: Rng, terminology: Terminology) => GeneratedQuestion;
}

/** `src/lesson/generators/index.ts` exports `generators: Record<string, QuestionGenerator<any>>`. */
export type GeneratorRegistry = Record<string, QuestionGenerator<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

// --- progress -------------------------------------------------------------------

export type LessonState = 'not-started' | 'in-progress' | 'complete' | 'mastered';

/** One row per answer. The database `attempts` table mirrors this in Phase 1. */
export interface AttemptEvent {
  lessonId: string;
  step: StepId;
  questionId: string;
  skill: string;
  type: QuestionTypeId;
  correct: boolean;
  score: number;
  msTaken: number;
  /** Seed used when the question was generated, so it can be replayed. */
  seed?: number;
  /** ISO 8601. */
  at: string;
}

export interface LessonProgress {
  lessonId: string;
  state: LessonState;
  /** Where to resume. */
  step: StepId;
  /** Index within practice questions, when step is 'practice'. */
  questionIndex: number;
  /** Best challenge score so far, 0..1. Replays never lower it. */
  bestScore: number | null;
  updatedAt: string;
}

/**
 * Where progress goes. Phase 0 ships a localStorage implementation
 * (`src/lesson/progress/local.ts`); Phase 1 adds Supabase behind the same
 * interface, so the lesson player never changes.
 */
export interface ProgressSink {
  recordAttempt(event: AttemptEvent): Promise<void>;
  saveLessonProgress(progress: LessonProgress): Promise<void>;
  loadLessonProgress(lessonId: string): Promise<LessonProgress | null>;
  loadAllLessonProgress(): Promise<LessonProgress[]>;
}

// --- settings read by components -------------------------------------------------

export interface LearnerSettings {
  terminology: Terminology;
  soundOn: boolean;
  /** True when the learner or their device asks for less animation. */
  reducedMotion: boolean;
  /** Accessibility: challenges run without a clock. */
  untimed: boolean;
  theme: 'dark' | 'light';
  /**
   * Calibrated input delay in milliseconds. Positive means taps arrive late
   * (the device registers a tap after the learner made it), so the rhythm pad
   * subtracts this from every tap time before scoring. Default 0.
   */
  latencyOffsetMs: number;
}

export const DEFAULT_SETTINGS: LearnerSettings = {
  terminology: 'uk',
  soundOn: true,
  reducedMotion: false,
  untimed: false,
  theme: 'dark',
  latencyOffsetMs: 0,
};
