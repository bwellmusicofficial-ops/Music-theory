import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Pitch } from '@/engine/types';
import { mark } from './mark';
import type { PlayKeyboardPayload } from './types';

const p = (s: string) => pitch.parsePitch(s);
const ps = (...s: string[]) => s.map(p);
const payload = (over: Partial<PlayKeyboardPayload> & { targets: Pitch[] }): PlayKeyboardPayload => ({
  low: p('C4'),
  high: p('C5'),
  showLabels: false,
  mode: 'sequence',
  octave: 'exact',
  ...over,
});
const seq = payload({ targets: ps('C4', 'D4', 'E4') });

describe('play-keyboard mark: sequence', () => {
  it('is correct when every note matches in order', () => {
    expect(mark(seq, { played: ps('C4', 'D4', 'E4') })).toEqual({ correct: true, score: 1 });
  });

  it('ignores spelling: C♯ played for D♭', () => {
    const r = mark(payload({ targets: ps('Db4') }), { played: ps('C#4') });
    expect(r).toEqual({ correct: true, score: 1 });
  });

  it('scores matching positions over the number of targets', () => {
    const r = mark(seq, { played: ps('C4', 'D4', 'F4') });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
  });

  it('is not correct for the right notes in the wrong order', () => {
    const r = mark(seq, { played: ps('D4', 'C4', 'E4') });
    expect(r.score).toBeCloseTo(1 / 3);
    expect(r.reason).toBe('Note 1 should be C, but you played D, which is too high.');
  });

  it('says too high for a different note above the target', () => {
    expect(mark(seq, { played: ps('C4', 'D4', 'F4') }).reason).toBe(
      'Note 3 should be E, but you played F, which is too high.',
    );
  });

  it('says too low for a different note below the target', () => {
    expect(mark(seq, { played: ps('C4', 'D4', 'D4') }).reason).toBe(
      'Note 3 should be E, but you played D, which is too low.',
    );
  });

  it('names the first wrong position only', () => {
    expect(mark(seq, { played: ps('E4', 'E4', 'C4') }).reason).toBe(
      'Note 1 should be C, but you played E, which is too high.',
    );
  });

  it('right letter, wrong key: target to the left or right', () => {
    expect(mark(seq, { played: ps('C5', 'D4', 'E4') }).reason).toBe(
      'Note 1 is the right letter but the wrong key. You need the C further to the left.',
    );
    expect(mark(payload({ targets: ps('C5', 'D4') }), { played: ps('C4', 'D4') }).reason).toBe(
      'Note 1 is the right letter but the wrong key. You need the C further to the right.',
    );
  });

  it('uses the single-target wording', () => {
    const one = payload({ targets: ps('E4') });
    expect(mark(one, { played: ps('D4') }).reason).toBe('That should be E, but you played D, which is too low.');
    expect(mark(payload({ targets: ps('C5') }), { played: ps('C4') }).reason).toBe(
      'That is the right letter but the wrong key. You need the C further to the right.',
    );
    expect(mark(one, { played: ps('E4') })).toEqual({ correct: true, score: 1 });
  });

  it('names a played black key as a sharp, or as a flat when a target is a flat', () => {
    expect(mark(payload({ targets: ps('C4', 'D4') }), { played: ps('C4', 'D#4') }).reason).toBe(
      'Note 2 should be D, but you played D♯, which is too high.',
    );
    expect(mark(payload({ targets: ps('Db4', 'D4') }), { played: ps('C#4', 'D#4') }).reason).toBe(
      'Note 2 should be D, but you played E♭, which is too high.',
    );
  });

  it('prints a flat target with its flat sign', () => {
    expect(mark(payload({ targets: ps('Bb4') }), { played: ps('A4') }).reason).toBe(
      'That should be B♭, but you played A, which is too low.',
    );
  });
});

describe('play-keyboard mark: sequence, any octave', () => {
  const any = (targets: Pitch[]) => payload({ targets, octave: 'any' });

  it('accepts the right note name on any key', () => {
    expect(mark(any(ps('C4', 'E4')), { played: ps('C5', 'E4') })).toEqual({ correct: true, score: 1 });
  });

  it('compares with the nearest key of the target name in range', () => {
    // E exists only at E4 in C4..C5, so G4 is too high.
    expect(mark(any(ps('C4', 'E4')), { played: ps('C5', 'G4') }).reason).toBe(
      'Note 2 should be E, but you played G, which is too high.',
    );
    // B3 is below the range; the nearest C is C4, so it is too low.
    expect(mark(payload({ targets: ps('C4'), octave: 'any', low: p('A3') }), { played: ps('B3') }).reason).toBe(
      'That should be C, but you played B, which is too low.',
    );
  });

  it('takes the lower key on an exact tie, so the played key is too high', () => {
    expect(mark(any(ps('C4')), { played: ps('F#4') }).reason).toBe(
      'That should be C, but you played F♯, which is too high.',
    );
  });

  it('never gives the right-letter reason', () => {
    const r = mark(any(ps('C4')), { played: ps('D4') });
    expect(r.reason).toBe('That should be C, but you played D, which is too high.');
  });
});

