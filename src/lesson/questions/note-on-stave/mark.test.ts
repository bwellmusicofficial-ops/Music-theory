import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Clef, Key, Pitch, PitchClass } from '@/engine/types';
import { mark } from './mark';
import type { NoteOnStavePayload } from './types';

const P = (s: string): Pitch => pitch.parsePitch(s);
const PC = (s: string): PitchClass => pitch.parsePitchClass(s);
const major = (tonic: string): Key => ({ tonic: PC(tonic), mode: 'major' });
const C = major('C');

const identify = (note: string, over: Partial<{ clef: Clef; key: Key; accidentals: boolean }> = {}): NoteOnStavePayload => ({
  mode: 'identify',
  clef: over.clef ?? 'treble',
  key: over.key ?? C,
  pitch: P(note),
  accidentals: over.accidentals ?? false,
});
const place = (
  target: string,
  over: Partial<{ clef: Clef; key: Key; accidentals: boolean; octave: number }> = {},
): NoteOnStavePayload => ({
  mode: 'place',
  clef: over.clef ?? 'treble',
  key: over.key ?? C,
  target: PC(target),
  ...(over.octave === undefined ? {} : { octave: over.octave }),
  accidentals: over.accidentals ?? false,
});

const named = (s: string) => ({ mode: 'identify' as const, name: PC(s) });
const placed = (s: string) => ({ mode: 'place' as const, pitch: P(s) });

describe('note-on-stave mark: identify', () => {
  it('is right when letter and accidental match', () => {
    expect(mark(identify('G4'), named('G'))).toEqual({ correct: true, score: 1 });
    expect(mark(identify('F#5', { key: major('G'), accidentals: true }), named('F#'))).toEqual({ correct: true, score: 1 });
  });

  it('wrong letter', () => {
    expect(mark(identify('G4'), named('A'))).toEqual({
      correct: false,
      score: 0,
      reason: 'That note is on the second line of the treble [[stave|stave]], which is G, not A.',
    });
  });

  it('wrong letter names the clef and the position, including ledger lines', () => {
    expect(mark(identify('C4', { clef: 'treble' }), named('D')).reason).toBe(
      'That note is on the first ledger line below the [[stave|stave]] of the treble [[stave|stave]], which is C, not D.',
    );
    expect(mark(identify('E3', { clef: 'bass' }), named('F')).reason).toBe(
      'That note is in the third space of the bass [[stave|stave]], which is E, not F.',
    );
    expect(mark(identify('C4', { clef: 'alto' }), named('B')).reason).toBe(
      'That note is on the middle line of the alto [[stave|stave]], which is C, not B.',
    );
  });

  it('wrong letter, shown note has a sign: names the pitch with its sign', () => {
    expect(mark(identify('F#5', { key: major('G'), accidentals: true }), named('G')).reason).toBe(
      'That note is on the top line of the treble [[stave|stave]], which is F♯, not G.',
    );
  });

  it('right letter, wrong sign, key signature sets the letter', () => {
    expect(mark(identify('F#5', { key: major('G'), accidentals: true }), named('F')).reason).toBe(
      'Right letter, but the key signature turns every F into F♯, so this note is F♯.',
    );
  });

  it('right letter, wrong sign, otherwise', () => {
    expect(mark(identify('Bb4', { accidentals: true }), named('B')).reason).toBe(
      'Right letter, but check the sign in front of the note: it is B♭, not B.',
    );
    expect(mark(identify('B4', { accidentals: true }), named('Bb')).reason).toBe(
      'Right letter, but check the sign in front of the note: it is B, not B♭.',
    );
  });

  it('right letter, wrong sign, key sets the letter but the note carries a different sign (a natural)', () => {
    // The key signature does not explain a natural sign, so the generic sentence is used.
    expect(mark(identify('F5', { key: major('G'), accidentals: true }), named('F#')).reason).toBe(
      'Right letter, but check the sign in front of the note: it is F, not F♯.',
    );
  });

  it('right letter, wrong sign, key sets a different letter', () => {
    expect(mark(identify('Bb4', { key: major('G'), accidentals: true }), named('B')).reason).toBe(
      'Right letter, but check the sign in front of the note: it is B♭, not B.',
    );
  });

  it('every reason is a sentence of at most 40 words with no exclamation mark', () => {
    const reason = mark(identify('C4'), named('B')).reason as string;
    expect(reason.split(/\s+/).length).toBeLessThanOrEqual(40);
    expect(reason).not.toContain('!');
  });
});

