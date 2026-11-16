import type { Terminology } from '@/engine/types';
import type { Grade, GlossaryEntry, Strand } from '@/lesson/schema';
import { stripRichText } from '@/lesson/player/rich-text';
import type { LessonMeta } from './course';
import { isDone, lessonState, type ProgressMap } from './progress';

/** A glossary entry as the library holds it: the exhibit stays on the server. */
export type GlossaryItem = Omit<GlossaryEntry, 'exhibit'>;

/** Lower case, accents removed, so "più" is found by "piu". */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Every word of the query must appear somewhere in the text. An empty query matches everything. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  return words.every((w) => haystack.includes(w));
}

// --- lessons ----------------------------------------------------------------------

export interface LessonFilter {
  grade: Grade | 'all';
  strand: Strand | 'all';
  query: string;
}

export const NO_LESSON_FILTER: LessonFilter = { grade: 'all', strand: 'all', query: '' };

/** Lessons matching the grade, the strand and the text (title and summary, in both UK and US wording). */
export function filterLessons(lessons: readonly LessonMeta[], filter: LessonFilter): LessonMeta[] {
  return lessons.filter((l) => {
    if (filter.grade !== 'all' && l.grade !== filter.grade) return false;
    if (filter.strand !== 'all' && l.strand !== filter.strand) return false;
    const text = normalise([l.title, l.usTitle, l.summary, l.usSummary].filter(Boolean).join(' '));
    return matchesQuery(text, filter.query);
  });
}

/** Grades and strands that actually have lessons, for the filter chips (in the order lessons come). */
export function filterOptions(lessons: readonly LessonMeta[]): { grades: Grade[]; strands: Strand[] } {
  const grades: Grade[] = [];
  const strands: Strand[] = [];
  for (const l of lessons) {
    if (!grades.includes(l.grade)) grades.push(l.grade);
    if (!strands.includes(l.strand)) strands.push(l.strand);
  }
  return { grades, strands };
}

// --- recap cards ----------------------------------------------------------------------

export interface RecapCardData {
  lessonId: string;
  /** Recap points, in RichText. */
  points: string[];
  /** A passage exhibit, when the recap has one. */
  passage?: { passage: unknown; hideClef?: boolean; hideTime?: boolean };
}

export interface OrderedRecap {
  lesson: LessonMeta;
  card: RecapCardData;
  /** True when the learner has completed the lesson, so the card is theirs. */
  earned: boolean;
}

/** Cards for completed lessons first, then the rest; each group in teaching order. */
export function orderRecaps(
  lessons: readonly LessonMeta[],
  cards: readonly RecapCardData[],
  progress: ProgressMap,
): OrderedRecap[] {
  const byId = new Map(cards.map((c) => [c.lessonId, c]));
  const rows: OrderedRecap[] = [];
  for (const lesson of lessons) {
    const card = byId.get(lesson.id);
    if (card) rows.push({ lesson, card, earned: isDone(lessonState(progress, lesson.id)) });
  }
  return [...rows.filter((r) => r.earned), ...rows.filter((r) => !r.earned)];
}

// --- glossary ----------------------------------------------------------------------

export interface GlossaryRow {
  entry: GlossaryItem;
  /** The term to show: the US form when the setting is US and there is one. */
  term: string;
  /** The other form, for "also called ...": null when there is only one. */
  alsoCalled: string | null;
  /** Lower-cased, accent-free text to search in. */
  haystack: string;
}

export const LANGUAGE_LABELS: Record<string, string> = { it: 'Italian', fr: 'French', de: 'German' };

/** Language label for a term that is not English, else null. */
export function languageLabel(entry: Pick<GlossaryItem, 'language'>): string | null {
  return LANGUAGE_LABELS[entry.language] ?? null;
}

export function glossaryRow(entry: GlossaryItem, terminology: Terminology): GlossaryRow {
  const useUs = terminology === 'us' && !!entry.us;
  const term = useUs ? entry.us! : entry.term;
  const alsoCalled = entry.us ? (useUs ? entry.term : entry.us) : null;
  const haystack = normalise([entry.term, entry.us, stripRichText(entry.definition)].filter(Boolean).join(' '));
  return { entry, term, alsoCalled, haystack };
}

export interface GlossaryGroup {
  /** "A" to "Z", or "#" for terms that start with a digit or symbol. */
  letter: string;
  rows: GlossaryRow[];
}

export function glossaryLetter(term: string): string {
  const first = normalise(term).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

/** Matching entries grouped by first letter of the shown term, A to Z, "#" first. */
export function groupGlossary(rows: readonly GlossaryRow[], query: string): GlossaryGroup[] {
  const matching = rows.filter((r) => matchesQuery(r.haystack, query));
  const sorted = [...matching].sort((a, b) => normalise(a.term).localeCompare(normalise(b.term), 'en', { numeric: true }));
  const groups = new Map<string, GlossaryRow[]>();
  for (const row of sorted) {
    const letter = glossaryLetter(row.term);
    groups.set(letter, [...(groups.get(letter) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
    .map(([letter, list]) => ({ letter, rows: list }));
}
