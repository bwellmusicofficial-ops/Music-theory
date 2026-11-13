import { TheoryError } from '../api';
import type {
  Degree,
  Interval,
  Key,
  KeySignature,
  Mode,
  Pitch,
  PitchClass,
  ScaleDirection,
  ScaleType,
} from '../types';
import {
  NATURAL_CHROMA,
  assertPitchClass,
  displayPitchClass,
  letterIndex,
  pc,
  pitchFromLetterAndMidi,
  toMidi,
} from './core';
import { transpose } from './interval';

/** Letters in order of the line of fifths, starting at F (F C G D A E B). */
const FIFTHS_LETTERS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;

/** Spelled pitch class `n` fifths from C (negative = flatwards). */
function pcFromFifths(n: number): PitchClass {
  const idx = (((n + 1) % 7) + 7) % 7;
  return pc(FIFTHS_LETTERS[idx], Math.floor((n + 1) / 7));
}

function fifthsFromC(c: PitchClass): number {
  assertPitchClass(c);
  return FIFTHS_LETTERS.indexOf(c.letter as (typeof FIFTHS_LETTERS)[number]) - 1 + 7 * c.accidental;
}

function checkSignature(sig: number): void {
  if (!Number.isInteger(sig) || sig < -7 || sig > 7) {
    throw new TheoryError(`Key signature must be an integer from -7 to 7, got ${sig}`);
  }
}

function checkMode(mode: Mode): void {
  if (mode !== 'major' && mode !== 'minor') throw new TheoryError(`Unknown mode: ${String(mode)}`);
}

export function keySignature(key: Key): KeySignature {
  checkMode(key.mode);
  const f = fifthsFromC(key.tonic);
  const sig = key.mode === 'major' ? f : f - 3;
  if (sig < -7 || sig > 7) {
    throw new TheoryError(
      `${displayPitchClass(key.tonic)} ${key.mode} needs ${Math.abs(sig)} ${sig > 0 ? 'sharps' : 'flats'}; keys are limited to 7`,
    );
  }
  return sig;
}

export function keyFromSignature(signature: KeySignature, mode: Mode): Key {
  checkSignature(signature);
  checkMode(mode);
  return { tonic: pcFromFifths(mode === 'major' ? signature : signature + 3), mode };
}

export function allKeys(): Key[] {
  const order = [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7];
  return [
    ...order.map((s) => keyFromSignature(s, 'major')),
    ...order.map((s) => keyFromSignature(s, 'minor')),
  ];
}

export function signatureAccidentals(signature: KeySignature): PitchClass[] {
  checkSignature(signature);
  const out: PitchClass[] = [];
  for (let i = 0; i < Math.abs(signature); i++) {
    // Sharps: F C G D A E B. Flats: B E A D G C F (the reverse).
    out.push(
      signature > 0
        ? { letter: FIFTHS_LETTERS[i], accidental: 1 }
        : { letter: FIFTHS_LETTERS[6 - i], accidental: -1 },
    );
  }
  return out;
}

export function relativeKey(key: Key): Key {
  const sig = keySignature(key);
  return keyFromSignature(sig, key.mode === 'major' ? 'minor' : 'major');
}

export function keyName(key: Key): string {
  checkMode(key.mode);
  assertPitchClass(key.tonic);
  return `${displayPitchClass(key.tonic)} ${key.mode}`;
}

// --- scales ---------------------------------------------------------------------

const P1: Interval = { quality: 'perfect', number: 1 };
const M2: Interval = { quality: 'major', number: 2 };
const m3: Interval = { quality: 'minor', number: 3 };
const M3: Interval = { quality: 'major', number: 3 };
const P4: Interval = { quality: 'perfect', number: 4 };
const P5: Interval = { quality: 'perfect', number: 5 };
const m6: Interval = { quality: 'minor', number: 6 };
const M6: Interval = { quality: 'major', number: 6 };
const m7: Interval = { quality: 'minor', number: 7 };
const M7: Interval = { quality: 'major', number: 7 };
const P8: Interval = { quality: 'perfect', number: 8 };

