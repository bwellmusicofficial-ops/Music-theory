import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATOR_SKILLS, START_HERE_SKILLS } from './coverage';
import { APPENDIX_GLOSSARY_IDS } from './shared/glossary-ids';
import { generators } from './index';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const doc = read('docs/generators-grade-1.md');
const guide = read('docs/lesson-authoring-guide.md');

const coveredSection = doc.split('**Covered by generators**')[1]!.split('**Left to authored')[0]!;
const authoredSection = doc.split('**Left to authored')[1]!.split('### 1.1')[0]!;

/** Rows of the form "| `skill` | ... |" with the backticked ids in each cell. */
const rows = (section: string) =>
  section
    .split('\n')
    .map((line) => /^\| (`[^|]+`) \| (.*) \|$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ skills: [...m[1]!.matchAll(/`([a-z0-9.-]+)`/g)].map((x) => x[1]!), rest: m[2]! }));

const covered = rows(coveredSection);
const authored = rows(authoredSection).flatMap((r) => r.skills);
const guideSkills = [...guide.split('### Grade 1 skill ids')[1]!.split('\n## ')[0]!.matchAll(/^\| `([a-z0-9.-]+\.[a-z0-9.-]+)` \|/gm)].map((m) => m[1]!);

describe('generator skill coverage', () => {
  it('every registered generator has a coverage entry, and no entry is orphaned', () => {
    expect(Object.keys(GENERATOR_SKILLS).sort()).toEqual(Object.keys(generators).sort());
  });

  it('the doc lists covered skills, and each has a registered generator declaring it', () => {
    expect(covered.length).toBeGreaterThan(40);
    for (const { skills, rest } of covered) {
      const named = [...rest.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!).filter((id) => id in generators);
      expect(named.length, skills[0]).toBeGreaterThan(0);
      for (const skill of skills) {
        const declaring = Object.entries(generators)
          .filter(([id]) => GENERATOR_SKILLS[id]?.includes(skill))
          .map(([id]) => id);
        expect(declaring.length, `${skill} has no generator`).toBeGreaterThan(0);
        for (const id of named) expect(GENERATOR_SKILLS[id], `${id} should declare ${skill}`).toContain(skill);
      }
    }
  });

  it('covered, authored-only and proposed skills together are exactly the Grade 1 skills plus the proposals', () => {
    const coveredIds = covered.flatMap((r) => r.skills);
    const guideSet = new Set(guideSkills);
    for (const id of [...coveredIds, ...authored]) expect(guideSet.has(id), id).toBe(true);
    const accounted = new Set([...coveredIds, ...authored]);
    expect([...guideSet].filter((id) => !accounted.has(id))).toEqual([]);
    expect(new Set(coveredIds).size).toBe(coveredIds.length);
  });

  it('the Start here skills are in the authoring guide table', () => {
    const startHere = [...guide.split('### Start here skill ids')[1]!.split('### Grade 1 skill ids')[0]!.matchAll(/^\| `([a-z0-9.-]+)` \|/gm)].map((m) => m[1]!);
    expect([...START_HERE_SKILLS].sort()).toEqual(startHere.sort());
  });

  it('every declared skill is a guide skill or a Start here one', () => {
    const known = new Set([...guideSkills, ...START_HERE_SKILLS]);
    for (const [id, skills] of Object.entries(GENERATOR_SKILLS)) {
      for (const skill of skills) expect(known.has(skill), `${id}: ${skill}`).toBe(true);
    }
  });

  it('the glossary appendix constant matches the doc appendix', () => {
    const appendix = doc.split('## 5. Appendix')[1]!;
    const ids = [...appendix.matchAll(/^\| `([a-z-]+)` \| /gm)].map((m) => m[1]!);
    expect([...APPENDIX_GLOSSARY_IDS].sort()).toEqual(ids.sort());
  });
});
