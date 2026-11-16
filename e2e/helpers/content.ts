import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Minimal views of the lesson JSON: the tests read content straight from the folder, so new lessons are covered automatically. */
export interface Exhibit {
  kind: 'passage' | 'keyboard' | 'audioClip';
  passage?: unknown;
  highlight?: string[];
  hideClef?: boolean;
  hideTime?: boolean;
}
export interface QuestionJson {
  id: string;
  type: string;
  source: 'authored' | 'generated';
  prompt: string;
  hint?: string;
  payload?: Record<string, unknown>;
  generator?: { id: string; params: Record<string, unknown> };
}
export interface LessonJson {
  id: string;
  title: string;
  grade: string;
  unit: string;
  order: number;
  status: string;
  steps: {
    hook: { text: string; exhibit?: Exhibit };
    explore: { text: string; instrument: 'keyboard' | 'stave' | 'rhythm-pad'; exhibit?: Exhibit; showNotation?: boolean; goal: string };
    name: { cards: { text: string; exhibit?: Exhibit }[]; alternative: { text: string; exhibit?: Exhibit } };
    practice: { questions: QuestionJson[] };
    challenge: { seconds: number; questions: QuestionJson[]; count: number; passMark: number };
    recap: { points: string[]; exhibit?: Exhibit };
  };
}

const ROOT = join(process.cwd(), 'content');

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return jsonFiles(path);
      return name.endsWith('.json') ? [path] : [];
    });
}

export function allLessons(): LessonJson[] {
  return jsonFiles(join(ROOT, 'lessons')).map((f) => JSON.parse(readFileSync(f, 'utf8')) as LessonJson);
}

export function lesson(id: string): LessonJson {
  const found = allLessons().find((l) => l.id === id);
  if (!found) throw new Error(`No lesson ${id}`);
  return found;
}

export interface GlossaryJson {
  id: string;
  term: string;
  us?: string;
  language?: string;
  definition: string;
}
export function allGlossary(): GlossaryJson[] {
  return jsonFiles(join(ROOT, 'glossary')).flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as GlossaryJson[]);
}

/** The exemplar lesson the full-play test uses. */
export const EXEMPLAR = 'g1-rhythm-01-crotchets-and-minims';

/** A small spread of lessons (different strands and explore instruments) for the everyday full-walk test. */
export const SAMPLE_LESSON_IDS = [
  EXEMPLAR,
  'start-rhythm-01-find-the-pulse',
  'start-pitch-04-finding-c',
  'g1-pitch-01-treble-clef-notes',
  'g1-scales-keys-02-g-major-and-key-signatures',
  'g1-terms-01-loud-and-soft',
];
