import { describe, expect, it } from 'vitest';
import type { Expression } from '../types';
import { expression } from './index';
import { passage, ref, withEvents } from './test-helpers';

type Rows = (number | null)[][];

function expectRows(got: Rows, expected: Rows): void {
  expect(got).toHaveLength(expected.length);
  expected.forEach((row, b) => {
    expect(got[b]).toHaveLength(row.length);
    row.forEach((v, e) => {
      if (v === null) expect(got[b]![e]).toBeNull();
      else expect(got[b]![e]).toBeCloseTo(v, 6);
    });
  });
}

const four = 'c c c c';

// name, bars (rhythm shorthand), expression, expected dB per bar and event.
// Every expected number is worked out by hand in the comment beside it.
const cases: [string, string[], Expression | undefined, Rows][] = [
  ['no expression: everything at mf, rests null', ['c rc c c'], undefined, [[0, null, 0, 0]]],
  [
    'dynamics step: p then f',
    [four, four],
    { dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(1, 0), level: 'f' }] },
    [[-10, -10, -10, -10], [4, 4, 4, 4]],
  ],
  [
    'every level has its value',
    [four, four],
    {
      dynamics: [
        { at: ref(0, 0), level: 'pp' },
        { at: ref(0, 1), level: 'p' },
        { at: ref(0, 2), level: 'mp' },
        { at: ref(0, 3), level: 'mf' },
        { at: ref(1, 0), level: 'f' },
        { at: ref(1, 1), level: 'ff' },
      ],
    },
    [[-15, -10, -5, 0], [4, 7, 7, 7]],
  ],
  [
    'first dynamic comes later: mf until then',
    [four],
    { dynamics: [{ at: ref(0, 2), level: 'f' }] },
    [[0, 0, 4, 4]],
  ],
  [
    'dynamic on a rest still sets the level for the next note',
    ['rc c c c'],
    { dynamics: [{ at: ref(0, 0), level: 'pp' }] },
    [[null, -15, -15, -15]],
  ],
  [
    // p = -10 to f = +4 over four equal crotchets: onsets 0, 1/4, 1/2, 3/4 of a span of 1 whole note.
    // fraction 0, .25, .5, .75 of 14 dB: -10, -6.5, -3, +0.5. Then f holds: 4.
    'cresc hairpin to the next dynamic',
    [four, four],
    {
      dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(1, 0), level: 'f' }],
      hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }],
    },
    [[-10, -6.5, -3, 0.5], [4, 4, 4, 4]],
  ],
  [
    // f = 4 to p = -10 over bar 0; 14 dB down: 4, 0.5, -3, -6.5. Next bar p.
    'dim hairpin to the next dynamic',
    [four, four],
    {
      dynamics: [{ at: ref(0, 0), level: 'f' }, { at: ref(1, 0), level: 'p' }],
      hairpins: [{ kind: 'dim', from: ref(0, 0), to: ref(0, 3) }],
    },
    [[4, 0.5, -3, -6.5], [-10, -10, -10, -10]],
  ],
  [
    // No dynamic: starts at mf (0), two steps up is ff (+7). Quarters of 7: 0, 1.75, 3.5, 5.25. Then holds at 7.
    'cresc with no later dynamic goes two steps up and holds',
    [four, four],
    { hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }] },
    [[0, 1.75, 3.5, 5.25], [7, 7, 7, 7]],
  ],
  [
    // p (-10) two steps up is f? ladder pp p mp mf f ff: p is index 1, +2 = mf (0). Quarters of 10: -10, -7.5, -5, -2.5. Holds at 0.
    'cresc two steps from p ends at mf',
    [four, four],
    { dynamics: [{ at: ref(0, 0), level: 'p' }], hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }] },
    [[-10, -7.5, -5, -2.5], [0, 0, 0, 0]],
  ],
  [
    // f (4) two steps down is mp (-5): span 9 dB, quarters: 4, 1.75, -0.5, -2.75. Holds at -5.
    'dim with no later dynamic goes two steps down',
    [four, four],
    { dynamics: [{ at: ref(0, 0), level: 'f' }], hairpins: [{ kind: 'dim', from: ref(0, 0), to: ref(0, 3) }] },
    [[4, 1.75, -0.5, -2.75], [-5, -5, -5, -5]],
  ],
  [
    'cresc from ff is clamped: stays at ff',
    [four],
    { dynamics: [{ at: ref(0, 0), level: 'ff' }], hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }] },
    [[7, 7, 7, 7]],
  ],
  [
    // p is index 1; two down clamps at pp (-15). p -10 to pp -15: quarters of -5: -10, -11.25, -12.5, -13.75. Holds -15.
    'dim from p is clamped at pp',
    [four, four],
    { dynamics: [{ at: ref(0, 0), level: 'p' }], hairpins: [{ kind: 'dim', from: ref(0, 0), to: ref(0, 3) }] },
    [[-10, -11.25, -12.5, -13.75], [-15, -15, -15, -15]],
  ],
  [
    // m c c: onsets 0, 1/2, 3/4; span 1 whole note. mf 0 to f 4: 0, 2, 3 (by onset position, not by note count).
    'hairpin interpolates by onset position, not note count',
    ['m c c', four],
    {
      dynamics: [{ at: ref(1, 0), level: 'f' }],
      hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 2) }],
    },
    [[0, 2, 3], [4, 4, 4, 4]],
  ],
  [
    // Hairpin on events 1..2 only (c c): span 1/2 whole note, onsets 1/4 and 1/2 -> 0 and .5 of 4 dB: 0, 2... see below.
    // From event 1 (onset 1/4) to end of event 2 (3/4): span 1/2. Event 1: 0, event 2: (1/2-1/4)/(1/2)=.5 -> 2.
    // Event 3 is back to the held target (4), because a hairpin leaves its target in force.
    'hairpin in the middle of a bar holds its target afterwards',
    [four, four],
    {
      dynamics: [{ at: ref(1, 0), level: 'f' }],
      hairpins: [{ kind: 'cresc', from: ref(0, 1), to: ref(0, 2) }],
    },
    [[0, 0, 2, 4], [4, 4, 4, 4]],
  ],
  [
    // A hairpin that starts on an event that has a dynamic uses that dynamic as its start (p -10).
    // Target mp... next dynamic after the last event is f (4): 14 dB over 4 notes. Same as the first hairpin case.
    'dynamic on the hairpin start event is the start level',
    [four, four],
    {
      dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(1, 0), level: 'f' }],
      hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }],
    },
    [[-10, -6.5, -3, 0.5], [4, 4, 4, 4]],
  ],
  [
    // The dynamic ON the hairpin's last event is not "after" it, so the hairpin ignores it:
    // no later dynamic, mf up two steps = ff (7), over events 0..1 (span 1/2): 0 and 3.5.
    'a dynamic on the last event of a hairpin does not count as its target',
    [four],
    {
      dynamics: [{ at: ref(0, 1), level: 'p' }],
      hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 1) }],
    },
    [[0, 3.5, 7, 7]],
  ],
  [
    // Words cresc. on event 0 with f on event 3: ramp over events 0..2 (the events before the f):
    // span = 3/4 of a whole note; onsets 0, 1/4, 1/2 -> fractions 0, 1/3, 2/3 of 4 dB: 0, 4/3, 8/3. Then f = 4.
    'cresc. as words runs to the next dynamic',
    [four],
    { dynamics: [{ at: ref(0, 3), level: 'f' }], words: [{ at: ref(0, 0), text: 'cresc.' }] },
    [[0, 4 / 3, 8 / 3, 4]],
  ],
  [
    // dim. word, mf (0) to p (-10) at bar 1 event 0: ramp covers all of bar 0 (events 0..3): 0, -2.5, -5, -7.5; then p.
    'dim. as words, spelled out in full, runs to the next dynamic',
    [four, four],
    { dynamics: [{ at: ref(1, 0), level: 'p' }], words: [{ at: ref(0, 0), text: 'diminuendo' }] },
    [[0, -2.5, -5, -7.5], [-10, -10, -10, -10]],
  ],
  [
    // No dynamic: runs to the end of the bar after next (bar 0 + 2 = bar 2): 12 events, mf up to ff (7):
    // event k gets 7k/12. Bar 3 holds at 7.
    'cresc. as words with no dynamic runs to the end of the bar after next',
    [four, four, four, four],
    { words: [{ at: ref(0, 0), text: 'cresc.' }] },
    [
      [0, 7 / 12, 14 / 12, 21 / 12],
      [28 / 12, 35 / 12, 42 / 12, 49 / 12],
      [56 / 12, 63 / 12, 70 / 12, 77 / 12],
      [7, 7, 7, 7],
    ],
  ],
  [
    // Starting mid-bar at event 2 of bar 0, last bar is bar 2: events (0,2) (0,3) then bars 1 and 2: 10 events, 2 + 4 + 4.
    // mf down two steps = p (-10). Event k from the start: -10k/10 = -k.
    'dim. as words mid-bar with no dynamic',
    [four, four, four, four],
    { words: [{ at: ref(0, 2), text: 'dim.' }] },
    [
      [0, 0, 0, -1],
      [-2, -3, -4, -5],
      [-6, -7, -8, -9],
      [-10, -10, -10, -10],
    ],
  ],
  [
    // The word is clamped by the end of the passage: 2 bars only, ramp over all 8 events, mf down to p (-10): -10k/8.
    'dim. as words is clamped to the last bar',
    [four, four],
    { words: [{ at: ref(0, 0), text: 'dim.' }] },
    [
      [0, -1.25, -2.5, -3.75],
      [-5, -6.25, -7.5, -8.75],
    ],
  ],
  [
    // A word that starts inside a real hairpin is ignored; the hairpin is the only ramp: 0, 1.75, 3.5, 5.25 then 7.
    'cresc. words inside a hairpin are ignored',
    [four, four],
    {
      hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }],
      words: [{ at: ref(0, 1), text: 'dim.' }],
    },
    [[0, 1.75, 3.5, 5.25], [7, 7, 7, 7]],
  ],
  [
    'other words (dolce) change nothing',
    [four],
    { words: [{ at: ref(0, 0), text: 'dolce' }] },
    [[0, 0, 0, 0]],
  ],
];

