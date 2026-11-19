import { createRng } from '@/engine/rng';
import { tapNoteValues, type TapNoteValuesParams } from '@/lesson/generators/tap-note-values';
import { deriveSeed } from '@/lesson/player/machine';
import type { GlossaryEntry, Lesson, QuestionTypeId } from '@/lesson/schema';

/**
 * The two questions of the landing-page demo. Nothing musical is typed here: each
 * one is a question that already exists in a "Start here" lesson, found by lesson
 * id and question id. Server-safe (no React), so the page can call it at build time.
 */
const HIGHER_LESSON = 'start-pitch-06-five-lines';
const HIGHER_QUESTION = 'p1-which-is-higher';
const PULSE_LESSON = 'start-rhythm-01-find-the-pulse';
const PULSE_QUESTION = 'p1-tap-the-pulse';

export interface DemoStepContent {
  id: string;
  type: QuestionTypeId;
  /** RichText, as in a lesson. */
  prompt: string;
  /** RichText: what to say when the answer is right (the lesson's own first hint sentence). */
  rightReason: string;
  payload: unknown;
}

export interface LandingDemoContent {
  steps: readonly [DemoStepContent, DemoStepContent];
  /** Lesson ids the steps came from, for tests and for the lesson links. */
  sources: readonly string[];
  /** Only the glossary entries the demo's text links to, so the US spelling swap works without shipping the whole glossary. */
  glossary: readonly GlossaryEntry[];
}

function findQuestion(lessons: readonly Lesson[], lessonId: string, questionId: string) {
  const lesson = lessons.find((l) => l.id === lessonId);
  const question = lesson?.steps.practice.questions.find((q) => q.id === questionId);
  if (!lesson || !question) throw new Error(`Landing demo: question ${lessonId}/${questionId} not found`);
  return question;
}

/** First sentence of a hint, so the demo says only what the lesson says. */
function firstSentence(text: string): string {
  const end = text.search(/[.!?](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

export function buildLandingDemoContent(lessons: readonly Lesson[], glossary: readonly GlossaryEntry[] = []): LandingDemoContent {
  const higher = findQuestion(lessons, HIGHER_LESSON, HIGHER_QUESTION);
  if (higher.source !== 'authored' || higher.type !== 'multiple-choice') {
    throw new Error(`Landing demo: ${HIGHER_LESSON}/${HIGHER_QUESTION} must be an authored multiple-choice question`);
  }
  const pulse = findQuestion(lessons, PULSE_LESSON, PULSE_QUESTION);
  if (pulse.source !== 'generated' || pulse.generator.id !== tapNoteValues.id) {
    throw new Error(`Landing demo: ${PULSE_LESSON}/${PULSE_QUESTION} must use the tap-note-values generator`);
  }
  // The lesson's own settings, shortened for a demo: one bar, no listen-first, notes drawn so they can light up.
  const params = tapNoteValues.paramsSchema.parse({
    ...pulse.generator.params,
    bars: 1,
    listenFirst: false,
    showNotation: true,
  }) as TapNoteValuesParams;
  const made = tapNoteValues.generate(params, createRng(deriveSeed('landing-demo', pulse.id, 0)), 'uk');

  const steps = [
      {
        id: higher.id,
        type: higher.type,
        prompt: higher.prompt,
        rightReason: firstSentence(higher.hint ?? ''),
        payload: higher.payload,
      },
      {
        id: pulse.id,
        type: made.type,
        prompt: 'Press Start, then tap once on every note.',
        rightReason: 'You kept a steady pulse.',
        payload: made.payload,
      },
  ] as const;

  // Glossary links in rich text are written [[id|shown]].
  const text = JSON.stringify([steps, higher.hint ?? '']);
  const linked = new Set([...text.matchAll(/\[\[([a-z0-9-]+)\|/g)].map((m) => m[1]!));
  return {
    steps: [steps[0], steps[1]],
    sources: [HIGHER_LESSON, PULSE_LESSON],
    glossary: glossary.filter((entry) => linked.has(entry.id)),
  };
}
