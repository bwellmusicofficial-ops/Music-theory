import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Degree, Key, Mode, Pitch, Triad, TriadQuality } from '../types';
import { pitch } from './index';
import { pcStr, pitchesStr } from './test-utils';

const K = (tonic: string, mode: Mode): Key => ({ tonic: pitch.parsePitchClass(tonic), mode });
const SHORT: Record<TriadQuality, string> = { major: 'maj', minor: 'min', diminished: 'dim', augmented: 'aug' };
const P = (t: string) => pitch.parsePitch(t);

// Expected diatonic triads, degrees 1..7, as "root:quality" plus numerals.
const DIATONIC: [string, Mode, string[], string[]][] = [
  ['C', 'major', ['C:maj', 'D:min', 'E:min', 'F:maj', 'G:maj', 'A:min', 'B:dim'], ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']],
  ['G', 'major', ['G:maj', 'A:min', 'B:min', 'C:maj', 'D:maj', 'E:min', 'F#:dim'], ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']],
  ['Eb', 'major', ['Eb:maj', 'F:min', 'G:min', 'Ab:maj', 'Bb:maj', 'C:min', 'D:dim'], ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']],
  ['F#', 'major', ['F#:maj', 'G#:min', 'A#:min', 'B:maj', 'C#:maj', 'D#:min', 'E#:dim'], ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']],
  ['Cb', 'major', ['Cb:maj', 'Db:min', 'Eb:min', 'Fb:maj', 'Gb:maj', 'Ab:min', 'Bb:dim'], ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']],
  ['A', 'minor', ['A:min', 'B:dim', 'C:aug', 'D:min', 'E:maj', 'F:maj', 'G#:dim'], ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']],
  ['D', 'minor', ['D:min', 'E:dim', 'F:aug', 'G:min', 'A:maj', 'Bb:maj', 'C#:dim'], ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']],
  ['C#', 'minor', ['C#:min', 'D#:dim', 'E:aug', 'F#:min', 'G#:maj', 'A:maj', 'B#:dim'], ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']],
  ['Eb', 'minor', ['Eb:min', 'F:dim', 'Gb:aug', 'Ab:min', 'Bb:maj', 'Cb:maj', 'D:dim'], ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']],
];

describe('triadOnDegree and romanNumeral', () => {
  for (const [tonic, mode, triads, numerals] of DIATONIC) {
    it(`${tonic} ${mode}`, () => {
      const key = K(tonic, mode);
      for (let d = 1; d <= 7; d++) {
        const t = pitch.triadOnDegree(key, d as Degree);
        expect(`${pcStr(t.root)}:${SHORT[t.quality]}`).toBe(triads[d - 1]);
        expect(pitch.romanNumeral(key, { ...t, inversion: 0 })).toBe(numerals[d - 1]);
        expect(pitch.romanNumeral(key, { ...t, inversion: 1 })).toBe(`${numerals[d - 1]}b`);
        expect(pitch.romanNumeral(key, { ...t, inversion: 2 })).toBe(`${numerals[d - 1]}c`);
      }
    });
  }

  it('numeral case follows the quality given, not the key', () => {
    const key = K('C', 'major');
    const root = pitch.parsePitchClass('D');
    expect(pitch.romanNumeral(key, { root, quality: 'major', inversion: 0 })).toBe('II');
    expect(pitch.romanNumeral(key, { root, quality: 'minor', inversion: 0 })).toBe('ii');
    expect(pitch.romanNumeral(key, { root, quality: 'diminished', inversion: 1 })).toBe('ii°b');
    expect(pitch.romanNumeral(key, { root, quality: 'augmented', inversion: 2 })).toBe('II+c');
  });

  it('throws for a root that is not a degree of the key', () => {
    expect(() =>
      pitch.romanNumeral(K('C', 'major'), { root: pitch.parsePitchClass('F#'), quality: 'major', inversion: 0 }),
    ).toThrow(TheoryError);
    // natural VII in a minor key is outside the harmonic-minor degrees
    expect(() =>
      pitch.romanNumeral(K('A', 'minor'), { root: pitch.parsePitchClass('G'), quality: 'major', inversion: 0 }),
    ).toThrow(TheoryError);
  });
});

describe('triadPitches', () => {
  const rows: [string, TriadQuality, 0 | 1 | 2, number, string][] = [
    ['C', 'major', 0, 4, 'C4 E4 G4'],
    ['C', 'major', 1, 4, 'E4 G4 C5'],
    ['C', 'major', 2, 4, 'G4 C5 E5'],
    ['B', 'diminished', 0, 3, 'B3 D4 F4'],
    ['B', 'diminished', 1, 3, 'D3 F3 B3'],
    ['B', 'diminished', 2, 3, 'F3 B3 D4'],
    ['C', 'augmented', 2, 3, 'G#3 C4 E4'],
    ['F#', 'major', 1, 3, 'A#3 C#4 F#4'],
    ['Eb', 'minor', 0, 3, 'Eb3 Gb3 Bb3'],
    ['E#', 'diminished', 0, 4, 'E#4 G#4 B4'],
    ['Gb', 'major', 0, 4, 'Gb4 Bb4 Db5'],
    ['Cb', 'major', 2, 4, 'Gb4 Cb5 Eb5'],
    ['G#', 'minor', 1, 2, 'B2 D#3 G#3'],
    ['A', 'minor', 0, 4, 'A4 C5 E5'],
  ];
  it.each(rows)('%s %s inversion %i bass octave %i', (root, quality, inversion, oct, expected) => {
    const triad: Triad = { root: pitch.parsePitchClass(root), quality, inversion };
    // Bass is always in the stated octave.
    const out = pitch.triadPitches(triad, oct);
    expect(pitchesStr(out)).toBe(expected);
    expect(out[0].octave).toBe(oct);
  });

  it('rejects bad input', () => {
    expect(() => pitch.triadPitches({ root: pitch.parsePitchClass('C'), quality: 'major', inversion: 3 as 0 }, 4)).toThrow(TheoryError);
    expect(() => pitch.triadPitches({ root: pitch.parsePitchClass('C'), quality: 'major', inversion: 0 }, 4.5)).toThrow(TheoryError);
    expect(() => pitch.triadPitches({ root: pitch.parsePitchClass('F'), quality: 'augmented', inversion: 0 }, 4)).not.toThrow();
    expect(() => pitch.triadPitches({ root: { letter: 'F', accidental: 2 }, quality: 'augmented', inversion: 0 }, 4)).toThrow(TheoryError);
  });
});

describe('identifyTriad', () => {
  const rows: [string[], string, TriadQuality, 0 | 1 | 2][] = [
    [['C4', 'E4', 'G4'], 'C', 'major', 0],
    [['G4', 'C4', 'E4'], 'C', 'major', 0],
    [['E4', 'G3', 'C5'], 'C', 'major', 2],
    [['G4', 'E4', 'C5'], 'C', 'major', 1],
    [['C2', 'G5', 'E3'], 'C', 'major', 0],
    [['E3', 'C2', 'G5'], 'C', 'major', 0],
    [['A3', 'C4', 'E4'], 'A', 'minor', 0],
    [['C4', 'E4', 'A4'], 'A', 'minor', 1],
    [['E3', 'A3', 'C4'], 'A', 'minor', 2],
    [['B3', 'D4', 'F4'], 'B', 'diminished', 0],
    [['F3', 'B3', 'D4'], 'B', 'diminished', 2],
    [['C4', 'E4', 'G#4'], 'C', 'augmented', 0],
    [['E4', 'G#4', 'C5'], 'C', 'augmented', 1],
    [['G#3', 'C4', 'E4'], 'C', 'augmented', 2],
    [['F#3', 'A#3', 'C#4'], 'F#', 'major', 0],
    [['A#3', 'C#4', 'F#4'], 'F#', 'major', 1],
    [['E#4', 'G#4', 'B4'], 'E#', 'diminished', 0],
    [['Bb2', 'Db3', 'F3'], 'Bb', 'minor', 0],
    [['Cb4', 'Eb4', 'Gb4'], 'Cb', 'major', 0],
    [['Gb4', 'Bb4', 'Db5'], 'Gb', 'major', 0],
    [['Fb4', 'Ab4', 'Cb5'], 'Fb', 'major', 0],
    [['F#4', 'A4', 'C5'], 'F#', 'diminished', 0],
    [['Ax4', 'Cx5', 'Ex5'], 'Ax', 'minor', 0],
  ];
  it.each(rows)('%j -> %s %s inversion %i', (pitches, root, quality, inversion) => {
    expect(pitch.identifyTriad(pitches.map(P))).toEqual({ root: pitch.parsePitchClass(root), quality, inversion });
  });

  const none: string[][] = [
    ['C4', 'E4', 'F4'],
    ['C4', 'E4', 'Bb4'],
    ['C4', 'Fb4', 'G4'],
    ['C4', 'Eb4', 'F#4'],
    ['C4', 'E4', 'G4', 'B4'],
    ['C4', 'E4'],
    ['C4', 'E4', 'E5'],
    ['C4', 'C5', 'C6'],
    ['C4', 'D4', 'E4'],
    ['C4', 'G4', 'D5'],
    [],
  ];
  it('returns null for non-triads', () => {
    for (const set of none) expect(pitch.identifyTriad(set.map(P))).toBeNull();
  });

  it('round-trips with triadPitches for every quality and inversion', () => {
    const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'F#', 'Bb', 'Eb', 'C#', 'Gb'];
    const qualities: TriadQuality[] = ['major', 'minor', 'diminished', 'augmented'];
    let n = 0;
    for (const r of roots)
      for (const quality of qualities)
        for (const inversion of [0, 1, 2] as const) {
          const triad: Triad = { root: pitch.parsePitchClass(r), quality, inversion };
          let pitches: Pitch[];
          try {
            pitches = pitch.triadPitches(triad, 3);
          } catch {
            continue; // needs more than a double accidental
          }
          expect(pitch.identifyTriad(pitches)).toEqual(triad);
          n++;
        }
    expect(n).toBeGreaterThan(100);
  });
});
