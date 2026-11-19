import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const note = (letter: string, value: string, over: object = {}, accidental = 0) => ({
  kind: 'note',
  pitches: [{ letter, accidental, octave: 4 }],
  duration: { value, dots: 0 },
  ...over,
});
const bar = (...events: object[]) => ({ events });
const four = () => bar(note('B', 'crotchet'), note('B', 'crotchet'), note('B', 'crotchet'), note('B', 'crotchet'));
const two = () => bar(note('B', 'minim'), note('B', 'minim'));
const passage = (bars: object[], over: object = {}) => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars,
  ...over,
});
const messages = (input: unknown) => {
  const result = payloadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('place-bar-lines payloadSchema', () => {
  it('accepts three full bars', () => {
    expect(payloadSchema.safeParse({ passage: passage([four(), two(), four()]) }).success).toBe(true);
  });

  it('accepts exactly 2 bars with 4 notes and 4 bars with 12', () => {
    expect(payloadSchema.safeParse({ passage: passage([two(), two()]) }).success).toBe(true);
    const three = bar(note('B', 'minim', {}), note('B', 'crotchet'), note('B', 'crotchet'));
    expect(payloadSchema.safeParse({ passage: passage([three, three, three, three]) }).success).toBe(true);
  });

  it('accepts pitches that the key signature gives, in a key with sharps', () => {
    const g = passage([bar(note('F', 'minim', {}, 1), note('G', 'minim')), bar(note('F', 'minim', {}, 1), note('B', 'minim'))], {
      key: { tonic: { letter: 'G', accidental: 0 }, mode: 'major' },
    });
    expect(payloadSchema.safeParse({ passage: g }).success).toBe(true);
  });

  it('rejects one bar, five bars', () => {
    expect(messages({ passage: passage([four()]) }).join()).toMatch(/2 to 4 bars/);
    expect(messages({ passage: passage([two(), two(), two(), two(), two()]) }).join()).toMatch(/2 to 4 bars/);
  });

  it('rejects fewer than 4 or more than 12 notes and rests', () => {
    const semi = () => bar(note('B', 'semibreve'));
    expect(messages({ passage: passage([semi(), semi()]) }).join()).toMatch(/4 to 12 notes/);
    const eight = () => bar(...Array.from({ length: 8 }, () => note('B', 'quaver')));
    expect(messages({ passage: passage([eight(), eight()]) }).join()).toMatch(/4 to 12 notes/);
  });

  it('rejects a bar that is not full', () => {
    expect(messages({ passage: passage([four(), bar(note('B', 'minim'), note('B', 'crotchet'))]) }).join()).toMatch(/Bar 2 is short/);
  });

  it('rejects ties, even across a bar line', () => {
    const tied = bar(note('B', 'minim'), note('B', 'minim', { tieToNext: true }));
    expect(messages({ passage: passage([tied, two()]) }).join()).toMatch(/tied/);
  });

  it('rejects expression, repeat signs and signs, and written beams', () => {
    const base = [four(), two()];
    expect(messages({ passage: passage(base, { expression: { dynamics: [{ at: { bar: 0, event: 0 }, level: 'f' }] } }) }).join()).toMatch(/Expression/);
    expect(messages({ passage: passage([{ ...four(), repeatStart: true }, two()]) }).join()).toMatch(/repeat/);
    expect(messages({ passage: passage([four(), { ...two(), endBarline: 'repeat-end' }]) }).join()).toMatch(/repeat/);
    expect(messages({ passage: passage([{ ...four(), marker: 'segno' }, two()]) }).join()).toMatch(/navigation/);
    const beamed = bar(...Array.from({ length: 8 }, () => note('B', 'quaver')));
    expect(messages({ passage: passage([{ ...beamed, beams: [[0, 1]] }, two()]) }).join()).toMatch(/beams/);
  });

  it('rejects an accidental that the key signature does not give, and a missing one', () => {
    expect(messages({ passage: passage([bar(note('F', 'minim', {}, 1), note('B', 'minim')), two()]) }).join()).toMatch(/Note 1 has an accidental/);
    const g = (events: object[]) => passage([bar(...events), bar(note('B', 'minim'), note('B', 'minim'))], { key: { tonic: { letter: 'G', accidental: 0 }, mode: 'major' } });
    expect(messages({ passage: g([note('F', 'minim'), note('B', 'minim')]) }).join()).toMatch(/Note 1 has an accidental/);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ passage: passage([four(), two()]), extra: 1 }).success).toBe(false);
  });
});
