import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { TimeSignature } from '../types';
import { rhythm } from './index';
import { bar, T } from './test-helpers';

// bars, time, bpm, expected onsets in seconds.
const cases: [string, string[], TimeSignature, number, number[]][] = [
  ['4/4 crotchets at 60', ['c c c c'], T(4, 4), 60, [0, 1, 2, 3]],
  ['4/4 at 120 with a minim', ['c c m'], T(4, 4), 120, [0, 0.5, 1]],
  ['4/4 quavers at 60', ['q q q q q q q q'], T(4, 4), 60, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]],
  ['two bars run on', ['c c c c', 'c c m'], T(4, 4), 60, [0, 1, 2, 3, 4, 5, 6]],
  ['tie within a bar', ['c~ c c c'], T(4, 4), 120, [0, 1, 1.5]],
  ['tie across the barline', ['c c c c~', 'c m c'], T(4, 4), 60, [0, 1, 2, 3, 5, 7]],
  ['long tie chain', ['m~ m~', 'm~ m'], T(4, 4), 60, [0]],
  ['rests give no onset', ['rc c rc c'], T(4, 4), 60, [1, 3]],
  ['tie is not carried over a rest', ['c~ rc c c'], T(4, 4), 60, [0, 2, 3]],
  ['dotted rhythm', ['c. q m'], T(4, 4), 60, [0, 1.5, 2]],
  ['triplet quavers', ['q3 q3 q3 c c c'], T(4, 4), 60, [0, 1 / 3, 2 / 3, 1, 2, 3]],
  ['6/8 beat is a dotted crotchet', ['q q q q q q'], T(6, 8), 60, [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3]],
  ['6/8 dotted crotchets at 120', ['c. c.', 'c. c.'], T(6, 8), 120, [0, 0.5, 1, 1.5]],
  ['2/2 beat is a minim', ['m m', 'm m'], T(2, 2), 60, [0, 1, 2, 3]],
  ['2/2 crotchets at 60', ['c c c c'], T(2, 2), 60, [0, 0.5, 1, 1.5]],
  ['3/4 at 90', ['c c c'], T(3, 4), 90, [0, 2 / 3, 4 / 3]],
  ['3/8 beat is a quaver', ['q q q'], T(3, 8), 120, [0, 0.5, 1]],
  ['whole-bar rest in 3/4 advances a full bar', ['rs', 'c c c'], T(3, 4), 60, [3, 4, 5]],
  ['whole-bar rest in 6/8 advances a full bar', ['rs', 'c. c.'], T(6, 8), 60, [2, 3]],
  ['whole-bar rest in 12/8 at 120', ['c. c. c. c.', 'rs', 'c.'], T(12, 8), 120, [0, 0.5, 1, 1.5, 4]],
  ['whole-bar breve rest in 4/2 at 60', ['rB', 'm m m m'], T(4, 2), 60, [4, 5, 6, 7]],
  ['no bars', [], T(4, 4), 60, []],
];

describe('onsetTimes', () => {
  it.each(cases)('%s', (_name, bars, time, bpm, expected) => {
    const got = rhythm.onsetTimes(bars.map(bar), time, bpm);
    expect(got).toHaveLength(expected.length);
    got.forEach((t, i) => expect(t).toBeCloseTo(expected[i], 9));
  });

  it('rejects a non-positive tempo', () => {
    expect(() => rhythm.onsetTimes([bar('c c c c')], T(4, 4), 0)).toThrow(TheoryError);
    expect(() => rhythm.onsetTimes([bar('c c c c')], T(4, 4), -60)).toThrow(TheoryError);
  });
});
