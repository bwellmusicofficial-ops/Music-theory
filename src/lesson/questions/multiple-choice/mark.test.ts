import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { mark } from './mark';
import type { MultipleChoicePayload } from './types';

const minimReason = 'That head is hollow, so it is a [[minim|minim]] and lasts 2 beats. The [[crotchet|crotchet]] has a filled-in head.';
const payload: MultipleChoicePayload = {
  options: [
    { id: 'a', face: { kind: 'text', text: 'Minim' }, reason: minimReason },
    { id: 'b', face: { kind: 'text', text: 'Crotchet' } },
    { id: 'c', face: { kind: 'text', text: 'Semibreve' }, reason: 'The semibreve is the hollow note with no stem.' },
  ],
  correct: 'b',
};

describe('multiple-choice mark', () => {
  it('marks the correct option right with score 1 and no reason', () => {
    expect(mark(payload, { optionId: 'b' })).toEqual({ correct: true, score: 1 });
  });

  it('marks a wrong option wrong with score 0 and returns its reason unchanged', () => {
    expect(mark(payload, { optionId: 'a' })).toEqual({ correct: false, score: 0, reason: minimReason });
  });

  it('returns the reason of whichever wrong option was chosen', () => {
    expect(mark(payload, { optionId: 'c' })).toEqual({
      correct: false,
      score: 0,
      reason: 'The semibreve is the hollow note with no stem.',
    });
  });

  it('throws TheoryError for an option id that is not in the question', () => {
    expect(() => mark(payload, { optionId: 'z' })).toThrow(TheoryError);
  });

  it('throws TheoryError when a wrong option has no reason', () => {
    const broken: MultipleChoicePayload = { ...payload, options: [{ id: 'a', face: { kind: 'text', text: 'Minim' } }, { id: 'b', face: { kind: 'text', text: 'Crotchet' } }], correct: 'b' };
    expect(() => mark(broken, { optionId: 'a' })).toThrow(TheoryError);
  });
});
