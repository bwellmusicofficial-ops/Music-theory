import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { mark } from './mark';
import { specExample } from './test-helpers';

describe('by-ear mark', () => {
  it('is right for the correct option', () => {
    expect(mark(specExample, { optionId: 'b' })).toEqual({ correct: true, score: 1 });
  });

  it('gives a wrong option its own reason, unchanged', () => {
    expect(mark(specExample, { optionId: 'a' })).toEqual({
      correct: false,
      score: 0,
      reason: 'Clip A has two short notes of 1 beat each. The long 2-beat note is in clip B.',
    });
  });

  it('throws TheoryError for an unknown option', () => {
    expect(() => mark(specExample, { optionId: 'zzz' })).toThrow(TheoryError);
    // @ts-expect-error deliberately wrong shape
    expect(() => mark(specExample, undefined)).toThrow(TheoryError);
  });

  it('throws TheoryError when a wrong option has no reason', () => {
    const broken = { ...specExample, options: [{ id: 'a', face: { kind: 'text' as const, text: 'Clip A' } }, { id: 'b', face: { kind: 'text' as const, text: 'Clip B' } }] };
    expect(() => mark(broken, { optionId: 'a' })).toThrow(TheoryError);
  });
});
