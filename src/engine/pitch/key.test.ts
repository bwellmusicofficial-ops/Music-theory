import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Degree, Key, Mode, ScaleType } from '../types';
import { pitch } from './index';
import { pcStr, pcsStr, pitchesStr } from './test-utils';

const K = (tonic: string, mode: Mode): Key => ({ tonic: pitch.parsePitchClass(tonic), mode });
const keyStr = (k: Key) => `${pcStr(k.tonic)} ${k.mode}`;

// [tonic, signature] in the contract's order (sharps then flats).
const MAJOR_KEYS: [string, number][] = [
  ['C', 0], ['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F#', 6], ['C#', 7],
  ['F', -1], ['Bb', -2], ['Eb', -3], ['Ab', -4], ['Db', -5], ['Gb', -6], ['Cb', -7],
];
const MINOR_KEYS: [string, number][] = [
  ['A', 0], ['E', 1], ['B', 2], ['F#', 3], ['C#', 4], ['G#', 5], ['D#', 6], ['A#', 7],
  ['D', -1], ['G', -2], ['C', -3], ['F', -4], ['Bb', -5], ['Eb', -6], ['Ab', -7],
];

describe('allKeys', () => {
  it('lists 15 major then 15 minor keys in order', () => {
    const keys = pitch.allKeys();
    expect(keys).toHaveLength(30);
    expect(keys.slice(0, 15).map(keyStr)).toEqual(MAJOR_KEYS.map(([t]) => `${t} major`));
    expect(keys.slice(15).map(keyStr)).toEqual(MINOR_KEYS.map(([t]) => `${t} minor`));
  });
});

describe('key signatures', () => {
  it.each(MAJOR_KEYS)('%s major has signature %i and is its inverse', (tonic, sig) => {
    expect(pitch.keySignature(K(tonic, 'major'))).toBe(sig);
    expect(keyStr(pitch.keyFromSignature(sig, 'major'))).toBe(`${tonic} major`);
  });
  it.each(MINOR_KEYS)('%s minor has signature %i and is its inverse', (tonic, sig) => {
    expect(pitch.keySignature(K(tonic, 'minor'))).toBe(sig);
    expect(keyStr(pitch.keyFromSignature(sig, 'minor'))).toBe(`${tonic} minor`);
  });

  it('rejects keys needing more than 7 sharps/flats', () => {
    for (const [t, m] of [['G#', 'major'], ['D#', 'major'], ['Fb', 'major'], ['E#', 'minor'], ['Dbb', 'major'], ['Fb', 'minor']] as [string, Mode][]) {
      expect(() => pitch.keySignature(K(t, m))).toThrow(TheoryError);
    }
  });
  it('rejects out-of-range or fractional signatures', () => {
    for (const s of [8, -8, 1.5, Number.NaN]) expect(() => pitch.keyFromSignature(s, 'major')).toThrow(TheoryError);
  });
});

describe('relative keys', () => {
  it.each(MAJOR_KEYS.map(([maj], i) => [maj, MINOR_KEYS[i][0]] as const))('%s major <-> %s minor', (maj, min) => {
    expect(keyStr(pitch.relativeKey(K(maj, 'major')))).toBe(`${min} minor`);
    expect(keyStr(pitch.relativeKey(K(min, 'minor')))).toBe(`${maj} major`);
  });
});

describe('signatureAccidentals', () => {
  const table: [number, string][] = [
    [0, ''],
    [1, 'F#'],
    [2, 'F# C#'],
    [3, 'F# C# G#'],
    [4, 'F# C# G# D#'],
    [5, 'F# C# G# D# A#'],
    [6, 'F# C# G# D# A# E#'],
    [7, 'F# C# G# D# A# E# B#'],
    [-1, 'Bb'],
    [-2, 'Bb Eb'],
    [-3, 'Bb Eb Ab'],
    [-4, 'Bb Eb Ab Db'],
    [-5, 'Bb Eb Ab Db Gb'],
    [-6, 'Bb Eb Ab Db Gb Cb'],
    [-7, 'Bb Eb Ab Db Gb Cb Fb'],
  ];
  it.each(table)('%i', (sig, expected) => {
    expect(pcsStr(pitch.signatureAccidentals(sig))).toBe(expected);
  });
  it('rejects out of range', () => {
    expect(() => pitch.signatureAccidentals(8)).toThrow(TheoryError);
    expect(() => pitch.signatureAccidentals(-8)).toThrow(TheoryError);
  });
});

