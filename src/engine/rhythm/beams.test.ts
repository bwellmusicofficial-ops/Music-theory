import { describe, expect, it } from 'vitest';
import type { TimeSignature } from '../types';
import { rhythm } from './index';
import { bar, T } from './test-helpers';

// Each case: description, time, bar text, expected groups (indexes into events).
const cases: [string, TimeSignature, string, number[][]][] = [
  // --- simple time ---
  ['4/4 eight quavers: two groups of four', T(4, 4), 'q q q q q q q q', [[0, 1, 2, 3], [4, 5, 6, 7]]],
  ['4/4 crotchets: nothing to beam', T(4, 4), 'c c c c', []],
  ['4/4 pairs of quavers within beats 1 and 3', T(4, 4), 'q q c q q c', [[0, 1], [3, 4]]],
  ['4/4 sixteen semiquavers worth: beam per beat', T(4, 4), 'x x x x x x x x c c', [[0, 1, 2, 3], [4, 5, 6, 7]]],
  ['4/4 beats 1-2 quavers then crotchets', T(4, 4), 'q q q q c c', [[0, 1, 2, 3]]],
  ['4/4 never across the middle of the bar', T(4, 4), 'c q q q q c', [[1, 2], [3, 4]]],
  ['4/4 dotted quaver and semiquaver pairs', T(4, 4), 'q. x q. x c c', [[0, 1], [2, 3]]],
  ['4/4 rest breaks the beam in beat 1', T(4, 4), 'q rq q q c c', [[2, 3]]],
  ['4/4 rest in beat 2 stops the long beam', T(4, 4), 'q q rq q c c', [[0, 1]]],
  ['4/4 triplet quavers beam together', T(4, 4), 'q3 q3 q3 c c c', [[0, 1, 2]]],
  ['4/4 minim then quaver pairs', T(4, 4), 'm q q c', [[1, 2]]],
  ['4/4 rest breaks the second half', T(4, 4), 'q q q q q q q rq', [[0, 1, 2, 3], [4, 5]]],
  ['4/4 crotchet rest then minim then quavers', T(4, 4), 'rc m q q', [[2, 3]]],
  ['4/4 mixed quavers and semiquavers beam per beat', T(4, 4), 'q q x x x x c c', [[0, 1], [2, 3, 4, 5]]],
  ['4/4 tie does not break a beam', T(4, 4), 'q~ q q q c c', [[0, 1, 2, 3]]],
  ['2/4 full bar of quavers', T(2, 4), 'q q q q', [[0, 1, 2, 3]]],
  ['2/4 one pair then a crotchet', T(2, 4), 'q q c', [[0, 1]]],
  ['2/4 semiquavers then quavers beam per beat', T(2, 4), 'x x x x q q', [[0, 1, 2, 3], [4, 5]]],
  ['3/4 full bar of quavers', T(3, 4), 'q q q q q q', [[0, 1, 2, 3, 4, 5]]],
  ['3/4 crotchet, pair, crotchet', T(3, 4), 'c q q c', [[1, 2]]],
  ['3/4 not a full bar of quavers: per beat', T(3, 4), 'q q q q c', [[0, 1], [2, 3]]],
  ['3/8 full bar of three quavers', T(3, 8), 'q q q', [[0, 1, 2]]],
  ['3/8 semiquavers and quaver', T(3, 8), 'x x x x q', [[0, 1, 2, 3, 4]]],
  ['2/2 eight quavers: groups of four per minim beat', T(2, 2), 'q q q q q q q q', [[0, 1, 2, 3], [4, 5, 6, 7]]],
  ['2/2 crotchets: none', T(2, 2), 'c c c c', []],
  ['4/2 quavers beam within the minim beat', T(4, 2), 'q q q q m m m', [[0, 1, 2, 3]]],
  // --- compound time ---
  ['6/8 six quavers: two groups of three', T(6, 8), 'q q q q q q', [[0, 1, 2], [3, 4, 5]]],
  ['6/8 crotchet quaver pairs: none', T(6, 8), 'c q c q', []],
  ['6/8 three quavers then crotchet and quaver', T(6, 8), 'q q q c q', [[0, 1, 2]]],
  ['6/8 dotted crotchets: none', T(6, 8), 'c. c.', []],
  ['6/8 rest in the first group', T(6, 8), 'q rq q q q q', [[3, 4, 5]]],
  ['6/8 quaver and four semiquavers per beat', T(6, 8), 'q x x x x q x x x x', [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]],
  ['6/8 tie keeps the group', T(6, 8), 'q~ q q c.', [[0, 1, 2]]],
  ['6/8 crotchet over the beat is not beamed', T(6, 8), 'q q c q q', [[0, 1], [3, 4]]],
  ['9/8 nine quavers: three groups', T(9, 8), 'q q q q q q q q q', [[0, 1, 2], [3, 4, 5], [6, 7, 8]]],
  ['12/8 dotted crotchet then quavers', T(12, 8), 'c. q q q c. q q q', [[1, 2, 3], [5, 6, 7]]],
  ['12/8 twelve quavers: four groups', T(12, 8), 'q q q q q q q q q q q q', [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]]],
  ['6/4 six quavers in the dotted-minim beat', T(6, 4), 'q q q q q q c c c', [[0, 1, 2, 3, 4, 5]]],
  // --- irregular ---
  ['5/4 quavers beam within each crotchet beat', T(5, 4), 'q q q q c c c', [[0, 1], [2, 3]]],
];

describe('beamGroups', () => {
  it.each(cases)('%s', (_name, time, text, expected) => {
    expect(rhythm.beamGroups(bar(text), time)).toEqual(expected);
  });

  it('needs at least two notes in a group', () => {
    expect(rhythm.beamGroups(bar('q c q c c'), T(4, 4))).toEqual([]);
  });
});
