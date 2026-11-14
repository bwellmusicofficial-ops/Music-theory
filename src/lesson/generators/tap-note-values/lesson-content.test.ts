/**
 * Validates authored question payloads of the types built in P0-12b (and ordering)
 * against their payload schemas, for every lesson file under content/lessons, and
 * checks that generated tap-rhythm questions resolve through the tap-note-values generator.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { createRng } from '@/engine/rng';
import { lessonSchema, type Lesson, type Question } from '@/lesson/schema';
import { payloadSchema as byEar } from '@/lesson/questions/by-ear/schema';
import { payloadSchema as ordering } from '@/lesson/questions/ordering/schema';
import { payloadSchema as playKeyboard } from '@/lesson/questions/play-keyboard/schema';
import { payloadSchema as tapRhythm } from '@/lesson/questions/tap-rhythm/schema';
import { tapNoteValues } from './index';

const LESSONS_DIR = join(process.cwd(), 'content', 'lessons');
const SCHEMAS: Record<string, ZodType> = {
  'play-keyboard': playKeyboard,
  'tap-rhythm': tapRhythm,
  'by-ear': byEar,
  ordering,
};

function jsonFilesUnder(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return jsonFilesUnder(path);
      return name.endsWith('.json') ? [path] : [];
    });
}

interface Found {
  file: string;
  lesson: Lesson;
  question: Question;
}

const found: Found[] = [];
for (const path of jsonFilesUnder(LESSONS_DIR)) {
  const lesson = lessonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const file = relative(process.cwd(), path).split(sep).join('/');
  for (const step of [lesson.steps.practice, lesson.steps.challenge]) {
    for (const question of step.questions) found.push({ file, lesson, question });
  }
}

const label = ({ file, question }: Found) => `${file}: ${question.id} (${question.type})`;

describe('lesson content: question payloads of the sound types and ordering', () => {
  const authored = found.filter(
    ({ question }) => question.source === 'authored' && question.type in SCHEMAS,
  );

  it('finds authored questions of these types in the lesson files', () => {
    expect(authored.length).toBeGreaterThan(0);
  });

  it.each(authored.map((f) => [label(f), f] as const))('%s has a valid payload', (_name, { question }) => {
    if (question.source !== 'authored') throw new Error('unreachable');
    const result = (SCHEMAS[question.type] as ZodType).safeParse(question.payload);
    expect(result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });
});

describe('lesson content: generated tap-rhythm questions', () => {
  const generated = found.filter(
    ({ question }) => question.source === 'generated' && question.generator.id === 'tap-note-values',
  );

  it('finds generated tap-note-values questions', () => {
    expect(generated.length).toBeGreaterThan(0);
  });

  it.each(generated.map((f) => [label(f), f] as const))('%s resolves through the generator', (_name, { question }) => {
    if (question.source !== 'generated') throw new Error('unreachable');
    expect(question.type).toBe('tap-rhythm');
    const params = tapNoteValues.paramsSchema.parse(question.generator.params);
    for (const seed of [1, 2, 3, 99, 2024]) {
      const made = tapNoteValues.generate(params, createRng(seed), 'uk');
      expect(made.type).toBe(question.type);
      const result = tapRhythm.safeParse(made.payload);
      expect(result.success ? [] : result.error.issues).toEqual([]);
    }
  });

  it('the exemplar lesson has its generated tap question p4-tap-the-rhythm', () => {
    const p4 = found.find(({ question }) => question.id === 'p4-tap-the-rhythm');
    expect(p4?.question.source).toBe('generated');
    if (p4?.question.source !== 'generated') return;
    const params = tapNoteValues.paramsSchema.parse(p4.question.generator.params);
    expect(params).toMatchObject({ bars: 2, bpm: 80, showNotation: true, listenFirst: true });
    const payload = tapNoteValues.generate(params, createRng(5), 'uk').payload as { bars: unknown[]; listenFirst: boolean };
    expect(payload.bars).toHaveLength(2);
    expect(payload.listenFirst).toBe(true);
  });
});