describe('keyName and degreeName', () => {
  it('names keys with real glyphs', () => {
    expect(pitch.keyName(K('D', 'major'))).toBe('D major');
    expect(pitch.keyName(K('F#', 'minor'))).toBe('F♯ minor');
    expect(pitch.keyName(K('Bb', 'major'))).toBe('B♭ major');
    expect(pitch.keyName(K('Cb', 'major'))).toBe('C♭ major');
  });
  it('names degrees', () => {
    const names = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'leading note'];
    names.forEach((n, i) => expect(pitch.degreeName((i + 1) as Degree)).toBe(n));
    expect(() => pitch.degreeName(8 as Degree)).toThrow(TheoryError);
  });
});

// Hand-written spellings, tonic to tonic (x = double sharp).
const MAJOR: Record<string, string> = {
  C: 'C D E F G A B C',
  G: 'G A B C D E F# G',
  D: 'D E F# G A B C# D',
  A: 'A B C# D E F# G# A',
  E: 'E F# G# A B C# D# E',
  B: 'B C# D# E F# G# A# B',
  'F#': 'F# G# A# B C# D# E# F#',
  'C#': 'C# D# E# F# G# A# B# C#',
  F: 'F G A Bb C D E F',
  Bb: 'Bb C D Eb F G A Bb',
  Eb: 'Eb F G Ab Bb C D Eb',
  Ab: 'Ab Bb C Db Eb F G Ab',
  Db: 'Db Eb F Gb Ab Bb C Db',
  Gb: 'Gb Ab Bb Cb Db Eb F Gb',
  Cb: 'Cb Db Eb Fb Gb Ab Bb Cb',
};
const NATURAL_MINOR: Record<string, string> = {
  A: 'A B C D E F G A',
  E: 'E F# G A B C D E',
  B: 'B C# D E F# G A B',
  'F#': 'F# G# A B C# D E F#',
  'C#': 'C# D# E F# G# A B C#',
  'G#': 'G# A# B C# D# E F# G#',
  'D#': 'D# E# F# G# A# B C# D#',
  'A#': 'A# B# C# D# E# F# G# A#',
  D: 'D E F G A Bb C D',
  G: 'G A Bb C D Eb F G',
  C: 'C D Eb F G Ab Bb C',
  F: 'F G Ab Bb C Db Eb F',
  Bb: 'Bb C Db Eb F Gb Ab Bb',
  Eb: 'Eb F Gb Ab Bb Cb Db Eb',
  Ab: 'Ab Bb Cb Db Eb Fb Gb Ab',
};
const HARMONIC_MINOR: Record<string, string> = {
  A: 'A B C D E F G# A',
  E: 'E F# G A B C D# E',
  B: 'B C# D E F# G A# B',
  'F#': 'F# G# A B C# D E# F#',
  'C#': 'C# D# E F# G# A B# C#',
  'G#': 'G# A# B C# D# E Fx G#',
  'D#': 'D# E# F# G# A# B Cx D#',
  'A#': 'A# B# C# D# E# F# Gx A#',
  D: 'D E F G A Bb C# D',
  G: 'G A Bb C D Eb F# G',
  C: 'C D Eb F G Ab B C',
  F: 'F G Ab Bb C Db E F',
  Bb: 'Bb C Db Eb F Gb A Bb',
  Eb: 'Eb F Gb Ab Bb Cb D Eb',
  Ab: 'Ab Bb Cb Db Eb Fb G Ab',
};
const MELODIC_ASC: Record<string, string> = {
  A: 'A B C D E F# G# A',
  E: 'E F# G A B C# D# E',
  B: 'B C# D E F# G# A# B',
  'F#': 'F# G# A B C# D# E# F#',
  'C#': 'C# D# E F# G# A# B# C#',
  'G#': 'G# A# B C# D# E# Fx G#',
  'D#': 'D# E# F# G# A# B# Cx D#',
  'A#': 'A# B# C# D# E# Fx Gx A#',
  D: 'D E F G A B C# D',
  G: 'G A Bb C D E F# G',
  C: 'C D Eb F G A B C',
  F: 'F G Ab Bb C D E F',
  Bb: 'Bb C Db Eb F G A Bb',
  Eb: 'Eb F Gb Ab Bb C D Eb',
  Ab: 'Ab Bb Cb Db Eb F G Ab',
};
const reversed = (s: string) => s.split(' ').reverse().join(' ');

