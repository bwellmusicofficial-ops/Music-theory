import { describe, expect, it } from 'vitest';
import { TheoryError } from '../api';
import type { Duration, Fraction, MetreKind, TimeSignature } from '../types';
import { rhythm } from './index';
import { T } from './test-helpers';

const d = (
  value: Duration['value'],
  dots: 0 | 1 | 2 = 0,
  tuplet?: { actual: number; normal: number },
): Duration => ({ value, dots, ...(tuplet ? { tuplet } : {}) });

describe('note and rest names', () => {
  const cases: [Duration, string, string, string, string][] = [
    // duration, UK note, US note, UK rest, US rest
    [d('breve'), 'breve', 'double whole note', 'breve rest', 'double whole rest'],
    [d('semibreve'), 'semibreve', 'whole note', 'semibreve rest', 'whole rest'],
    [d('minim'), 'minim', 'half note', 'minim rest', 'half rest'],
    [d('crotchet'), 'crotchet', 'quarter note', 'crotchet rest', 'quarter rest'],
    [d('quaver'), 'quaver', 'eighth note', 'quaver rest', 'eighth rest'],
    [d('semiquaver'), 'semiquaver', 'sixteenth note', 'semiquaver rest', 'sixteenth rest'],
    [
      d('demisemiquaver'),
      'demisemiquaver',
      'thirty-second note',
      'demisemiquaver rest',
      'thirty-second rest',
    ],
    [d('crotchet', 1), 'dotted crotchet', 'dotted quarter note', 'dotted crotchet rest', 'dotted quarter rest'],
    [d('minim', 1), 'dotted minim', 'dotted half note', 'dotted minim rest', 'dotted half rest'],
    [
      d('minim', 2),
      'double-dotted minim',
      'double-dotted half note',
      'double-dotted minim rest',
      'double-dotted half rest',
    ],
    [
      d('quaver', 0, { actual: 3, normal: 2 }),
      'triplet quaver',
      'triplet eighth note',
      'triplet quaver rest',
      'triplet eighth rest',
    ],
    [
      d('quaver', 0, { actual: 2, normal: 3 }),
      'duplet quaver',
      'duplet eighth note',
      'duplet quaver rest',
      'duplet eighth rest',
    ],
  ];
  it.each(cases)('%j', (duration, ukNote, usNote, ukRest, usRest) => {
    expect(rhythm.noteValueName(duration, 'uk')).toBe(ukNote);
    expect(rhythm.noteValueName(duration, 'us')).toBe(usNote);
    expect(rhythm.restName(duration, 'uk')).toBe(ukRest);
    expect(rhythm.restName(duration, 'us')).toBe(usRest);
  });

  it('lists the seven note values longest first', () => {
    expect(rhythm.noteValues()).toEqual([
      'breve',
      'semibreve',
      'minim',
      'crotchet',
      'quaver',
      'semiquaver',
      'demisemiquaver',
    ]);
  });
});

describe('metre', () => {
  const cases: [TimeSignature, MetreKind, number, Fraction | null, string][] = [
    [T(2, 4), 'simple', 2, { n: 1, d: 4 }, 'simple duple'],
    [T(3, 4), 'simple', 3, { n: 1, d: 4 }, 'simple triple'],
    [T(4, 4), 'simple', 4, { n: 1, d: 4 }, 'simple quadruple'],
    [T(2, 2), 'simple', 2, { n: 1, d: 2 }, 'simple duple'],
    [T(3, 2), 'simple', 3, { n: 1, d: 2 }, 'simple triple'],
    [T(4, 2), 'simple', 4, { n: 1, d: 2 }, 'simple quadruple'],
    [T(3, 8), 'simple', 3, { n: 1, d: 8 }, 'simple triple'],
    [T(6, 8), 'compound', 2, { n: 3, d: 8 }, 'compound duple'],
    [T(9, 8), 'compound', 3, { n: 3, d: 8 }, 'compound triple'],
    [T(12, 8), 'compound', 4, { n: 3, d: 8 }, 'compound quadruple'],
    [T(6, 4), 'compound', 2, { n: 3, d: 4 }, 'compound duple'],
    [T(5, 4), 'irregular', 5, null, 'irregular'],
    [T(7, 8), 'irregular', 7, null, 'irregular'],
  ];
  it.each(cases)('%j', (time, kind, beats, beat, name) => {
    expect(rhythm.metreKind(time)).toBe(kind);
    expect(rhythm.beatsPerBar(time)).toBe(beats);
    expect(rhythm.metreName(time)).toBe(name);
    if (beat) {
      expect(rhythm.beatLength(time)).toEqual(beat);
    } else {
      expect(() => rhythm.beatLength(time)).toThrow(TheoryError);
    }
  });
});
