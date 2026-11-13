import type { Bar, Duration, NoteValue, ScoreEvent, TimeSignature } from '../types';

const CODES: Record<string, NoteValue> = {
  B: 'breve',
  s: 'semibreve',
  m: 'minim',
  c: 'crotchet',
  q: 'quaver',
  x: 'semiquaver',
  d: 'demisemiquaver',
};

/**
 * Test shorthand. Tokens: optional "r" (rest), a value code
 * (B breve, s semibreve, m minim, c crotchet, q quaver, x semiquaver,
 * d demisemiquaver), up to two "." (dots), optional "3" (triplet),
 * optional "~" (tie to next). Example: "q q rc c. m~".
 */
export function bar(text: string): Bar {
  const events: ScoreEvent[] = text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token) => {
      const m = /^(r?)([Bsmcqxd])(\.{0,2})(3?)(~?)$/.exec(token);
      if (!m) throw new Error(`bad token ${token}`);
      const duration: Duration = {
        value: CODES[m[2]],
        dots: m[3].length as 0 | 1 | 2,
        ...(m[4] ? { tuplet: { actual: 3, normal: 2 } } : {}),
      };
      if (m[1]) return { kind: 'rest', duration };
      return {
        kind: 'note',
        pitches: [{ letter: 'C', accidental: 0, octave: 4 }],
        duration,
        ...(m[5] ? { tieToNext: true } : {}),
      };
    });
  return { events };
}

export const T = (beats: number, beatUnit: TimeSignature['beatUnit']): TimeSignature => ({
  beats,
  beatUnit,
});
