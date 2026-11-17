import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Bar, Expression, TimeSignature } from '../types';
import { expression } from './index';
import { T, passage, ref, withBars, withEvents } from './test-helpers';

const four = 'c c c c';

/** Times and durations of every event in written order, flattened. */
function flatten(p: ReturnType<typeof passage>, bpm: number) {
  const map = expression.tempoMap(p, bpm);
  const times: number[] = [];
  const durations: number[] = [];
  p.bars.forEach((b, bi) =>
    b.events.forEach((_, ei) => {
      times.push(map.timeOf(bi, ei));
      durations.push(map.durationOf(bi, ei));
    }),
  );
  return { times, durations, total: map.totalSeconds };
}

function close(got: number[], expected: number[], digits = 4): void {
  expect(got).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(got[i]).toBeCloseTo(v, digits));
}

interface Case {
  name: string;
  bars: string[];
  expr?: Expression;
  extras?: Record<string, Record<string, unknown>>;
  time?: TimeSignature;
  bpm: number;
  times: number[];
  durations: number[];
  total: number;
}

const third = 1 / 3;

// Every expected number is worked out by hand.
// A ramp of L beats from v0 to v1 bpm (linear in beats) takes 60 * L / (v1 - v0) * ln(v1 / v0) seconds,
// and the time to reach x beats into it is the same with ln(vb / v0), vb = v0 + (v1 - v0) * x / L.
// ln 2 = 0.693147, ln 1.5 = 0.405465, ln 0.7 = -0.356675, ln 0.85 = -0.162519, ln 0.875 = -0.133531.
const cases: Case[] = [
  { name: 'steady 4/4 at 60', bars: [four], bpm: 60, times: [0, 1, 2, 3], durations: [1, 1, 1, 1], total: 4 },
  {
    name: 'steady 4/4 at 120, two bars',
    bars: [four, four],
    bpm: 120,
    times: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    durations: Array<number>(8).fill(0.5),
    total: 4,
  },
  {
    name: 'fermata on the last note adds a held ending',
    bars: [four],
    extras: { '0:3': { fermata: true } },
    bpm: 60,
    times: [0, 1, 2, 3],
    durations: [1, 1, 1, 2],
    total: 5,
  },
  {
    name: 'fermata mid-passage pushes later events back',
    bars: [four, four],
    extras: { '0:1': { fermata: true } },
    bpm: 60,
    times: [0, 1, 3, 4, 5, 6, 7, 8],
    durations: [1, 2, 1, 1, 1, 1, 1, 1],
    total: 9,
  },
  {
    name: 'fermata on a rest',
    bars: ['c rc c c'],
    extras: { '0:1': { fermata: true } },
    bpm: 60,
    times: [0, 1, 3, 4],
    durations: [1, 2, 1, 1],
    total: 5,
  },
  {
    name: 'two fermatas add up',
    bars: [four],
    extras: { '0:0': { fermata: true }, '0:2': { fermata: true } },
    bpm: 60,
    times: [0, 2, 3, 5],
    durations: [2, 1, 2, 1],
    total: 6,
  },
  {
    name: 'fermata on a minim at 120 (0.5 s a beat): 1 s becomes 2 s',
    bars: ['m m'],
    extras: { '0:0': { fermata: true } },
    bpm: 120,
    times: [0, 2],
    durations: [2, 1],
    total: 3,
  },
  {
    name: 'a whole-bar rest takes the full bar',
    bars: ['rs', four],
    time: T(3, 4),
    bpm: 60,
    times: [0, 3, 4, 5, 6],
    durations: [3, 1, 1, 1, 1],
    total: 7,
  },
  {
    // Event 0 takes 2 ln(90/60) = 0.810930 and the whole ramp 2 ln 2 = 1.386294, so event 1 takes 0.575364.
    // Events 2 and 3 are at 120 bpm: 0.5 s each.
    name: 'accel with toBpm',
    bars: [four],
    expr: { tempoChanges: [{ kind: 'accel', from: ref(0, 0), to: ref(0, 1), toBpm: 120 }] },
    bpm: 60,
    times: [0, 0.81093, 1.386294, 1.886294],
    durations: [0.81093, 0.575364, 0.5, 0.5],
    total: 2.386294,
  },
  {
    name: 'accel then a tempo: the next bar is back at 60',
    bars: [four, four],
    expr: {
      tempoChanges: [
        { kind: 'accel', from: ref(0, 0), to: ref(0, 1), toBpm: 120 },
        { kind: 'a-tempo', at: ref(1, 0) },
      ],
    },
    bpm: 60,
    times: [0, 0.81093, 1.386294, 1.886294, 2.386294, 3.386294, 4.386294, 5.386294],
    durations: [0.81093, 0.575364, 0.5, 0.5, 1, 1, 1, 1],
    total: 6.386294,
  },
  {
    name: 'accel holds its new tempo when there is no a tempo',
    bars: [four, four],
    expr: { tempoChanges: [{ kind: 'accel', from: ref(0, 0), to: ref(0, 1), toBpm: 120 }] },
    bpm: 60,
    times: [0, 0.81093, 1.386294, 1.886294, 2.386294, 2.886294, 3.386294, 3.886294],
    durations: [0.81093, 0.575364, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    total: 4.386294,
  },
  {
    // accel default x1.35: 60 to 81 over one bar of 4 beats: (240 / 21) ln 1.35 = 3.429767.
    name: 'accel with the default factor',
    bars: [four],
    expr: { tempoChanges: [{ kind: 'accel', from: ref(0, 0), to: ref(0, 3) }] },
    bpm: 60,
    times: [0, 0.958646, 1.843065, 2.66393],
    durations: [0.958646, 0.884419, 0.820865, 0.765837],
    total: 3.429767,
  },
  {
    // rit default x0.7: 60 to 42 over beats 2..4. Event 3 is at beat 3 where the tempo is 51:
    // 2 + (120 / -18) ln(51/60) = 3.083459. The ramp is 2.377833 long, so bar 1 starts at 4.377833 and runs at
    // 42 bpm, 1.428571 s a beat.
    name: 'rit with the default factor, held after',
    bars: [four, four],
    expr: { tempoChanges: [{ kind: 'rit', from: ref(0, 2), to: ref(0, 3) }] },
    bpm: 60,
    times: [0, 1, 2, 3.08346, 4.377833, 5.806404, 7.234976, 8.663547],
    durations: [1, 1, 1.08346, 1.294373, 1.428571, 1.428571, 1.428571, 1.428571],
    total: 10.092118,
  },
  {
    // 120 to 60 over four beats. Tempo after x beats is 120 - 15x: 120, 105, 90, 75, 60.
    // Times: -4 ln(vb / 120) = 0, 0.534126, 1.150728, 1.880015, 2.772589.
    name: 'rit with toBpm over a whole bar',
    bars: [four],
    expr: { tempoChanges: [{ kind: 'rit', from: ref(0, 0), to: ref(0, 3), toBpm: 60 }] },
    bpm: 120,
    times: [0, 0.534126, 1.150728, 1.880015],
    durations: [0.534126, 0.616602, 0.729287, 0.892574],
    total: 2.772589,
  },
  {
    // rall default x0.65: 60 to 39 over four beats (tempo 60 - 5.25x): (240 / -21) ln 0.65 = 4.923233.
    name: 'rall with the default factor',
    bars: [four],
    expr: { tempoChanges: [{ kind: 'rall', from: ref(0, 0), to: ref(0, 3) }] },
    bpm: 60,
    times: [0, 1.046482, 2.198536, 3.479876],
    durations: [1.046482, 1.152054, 1.28134, 1.443357],
    total: 4.923233,
  },
  {
    // A ramp is measured from the tempo in force at its first event, not from the base: after a rit to 42,
    // an accel to 84 takes (120 / 42) ln 2 = 1.980421. rit takes 2.377833. a tempo goes back to 60 (not 42).
    name: 'rit, then accel, then a tempo: a tempo returns to the tempo before the first change',
    bars: [four, four],
    expr: {
      tempoChanges: [
        { kind: 'rit', from: ref(0, 0), to: ref(0, 1) },
        { kind: 'accel', from: ref(0, 2), to: ref(0, 3), toBpm: 84 },
        { kind: 'a-tempo', at: ref(1, 2) },
      ],
    },
    bpm: 60,
    times: [0, 1.08346, 2.377833, 3.536304, 4.358254, 5.07254, 5.786826, 6.786826],
    durations: [1.08346, 1.294373, 1.158471, 0.82195, 0.714286, 0.714286, 1, 1],
    total: 7.786826,
  },
  {
    // The word rit. covers the rest of its bar and the whole of the next: beats 2 to 8, six beats from 60 to 42.
    // Time into the ramp after x beats: -20 ln((60 - 3x) / 60), added to 2.
    // Beats 2, 3 (x 0, 1), then bar 1 at x 2, 3, 4, 5, then bar 2 starts at x 6 = 9.133499 and runs at 42 bpm.
    name: 'the word rit. acts on the rest of its bar and the whole next bar',
    bars: [four, four, four],
    expr: { words: [{ at: ref(0, 2), text: 'rit.' }] },
    bpm: 60,
    times: [0, 1, 2, 3.025866, 4.10721, 5.250379, 6.462871, 7.753641, 9.133499, 10.56207, 11.990641, 13.419213],
    durations: [1, 1, 1.025866, 1.081344, 1.143169, 1.212492, 1.29077, 1.37986, 1.428571, 1.428571, 1.428571, 1.428571],
    total: 14.847784,
  },
  {
    name: 'the word accel. in the last bar is clamped to that bar (default x1.35)',
    bars: [four],
    expr: { words: [{ at: ref(0, 0), text: 'accel.' }] },
    bpm: 60,
    times: [0, 0.958646, 1.843065, 2.66393],
    durations: [0.958646, 0.884419, 0.820865, 0.765837],
    total: 3.429767,
  },
  {
    name: 'an explicit change beats a rit. word that starts inside it',
    bars: [four, four],
    expr: {
      tempoChanges: [{ kind: 'rit', from: ref(0, 0), to: ref(0, 3), toBpm: 60 }],
      words: [{ at: ref(0, 1), text: 'rit.' }],
    },
    bpm: 120,
    times: [0, 0.534126, 1.150728, 1.880015, 2.772589, 3.772589, 4.772589, 5.772589],
    durations: [0.534126, 0.616602, 0.729287, 0.892574, 1, 1, 1, 1],
    total: 6.772589,
  },
  {
    name: 'a fermata inside a rit takes twice the slowed time',
    bars: [four],
    expr: { tempoChanges: [{ kind: 'rit', from: ref(0, 0), to: ref(0, 3), toBpm: 60 }] },
    extras: { '0:1': { fermata: true } },
    bpm: 120,
    times: [0, 0.534126, 1.76733, 2.496617],
    durations: [0.534126, 1.233204, 0.729287, 0.892574],
    total: 3.389191,
  },
  {
    name: 'compound time: 6/8 counts dotted-crotchet beats (fermata on the third quaver)',
    bars: ['q q q q q q'],
    time: T(6, 8),
    extras: { '0:2': { fermata: true } },
    bpm: 60,
    times: [0, third, 2 * third, 4 * third, 5 * third, 2],
    durations: [third, third, 2 * third, third, third, third],
    total: 7 / 3,
  },
  {
    // 6/8 is two beats a bar. 60 to 120 over those two beats: 2 ln(1 + x / 2) with x = k / 3 beats.
    name: 'compound time: accel over a 6/8 bar',
    bars: ['q q q q q q'],
    time: T(6, 8),
    expr: { tempoChanges: [{ kind: 'accel', from: ref(0, 0), to: ref(0, 5), toBpm: 120 }] },
    bpm: 60,
    times: [0, 0.308301, 0.575364, 0.81093, 1.021651, 1.212272],
    durations: [0.308301, 0.267063, 0.235566, 0.210721, 0.190621, 0.174022],
    total: 1.386294,
  },
  {
    name: 'compound time: 6/8 at 120 with dotted crotchets',
    bars: ['c. c.', 'c. c.'],
    time: T(6, 8),
    bpm: 120,
    times: [0, 0.5, 1, 1.5],
    durations: [0.5, 0.5, 0.5, 0.5],
    total: 2,
  },
  {
    name: 'a minim beat in 2/2',
    bars: ['m m'],
    time: T(2, 2),
    bpm: 60,
    times: [0, 1],
    durations: [1, 1],
    total: 2,
  },
];

describe('tempoMap', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    let p = passage(c.bars, c.expr, c.time);
    if (c.extras) p = withEvents(p, c.extras);
    const got = flatten(p, c.bpm);
    close(got.times, c.times);
    close(got.durations, c.durations);
    expect(got.total).toBeCloseTo(c.total, 4);
  });

  it('rejects a non-positive tempo', () => {
    expect(() => expression.tempoMap(passage([four]), 0)).toThrow(TheoryError);
    expect(() => expression.tempoMap(passage([four]), Number.NaN)).toThrow(TheoryError);
  });

  it('rejects a position that is not in the passage', () => {
    expect(() => expression.tempoMap(passage([four]), 60).timeOf(1, 0)).toThrow(TheoryError);
  });

  it('ignores the passage metronome mark: the bpm given is authoritative', () => {
    const p = passage([four], { tempo: { text: 'Allegro', bpm: 200 } });
    expect(expression.tempoMap(p, 60).timeOf(0, 1)).toBeCloseTo(1, 9);
  });
});

