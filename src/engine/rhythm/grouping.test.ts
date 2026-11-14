import { describe, expect, it } from 'vitest';
import type { TimeSignature } from '../types';
import type { Duration, Fraction, ScoreEvent } from '../types';
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
  ['4/4 beats 2-3 silent as two crotchet rests', T(4, 4), 'c rc rc c'],
  ['4/4 crotchet rest in each half', T(4, 4), 'rc c c rc'],
  ['4/4 single crotchet rests on beats 1 and 3', T(4, 4), 'rc c rc c'],
  ['12/8 whole-bar semibreve rest', T(12, 8), 'rs'],
  ['9/8 whole-bar semibreve rest', T(9, 8), 'rs'],
  ['4/2 minim rest on beats 1-2', T(4, 2), 'rm m m'],
  ['4/2 beats 2-3 silent as two minim rests', T(4, 2), 'm rm rm m'],
  ['12/8 dotted minim rest on beats 1-2', T(12, 8), 'rm. c. c.'],
  ['12/8 dotted minim rest on beats 3-4', T(12, 8), 'c. c. rm.'],
  ['12/8 beats 2-3 silent as two dotted crotchet rests', T(12, 8), 'c. rc. rc. c.'],
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
  ['4/4 two crotchet rests fill beats 1-2', T(4, 4), 'rc rc c c', 0],
  ['4/4 two crotchet rests fill beats 3-4', T(4, 4), 'c c rc rc', 2],
  ['4/4 crotchet rests fill beats 1-2 after the note check', T(4, 4), 'rc rc m', 0],
  ['4/2 two minim rests fill beats 1-2', T(4, 2), 'rm rm m m', 0],
  ['4/2 two minim rests fill beats 3-4', T(4, 2), 'm m rm rm', 2],
  ['12/8 two dotted crotchet rests fill beats 1-2', T(12, 8), 'rc. rc. c. c.', 0],
  ['12/8 two dotted crotchet rests fill beats 3-4', T(12, 8), 'c. c. rc. rc.', 2],
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

  it('words the two-beat-rest advice for each metre', () => {
    expect(rhythm.groupingProblems(bar('rc rc c c'), T(4, 4))[0].message).toBe(
      'Beats 1 and 2 are completely silent, so write them as one minim rest instead of two crotchet rests.',
    );
    expect(rhythm.groupingProblems(bar('m m rm rm'), T(4, 2))[0].message).toBe(
      'Beats 3 and 4 are completely silent, so write them as one semibreve rest instead of two minim rests.',
    );
    expect(rhythm.groupingProblems(bar('rc. rc. c. c.'), T(12, 8))[0].message).toBe(
      'Beats 1 and 2 are completely silent, so write them as one dotted minim rest instead of two dotted crotchet rests.',
    );
  });

  it('uses grammatical wording for off-beat positions', () => {
    expect(rhythm.groupingProblems(bar('c c. q c'), T(4, 4))[0].message).toBe(
      'This dotted crotchet starts on beat 2 and carries across the middle of the bar. Split it into two tied notes so the middle of the bar (the start of beat 3) can be seen.',
    );
    expect(rhythm.groupingProblems(bar('c q c q c'), T(4, 4))[0].message).toBe(
      'This crotchet starts part-way through beat 2 and carries across the middle of the bar. Split it into two tied notes so the middle of the bar (the start of beat 3) can be seen.',
    );
  });

  it('returns an empty list for an empty bar', () => {
    expect(rhythm.groupingProblems({ events: [] }, T(4, 4))).toEqual([]);
  });
});

describe('groupingProblems accepts exactly what restsToFill produces', () => {
  const noteOf = (value: Duration['value'], dots: 0 | 1 | 2 = 0): ScoreEvent => ({
    kind: 'note',
    pitches: [{ letter: 'C', accidental: 0, octave: 4 }],
    duration: { value, dots },
  });
  const f = (n: number, d: number): Fraction => ({ n, d });

  // Whole-beat gaps: [metre, beat note, beats in bar]. The rest of the bar is
  // one-beat notes, which are always correctly grouped.
  const beatMetres: [TimeSignature, Duration['value'], 0 | 1, number][] = [
    [T(4, 4), 'crotchet', 0, 4],
    [T(4, 2), 'minim', 0, 4],
    [T(12, 8), 'crotchet', 1, 4],
    [T(3, 4), 'crotchet', 0, 3],
    [T(2, 4), 'crotchet', 0, 2],
    [T(6, 8), 'crotchet', 1, 2],
    [T(9, 8), 'crotchet', 1, 3],
  ];
  const beatGaps: [TimeSignature, Duration['value'], 0 | 1, number, number, number][] = [];
  for (const [time, value, dots, n] of beatMetres) {
    for (let from = 0; from < n; from++) {
      for (let count = 1; from + count <= n; count++) {
        beatGaps.push([time, value, dots, n, from, count]);
      }
    }
  }

  it.each(beatGaps)('%j beats gap', (time, value, dots, n, from, count) => {
    const beat = rhythm.beatLength(time);
    const events: ScoreEvent[] = [];
    for (let i = 0; i < from; i++) events.push(noteOf(value, dots));
    const gap = rhythm.restsToFill(
      f(beat.n * from, beat.d),
      f(beat.n * count, beat.d),
      time,
    );
    for (const duration of gap) events.push({ kind: 'rest', duration });
    for (let i = from + count; i < n; i++) events.push(noteOf(value, dots));
    expect(rhythm.groupingProblems({ events }, time)).toEqual([]);
  });

  // Gaps on the quaver grid in 4/4, with quavers filling the rest of the bar.
  const quaverGaps: [number, number][] = [];
  for (let from = 0; from < 8; from++) {
    for (let count = 1; from + count <= 8; count++) quaverGaps.push([from, count]);
  }
  it.each(quaverGaps)('4/4 quaver gap from %i length %i', (from, count) => {
    const events: ScoreEvent[] = [];
    for (let i = 0; i < from; i++) events.push(noteOf('quaver'));
    for (const duration of rhythm.restsToFill(f(from, 8), f(count, 8), T(4, 4))) {
      events.push({ kind: 'rest', duration });
    }
    for (let i = from + count; i < 8; i++) events.push(noteOf('quaver'));
    expect(rhythm.groupingProblems({ events }, T(4, 4))).toEqual([]);
  });
});
