import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Clef, Key } from '@/engine/types';
import { mark } from './mark';
import type { WriteKeySignaturePayload } from './types';

const major = (text: string): Key => ({ tonic: pitch.parsePitchClass(text), mode: 'major' });
const minor = (text: string): Key => ({ tonic: pitch.parsePitchClass(text), mode: 'minor' });
const payload = (key: Key, clef: Clef = 'treble', placement?: 'standard' | 'any-octave'): WriteKeySignaturePayload => ({ key, clef, ...(placement ? { placement } : {}) });
const signs = (kind: 1 | -1, positions: number[]) => ({ signs: positions.map((position) => ({ sign: kind, position })) });
/** The standard positions of a key's signs, from the engine. */
const standard = (key: Key, clef: Clef) => pitch.keySignaturePositions(pitch.keySignature(key), clef);

const D = payload(major('D'));

describe('write-key-signature mark: the correct case', () => {
  it('is right for the standard positions, in treble and bass', () => {
    expect(mark(D, signs(1, standard(major('D'), 'treble')))).toEqual({ correct: true, score: 1 });
    expect(mark(payload(major('D'), 'bass'), signs(1, standard(major('D'), 'bass'))).correct).toBe(true);
  });

  it('is right for flat keys', () => {
    expect(mark(payload(major('Bb')), signs(-1, standard(major('Bb'), 'treble'))).correct).toBe(true);
    expect(mark(payload(major('F'), 'bass'), signs(-1, standard(major('F'), 'bass'))).correct).toBe(true);
  });

  it('every key with a signature, in every clef, is right with the engine positions and wrong with any other kind', () => {
    for (const key of pitch.allKeys().filter((k) => pitch.keySignature(k) !== 0)) {
      for (const clef of ['treble', 'bass', 'alto', 'tenor'] as Clef[]) {
        const n = pitch.keySignature(key);
        const kind = n > 0 ? 1 : -1;
        const positions = standard(key, clef);
        expect(mark(payload(key, clef), signs(kind, positions)).correct, `${pitch.keyName(key)} ${clef}`).toBe(true);
        for (const p of positions) expect(p >= -1 && p <= 9, `${pitch.keyName(key)} ${clef} position ${p}`).toBe(true);
        expect(mark(payload(key, clef), signs(kind === 1 ? -1 : 1, positions)).correct).toBe(false);
      }
    }
  });

  it('minor keys take their relative major signature', () => {
    expect(mark(payload(minor('E')), signs(1, standard(minor('E'), 'treble'))).correct).toBe(true);
  });
});

