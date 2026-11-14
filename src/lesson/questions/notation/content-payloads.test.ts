/**
 * Every authored question of the three stave-based types in content/lessons
 * must satisfy its payloadSchema. Generated questions are not checked here:
 * they have no payload until a generator runs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { payloadSchema as completeBar } from '@/lesson/questions/complete-bar/schema';
import { payloadSchema as noteOnStave } from '@/lesson/questions/note-on-stave/schema';
import { payloadSchema as spotMistake } from '@/lesson/questions/spot-mistake/schema';

const SCHEMAS = {
  'note-on-stave': noteOnStave,
  'complete-bar': completeBar,
  'spot-mistake': spotMistake,
} as const;
type StaveType = keyof typeof SCHEMAS;

const LESSONS_DIR = join(process.cwd(), 'content', 'lessons');

function jsonFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith('.json') ? [path] : [];
  });
}

interface Found {
  label: string;
  type: StaveType;
  payload: unknown;
}

function collect(value: unknown, file: string, path: string, out: Found[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => collect(item, file, `${path}[${i}]`, out));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (record.source === 'authored' && typeof type === 'string' && type in SCHEMAS) {
    out.push({ label: `${file} ${path} (${String(record.id)})`, type: type as StaveType, payload: record.payload });
  }
  for (const [key, child] of Object.entries(record)) collect(child, file, `${path}.${key}`, out);
}

const found: Found[] = [];
for (const file of jsonFiles(LESSONS_DIR)) {
  const label = relative(process.cwd(), file).split(sep).join('/');
  collect(JSON.parse(readFileSync(file, 'utf8')), label, '$', found);
}

describe('authored stave-question payloads in content/lessons', () => {
  it('finds the questions to check', () => {
    // The exemplar lesson has a complete-bar and a spot-mistake question.
    expect(found.some((f) => f.type === 'complete-bar')).toBe(true);
    expect(found.some((f) => f.type === 'spot-mistake')).toBe(true);
  });

  it.each(found.map((f) => [f.label, f] as const))('%s', (_label, question) => {
    const result = SCHEMAS[question.type].safeParse(question.payload);
    if (!result.success) {
      throw new Error(result.error.issues.map((i) => `${i.path.join('.') || '(payload)'}: ${i.message}`).join('\n'));
    }
    expect(result.success).toBe(true);
  });
});
