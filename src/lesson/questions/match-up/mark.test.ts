import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { mark } from './mark';
import type { MatchUpPayload } from './types';

// The example from docs/question-payloads.md 2.2.
const payload: MatchUpPayload = {
  left: [
    { id: 'crotchet', face: { kind: 'text', text: 'Crotchet' }, match: 'one', reason: 'A [[crotchet|crotchet]] is the filled-in note with a stem. It lasts 1 beat.' },
    { id: 'minim', face: { kind: 'text', text: 'Minim' }, match: 'two', reason: 'A [[minim|minim]] is the hollow note with a stem. It lasts 2 beats, not 1.' },
    { id: 'semibreve', face: { kind: 'text', text: 'Semibreve' }, match: 'four', reason: 'A [[semibreve|semibreve]] is the hollow note with no stem. It lasts 4 beats.' },
  ],
  right: [
    { id: 'four', face: { kind: 'text', text: '4 beats' } },
    { id: 'one', face: { kind: 'text', text: '1 beat' } },
    { id: 'two', face: { kind: 'text', text: '2 beats' } },
  ],
};

describe('match-up mark', () => {
  it('is correct with score 1 when every pair is right', () => {
    expect(mark(payload, { pairs: { crotchet: 'one', minim: 'two', semibreve: 'four' } })).toEqual({
      correct: true,
      score: 1,
    });
  });

  it('scores the share of right pairs and gives the reason of the first wrong pair in array order', () => {
    const result = mark(payload, { pairs: { crotchet: 'one', minim: 'four', semibreve: 'two' } });
    expect(result.correct).toBe(false);
    expect(result.score).toBeCloseTo(1 / 3);
    expect(result.reason).toBe(
      '1 of 3 pairs are right. A [[minim|minim]] is the hollow note with a stem. It lasts 2 beats, not 1.',
    );
  });

  it('reports the first wrong pair even when a later one is also wrong', () => {
    const result = mark(payload, { pairs: { crotchet: 'two', minim: 'one', semibreve: 'four' } });
    expect(result.score).toBeCloseTo(1 / 3);
    expect(result.reason).toBe(
      '1 of 3 pairs are right. A [[crotchet|crotchet]] is the filled-in note with a stem. It lasts 1 beat.',
    );
  });

  it('scores 0 with the first reason when no pair is right', () => {
    const result = mark(payload, { pairs: { crotchet: 'two', minim: 'four', semibreve: 'one' } });
    expect(result).toEqual({
      correct: false,
      score: 0,
      reason: '0 of 3 pairs are right. A [[crotchet|crotchet]] is the filled-in note with a stem. It lasts 1 beat.',
    });
  });

  it('throws TheoryError when a left item has no pair', () => {
    expect(() => mark(payload, { pairs: { crotchet: 'one', minim: 'two' } })).toThrow(TheoryError);
  });

  it('throws TheoryError for an unknown left or right id', () => {
    expect(() => mark(payload, { pairs: { crotchet: 'one', minim: 'two', semibreve: 'four', extra: 'one' } })).toThrow(TheoryError);
    expect(() => mark(payload, { pairs: { crotchet: 'nine', minim: 'two', semibreve: 'four' } })).toThrow(TheoryError);
  });

  it('throws TheoryError when one right item is used twice', () => {
    expect(() => mark(payload, { pairs: { crotchet: 'one', minim: 'one', semibreve: 'four' } })).toThrow(TheoryError);
  });
});
