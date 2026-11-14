import { describe, expect, it } from 'vitest';
import { bar, engines, note, passage, P } from '../fixtures';
import { buildConstraints, isBarEditable, isEventLocked, slotRange, withinCapacity } from './constraints';

const p = passage([bar(note('C4'), note('D4'), note('E4')), bar(), bar(note('G4'))]);

describe('buildConstraints', () => {
  it('defaults: every bar editable, full ledger range, nothing allowed without a palette', () => {
    const c = buildConstraints(engines, { passage: p });
    expect(c.kind).toBe('free');
    expect(c.editable.map((e) => e.bar)).toEqual([0, 1, 2]);
    expect(c.range).toEqual({ min: -6, max: 14 });
    expect(c.allow).toEqual({ values: [], rests: false, signs: [], maxDots: 0, ties: false });
    expect(c.maxChordSize).toBe(1);
  });
  it('maps the palette', () => {
    const c = buildConstraints(engines, {
      passage: p,
      palette: { durations: [{ value: 'minim', dots: 0 }, { value: 'crotchet', dots: 0 }], accidentals: 'double', rests: true, dots: 2, ties: true, chords: true },
    });
    expect(c.allow.values).toEqual(['minim', 'crotchet']);
    expect(c.allow.signs).toEqual([-2, -1, 0, 1, 2]);
    expect(c.allow).toMatchObject({ rests: true, maxDots: 2, ties: true });
    expect(c.maxChordSize).toBe(4);
    expect(buildConstraints(engines, { passage: p, palette: { accidentals: true } }).allow.signs).toEqual([-1, 0, 1]);
    expect(buildConstraints(engines, { passage: p, palette: { accidentals: 'single' } }).allow.signs).toEqual([-1, 0, 1]);
  });
  it('range narrows but never widens', () => {
    expect(buildConstraints(engines, { passage: p, range: { low: P('C4'), high: P('A5') } }).range).toEqual({ min: -2, max: 10 });
    expect(buildConstraints(engines, { passage: p, range: { low: P('C1'), high: P('C8') } }).range).toEqual({ min: -6, max: 14 });
    const bass = passage([bar()], { clef: 'bass' });
    expect(buildConstraints(engines, { passage: bass, range: { low: P('G2'), high: P('G3') } }).range).toEqual({ min: 0, max: 7 });
  });
  it('editable bars with locks; out-of-range bars are dropped; single-note keeps one', () => {
    const c = buildConstraints(engines, { passage: p, edit: { editable: [{ bar: 0, lockedPrefix: 1 }, { bar: 9 }, { bar: 2, lockedSuffix: 1 }] } });
    expect(c.editable).toEqual([{ bar: 0, lockedPrefix: 1, lockedSuffix: 0 }, { bar: 2, lockedPrefix: 0, lockedSuffix: 1 }]);
    const s = buildConstraints(engines, { passage: p, edit: { kind: 'single-note', editable: [{ bar: 1 }, { bar: 2 }] } });
    expect(s.kind).toBe('single-note');
    expect(s.editable.map((e) => e.bar)).toEqual([1]);
  });
});

describe('lock helpers', () => {
  const c = buildConstraints(engines, { passage: p, edit: { editable: [{ bar: 0, lockedPrefix: 1, lockedSuffix: 1 }] } });
  it('isBarEditable, isEventLocked, slotRange', () => {
    expect(isBarEditable(c, 0)).toBe(true);
    expect(isBarEditable(c, 1)).toBe(false);
    expect([0, 1, 2].map((i) => isEventLocked(c, p, 0, i))).toEqual([true, false, true]);
    expect(isEventLocked(c, p, 1, 0)).toBe(true);
    expect(slotRange(c, p, 0)).toEqual([1, 2]);
    expect(slotRange(c, p, 1)).toBeNull();
  });
  it('capacity counts events and twice the nominal length', () => {
    expect(withinCapacity(engines, p, Array.from({ length: 8 }, () => note('C4')))).toBe(true);
    expect(withinCapacity(engines, p, Array.from({ length: 9 }, () => note('C4')))).toBe(false);
    expect(withinCapacity(engines, p, Array.from({ length: 33 }, () => note('C4', 'demisemiquaver')))).toBe(false);
  });
});
