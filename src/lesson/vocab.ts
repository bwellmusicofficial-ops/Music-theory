/**
 * The fixed id lists of the lesson format: strands, grades and the six steps of a lesson.
 *
 * Kept apart from `schema.ts` on purpose: that file builds the zod schemas, and importing it for a constant drags
 * all of zod (about 33 KB gzipped) into every page that shows progress. `schema.ts` re-exports these, so existing
 * imports keep working; code that runs on pages without lessons imports from here.
 */

export const STRANDS = [
  'rhythm',
  'pitch',
  'scales-keys',
  'intervals',
  'harmony',
  'composition',
  'terms',
  'score-reading',
] as const;

export type Strand = (typeof STRANDS)[number];

export const GRADES = ['start', '1', '2', '3', '4', '5', '6', '7', '8'] as const;
export type Grade = (typeof GRADES)[number];

export const STEP_ORDER = ['hook', 'explore', 'name', 'practice', 'challenge', 'recap'] as const;
export type StepId = (typeof STEP_ORDER)[number];
