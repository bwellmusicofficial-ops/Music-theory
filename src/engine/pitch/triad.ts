import { TheoryError } from '../api';
import type { Degree, Interval, Key, Pitch, PitchClass, Triad, TriadQuality } from '../types';
import {
  assertPitch,
  assertPitchClass,
  chroma,
  comparePitch,
  diatonicNumber,
  letterIndex,
  samePitchClass,
} from './core';
import { transpose } from './interval';
import { degree } from './key';

const M3: Interval = { quality: 'major', number: 3 };
const m3: Interval = { quality: 'minor', number: 3 };
const P5: Interval = { quality: 'perfect', number: 5 };
const d5: Interval = { quality: 'diminished', number: 5 };
const A5: Interval = { quality: 'augmented', number: 5 };

const TRIAD_INTERVALS: Record<TriadQuality, [Interval, Interval]> = {
  major: [M3, P5],
  minor: [m3, P5],
  diminished: [m3, d5],
  augmented: [M3, A5],
};

function qualityFromSemitones(third: number, fifth: number): TriadQuality | null {
  if (third === 4 && fifth === 7) return 'major';
  if (third === 3 && fifth === 7) return 'minor';
  if (third === 3 && fifth === 6) return 'diminished';
  if (third === 4 && fifth === 8) return 'augmented';
  return null;
}

function stripOctave(p: Pitch): PitchClass {
  return { letter: p.letter, accidental: p.accidental };
}

export function triadPitches(triad: Triad, bassOctave: number): Pitch[] {
  assertPitchClass(triad.root);
  if (!Number.isInteger(bassOctave)) throw new TheoryError(`bassOctave must be an integer, got ${bassOctave}`);
  const intervals = TRIAD_INTERVALS[triad.quality];
  if (!intervals) throw new TheoryError(`Unknown triad quality: ${String(triad.quality)}`);
  if (![0, 1, 2].includes(triad.inversion)) throw new TheoryError(`Invalid inversion: ${String(triad.inversion)}`);
  const root: Pitch = { ...triad.root, octave: bassOctave };
  const third = transpose(root, intervals[0], 'up');
  const fifth = transpose(root, intervals[1], 'up');
  const up = (p: Pitch): Pitch => ({ ...p, octave: p.octave + 1 });
  const stacks: Pitch[][] = [
    [root, third, fifth],
    [third, fifth, up(root)],
    [fifth, up(root), up(third)],
  ];
  const stack = stacks[triad.inversion];
  const shift = bassOctave - stack[0].octave;
  return stack.map((p) => ({ ...p, octave: p.octave + shift }));
}

export function triadOnDegree(key: Key, d: Degree): { root: PitchClass; quality: TriadQuality } {
  const root = degree(key, d);
  const third = degree(key, (((d + 1) % 7) + 1) as Degree);
  const fifth = degree(key, (((d + 3) % 7) + 1) as Degree);
  const quality = qualityFromSemitones(
    (chroma(third) - chroma(root) + 12) % 12,
    (chroma(fifth) - chroma(root) + 12) % 12,
  );
  if (quality === null) throw new TheoryError('Could not derive a triad quality for this degree');
  return { root, quality };
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export function romanNumeral(key: Key, triad: Triad): string {
  assertPitchClass(triad.root);
  let d: number | undefined;
  for (let i = 1; i <= 7; i++) {
    if (samePitchClass(degree(key, i as Degree), triad.root)) {
      d = i;
      break;
    }
  }
  if (d === undefined) {
    throw new TheoryError(
      `Root ${triad.root.letter}${triad.root.accidental} is not a degree of the key (minor keys use the harmonic minor), so it has no roman numeral`,
    );
  }
  const base = NUMERALS[d - 1];
  let text: string;
  switch (triad.quality) {
    case 'major':
      text = base;
      break;
    case 'augmented':
      text = `${base}+`;
      break;
    case 'minor':
      text = base.toLowerCase();
      break;
    case 'diminished':
      text = `${base.toLowerCase()}°`;
      break;
    default:
      throw new TheoryError(`Unknown triad quality: ${String(triad.quality)}`);
  }
  if (![0, 1, 2].includes(triad.inversion)) throw new TheoryError(`Invalid inversion: ${String(triad.inversion)}`);
  return text + ['', 'b', 'c'][triad.inversion];
}

export function identifyTriad(pitches: Pitch[]): Triad | null {
  if (pitches.length !== 3) return null;
  pitches.forEach(assertPitch);
  const bass = [...pitches].sort(
    (a, b) => comparePitch(a, b) || diatonicNumber(a) - diatonicNumber(b),
  )[0];
  const pcs = pitches.map(stripOctave);
  for (const root of pcs) {
    const ri = letterIndex(root.letter);
    const third = pcs.find((p) => letterIndex(p.letter) === (ri + 2) % 7);
    const fifth = pcs.find((p) => letterIndex(p.letter) === (ri + 4) % 7);
    if (!third || !fifth) continue;
    const quality = qualityFromSemitones(
      (chroma(third) - chroma(root) + 12) % 12,
      (chroma(fifth) - chroma(root) + 12) % 12,
    );
    if (quality === null) continue;
    const b = stripOctave(bass);
    const inversion = samePitchClass(b, root) ? 0 : samePitchClass(b, third) ? 1 : 2;
    return { root, quality, inversion };
  }
  return null;
}
