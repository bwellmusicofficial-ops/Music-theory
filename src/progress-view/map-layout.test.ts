import { describe, expect, it } from 'vitest';
import { MAP_ROW, nodePositions, pathHeight, segmentPath } from './map-layout';

describe('map layout', () => {
  it('places one node per lesson, a row apart, winding right and back', () => {
    const p = nodePositions(7);
    expect(p).toHaveLength(7);
    expect(p.map((n) => n.y)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => i * MAP_ROW + MAP_ROW / 2));
    expect(p[0]!.x).toBeLessThan(p[2]!.x);
    expect(p[4]!.x).toBe(p[0]!.x);
    for (const n of p) expect(n.x).toBeGreaterThan(0);
    for (const n of p) expect(n.x).toBeLessThan(50);
  });

  it('handles none and sizes the path to fit', () => {
    expect(nodePositions(0)).toEqual([]);
    expect(nodePositions(-3)).toEqual([]);
    expect(pathHeight(5)).toBe(5 * MAP_ROW);
    expect(pathHeight(0)).toBe(0);
  });

  it('draws a curve between two nodes', () => {
    expect(segmentPath({ x: 10, y: 48 }, { x: 24, y: 144 })).toBe('M 10 48 C 10 96, 24 96, 24 144');
  });
});
