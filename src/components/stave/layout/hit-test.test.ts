import { describe, expect, it } from 'vitest';
import type { BarLayout, EventLayout, LayoutModel } from '../types';
import { clientToUnits, finishBarColumns, locate, positionAtY, snapPosition, yAtPosition } from './hit-test';

const HEAD_W = 11;

function ev(bar: number, event: number, centreX: number, positions: number[], bottomLineY: number, accWidth = 0): EventLayout {
  return {
    bar,
    event,
    isRest: positions.length === 0,
    centreX,
    box: { x: centreX - HEAD_W / 2 - accWidth, y: 0, w: HEAD_W + accWidth, h: 40 },
    heads: positions.map((p, i) => ({ pitchIndex: i, position: p, x: centreX, y: bottomLineY - p * 5 })),
    colLeft: 0,
    colRight: 0,
  };
}

function model(opts: { scale?: number; barsPerSystem?: number[]; events?: number[][][]; xs?: number[][] } = {}): LayoutModel {
  const scale = opts.scale ?? 1.5;
  const bottomLineY = 94;
  const systems = [{ index: 0, top: 0, height: 148, bottomLineY, bars: [0] }];
  const xs = opts.xs ?? [[60, 100, 140]];
  const posList = opts.events ?? [[[0], [4], [6, 8]]];
  const bars: BarLayout[] = xs.map((cx, b) => {
    const x = b === 0 ? 0 : 200;
    const events = cx.map((c, i) => ev(b, i, c, posList[b][i], bottomLineY, i === 2 ? 8 : 0));
    return finishBarColumns({ bar: b, system: 0, x, width: 200, noteStartX: x + 40, noteEndX: x + 190, events }, HEAD_W, scale, b === 0 ? x + 40 : x);
  });
  return { width: 400, height: 148, scale, clef: 'treble', systems, bars, headWidth: HEAD_W };
}

describe('clientToUnits', () => {
  const m = { width: 400, height: 148 };
  it('identity scale', () => {
    expect(clientToUnits(30, 40, { left: 0, top: 0, width: 400, height: 148 }, m)).toEqual({ x: 30, y: 40 });
  });
  it('1.5 scale', () => {
    expect(clientToUnits(150, 75, { left: 0, top: 0, width: 600, height: 222 }, m)).toEqual({ x: 100, y: 50 });
  });
  it('offset rect', () => {
    expect(clientToUnits(130, 90, { left: 100, top: 50, width: 400, height: 148 }, m)).toEqual({ x: 30, y: 40 });
  });
  it('scaled-down rect', () => {
    expect(clientToUnits(100, 37, { left: 0, top: 0, width: 200, height: 74 }, m)).toEqual({ x: 200, y: 74 });
  });
});

describe('positionAtY and snapPosition', () => {
  const sys = { bottomLineY: 94 };
  const range = { min: -6, max: 14 };
  it('exact line and space', () => {
    expect(positionAtY(94, sys)).toBe(0);
    expect(positionAtY(54, sys)).toBe(8);
    expect(positionAtY(89, sys)).toBe(1);
    expect(yAtPosition(2, sys)).toBe(84);
  });
  it.each([
    [0.49, 0],
    [0.51, 1],
    [2.0, 2],
    [-0.4, 0],
  ])('first contact rounds %d to %d', (raw, want) => {
    expect(snapPosition(raw, null, range)).toBe(want);
  });
  it('hysteresis holds at 0.6 and releases at 0.7', () => {
    expect(snapPosition(1.6, 1, range)).toBe(1);
    expect(snapPosition(1.7, 1, range)).toBe(2);
    expect(snapPosition(0.4, 1, range)).toBe(1);
    expect(snapPosition(0.3, 1, range)).toBe(0);
  });
  it('clamps at both ends', () => {
    expect(snapPosition(40, null, range)).toBe(14);
    expect(snapPosition(-40, null, range)).toBe(-6);
    expect(snapPosition(40, 13, range)).toBe(14);
  });
});

