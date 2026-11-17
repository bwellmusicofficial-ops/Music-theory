import { describe, expect, it } from 'vitest';
import type { Articulation, Expression } from '../types';
import { expression } from './index';
import { passage, ref, withEvents } from './test-helpers';

type Extras = Record<string, Record<string, unknown>>;
const art = (...a: Articulation[]) => ({ articulations: a });
const four = 'c c c c';

// name, bars, expression, per-event extras ("bar:event"), expected fractions (null = rest or tied continuation).
const cases: [string, string[], Expression | undefined, Extras, (number | null)[][]][] = [
  ['no expression: full length', [four], undefined, {}, [[1, 1, 1, 1]]],
  ['rests are null', ['c rc c c'], undefined, {}, [[1, null, 1, 1]]],
  ['dynamics and hairpins alone do not shorten notes', [four], { dynamics: [{ at: ref(0, 0), level: 'p' }] }, {}, [[1, 1, 1, 1]]],
  ['a pause alone does not shorten notes', [four], undefined, { '0:3': { fermata: true } }, [[1, 1, 1, 1]]],
  ['empty articulation lists count as none', [four], undefined, { '0:0': { articulations: [] } }, [[1, 1, 1, 1]]],
  ['staccato makes the others plain (0.85)', [four], undefined, { '0:1': art('staccato') }, [[0.85, 0.4, 0.85, 0.85]]],
  ['tenuto is full length, the others plain', [four], undefined, { '0:1': art('tenuto') }, [[0.85, 1, 0.85, 0.85]]],
  ['an accent alone changes loudness, not length, but the rest are plain', [four], undefined, { '0:2': art('accent') }, [[0.85, 0.85, 0.85, 0.85]]],
  ['accent with staccato: staccato length', [four], undefined, { '0:2': art('accent', 'staccato') }, [[0.85, 0.85, 0.4, 0.85]]],
  ['staccato beats tenuto when both are written', [four], undefined, { '0:0': art('tenuto', 'staccato') }, [[0.4, 0.85, 0.85, 0.85]]],
  [
    'a slur: all but the last note are full length',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 2) }] },
    {},
    [[1, 1, 0.85, 0.85]],
  ],
  [
    'a slur across a bar line',
    [four, four],
    { slurs: [{ from: ref(0, 2), to: ref(1, 1) }] },
    {},
    [[0.85, 0.85, 1, 1], [1, 0.85, 0.85, 0.85]],
  ],
  [
    'staccato inside a slur is overridden by the slur',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 3) }] },
    { '0:1': art('staccato') },
    [[1, 1, 1, 0.85]],
  ],
  [
    'the last note of a slur takes its own articulation (staccato)',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 3) }] },
    { '0:3': art('staccato') },
    [[1, 1, 1, 0.4]],
  ],
  [
    'the last note of a slur with tenuto',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 1) }] },
    { '0:1': art('tenuto') },
    [[1, 1, 0.85, 0.85]],
  ],
  [
    'two slurs side by side: the last note of the first is plain',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 1) }, { from: ref(0, 2), to: ref(0, 3) }] },
    {},
    [[1, 0.85, 1, 0.85]],
  ],
  [
    'a slur ending on a note that starts the next slur is joined into it',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 1) }, { from: ref(0, 1), to: ref(0, 3) }] },
    {},
    [[1, 1, 1, 0.85]],
  ],
  [
    'rests inside a slur stay null',
    ['c c rc c'],
    { slurs: [{ from: ref(0, 0), to: ref(0, 3) }] },
    {},
    [[1, 1, null, 0.85]],
  ],
  [
    // The tie is events 0 and 1. The first note carries the staccato for the merged sound; the continuation is null.
    'a tie takes the first note articulation and the continuation is null',
    [four],
    undefined,
    { '0:0': { tieToNext: true, ...art('staccato') } },
    [[0.4, null, 0.85, 0.85]],
  ],
  [
    'a tie inside a slur: the whole chain is slurred',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 3) }] },
    { '0:1': { tieToNext: true } },
    [[1, 1, null, 0.85]],
  ],
  [
    // The slur ends on the continuation (event 2), so the chain (events 1-2) holds the slur's last note: plain.
    'a slur that ends on the continuation of a tie ends on that chain',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 2) }] },
    { '0:1': { tieToNext: true } },
    [[1, 0.85, null, 0.85]],
  ],
  [
    'a tie across a bar line with tenuto on the first note',
    [four, four],
    undefined,
    { '0:3': { tieToNext: true, ...art('tenuto') } },
    [[0.85, 0.85, 0.85, 1], [null, 0.85, 0.85, 0.85]],
  ],
];

describe('soundingLengths', () => {
  it.each(cases)('%s', (_name, bars, expr, extras, expected) => {
    expect(expression.soundingLengths(withEvents(passage(bars, expr), extras))).toEqual(expected);
  });

  it('does not change its argument', () => {
    const p = passage([four], { slurs: [{ from: ref(0, 0), to: ref(0, 3) }] });
    const before = JSON.stringify(p);
    expression.soundingLengths(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('soundingDetails', () => {
  it('flags the staccato floor on staccato notes only', () => {
    const p = withEvents(passage([four]), { '0:0': art('staccato'), '0:1': art('tenuto') });
    expect(expression.soundingDetails(p)[0]).toEqual([
      { fraction: 0.4, overlap: false, staccato: true },
      { fraction: 1, overlap: false, staccato: false },
      { fraction: 0.85, overlap: false, staccato: false },
      { fraction: 0.85, overlap: false, staccato: false },
    ]);
  });

  it('flags the overlap on slurred notes except the last of the slur', () => {
    const p = passage([four], { slurs: [{ from: ref(0, 0), to: ref(0, 2) }] });
    expect(expression.soundingDetails(p)[0]!.map((d) => d?.overlap)).toEqual([true, true, false, false]);
  });

  it('has no flags and no shortening for a passage without articulation or slurs', () => {
    expect(expression.soundingDetails(passage([four]))[0]).toEqual(
      Array.from({ length: 4 }, () => ({ fraction: 1, overlap: false, staccato: false })),
    );
  });

  it('is null for rests and tied continuations', () => {
    const p = withEvents(passage(['c rc c c']), { '0:2': { tieToNext: true } });
    expect(expression.soundingDetails(p)[0]!.map((d) => d === null)).toEqual([false, true, false, true]);
  });

  it('publishes the two timing constants', () => {
    expect(expression.staccatoMinSeconds).toBe(0.06);
    expect(expression.slurOverlapSeconds).toBe(0.02);
  });
});
