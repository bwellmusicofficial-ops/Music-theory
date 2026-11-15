/**
 * Loads lesson and glossary files from the content/ folder with fs. Server
 * only: call these from server components and `generateStaticParams`, which
 * run at build time. Invalid content throws, so a bad file fails the build.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { glossaryEntrySchema, lessonSchema, type GlossaryEntry, type Grade, type Lesson } from '@/lesson/schema';

const CONTENT_DIR = join(process.cwd(), 'content');

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

/** Every lesson, in suggested order: by grade, then unit, then position in the unit. */
export function listLessons(): Lesson[] {
  const lessons = jsonFilesUnder(join(CONTENT_DIR, 'lessons')).map((file) => {
    const parsed = lessonSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) throw new Error(`Invalid lesson file ${file}: ${parsed.error.message}`);
    return parsed.data;
  });
  return lessons.sort(
    (a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.unit.localeCompare(b.unit) || a.order - b.order,
  );
}

export function getLesson(id: string): Lesson | undefined {
  return listLessons().find((lesson) => lesson.id === id);
}

/** Order in which grades are taught; a lesson may link terms from its own grade or any earlier one. */
const GRADE_ORDER: Grade[] = ['start', '1', '2', '3', '4', '5', '6', '7', '8'];

function loadGlossaryFile(grade: Grade): GlossaryEntry[] {
  let raw: string;
  try {
    raw = readFileSync(join(CONTENT_DIR, 'glossary', `${grade}.json`), 'utf8');
  } catch {
    return [];
  }
  return z.array(glossaryEntrySchema).parse(JSON.parse(raw));
}

/** The glossary a lesson of this grade can link to: every entry up to and including the grade. */
export function loadGlossary(grade: Grade): GlossaryEntry[] {
  const upTo = GRADE_ORDER.indexOf(grade);
  return GRADE_ORDER.slice(0, upTo + 1).flatMap(loadGlossaryFile);
}