describe('locate', () => {
  const m = model();
  const at = (x: number, pos: number) => locate({ x, y: 94 - pos * 5 }, m);

  it('inside a core is an event with the nearest head', () => {
    expect(at(100, 4)).toMatchObject({ kind: 'event', bar: 0, event: 1, pitchIndex: 0, position: 4 });
  });
  it('a wide gap is a slot', () => {
    expect(at(80, 4)).toMatchObject({ kind: 'slot', bar: 0, slot: 1 });
    expect(at(120, 4)).toMatchObject({ kind: 'slot', bar: 0, slot: 2 });
  });
  it('left of the first event inside the notes area is slot 0', () => {
    expect(at(45, 3)).toMatchObject({ kind: 'slot', slot: 0 });
  });
  it('the append zone is slot n', () => {
    expect(at(185, 3)).toMatchObject({ kind: 'slot', slot: 3 });
  });
  it('over the clef is none', () => {
    expect(at(10, 3)).toEqual({ kind: 'none' });
  });
  it('head selection within 1.5 positions, null outside', () => {
    expect(at(100, 5)).toMatchObject({ kind: 'event', pitchIndex: 0 });
    expect(at(100, 6)).toMatchObject({ kind: 'event', pitchIndex: null });
    expect(at(100, 2)).toMatchObject({ kind: 'event', pitchIndex: null });
  });
  it('chord: both heads selectable by y', () => {
    expect(locate({ x: 140, y: 94 - 8 * 5 }, m)).toMatchObject({ kind: 'event', event: 2, pitchIndex: 1 });
    expect(locate({ x: 140, y: 94 - 6 * 5 }, m)).toMatchObject({ kind: 'event', event: 2, pitchIndex: 0 });
  });
  it('the accidental widens the core to the left', () => {
    expect(at(140 - 11, 7)).toMatchObject({ kind: 'event', event: 2 });
  });
  it('far above and below are none; near is the nearest system', () => {
    expect(locate({ x: 100, y: -30 }, m)).toEqual({ kind: 'none' });
    expect(locate({ x: 100, y: 190 }, m)).toEqual({ kind: 'none' });
    expect(locate({ x: 100, y: -10 }, m)).toMatchObject({ kind: 'event' });
  });
  it('past the last bar is none', () => {
    expect(locate({ x: 450, y: 90 }, m)).toEqual({ kind: 'none' });
  });
  it('an empty bar has one slot', () => {
    const e = model({ xs: [[]], events: [[]] });
    expect(locate({ x: 100, y: 60 }, e)).toMatchObject({ kind: 'slot', slot: 0 });
    expect(e.bars[0].slotX).toEqual([55]);
  });
  it('a narrow gap splits at the midpoint between events', () => {
    const m2 = model({ xs: [[60, 80, 140]], events: [[[0], [4], [2]]] });
    // cores are 12/1.5=8 -> max(8.5, 8) = 8.5 half width; gap between 60 and 80 is 3 units: narrow
    const a = locate({ x: 69, y: 94 }, m2);
    const b = locate({ x: 71, y: 94 }, m2);
    expect(a).toMatchObject({ kind: 'event', event: 0 });
    expect(b).toMatchObject({ kind: 'event', event: 1 });
    expect(m2.bars[0].slotX).toHaveLength(4);
  });
  it('between systems picks the nearer', () => {
    const two = model({ xs: [[60], [60]], events: [[[0]], [[0]]] });
    two.systems = [
      { index: 0, top: 0, height: 100, bottomLineY: 60, bars: [0] },
      { index: 1, top: 106, height: 100, bottomLineY: 166, bars: [1] },
    ];
    two.bars[1].system = 1;
    two.bars[1].x = 0;
    two.bars[1].noteStartX = 20;
    two.bars[1].events.forEach((e) => { e.colLeft = 50; e.colRight = 70; });
    expect(locate({ x: 100, y: 102 }, two)).toMatchObject({ bar: 0 });
    expect(locate({ x: 100, y: 105 }, two)).toMatchObject({ bar: 1 });
  });
});

describe('column tiling', () => {
  function rng(seed: number) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  }
  it('columns and slots cover the bar with no gap or overlap for random layouts', () => {
    const r = rng(7);
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(r() * 7);
      const scale = [1, 1.25, 1.5][Math.floor(r() * 3)];
      let x = 50;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        x += 6 + r() * 40;
        xs.push(x);
      }
      const width = x + 40 + r() * 40;
      const events = xs.map((c, i) => ev(0, i, c, [Math.floor(r() * 9)], 94, r() < 0.3 ? 8 : 0));
      const bar = finishBarColumns({ bar: 0, system: 0, x: 0, width, noteStartX: 40, noteEndX: width - 10, events }, HEAD_W, scale, 40);
      const evs = bar.events;
      // columns are ordered, non-overlapping
      for (let i = 0; i < evs.length; i++) {
        expect(evs[i].colRight).toBeGreaterThan(evs[i].colLeft);
        if (i > 0) expect(evs[i].colLeft).toBeGreaterThanOrEqual(evs[i - 1].colRight - 1e-9);
      }
      // every x in the bar resolves to exactly one of: an event column or a slot region
      const m: LayoutModel = { width, height: 148, scale, clef: 'treble', systems: [{ index: 0, top: 0, height: 148, bottomLineY: 94, bars: [0] }], bars: [bar], headWidth: HEAD_W };
      for (let px = 41; px < width - 1; px += 1.7) {
        const hit = locate({ x: px, y: 94 }, m);
        expect(hit.kind).not.toBe('none');
        if (hit.kind === 'slot') expect(hit.slot).toBeGreaterThanOrEqual(0);
        if (hit.kind === 'slot') expect(hit.slot).toBeLessThanOrEqual(n);
      }
      expect(bar.slotX).toHaveLength(n + 1);
    }
  });
});
