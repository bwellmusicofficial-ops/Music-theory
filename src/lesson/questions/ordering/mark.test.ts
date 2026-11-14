import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { mark } from './mark';
import type { OrderingPayload } from './types';

// The example from docs/question-payloads.md 2.3.
const reason = 'Shortest to longest: [[crotchet|crotchet]] 1 beat, [[minim|minim]] 2 beats, [[semibreve|semibreve]] 4 beats.';
const payload: OrderingPayload = {
  items: [
    { id: 'minim', face: { kind: 'text', text: 'Minim' } },
    { id: 'semibreve', face: { kind: 'text', text: 'Semibreve' } },
    { id: 'crotchet', face: { kind: 'text', text: 'Crotchet' } },
  ],
  correctOrder: ['crotchet', 'minim', 'semibreve'],
  ends: { first: 'shortest', last: 'longest' },
  reason,
};

describe('ordering mark', () => {
  it('is correct with score 1 for the correct order', () => {
    expect(mark(payload, { order: ['crotchet', 'minim', 'semibreve'] })).toEqual({ correct: true, score: 1 });
  });

  it('scores the share of positions that hold the right item, and names the first position out of place', () => {
    expect(mark(payload, { order: ['crotchet', 'semibreve', 'minim'] })).toEqual({
      correct: false,
      score: 1 / 3,
      reason: `Number 2 in your order is the first one out of place. ${reason}`,
    });
  });

  it('scores 0 and names position 1 when the first item is wrong', () => {
    const result = mark(payload, { order: ['minim', 'semibreve', 'crotchet'] });
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe(`Number 1 in your order is the first one out of place. ${reason}`);
  });

  it('gives the score for a single swap at the end', () => {
    const result = mark(payload, { order: ['crotchet', 'semibreve', 'minim'] });
    expect(result.score).toBeCloseTo(1 / 3);
    expect(result.reason).toContain('Number 2 in your order');
  });

  it('throws TheoryError when an item is missing, repeated or unknown', () => {
    expect(() => mark(payload, { order: ['crotchet', 'minim'] })).toThrow(TheoryError);
    expect(() => mark(payload, { order: ['crotchet', 'crotchet', 'semibreve'] })).toThrow(TheoryError);
    expect(() => mark(payload, { order: ['crotchet', 'minim', 'quaver'] })).toThrow(TheoryError);
  });
});
