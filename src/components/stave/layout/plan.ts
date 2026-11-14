/** Pure system breaking and vertical boxes (docs/stave-interaction.md 1.6 and 1.7). */
import {
  APPEND_ZONE,
  BAR_EXTRA,
  EDITABLE_MIN_NOTES_WIDTH,
  JUSTIFY_THRESHOLD,
  MAX_BARS_PER_SYSTEM,
  MIN_EVENT_PX,
  MIN_SCALE_FACTOR,
  MIN_WIDTH_FACTOR,
  PAD,
  POSITION_UNITS,
  READ_MIN_NOTES_WIDTH,
  SINGLE_BAR_MAX_STRETCH,
} from '../constants';

export interface BarMeasure {
  /** Notes area width wanted (already includes the editable minimum etc.). */
  notes: number;
  /** Clef, key and (bar 0) time signature width, when this bar starts a system. */
  modFirst: number;
  /** Width of modifiers when the bar is not first in its system (barline gap). */
  modOther: number;
}

export function notesWidth(minTotalWidth: number, events: number, scale: number, editable: boolean): number {
  return Math.max(
    MIN_WIDTH_FACTOR * minTotalWidth,
    events * (MIN_EVENT_PX / scale),
    editable ? EDITABLE_MIN_NOTES_WIDTH : READ_MIN_NOTES_WIDTH,
  );
}

export function naturalWidth(m: BarMeasure, first: boolean, editable: boolean): number {
  return (first ? m.modFirst : m.modOther) + m.notes + (editable ? APPEND_ZONE : 0) + BAR_EXTRA;
}

export interface PlannedSystem {
  bars: number[];
  /** Final width of each bar, in units. */
  widths: number[];
}
export interface Plan {
  scale: number;
  availableUnits: number;
  systems: PlannedSystem[];
  /** True when a bar still does not fit at the minimum scale. */
  scrolls: boolean;
}

function breakBars(
  measures: BarMeasure[],
  available: number,
  editable: boolean[],
  maxPerSystem: number,
): { bars: number[]; naturals: number[] }[] {
  const systems: { bars: number[]; naturals: number[] }[] = [];
  let cur: { bars: number[]; naturals: number[] } = { bars: [], naturals: [] };
  let sum = 0;
  measures.forEach((m, i) => {
    const first = cur.bars.length === 0;
    const w = naturalWidth(m, first, editable[i]);
    if (!first && (sum + w > available || cur.bars.length >= maxPerSystem)) {
      systems.push(cur);
      cur = { bars: [], naturals: [] };
      sum = 0;
      const w2 = naturalWidth(m, true, editable[i]);
      cur.bars.push(i);
      cur.naturals.push(w2);
      sum = w2;
      return;
    }
    cur.bars.push(i);
    cur.naturals.push(w);
    sum += w;
  });
  if (cur.bars.length) systems.push(cur);
  return systems;
}

/**
 * Greedy breaking, justification and the scale-down rule for a single bar
 * that is wider than the line.
 */
export function planSystems(
  measures: BarMeasure[],
  editable: boolean[],
  opts: { availablePx: number; scale: number },
): Plan {
  let scale = opts.scale;
  let available = Math.floor(opts.availablePx / scale);
  let scrolls = false;
  const widest = () =>
    Math.max(0, ...measures.map((m, i) => naturalWidth(m, true, editable[i])));
  if (measures.length && widest() > available) {
    const naturalPx = widest() * scale;
    scale = scale * Math.max(MIN_SCALE_FACTOR, Math.min(1, opts.availablePx / naturalPx));
    available = Math.floor(opts.availablePx / scale);
    if (widest() > available) scrolls = true;
  }
  const raw = breakBars(measures, available, editable, MAX_BARS_PER_SYSTEM);
  const systems: PlannedSystem[] = raw.map((s) => {
    const total = s.naturals.reduce((a, b) => a + b, 0);
    let widths = s.naturals.slice();
    if (total >= JUSTIFY_THRESHOLD * available && total < available) {
      let target = available;
      if (measures.length === 1) target = Math.min(target, total * SINGLE_BAR_MAX_STRETCH);
      const extra = target - total;
      const notesSum = s.bars.reduce((a, b) => a + measures[b].notes, 0) || 1;
      widths = s.naturals.map((w, k) => w + (extra * measures[s.bars[k]].notes) / notesSum);
    }
    return { bars: s.bars, widths };
  });
  return { scale, availableUnits: available, systems, scrolls };
}

export interface SystemBox {
  topLineY: number;
  bottomLineY: number;
  height: number;
  reservedMin: number;
  reservedMax: number;
}

/** Vertical box of a system from the reserved positions (1.6). */
export function systemBox(reservedMin: number, reservedMax: number): SystemBox {
  const topLineY = PAD + (reservedMax - 8) * POSITION_UNITS;
  const bottomLineY = topLineY + 8 * POSITION_UNITS;
  const height = bottomLineY + (0 - reservedMin) * POSITION_UNITS + PAD;
  return { topLineY, bottomLineY, height, reservedMin, reservedMax };
}

export function reservedFor(
  edit: boolean,
  range: { min: number; max: number },
  heads?: { lowest: number; highest: number } | null,
): { min: number; max: number } {
  if (edit) {
    let min = range.min - 2;
    let max = range.max + 2;
    if (heads) {
      min = Math.min(min, heads.lowest - 1);
      max = Math.max(max, heads.highest + 1);
    }
    return { min, max };
  }
  return {
    min: Math.min(-2, heads ? heads.lowest - 1 : -2),
    max: Math.max(10, heads ? heads.highest + 1 : 10),
  };
}
