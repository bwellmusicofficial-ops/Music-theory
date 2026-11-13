import { TheoryError } from '../api';
import type { Duration, Fraction, TimeSignature } from '../types';
import { plainDuration } from './duration';
import {
  ZERO,
  add,
  eq,
  floorDiv,
  frac,
  isMultipleOf,
  le,
  lt,
  mul,
  normalise,
  sub,
} from './fraction';
import { barLength, beatsPerBar, feltBeat, metreKind } from './metre';

const FILL_VALUES: Fraction[] = [frac(1, 2), frac(1, 4), frac(1, 8), frac(1, 16), frac(1, 32)];

function must(length: Fraction): Duration {
  const d = plainDuration(length);
  if (!d) throw new TheoryError(`No single rest has length ${length.n}/${length.d}`);
  return d;
}

/**
 * Rests that fill a gap. Finish the current beat first (small values, each
 * starting where it is aligned within the beat), then one rest per whole
 * beat, using a two-beat rest only on beats 1 and 3 of a four-beat bar, and
 * a single whole-bar rest when the gap is the whole bar. A trailing part-beat
 * is filled with the largest aligned values first. No dotted rests are used
 * except where a compound beat or a pair of compound beats needs one.
 */
export function restsToFill(offset: Fraction, length: Fraction, time: TimeSignature): Duration[] {
  const bar = barLength(time);
  const start = normalise(offset);
  const len = normalise(length);
  if (start.n < 0 || len.n < 0) {
    throw new TheoryError('Rest gap offset and length must not be negative');
  }
  const end = add(start, len);
  if (lt(bar, end)) {
    throw new TheoryError('Rest gap runs past the end of the bar');
  }
  if (len.n === 0) return [];
  if (!isMultipleOf(start, frac(1, 32)) || !isMultipleOf(len, frac(1, 32))) {
    throw new TheoryError('Rest gap must be a whole number of demisemiquavers');
  }

  if (eq(start, ZERO) && eq(len, bar)) {
    return [{ value: time.beats === 4 && time.beatUnit === 2 ? 'breve' : 'semibreve', dots: 0 }];
  }

  const beat = feltBeat(time);
  const quad = metreKind(time) !== 'irregular' && beatsPerBar(time) === 4;
  const out: Duration[] = [];
  let p = start;

  while (lt(p, end)) {
    const k = floorDiv(p, beat);
    const bs = mul(beat, frac(k));
    const be = mul(beat, frac(k + 1));
    const remaining = sub(end, p);
    if (eq(p, bs) && le(beat, remaining)) {
      const twoBeats = mul(beat, frac(2));
      const step = quad && k % 2 === 0 && le(twoBeats, remaining) ? twoBeats : beat;
      out.push(must(step));
      p = add(p, step);
      continue;
    }
    const limit = lt(end, be) ? end : be;
    while (lt(p, limit)) {
      const v = FILL_VALUES.find(
        (c) => le(c, beat) && isMultipleOf(sub(p, bs), c) && le(add(p, c), limit),
      );
      if (!v) throw new TheoryError('Cannot fill this gap with whole rests');
      out.push(must(v));
      p = add(p, v);
    }
  }
  return out;
}
