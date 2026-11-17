#!/usr/bin/env node
/**
 * Writes src/lesson/skills.ts from the skill tables in section 9 of
 * docs/lesson-authoring-guide.md. Run after editing those tables:
 *
 *   node scripts/generate-skills.mjs
 *
 * `src/lesson/skills.test.ts` fails when the two disagree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultRoot = join(import.meta.dirname, '..');

/** The text of src/lesson/skills.ts for the guide under `root`. Pure: writes nothing. */
export function generateSkillsSource(root = defaultRoot) {
const guide = readFileSync(join(root, 'docs/lesson-authoring-guide.md'), 'utf8');

const start = guide.indexOf('\n## 9. Skill ids');
const end = guide.indexOf('\n## 10.', start);
if (start < 0 || end < 0) throw new Error('Section 9 of the authoring guide was not found');
const section = guide.slice(start, end);

const rows = [];
for (const line of section.split('\n')) {
  const m = /^\| `([a-z0-9-]+(?:\.[a-z0-9-]+){1,3})` \| (.+) \|$/.exec(line);
  if (m) rows.push({ id: m[1], text: m[2].trim() });
}
if (rows.length === 0) throw new Error('No skill rows found in section 9');
const ids = rows.map((r) => r.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) throw new Error(`Duplicate skill ids in the guide: ${dupes.join(', ')}`);

const q = (s) => JSON.stringify(s);
const body = rows
  .map((r) => `  { id: ${q(r.id)}, strand: ${q(r.id.split('.')[0])}, description: ${q(`The learner can ${r.text}`)} },`)
  .join('\n');

return `/**
 * Every skill id, with its strand and its "The learner can ..." description.
 *
 * GENERATED from the tables in section 9 of docs/lesson-authoring-guide.md by
 * \`node scripts/generate-skills.mjs\`. Do not edit by hand: edit the guide and
 * run the script. \`skills.test.ts\` fails if the two drift apart.
 */

import { SKILL_LABELS } from './skill-labels';
import type { Strand } from './schema';

export interface SkillInfo {
  readonly id: string;
  readonly strand: Strand;
  /** "The learner can ..." */
  readonly description: string;
}

export const SKILLS = [
${body}
] as const satisfies readonly SkillInfo[];

export type SkillId = (typeof SKILLS)[number]['id'];

const BY_ID: ReadonlyMap<string, SkillInfo> = new Map(SKILLS.map((s) => [s.id, s]));

export function skillInfo(id: string): SkillInfo | undefined {
  return BY_ID.get(id);
}

const titleCase = (words: string): string =>
  words
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * A short label for a skill id. Listed skills have a written label in
 * \`skill-labels.ts\`; any other well-formed id falls back to its topic and detail,
 * such as "Note Values: Crotchet Minim", so a new skill never shows as blank.
 */
export function skillLabel(id: string): string {
  const written = SKILL_LABELS[id];
  if (written) return written;
  const [, ...rest] = id.split('.');
  if (rest.length === 0) return titleCase(id);
  const [topic, ...detail] = rest;
  return detail.length === 0 ? titleCase(topic!) : \`\${titleCase(topic!)}: \${titleCase(detail.join('-'))}\`;
}
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = generateSkillsSource();
  writeFileSync(join(defaultRoot, 'src/lesson/skills.ts'), source);
  console.log(`Wrote src/lesson/skills.ts (${source.split('\n').filter((l) => l.startsWith('  { id:')).length} skills)`);
}
