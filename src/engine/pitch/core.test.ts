import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Accidental, Clef, Letter, Pitch } from '../types';
import { pitch } from './index';
import { pitchStr } from './test-utils';

const p = (letter: Letter, accidental: Accidental, octave: number): Pitch => ({ letter, accidental, octave });

describe('parse and format', () => {
  const cases: [string, Pitch][] = [
    ['C4', p('C', 0, 4)],
    ['F#3', p('F', 1, 3)],
    ['Bb5', p('B', -1, 5)],
    ['Ebb2', p('E', -2, 2)],
    ['Fx4', p('F', 2, 4)],
    ['Cb4', p('C', -1, 4)],
    ['B#3', p('B', 1, 3)],
    ['C-1', p('C', 0, -1)],
    ['G10', p('G', 0, 10)],
  ];
  it.each(cases)('parses and formats %s', (text, expected) => {
    expect(pitch.parsePitch(text)).toEqual(expected);
    expect(pitch.formatPitch(expected)).toBe(text);
  });

  it('round-trips every letter, accidental and octave 0-8', () => {
    const letters: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const accs: Accidental[] = [-2, -1, 0, 1, 2];
    for (const l of letters)
      for (const a of accs)
        for (let o = 0; o <= 8; o++) {
          const text = pitch.formatPitch(p(l, a, o));
          expect(pitchStr(pitch.parsePitch(text))).toBe(text);
        }
  });

  const pcCases: [string, Letter, Accidental][] = [
    ['C', 'C', 0],
    ['F#', 'F', 1],
    ['Bb', 'B', -1],
    ['Ebb', 'E', -2],
    ['Cx', 'C', 2],
  ];
  it.each(pcCases)('parsePitchClass %s', (text, letter, accidental) => {
    expect(pitch.parsePitchClass(text)).toEqual({ letter, accidental });
  });

  const badPitches = ['', 'C', 'H4', 'c4', 'C##4', 'Cbbb4', 'C 4', ' C4', 'C4 ', 'C#', '4', 'Cb', 'C4.5', 'Cn4', 'C♯4', 'Bx'];
  it.each(badPitches)('parsePitch rejects %j', (text) => {
    expect(() => pitch.parsePitch(text)).toThrow(TheoryError);
  });

  const badPcs = ['', 'H', 'c', 'C4', 'C##', 'Cbbb', 'C#b', 'b', 'C♯'];
  it.each(badPcs)('parsePitchClass rejects %j', (text) => {
    expect(() => pitch.parsePitchClass(text)).toThrow(TheoryError);
  });

  it('formatPitch rejects malformed pitches', () => {
    expect(() => pitch.formatPitch({ letter: 'H', accidental: 0, octave: 4 } as unknown as Pitch)).toThrow(TheoryError);
    expect(() => pitch.formatPitch({ letter: 'C', accidental: 3, octave: 4 } as unknown as Pitch)).toThrow(TheoryError);
    expect(() => pitch.formatPitch(p('C', 0, 4.5))).toThrow(TheoryError);
  });
});

describe('displayPitchClass', () => {
  const cases: [Letter, Accidental, string][] = [
    ['C', 0, 'C'],
    ['F', 1, 'F♯'],
    ['B', -1, 'B♭'],
    ['C', 2, 'C𝄪'],
    ['E', -2, 'E𝄫'],
  ];
  it.each(cases)('%s %i', (letter, accidental, out) => {
    expect(pitch.displayPitchClass({ letter, accidental })).toBe(out);
  });
});

