import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const key = (letter: string, accidental: number, mode = 'major') => ({ tonic: { letter, accidental }, mode });
const messages = (input: unknown) => {
  const result = payloadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('write-key-signature payloadSchema', () => {
  it('accepts a key with sharps, a key with flats and a minor key, in each clef', () => {
    for (const clef of ['treble', 'bass', 'alto', 'tenor']) {
      expect(payloadSchema.safeParse({ clef, key: key('D', 0) }).success).toBe(true);
    }
    expect(payloadSchema.safeParse({ clef: 'treble', key: key('B', -1) }).success).toBe(true);
    expect(payloadSchema.safeParse({ clef: 'bass', key: key('E', 0, 'minor') }).success).toBe(true);
    expect(payloadSchema.safeParse({ clef: 'treble', key: key('C', 1) }).success).toBe(true); // seven sharps
  });

  it('placement defaults to standard, and any-octave is allowed', () => {
    expect((payloadSchema.parse({ clef: 'treble', key: key('G', 0) }) as { placement: string }).placement).toBe('standard');
    expect((payloadSchema.parse({ clef: 'treble', key: key('G', 0), placement: 'any-octave' }) as { placement: string }).placement).toBe('any-octave');
    expect(payloadSchema.safeParse({ clef: 'treble', key: key('G', 0), placement: 'anywhere' }).success).toBe(false);
  });

  it('rejects C major and A minor, which have no signs', () => {
    expect(messages({ clef: 'treble', key: key('C', 0) }).join()).toMatch(/1 to 7 sharps or flats/);
    expect(messages({ clef: 'treble', key: key('A', 0, 'minor') }).join()).toMatch(/1 to 7 sharps or flats/);
  });

  it('rejects a key with more than seven sharps or flats', () => {
    expect(messages({ clef: 'treble', key: key('G', 1) }).join()).toMatch(/1 to 7 sharps or flats/);
    expect(messages({ clef: 'treble', key: key('F', -1) }).join()).toMatch(/1 to 7 sharps or flats/);
  });

  it('rejects an unknown clef and unknown keys', () => {
    expect(payloadSchema.safeParse({ clef: 'soprano', key: key('G', 0) }).success).toBe(false);
    expect(payloadSchema.safeParse({ clef: 'treble', key: key('G', 0), extra: 1 }).success).toBe(false);
    expect(payloadSchema.safeParse({ key: key('G', 0) }).success).toBe(false);
  });
});
