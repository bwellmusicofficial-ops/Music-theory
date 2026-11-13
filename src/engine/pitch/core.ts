import { TheoryError } from '../api';
import type { Accidental, Clef, Letter, Pitch, PitchClass } from '../types';

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Semitones above C of each natural letter. */
export const NATURAL_CHROMA: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

export function letterIndex(letter: Letter): number {
  const i = LETTERS.indexOf(letter);
  if (i < 0) throw new TheoryError(`Invalid letter: ${String(letter)}`);
  return i;
}

export function assertPitchClass(pc: PitchClass): void {
  if (
    pc === null ||
    typeof pc !== 'object' ||
    !LETTERS.includes(pc.letter) ||
    ![-2, -1, 0, 1, 2].includes(pc.accidental)
  ) {
    throw new TheoryError(`Invalid pitch class: ${JSON.stringify(pc)}`);
  }
}

export function assertPitch(p: Pitch): void {
  assertPitchClass(p);
  if (!Number.isInteger(p.octave)) {
    throw new TheoryError(`Invalid octave in pitch: ${JSON.stringify(p)}`);
  }
}

export function pc(letter: Letter, accidental: number): PitchClass {
  if (![-2, -1, 0, 1, 2].includes(accidental)) {
    throw new TheoryError(
      `Result needs ${Math.abs(accidental)} sharps/flats on ${letter}; more than a double accidental is not supported`,
    );
  }
  return { letter, accidental: accidental as Accidental };
}

export function samePitchClass(a: PitchClass, b: PitchClass): boolean {
  return a.letter === b.letter && a.accidental === b.accidental;
}

/** Diatonic step count: C0 = 0, D0 = 1, ... C1 = 7. Ignores accidentals. */
export function diatonicNumber(p: Pitch): number {
  return p.octave * 7 + letterIndex(p.letter);
}

export function toMidi(p: Pitch): number {
  assertPitch(p);
  return (p.octave + 1) * 12 + NATURAL_CHROMA[letterIndex(p.letter)] + p.accidental;
}

export function chroma(c: PitchClass): number {
  assertPitchClass(c);
  return (((NATURAL_CHROMA[letterIndex(c.letter)] + c.accidental) % 12) + 12) % 12;
}

/** Build the pitch with the given letter/octave sounding at `midi`; throws beyond a double accidental. */
export function pitchFromLetterAndMidi(letter: Letter, octave: number, midi: number): Pitch {
  const natural = (octave + 1) * 12 + NATURAL_CHROMA[letterIndex(letter)];
  return { ...pc(letter, midi - natural), octave };
}

/** Pitch from a diatonic number plus the exact sounding midi number. */
export function pitchFromDiatonic(dn: number, midi: number): Pitch {
  const octave = Math.floor(dn / 7);
  const letter = LETTERS[dn - octave * 7];
  return pitchFromLetterAndMidi(letter, octave, midi);
}

export function comparePitch(a: Pitch, b: Pitch): number {
  return toMidi(a) - toMidi(b);
}

export function enharmonicallyEqual(a: PitchClass, b: PitchClass): boolean {
  return chroma(a) === chroma(b);
}

// --- parsing / formatting -----------------------------------------------------

const ACC_ASCII: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: 'x' };
const ACC_DISPLAY: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

function accFromText(text: string): Accidental {
  switch (text) {
    case '':
      return 0;
    case '#':
      return 1;
    case 'x':
      return 2;
    case 'b':
      return -1;
    case 'bb':
      return -2;
    default:
      throw new TheoryError(`Invalid accidental: "${text}"`);
  }
}

export function parsePitchClass(text: string): PitchClass {
  const m = typeof text === 'string' ? /^([A-G])(bb|b|#|x)?$/.exec(text) : null;
  if (!m) {
    throw new TheoryError(
      `Cannot parse pitch class "${String(text)}": expected a letter A-G then optional #, b, x or bb (e.g. "F#", "Bb")`,
    );
  }
  return { letter: m[1] as Letter, accidental: accFromText(m[2] ?? '') };
}

export function parsePitch(text: string): Pitch {
  const m = typeof text === 'string' ? /^([A-G])(bb|b|#|x)?(-?\d+)$/.exec(text) : null;
  if (!m) {
    throw new TheoryError(
      `Cannot parse pitch "${String(text)}": expected a letter A-G, optional #, b, x or bb, then an octave (e.g. "C4", "Ebb2", "Fx4")`,
    );
  }
  return { letter: m[1] as Letter, accidental: accFromText(m[2] ?? ''), octave: Number(m[3]) };
}

export function formatPitch(p: Pitch): string {
  assertPitch(p);
  return `${p.letter}${ACC_ASCII[p.accidental]}${p.octave}`;
}

export function formatPitchClass(c: PitchClass): string {
  assertPitchClass(c);
  return `${c.letter}${ACC_ASCII[c.accidental]}`;
}

export function displayPitchClass(c: PitchClass): string {
  assertPitchClass(c);
  return `${c.letter}${ACC_DISPLAY[c.accidental]}`;
}

// --- stave positions ------------------------------------------------------------

/** Diatonic number of the bottom line: treble E4, bass G2, alto F3, tenor D3. */
const BOTTOM_LINE: Record<Clef, number> = {
  treble: 4 * 7 + 2,
  bass: 2 * 7 + 4,
  alto: 3 * 7 + 3,
  tenor: 3 * 7 + 1,
};

function bottomLine(clef: Clef): number {
  const b = BOTTOM_LINE[clef];
  if (b === undefined) throw new TheoryError(`Unknown clef: ${String(clef)}`);
  return b;
}

export function stavePosition(p: Pitch, clef: Clef): number {
  assertPitch(p);
  return diatonicNumber(p) - bottomLine(clef);
}

export function pitchAtStavePosition(position: number, clef: Clef): Pitch {
  if (!Number.isInteger(position)) {
    throw new TheoryError(`Stave position must be an integer, got ${position}`);
  }
  const dn = bottomLine(clef) + position;
  const octave = Math.floor(dn / 7);
  return { letter: LETTERS[dn - octave * 7], accidental: 0, octave };
}
