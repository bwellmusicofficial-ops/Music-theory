/**
 * Validates every file in content/mocks: this is the test CI runs on mock
 * content, the way src/lesson/content.test.ts does for lessons.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generators } from '@/lesson/generators';
import { GENERATOR_SKILLS, PROPOSED_SKILLS } from '@/lesson/generators/coverage';
import { questionTypes } from '@/lesson/questions';
import { glossaryEntrySchema, skillIdSchema } from '@/lesson/schema';
import { z } from 'zod';
import { buildPaper } from './engine';
import { parseMockConfig } from './load';
import { DEFAULT_DISTINCTION_MARK, DEFAULT_MERIT_MARK, DEFAULT_PASS_MARK, configQuestionCount, mockConfigSchema, type MockConfig } from './schema';

const root = process.cwd();
const MOCKS_DIR = join(root, 'content', 'mocks');
const files = readdirSync(MOCKS_DIR).filter((f) => f.endsWith('.json'));

const guide = readFileSync(join(root, 'docs/lesson-authoring-guide.md'), 'utf8');
const section9 = guide.split('## 9. Skill ids')[1]!.split('\n## 10.')[0]!;
const KNOWN_SKILLS = new Set([
  ...[...section9.matchAll(/^\| `([a-z0-9-]+(?:\.[a-z0-9-]+)+)` \|/gm)].map((m) => m[1]!),
  ...PROPOSED_SKILLS,
]);

const glossaryIds = new Set(
  ['start', '1'].flatMap((g) =>
    z.array(glossaryEntrySchema).parse(JSON.parse(readFileSync(join(root, 'content/glossary', `${g}.json`), 'utf8'))).map((e) => e.id),
  ),
);

function linksIn(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]!.trim());
}

/** Every rich-text string in a payload (reasons, face text) and the prompt. */
function textsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => textsIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => textsIn(v, out));
  return out;
}

it('has at least one mock test, and the known skills were found', () => {
  expect(files).toContain('grade-1.json');
  expect(KNOWN_SKILLS.size).toBeGreaterThan(50);
});

