import { describe, expect, it } from 'vitest';
import { beats, nv, nvs, onsetsOf } from './reason';
import { bar, dur, note, rest } from './test-helpers';

const f = (n: number, d: number) => ({ n, d });
const T44 = { beats: 4, beatUnit: 4 as const };
const T68 = { beats: 6, beatUnit: 8 as const };

describe('nv and nvs', () => {
  it('writes the glossary link with dots in front', () => {
    expect(nv(dur('minim'))).toBe('[[minim|minim]]');
    expect(nv(dur('minim', 1))).toBe('dotted [[minim|minim]]');
    expect(nv(dur('crotchet', 2))).toBe('double-dotted [[crotchet|crotchet]]');
    expect(nvs(dur('crotchet'))).toBe('[[crotchet|crotchets]]');
    expect(nvs(dur('quaver', 1))).toBe('dotted [[quaver|quavers]]');
  });
});

describe('beats', () => {
  it.each([
    [f(1, 4), T44, '1 beat'],
    [f(1, 2), T44, '2 beats'],
    [f(3, 8), T44, '1½ beats'],
    [f(1, 8), T44, '½ beat'],
    [f(1, 16), T44, '¼ beat'],
    [f(3, 16), T44, '¾ beat'],
    [f(5, 16), T44, '1¼ beats'],
    [f(7, 16), T44, '1¾ beats'],
    [f(1, 1), T44, '4 beats'],
    [f(3, 4), T44, '3 beats'],
    [f(1, 2), { beats: 2, beatUnit: 2 as const }, '1 beat'],
    [f(1, 1), { beats: 2, beatUnit: 2 as const }, '2 beats'],
    [f(1, 8), T68, '1 beat'],
    [f(1, 4), T68, '2 beats'],
    [f(1, 12), T44, '0.33 beat'],
    [f(1, 6), T44, '0.67 beat'],
    [f(5, 12), T44, '1.67 beats'],
  ])('%j in %j is "%s"', (len, time, expected) => {
    expect(beats(len, time)).toBe(expected);
  });
});

describe('onsetsOf', () => {
  it('lists the sounded notes with lengths and gaps', () => {
    const onsets = onsetsOf([bar(note('crotchet'), rest('crotchet'), note('minim'))]);
    expect(onsets).toHaveLength(2);
    expect(onsets[0]).toMatchObject({ length: f(1, 4), notes: 1, gapBefore: f(0, 1) });
    expect(onsets[1]).toMatchObject({ length: f(1, 2), notes: 1, gapBefore: f(1, 4) });
  });

  it('records a rest before the first note', () => {
    const onsets = onsetsOf([bar(rest('minim'), note('minim'))]);
    expect(onsets).toHaveLength(1);
    expect(onsets[0]?.gapBefore).toEqual(f(1, 2));
  });

  it('folds tied notes, across bars, into one onset', () => {
    const onsets = onsetsOf([
      bar(note('minim'), note('minim', 0, true)),
      bar(note('minim'), note('crotchet'), note('crotchet')),
    ]);
    expect(onsets).toHaveLength(4);
    expect(onsets[1]).toMatchObject({ length: f(1, 1), notes: 2 });
  });

  it('sums consecutive rests', () => {
    const onsets = onsetsOf([bar(note('minim'), rest('crotchet'), rest('crotchet'))]);
    expect(onsets).toHaveLength(1);
    const next = onsetsOf([bar(note('minim'), rest('crotchet'), rest('crotchet')), bar(note('semibreve'))]);
    expect(next[1]?.gapBefore).toEqual(f(1, 2));
  });
});
