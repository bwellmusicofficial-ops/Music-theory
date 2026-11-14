import { pitch as pitchEngine } from '@/engine/pitch';
import type { Letter, Pitch } from '@/engine/types';

/** Black key width as a fraction of a white key. */
export const BLACK_WIDTH = 0.6;

const SHARP_SPELLING: readonly (readonly [Letter, 0 | 1])[] = [
  ['C', 0],
  ['C', 1],
  ['D', 0],
  ['D', 1],
  ['E', 0],
  ['F', 0],
  ['F', 1],
  ['G', 0],
  ['G', 1],
  ['A', 0],
  ['A', 1],
  ['B', 0],
];

const BLACK_CHROMA = new Set([1, 3, 6, 8, 10]);

export function isBlackMidi(midi: number): boolean {
  return BLACK_CHROMA.has(((midi % 12) + 12) % 12);
}

/** The key's pitch spelled with sharps (black keys are reported as sharps). */
export function midiToPitch(midi: number): Pitch {
  const chroma = ((midi % 12) + 12) % 12;
  const [letter, accidental] = SHARP_SPELLING[chroma];
  return { letter, accidental, octave: Math.floor(midi / 12) - 1 };
}

/** "C 4", "C sharp 4": read aloud by screen readers. */
export function accessibleName(p: Pitch): string {
  return `${p.letter}${p.accidental === 1 ? ' sharp' : ''} ${p.octave}`;
}

export interface KeyModel {
  midi: number;
  pitch: Pitch;
  black: boolean;
  name: string;
  /** Left edge in white-key units. */
  left: number;
  /** Width in white-key units. */
  width: number;
}

export interface KeyboardLayout {
  keys: KeyModel[];
  low: number;
  high: number;
  /** Total width in white-key units, including edge allowance for black end keys. */
  units: number;
  whiteCount: number;
}

/** Keys for the inclusive range, ascending. A reversed range is swapped. */
export function buildLayout(lowPitch: Pitch, highPitch: Pitch): KeyboardLayout {
  const a = pitchEngine.toMidi(lowPitch);
  const b = pitchEngine.toMidi(highPitch);
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const padStart = isBlackMidi(low) ? BLACK_WIDTH / 2 : 0;
  const padEnd = isBlackMidi(high) ? BLACK_WIDTH / 2 : 0;
  const keys: KeyModel[] = [];
  let whites = 0;
  for (let midi = low; midi <= high; midi++) {
    const p = midiToPitch(midi);
    const black = isBlackMidi(midi);
    if (black) {
      keys.push({
        midi,
        pitch: p,
        black,
        name: accessibleName(p),
        left: padStart + whites - BLACK_WIDTH / 2,
        width: BLACK_WIDTH,
      });
    } else {
      keys.push({ midi, pitch: p, black, name: accessibleName(p), left: padStart + whites, width: 1 });
      whites++;
    }
  }
  return { keys, low, high, units: whites + padStart + padEnd, whiteCount: whites };
}

/** Computer-key offsets in semitones above the base C. */
export const COMPUTER_KEY_OFFSETS: Readonly<Record<string, number>> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

/** Maps computer keys to MIDI numbers, starting from the C nearest the middle of the range. */
export function computerKeyMap(low: number, high: number): Map<string, number> {
  // Ties go to the lower C, so a symmetric range centred between two Cs starts on the lower one.
  const base = Math.ceil((low + high) / 2 / 12 - 0.5) * 12;
  const map = new Map<string, number>();
  for (const [key, offset] of Object.entries(COMPUTER_KEY_OFFSETS)) {
    const midi = base + offset;
    if (midi >= low && midi <= high) map.set(key, midi);
  }
  return map;
}
