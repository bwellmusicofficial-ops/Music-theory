/**
 * Content validation (P0-14).
 *
 * Loads every JSON file under content/lessons and content/glossary and checks
 * it against the schemas plus the cross-file rules in
 * docs/lesson-authoring-guide.md. This is the test CI runs on lesson content.
 *
 * Payload shapes are checked by each question type's own `payloadSchema` from
 * the real registry, and generated questions are drawn from the real
 * generators (bottom of this file). The rest checks what needs no registry:
 * passages, text length and glossary links.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { createRng } from '../engine/rng';
import type { Bar, Duration, NoteValue, TimeSignature } from '../engine/types';
import { generators } from './generators';
import { questionTypes } from './questions';
import {
  glossaryEntrySchema,
  lessonSchema,
  MAX_WORDS_PER_BLOCK,
  type GlossaryEntry,
  type Lesson,
  type Question,
} from './schema';

const CONTENT_DIR = join(process.cwd(), 'content');
const LESSONS_DIR = join(CONTENT_DIR, 'lessons');
const GLOSSARY_DIR = join(CONTENT_DIR, 'glossary');

// --- loading ------------------------------------------------------------------

function jsonFilesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return jsonFilesUnder(path);
      return name.endsWith('.json') ? [path] : [];
    });
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const label = (path: string) => relative(process.cwd(), path).split(sep).join('/');

const lessonFiles = jsonFilesUnder(LESSONS_DIR);
const glossaryFiles = jsonFilesUnder(GLOSSARY_DIR);

/** Every glossary entry that parses, by id. Parse failures are reported by the glossary tests. */
const glossary = new Map<string, GlossaryEntry>();
for (const file of glossaryFiles) {
  const parsed = z.array(glossaryEntrySchema).safeParse(readJson(file));
  if (parsed.success) for (const entry of parsed.data) glossary.set(entry.id, entry);
}

// --- helpers ------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Calls `visit` for every object and string in a JSON value, with its path. */
function walk(value: unknown, path: string, visit: (value: unknown, path: string) => void): void {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, visit);
  }
}

/** Length in semibreves. Local to this test so it does not depend on the engine implementation. */
const VALUE_LENGTH: Record<NoteValue, number> = {
  breve: 2,
  semibreve: 1,
  minim: 1 / 2,
  crotchet: 1 / 4,
  quaver: 1 / 8,
  semiquaver: 1 / 16,
  demisemiquaver: 1 / 32,
};

function durationLength(duration: Duration): number {
  const base = VALUE_LENGTH[duration.value];
  if (base === undefined) throw new Error(`Unknown note value "${String(duration.value)}"`);
  const dotted = base * (2 - 1 / 2 ** (duration.dots ?? 0));
  return duration.tuplet ? (dotted * duration.tuplet.normal) / duration.tuplet.actual : dotted;
}

const barLength = (bar: Bar) =>
  bar.events.reduce((total, event) => total + durationLength(event.duration), 0);
const fullBar = (time: TimeSignature) => time.beats / time.beatUnit;
const sameLength = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const eventShape = z.object({
  kind: z.enum(['note', 'rest']),
  duration: z.object({
    value: z.enum(['breve', 'semibreve', 'minim', 'crotchet', 'quaver', 'semiquaver', 'demisemiquaver']),
    dots: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    tuplet: z.object({ actual: z.number().int().positive(), normal: z.number().int().positive() }).optional(),
  }),
  pitches: z
    .array(
      z.object({
        letter: z.enum(['C', 'D', 'E', 'F', 'G', 'A', 'B']),
        accidental: z.number().int().min(-2).max(2),
        octave: z.number().int(),
      }),
    )
    .min(1)
    .optional(),
  tieToNext: z.boolean().optional(),
  showAccidental: z.boolean().optional(),
});
const barsShape = z.array(z.object({ events: z.array(eventShape).min(1) })).min(1);
const timeShape = z.object({
  beats: z.number().int().positive(),
  beatUnit: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
});
const passageShape = z.object({
  clef: z.enum(['treble', 'bass', 'alto', 'tenor']),
  key: z.object({
    tonic: z.object({
      letter: z.enum(['C', 'D', 'E', 'F', 'G', 'A', 'B']),
      accidental: z.number().int().min(-2).max(2),
    }),
    mode: z.enum(['major', 'minor']),
  }),
  time: timeShape,
  bars: barsShape,
});

