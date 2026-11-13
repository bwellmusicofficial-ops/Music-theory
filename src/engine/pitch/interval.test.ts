import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Interval, IntervalQuality } from '../types';
import { pitch } from './index';
import { pitchStr } from './test-utils';

const P = (t: string) => pitch.parsePitch(t);

// [lower, upper, quality, number, semitones]
const between: [string, string, IntervalQuality, number, number][] = [
  ['C4', 'C4', 'perfect', 1, 0],
  ['C4', 'C#4', 'augmented', 1, 1],
  ['C4', 'Db4', 'minor', 2, 1],
  ['C4', 'D4', 'major', 2, 2],
  ['C4', 'D#4', 'augmented', 2, 3],
  ['C#4', 'Db4', 'diminished', 2, 0],
  ['C4', 'Ebb4', 'diminished', 3, 2],
  ['C4', 'Eb4', 'minor', 3, 3],
  ['C4', 'E4', 'major', 3, 4],
  ['C4', 'E#4', 'augmented', 3, 5],
  ['C4', 'Fb4', 'diminished', 4, 4],
  ['C4', 'F4', 'perfect', 4, 5],
  ['C4', 'F#4', 'augmented', 4, 6],
  ['C4', 'Gb4', 'diminished', 5, 6],
  ['C4', 'G4', 'perfect', 5, 7],
  ['C4', 'G#4', 'augmented', 5, 8],
  ['C4', 'Abb4', 'diminished', 6, 7],
  ['C4', 'Ab4', 'minor', 6, 8],
  ['C4', 'A4', 'major', 6, 9],
  ['C4', 'A#4', 'augmented', 6, 10],
  ['C4', 'Bbb4', 'diminished', 7, 9],
  ['C4', 'Bb4', 'minor', 7, 10],
  ['C4', 'B4', 'major', 7, 11],
  ['C4', 'B#4', 'augmented', 7, 12],
  ['C4', 'Cb5', 'diminished', 8, 11],
  ['C4', 'C5', 'perfect', 8, 12],
  ['C4', 'C#5', 'augmented', 8, 13],
  ['C4', 'Db5', 'minor', 9, 13],
  ['C4', 'D5', 'major', 9, 14],
  ['C4', 'D#5', 'augmented', 9, 15],
  ['C4', 'Eb5', 'minor', 10, 15],
  ['C4', 'E5', 'major', 10, 16],
  ['C4', 'F5', 'perfect', 11, 17],
  ['C4', 'F#5', 'augmented', 11, 18],
  ['C4', 'Gb5', 'diminished', 12, 18],
  ['C4', 'G5', 'perfect', 12, 19],
  ['C4', 'Ab5', 'minor', 13, 20],
  ['C4', 'A5', 'major', 13, 21],
  ['C4', 'Bb5', 'minor', 14, 22],
  ['C4', 'B5', 'major', 14, 23],
  ['C4', 'C6', 'perfect', 15, 24],
  ['C4', 'C#6', 'augmented', 15, 25],
  // other tonics and spellings
  ['F#3', 'A#3', 'major', 3, 4],
  ['F#3', 'A3', 'minor', 3, 3],
  ['B3', 'F4', 'diminished', 5, 6],
  ['Bb3', 'E4', 'augmented', 4, 6],
  ['E4', 'Bb4', 'diminished', 5, 6],
  ['Ab3', 'F#4', 'augmented', 6, 10],
  ['D#4', 'Bb4', 'diminished', 6, 7],
  ['Fx4', 'C#5', 'diminished', 5, 6],
  ['Cb4', 'Gb4', 'perfect', 5, 7],
  ['Gb3', 'Db4', 'perfect', 5, 7],
  ['Ebb4', 'Gb4', 'major', 3, 4],
  ['B#3', 'Dx4', 'major', 3, 4],
  ['E#4', 'B#4', 'perfect', 5, 7],
  ['A3', 'C5', 'minor', 10, 15],
  ['D4', 'F#5', 'major', 10, 16],
  ['G2', 'F4', 'minor', 14, 22],
  ['D4', 'A#4', 'augmented', 5, 8],
  ['Ebb4', 'Fb4', 'major', 2, 2],
  ['A3', 'Bbb3', 'diminished', 2, 0],
  ['Gx3', 'G#4', 'diminished', 8, 11],
  ['C4', 'C4', 'perfect', 1, 0],
  ['A4', 'A5', 'perfect', 8, 12],
  ['F4', 'B4', 'augmented', 4, 6],
  ['B3', 'F5', 'diminished', 12, 18],
  ['G4', 'E6', 'major', 13, 21],
  ['Eb3', 'C#4', 'augmented', 6, 10],
];

describe('intervalBetween and semitones', () => {
  it('has at least 60 table rows', () => {
    expect(between.length).toBeGreaterThanOrEqual(60);
  });

  it.each(between)('%s to %s is %s %i (%i semitones)', (lo, hi, quality, number, semis) => {
    expect(pitch.intervalBetween(P(lo), P(hi))).toEqual({ quality, number });
    expect(pitch.semitones({ quality, number })).toBe(semis);
    // Sounding semitone distance agrees with the interval's size.
    expect(pitch.toMidi(P(hi)) - pitch.toMidi(P(lo))).toBe(semis);
  });

  it('measures from the lower to the higher pitch whatever the argument order', () => {
    for (const [lo, hi] of between) {
      expect(pitch.intervalBetween(P(hi), P(lo))).toEqual(pitch.intervalBetween(P(lo), P(hi)));
    }
  });

  it('throws for doubly augmented / diminished spellings', () => {
    expect(() => pitch.intervalBetween(P('Fx4'), P('C5'))).toThrow(TheoryError); // doubly diminished 5th
    expect(() => pitch.intervalBetween(P('B#3'), P('Cb4'))).toThrow(TheoryError);
    expect(() => pitch.intervalBetween(P('Cx4'), P('Db4'))).toThrow(TheoryError);
  });

  it('semitones rejects impossible intervals', () => {
    const bad: Interval[] = [
      { quality: 'perfect', number: 3 },
      { quality: 'major', number: 5 },
      { quality: 'minor', number: 4 },
      { quality: 'major', number: 1 },
      { quality: 'diminished', number: 1 },
      { quality: 'perfect', number: 0 },
      { quality: 'perfect', number: 1.5 },
      { quality: 'weird' as IntervalQuality, number: 3 },
    ];
    for (const iv of bad) expect(() => pitch.semitones(iv)).toThrow(TheoryError);
  });
});

