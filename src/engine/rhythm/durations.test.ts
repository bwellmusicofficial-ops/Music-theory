import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Duration, Fraction, TimeSignature } from '../types';
import { rhythm } from './index';
import { bar, T } from './test-helpers';

const d = (
  value: Duration['value'],
  dots: 0 | 1 | 2 = 0,
  tuplet?: { actual: number; normal: number },
): Duration => ({ value, dots, ...(tuplet ? { tuplet } : {}) });

describe('durationLength', () => {
  const cases: [string, Duration, Fraction][] = [
    ['breve', d('breve'), { n: 2, d: 1 }],
    ['semibreve', d('semibreve'), { n: 1, d: 1 }],
    ['minim', d('minim'), { n: 1, d: 2 }],
    ['crotchet', d('crotchet'), { n: 1, d: 4 }],
    ['quaver', d('quaver'), { n: 1, d: 8 }],
    ['semiquaver', d('semiquaver'), { n: 1, d: 16 }],
    ['demisemiquaver', d('demisemiquaver'), { n: 1, d: 32 }],
    ['dotted breve', d('breve', 1), { n: 3, d: 1 }],
    ['dotted semibreve', d('semibreve', 1), { n: 3, d: 2 }],
    ['dotted minim', d('minim', 1), { n: 3, d: 4 }],
    ['dotted crotchet', d('crotchet', 1), { n: 3, d: 8 }],
    ['dotted quaver', d('quaver', 1), { n: 3, d: 16 }],
    ['dotted semiquaver', d('semiquaver', 1), { n: 3, d: 32 }],
    ['double-dotted minim', d('minim', 2), { n: 7, d: 8 }],
    ['double-dotted crotchet', d('crotchet', 2), { n: 7, d: 16 }],
    ['double-dotted semibreve', d('semibreve', 2), { n: 7, d: 4 }],
    ['crotchet triplet', d('crotchet', 0, { actual: 3, normal: 2 }), { n: 1, d: 6 }],
    ['quaver triplet', d('quaver', 0, { actual: 3, normal: 2 }), { n: 1, d: 12 }],
    ['semiquaver triplet', d('semiquaver', 0, { actual: 3, normal: 2 }), { n: 1, d: 24 }],
    ['minim triplet', d('minim', 0, { actual: 3, normal: 2 }), { n: 1, d: 3 }],
    ['crotchet duplet', d('crotchet', 0, { actual: 2, normal: 3 }), { n: 3, d: 8 }],
    ['quaver duplet', d('quaver', 0, { actual: 2, normal: 3 }), { n: 3, d: 16 }],
    ['quaver quintuplet 5:4', d('quaver', 0, { actual: 5, normal: 4 }), { n: 1, d: 10 }],
    ['semiquaver sextuplet 6:4', d('semiquaver', 0, { actual: 6, normal: 4 }), { n: 1, d: 24 }],
    ['dotted quaver triplet', d('quaver', 1, { actual: 3, normal: 2 }), { n: 1, d: 8 }],
  ];
  it.each(cases)('%s', (_name, duration, expected) => {
    expect(rhythm.durationLength(duration)).toEqual(expected);
  });

  it('rejects invalid durations', () => {
    expect(() => rhythm.durationLength({ value: 'crotchet', dots: 3 as 2 })).toThrow(TheoryError);
    expect(() =>
      rhythm.durationLength({ value: 'crotchet', dots: 0, tuplet: { actual: 0, normal: 2 } }),
    ).toThrow(TheoryError);
    expect(() => rhythm.durationLength({ value: 'nope' as 'minim', dots: 0 })).toThrow(TheoryError);
  });
});

describe('barLength', () => {
  const cases: [TimeSignature, Fraction][] = [
    [T(2, 4), { n: 1, d: 2 }],
    [T(3, 4), { n: 3, d: 4 }],
    [T(4, 4), { n: 1, d: 1 }],
    [T(2, 2), { n: 1, d: 1 }],
    [T(3, 2), { n: 3, d: 2 }],
    [T(4, 2), { n: 2, d: 1 }],
    [T(3, 8), { n: 3, d: 8 }],
    [T(6, 8), { n: 3, d: 4 }],
    [T(9, 8), { n: 9, d: 8 }],
    [T(12, 8), { n: 3, d: 2 }],
    [T(5, 4), { n: 5, d: 4 }],
    [T(7, 8), { n: 7, d: 8 }],
    [T(6, 4), { n: 3, d: 2 }],
  ];
  it.each(cases)('%j', (time, expected) => {
    expect(rhythm.barLength(time)).toEqual(expected);
  });

  it('rejects bad time signatures', () => {
    expect(() => rhythm.barLength({ beats: 0, beatUnit: 4 })).toThrow(TheoryError);
    expect(() => rhythm.barLength({ beats: 3, beatUnit: 3 as 4 })).toThrow(TheoryError);
  });
});

