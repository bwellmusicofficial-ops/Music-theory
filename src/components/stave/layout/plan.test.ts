import { describe, expect, it } from 'vitest';
import { naturalWidth, notesWidth, planSystems, reservedFor, systemBox, type BarMeasure } from './plan';

const m = (notes = 110, modFirst = 40): BarMeasure => ({ notes, modFirst, modOther: 0 });
const ed = (n: number) => Array.from({ length: n }, () => true);

describe('naturalWidth and notesWidth', () => {
  it('editable adds the append zone', () => {
    expect(naturalWidth(m(), true, true)).toBe(40 + 110 + 30 + 10);
    expect(naturalWidth(m(), false, false)).toBe(110 + 10);
  });
  it('notes width takes the largest of the three rules', () => {
    expect(notesWidth(10, 1, 1.5, true)).toBe(110);
    expect(notesWidth(10, 1, 1.5, false)).toBe(60);
    expect(notesWidth(100, 1, 1.5, false)).toBe(140);
    expect(notesWidth(10, 10, 1.5, false)).toBe(160);
  });
});

describe('planSystems', () => {
  it('greedy breaking at 218, 262, 400, 700 units for editable bars', () => {
    const bars = Array.from({ length: 4 }, () => m());
    const counts = [218, 262, 400, 700].map((u) =>
      planSystems(bars, ed(4), { availablePx: u * 1.5, scale: 1.5 }).systems.map((s) => s.bars.length),
    );
    expect(counts[0]).toEqual([1, 1, 1, 1]);
    expect(counts[1]).toEqual([1, 1, 1, 1]);
    expect(counts[2]).toEqual([2, 2]);
    expect(counts[3]).toEqual([4]);
  });
  it('never more than four bars per system', () => {
    const bars = Array.from({ length: 10 }, () => m(60, 0));
    const p = planSystems(bars, ed(10).map(() => false), { availablePx: 2000, scale: 1 });
    expect(p.systems.map((s) => s.bars.length)).toEqual([3, 3, 4]);
  });
  it('justifies a system at 60% or more to full width, shortest left natural', () => {
    const bars = [m(), m(), m()];
    const p = planSystems(bars, ed(3), { availablePx: 500, scale: 1 });
    const first = p.systems[0];
    expect(first.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(500, 5);
    const short = planSystems([m(), m()], ed(2), { availablePx: 1000, scale: 1 });
    // natural 190+150 = 340 < 60% of 1000: left aligned at natural width
    expect(short.systems[0].widths).toEqual([190, 150]);
  });
  it('extra is shared in proportion to notes width', () => {
    const p = planSystems([m(100, 0), m(200, 0)], [false, false], { availablePx: 400, scale: 1 });
    const [a, b] = p.systems[0].widths;
    // naturals 110 and 210 = 320; extra 80 split 1:2
    expect(a).toBeCloseTo(110 + 80 / 3, 5);
    expect(b).toBeCloseTo(210 + 160 / 3, 5);
  });
  it('a single-bar passage stretches at most 1.5 times', () => {
    const p = planSystems([m()], ed(1), { availablePx: 300, scale: 1 });
    expect(p.systems[0].widths[0]).toBeCloseTo(190 * 1.5, 5);
    const q = planSystems([m()], ed(1), { availablePx: 250, scale: 1 });
    expect(q.systems[0].widths[0]).toBeCloseTo(250, 5);
    const r = planSystems([m()], ed(1), { availablePx: 2000, scale: 1 });
    expect(r.systems[0].widths[0]).toBe(190);
  });
  it('a single wide bar scales down, then scrolls', () => {
    const wide = m(400, 40);
    const mild = planSystems([wide], ed(1), { availablePx: 400, scale: 1.5 });
    // natural 480 units = 720 px at 1.5; 400/720 = 0.555 -> floored at 0.75
    expect(mild.scale).toBeCloseTo(1.125, 5);
    expect(mild.scrolls).toBe(true);
    const fits = planSystems([m(150, 40)], ed(1), { availablePx: 300, scale: 1.5 });
    // natural 230 units = 345px; ratio 0.869 -> scale 1.304, available 230 units
    expect(fits.scale).toBeCloseTo(1.5 * (300 / 345), 5);
    expect(fits.scrolls).toBe(false);
  });
  it('several systems are all the same full width, even a short last one', () => {
    // natural 100 each (modFirst 0, notes 90, extra 10); 210 units hold two, and one line would need 0.7 scale.
    const bars = Array.from({ length: 3 }, () => m(90, 0));
    const p = planSystems(bars, [false, false, false], { availablePx: 210, scale: 1 });
    expect(p.systems.length).toBe(2);
    for (const s of p.systems) expect(s.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(210, 5);
  });
  it('breaks evenly: no orphan bar when the bars can be shared out', () => {
    // 5 bars of 100 in 450 units: greedy would give [4, 1]; balanced gives [3, 2] (or [2, 3]).
    const p = planSystems(Array.from({ length: 5 }, () => m(90, 0)), Array(5).fill(false), { availablePx: 450, scale: 1 });
    const sizes = p.systems.map((s) => s.bars.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
    for (const s of p.systems) expect(s.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(450, 5);
  });
  it('first bar of each system carries the clef width, later bars do not', () => {
    const bars = [m(60, 40), m(60, 30), m(60, 30), m(60, 30)].map((x) => ({ ...x, modOther: 5 }));
    const p = planSystems(bars, [false, false, false, false], { availablePx: 200, scale: 1 });
    expect(p.systems.map((s) => s.bars)).toEqual([[0, 1], [2, 3]]);
  });
  it('read mode scales down to keep two bars on one line, within 0.75', () => {
    const bars = [{ notes: 88, modFirst: 66, modOther: 5 }, { notes: 60, modFirst: 32, modOther: 5 }];
    // natural 164 + 75 = 239 units; 1.25 * 239 = 299 px does not fit 290 px.
    const p = planSystems(bars, [false, false], { availablePx: 290, scale: 1.25 });
    expect(p.systems.length).toBe(1);
    expect(p.scale).toBeCloseTo(290 / 239, 5);
    expect(p.scale).toBeGreaterThanOrEqual(0.75 * 1.25);
    expect(p.systems[0].widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(p.availableUnits);
    // Too narrow even at 0.75: two lines, same scale as asked.
    const narrow = planSystems(bars, [false, false], { availablePx: 215, scale: 1.25 });
    expect(narrow.systems.length).toBe(2);
    expect(narrow.scale).toBe(1.25);
  });
  it('edit mode never scales down just to save a line', () => {
    const bars = [m(60, 40), m(60, 40)];
    const p = planSystems(bars, [true, true], { availablePx: 340, scale: 1.5 });
    expect(p.scale).toBe(1.5);
    expect(p.systems.length).toBe(2);
  });
  it('an empty passage gives no systems', () => {
    expect(planSystems([], [], { availablePx: 300, scale: 1 }).systems).toEqual([]);
  });
});

describe('system box', () => {
  it('edit default range is 148 units', () => {
    const r = reservedFor(true, { min: -6, max: 14 });
    expect(r).toEqual({ min: -8, max: 16 });
    const b = systemBox(r.min, r.max);
    expect(b.height).toBe(148);
    expect(b.bottomLineY - b.topLineY).toBe(40);
  });
  it('range C4 to A5 in treble is 108 units', () => {
    const r = reservedFor(true, { min: -2, max: 10 });
    expect(systemBox(r.min, r.max).height).toBe(108 - 0);
  });
  it('read mode grows to contain notes', () => {
    expect(reservedFor(false, { min: -6, max: 14 })).toEqual({ min: -2, max: 10 });
    expect(reservedFor(false, { min: -6, max: 14 }, { lowest: -5, highest: 13 })).toEqual({ min: -6, max: 14 });
  });
});
