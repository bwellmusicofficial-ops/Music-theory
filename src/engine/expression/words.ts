export type WordKind = 'cresc' | 'dim' | 'rit' | 'rall' | 'accel';

const TABLE: Record<string, WordKind> = {
  'cresc.': 'cresc',
  cresc: 'cresc',
  crescendo: 'cresc',
  'dim.': 'dim',
  dim: 'dim',
  diminuendo: 'dim',
  'decresc.': 'dim',
  decresc: 'dim',
  decrescendo: 'dim',
  'rit.': 'rit',
  rit: 'rit',
  ritardando: 'rit',
  'rall.': 'rall',
  rall: 'rall',
  rallentando: 'rall',
  'accel.': 'accel',
  accel: 'accel',
  accelerando: 'accel',
};

/** What a `words` text does to the sound, or null when it is only decoration. Case and outer spaces are ignored. */
export function wordKind(text: string): WordKind | null {
  return TABLE[text.trim().toLowerCase()] ?? null;
}
