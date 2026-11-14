import { pitch } from '@/engine/pitch';
import type { Pitch, PitchClass } from '@/engine/types';

const WHITE: Record<number, PitchClass> = {
  0: { letter: 'C', accidental: 0 },
  2: { letter: 'D', accidental: 0 },
  4: { letter: 'E', accidental: 0 },
  5: { letter: 'F', accidental: 0 },
  7: { letter: 'G', accidental: 0 },
  9: { letter: 'A', accidental: 0 },
  11: { letter: 'B', accidental: 0 },
};
const SHARP: Record<number, PitchClass> = {
  1: { letter: 'C', accidental: 1 },
  3: { letter: 'D', accidental: 1 },
  6: { letter: 'F', accidental: 1 },
  8: { letter: 'G', accidental: 1 },
  10: { letter: 'A', accidental: 1 },
};
const FLAT: Record<number, PitchClass> = {
  1: { letter: 'D', accidental: -1 },
  3: { letter: 'E', accidental: -1 },
  6: { letter: 'G', accidental: -1 },
  8: { letter: 'A', accidental: -1 },
  10: { letter: 'B', accidental: -1 },
};

/** `name(pc)`: the display name of a target, e.g. `F♯`. */
export function name(pc: PitchClass): string {
  return pitch.displayPitchClass({ letter: pc.letter, accidental: pc.accidental });
}

/**
 * A played key's name: its letter for a white key; for a black key a flat if
 * any target is a flat, otherwise a sharp (docs/question-payloads.md 2.5).
 */
export function playedName(played: Pitch, targets: readonly Pitch[]): string {
  const chroma = pitch.chroma(played);
  const white = WHITE[chroma];
  if (white) return name(white);
  const useFlats = targets.some((target) => target.accidental < 0);
  return name((useFlats ? FLAT : SHARP)[chroma] as PitchClass);
}

/** "C", "C and E", "C, E and G". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
