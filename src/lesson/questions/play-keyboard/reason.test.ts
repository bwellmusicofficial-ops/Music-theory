import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { joinList, name, playedName } from './reason';

const p = (s: string) => pitch.parsePitch(s);

describe('play-keyboard reason helpers', () => {
  it('name() uses display accidentals', () => {
    expect(name(p('F#4'))).toBe('F♯');
    expect(name(p('Bb3'))).toBe('B♭');
    expect(name(p('C4'))).toBe('C');
  });

  it('joinList joins with commas and a final "and"', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['C'])).toBe('C');
    expect(joinList(['C', 'E'])).toBe('C and E');
    expect(joinList(['C', 'E', 'G'])).toBe('C, E and G');
  });

  it('names a white key by its letter', () => {
    expect(playedName(p('E4'), [p('C4')])).toBe('E');
  });

  it('names a black key as a sharp unless some target is a flat', () => {
    expect(playedName(p('C#4'), [p('C4'), p('D4')])).toBe('C♯');
    expect(playedName(p('C#4'), [p('C4'), p('Eb4')])).toBe('D♭');
    expect(playedName(p('A#3'), [p('Bb3')])).toBe('B♭');
    expect(playedName(p('F#4'), [p('G4')])).toBe('F♯');
  });

  it('names a played pitch by its sound, whatever its spelling', () => {
    expect(playedName(p('Cb4'), [p('C4')])).toBe('B');
    expect(playedName(p('Db4'), [p('C4')])).toBe('C♯');
  });
});
