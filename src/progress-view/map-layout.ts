/** Height of one lesson's row on the course map, in px. */
export const MAP_ROW = 96;

/** How far along the row (percent of the width) each node's centre sits, repeating: a gentle wind to the right and back. */
const WIND = [10, 24, 38, 24, 10, 10] as const;

export interface NodePosition {
  /** Centre, percent of the unit's width. */
  x: number;
  /** Centre, px from the top of the unit's path. */
  y: number;
}

export function nodePositions(count: number): NodePosition[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({ x: WIND[i % WIND.length]!, y: i * MAP_ROW + MAP_ROW / 2 }));
}

/** Total height of a unit's path in px. */
export function pathHeight(count: number): number {
  return Math.max(0, count) * MAP_ROW;
}

/** An S-curve from one node to the next, leaving and arriving vertically. In the path's own units (x percent, y px). */
export function segmentPath(from: NodePosition, to: NodePosition): string {
  const mid = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${to.y}`;
}
