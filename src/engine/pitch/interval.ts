import { TheoryError } from '../api';
import type { Interval, IntervalQuality, Pitch } from '../types';
import { assertPitch, diatonicNumber, pitchFromDiatonic, toMidi } from './core';

const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
/** Simple interval sizes (0-based steps) that are perfect rather than major/minor. */
const PERFECT_STEPS = new Set([0, 3, 4]);

function checkNumber(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new TheoryError(`Interval number must be an integer >= 1, got ${n}`);
  }
}

export function semitones(interval: Interval): number {
  checkNumber(interval.number);
  const steps = interval.number - 1;
  const simple = steps % 7;
  const octaves = Math.floor(steps / 7);
  const perfectKind = PERFECT_STEPS.has(simple);
  const base = MAJOR_SEMITONES[simple];
  let offset: number;
  switch (interval.quality) {
    case 'perfect':
      if (!perfectKind) throw new TheoryError(`A ${ordinal(interval.number)} cannot be perfect`);
      offset = 0;
      break;
    case 'major':
      if (perfectKind) throw new TheoryError(`A ${ordinal(interval.number)} cannot be major`);
      offset = 0;
      break;
    case 'minor':
      if (perfectKind) throw new TheoryError(`A ${ordinal(interval.number)} cannot be minor`);
      offset = -1;
      break;
    case 'augmented':
      offset = 1;
      break;
    case 'diminished':
      offset = perfectKind ? -1 : -2;
      break;
    default:
      throw new TheoryError(`Unknown interval quality: ${String(interval.quality)}`);
  }
  const total = base + offset + 12 * octaves;
  if (total < 0) throw new TheoryError(`A diminished ${ordinal(interval.number)} is not a valid interval`);
  return total;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function intervalName(interval: Interval): string {
  semitones(interval); // validates
  return `${interval.quality} ${ordinal(interval.number)}`;
}

/**
 * Interval from the lower to the higher pitch. "Lower" is decided by letter
 * name and octave first, then by sounding pitch, so spelling is always
 * respected (B#3 to Db4 is a diminished 3rd... never an enharmonic shortcut).
 * Intervals needing double augmentation or diminution are not representable in
 * the contract and throw.
 */
export function intervalBetween(a: Pitch, b: Pitch): Interval {
  assertPitch(a);
  assertPitch(b);
  let lo = a;
  let hi = b;
  const da = diatonicNumber(a);
  const db = diatonicNumber(b);
  if (da > db || (da === db && toMidi(a) > toMidi(b))) {
    lo = b;
    hi = a;
  }
  const steps = diatonicNumber(hi) - diatonicNumber(lo);
  const semis = toMidi(hi) - toMidi(lo);
  const simple = steps % 7;
  const octaves = Math.floor(steps / 7);
  const offset = semis - 12 * octaves - MAJOR_SEMITONES[simple];
  const perfectKind = PERFECT_STEPS.has(simple);
  let quality: IntervalQuality | undefined;
  if (perfectKind) {
    quality = offset === 0 ? 'perfect' : offset === 1 ? 'augmented' : offset === -1 ? 'diminished' : undefined;
  } else {
    quality =
      offset === 0
        ? 'major'
        : offset === -1
          ? 'minor'
          : offset === 1
            ? 'augmented'
            : offset === -2
              ? 'diminished'
              : undefined;
  }
  // A diminished unison would be negative in size; it cannot occur after ordering,
  // but guard so that impossible spellings fail loudly.
  if (quality === undefined || semis < 0 || (steps === 0 && quality === 'diminished')) {
    throw new TheoryError(
      `Interval between ${a.letter}${a.accidental}/${a.octave} and ${b.letter}${b.accidental}/${b.octave} is doubly augmented or diminished and cannot be named`,
    );
  }
  return { quality, number: steps + 1 };
}

export function transpose(p: Pitch, interval: Interval, direction: 'up' | 'down'): Pitch {
  assertPitch(p);
  if (direction !== 'up' && direction !== 'down') {
    throw new TheoryError(`Direction must be 'up' or 'down', got ${String(direction)}`);
  }
  const semis = semitones(interval);
  const sign = direction === 'up' ? 1 : -1;
  return pitchFromDiatonic(
    diatonicNumber(p) + sign * (interval.number - 1),
    toMidi(p) + sign * semis,
  );
}