describe('intervalName', () => {
  const names: [IntervalQuality, number, string][] = [
    ['major', 3, 'major 3rd'],
    ['perfect', 5, 'perfect 5th'],
    ['augmented', 4, 'augmented 4th'],
    ['minor', 10, 'minor 10th'],
    ['diminished', 5, 'diminished 5th'],
    ['perfect', 1, 'perfect 1st'],
    ['major', 2, 'major 2nd'],
    ['perfect', 8, 'perfect 8th'],
    ['major', 9, 'major 9th'],
    ['perfect', 11, 'perfect 11th'],
    ['perfect', 12, 'perfect 12th'],
    ['major', 13, 'major 13th'],
    ['perfect', 15, 'perfect 15th'],
    ['major', 16, 'major 16th'],
    ['perfect', 22, 'perfect 22nd'],
    ['augmented', 1, 'augmented 1st'],
  ];
  it.each(names)('%s %i', (quality, number, expected) => {
    expect(pitch.intervalName({ quality, number })).toBe(expected);
  });
});

describe('transpose', () => {
  const table: [string, IntervalQuality, number, 'up' | 'down', string][] = [
    ['C4', 'major', 3, 'up', 'E4'],
    ['F#4', 'major', 3, 'up', 'A#4'],
    ['F#4', 'perfect', 5, 'up', 'C#5'],
    ['B3', 'minor', 2, 'up', 'C4'],
    ['Bb4', 'major', 2, 'down', 'Ab4'],
    ['Eb4', 'augmented', 2, 'up', 'F#4'],
    ['G#4', 'augmented', 5, 'up', 'Dx5'],
    ['C4', 'perfect', 8, 'up', 'C5'],
    ['C4', 'major', 9, 'up', 'D5'],
    ['C4', 'minor', 10, 'down', 'A2'],
    ['E4', 'perfect', 5, 'down', 'A3'],
    ['Cbb4', 'minor', 2, 'down', 'Bbb3'],
    ['F#4', 'diminished', 5, 'up', 'C5'],
    ['D4', 'minor', 3, 'up', 'F4'],
    ['Gb4', 'major', 7, 'up', 'F5'],
    ['E4', 'perfect', 1, 'up', 'E4'],
    ['B#3', 'augmented', 1, 'up', 'Bx3'],
    ['C4', 'diminished', 8, 'up', 'Cb5'],
    ['Db4', 'perfect', 4, 'down', 'Ab3'],
  ];
  it.each(table)('%s %s %i %s = %s', (start, quality, number, dir, expected) => {
    expect(pitchStr(pitch.transpose(P(start), { quality, number }, dir))).toBe(expected);
  });

  it('throws when a triple accidental would be needed', () => {
    expect(() => pitch.transpose(P('Dx4'), { quality: 'augmented', number: 5 }, 'up')).toThrow(TheoryError);
    expect(() => pitch.transpose(P('Cbb4'), { quality: 'major', number: 2 }, 'down')).toThrow(TheoryError);
    expect(() => pitch.transpose(P('Fx4'), { quality: 'augmented', number: 3 }, 'up')).toThrow(TheoryError);
  });

  it('round-trips every interval from many starting pitches', () => {
    const intervals: Interval[] = [];
    const simple: [IntervalQuality, number[]][] = [
      ['perfect', [1, 4, 5, 8, 11, 12, 15]],
      ['major', [2, 3, 6, 7, 9, 10, 13, 14]],
      ['minor', [2, 3, 6, 7, 9, 10, 13, 14]],
      ['augmented', [1, 2, 3, 4, 5, 6, 7, 8, 9, 12]],
      ['diminished', [2, 3, 4, 5, 6, 7, 8, 9, 12]],
    ];
    for (const [quality, nums] of simple) for (const number of nums) intervals.push({ quality, number });
    const starts = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'F#3', 'Bb3', 'Eb4', 'C#5', 'Gb4', 'Cb4', 'B#3', 'Ab3'].map(P);
    let ok = 0;
    for (const s of starts)
      for (const iv of intervals)
        for (const dir of ['up', 'down'] as const) {
          let moved;
          try {
            moved = pitch.transpose(s, iv, dir);
          } catch (e) {
            expect(e).toBeInstanceOf(TheoryError);
            continue;
          }
          const back = pitch.transpose(moved, iv, dir === 'up' ? 'down' : 'up');
          expect(pitchStr(back)).toBe(pitchStr(s));
          const measured = dir === 'up' ? pitch.intervalBetween(s, moved) : pitch.intervalBetween(moved, s);
          expect(measured).toEqual(iv);
          ok++;
        }
    expect(ok).toBeGreaterThan(1000);
  });

  it('does not mutate its input', () => {
    const s = P('C4');
    pitch.transpose(s, { quality: 'major', number: 3 }, 'up');
    expect(s).toEqual({ letter: 'C', accidental: 0, octave: 4 });
  });
});