/**
 * Checks everything in `root` that holds bars against a time signature: engine
 * Passages (clef, key, time, bars) and tap-rhythm payloads (time, bars).
 * `allowedWrong` maps the path of a bars array to the one bar index that is
 * deliberately not full (see docs/question-payloads.md).
 */
function passageProblems(root: unknown, rootPath: string, allowedWrong = new Map<string, number>()): string[] {
  const problems: string[] = [];
  walk(root, rootPath, (value, path) => {
    if (!isRecord(value) || !Array.isArray(value.bars) || !('time' in value)) return;
    const shape = 'clef' in value ? passageShape : z.object({ time: timeShape, bars: barsShape });
    const parsed = shape.safeParse(value);
    if (!parsed.success) {
      problems.push(`${path}: not a valid passage (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message})`);
      return;
    }
    const { time, bars } = parsed.data;
    bars.forEach((bar, index) => {
      if (bar.events.some((event) => event.kind === 'note' && !event.pitches)) {
        problems.push(`${path}.bars[${index}]: a note has no pitches`);
      }
      const length = barLength(bar as Bar);
      const full = sameLength(length, fullBar(time));
      const exempt = allowedWrong.get(`${path}.bars`) === index;
      if (exempt && full) {
        problems.push(`${path}.bars[${index}]: this bar is meant to be the wrong length but is full`);
      }
      if (!exempt && !full) {
        problems.push(
          `${path}.bars[${index}]: holds ${length * time.beatUnit} beats, but ${time.beats}/${time.beatUnit} needs ${time.beats}`,
        );
      }
    });
  });
  return problems;
}