describe('play-keyboard mark: together', () => {
  const chord = payload({ targets: ps('C4', 'E4', 'G4'), mode: 'together' });

  it('is correct for the right keys in any order', () => {
    expect(mark(chord, { played: ps('C4', 'E4', 'G4') })).toEqual({ correct: true, score: 1 });
    expect(mark(chord, { played: ps('G4', 'C4', 'E4') })).toEqual({ correct: true, score: 1 });
  });

  it('too few keys', () => {
    const r = mark(chord, { played: ps('C4', 'E4') });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.reason).toBe('You chose 2 keys, but this needs 3: C, E and G.');
  });

  it('one key chosen reads "1 key"; none reads "0 keys"', () => {
    expect(mark(chord, { played: ps('C4') }).reason).toBe('You chose 1 key, but this needs 3: C, E and G.');
    const none = mark(chord, { played: [] });
    expect(none.score).toBe(0);
    expect(none.reason).toBe('You chose 0 keys, but this needs 3: C, E and G.');
  });

  it('a wrong key, first from the bottom', () => {
    const r = mark(chord, { played: ps('E4', 'C4', 'F4') });
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.reason).toBe('F does not belong. The notes are C, E and G.');
    expect(mark(chord, { played: ps('C4', 'G4', 'E4', 'A4', 'F4') }).reason).toBe(
      'F does not belong. The notes are C, E and G.',
    );
  });

  it('extra keys lower the score by the larger count', () => {
    const r = mark(chord, { played: ps('C4', 'E4', 'G4', 'A4') });
    expect(r.score).toBeCloseTo(3 / 4);
    expect(r.reason).toBe('A does not belong. The notes are C, E and G.');
  });

  it('too few wins over a wrong key', () => {
    expect(mark(chord, { played: ps('C4', 'F4') }).reason).toBe('You chose 2 keys, but this needs 3: C, E and G.');
  });

  it('names black keys by the flat rule', () => {
    expect(mark(chord, { played: ps('C4', 'E4', 'F#4') }).reason).toBe(
      'F♯ does not belong. The notes are C, E and G.',
    );
    const flats = payload({ targets: ps('C4', 'Eb4', 'G4'), mode: 'together' });
    expect(mark(flats, { played: ps('C4', 'D#4', 'F#4') }).reason).toBe(
      'G♭ does not belong. The notes are C, E♭ and G.',
    );
    expect(mark(flats, { played: ps('C4', 'D#4', 'G4') })).toEqual({ correct: true, score: 1 });
  });

  it('any octave: matches by name', () => {
    const any = payload({ targets: ps('C4', 'E4'), mode: 'together', octave: 'any' });
    expect(mark(any, { played: ps('E4', 'C5') })).toEqual({ correct: true, score: 1 });
    expect(mark(any, { played: ps('E4', 'D5') }).reason).toBe('D does not belong. The notes are C and E.');
  });

  it('any octave: two keys with one name leave a note out', () => {
    const any = payload({ targets: ps('C4', 'E4'), mode: 'together', octave: 'any' });
    const r = mark(any, { played: ps('C4', 'C5') });
    expect(r.score).toBe(0.5);
    expect(r.reason).toBe('Two of your keys have the same note name, so a note is missing. The notes are C and E.');
  });
});

describe('play-keyboard mark: bad answers', () => {
  it('throws TheoryError for an answer the component cannot produce', () => {
    // @ts-expect-error deliberately wrong shape
    expect(() => mark(seq, { played: 'C4' })).toThrow(TheoryError);
    // @ts-expect-error deliberately wrong shape
    expect(() => mark(seq, undefined)).toThrow(TheoryError);
    // @ts-expect-error deliberately wrong shape
    expect(() => mark(seq, { played: [{ letter: 'H', accidental: 0, octave: 4 }, p('D4'), p('E4')] })).toThrow(TheoryError);
    expect(() => mark(seq, { played: ps('C4', 'D4') })).toThrow(TheoryError);
    expect(() =>
      mark(payload({ targets: ps('C4', 'E4'), mode: 'together' }), { played: ps('C4', 'C4') }),
    ).toThrow(TheoryError);
  });

  it('every reason is 40 words or fewer and has no exclamation mark', () => {
    const reasons = [
      mark(seq, { played: ps('C5', 'D4', 'E4') }).reason,
      mark(seq, { played: ps('C4', 'D4', 'F4') }).reason,
      mark(payload({ targets: ps('C4', 'E4', 'G4'), mode: 'together' }), { played: ps('C4') }).reason,
    ] as string[];
    for (const reason of reasons) {
      expect(reason.split(/\s+/).length).toBeLessThanOrEqual(40);
      expect(reason).not.toContain('!');
    }
  });
});
