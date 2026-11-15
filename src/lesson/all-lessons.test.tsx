/**
 * Safety net for every lesson author.
 *
 * Loads EVERY lesson file under content/lessons and, for each question in
 * practice and challenge:
 *  - authored: validates the payload with the real question type's
 *    `payloadSchema` and renders the type's `Component` with it (locked false,
 *    result null) in jsdom;
 *  - generated: resolves the generator from the real registry with 5 seeds in
 *    both terminologies, checks the generated type equals the question's
 *    declared type, validates the payload and renders it.
 * It also renders every `passage` exhibit through the notation `PassageView`,
 * and checks that each lesson's `skills` are known skill ids from the tables in
 * section 9 of docs/lesson-authoring-guide.md.
 *
 * Every failure message starts with the lesson id and the question id (or the
 * exhibit path) and says why, so an author can go straight to the problem.
 * Only '@/audio' is mocked; the stave runs on the jsdom stubs, as in
 * integration.test.tsx.
 */

import { cleanup, render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { createRng } from '@/engine/rng';
import type { Passage, Terminology } from '@/engine/types';
import { generators } from './generators';
import { PassageView } from './questions/notation';
import { questionTypes } from './questions';
import { lessonSchema, type Lesson, type Question } from './schema';
import './setup';

const audio = vi.hoisted(() => ({
  playUi: vi.fn(),
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  setMuted: vi.fn(),
  isUnlocked: vi.fn(() => true),
  stop: vi.fn(),
  playPassage: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve() })),
}));
vi.mock('@/audio', () => ({
  getAudioEngine: () => ({
    ...audio,
    now: () => 0,
    startMetronome: () => ({ stop: audio.stop, startTime: 0.1 }),
  }),
}));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

// --- loading ------------------------------------------------------------------------------

const ROOT = process.cwd();
const LESSONS_DIR = join(ROOT, 'content', 'lessons');
const GUIDE = join(ROOT, 'docs', 'lesson-authoring-guide.md');

function jsonFilesUnder(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFilesUnder(path);
    return name.endsWith('.json') ? [path] : [];
  });
}

const fileLabel = (path: string) => relative(ROOT, path).split(sep).join('/');

interface Loaded {
  file: string;
  /** The lesson id from the file, even when the file does not parse. */
  id: string;
  lesson: Lesson | null;
  problem: string | null;
}

const loaded: Loaded[] = jsonFilesUnder(LESSONS_DIR).map((file) => {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { file, id: fileLabel(file), lesson: null, problem: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : fileLabel(file);
  const parsed = lessonSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { file, id, lesson: null, problem: `does not match lessonSchema at ${issue?.path.join('.')}: ${issue?.message}` };
  }
  return { file, id, lesson: parsed.data, problem: null };
});

// --- known skill ids, parsed from section 9 of the guide -------------------------------------

