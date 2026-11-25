/**
 * Lesson content schema.
 *
 * CONTRACT FILE (P0-01). Owned by the orchestrator.
 *
 * Lessons are JSON files in `content/lessons/<grade>/<unit>/<slug>.json`,
 * validated against `lessonSchema` in CI. A lesson is data only: it never
 * contains code or markup beyond the limited inline text format below.
 *
 * Inline text format (`RichText`): plain text plus
 *   **bold**, *italic*, and [[term-id|shown text]] glossary links.
 * Hard limit of 60 words per text block, enforced by the schema.
 *
 * US terminology: text is written in UK terms. When the learner's setting is
 * "us", the renderer replaces the glossary `term` inside the shown text of a
 * [[term-id|shown text]] link with that entry's `us` value, keeping plural and
 * capital. Authors therefore link every use of a term that has a US equivalent.
 * Glossary ids for note values equal the engine `NoteValue` ids (crotchet, ...).
 */

import { z } from 'zod';
import { GRADES, STEP_ORDER, STRANDS } from './vocab';

// The three id lists live in ./vocab (no zod), so pages that only need the lists do not ship zod. Re-exported here.
export { GRADES, STEP_ORDER, STRANDS };

// --- shared ids -------------------------------------------------------------

export const strandSchema = z.enum(STRANDS);
export type Strand = z.infer<typeof strandSchema>;

export const gradeSchema = z.enum(GRADES);
export type Grade = z.infer<typeof gradeSchema>;

export const QUESTION_TYPES = [
  'note-on-stave',
  'play-keyboard',
  'tap-rhythm',
  'by-ear',
  'complete-bar',
  'spot-mistake',
  'ordering',
  'multiple-choice',
  'match-up',
  'place-bar-lines',
  'fix-beaming',
  'write-key-signature',
  'find-in-passage',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionTypeId = z.infer<typeof questionTypeSchema>;

/** kebab-case, e.g. "g1-rhythm-01-crotchets-and-minims". */
const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Skill ids are dotted: "<strand>.<topic>.<detail>", e.g. "pitch.treble.lines". */
export const skillIdSchema = z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/);

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const MAX_WORDS_PER_BLOCK = 60;
export const richTextSchema = z
  .string()
  .min(1)
  .refine((s) => wordCount(s) <= MAX_WORDS_PER_BLOCK, {
    message: `Text blocks are limited to ${MAX_WORDS_PER_BLOCK} words`,
  });
export type RichText = z.infer<typeof richTextSchema>;

// --- media that a step can show --------------------------------------------

/**
 * Something to see and hear alongside text. `passage` is an engine `Passage`
 * (validated structurally by the stave, not here). `audioClip` is a path under
 * /public/audio for the few cases a synthesised passage will not do.
 */
export const exhibitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('passage'),
    passage: z.unknown(),
    tempo: z.number().optional(),
    /** true: draw the stave without its clef (notes stay where a treble clef would put them). Default false. */
    hideClef: z.boolean().optional(),
    /** true: draw the bars without the time signature. Default false. */
    hideTime: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('keyboard'),
    /** Pitches to highlight, ASCII form ("C4"). */
    highlight: z.array(z.string()).default([]),
    low: z.string().default('C3'),
    high: z.string().default('C5'),
    /** Letter names on the keys. Default true. */
    showLabels: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('audioClip'), src: z.string(), caption: z.string() }),
]);
export type Exhibit = z.infer<typeof exhibitSchema>;

// --- questions ---------------------------------------------------------------

/**
 * A question is either authored (`payload` given) or generated (`generator`
 * given). The payload's shape belongs to the question type's own module, which
 * validates it with its `payloadSchema` when the lesson loads.
 */
const questionBase = {
  id: idSchema,
  type: questionTypeSchema,
  /** The single skill this question gives evidence for. */
  skill: skillIdSchema,
  prompt: richTextSchema,
  /** Shown after a first wrong answer. */
  hint: richTextSchema.optional(),
};

export const authoredQuestionSchema = z.object({
  ...questionBase,
  source: z.literal('authored'),
  payload: z.unknown(),
});