const SCALE_INTERVALS = {
  major: [P1, M2, M3, P4, P5, M6, M7, P8],
  'natural-minor': [P1, M2, m3, P4, P5, m6, m7, P8],
  'harmonic-minor': [P1, M2, m3, P4, P5, m6, M7, P8],
  'melodic-minor': [P1, M2, m3, P4, P5, M6, M7, P8],
} as const;

/**
 * Chromatic scale spelling convention (ABRSM style): ascending, every black-key
 * note is a sharp; descending, every black-key note is a flat; white-key notes
 * are naturals. The first and last notes are the tonic exactly as given (so
 * Bb chromatic ascending starts and ends on Bb, and an ascending scale on F#
 * ends on F# after an F natural). 13 notes, tonic to tonic.
 */
const SHARP_NAMES: PitchClass[] = [
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
].map(([letter, accidental]) => ({ letter, accidental }) as PitchClass);
const FLAT_NAMES: PitchClass[] = [
  ['C', 0],
  ['D', -1],
  ['D', 0],
  ['E', -1],
  ['E', 0],
  ['F', 0],
  ['G', -1],
  ['G', 0],
  ['A', -1],
  ['A', 0],
  ['B', -1],
  ['B', 0],
].map(([letter, accidental]) => ({ letter, accidental }) as PitchClass);

function chromaticScale(tonic: PitchClass, startOctave: number, direction: ScaleDirection): Pitch[] {
  // Both directions occupy startOctave..startOctave+1; descending is listed top-down.
  const startMidi = toMidi({ ...tonic, octave: startOctave });
  const names = direction === 'ascending' ? SHARP_NAMES : FLAT_NAMES;
  const out: Pitch[] = [];
  for (let i = 0; i <= 12; i++) {
    const midi = startMidi + i;
    const name = i === 0 || i === 12 ? tonic : names[((midi % 12) + 12) % 12];
    const octave = (midi - name.accidental - NATURAL_CHROMA[letterIndex(name.letter)]) / 12 - 1;
    out.push(pitchFromLetterAndMidi(name.letter, octave, midi));
  }
  return direction === 'ascending' ? out : out.reverse();
}

export function scale(
  tonic: PitchClass,
  type: ScaleType,
  startOctave: number,
  direction: ScaleDirection = 'ascending',
): Pitch[] {
  assertPitchClass(tonic);
  if (!Number.isInteger(startOctave)) throw new TheoryError(`startOctave must be an integer, got ${startOctave}`);
  if (direction !== 'ascending' && direction !== 'descending') {
    throw new TheoryError(`Unknown scale direction: ${String(direction)}`);
  }
  if (type === 'chromatic') {
    return chromaticScale(tonic, startOctave, direction);
  }
  const intervals = SCALE_INTERVALS[type];
  if (!intervals) throw new TheoryError(`Unknown scale type: ${String(type)}`);
  const root: Pitch = { ...tonic, octave: startOctave };
  // Melodic minor descends as the natural minor.
  const used = type === 'melodic-minor' && direction === 'descending' ? SCALE_INTERVALS['natural-minor'] : intervals;
  const notes = used.map((iv) => transpose(root, iv, 'up'));
  return direction === 'ascending' ? notes : notes.reverse();
}

export function degreeName(degree: Degree): string {
  const names = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'leading note'];
  checkDegree(degree);
  return names[degree - 1];
}

function checkDegree(d: number): void {
  if (!Number.isInteger(d) || d < 1 || d > 7) throw new TheoryError(`Scale degree must be 1..7, got ${d}`);
}

export function degree(key: Key, d: Degree): PitchClass {
  checkDegree(d);
  checkMode(key.mode);
  const type: ScaleType = key.mode === 'major' ? 'major' : 'harmonic-minor';
  const p = scale(key.tonic, type, 4)[d - 1];
  return { letter: p.letter, accidental: p.accidental };
}

export function degreesOf(key: Key): PitchClass[] {
  return ([1, 2, 3, 4, 5, 6, 7] as Degree[]).map((d) => degree(key, d));
}
