import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { BAR, BAR_CAP, beats, nv, nvs, pitchName, where } from './reason-helpers';

const dur = (value: Parameters<typeof nv>[0]['value'], dots: 0 | 1 | 2 = 0) => ({ value, dots });
const frac = (n: number, d: number) => ({ n, d });
const common = { beats: 4, beatUnit: 4 as const };

describe('nv and nvs', () => {
  it('writes the note value as a glossary link', () => {
    expect(nv(dur('minim'))).toBe('[[minim|minim]]');
    expect(nvs(dur('crotchet'))).toBe('[[crotchet|crotchets]]');
  });
  it('puts the dots outside the link', () => {
    expect(nv(dur('minim', 1))).toBe('dotted [[minim|minim]]');
    expect(nv(dur('quaver', 2))).toBe('double-dotted [[quaver|quaver]]');
    expect(nvs(dur('minim', 1))).toBe('dotted [[minim|minims]]');
  });
});

describe('BAR and BAR_CAP', () => {
  it('are glossary links to bar', () => {
    expect(BAR).toBe('[[bar|bar]]');
    expect(BAR_CAP).toBe('[[bar|Bar]]');
  });
});

describe('pitchName', () => {
  it('uses the display glyphs', () => {
    expect(pitchName({ letter: 'F', accidental: 1 })).toBe('F♯');
    expect(pitchName({ letter: 'B', accidental: -1 })).toBe('B♭');
    expect(pitchName({ letter: 'G', accidental: 0 })).toBe('G');
  });
});

describe('where', () => {
  const table: [number, string][] = [
    [0, 'on the bottom line'],
    [1, 'in the bottom space'],
    [2, 'on the second line'],
    [3, 'in the second space'],
    [4, 'on the middle line'],
    [5, 'in the third space'],
    [6, 'on the fourth line'],
    [7, 'in the top space'],
    [8, 'on the top line'],
    [-1, 'just below the bottom line'],
    [9, 'just above the top line'],
    [-2, 'on the first ledger line below the [[stave|stave]]'],
    [10, 'on the first ledger line above the [[stave|stave]]'],
    [-3, 'just below the first ledger line below the [[stave|stave]]'],
    [11, 'just above the first ledger line above the [[stave|stave]]'],
    [-4, 'on the second ledger line below the [[stave|stave]]'],
    [12, 'on the second ledger line above the [[stave|stave]]'],
    [-5, 'far below the [[stave|stave]]'],
    [-9, 'far below the [[stave|stave]]'],
    [13, 'far above the [[stave|stave]]'],
    [20, 'far above the [[stave|stave]]'],
  ];
  it.each(table)('position %i is "%s"', (pos, text) => {
    expect(where(pos)).toBe(text);
  });
  it('rejects a position that is not a whole number', () => {
    expect(() => where(1.5)).toThrow(TheoryError);
  });
});

describe('beats', () => {
  const cases: [string, ReturnType<typeof frac>, Parameters<typeof beats>[1], string][] = [
    ['one crotchet in 4/4', frac(1, 4), common, '1 beat'],
    ['a minim in 4/4', frac(1, 2), common, '2 beats'],
    ['a semibreve in 4/4', frac(1, 1), common, '4 beats'],
    ['a dotted crotchet in 4/4', frac(3, 8), common, '1½ beats'],
    ['a quaver in 4/4', frac(1, 8), common, '½ beat'],
    ['a semiquaver in 4/4', frac(1, 16), common, '¼ beat'],
    ['three semiquavers in 4/4', frac(3, 16), common, '¾ beat'],
    ['seven semiquavers in 4/4', frac(7, 16), common, '1¾ beats'],
    ['a demisemiquaver in 4/4', frac(1, 32), common, '0.13 beat'],
    ['five demisemiquavers in 4/4', frac(5, 32), common, '0.63 beat'],
    ['a minim in 3/8 (beat = quaver)', frac(1, 2), { beats: 3, beatUnit: 8 }, '4 beats'],
    ['a minim in 2/2 (beat = minim)', frac(1, 2), { beats: 2, beatUnit: 2 }, '1 beat'],
    ['a semibreve in 2/2', frac(1, 1), { beats: 2, beatUnit: 2 }, '2 beats'],
    ['a third of a beat', frac(1, 12), common, '0.33 beat'],
    ['one and a third beats', frac(1, 3), common, '1.33 beats'],
    ['nothing', frac(0, 1), common, '0 beat'],
    ['two and a half beats in 3/4', frac(5, 8), { beats: 3, beatUnit: 4 }, '2½ beats'],
  ];
  it.each(cases)('%s', (_label, len, time, text) => {
    expect(beats(len, time)).toBe(text);
  });
});