function scaleNames(tonic: string, type: ScaleType, dir?: 'ascending' | 'descending') {
  return pitch.scale(pitch.parsePitchClass(tonic), type, 4, dir).map((p) => pcStr(p)).join(' ');
}

describe('scales spelled note by note', () => {
  it.each(Object.entries(MAJOR))('%s major', (t, expected) => {
    expect(scaleNames(t, 'major')).toBe(expected);
    expect(scaleNames(t, 'major', 'descending')).toBe(reversed(expected));
  });
  it.each(Object.entries(NATURAL_MINOR))('%s natural minor', (t, expected) => {
    expect(scaleNames(t, 'natural-minor')).toBe(expected);
    expect(scaleNames(t, 'natural-minor', 'descending')).toBe(reversed(expected));
  });
  it.each(Object.entries(HARMONIC_MINOR))('%s harmonic minor', (t, expected) => {
    expect(scaleNames(t, 'harmonic-minor')).toBe(expected);
    expect(scaleNames(t, 'harmonic-minor', 'descending')).toBe(reversed(expected));
  });
  it.each(Object.entries(MELODIC_ASC))('%s melodic minor (raised 6th and 7th up, natural down)', (t, expected) => {
    expect(scaleNames(t, 'melodic-minor')).toBe(expected);
    expect(scaleNames(t, 'melodic-minor', 'ascending')).toBe(expected);
    expect(scaleNames(t, 'melodic-minor', 'descending')).toBe(reversed(NATURAL_MINOR[t]));
  });

  it('has the 15 tonics for each mode in the tables', () => {
    for (const t of [MAJOR, NATURAL_MINOR, HARMONIC_MINOR, MELODIC_ASC]) expect(Object.keys(t)).toHaveLength(15);
  });

  it('puts octave numbers on correctly', () => {
    const o = (t: string, type: ScaleType, oct: number, dir?: 'ascending' | 'descending') =>
      pitchesStr(pitch.scale(pitch.parsePitchClass(t), type, oct, dir));
    expect(o('C', 'major', 4)).toBe('C4 D4 E4 F4 G4 A4 B4 C5');
    expect(o('B', 'major', 3)).toBe('B3 C#4 D#4 E4 F#4 G#4 A#4 B4');
    expect(o('C#', 'major', 4)).toBe('C#4 D#4 E#4 F#4 G#4 A#4 B#4 C#5');
    expect(o('Cb', 'major', 4)).toBe('Cb4 Db4 Eb4 Fb4 Gb4 Ab4 Bb4 Cb5');
    expect(o('A', 'melodic-minor', 3, 'descending')).toBe('A4 G4 F4 E4 D4 C4 B3 A3');
    expect(o('D#', 'harmonic-minor', 4)).toBe('D#4 E#4 F#4 G#4 A#4 B4 Cx5 D#5');
  });

  it('chromatic: 13 notes, sharps ascending, flats descending', () => {
    const asc = (t: string) => pitchesStr(pitch.scale(pitch.parsePitchClass(t), 'chromatic', 4));
    const desc = (t: string) => pitchesStr(pitch.scale(pitch.parsePitchClass(t), 'chromatic', 4, 'descending'));
    expect(asc('C')).toBe('C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5');
    expect(desc('C')).toBe('C5 B4 Bb4 A4 Ab4 G4 Gb4 F4 E4 Eb4 D4 Db4 C4');
    expect(asc('A')).toBe('A4 A#4 B4 C5 C#5 D5 D#5 E5 F5 F#5 G5 G#5 A5');
    expect(desc('A')).toBe('A5 Ab5 G5 Gb5 F5 E5 Eb5 D5 Db5 C5 B4 Bb4 A4');
    expect(asc('Bb')).toBe('Bb4 B4 C5 C#5 D5 D#5 E5 F5 F#5 G5 G#5 A5 Bb5');
    expect(desc('Eb')).toBe('Eb5 D5 Db5 C5 B4 Bb4 A4 Ab4 G4 Gb4 F4 E4 Eb4');
    expect(asc('F#')).toBe('F#4 G4 G#4 A4 A#4 B4 C5 C#5 D5 D#5 E5 F5 F#5');
    for (const t of ['C', 'F#', 'Bb', 'Cb', 'B#']) {
      expect(pitch.scale(pitch.parsePitchClass(t), 'chromatic', 3)).toHaveLength(13);
    }
  });

  it('keeps ascending scales strictly rising', () => {
    for (const t of Object.keys(MAJOR)) {
      const notes = pitch.scale(pitch.parsePitchClass(t), 'major', 4);
      for (let i = 1; i < notes.length; i++) expect(pitch.comparePitch(notes[i], notes[i - 1])).toBeGreaterThan(0);
    }
  });

  it('throws when the scale needs more than a double accidental, and for bad input', () => {
    expect(() => pitch.scale({ letter: 'G', accidental: 2 }, 'major', 4)).toThrow(TheoryError);
    expect(() => pitch.scale({ letter: 'C', accidental: 0 }, 'dorian' as ScaleType, 4)).toThrow(TheoryError);
    expect(() => pitch.scale({ letter: 'C', accidental: 0 }, 'major', 4.5)).toThrow(TheoryError);
    expect(() => pitch.scale({ letter: 'C', accidental: 0 }, 'major', 4, 'sideways' as 'ascending')).toThrow(TheoryError);
  });
});

