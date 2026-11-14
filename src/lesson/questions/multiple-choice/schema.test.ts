import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const option = (id: string, extra: object = {}) => ({ id, face: { kind: 'text', text: `Option ${id}` }, ...extra });

// The example from docs/question-payloads.md 2.1 (glyph faces).
const specExample = {
  options: [
    {
      id: 'a',
      face: { kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 0 } } },
      reason: 'That head is hollow, so it is a [[minim|minim]] and lasts 2 beats. The [[crotchet|crotchet]] has a filled-in head.',
    },
    {
      id: 'b',
      face: { kind: 'glyph', glyph: { kind: 'note', duration: { value: 'crotchet', dots: 0 } } },
    },
  ],
  correct: 'b',
};

const valid = { options: [option('a', { reason: 'Not this one.' }), option('b')], correct: 'b' };

describe('multiple-choice payloadSchema', () => {
  it('accepts the JSON example from the specification', () => {
    expect(payloadSchema.safeParse(specExample).success).toBe(true);
  });

  it('accepts two to four options', () => {
    const four = {
      options: [option('a', { reason: 'No.' }), option('b', { reason: 'No.' }), option('c', { reason: 'No.' }), option('d')],
      correct: 'd',
    };
    expect(payloadSchema.safeParse(valid).success).toBe(true);
    expect(payloadSchema.safeParse(four).success).toBe(true);
  });

  it('accepts an optional exhibit', () => {
    const withExhibit = { ...valid, exhibit: { kind: 'keyboard', highlight: ['C4'] } };
    expect(payloadSchema.safeParse(withExhibit).success).toBe(true);
  });

  it('rejects fewer than two or more than four options', () => {
    expect(payloadSchema.safeParse({ options: [option('b')], correct: 'b' }).success).toBe(false);
    const five = {
      options: [option('a', { reason: 'No.' }), option('b', { reason: 'No.' }), option('c', { reason: 'No.' }), option('d', { reason: 'No.' }), option('e')],
      correct: 'e',
    };
    expect(payloadSchema.safeParse(five).success).toBe(false);
  });

  it('rejects a correct id that is not one of the options', () => {
    expect(payloadSchema.safeParse({ ...valid, correct: 'z' }).success).toBe(false);
  });

  it('rejects a wrong option without a reason', () => {
    const missing = { options: [option('a'), option('b')], correct: 'b' };
    expect(payloadSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects a reason on the correct option', () => {
    const onCorrect = { options: [option('a', { reason: 'No.' }), option('b', { reason: 'Yes.' })], correct: 'b' };
    expect(payloadSchema.safeParse(onCorrect).success).toBe(false);
  });

  it('rejects options whose faces are of different kinds', () => {
    const mixed = {
      options: [
        option('a', { reason: 'No.' }),
        { id: 'b', face: { kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 0 } } } },
      ],
      correct: 'b',
    };
    expect(payloadSchema.safeParse(mixed).success).toBe(false);
  });

  it('rejects duplicate option ids', () => {
    const dup = { options: [option('a', { reason: 'No.' }), option('a')], correct: 'a' };
    expect(payloadSchema.safeParse(dup).success).toBe(false);
  });

  it('rejects ids that are not kebab-case', () => {
    const bad = { options: [option('Option A', { reason: 'No.' }), option('b')], correct: 'b' };
    expect(payloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ ...valid, shuffle: true }).success).toBe(false);
  });

  it('rejects a reason longer than 60 words', () => {
    const long = Array.from({ length: 61 }, () => 'word').join(' ');
    expect(payloadSchema.safeParse({ options: [option('a', { reason: long }), option('b')], correct: 'b' }).success).toBe(false);
  });
});
