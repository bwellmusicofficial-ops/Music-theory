/** Pure hit-testing against a LayoutModel (docs/stave-interaction.md section 2). */
import {
  CORE_MIN_PX,
  CORE_PAD,
  EMPTY_SLOT_OFFSET,
  FIRST_SLOT_OFFSET,
  HEAD_HIT_DISTANCE,
  LAST_SLOT_END_INSET,
  LAST_SLOT_OFFSET,
  MIN_SLOT,
  OUTSIDE_SYSTEM_LIMIT,
  POSITION_UNITS,
  SNAP_HYSTERESIS,
} from '../constants';
import type { BarLayout, EventLayout, LayoutModel, SystemLayout } from '../types';

export type Target =
  | { kind: 'event'; bar: number; event: number; pitchIndex: number | null; position: number }
  | { kind: 'slot'; bar: number; slot: number; position: number }
  | { kind: 'none' };

export function clientToUnits(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number; width: number; height: number },
  model: Pick<LayoutModel, 'width' | 'height'>,
): { x: number; y: number } {
  return {
    x: ((clientX - canvasRect.left) * model.width) / canvasRect.width,
    y: ((clientY - canvasRect.top) * model.height) / canvasRect.height,
  };
}

/** Unsnapped, possibly fractional. */
export function positionAtY(y: number, system: Pick<SystemLayout, 'bottomLineY'>): number {
  return (system.bottomLineY - y) / POSITION_UNITS;
}

export function snapPosition(
  raw: number,
  previous: number | null,
  range: { min: number; max: number },
): number {
  const clamp = (v: number) => Math.min(range.max, Math.max(range.min, v));
  if (previous !== null && Math.abs(raw - previous) <= SNAP_HYSTERESIS) return clamp(previous);
  return clamp(Math.round(raw) + 0);
}

/** y of a stave position inside a system. */
export function yAtPosition(position: number, system: Pick<SystemLayout, 'bottomLineY'>): number {
  return system.bottomLineY - position * POSITION_UNITS;
}

export function coreHalfWidth(headWidth: number, scale: number): number {
  return Math.max(headWidth / 2 + CORE_PAD, CORE_MIN_PX / scale);
}

/**
 * Compute column edges and slot x for a bar, in place. Columns and slots tile
 * [regionStart, bar right edge] with no holes: event columns first, then slot
 * regions in the gaps wider than MIN_SLOT.
 */
export function finishBarColumns(
  bar: Omit<BarLayout, 'slotX'> & { slotX?: number[] },
  headWidth: number,
  scale: number,
  regionStart: number,
): BarLayout {
  const core = coreHalfWidth(headWidth, scale);
  const right = bar.x + bar.width;
  const evs = bar.events;
  const n = evs.length;
  const slotX: number[] = [];
  if (n === 0) {
    slotX.push(bar.noteStartX + EMPTY_SLOT_OFFSET);
    return { ...bar, slotX };
  }
  const left = evs.map((e) => Math.min(e.centreX - core, e.box.x));
  const rgt = evs.map((e) => e.centreX + core);
  const colL: number[] = new Array(n);
  const colR: number[] = new Array(n);
  // gap 0
  const gap0 = left[0] - regionStart;
  colL[0] = gap0 >= MIN_SLOT ? left[0] : regionStart;
  slotX[0] = gap0 >= MIN_SLOT ? regionStart + gap0 / 2 : bar.noteStartX + FIRST_SLOT_OFFSET;
  for (let i = 0; i < n - 1; i++) {
    const gap = left[i + 1] - rgt[i];
    if (gap >= MIN_SLOT) {
      colR[i] = rgt[i];
      colL[i + 1] = left[i + 1];
      slotX[i + 1] = rgt[i] + gap / 2;
    } else {
      const mid = Math.min(evs[i + 1].centreX, Math.max(evs[i].centreX, (rgt[i] + left[i + 1]) / 2));
      colR[i] = mid;
      colL[i + 1] = mid;
      slotX[i + 1] = mid;
    }
  }
  const gapN = right - rgt[n - 1];
  colR[n - 1] = gapN >= MIN_SLOT ? rgt[n - 1] : right;
  slotX[n] = Math.min(colR[n - 1] + LAST_SLOT_OFFSET, bar.noteEndX - LAST_SLOT_END_INSET);
  const events: EventLayout[] = evs.map((e, i) => ({ ...e, colLeft: colL[i], colRight: colR[i] }));
  return { ...bar, events, slotX };
}

function pickSystem(y: number, model: LayoutModel): SystemLayout | null {
  const { systems } = model;
  if (!systems.length) return null;
  const first = systems[0];
  const last = systems[systems.length - 1];
  if (y < first.top - OUTSIDE_SYSTEM_LIMIT) return null;
  if (y > last.top + last.height + OUTSIDE_SYSTEM_LIMIT) return null;
  let best = systems[0];
  let bestD = Infinity;
  for (const s of systems) {
    const d = y < s.top ? s.top - y : y >= s.top + s.height ? y - (s.top + s.height) : 0;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function locate(point: { x: number; y: number }, model: LayoutModel): Target {
  const system = pickSystem(point.y, model);
  if (!system) return { kind: 'none' };
  const bar = model.bars.find((b) => b.system === system.index && point.x >= b.x && point.x < b.x + b.width);
  if (!bar) return { kind: 'none' };
  const firstInSystem = system.bars[0] === bar.bar;
  if (firstInSystem && point.x < bar.noteStartX) return { kind: 'none' };
  const position = Math.round(positionAtY(point.y, system));

  if (bar.events.length === 0) return { kind: 'slot', bar: bar.bar, slot: 0, position };

  for (const ev of bar.events) {
    if (point.x >= ev.colLeft && point.x < ev.colRight) {
      return {
        kind: 'event',
        bar: bar.bar,
        event: ev.event,
        pitchIndex: nearestHead(ev, point.y),
        position,
      };
    }
  }
  // In a slot region: the slot index is the number of events whose column ends before x.
  let slot = 0;
  for (const ev of bar.events) if (ev.colRight <= point.x) slot++;
  return { kind: 'slot', bar: bar.bar, slot, position };
}

export function nearestHead(ev: EventLayout, y: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const h of ev.heads) {
    const d = Math.abs(h.y - y);
    if (d < bestD) {
      bestD = d;
      best = h.pitchIndex;
    }
  }
  return best !== null && bestD <= HEAD_HIT_DISTANCE ? best : null;
}

export function systemOfBar(model: LayoutModel, bar: number): SystemLayout | undefined {
  const b = model.bars.find((x) => x.bar === bar);
  return b ? model.systems[b.system] : undefined;
}
