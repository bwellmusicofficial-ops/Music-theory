import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const glyph = (value: string) => ({ kind: 'glyph', glyph: { kind: 'note', duration: { value, dots: 0 } } });

// The example from docs/question-payloads.md 2.2.
const specExample = {
  left: [
    { id: 'crotchet', face: glyph('crotchet'), match: 'one', reason: 'A [[crotchet|crotchet]] is the filled-in note with a stem. It lasts 1 beat.' },
    { id: 'minim', face: glyph('minim'), match: 'two', reason: 'A [[minim|minim]] is the hollow note with a stem. It lasts 2 beats, not 1.' },
    { id: 'semibreve', face: glyph('semibreve'), match: 'four', reason: 'A [[semibreve|semibreve]] is the hollow note with no stem. It lasts 4 beats.' },
  ],
  right: [
    { id: 'four', face: { kind: 'text', text: '4 beats' } },
    { id: 'one', face: { kind: 'text', text: '1 beat' } },
    { id: 'two', face: { kind: 'text', text: '2 beats' } },
  ],
};

const item = (id: string, match: string) => ({
  id,
  face: { kind: 'text', text: id },
  match,
  reason: `${id} belongs with ${match}.`,
});
const right = (id: string) => ({ id, face: { kind: 'text', text: id } });
const valid = {
  left: [item('a', 'x'), item('b', 'y'), item('c', 'z')],
  right: [right('y'), right('z'), right('x')],
};

describe('match-up payloadSchema', () => {
  it('accepts the JSON example from the specification', () => {
    expect(payloadSchema.safeParse(specExample).success).toBe(true);
  });

  it('accepts three to five left items', () => {
    const five = {
      left: [item('a', 'v'), item('b', 'w'), item('c', 'x'), item('d', 'y'), item('e', 'z')],
      right: [right('w'), right('x'), right('y'), right('z'), right('v')],
    };
    expect(payloadSchema.safeParse(valid).success).toBe(true);
    expect(payloadSchema.safeParse(five).success).toBe(true);
  });

  it('rejects fewer than three or more than five left items', () => {
    expect(payloadSchema.safeParse({ left: [item('a', 'x'), item('b', 'y')], right: [right('x'), right('y')] }).success).toBe(false);
    const six = {
      left: [item('a', 'v'), item('b', 'w'), item('c', 'x'), item('d', 'y'), item('e', 'z'), item('f', 'u')],
      right: [right('w'), right('x'), right('y'), right('z'), right('v'), right('u')],
    };
    expect(payloadSchema.safeParse(six).success).toBe(false);
  });

  it('rejects a right list of a different length', () => {
    expect(payloadSchema.safeParse({ ...valid, right: [right('y'), right('z')] }).success).toBe(false);
  });

  it('rejects a match that is not the id of a right item', () => {
    const bad = { ...valid, left: [item('a', 'x'), item('b', 'y'), item('c', 'nope')] };
    expect(payloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects two left items that share a match', () => {
    const shared = { ...valid, left: [item('a', 'x'), item('b', 'x'), item('c', 'z')] };
    expect(payloadSchema.safeParse(shared).success).toBe(false);
  });

  it('rejects right items that already start in matching order', () => {
    const inOrder = { left: [item('a', 'x'), item('b', 'y'), item('c', 'z')], right: [right('x'), right('y'), right('z')] };
    expect(payloadSchema.safeParse(inOrder).success).toBe(false);
  });

  it('rejects duplicate ids and a missing reason', () => {
    expect(payloadSchema.safeParse({ ...valid, right: [right('y'), right('y'), right('x')] }).success).toBe(false);
    const withoutReason = { id: 'a', face: { kind: 'text', text: 'a' }, match: 'x' };
    expect(payloadSchema.safeParse({ ...valid, left: [withoutReason, valid.left[1], valid.left[2]] }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });
});