describe('fraction helpers', () => {
  it('adds in lowest terms', () => {
    expect(rhythm.addFractions({ n: 1, d: 4 }, { n: 1, d: 4 })).toEqual({ n: 1, d: 2 });
    expect(rhythm.addFractions({ n: 1, d: 3 }, { n: 1, d: 6 })).toEqual({ n: 1, d: 2 });
    expect(rhythm.addFractions({ n: 3, d: 8 }, { n: 5, d: 8 })).toEqual({ n: 1, d: 1 });
    expect(rhythm.addFractions({ n: 2, d: 4 }, { n: 0, d: 5 })).toEqual({ n: 1, d: 2 });
  });
  it('compares', () => {
    expect(rhythm.compareFractions({ n: 1, d: 2 }, { n: 2, d: 4 })).toBe(0);
    expect(rhythm.compareFractions({ n: 1, d: 3 }, { n: 1, d: 2 })).toBeLessThan(0);
    expect(rhythm.compareFractions({ n: 3, d: 4 }, { n: 2, d: 3 })).toBeGreaterThan(0);
  });
  it('rejects a zero denominator', () => {
    expect(() => rhythm.addFractions({ n: 1, d: 0 }, { n: 1, d: 2 })).toThrow(TheoryError);
  });
  it('keeps eventsLength and durationLength arithmetic for a whole-bar rest', () => {
    expect(rhythm.eventsLength(bar('rs').events)).toEqual({ n: 1, d: 1 });
    expect(rhythm.barLength(T(3, 4))).toEqual({ n: 3, d: 4 });
  });
  it('sums event lengths', () => {
    expect(rhythm.eventsLength(bar('c c m').events)).toEqual({ n: 1, d: 1 });
    expect(rhythm.eventsLength(bar('q3 q3 q3 rc').events)).toEqual({ n: 1, d: 2 });
    expect(rhythm.eventsLength(bar('m. q').events)).toEqual({ n: 7, d: 8 });
    expect(rhythm.eventsLength([])).toEqual({ n: 0, d: 1 });
  });
});

describe('checkBarLength', () => {
  const cases: [string, string, TimeSignature, string, Fraction][] = [
    ['full 4/4', 'c c c c', T(4, 4), 'complete', { n: 0, d: 1 }],
    ['short by a crotchet', 'c c c', T(4, 4), 'short', { n: 1, d: 4 }],
    ['long by a quaver', 'c c c c q', T(4, 4), 'long', { n: 1, d: 8 }],
    ['6/8 complete', 'c. c.', T(6, 8), 'complete', { n: 0, d: 1 }],
    ['6/8 short by a quaver', 'c. c', T(6, 8), 'short', { n: 1, d: 8 }],
    ['3/4 long by a dotted crotchet', 'm. c.', T(3, 4), 'long', { n: 3, d: 8 }],
    ['triplets complete 2/4', 'q3 q3 q3 c', T(2, 4), 'complete', { n: 0, d: 1 }],
    ['empty bar', '', T(2, 4), 'short', { n: 1, d: 2 }],
    ['whole-bar rest in 4/4', 'rs', T(4, 4), 'complete', { n: 0, d: 1 }],
    ['whole-bar rest in 3/4', 'rs', T(3, 4), 'complete', { n: 0, d: 1 }],
    ['whole-bar rest in 2/4', 'rs', T(2, 4), 'complete', { n: 0, d: 1 }],
    ['whole-bar rest in 6/8', 'rs', T(6, 8), 'complete', { n: 0, d: 1 }],
    ['whole-bar rest in 12/8', 'rs', T(12, 8), 'complete', { n: 0, d: 1 }],
    ['whole-bar breve rest in 4/2', 'rB', T(4, 2), 'complete', { n: 0, d: 1 }],
    ['lone semibreve rest in 4/2 is only half a bar', 'rs', T(4, 2), 'short', { n: 1, d: 1 }],
    ['lone breve rest in 4/4 is too long', 'rB', T(4, 4), 'long', { n: 1, d: 1 }],
    ['lone minim rest in 2/4 is not the whole-bar glyph', 'rm', T(2, 4), 'complete', { n: 0, d: 1 }],
    ['semibreve rest with a note in 3/4 is long', 'rs c', T(3, 4), 'long', { n: 1, d: 2 }],
    ['semibreve rest after a note in 3/4 is long', 'c rs', T(3, 4), 'long', { n: 1, d: 2 }],
  ];
  it.each(cases)('%s', (_n, text, time, status, difference) => {
    expect(rhythm.checkBarLength(bar(text), time)).toEqual({ status, difference });
  });
});