describe('loudnessAt', () => {
  it.each(cases)('%s', (_name, bars, expr, expected) => {
    expectRows(expression.loudnessAt(passage(bars, expr)), expected);
  });

  it('accent adds 5 dB to that note only', () => {
    const p = withEvents(passage([four]), { '0:1': { articulations: ['accent'] } });
    expectRows(expression.loudnessAt(p), [[0, 5, 0, 0]]);
  });

  it('accent adds 5 dB on top of a dynamic', () => {
    const p = withEvents(passage([four], { dynamics: [{ at: ref(0, 0), level: 'p' }] }), {
      '0:1': { articulations: ['accent'] },
    });
    expectRows(expression.loudnessAt(p), [[-10, -5, -10, -10]]);
  });

  it('accent inside a hairpin: the interpolated -3 plus 5', () => {
    // p to f over bar 0: -10, -6.5, -3, 0.5. Accent on event 2: -3 + 5 = 2.
    const p = withEvents(
      passage([four, four], {
        dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(1, 0), level: 'f' }],
        hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }],
      }),
      { '0:2': { articulations: ['accent'] } },
    );
    expectRows(expression.loudnessAt(p), [[-10, -6.5, 2, 0.5], [4, 4, 4, 4]]);
  });

  it('a rest is null even with a dynamic and a fermata on it', () => {
    const p = withEvents(passage(['rc c c c'], { dynamics: [{ at: ref(0, 0), level: 'f' }] }), { '0:0': { fermata: true } });
    expectRows(expression.loudnessAt(p), [[null, 4, 4, 4]]);
  });

  it('a tied note sounds as one at the first note level, accent included', () => {
    // c~ c c c with an accent on the first note and p from the start: first -10 + 5 = -5; continuation the same.
    const p = withEvents(passage([four], { dynamics: [{ at: ref(0, 0), level: 'p' }] }), {
      '0:0': { tieToNext: true, articulations: ['accent'] },
    });
    expectRows(expression.loudnessAt(p), [[-5, -5, -10, -10]]);
  });

  it('a tied note inside a hairpin keeps the first note level (not the interpolated continuation)', () => {
    // p to f over bar 0 as before: -10, -6.5, -3, 0.5. Event 1 is tied to event 2: event 2 repeats -6.5.
    const p = withEvents(
      passage([four, four], {
        dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(1, 0), level: 'f' }],
        hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }],
      }),
      { '0:1': { tieToNext: true } },
    );
    expectRows(expression.loudnessAt(p), [[-10, -6.5, -6.5, 0.5], [4, 4, 4, 4]]);
  });

  it('slurs do not change loudness', () => {
    const p = passage([four], { slurs: [{ from: ref(0, 0), to: ref(0, 3) }] });
    expectRows(expression.loudnessAt(p), [[0, 0, 0, 0]]);
  });

  it('exports the level table the audio layer needs', () => {
    const levels = expression.loudnessAt(
      passage(['c c c c', 'c c'], {
        dynamics: (['pp', 'p', 'mp', 'mf', 'f', 'ff'] as const).map((level, i) => ({ at: ref(i < 4 ? 0 : 1, i < 4 ? i : i - 4), level })),
      }),
    );
    expect(levels.flat()).toEqual([-15, -10, -5, 0, 4, 7]);
  });

  it('does not change its argument', () => {
    const p = passage([four], { hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }] });
    const before = JSON.stringify(p);
    expression.loudnessAt(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});
