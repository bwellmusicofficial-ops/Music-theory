import { describe, expect, it } from 'vitest';
import type { Bar } from '../types';
import { expression } from './index';
import { passage, withBars } from './test-helpers';

type Extra = Partial<Bar>;
const RS: Extra = { repeatStart: true };
const RE: Extra = { endBarline: 'repeat-end' };
const both: Extra = { repeatStart: true, endBarline: 'repeat-end' };
const mark = (marker: NonNullable<Bar['marker']>): Extra => ({ marker });

// name, extras per bar (array index = bar), expected playing order. Every bar is "c c c c".
const cases: [string, Extra[], number[]][] = [
  ['no signs', [{}, {}, {}], [0, 1, 2]],
  ['repeat with no start sign goes back to the beginning', [{}, RE, {}], [0, 1, 0, 1, 2]],
  ['repeat with a start sign', [{}, RS, RE, {}], [0, 1, 2, 1, 2, 3]],
  ['one bar repeated', [{}, both, {}], [0, 1, 1, 2]],
  ['two separate repeats', [both, {}, both], [0, 0, 1, 2, 2]],
  ['start sign on bar 0', [RS, {}, RE, {}], [0, 1, 2, 0, 1, 2, 3]],
  ['repeat end on the last bar', [RS, RE], [0, 1, 0, 1]],
  ['D.C. plain on the last bar', [{}, {}, mark('dc')], [0, 1, 2, 0, 1, 2]],
  ['D.C. al Fine', [{}, mark('fine'), mark('dc-al-fine')], [0, 1, 2, 0, 1]],
  ['Fine is ignored on the first pass', [{}, mark('fine'), {}, mark('dc-al-fine')], [0, 1, 2, 3, 0, 1]],
  ['D.S. plain', [{}, mark('segno'), mark('ds')], [0, 1, 2, 1, 2]],
  ['D.S. al Fine', [{}, mark('segno'), mark('fine'), mark('ds-al-fine')], [0, 1, 2, 3, 1, 2]],
  ['D.S. al Fine with the segno on bar 0', [mark('segno'), mark('fine'), mark('ds-al-fine')], [0, 1, 2, 0, 1]],
  ['repeats are not taken again after a D.C.', [RS, RE, mark('dc')], [0, 1, 0, 1, 2, 0, 1, 2]],
  ['repeats are not taken again after a D.S. al Fine', [mark('segno'), both, mark('fine'), mark('ds-al-fine')], [0, 1, 1, 2, 3, 0, 1, 2]],
  ['D.C. al Fine stops at Fine even where a repeat end sits', [{}, { marker: 'fine', endBarline: 'repeat-end' }, mark('dc-al-fine')], [0, 1, 0, 1, 2, 0, 1]],
  ['repeat end and D.C. on the same bar: repeat first, then the D.C.', [{}, { endBarline: 'repeat-end', marker: 'dc' }], [0, 1, 0, 1, 0, 1]],
  ['a D.S. with no segno is just played on', [{}, mark('ds')], [0, 1]],
  ['a D.C. al Fine with no Fine plays the whole piece again', [{}, mark('dc-al-fine')], [0, 1, 0, 1]],
  ['segno alone does nothing', [mark('segno'), {}], [0, 1]],
  ['final barline alone does nothing', [{}, { endBarline: 'final' }], [0, 1]],
];

describe('performanceOrder', () => {
  it.each(cases)('%s', (_name, extras, expected) => {
    const base = passage(extras.map(() => 'c c c c'));
    const p = withBars(base, Object.fromEntries(extras.map((e, i) => [i, e])));
    expect(expression.performanceOrder(p)).toEqual(expected);
  });

  it('is [0..n-1] for a passage with no expression', () => {
    expect(expression.performanceOrder(passage(['c c c c', 'c c c c', 'c c c c', 'c c c c']))).toEqual([0, 1, 2, 3]);
  });

  it('is [0..n-1] when only expression fields and no signs are present', () => {
    const p = passage(['c c c c', 'c c c c'], { dynamics: [{ at: { bar: 0, event: 0 }, level: 'f' }] });
    expect(expression.performanceOrder(p)).toEqual([0, 1]);
  });

  it('does not change its argument', () => {
    const p = withBars(passage(['c c c c', 'c c c c']), { 1: RE });
    const before = JSON.stringify(p);
    expression.performanceOrder(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});