describe.each(files)('content/mocks/%s', (file) => {
  const raw: unknown = JSON.parse(readFileSync(join(MOCKS_DIR, file), 'utf8'));
  const config = parseMockConfig(raw, file);

  it('matches its file name', () => {
    expect(`${config.id}.json`).toBe(file);
  });

  it('names registered generators whose params parse', () => {
    for (const section of config.sections) {
      for (const item of section.items) {
        if (item.kind !== 'generated') continue;
        const generator = generators[item.generator.id];
        expect(generator, `${section.id}/${item.id}: generator "${item.generator.id}" is not registered`).toBeDefined();
        const parsed = generator!.paramsSchema.safeParse(item.generator.params);
        expect(parsed.success, `${section.id}/${item.id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
      }
    }
  });

  it('uses only known skill ids, and ones the generator can serve', () => {
    for (const section of config.sections) {
      for (const item of section.items) {
        if (item.kind === 'generated') {
          expect(skillIdSchema.safeParse(item.skill).success, item.skill).toBe(true);
          expect(KNOWN_SKILLS.has(item.skill), `${item.id}: unknown skill ${item.skill}`).toBe(true);
          expect(GENERATOR_SKILLS[item.generator.id], `${item.id}: ${item.generator.id} does not serve ${item.skill}`).toContain(item.skill);
        } else {
          for (const q of item.bank) expect(KNOWN_SKILLS.has(q.skill), `${q.id}: unknown skill ${q.skill}`).toBe(true);
        }
      }
    }
  });

  it('has authored questions whose payloads validate against their question type', () => {
    for (const section of config.sections) {
      for (const item of section.items) {
        if (item.kind !== 'authored') continue;
        for (const q of item.bank) {
          const mod = questionTypes[q.type];
          expect(mod, `${q.id}: no question type ${q.type}`).toBeDefined();
          const parsed = mod!.payloadSchema.safeParse(q.payload);
          expect(parsed.success, `${q.id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
        }
      }
    }
  });

  it('links only glossary terms that exist', () => {
    for (const section of config.sections) {
      for (const item of section.items) {
        if (item.kind !== 'authored') continue;
        for (const q of item.bank) {
          for (const text of [q.prompt, ...textsIn(q.payload)]) {
            for (const id of linksIn(text)) expect(glossaryIds.has(id), `${q.id}: [[${id}]] is not a glossary term`).toBe(true);
          }
        }
      }
    }
  });

  it('builds a full paper for many seeds, with no problems and no repeated question', () => {
    const expected = configQuestionCount(config);
    for (let seed = 1; seed <= 25; seed++) {
      const paper = buildPaper(config, seed, { generators, questionTypes });
      expect(paper.problems, `seed ${seed}`).toEqual([]);
      expect(paper.questions).toHaveLength(expected);
      expect(new Set(paper.questions.map((q) => q.id)).size).toBe(expected);
      const fingerprints = paper.questions.map((q) => `${q.skill}|${q.prompt}|${JSON.stringify(q.payload)}`);
      expect(new Set(fingerprints).size, `seed ${seed} repeats a question`).toBe(expected);
    }
  });
});

describe('content/mocks/grade-1.json', () => {
  const config = parseMockConfig(JSON.parse(readFileSync(join(MOCKS_DIR, 'grade-1.json'), 'utf8')), 'grade-1.json');
  const bySection = (id: string) => config.sections.find((s) => s.id === id)!;
  const authoredBank = config.sections.flatMap((s) => s.items.flatMap((i) => (i.kind === 'authored' ? i.bank : [])));

  it('is a Grade 1 paper of about 30 questions in a sensible time', () => {
    expect(config.grade).toBe('1');
    expect(configQuestionCount(config)).toBeGreaterThanOrEqual(28);
    expect(configQuestionCount(config)).toBeLessThanOrEqual(34);
    expect(config.minutes).toBeGreaterThanOrEqual(30);
    expect(config.passMark).toBe(0.66);
  });

  it('covers the six areas of a Grade 1 paper', () => {
    expect(config.sections.map((s) => s.strand)).toEqual(['rhythm', 'pitch', 'scales-keys', 'intervals', 'harmony', 'terms']);
    const count = (id: string) => configQuestionCount({ ...config, sections: [bySection(id)] });
    expect(count('rhythm')).toBeGreaterThanOrEqual(8);
    expect(count('pitch')).toBeGreaterThanOrEqual(6);
    expect(count('keys-and-scales')).toBeGreaterThanOrEqual(4);
    expect(count('terms-and-signs')).toBeGreaterThanOrEqual(5);
  });

  it('tests the listed rhythm topics', () => {
    const skills = new Set(bySection('rhythm').items.flatMap((i) => (i.kind === 'generated' ? [i.skill] : [])));
    for (const s of [
      'rhythm.note-values.crotchet-minim',
      'rhythm.rests.values',
      'rhythm.time.read-signature',
      'rhythm.time.complete-bar',
      'rhythm.ties.read',
      'rhythm.note-values.dotted',
    ]) {
      expect(skills.has(s), s).toBe(true);
    }
  });

  it('carries about 16 authored terms and signs questions, with specific wrong-answer reasons', () => {
    expect(authoredBank.length).toBeGreaterThanOrEqual(16);
    expect(new Set(authoredBank.map((q) => q.type))).toEqual(new Set(['multiple-choice', 'match-up']));
    expect(authoredBank.every((q) => q.skill.startsWith('terms.'))).toBe(true);
    for (const q of authoredBank) {
      const p = q.payload as { options?: { reason?: string }[]; left?: { reason: string }[] };
      const reasons = [...(p.options ?? []).map((o) => o.reason), ...(p.left ?? []).map((l) => l.reason)].filter(Boolean) as string[];
      expect(reasons.length, q.id).toBeGreaterThanOrEqual(3);
      expect(reasons.every((r) => r.length > 25), q.id).toBe(true);
      expect(new Set(reasons).size, `${q.id} repeats a reason`).toBe(reasons.length);
    }
  });

  it('draws from banks with `draw`, and each bank is bigger than its draw', () => {
    for (const item of bySection('terms-and-signs').items) {
      expect(item.kind).toBe('authored');
      if (item.kind === 'authored') expect(item.bank.length).toBeGreaterThan(item.draw ?? item.bank.length);
    }
  });

  it('needs no sound or tapping: every question can be answered on paper', () => {
    const paper = buildPaper(config, 7, { generators, questionTypes });
    const types = new Set(paper.questions.map((q) => q.type));
    for (const t of ['tap-rhythm', 'by-ear', 'play-keyboard']) expect(types.has(t as never), t).toBe(false);
    expect(types.size).toBeGreaterThanOrEqual(6);
  });
});

describe('mock config schema', () => {
  const minimal = (): unknown => ({
    schemaVersion: 1,
    id: 'grade-2',
    grade: '2',
    title: 'Grade 2 mock test',
    summary: 'A paper.',
    minutes: 45,
    sections: [
      {
        id: 'rhythm',
        title: 'Rhythm',
        strand: 'rhythm',
        items: [{ kind: 'generated', id: 'a', generator: { id: 'choose-note-value' }, skill: 'rhythm.note-values.quaver' }],
      },
    ],
  });
  const parse = (c: unknown) => mockConfigSchema.safeParse(c);

  it('fills in the default marks and counts', () => {
    const r = parse(minimal());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.passMark).toBe(DEFAULT_PASS_MARK);
    expect(r.data.meritMark).toBe(DEFAULT_MERIT_MARK);
    expect(r.data.distinctionMark).toBe(DEFAULT_DISTINCTION_MARK);
    const item = r.data.sections[0]!.items[0]!;
    expect(item.kind === 'generated' && item.count).toBe(1);
    expect(item.kind === 'generated' && item.generator.params).toEqual({});
  });

  const mutate = (fn: (c: MockConfig & Record<string, unknown>) => void) => {
    const c = JSON.parse(JSON.stringify(minimal())) as MockConfig & Record<string, unknown>;
    fn(c);
    return parse(c);
  };

  it('rejects marks that are out of order', () => {
    expect(mutate((c) => { c.passMark = 0.9; c.meritMark = 0.8; }).success).toBe(false);
    expect(mutate((c) => { c.distinctionMark = 1.2; }).success).toBe(false);
  });

  it('rejects duplicate section and item ids, bad skills and unknown keys', () => {
    expect(mutate((c) => { c.sections.push(c.sections[0]!); }).success).toBe(false);
    expect(mutate((c) => { c.sections[0]!.items.push(c.sections[0]!.items[0]!); }).success).toBe(false);
    expect(mutate((c) => { (c.sections[0]!.items[0] as { skill: string }).skill = 'Rhythm'; }).success).toBe(false);
    expect(mutate((c) => { c.extra = 1; }).success).toBe(false);
    expect(mutate((c) => { c.sections = []; }).success).toBe(false);
  });

  it('checks authored items: a bank, a sensible draw and unique question ids', () => {
    const q = {
      id: 'q-one',
      type: 'multiple-choice',
      skill: 'terms.tempo.italian',
      prompt: 'What?',
      source: 'authored',
      payload: {},
    };
    const withItem = (item: unknown) => mutate((c) => { c.sections[0]!.items = [item as never]; });
    expect(withItem({ kind: 'authored', id: 'b', bank: [q] }).success).toBe(true);
    expect(withItem({ kind: 'authored', id: 'b', bank: [] }).success).toBe(false);
    expect(withItem({ kind: 'authored', id: 'b', bank: [q], draw: 2 }).success).toBe(false);
    expect(withItem({ kind: 'authored', id: 'b', bank: [q, q] }).success).toBe(false);
    expect(withItem({ kind: 'authored', id: 'b', bank: [{ ...q, source: 'generated' }] }).success).toBe(false);
  });
});