describe('numeric relationships', () => {
  const midi: [string, number][] = [
    ['C4', 60],
    ['A4', 69],
    ['C-1', 0],
    ['G9', 127],
    ['B#3', 60],
    ['Cb4', 59],
    ['Fx4', 67],
    ['Dbb4', 60],
    ['C#4', 61],
    ['Db4', 61],
  ];
  it.each(midi)('toMidi %s = %i', (text, n) => {
    expect(pitch.toMidi(pitch.parsePitch(text))).toBe(n);
  });

  const chromas: [string, number][] = [
    ['C', 0],
    ['B#', 0],
    ['Dbb', 0],
    ['C#', 1],
    ['Db', 1],
    ['Bx', 1],
    ['B', 11],
    ['Cb', 11],
    ['Ax', 11],
    ['Fb', 4],
  ];
  it.each(chromas)('chroma %s = %i', (text, n) => {
    expect(pitch.chroma(pitch.parsePitchClass(text))).toBe(n);
  });

  it('enharmonicallyEqual compares sounding class only', () => {
    const e = (a: string, b: string) => pitch.enharmonicallyEqual(pitch.parsePitchClass(a), pitch.parsePitchClass(b));
    expect(e('F#', 'Gb')).toBe(true);
    expect(e('C', 'B#')).toBe(true);
    expect(e('Dx', 'E')).toBe(true);
    expect(e('F#', 'F')).toBe(false);
    expect(e('C', 'C')).toBe(true);
  });

  it('comparePitch orders by sounding pitch', () => {
    const c = (a: string, b: string) => pitch.comparePitch(pitch.parsePitch(a), pitch.parsePitch(b));
    expect(c('C4', 'D4')).toBeLessThan(0);
    expect(c('D4', 'C4')).toBeGreaterThan(0);
    expect(c('B#3', 'C4')).toBe(0);
    expect(c('C#4', 'Db4')).toBe(0);
    expect(c('B3', 'C4')).toBeLessThan(0);
    expect(c('C5', 'B#4')).toBe(0);
  });
});

describe('stave positions', () => {
  // [pitch, position]. Bottom line = 0, top line = 8; ledger lines below 0 / above 8.
  const table: Record<Clef, [string, number][]> = {
    treble: [
      ['E4', 0], ['F4', 1], ['G4', 2], ['A4', 3], ['B4', 4], ['C5', 5], ['D5', 6], ['E5', 7], ['F5', 8],
      ['D4', -1], ['C4', -2], ['B3', -3], ['A3', -4], ['E3', -7],
      ['G5', 9], ['A5', 10], ['B5', 11], ['C6', 12],
    ],
    bass: [
      ['G2', 0], ['A2', 1], ['B2', 2], ['C3', 3], ['D3', 4], ['E3', 5], ['F3', 6], ['G3', 7], ['A3', 8],
      ['F2', -1], ['E2', -2], ['C2', -4],
      ['B3', 9], ['C4', 10], ['E4', 12],
    ],
    alto: [
      ['F3', 0], ['G3', 1], ['A3', 2], ['B3', 3], ['C4', 4], ['D4', 5], ['E4', 6], ['F4', 7], ['G4', 8],
      ['E3', -1], ['D3', -2], ['A4', 9], ['B4', 10], ['C5', 11],
    ],
    tenor: [
      ['D3', 0], ['E3', 1], ['F3', 2], ['G3', 3], ['A3', 4], ['B3', 5], ['C4', 6], ['D4', 7], ['E4', 8],
      ['C3', -1], ['B2', -2], ['F4', 9], ['G4', 10],
    ],
  };
  for (const clef of Object.keys(table) as Clef[]) {
    it.each(table[clef])(`${clef}: %s is position %i`, (text, pos) => {
      const pt = pitch.parsePitch(text);
      expect(pitch.stavePosition(pt, clef)).toBe(pos);
      expect(pitchStr(pitch.pitchAtStavePosition(pos, clef))).toBe(text);
    });
  }

  it('ignores accidentals', () => {
    expect(pitch.stavePosition(pitch.parsePitch('F#4'), 'treble')).toBe(1);
    expect(pitch.stavePosition(pitch.parsePitch('Fb4'), 'treble')).toBe(1);
    expect(pitch.stavePosition(pitch.parsePitch('Fx4'), 'treble')).toBe(1);
  });

  it('middle C sits on the expected line in each clef', () => {
    const c4 = pitch.parsePitch('C4');
    expect(pitch.stavePosition(c4, 'treble')).toBe(-2);
    expect(pitch.stavePosition(c4, 'bass')).toBe(10);
    expect(pitch.stavePosition(c4, 'alto')).toBe(4);
    expect(pitch.stavePosition(c4, 'tenor')).toBe(6);
  });

  it('pitchAtStavePosition returns naturals and inverts stavePosition', () => {
    for (const clef of ['treble', 'bass', 'alto', 'tenor'] as Clef[])
      for (let pos = -14; pos <= 22; pos++) {
        const pt = pitch.pitchAtStavePosition(pos, clef);
        expect(pt.accidental).toBe(0);
        expect(pitch.stavePosition(pt, clef)).toBe(pos);
      }
  });

  it('rejects non-integer positions and unknown clefs', () => {
    expect(() => pitch.pitchAtStavePosition(1.5, 'treble')).toThrow(TheoryError);
    expect(() => pitch.stavePosition(pitch.parsePitch('C4'), 'soprano' as Clef)).toThrow(TheoryError);
  });
});
