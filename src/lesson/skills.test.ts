import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRANDS, lessonSchema, skillIdSchema } from './schema';
import { SKILLS, skillInfo, skillLabel } from './skills';

const root = process.cwd();
const guide = readFileSync(join(root, 'docs/lesson-authoring-guide.md'), 'utf8');
const section9 = guide.slice(guide.indexOf('\n## 9. Skill ids'), guide.indexOf('\n## 10.'));

/** The tables of section 9, read independently of the generator script. */
const documented = [...section9.matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)].map((m) => ({ id: m[1]!, text: m[2]!.trim() }));

describe('skills.ts against the authoring guide (section 9)', () => {
  it('lists exactly the documented skills, in the guide\'s order, with the guide\'s wording', () => {
    expect(SKILLS.map((s) => s.id)).toEqual(documented.map((d) => d.id));
    expect(SKILLS.map((s) => s.description)).toEqual(documented.map((d) => `The learner can ${d.text}`));
  });

  it('is what the generator script writes now (so the two cannot drift)', async () => {
    // @ts-expect-error a plain .mjs script with no type declarations
    const { generateSkillsSource } = (await import('../../scripts/generate-skills.mjs')) as { generateSkillsSource: (root?: string) => string };
    expect(readFileSync(join(root, 'src/lesson/skills.ts'), 'utf8')).toBe(generateSkillsSource(root));
  });

  it('has well-formed, unique ids whose strand is the first part of the id', () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SKILLS) {
      expect(skillIdSchema.safeParse(s.id).success, s.id).toBe(true);
      expect(STRANDS).toContain(s.strand);
      expect(s.id.startsWith(`${s.strand}.`)).toBe(true);
      expect(s.description.startsWith('The learner can ')).toBe(true);
    }
  });

  it('covers every skill that a lesson or a mock test uses', () => {
    const used = new Set<string>();
    const walk = (dir: string, visit: (path: string) => void) => {
      for (const name of readdirSync(dir).sort()) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, visit);
        else if (name.endsWith('.json')) visit(path);
      }
    };
    walk(join(root, 'content/lessons'), (path) => {
      const lesson = lessonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
      lesson.skills.forEach((s) => used.add(s));
    });
    const unknown = [...used].filter((id) => !skillInfo(id));
    expect(unknown).toEqual([]);
  });
});

describe('skillLabel', () => {
  it('gives a short title-case label from the topic and detail', () => {
    expect(skillLabel('rhythm.note-values.crotchet-minim')).toBe('Note Values: Crotchet Minim');
    expect(skillLabel('pitch.treble.lines')).toBe('Treble: Lines');
    expect(skillLabel('rhythm.perform.patterns')).toBe('Perform: Patterns');
    expect(skillLabel('pitch.keyboard.note-names')).toBe('Keyboard: Note Names');
  });
  it('labels every listed skill, and an unlisted or odd id, without throwing', () => {
    for (const s of SKILLS) expect(skillLabel(s.id)).toMatch(/^[A-Z0-9]/);
    expect(skillLabel('composition.melody')).toBe('Melody');
    expect(skillLabel('terms')).toBe('Terms');
    expect(skillLabel('score-reading.a.b.c')).toBe('A: B C');
  });
});