describe('note-on-stave mark: place', () => {
  it('is right for the target letter in any octave when no octave is given', () => {
    expect(mark(place('G'), placed('G4'))).toEqual({ correct: true, score: 1 });
    expect(mark(place('G'), placed('G5'))).toEqual({ correct: true, score: 1 });
    expect(mark(place('G'), placed('G3'))).toEqual({ correct: true, score: 1 });
  });

  it('is right for the exact octave when one is given', () => {
    expect(mark(place('C', { octave: 4 }), placed('C4'))).toEqual({ correct: true, score: 1 });
  });

  it('is right for a sharp or flat target', () => {
    expect(mark(place('F#', { accidentals: true }), placed('F#4'))).toEqual({ correct: true, score: 1 });
  });

  it('wrong letter: names what was placed and where the target letter is, nearest', () => {
    expect(mark(place('G'), placed('A4'))).toEqual({
      correct: false,
      score: 0,
      reason: 'You put the note in the second space, which is A. G is on the second line.',
    });
  });

  it('wrong letter picks the nearest position of the target letter, above or below', () => {
    // A4 is position 5. G4 is position 2 (3 away); G5 is position 9 (4 away): nearest is G4.
    expect(mark(place('G'), placed('A4')).reason).toContain('G is on the second line.');
    // D5 is position 6; C5 (position 5) is one away.
    expect(mark(place('C'), placed('D5')).reason).toBe(
      'You put the note on the fourth line, which is D. C is in the third space.',
    );
    // C4 is position -2; B3 (position -3) is one away.
    expect(mark(place('B'), placed('C4')).reason).toBe(
      'You put the note on the first ledger line below the [[stave|stave]], which is C. B is just below the first ledger line below the [[stave|stave]].',
    );
    // F4 is position 1; B4 (position 4) is three away and B3 (position -3) four.
    expect(mark(place('B'), placed('F4')).reason).toBe(
      'You put the note in the bottom space, which is F. B is on the middle line.',
    );
  });

  it('wrong letter uses the natural name even when a sign was added', () => {
    expect(mark(place('G', { accidentals: true }), placed('A#4')).reason).toBe(
      'You put the note in the second space, which is A. G is on the second line.',
    );
  });

  it('right letter, wrong octave: says higher or lower', () => {
    expect(mark(place('C', { octave: 4 }), placed('C5')).reason).toBe(
      'That is a C, but not the one asked for. You need the C on the first ledger line below the [[stave|stave]], which is lower than yours.',
    );
    expect(mark(place('C', { octave: 5 }), placed('C4')).reason).toBe(
      'That is a C, but not the one asked for. You need the C in the third space, which is higher than yours.',
    );
  });

  it('wrong octave is reported before a wrong sign', () => {
    expect(mark(place('F#', { octave: 4, accidentals: true }), placed('F5')).reason).toContain('not the one asked for');
  });

  it('right place, wrong sign, target has a sharp or flat', () => {
    expect(mark(place('F#', { accidentals: true }), placed('F4')).reason).toBe(
      'Right place, but F♯ needs a sharp sign in front of it.',
    );
    expect(mark(place('Bb', { accidentals: true }), placed('B4')).reason).toBe(
      'Right place, but B♭ needs a flat sign in front of it.',
    );
    expect(mark(place('F#', { accidentals: true }), placed('Fb4')).reason).toBe(
      'Right place, but F♯ needs a sharp sign in front of it.',
    );
  });

  it('right place, wrong sign, target is natural', () => {
    expect(mark(place('B', { accidentals: true }), placed('Bb4')).reason).toBe(
      'Right place, but this should be a plain B. Yours is B♭.',
    );
  });
});

describe('note-on-stave mark: answers the component never produces', () => {
  it('throws TheoryError when the answer mode does not fit the question', () => {
    expect(() => mark(identify('G4'), placed('G4'))).toThrow(TheoryError);
    expect(() => mark(place('G'), named('G'))).toThrow(TheoryError);
  });
  it('throws TheoryError for a malformed answer', () => {
    expect(() => mark(identify('G4'), { mode: 'identify', name: { letter: 'H', accidental: 0 } } as never)).toThrow(TheoryError);
    expect(() => mark(identify('G4'), { mode: 'identify', name: { letter: 'G', accidental: 5 } } as never)).toThrow(TheoryError);
    expect(() => mark(identify('G4'), { mode: 'identify' } as never)).toThrow(TheoryError);
    expect(() => mark(place('G'), { mode: 'place' } as never)).toThrow(TheoryError);
    expect(() => mark(place('G'), { mode: 'place', pitch: { letter: 'G', accidental: 0, octave: 1.5 } } as never)).toThrow(TheoryError);
    expect(() => mark(identify('G4'), undefined as never)).toThrow(TheoryError);
  });
});
