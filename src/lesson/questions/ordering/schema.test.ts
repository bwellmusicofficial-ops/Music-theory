import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const glyph = (value: string) => ({ kind: 'glyph', glyph: { kind: 'note', duration: { value, dots: 0 } } });

// The example from docs/question-payloads.md 2.3.
const specExample = {
  items: [
    { id: 'minim', face: glyph('minim') },
    { id: 'semibreve', face: glyph('semibreve') },
    { id: 'crotchet', face: glyph('crotchet') },
  ],
  correctOrder: ['crotchet', 'minim', 'semibreve'],
  ends: { first: 'shortest', last: 'longest' },
  reason: 'Shortest to longest: [[crotchet|crotchet]] 1 beat, [[minim|minim]] 2 beats, [[semibreve|semibreve]] 4 beats.',
};

const item = (id: string) => ({ id, face: { kind: 'text', text: id } });
const valid = {
  items: [item('a'), item('b'), item('c')],
  correctOrder: ['b', 'c', 'a'],
  ends: { first: 'first', last: 'last' },
  reason: 'Ordered by value.',
};

describe('ordering payloadSchema', () => {
  it('accepts the JSON example from the specification', () => {
    expect(payloadSchema.safeParse(specExample).success).toBe(true);
  });

  it('accepts three to six items', () => {
    const six = {
      ...valid,
      items: ['a', 'b', 'c', 'd', 'e', 'f'].map(item),
      correctOrder: ['b', 'c', 'd', 'e', 'f', 'a'],
    };
    expect(payloadSchema.safeParse(six).success).toBe(true);
  });

  it('rejects fewer than three or more than six items', () => {
    expect(payloadSchema.safeParse({ ...valid, items: [item('a'), item('b')], correctOrder: ['b', 'a'] }).success).toBe(false);
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(
      payloadSchema.safeParse({ ...valid, items: seven.map(item), correctOrder: [...seven].reverse() }).success,
    ).toBe(false);
  });

  it('rejects a correctOrder that is not a permutation of the item ids', () => {
    expect(payloadSchema.safeParse({ ...valid, correctOrder: ['b', 'c'] }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...valid, correctOrder: ['b', 'c', 'z'] }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...valid, correctOrder: ['b', 'b', 'c'] }).success).toBe(false);
  });

  it('rejects items that already start in the correct order', () => {
    expect(payloadSchema.safeParse({ ...valid, correctOrder: ['a', 'b', 'c'] }).success).toBe(false);
  });

  it('rejects duplicate item ids', () => {
    expect(payloadSchema.safeParse({ ...valid, items: [item('a'), item('a'), item('c')] }).success).toBe(false);
  });

  it('rejects a reason over 30 words', () => {
    const long = Array.from({ length: 31 }, () => 'word').join(' ');
    expect(payloadSchema.safeParse({ ...valid, reason: long }).success).toBe(false);
    const ok = Array.from({ length: 30 }, () => 'word').join(' ');
    expect(payloadSchema.safeParse({ ...valid, reason: ok }).success).toBe(true);
  });

  it('requires both end labels', () => {
    expect(payloadSchema.safeParse({ ...valid, ends: { first: 'shortest' } }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ ...valid, shuffle: true }).success).toBe(false);
  });
});
