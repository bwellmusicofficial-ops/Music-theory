import { describe, expect, it } from 'vitest';
import type { TimeSignature } from '../types';
import { rhythm } from './index';
import { bar, T } from './test-helpers';

// Correctly grouped bars: no problems expected.
const correct: [string, TimeSignature, string][] = [
  ['4/4 four crotchets', T(4, 4), 'c c c c'],
  ['4/4 minim and two crotchets', T(4, 4), 'm c c'],
  ['4/4 minim on beat 2 (syncopation)', T(4, 4), 'c m c'],
  ['4/4 dotted minim on beat 1', T(4, 4), 'm. c'],
  ['4/4 semibreve', T(4, 4), 's'],
  ['4/4 whole-bar rest', T(4, 4), 'rs'],
  ['4/4 minim rest on beat 1', T(4, 4), 'rm c c'],
  ['4/4 minim rest on beat 3', T(4, 4), 'c c rm'],
  ['4/4 syncopated quaver-crotchet-quaver', T(4, 4), 'q c q c c'],
  ['4/4 crotchet rest, minim, crotchet', T(4, 4), 'rc m c'],
  ['4/4 dotted crotchet rest on beat 1', T(4, 4), 'rc. q m'],
  ['3/4 minim and crotchet', T(3, 4), 'm c'],
  ['3/4 crotchet then two crotchet rests', T(3, 4), 'c rc rc'],
  ['3/4 rests on beats 1 and 2', T(3, 4), 'rc rc c'],
  ['2/4 syncopated quavers', T(2, 4), 'q c q'],
  ['2/2 two minims', T(2, 2), 'm m'],
  ['4/2 whole-bar breve rest', T(4, 2), 'rB'],
  ['6/8 two dotted crotchets', T(6, 8), 'c. c.'],
  ['6/8 crotchet quaver pairs', T(6, 8), 'c q c q'],
  ['6/8 quaver crotchet quaver crotchet', T(6, 8), 'q c q c'],
  ['6/8 quaver, crotchet, then three quavers', T(6, 8), 'q c q q q'],
  ['6/8 dotted minim', T(6, 8), 'm.'],
  ['6/8 dotted crotchet rest then note', T(6, 8), 'rc. c.'],
  ['6/8 crotchet rest and quaver rest', T(6, 8), 'rc rq c.'],
  ['9/8 three dotted crotchets', T(9, 8), 'c. c. c.'],
  ['12/8 dotted minim then dotted crotchets', T(12, 8), 'm. c. c.'],
];

// Wrongly grouped bars: exactly one problem, at the given event index.
const wrong: [string, TimeSignature, string, number][] = [
  ['4/4 dotted crotchet over the middle', T(4, 4), 'c c. q c', 1],
  ['4/4 off-beat crotchet over the middle', T(4, 4), 'c q c q c', 2],
  ['4/4 off-beat minim over the middle', T(4, 4), 'q m c.', 1],
  ['4/4 dotted minim on beat 2', T(4, 4), 'c m.', 1],
  ['4/4 dotted minim starting off the beat', T(4, 4), 'q m. q', 1],
  ['6/8 three crotchets hide beat 2', T(6, 8), 'c c c', 1],
  ['6/8 minim hides beat 2', T(6, 8), 'm c', 0],
  ['6/8 two quavers and a crotchet over the beat', T(6, 8), 'q q c q q', 2],
  ['4/4 minim rest on beat 2', T(4, 4), 'c rm c', 1],
  ['3/4 minim rest on beat 1', T(3, 4), 'rm rc', 0],
  ['3/4 minim rest on beat 2', T(3, 4), 'c rm', 1],
  ['6/8 quaver rest then crotchet rest for a silent beat', T(6, 8), 'rq rc c.', 0],
  ['6/8 three quaver rests for a silent beat', T(6, 8), 'rq rq rq c.', 0],
  ['4/4 dotted minim rest crosses the middle', T(4, 4), 'rm. c', 0],
  ['2/4 minim rest as a whole bar', T(2, 4), 'rm', 0],
  ['4/4 four crotchet rests as a whole bar', T(4, 4), 'rc rc rc rc', 0],
  ['6/8 dotted minim rest as a whole bar', T(6, 8), 'rm.', 0],
  ['4/4 off-beat crotchet rest hides beat 2', T(4, 4), 'q rc q c c', 1],
  ['4/4 dotted crotchet rest on beat 2 hides beat 3', T(4, 4), 'c rc. q c', 1],
  ['4/2 two semibreve rests instead of a breve rest', T(4, 2), 'rs rs', 0],
  ['9/8 dotted minim rest joins two beats', T(9, 8), 'c. rm.', 1],
  ['12/8 two-beat rest on beat 2', T(12, 8), 'c. rm. c.', 1],
  ['4/4 two quaver rests fill beat 1', T(4, 4), 'rq rq c m', 0],
];

describe('groupingProblems: correct bars', () => {
  it.each(correct)('%s', (_name, time, text) => {
    expect(rhythm.groupingProblems(bar(text), time)).toEqual([]);
  });
});

describe('groupingProblems: wrong bars', () => {
  it.each(wrong)('%s', (_name, time, text, index) => {
    const problems = rhythm.groupingProblems(bar(text), time);
    expect(problems.map((p) => p.eventIndex)).toEqual([index]);
    expect(problems[0].message.length).toBeGreaterThan(20);
  });

  it('returns an empty list for an empty bar', () => {
    expect(rhythm.groupingProblems({ events: [] }, T(4, 4))).toEqual([]);
  });
});
