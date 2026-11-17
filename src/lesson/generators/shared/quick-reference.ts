/**
 * The rows of the author's quick reference in docs/generators-grade-1.md: one worked
 * example (generator id and params) per row. Test-only helper, shared by the tests that
 * run every generator.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QuickReferenceRow {
  id: string;
  type: string;
  skills: string[];
  example: { id: string; params: unknown };
}

export function quickReferenceRows(): QuickReferenceRow[] {
  const doc = readFileSync(join(process.cwd(), 'docs/generators-grade-1.md'), 'utf8');
  const section = doc.split("## Author's quick reference")[1]!.split('## 0. Conventions')[0]!;
  const rows: QuickReferenceRow[] = [];
  let current: Omit<QuickReferenceRow, 'example'> | null = null;
  for (const line of section.split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| Generator') || line.startsWith('| ---')) continue;
    const cells = line.split(/ \| /).map((c) => c.replace(/^\| /, '').replace(/ \|$/, '').trim());
    const [id, type, skills, example] = cells as [string, string, string, string];
    if (id) current = { id: id.replace(/`/g, ''), type: type.replace(/`/g, ''), skills: [...skills.matchAll(/`([^`]+)`/g)].map((m) => m[1]!) };
    const json = /^`(.*)`$/.exec(example)?.[1];
    if (!current || !json) throw new Error(`Bad quick reference row: ${line}`);
    rows.push({ ...current, example: JSON.parse(json) });
  }
  return rows;
}
