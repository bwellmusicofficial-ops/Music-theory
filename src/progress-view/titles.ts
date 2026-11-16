import type { Grade } from '@/lesson/schema';

/** What the learner sees for each grade. */
export const GRADE_TITLES: Record<Grade, string> = {
  start: 'Start here',
  '1': 'Grade 1',
  '2': 'Grade 2',
  '3': 'Grade 3',
  '4': 'Grade 4',
  '5': 'Grade 5',
  '6': 'Grade 6',
  '7': 'Grade 7',
  '8': 'Grade 8',
};

/** One line on what each later grade will cover, for the "coming soon" sections of the course map. */
export const GRADE_SUMMARIES: Partial<Record<Grade, string>> = {
  '2': 'More keys, minor scales, triplets and new time signatures.',
  '3': 'Compound time, keys to four sharps and flats, intervals by type.',
  '4': 'Alto clef, double sharps and flats, chromatic scales, ornaments.',
  '5': 'Tenor clef, all keys, chords, cadences and transposition.',
  '6': 'Four-part harmony, figured bass and melody writing.',
  '7': 'Chromatic chords, suspensions and reconstruction.',
  '8': 'Advanced harmony, modulation and composition.',
};

/**
 * Unit titles, keyed "<grade>/<unit id>" because a unit id is only unique
 * within its grade. `titles.test.ts` fails when content has a unit missing here.
 */
export const UNIT_TITLES: Record<string, string> = {
  'start/pulse-1': 'Feel the pulse',
  'start/high-low-1': 'High and low',
  'start/keyboard-1': 'Meet the keyboard',
  'start/stave-1': 'Meet the stave',
  '1/rhythm-1': 'Note values and time',
  '1/rhythm-2': 'Rests, dots and ties',
  '1/pitch-1': 'Reading notes',
  '1/scales-1': 'Major scales and keys',
  '1/harmony-1': 'Intervals and triads',
  '1/terms-1': 'Terms and signs',
};

/** "rhythm-3" -> "Rhythm 3": the fallback for a unit that has no entry yet. */
function derivedTitle(unit: string): string {
  const words = unit.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function hasUnitTitle(grade: Grade, unit: string): boolean {
  return `${grade}/${unit}` in UNIT_TITLES;
}

export function unitTitle(grade: Grade, unit: string): string {
  return UNIT_TITLES[`${grade}/${unit}`] ?? derivedTitle(unit);
}

export function gradeTitle(grade: Grade): string {
  return GRADE_TITLES[grade];
}
