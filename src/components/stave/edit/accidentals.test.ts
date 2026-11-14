import { describe, expect, it } from 'vitest';
import type { Bar, Passage } from '@/engine/types';
import { bar, engines, note, passage, pstr, rest } from '../fixtures';
import { cycleFlat, cycleSharp, fromWritten, readHead, signKeyMap, signsForBar, toggleNatural, toWritten } from './accidentals';

const dMajor = passage([], { key: 'D' }).key;
const cMajor = passage([]).key;
const sig = (b: Bar, key = cMajor, tieIn?: Parameters<typeof signsForBar>[3]) => signsForBar(engines, b, key, tieIn);

describe('display rule', () => {
  it('key signature note shows nothing', () => {
    expect(sig(bar(note('F#4')), dMajor)).toEqual([[null]]);
  });
  it('chromatic note shows a sign', () => {
    expect(sig(bar(note('F#4')))).toEqual([[1]]);
    expect(sig(bar(note('Bb4')))).toEqual([[-1]]);
  });
  it('repeat in the same bar shows nothing', () => {
    expect(sig(bar(note('F#4'), note('F#4')))).toEqual([[1], [null]]);
  });
  it('same letter in another octave shows it again', () => {
    expect(sig(bar(note('F#4'), note('F#5')))).toEqual([[1], [1]]);
  });
  it('natural after a sharp', () => {
    expect(sig(bar(note('F#4'), note('F4')))).toEqual([[1], [0]]);
  });
  it('natural in a sharp key', () => {
    expect(sig(bar(note('F4')), dMajor)).toEqual([[0]]);
  });
  it('showAccidental true draws a redundant sign, false hides', () => {
    expect(sig(bar(note('F#4', 'crotchet', { showAccidental: true })), dMajor)).toEqual([[1]]);
    expect(sig(bar(note('F#4', 'crotchet', { showAccidental: true }), note('F#4')), dMajor)).toEqual([[1], [null]]);
    expect(sig(bar(note('F#4', 'crotchet', { showAccidental: false })))).toEqual([[null]]);
  });
  it('per-pitch flags in a chord', () => {
    const ev = note(['D4', 'F#4', 'A4'], 'minim', { showAccidental: [false, true, false] });
    expect(sig(bar(ev), dMajor)).toEqual([[null, 1, null]]);
  });
  it('tie continuation in the bar shows no sign', () => {
    expect(sig(bar(note('F#4', 'crotchet', { tieToNext: true }), note('F#4')))).toEqual([[1], [null]]);
  });
  it('tie across the barline shows no sign and does not update in force', () => {
    const tieIn = note('F#4', 'crotchet', { tieToNext: true });
    expect(sig(bar(note('F#4'), note('F#4')), cMajor, tieIn)).toEqual([[null], [1]]);
  });
  it('a note after a cross-bar tie needs its sign again', () => {
    const tieIn = note('F#4', 'crotchet', { tieToNext: true });
    expect(sig(bar(note('F#4', 'crotchet'), note('G4'), note('F#4')), cMajor, tieIn)).toEqual([[null], [null], [1]]);
  });
  it('rests give empty arrays', () => {
    expect(sig(bar(rest(), note('C4')))).toEqual([[], [null]]);
  });
});

describe('reading rule', () => {
  const read = (pos: number, sign: 1 | 0 | -1 | 2 | -2 | null, key = cMajor, inForce = new Map(), clef: 'treble' | 'bass' = 'treble') =>
    engines.pitch.formatPitch(readHead(engines, pos, sign, clef, signKeyMap(engines, key), inForce));

  it('plain head in each key', () => {
    expect(read(8, null, cMajor)).toBe('F5');
    expect(read(8, null, passage([], { key: 'G' }).key)).toBe('F#5');
    expect(read(8, null, dMajor)).toBe('F#5');
    expect(read(8, null, passage([], { key: 'F' }).key)).toBe('F5');
    expect(read(4, null, passage([], { key: 'Bb' }).key)).toBe('Bb4');
  });
  it('after an earlier sign', () => {
    const inForce = new Map();
    expect(read(8, 1, cMajor, inForce)).toBe('F#5');
    expect(read(8, null, cMajor, inForce)).toBe('F#5');
  });
  it('different octave unaffected', () => {
    const inForce = new Map();
    read(8, 1, cMajor, inForce);
    expect(read(1, null, cMajor, inForce)).toBe('F4');
  });
  it('explicit natural in a sharp key', () => {
    expect(read(8, 0, dMajor)).toBe('F5');
  });
  it('doubles', () => {
    expect(read(8, 2)).toBe('Fx5');
    expect(read(8, -2)).toBe('Fbb5');
  });
});

describe('round trip', () => {
  const fixtures: Passage[] = [
    passage([bar(note('F#4'), note('F4'), note('F#4'), rest())]),
    passage([bar(note('F#4'), note('G4'), note('A4', 'minim'))], { key: 'D' }),
    passage([bar(note('Bb3', 'crotchet', { tieToNext: true }), note('Bb3'), note(['D4', 'F4', 'Ab4'], 'minim'))], { key: 'F' }),
    passage([bar(note('F4'), note('F4'))], { key: 'G' }),
    passage([bar(note('C#4', 'crotchet', { tieToNext: true })), bar(note('C#4'), note('C4'))]),
  ];
  it('preserves pitches', () => {
    for (const p of fixtures) {
      p.bars.forEach((b, i) => {
        const tieIn = i > 0 ? (p.bars[i - 1].events.at(-1) as never) : undefined;
        const back = fromWritten(engines, toWritten(engines, b, p.key, p.clef, tieIn), p.key, p.clef, tieIn);
        expect(back.events.map(pstr)).toEqual(b.events.map(pstr));
      });
    }
  });
  it('preserves signs for single notes and per head for chords', () => {
    const p = fixtures[0];
    const back = fromWritten(engines, toWritten(engines, p.bars[0], p.key, p.clef), p.key, p.clef);
    expect(signsForBar(engines, back, p.key)).toEqual(signsForBar(engines, p.bars[0], p.key));
    const c = fixtures[2];
    const back2 = fromWritten(engines, toWritten(engines, c.bars[0], c.key, c.clef), c.key, c.clef);
    expect(signsForBar(engines, back2, c.key)).toEqual(signsForBar(engines, c.bars[0], c.key));
    expect(back2.events[2]).toMatchObject({ showAccidental: [false, false, true] });
  });
});

describe('sign cycling', () => {
  it('sharp', () => {
    expect(cycleSharp(null, true)).toBe(1);
    expect(cycleSharp(1, true)).toBe(2);
    expect(cycleSharp(1, false)).toBeNull();
    expect(cycleSharp(2, true)).toBeNull();
    expect(cycleSharp(-1, true)).toBe(1);
  });
  it('flat and natural', () => {
    expect(cycleFlat(null, true)).toBe(-1);
    expect(cycleFlat(-1, true)).toBe(-2);
    expect(cycleFlat(-2, true)).toBeNull();
    expect(cycleFlat(1, true)).toBe(-1);
    expect(toggleNatural(null)).toBe(0);
    expect(toggleNatural(0)).toBeNull();
  });
});