describe('write-key-signature mark: reasons', () => {
  it('wrong kind', () => {
    expect(mark(D, signs(-1, standard(major('D'), 'treble')))).toEqual({
      correct: false,
      score: 0,
      reason: 'D major has [[sharp|sharps]], not [[flat|flats]]. Its key signature is F♯ and C♯.',
    });
    expect(mark(payload(major('Bb')), signs(1, standard(major('Bb'), 'treble'))).reason).toBe(
      'B♭ major has [[flat|flats]], not [[sharp|sharps]]. Its key signature is B♭ and E♭.',
    );
  });

  it('wrong kind comes first, even when the count is wrong as well', () => {
    expect(mark(D, signs(-1, [4])).reason).toMatch(/^D major has \[\[sharp\|sharps\]\], not/);
  });

  it('wrong count: singular and plural, with the key signature listed', () => {
    expect(mark(D, signs(1, [8])).reason).toBe('That is 1 [[sharp|sharp]]. D major has 2: F♯ and C♯.');
    expect(mark(D, signs(1, [8, 5, 9])).reason).toBe('That is 3 [[sharp|sharps]]. D major has 2: F♯ and C♯.');
    expect(mark(payload(major('F')), signs(-1, [])).reason).toBe('That is 0 [[flat|flats]]. F major has 1: B♭.');
  });

  it('right letters, wrong order', () => {
    expect(mark(D, signs(1, [5, 8])).reason).toBe('Those are the right [[sharp|sharps]], but key signatures are written in a fixed order: F♯ and C♯.');
    expect(mark(payload(major('Bb')), signs(-1, [7, 4])).reason).toBe('Those are the right [[flat|flats]], but key signatures are written in a fixed order: B♭ and E♭.');
  });

  it('wrong letter: the ordinal, where it is, which letter, and what it should be', () => {
    expect(mark(D, signs(1, [8, 6])).reason).toBe(
      'The 2nd [[sharp|sharp]] is on the fourth line, which is D♯. In D major it should be C♯.',
    );
    expect(mark(D, signs(1, [7, 5])).reason).toBe('The 1st [[sharp|sharp]] is in the top space, which is E♯. In D major it should be F♯.');
    expect(mark(payload(major('Bb')), signs(-1, [4, 6])).reason).toBe('The 2nd [[flat|flat]] is on the fourth line, which is D♭. In B♭ major it should be E♭.');
  });

  it('wrong letter names a ledger position with the stave link', () => {
    expect(mark(D, signs(1, [8, -1])).reason).toBe('The 2nd [[sharp|sharp]] is just below the bottom line, which is D♯. In D major it should be C♯.');
  });

  it('wrong letter names the letter the clef gives, not the treble one', () => {
    // Bass: position 8 is A, not F.
    expect(mark(payload(major('D'), 'bass'), signs(1, [8, 3])).reason).toBe('The 1st [[sharp|sharp]] is on the top line, which is A♯. In D major it should be F♯.');
  });

  it('right letter, wrong octave: where it goes and where it was put (standard placement)', () => {
    expect(mark(payload(major('G')), signs(1, [1])).reason).toBe(
      'F♯ is right, but in a key signature it goes on the top line, not in the bottom space.',
    );
  });

  it('wrong octave is found at the first sign that is out, and only after letters and order', () => {
    // D major: F at 8 is right, C at 5 is right; swap to F at 1 and C at 5.
    expect(mark(D, signs(1, [1, 5])).reason).toMatch(/^F♯ is right, but in a key signature it goes on the top line, not in the bottom space\.$/);
    // A wrong letter is reported in preference to a wrong octave.
    expect(mark(D, signs(1, [1, 6])).reason).toMatch(/^The 2nd/);
  });

  it('any-octave accepts the right letter at any position, but still checks kind, count, order and letter', () => {
    const open = payload(major('G'), 'treble', 'any-octave');
    expect(mark(open, signs(1, [1])).correct).toBe(true);
    expect(mark(open, signs(1, [8])).correct).toBe(true);
    expect(mark(open, signs(1, [2])).reason).toMatch(/^The 1st/);
    expect(mark(payload(major('D'), 'treble', 'any-octave'), signs(1, [5, 8])).reason).toMatch(/^Those are the right/);
    expect(mark(payload(major('D'), 'treble', 'any-octave'), signs(1, [1, 5])).correct).toBe(true);
  });

  it('placement defaults to standard when absent', () => {
    expect(mark(payload(major('G')), signs(1, [1])).correct).toBe(false);
  });

  it('every reason is within 40 words, ends with a full stop and never blames', () => {
    const answers = [signs(-1, [8, 5]), signs(1, [8]), signs(1, [5, 8]), signs(1, [8, 6]), signs(1, [1, 5]), signs(1, [8, -1])];
    for (const a of answers) {
      const reason = mark(D, a).reason!;
      expect(reason.replace(/\[\[[^|\]]+\|([^\]]*)\]\]/g, '$1').split(/\s+/).length).toBeLessThanOrEqual(40);
      expect(reason).toMatch(/\.$/);
      expect(reason).not.toMatch(/!|you /i);
    }
  });
});

describe('write-key-signature mark: input checks', () => {
  it('throws for answers the component could never produce', () => {
    expect(() => mark(D, { signs: [{ sign: 0 as never, position: 8 }] })).toThrow(TheoryError);
    expect(() => mark(D, signs(1, [10]))).toThrow(TheoryError);
    expect(() => mark(D, signs(1, [-2]))).toThrow(TheoryError);
    expect(() => mark(D, signs(1, [4.5]))).toThrow(TheoryError);
    expect(() => mark(D, signs(1, [8, 5, 9, 6, 3, 7, 4, 4]))).toThrow(TheoryError);
    expect(() => mark(D, {} as never)).toThrow(TheoryError);
    expect(() => mark(D, undefined as never)).toThrow(TheoryError);
  });
});
