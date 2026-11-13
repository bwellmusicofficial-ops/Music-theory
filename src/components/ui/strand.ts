/** Strand ids and their presentation. Mirrors the lesson schema's strands without importing it (ui may not depend on lesson). */
export type StrandId =
  | 'rhythm'
  | 'pitch'
  | 'scales-keys'
  | 'intervals'
  | 'harmony'
  | 'composition'
  | 'terms'
  | 'score-reading';

export const STRAND_IDS: readonly StrandId[] = [
  'rhythm',
  'pitch',
  'scales-keys',
  'intervals',
  'harmony',
  'composition',
  'terms',
  'score-reading',
];

export const STRAND_NAMES: Record<StrandId, string> = {
  rhythm: 'Rhythm',
  pitch: 'Pitch',
  'scales-keys': 'Scales and keys',
  intervals: 'Intervals',
  harmony: 'Harmony',
  composition: 'Composition',
  terms: 'Terms',
  'score-reading': 'Score reading',
};

/** Full class names so Tailwind can see them at build time. */
export const STRAND_TEXT_CLASS: Record<StrandId, string> = {
  rhythm: 'text-strand-rhythm',
  pitch: 'text-strand-pitch',
  'scales-keys': 'text-strand-scales-keys',
  intervals: 'text-strand-intervals',
  harmony: 'text-strand-harmony',
  composition: 'text-strand-composition',
  terms: 'text-strand-terms',
  'score-reading': 'text-strand-score-reading',
};

export const STRAND_BG_CLASS: Record<StrandId, string> = {
  rhythm: 'bg-strand-rhythm',
  pitch: 'bg-strand-pitch',
  'scales-keys': 'bg-strand-scales-keys',
  intervals: 'bg-strand-intervals',
  harmony: 'bg-strand-harmony',
  composition: 'bg-strand-composition',
  terms: 'bg-strand-terms',
  'score-reading': 'bg-strand-score-reading',
};

export const STRAND_BORDER_CLASS: Record<StrandId, string> = {
  rhythm: 'border-strand-rhythm',
  pitch: 'border-strand-pitch',
  'scales-keys': 'border-strand-scales-keys',
  intervals: 'border-strand-intervals',
  harmony: 'border-strand-harmony',
  composition: 'border-strand-composition',
  terms: 'border-strand-terms',
  'score-reading': 'border-strand-score-reading',
};