export const generatedQuestionSchema = z.object({
  ...questionBase,
  source: z.literal('generated'),
  generator: z.object({
    /** Registered generator id, e.g. "name-note-on-stave". */
    id: idSchema,
    params: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const questionSchema = z.discriminatedUnion('source', [
  authoredQuestionSchema,
  generatedQuestionSchema,
]);
export type Question = z.infer<typeof questionSchema>;

// --- the six steps ------------------------------------------------------------

/** 1. Hook: a 10-20 second clip or question that makes the idea matter. */
export const hookStepSchema = z.object({
  text: richTextSchema,
  exhibit: exhibitSchema.optional(),
});

/** 2. Hear it, play it: free interaction before any terminology. */
export const exploreStepSchema = z.object({
  text: richTextSchema,
  /**
   * Which instrument the learner plays with. For 'rhythm-pad', a `passage`
   * exhibit supplies the bars and its `tempo` the bpm (free play-along mode).
   */
  instrument: z.enum(['keyboard', 'stave', 'rhythm-pad']),
  exhibit: exhibitSchema.optional(),
  /**
   * 'rhythm-pad' only. false: the passage still supplies the rhythm and tempo,
   * but the stave is not drawn; a row of pulse dots (one per onset) lights up as
   * the learner taps. For lessons before notation is taught. Default true.
   */
  showNotation: z.boolean().optional(),
  /** 'keyboard' only: letter names on the keys. Overrides the keyboard exhibit's `showLabels`. Default true. */
  showLabels: z.boolean().optional(),
  /** What the learner must do to continue, in words; the player shows it as a goal. */
  goal: richTextSchema,
});

/** 3. Name it: the concept, its notation and one sentence of explanation. */
export const nameStepSchema = z.object({
  /** One to three short cards, each at most 60 words. */
  cards: z
    .array(z.object({ text: richTextSchema, exhibit: exhibitSchema.optional() }))
    .min(1)
    .max(3),
  /** A second explanation using a different approach ("explain it another way"). */
  alternative: z.object({ text: richTextSchema, exhibit: exhibitSchema.optional() }),
});

/** 4. Guided practice: three to five questions with instant feedback. */
export const practiceStepSchema = z.object({
  questions: z.array(questionSchema).min(3).max(5),
});

/** 5. Challenge: a scored round that decides whether the lesson is complete. */
export const challengeStepSchema = z.object({
  /** Seconds allowed; the untimed accessibility mode ignores this. */
  seconds: z.number().int().min(60).max(90),
  /** Pool the round draws from; generated questions repeat with new seeds. */
  questions: z.array(questionSchema).min(3),
  /**
   * How many questions the round asks. Each round samples them from the pool
   * with a seeded shuffle (seed from the lesson id and an attempt counter), so a
   * retry asks a different selection. No pool entry repeats until the pool is
   * exhausted, and the round has at least two question types when the pool has
   * them. Generated entries get a fresh seed each time they are drawn.
   * Unanswered questions when time runs out count as wrong. Hints are not shown during the round.
   */
  count: z.number().int().min(5).max(12).default(8),
  /** Fraction correct needed to complete the lesson. */
  passMark: z.number().min(0.5).max(1).default(0.8),
});

/** 6. Recap card: one screen saved to the learner's library. */
export const recapStepSchema = z.object({
  /** Two to four bullet-length points. */
  points: z.array(richTextSchema).min(2).max(4),
  exhibit: exhibitSchema.optional(),
});

// --- lesson ---------------------------------------------------------------------

export const lessonSchema = z.object({
  /** Bumped only by the orchestrator when the schema changes shape. */
  schemaVersion: z.literal(1),
  id: idSchema,
  title: z.string().min(1).max(60),
  /** One line shown on unit pages and in search. */
  summary: z.string().min(1).max(140),
  /** Shown instead of title/summary when terminology is "us" (plain strings, no links). */
  usTitle: z.string().min(1).max(60).optional(),
  usSummary: z.string().min(1).max(140).optional(),
  grade: gradeSchema,
  /** Unit id, unique within the grade, e.g. "rhythm-1". */
  unit: idSchema,
  /** Position within the unit, starting at 1. */
  order: z.number().int().min(1),
  strand: strandSchema,
  /** Skills this lesson teaches; every question's skill must be listed here. */
  skills: z.array(skillIdSchema).min(1),
  /** Lesson ids recommended first. Nothing is locked; this drives the suggested path. */
  prerequisites: z.array(idSchema).default([]),
  estimatedMinutes: z.number().int().min(5).max(8),
  /** Glossary term ids introduced here. */
  newTerms: z.array(idSchema).default([]),
  /**
   * 'draft' until a music specialist has checked the lesson. Drafts can be
   * opened by link for review but are labelled and kept off the main path.
   */
  status: z.enum(['draft', 'reviewed']).default('draft'),
  steps: z.object({
    hook: hookStepSchema,
    explore: exploreStepSchema,
    name: nameStepSchema,
    practice: practiceStepSchema,
    challenge: challengeStepSchema,
    recap: recapStepSchema,
  }),
});
export type Lesson = z.infer<typeof lessonSchema>;

export type StepId = (typeof STEP_ORDER)[number];

// --- glossary -------------------------------------------------------------------

export const glossaryEntrySchema = z.object({
  id: idSchema,
  /** UK term is canonical; `us` is shown when the terminology setting is "us". */
  term: z.string().min(1),
  us: z.string().optional(),
  /** Language of origin for Italian, French and German terms. */
  language: z.enum(['en', 'it', 'fr', 'de']).default('en'),
  definition: richTextSchema,
  grade: gradeSchema,
  strand: strandSchema,
  exhibit: exhibitSchema.optional(),
});
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
