import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Fraction, TimeSignature } from '../types';
import { rhythm } from './index';
import { T } from './test-helpers';

const f = (n: number, d: number): Fraction => ({ n, d });

// offset, length, time, expected rest names (UK, in order).
const cases: [string, Fraction, Fraction, TimeSignature, string[]][] = [
  ['4/4 whole bar', f(0, 1), f(1, 1), T(4, 4), ['semibreve rest']],
  ['4/4 first half', f(0, 1), f(1, 2), T(4, 4), ['minim rest']],
  ['4/4 second half', f(1, 2), f(1, 2), T(4, 4), ['minim rest']],
  ['4/4 beats 2-3 are two crotchets', f(1, 4), f(1, 2), T(4, 4), ['crotchet rest', 'crotchet rest']],
  ['4/4 three beats from the start', f(0, 1), f(3, 4), T(4, 4), ['minim rest', 'crotchet rest']],
  ['4/4 three beats from beat 2', f(1, 4), f(3, 4), T(4, 4), ['crotchet rest', 'minim rest']],
  ['4/4 from the second quaver', f(1, 8), f(7, 8), T(4, 4), ['quaver rest', 'crotchet rest', 'minim rest']],
  ['4/4 from the second semiquaver to the beat', f(1, 16), f(3, 16), T(4, 4), ['semiquaver rest', 'quaver rest']],
  ['4/4 dotted-quaver gap from the beat', f(0, 1), f(3, 16), T(4, 4), ['quaver rest', 'semiquaver rest']],
  ['4/4 one beat', f(1, 4), f(1, 4), T(4, 4), ['crotchet rest']],
  ['3/4 two beats are two crotchets', f(0, 1), f(1, 2), T(3, 4), ['crotchet rest', 'crotchet rest']],
  ['3/4 whole bar', f(0, 1), f(3, 4), T(3, 4), ['semibreve rest']],
  ['2/4 whole bar', f(0, 1), f(1, 2), T(2, 4), ['semibreve rest']],
  ['2/4 second beat', f(1, 4), f(1, 4), T(2, 4), ['crotchet rest']],
  ['6/8 first beat', f(0, 1), f(3, 8), T(6, 8), ['dotted crotchet rest']],
  ['6/8 second beat', f(3, 8), f(3, 8), T(6, 8), ['dotted crotchet rest']],
  ['6/8 whole bar', f(0, 1), f(3, 4), T(6, 8), ['semibreve rest']],
  ['6/8 two quavers from the second quaver', f(1, 8), f(1, 4), T(6, 8), ['quaver rest', 'quaver rest']],
  ['6/8 crotchet at the start of a beat', f(0, 1), f(1, 4), T(6, 8), ['crotchet rest']],
  ['6/8 quaver then a whole beat', f(1, 4), f(1, 2), T(6, 8), ['quaver rest', 'dotted crotchet rest']],
  ['9/8 two beats are two dotted crotchets', f(0, 1), f(3, 4), T(9, 8), ['dotted crotchet rest', 'dotted crotchet rest']],
  ['12/8 first two beats', f(0, 1), f(3, 4), T(12, 8), ['dotted minim rest']],
  ['12/8 last two beats', f(3, 4), f(3, 4), T(12, 8), ['dotted minim rest']],
  ['12/8 beats 2-3 are separate', f(3, 8), f(3, 4), T(12, 8), ['dotted crotchet rest', 'dotted crotchet rest']],
  ['2/2 first beat', f(0, 1), f(1, 2), T(2, 2), ['minim rest']],
  ['2/2 whole bar', f(0, 1), f(1, 1), T(2, 2), ['semibreve rest']],
  ['4/2 whole bar is a breve rest', f(0, 1), f(2, 1), T(4, 2), ['breve rest']],
  ['4/2 first two beats', f(0, 1), f(1, 1), T(4, 2), ['semibreve rest']],
  ['4/2 beats 2-3', f(1, 2), f(1, 1), T(4, 2), ['minim rest', 'minim rest']],
  ['3/8 whole bar', f(0, 1), f(3, 8), T(3, 8), ['semibreve rest']],
  ['3/8 from the second quaver', f(1, 8), f(1, 4), T(3, 8), ['quaver rest', 'quaver rest']],
  ['5/4 whole bar', f(0, 1), f(5, 4), T(5, 4), ['semibreve rest']],
  ['5/4 three beats', f(0, 1), f(3, 4), T(5, 4), ['crotchet rest', 'crotchet rest', 'crotchet rest']],
  ['empty gap', f(1, 4), f(0, 1), T(4, 4), []],
];

describe('restsToFill', () => {
  it.each(cases)('%s', (_name, offset, length, time, expected) => {
    const rests = rhythm.restsToFill(offset, length, time);
    expect(rests.map((r) => rhythm.restName(r, 'uk'))).toEqual(expected);
  });

  it('accepts fractions that are not in lowest terms', () => {
    const rests = rhythm.restsToFill(f(2, 8), f(2, 4), T(4, 4));
    expect(rests.map((r) => rhythm.restName(r, 'uk'))).toEqual(['crotchet rest', 'crotchet rest']);
  });

  it('rejects gaps that run past the bar or are negative', () => {
    expect(() => rhythm.restsToFill(f(1, 2), f(3, 4), T(4, 4))).toThrow(TheoryError);
    expect(() => rhythm.restsToFill(f(-1, 4), f(1, 4), T(4, 4))).toThrow(TheoryError);
  });

  it('rejects gaps finer than a demisemiquaver', () => {
    expect(() => rhythm.restsToFill(f(1, 64), f(1, 4), T(4, 4))).toThrow(TheoryError);
  });
});