describe('performedEvents', () => {
  const key = (e: { bar: number; event: number }) => `${e.bar}:${e.event}`;

  it('is the written schedule when there are no repeats', () => {
    const got = expression.performedEvents(passage([four, 'c c m']), 60);
    expect(got.map(key)).toEqual(['0:0', '0:1', '0:2', '0:3', '1:0', '1:1', '1:2']);
    close(got.map((e) => e.time), [0, 1, 2, 3, 4, 5, 6]);
    close(got.map((e) => e.duration), [1, 1, 1, 1, 1, 1, 2]);
  });

  it('plays a repeat twice with times running on', () => {
    const p = withBars(passage([four, four]), { 0: { endBarline: 'repeat-end' } });
    const got = expression.performedEvents(p, 60);
    expect(got.map((e) => e.bar)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
    close(got.map((e) => e.time), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(got.slice(4, 8).map(key)).toEqual(['0:0', '0:1', '0:2', '0:3']);
  });

  it('D.C. al Fine plays bars 0 and 1 again and stops at the Fine, fermata included', () => {
    const bars: Record<number, Partial<Bar>> = { 1: { marker: 'fine' }, 2: { marker: 'dc-al-fine' } };
    const p = withEvents(withBars(passage([four, four, four]), bars), { '1:3': { fermata: true } });
    const got = expression.performedEvents(p, 60);
    expect(got.map((e) => e.bar)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1]);
    // First pass: bar 0 at 0..3, bar 1 at 4..7 (last note held 2 s), bar 2 at 9..12, then bar 0 at 13..16, bar 1 at 17..20.
    close(
      got.map((e) => e.time),
      [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    );
    expect(got[7]!.duration).toBeCloseTo(2, 9);
    expect(got[19]!.duration).toBeCloseTo(2, 9);
  });

  it('a repeated rit happens again: the repeated bar is timed exactly as before', () => {
    const p = withBars(passage([four], { tempoChanges: [{ kind: 'rit', from: ref(0, 0), to: ref(0, 3), toBpm: 60 }] }), {
      0: { endBarline: 'repeat-end' },
    });
    const got = expression.performedEvents(p, 120);
    close(got.slice(0, 4).map((e) => e.time), [0, 0.534126, 1.150728, 1.880015]);
    // The second pass starts when the first ends, 2.772589, with the same spacing.
    close(got.slice(4).map((e) => e.time), [2.772589, 3.306715, 3.923317, 4.652604]);
  });

  it('D.S. returns to the written tempo at the segno bar (a tempo state is not carried)', () => {
    const bars: Record<number, Partial<Bar>> = { 0: { marker: 'segno' }, 1: { marker: 'ds' } };
    const got = expression.performedEvents(withBars(passage([four, four]), bars), 120);
    expect(got.map((e) => e.bar)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1]);
    expect(got[15]!.time).toBeCloseTo(7.5, 9);
  });

  it('with no expression, times are the plain onsets (90 bpm: a beat is 2/3 s)', () => {
    // Bar 0 is c c m = 4 beats = 8/3 s. Bar 1: c. lasts 1.5 beats = 1 s, q half a beat.
    const got = expression.performedEvents(passage(['c c m', 'c. q m']), 90);
    close(got.map((e) => e.time), [0, 2 / 3, 4 / 3, 8 / 3, 11 / 3, 4], 9);
  });
});