/** Bars that a question's payload deliberately leaves the wrong length. */
function allowedWrongBars(question: Question, payloadPath: string): Map<string, number> {
  const allowed = new Map<string, number>();
  if (question.source !== 'authored' || !isRecord(question.payload)) return allowed;
  const payload = question.payload;
  if (question.type === 'complete-bar' && typeof payload.barIndex === 'number') {
    allowed.set(`${payloadPath}.passage.bars`, payload.barIndex);
  }
  if (question.type === 'spot-mistake' && payload.select === 'bar' && isRecord(payload.mistake)) {
    const bar = payload.mistake.bar;
    // A wrong-length bar is allowed, not required: the mistake may be something else.
    if (typeof bar === 'number' && isRecord(payload.passage) && Array.isArray(payload.passage.bars)) {
      const parsed = passageShape.safeParse(payload.passage);
      if (parsed.success && parsed.data.bars[bar]) {
        const full = sameLength(barLength(parsed.data.bars[bar] as Bar), fullBar(parsed.data.time));
        if (!full) allowed.set(`${payloadPath}.passage.bars`, bar);
      }
    }
  }
  return allowed;
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Keys whose string values are learner-facing RichText inside payloads. */
const PAYLOAD_TEXT_KEYS = new Set(['text', 'reason', 'explanation', 'caption']);

const linkedTermIds = (text: string) =>
  [...text.matchAll(/\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g)].map((match) => match[1] ?? '');

function allQuestions(lesson: Lesson): { question: Question; path: string }[] {
  return [
    ...lesson.steps.practice.questions.map((question, index) => ({
      question,
      path: `steps.practice.questions[${index}]`,
    })),
    ...lesson.steps.challenge.questions.map((question, index) => ({
      question,
      path: `steps.challenge.questions[${index}]`,
    })),
  ];
}

// --- tests --------------------------------------------------------------------

describe('content', () => {
  it('has at least one lesson and one glossary file', () => {
    expect(lessonFiles.length).toBeGreaterThan(0);
    expect(glossaryFiles.length).toBeGreaterThan(0);
  });
});

describe.each(glossaryFiles.map((file) => [label(file), file] as const))('glossary %s', (_name, file) => {
  const parsed = z.array(glossaryEntrySchema).safeParse(readJson(file));

  it('conforms to glossaryEntrySchema', () => {
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it('is named after the grade of its entries', () => {
    const grade = basename(file, '.json');
    const wrong = (parsed.data ?? []).filter((entry) => entry.grade !== grade).map((entry) => entry.id);
    expect(wrong).toEqual([]);
  });

  it('links only to glossary terms that exist', () => {
    const missing = (parsed.data ?? []).flatMap((entry) =>
      linkedTermIds(entry.definition)
        .filter((id) => !glossary.has(id))
        .map((id) => `${entry.id} -> ${id}`),
    );
    expect(missing).toEqual([]);
  });

  it('has valid passages with full bars', () => {
    expect(passageProblems(parsed.data ?? [], 'glossary')).toEqual([]);
  });
});

describe('glossary as a whole', () => {
  it('has no duplicate term ids across files', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const file of glossaryFiles) {
      const parsed = z.array(glossaryEntrySchema).safeParse(readJson(file));
      for (const entry of parsed.data ?? []) {
        if (seen.has(entry.id)) duplicates.push(`${entry.id} (${label(file)})`);
        seen.add(entry.id);
      }
    }
    expect(duplicates).toEqual([]);
  });
});

describe('lessons as a whole', () => {
  it('have unique lesson ids', () => {
    const ids = lessonFiles.map((file) => (readJson(file) as { id?: unknown }).id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });
});

describe.each(lessonFiles.map((file) => [label(file), file] as const))('lesson %s', (_name, file) => {
  const raw = readJson(file);
  const parsed = lessonSchema.safeParse(raw);

  it('conforms to lessonSchema', () => {
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  // Everything below needs a parsed lesson; the test above reports why there is none.
  if (!parsed.success) return;
  const lesson = parsed.data;
  const questions = allQuestions(lesson);

  it('lives at content/lessons/<grade>/<unit>/<id>.json', () => {
    expect(label(file)).toBe(`content/lessons/${lesson.grade}/${lesson.unit}/${lesson.id}.json`);
  });

  it("lists every question's skill in the lesson's skills", () => {
    const unlisted = questions
      .filter(({ question }) => !lesson.skills.includes(question.skill))
      .map(({ question }) => `${question.id}: ${question.skill}`);
    expect(unlisted).toEqual([]);
  });

  it('gives every listed skill at least one question', () => {
    const used = new Set(questions.map(({ question }) => question.skill));
    expect(lesson.skills.filter((skill) => !used.has(skill))).toEqual([]);
  });

  it('has unique question ids', () => {
    const ids = questions.map(({ question }) => question.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('has every new term in the glossary', () => {
    expect(lesson.newTerms.filter((id) => !glossary.has(id))).toEqual([]);
  });

  it('links only to glossary terms that exist', () => {
    const missing: string[] = [];
    walk(lesson, 'lesson', (value, path) => {
      if (typeof value !== 'string') return;
      for (const id of linkedTermIds(value)) if (!glossary.has(id)) missing.push(`${path} -> ${id}`);
    });
    expect(missing).toEqual([]);
  });

  it('keeps text inside question payloads to the word limit', () => {
    const tooLong: string[] = [];
    for (const { question, path } of questions) {
      if (question.source !== 'authored') continue;
      walk(question.payload, `${path}.payload`, (value, valuePath) => {
        const key = valuePath.slice(valuePath.lastIndexOf('.') + 1);
        if (typeof value === 'string' && PAYLOAD_TEXT_KEYS.has(key) && wordCount(value) > MAX_WORDS_PER_BLOCK) {
          tooLong.push(`${valuePath}: ${wordCount(value)} words`);
        }
      });
    }
    expect(tooLong).toEqual([]);
  });

  it('has valid passages with full bars', () => {
    const problems = [
      ...passageProblems(lesson.steps.hook, 'steps.hook'),
      ...passageProblems(lesson.steps.explore, 'steps.explore'),
      ...passageProblems(lesson.steps.name, 'steps.name'),
      ...passageProblems(lesson.steps.recap, 'steps.recap'),
      ...questions.flatMap(({ question, path }) =>
        question.source === 'authored'
          ? passageProblems(question.payload, `${path}.payload`, allowedWrongBars(question, `${path}.payload`))
          : passageProblems(question.generator.params, `${path}.generator.params`),
      ),
    ];
    expect(problems).toEqual([]);
  });

  it('has a short bar for every complete-bar question to complete', () => {
    const problems: string[] = [];
    for (const { question } of questions) {
      if (question.source !== 'authored' || question.type !== 'complete-bar') continue;
      const payload = isRecord(question.payload) ? question.payload : {};
      const passage = passageShape.safeParse(payload.passage);
      const bar = passage.success && typeof payload.barIndex === 'number' ? passage.data.bars[payload.barIndex] : undefined;
      if (!passage.success || !bar) {
        problems.push(`${question.id}: barIndex does not point at a bar`);
      } else if (barLength(bar as Bar) >= fullBar(passage.data.time) - 1e-9) {
        problems.push(`${question.id}: the bar to complete is already full or too long`);
      }
    }
    expect(problems).toEqual([]);
  });
});

// --- payloads against the real question types and generators ----------------------

describe.each(lessonFiles.map((file) => [label(file), file] as const))('registered types and generators: %s', (_name, file) => {
  const parsed = lessonSchema.safeParse(readJson(file));
  if (!parsed.success) return;
  const questions = allQuestions(parsed.data);

  it('registers a question type for every question', () => {
    const missing = questions.filter(({ question }) => !questionTypes[question.type]).map(({ question }) => `${question.id}: ${question.type}`);
    expect(missing).toEqual([]);
  });

  it("validates every authored payload against its type's payloadSchema", () => {
    const problems: string[] = [];
    for (const { question, path } of questions) {
      if (question.source !== 'authored') continue;
      const result = questionTypes[question.type]?.payloadSchema.safeParse(question.payload);
      if (result && !result.success) {
        for (const issue of result.error.issues) {
          problems.push(`${path} (${question.id}, ${question.type}) payload.${issue.path.join('.')}: ${issue.message}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('resolves every generated question through the real generators for 20 seeds, and the payload validates', () => {
    const problems: string[] = [];
    for (const { question, path } of questions) {
      if (question.source !== 'generated') continue;
      const generator = generators[question.generator.id];
      if (!generator) {
        problems.push(`${path} (${question.id}): no generator "${question.generator.id}"`);
        continue;
      }
      const params = generator.paramsSchema.safeParse(question.generator.params);
      if (!params.success) {
        problems.push(`${path} (${question.id}): params rejected: ${params.error.message}`);
        continue;
      }
      for (let seed = 1; seed <= 20; seed++) {
        for (const terminology of ['uk', 'us'] as const) {
          let made;
          try {
            made = generator.generate(params.data, createRng(seed), terminology);
          } catch (e) {
            problems.push(`${path} (${question.id}) seed ${seed}: threw ${e instanceof Error ? e.message : String(e)}`);
            continue;
          }
          if (made.type !== question.type) {
            problems.push(`${path} (${question.id}) seed ${seed}: generated type ${made.type}, lesson says ${question.type}`);
          }
          const result = questionTypes[made.type]?.payloadSchema.safeParse(made.payload);
          if (!result) problems.push(`${path} (${question.id}) seed ${seed}: no question type ${made.type}`);
          else if (!result.success) problems.push(`${path} (${question.id}) seed ${seed}: ${result.error.issues[0]?.message}`);
          if (made.prompt !== undefined && wordCount(made.prompt) > MAX_WORDS_PER_BLOCK) {
            problems.push(`${path} (${question.id}) seed ${seed}: prompt is over the word limit`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
