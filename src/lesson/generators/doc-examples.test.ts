import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { GENERATOR_SKILLS } from './coverage';
import { generators } from './index';
import { checkQuestion } from './shared/test-kit';

const doc = readFileSync(join(process.cwd(), 'docs/generators-grade-1.md'), 'utf8');
const section = doc.split("## Author's quick reference")[1]!.split('## 0. Conventions')[0]!;

interface Row {
  id: string;
  type: string;
  skills: string[];
  example: { id: string; params: unknown };
}

const rows: Row[] = [];
let current: Omit<Row, 'example'> | null = null;
for (const line of section.split('\n')) {
  if (!line.startsWith('| ') || line.startsWith('| Generator') || line.startsWith('| ---')) continue;
  const cells = line.split(/ \| /).map((c) => c.replace(/^\| /, '').replace(/ \|$/, '').trim());
  const [id, type, skills, example] = cells as [string, string, string, string];
  if (id) current = { id: id.replace(/`/g, ''), type: type.replace(/`/g, ''), skills: [...skills.matchAll(/`([^`]+)`/g)].map((m) => m[1]!) };
  const json = /^`(.*)`$/.exec(example)?.[1];
  if (!current || !json) throw new Error(`Bad quick reference row: ${line}`);
  rows.push({ ...current, example: JSON.parse(json) });
}

/** Written before P1-04 under the older conventions (no prompt, an unlinked "stave"): parsed and generated, not held to the new text rules. */
const EXISTING = new Set(['name-note-on-stave', 'tap-note-values']);

describe("docs/generators-grade-1.md author's quick reference", () => {
  it('has an example for every registered generator', () => {
    expect([...new Set(rows.map((r) => r.id))].sort()).toEqual(Object.keys(generators).sort());
  });

  it('lists the same skills as the coverage map and the right question type', () => {
    for (const r of rows) {
      expect([...r.skills].sort(), r.id).toEqual([...(GENERATOR_SKILLS[r.id] ?? [])].sort());
    }
  });

  it('covers every `ask` of the generators that have one', () => {
    const asks: Record<string, string[]> = {
      'count-beats': ['dotted', 'tie', 'exchange', 'fits', 'meaning'],
      'keyboard-find': ['find-every', 'black-keys', 'next-note', 'previous-note', 'step'],
      'play-scale-or-triad': ['scale', 'degree', 'triad'],
      'key-facts': ['name-key', 'accidentals', 'from-triad', 'degree-note', 'note-degree'],
      'contrast-by-ear': ['higher', 'lower', 'direction', 'step-or-jump', 'bigger-jump', 'longer', 'shorter'],
    };
    for (const [id, list] of Object.entries(asks)) {
      const used = rows.filter((r) => r.id === id).map((r) => (r.example.params as { ask?: string }).ask ?? (id === 'count-beats' ? 'dotted' : ''));
      expect(used.sort(), id).toEqual(expect.arrayContaining([...list].sort()));
    }
  });

  rows.forEach((row, index) => {
    it(`example ${index + 1} (${row.example.id} ${JSON.stringify(row.example.params).slice(0, 60)}) parses and generates valid questions`, () => {
      const generator = generators[row.example.id];
      expect(generator, row.example.id).toBeDefined();
      const parsed = generator!.paramsSchema.safeParse(row.example.params);
      if (!parsed.success) throw new Error(parsed.error.message);
      for (let seed = 0; seed < 25; seed += 1) {
        for (const terminology of ['uk', 'us'] as const) {
          const out = generator!.generate(parsed.data, createRng(seed), terminology);
          expect(out.type, row.id).toBe(row.type);
          if (!EXISTING.has(row.id)) checkQuestion(out, terminology, `${row.id}#${seed}/${terminology}`);
        }
      }
    });
  });
});