function knownSkillIds(): Set<string> {
  const markdown = readFileSync(GUIDE, 'utf8');
  const start = markdown.search(/^## 9\. Skill ids/m);
  const end = markdown.search(/^## 10\. /m);
  if (start < 0 || end < 0 || end < start) {
    throw new Error('Could not find section 9 ("Skill ids") in docs/lesson-authoring-guide.md');
  }
  const ids = new Set<string>();
  for (const line of markdown.slice(start, end).split('\n')) {
    // A table row whose first cell is a backticked skill id: | `rhythm.pulse.steady` | ... |
    const match = /^\|\s*`([a-z0-9-]+(?:\.[a-z0-9-]+){1,3})`\s*\|/.exec(line);
    if (match?.[1]) ids.add(match[1]);
  }
  return ids;
}

// --- helpers ------------------------------------------------------------------------------------

const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs `fn`; any throw becomes an Error that starts with where it happened. */
function guard(where: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    throw new Error(`${where}: ${describeError(e)}`);
  }
}

function renderQuestion(where: string, type: Question['type'], payload: unknown, terminology: Terminology): void {
  const questionType = questionTypes[type];
  if (!questionType) throw new Error(`${where}: no question type "${type}" is registered`);
  guard(`${where}: rendering the ${type} component threw`, () => {
    render(
      createElement(questionType.Component, {
        payload,
        terminology,
        locked: false,
        result: null,
        onAnswer: () => {},
      }),
    );
  });
  cleanup();
}

function questionsOf(lesson: Lesson): { question: Question; step: 'practice' | 'challenge'; index: number }[] {
  return [
    ...lesson.steps.practice.questions.map((question, index) => ({ question, step: 'practice' as const, index })),
    ...lesson.steps.challenge.questions.map((question, index) => ({ question, step: 'challenge' as const, index })),
  ];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every exhibit of kind 'passage' anywhere in the lesson (steps, payloads, option faces), with its path. */
function passageExhibits(lesson: Lesson): { path: string; passage: Passage }[] {
  const found: { path: string; passage: Passage }[] = [];
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (isRecord(value)) {
      if (value.kind === 'passage' && isRecord(value.passage)) found.push({ path, passage: value.passage as unknown as Passage });
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  walk(lesson.steps, 'steps');
  return found;
}

// --- tests --------------------------------------------------------------------------------------

describe('all lessons', () => {
  it('finds lesson files', () => {
    expect(loaded.length).toBeGreaterThan(0);
  });

  it('reads the skill tables in the authoring guide', () => {
    const skills = knownSkillIds();
    expect(skills.has('rhythm.pulse.steady')).toBe(true);
    expect(skills.has('pitch.high-low.hear')).toBe(true);
    expect(skills.has('score-reading.passage.find-features')).toBe(true);
  });
});

describe.each(loaded.map((entry) => [entry.id, entry] as const))('lesson %s', (_id, entry) => {
  const { lesson } = entry;

  it('parses against lessonSchema', () => {
    if (entry.problem) throw new Error(`${entry.id} (${fileLabel(entry.file)}): ${entry.problem}`);
  });

  if (!lesson) return;

  it('lists only known skill ids from section 9 of the authoring guide', () => {
    const known = knownSkillIds();
    const unknown = lesson.skills.filter((skill) => !known.has(skill));
    if (unknown.length) {
      throw new Error(
        `${lesson.id}: skills ${unknown.map((s) => `"${s}"`).join(', ')} are not in the Start here or Grade 1 tables in docs/lesson-authoring-guide.md section 9`,
      );
    }
  });

  it('renders every passage exhibit through PassageView', () => {
    for (const { path, passage } of passageExhibits(lesson)) {
      for (const terminology of ['uk', 'us'] as const) {
        guard(`${lesson.id}: exhibit at ${path} (${terminology}): PassageView threw`, () => {
          render(createElement(PassageView, { passage, terminology }));
        });
        cleanup();
      }
    }
  });

  describe.each(questionsOf(lesson).map((q) => [`${q.step} ${q.question.id}`, q] as const))('%s', (_name, { question, step, index }) => {
    const where = `${lesson.id}: ${question.id} (${step}[${index}], ${question.type}, ${question.source})`;

    if (question.source === 'authored') {
      it('has a valid payload that renders', () => {
        const questionType = questionTypes[question.type];
        if (!questionType) throw new Error(`${where}: no question type "${question.type}" is registered`);
        const parsed = questionType.payloadSchema.safeParse(question.payload);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((issue) => `payload.${issue.path.join('.')}: ${issue.message}`).join('; ');
          throw new Error(`${where}: payload rejected by the ${question.type} payloadSchema: ${issues}`);
        }
        for (const terminology of ['uk', 'us'] as const) {
          renderQuestion(`${where} (${terminology})`, question.type, parsed.data, terminology);
        }
      });
      return;
    }

    it('resolves with 5 seeds in both terminologies, matches its declared type, validates and renders', () => {
      const generator = generators[question.generator.id];
      if (!generator) throw new Error(`${where}: no generator "${question.generator.id}" in the registry`);
      const params = generator.paramsSchema.safeParse(question.generator.params);
      if (!params.success) {
        const issues = params.error.issues.map((issue) => `${issue.path.join('.') || 'params'}: ${issue.message}`).join('; ');
        throw new Error(`${where}: generator params rejected by "${generator.id}": ${issues}`);
      }
      for (let seed = 1; seed <= 5; seed++) {
        for (const terminology of ['uk', 'us'] as const) {
          const at = `${where} seed ${seed} ${terminology}`;
          let made;
          try {
            made = generator.generate(params.data, createRng(seed), terminology);
          } catch (e) {
            throw new Error(`${at}: generator "${generator.id}" threw: ${describeError(e)}`);
          }
          if (made.type !== question.type) {
            throw new Error(`${at}: generator "${generator.id}" made a ${made.type} question but the lesson declares ${question.type}`);
          }
          const questionType = questionTypes[made.type];
          if (!questionType) throw new Error(`${at}: no question type "${made.type}" is registered`);
          const parsed = questionType.payloadSchema.safeParse(made.payload);
          if (!parsed.success) {
            const issues = parsed.error.issues.map((issue) => `payload.${issue.path.join('.')}: ${issue.message}`).join('; ');
            throw new Error(`${at}: generated payload rejected by the ${made.type} payloadSchema: ${issues}`);
          }
          renderQuestion(at, made.type, parsed.data, terminology);
        }
      }
    });
  });
});
