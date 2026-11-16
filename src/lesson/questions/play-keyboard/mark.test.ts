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

describe('play-keyboard marking with nameNotes: false', () => {
  const chord = payload({ targets: ps('C4', 'E4', 'G4'), mode: 'together' });
  const quiet = (payload: PlayKeyboardPayload) => ({ ...payload, nameNotes: false });
  const noNames = (reason: string | undefined) => {
    expect(reason).toBeDefined();
    expect(reason).not.toMatch(/[♯♭]/);
    expect(reason).not.toMatch(/\b(letter|sharp|flat)\b/);
    expect(reason!.replace(/^[A-Z]/, '').match(/\b[A-G]\b/g) ?? []).toEqual([]);
  };

  it('describes a white key that is too far right or left by how many keys', () => {
    const one = { ...seq, targets: ps('C4'), mode: 'sequence' as const };
    expect(mark(quiet(one), { played: ps('E4') }).reason).toBe('That key is two keys too far to the right.');
    expect(mark(quiet(one), { played: ps('B3') }).reason).toBe('That key is one key too far to the left.');
    expect(mark(quiet(seq), { played: ps('C4', 'G4', 'E4') }).reason).toBe('Note 2 is three keys too far to the right.');
  });

  it('counts a wrong octave in white keys, and counts black keys as black keys', () => {
    const one = { ...seq, targets: ps('C4'), mode: 'sequence' as const };
    expect(mark(quiet(one), { played: ps('C5') }).reason).toBe('That key is seven keys too far to the right.');
    const black = { ...one, targets: ps('F#4') };
    expect(mark(quiet(black), { played: ps('A#4') }).reason).toBe('That key is two black keys too far to the right.');
  });

  it('says when the colour is wrong', () => {
    const one = { ...seq, targets: ps('C#4'), mode: 'sequence' as const };
    expect(mark(quiet(one), { played: ps('D4') }).reason).toBe('That key is a white key, but this one needs a black key.');
    const white = { ...one, targets: ps('D4') };
    expect(mark(quiet(white), { played: ps('C#4') }).reason).toBe('That key is a black key, but this one needs a white key.');
  });

  it('with octave "any" measures to the nearest key with the target\'s name', () => {
    const any = { ...seq, targets: ps('C4'), mode: 'sequence' as const, octave: 'any' as const };
    expect(mark(quiet(any), { played: ps('E4') }).reason).toBe('That key is two keys too far to the right.');
  });

  it('chords: too few keys and a wrong colour name no notes', () => {
    const blacks = { ...chord, targets: ps('F#4', 'G#4', 'A#4') };
    expect(mark(quiet(blacks), { played: ps('F#4', 'G#4') }).reason).toBe('You chose 2 keys, but this needs 3 keys.');
    expect(mark(quiet(blacks), { played: ps('F#4', 'G4', 'A#4') }).reason).toBe(
      'One of those is a white key: the group you want is the three black keys.',
    );
    const whites = { ...chord, targets: ps('C4', 'E4', 'G4') };
    expect(mark(quiet(whites), { played: ps('C4', 'D#4', 'G4') }).reason).toBe(
      'One of those is a black key: the keys you want are all white keys.',
    );
    expect(mark(quiet(whites), { played: ps('C4', 'F4', 'G4') }).reason).toBe(
      'One of those keys is one key too far to the right of the nearest key you need.',
    );
  });

  it('never names a note, whatever the wrong answer', () => {
    const sequences = [seq, { ...seq, octave: 'any' as const }];
    for (const payload of sequences) {
      for (const played of [ps('D4', 'D4', 'D4'), ps('A#3', 'C#5', 'B4'), ps('C5', 'D4', 'E4'), ps('C4', 'D#4', 'E4')]) {
        const r = mark(quiet(payload), { played });
        if (!r.correct) noNames(r.reason);
      }
    }
    for (const played of [ps('C4', 'D4', 'F4'), ps('C#4', 'E4', 'G4'), ps('C4', 'E4'), ps('C4', 'C5', 'E4', 'G4').slice(0, 3)]) {
      const r = mark(quiet(chord), { played });
      if (!r.correct) noNames(r.reason);
    }
    const dup = mark(quiet({ ...chord, octave: 'any', targets: ps('C4', 'E4', 'G4') }), { played: ps('C4', 'E4', 'C5') });
    noNames(dup.reason);
  });

  it('the default is unchanged: names still appear', () => {
    expect(mark(seq, { played: ps('C4', 'F4', 'E4') }).reason).toContain('should be D');
    expect(mark({ ...seq, nameNotes: true }, { played: ps('C4', 'F4', 'E4') }).reason).toContain('should be D');
  });
});
