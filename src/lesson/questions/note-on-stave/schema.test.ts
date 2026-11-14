import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const C_MAJOR = { tonic: { letter: 'C', accidental: 0 }, mode: 'major' };
const A_MINOR = { tonic: { letter: 'A', accidental: 0 }, mode: 'minor' };
const G_MAJOR = { tonic: { letter: 'G', accidental: 0 }, mode: 'major' };

const identify = {
  mode: 'identify',
  clef: 'treble',
  key: C_MAJOR,
  pitch: { letter: 'G', accidental: 0, octave: 4 },
  accidentals: false,
};
const place = {
  mode: 'place',
  clef: 'treble',
  key: C_MAJOR,
  target: { letter: 'G', accidental: 0 },
  accidentals: false,
};

const withChange = (base: object, change: object) => ({ ...base, ...change });
const messages = (input: unknown) => {
  const result = payloadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('note-on-stave payloadSchema', () => {
  it('accepts the spec example (identify)', () => {
    expect(payloadSchema.safeParse(identify).success).toBe(true);
  });

  it('accepts a place question with and without an octave', () => {
    expect(payloadSchema.safeParse(place).success).toBe(true);
    expect(payloadSchema.safeParse(withChange(place, { octave: 4 })).success).toBe(true);
  });

  it('accepts accidentals and key signatures when `accidentals` is true', () => {
    expect(
      payloadSchema.safeParse(
        withChange(identify, { key: G_MAJOR, accidentals: true, pitch: { letter: 'F', accidental: 1, octave: 5 } }),
      ).success,
    ).toBe(true);
    expect(
      payloadSchema.safeParse(withChange(place, { accidentals: true, target: { letter: 'B', accidental: -1 } })).success,
    ).toBe(true);
  });

  it('accepts A minor when `accidentals` is false', () => {
    expect(payloadSchema.safeParse(withChange(identify, { key: A_MINOR })).success).toBe(true);
  });

  it('rejects unknown keys, in either mode and nested', () => {
    expect(payloadSchema.safeParse({ ...identify, extra: 1 }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...place, extra: 1 }).success).toBe(false);
    expect(
      payloadSchema.safeParse(withChange(identify, { pitch: { letter: 'G', accidental: 0, octave: 4, x: 1 } })).success,
    ).toBe(false);
  });

  it('rejects an unknown mode and missing fields', () => {
    expect(payloadSchema.safeParse({ ...identify, mode: 'draw' }).success).toBe(false);
    const { accidentals: _unused, ...missing } = identify;
    void _unused;
    expect(payloadSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects a double sharp or flat on the pitch or target', () => {
    expect(payloadSchema.safeParse(withChange(identify, { accidentals: true, pitch: { letter: 'F', accidental: 2, octave: 4 } })).success).toBe(false);
    expect(payloadSchema.safeParse(withChange(place, { accidentals: true, target: { letter: 'B', accidental: -2 } })).success).toBe(false);
  });

  it('rejects an accidental when `accidentals` is false', () => {
    expect(messages(withChange(identify, { pitch: { letter: 'F', accidental: 1, octave: 4 } }))).toEqual([
      'pitch.accidental: When `accidentals` is false the pitch must have no accidental',
    ]);
    expect(messages(withChange(place, { target: { letter: 'F', accidental: 1 } }))).toEqual([
      'target.accidental: When `accidentals` is false the target must have no accidental',
    ]);
  });

  it('rejects a key signature when `accidentals` is false', () => {
    expect(messages(withChange(identify, { key: G_MAJOR }))).toEqual([
      'key: When `accidentals` is false the key must be C major or A minor',
    ]);
    expect(messages(withChange(place, { key: G_MAJOR }))).toEqual([
      'key: When `accidentals` is false the key must be C major or A minor',
    ]);
  });

  it('rejects a key that cannot be written', () => {
    const impossible = { tonic: { letter: 'G', accidental: 1 }, mode: 'major' };
    expect(payloadSchema.safeParse(withChange(identify, { key: impossible, accidentals: true })).success).toBe(false);
  });

  it('limits an identify note to stave positions -4 to 12', () => {
    // Treble: E4 is position 0, so A3 is -4 and G3 is -5; C6 is 12 and D6 is 13.
    const at = (letter: string, octave: number) => withChange(identify, { pitch: { letter, accidental: 0, octave } });
    expect(payloadSchema.safeParse(at('A', 3)).success).toBe(true);
    expect(payloadSchema.safeParse(at('C', 6)).success).toBe(true);
    expect(payloadSchema.safeParse(at('G', 3)).success).toBe(false);
    expect(payloadSchema.safeParse(at('D', 6)).success).toBe(false);
  });

  it('does not limit the position in place mode', () => {
    expect(payloadSchema.safeParse(withChange(place, { octave: 7 })).success).toBe(true);
  });
});
