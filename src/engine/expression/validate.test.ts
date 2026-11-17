import { describe, expect, it } from 'vitest';
import type { Bar, Expression } from '../types';
import { expression } from './index';
import { passage, ref, withBars, withEvents } from './test-helpers';

const four = 'c c c c';
const check = (bars: string[], expr?: Expression, extras: Record<number, Partial<Bar>> = {}, events: Record<string, Record<string, unknown>> = {}) =>
  expression.validateExpression(withEvents(withBars(passage(bars, expr), extras), events));

// name, bars, expression, bar extras, event extras, exact messages expected (events count from 1, rests count).
type Row = [string, string[], Expression | undefined, Record<number, Partial<Bar>>, Record<string, Record<string, unknown>>, string[]];
const rows: Row[] = [
  // --- valid ---
  ['a passage with no expression is valid', [four], undefined, {}, {}, []],
  [
    'a passage using every field correctly is valid',
    [four, four, four],
    {
      dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(1, 0), level: 'f' }],
      hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }],
      slurs: [{ from: ref(1, 0), to: ref(1, 3) }],
      tempo: { text: 'Andante', bpm: 80 },
      tempoChanges: [{ kind: 'rit', from: ref(1, 2), to: ref(1, 3) }, { kind: 'a-tempo', at: ref(2, 0) }],
      words: [{ at: ref(0, 0), text: 'dolce', place: 'below', lang: 'it' }],
    },
    { 0: { repeatStart: true }, 1: { endBarline: 'repeat-end' }, 2: { endBarline: 'final' } },
    { '0:0': { articulations: ['staccato'] }, '2:3': { fermata: true } },
    [],
  ],

  // --- rule 1: references ---
  [
    'a dynamic in a bar that does not exist',
    [four, four],
    { dynamics: [{ at: ref(2, 0), level: 'f' }] },
    {},
    {},
    ['Bar 3, event 1: this dynamic points at a bar that does not exist (the passage has 2)'],
  ],
  [
    'a dynamic on an event that does not exist',
    [four],
    { dynamics: [{ at: ref(0, 7), level: 'f' }] },
    {},
    {},
    ['Bar 1, event 8: this dynamic points at an event that does not exist (bar 1 has 4)'],
  ],
  [
    'a negative reference',
    [four],
    { words: [{ at: ref(-1, 0), text: 'dolce' }] },
    {},
    {},
    ['Bar 0, event 1: this word marking points at a bar that does not exist (the passage has 1)'],
  ],
  [
    'a slur to an event that does not exist',
    [four],
    { slurs: [{ from: ref(0, 0), to: ref(0, 9) }] },
    {},
    {},
    ['Bar 1, event 10: this slur points at an event that does not exist (bar 1 has 4)'],
  ],
  [
    'a tempo change in a missing bar',
    [four],
    { tempoChanges: [{ kind: 'accel', from: ref(3, 0), to: ref(3, 1) }] },
    {},
    {},
    [
      'Bar 4, event 1: this accelerando points at a bar that does not exist (the passage has 1)',
      'Bar 4, event 2: this accelerando points at a bar that does not exist (the passage has 1)',
    ],
  ],

  // --- rule 2: spans and slurs ---
  [
    'a slur may not end on a rest',
    [four.replace('c c c c', 'c c rc c')],
    { slurs: [{ from: ref(0, 0), to: ref(0, 2) }] },
    {},
    {},
    ['Bar 1, rest 3: a slur must end on a note'],
  ],
  [
    'a slur may not start on a rest',
    ['rc c c c'],
    { slurs: [{ from: ref(0, 0), to: ref(0, 2) }] },
    {},
    {},
    ['Bar 1, rest 1: a slur must start on a note'],
  ],
  [
    'a slur may not start and end on the same note',
    [four],
    { slurs: [{ from: ref(0, 1), to: ref(0, 1) }] },
    {},
    {},
    ['Bar 1, note 2: a slur must join two or more different notes, but this one starts and ends on the same note'],
  ],
  [
    'a slur may not end before it starts',
    [four],
    { slurs: [{ from: ref(0, 2), to: ref(0, 0) }] },
    {},
    {},
    ['Bar 1, note 1: a slur ends before it starts (it starts at bar 1, note 3)'],
  ],
  [
    'a slur across a bar line is fine, and may contain a rest',
    ['c c rc c', four],
    { slurs: [{ from: ref(0, 1), to: ref(1, 2) }] },
    {},
    {},
    [],
  ],
  [
    'a hairpin may not end before it starts',
    [four, four],
    { hairpins: [{ kind: 'cresc', from: ref(1, 0), to: ref(0, 3) }] },
    {},
    {},
    ['Bar 1, note 4: this crescendo hairpin ends before it starts (it starts at bar 2, note 1)'],
  ],
  [
    'a diminuendo hairpin on a single event is allowed',
    [four],
    { hairpins: [{ kind: 'dim', from: ref(0, 1), to: ref(0, 1) }] },
    {},
    {},
    [],
  ],
  [
    'a tempo change may not end before it starts',
    [four],
    { tempoChanges: [{ kind: 'rall', from: ref(0, 3), to: ref(0, 1) }] },
    {},
    {},
    ['Bar 1, note 2: this rallentando ends before it starts (it starts at bar 1, note 4)'],
  ],

  // --- rule 3: dynamics ---
  [
    'two dynamics on one event',
    [four],
    { dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(0, 0), level: 'f' }] },
    {},
    {},
    ['Bar 1, note 1: there is more than one dynamic on this event'],
  ],
  [
    'two dynamics in a row at the same level',
    [four, four],
    { dynamics: [{ at: ref(0, 0), level: 'mf' }, { at: ref(1, 0), level: 'mf' }] },
    {},
    {},
    ['Bar 2, note 1: the dynamic mf is the same as the one before it; two dynamics in a row must be different'],
  ],
  [
    'the order of the dynamics list does not matter',
    [four, four],
    { dynamics: [{ at: ref(1, 0), level: 'mf' }, { at: ref(0, 0), level: 'mf' }] },
    {},
    {},
    ['Bar 2, note 1: the dynamic mf is the same as the one before it; two dynamics in a row must be different'],
  ],
  [
    'the same level again after a different one is fine',
    [four],
    { dynamics: [{ at: ref(0, 0), level: 'mf' }, { at: ref(0, 1), level: 'p' }, { at: ref(0, 2), level: 'mf' }] },
    {},
    {},
    [],
  ],

  // --- rule 4: hairpins ---
  [
    'hairpins may not overlap',
    [four, four],
    {
      hairpins: [
        { kind: 'cresc', from: ref(0, 0), to: ref(0, 2) },
        { kind: 'dim', from: ref(0, 2), to: ref(1, 0) },
      ],
    },
    {},
    {},
    ['Bar 1, note 3: this diminuendo hairpin overlaps the crescendo hairpin that starts at bar 1, note 1'],
  ],
  [
    'hairpins that follow each other are fine',
    [four],
    {
      hairpins: [
        { kind: 'cresc', from: ref(0, 0), to: ref(0, 1) },
        { kind: 'dim', from: ref(0, 2), to: ref(0, 3) },
      ],
    },
    {},
    {},
    [],
  ],

  // --- rule 5: tempo ---
  [
    'metronome mark too slow',
    [four],
    { tempo: { bpm: 19 } },
    {},
    {},
    ['Bar 1, event 1: the metronome mark must be 20 to 240 beats a minute (got 19)'],
  ],
  [
    'metronome mark too fast',
    [four],
    { tempo: { bpm: 241 } },
    {},
    {},
    ['Bar 1, event 1: the metronome mark must be 20 to 240 beats a minute (got 241)'],
  ],
  ['a metronome mark of 20 is allowed', [four], { tempo: { bpm: 20 } }, {}, {}, []],
  ['a metronome mark of 240 is allowed', [four], { tempo: { bpm: 240 } }, {}, {}, []],
  [
    'toBpm out of range',
    [four],
    { tempoChanges: [{ kind: 'rit', from: ref(0, 0), to: ref(0, 3), toBpm: 300 }] },
    {},
    {},
    ['Bar 1, note 1: the target tempo of this ritardando must be 20 to 240 beats a minute (got 300)'],
  ],
  [
    'a tempo with nothing before it',
    [four, four],
    { tempoChanges: [{ kind: 'a-tempo', at: ref(1, 0) }] },
    {},
    {},
    ['Bar 2, note 1: a tempo must come after an accelerando, ritardando or rallentando that has ended'],
  ],
  [
    'a tempo inside the change it should follow',
    [four, four],
    {
      tempoChanges: [{ kind: 'rit', from: ref(0, 0), to: ref(0, 3) }, { kind: 'a-tempo', at: ref(0, 3) }],
    },
    {},
    {},
    ['Bar 1, note 4: a tempo must come after an accelerando, ritardando or rallentando that has ended'],
  ],
  [
    'a tempo right after the change is fine',
    [four, four],
    {
      tempoChanges: [{ kind: 'accel', from: ref(0, 0), to: ref(0, 3) }, { kind: 'a-tempo', at: ref(1, 0) }],
    },
    {},
    {},
    [],
  ],
  [
    'a tempo may follow a rit. word once its two bars are over',
    [four, four, four],
    {
      words: [{ at: ref(0, 2), text: 'rit.' }],
      tempoChanges: [{ kind: 'a-tempo', at: ref(2, 0) }],
    },
    {},
    {},
    [],
  ],
  [
    'a tempo inside the two bars of a rit. word is too early',
    [four, four, four],
    {
      words: [{ at: ref(0, 2), text: 'rit.' }],
      tempoChanges: [{ kind: 'a-tempo', at: ref(1, 0) }],
    },
    {},
    {},
    ['Bar 2, note 1: a tempo must come after an accelerando, ritardando or rallentando that has ended'],
  ],
  [
    'tempo changes may not overlap',
    [four],
    {
      tempoChanges: [
        { kind: 'accel', from: ref(0, 0), to: ref(0, 2) },
        { kind: 'rit', from: ref(0, 2), to: ref(0, 3) },
      ],
    },
    {},
    {},
    ['Bar 1, note 3: this ritardando overlaps the accelerando that starts at bar 1, note 1'],
  ],

  // --- rule 6: words ---
  [
    'empty words',
    [four],
    { words: [{ at: ref(0, 0), text: '' }] },
    {},
    {},
    ['Bar 1, note 1: words must be 1 to 24 characters (got 0)'],
  ],
  [
    'words of 25 characters',
    [four],
    { words: [{ at: ref(0, 1), text: 'a'.repeat(25) }] },
    {},
    {},
    ['Bar 1, note 2: words must be 1 to 24 characters (got 25)'],
  ],
  ['words of 24 characters are allowed', [four], { words: [{ at: ref(0, 1), text: 'a'.repeat(24) }] }, {}, {}, []],
  ['one character is allowed', [four], { words: [{ at: ref(0, 1), text: 'p' }] }, {}, {}, []],

  // --- rule 7: repeats ---
  ['a repeat end with no start sign anywhere repeats from the beginning', [four, four], undefined, { 1: { endBarline: 'repeat-end' } }, {}, []],
  [
    'a repeat end with a start sign',
    [four, four, four],
    undefined,
    { 1: { repeatStart: true }, 2: { endBarline: 'repeat-end' } },
    {},
    [],
  ],
  [
    'a repeat end before the only start sign has nothing to go back to',
    [four, four, four],
    undefined,
    { 0: { endBarline: 'repeat-end' }, 1: { repeatStart: true }, 2: { endBarline: 'repeat-end' } },
    {},
    ['Bar 1: this repeat end has no start repeat sign before it'],
  ],
  [
    'a start sign with no repeat end',
    [four, four],
    undefined,
    { 0: { repeatStart: true } },
    {},
    ['Bar 1: this start repeat has no repeat end after it'],
  ],
  [
    'a second repeat end with no start sign of its own',
    [four, four, four],
    undefined,
    { 0: { repeatStart: true, endBarline: 'repeat-end' }, 2: { endBarline: 'repeat-end' } },
    {},
    ['Bar 3: this repeat end has no start repeat sign before it'],
  ],
  [
    'a start sign before the last one is closed',
    [four, four, four],
    undefined,
    { 0: { repeatStart: true }, 1: { repeatStart: true }, 2: { endBarline: 'repeat-end' } },
    {},
    ['Bar 2: this start repeat comes before the repeat started in bar 1 has been closed'],
  ],
  [
    'only one segno',
    [four, four, four],
    undefined,
    { 0: { marker: 'segno' }, 2: { marker: 'segno' } },
    {},
    ['Bar 3: only one segno is allowed (the first is in bar 1)'],
  ],
  ['D.S. needs a segno', [four, four], undefined, { 1: { marker: 'ds' } }, {}, ['Bar 2: D.S. needs a segno marked in the passage']],
  [
    'D.S. al Fine needs a segno and a Fine',
    [four, four],
    undefined,
    { 1: { marker: 'ds-al-fine' } },
    {},
    ['Bar 2: D.S. al Fine needs a segno marked in the passage', 'Bar 2: D.S. al Fine needs a Fine marked in the passage'],
  ],
  [
    'D.C. al Fine needs a Fine',
    [four, four],
    undefined,
    { 1: { marker: 'dc-al-fine' } },
    {},
    ['Bar 2: D.C. al Fine needs a Fine marked in the passage'],
  ],
  ['a plain D.C. needs nothing', [four, four], undefined, { 1: { marker: 'dc' } }, {}, []],
  [
    'D.S. al Fine with a segno and a Fine is valid',
    [four, four, four],
    undefined,
    { 0: { marker: 'segno' }, 1: { marker: 'fine' }, 2: { marker: 'ds-al-fine' } },
    {},
    [],
  ],

  // --- rule 8: ties ---
  [
    'a tie continuation with its own articulation',
    [four],
    undefined,
    {},
    { '0:0': { tieToNext: true }, '0:1': { articulations: ['staccato'] } },
    ['Bar 1, note 2: this note continues a tie, so it cannot have its own articulation or pause; put it on the first note of the tie'],
  ],
  [
    'a tie continuation with its own pause, across a bar line',
    [four, four],
    undefined,
    {},
    { '0:3': { tieToNext: true }, '1:0': { fermata: true } },
    ['Bar 2, note 1: this note continues a tie, so it cannot have its own articulation or pause; put it on the first note of the tie'],
  ],
  [
    'the first note of a tie may carry articulation and a pause',
    [four],
    undefined,
    {},
    { '0:0': { tieToNext: true, articulations: ['tenuto'], fermata: true } },
    [],
  ],
  [
    'an empty articulation list on a continuation is fine',
    [four],
    undefined,
    {},
    { '0:0': { tieToNext: true }, '0:1': { articulations: [] } },
    [],
  ],
  [
    'a continuation may carry a dynamic',
    [four],
    { dynamics: [{ at: ref(0, 1), level: 'f' }] },
    {},
    { '0:0': { tieToNext: true } },
    [],
  ],
];

describe('validateExpression', () => {
  it.each(rows)('%s', (_name, bars, expr, extras, events, expected) => {
    expect(check(bars, expr, extras, events)).toEqual(expected);
  });

  it('reports every problem, not just the first', () => {
    const got = check([four], {
      words: [{ at: ref(0, 0), text: '' }],
      tempo: { bpm: 5 },
      slurs: [{ from: ref(0, 1), to: ref(0, 1) }],
    });
    expect(got).toHaveLength(3);
  });

  it('does not throw on references to nothing', () => {
    expect(() =>
      check([four], {
        dynamics: [{ at: ref(9, 9), level: 'f' }],
        hairpins: [{ kind: 'dim', from: ref(9, 9), to: ref(8, 8) }],
        slurs: [{ from: ref(0, 0), to: ref(7, 7) }],
        tempoChanges: [{ kind: 'a-tempo', at: ref(5, 5) }],
        words: [{ at: ref(-3, 1.5), text: 'x' }],
      }),
    ).not.toThrow();
  });

  it('does not change its argument', () => {
    const p = passage([four], { slurs: [{ from: ref(0, 0), to: ref(0, 3) }] });
    const before = JSON.stringify(p);
    expression.validateExpression(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});