describe('degree', () => {
  it('uses the major scale in major keys', () => {
    for (const [t, spelled] of Object.entries(MAJOR)) {
      const notes = spelled.split(' ');
      for (let d = 1; d <= 7; d++) expect(pcStr(pitch.degree(K(t, 'major'), d as Degree))).toBe(notes[d - 1]);
    }
  });
  it('uses the harmonic minor in minor keys', () => {
    for (const [t, spelled] of Object.entries(HARMONIC_MINOR)) {
      const notes = spelled.split(' ');
      for (let d = 1; d <= 7; d++) expect(pcStr(pitch.degree(K(t, 'minor'), d as Degree))).toBe(notes[d - 1]);
    }
  });
  it('spot checks', () => {
    expect(pcStr(pitch.degree(K('D', 'major'), 3))).toBe('F#');
    expect(pcStr(pitch.degree(K('F#', 'major'), 7))).toBe('E#');
    expect(pcStr(pitch.degree(K('D#', 'minor'), 7))).toBe('Cx');
    expect(pcStr(pitch.degree(K('A', 'minor'), 7))).toBe('G#');
    expect(pcStr(pitch.degree(K('Gb', 'major'), 4))).toBe('Cb');
  });
  it('rejects bad degrees', () => {
    expect(() => pitch.degree(K('C', 'major'), 0 as Degree)).toThrow(TheoryError);
    expect(() => pitch.degree(K('C', 'major'), 8 as Degree)).toThrow(TheoryError);
  });
});
