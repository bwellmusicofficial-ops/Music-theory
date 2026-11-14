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

function systemNatural(measures: BarMeasure[], editable: boolean[], from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += naturalWidth(measures[i], i === from, editable[i]);
  return sum;
}

function toSystem(measures: BarMeasure[], editable: boolean[], from: number, to: number) {
  const bars: number[] = [];
  const naturals: number[] = [];
  for (let i = from; i < to; i++) {
    bars.push(i);
    naturals.push(naturalWidth(measures[i], i === from, editable[i]));
  }
  return { bars, naturals };
}

/** Greedy count of systems: the fewest lines the passage needs. */
function countSystems(measures: BarMeasure[], available: number, editable: boolean[], maxPerSystem: number): number {
  let count = 0;
  let start = 0;
  while (start < measures.length) {
    let end = start + 1;
    while (end < measures.length && end - start < maxPerSystem && systemNatural(measures, editable, start, end + 1) <= available) end++;
    count++;
    start = end;
  }
  return count;
}

/**
 * Breaks into the fewest systems greedy breaking needs, then moves the breaks so
 * the systems are as even as possible (no short orphan system): minimises the
 * widest system, then prefers the earliest break when widths tie.
 */
function breakBars(
  measures: BarMeasure[],
  available: number,
  editable: boolean[],
  maxPerSystem: number,
): { bars: number[]; naturals: number[] }[] {
  const n = measures.length;
  const k = countSystems(measures, available, editable, maxPerSystem);
  if (k <= 1) return n ? [toSystem(measures, editable, 0, n)] : [];
  // best[j][i]: smallest possible widest-system width for the first i bars in j systems.
  const best: number[][] = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(0));
  best[0][0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let i = j; i <= n; i++) {
      for (let from = Math.max(j - 1, i - maxPerSystem); from < i; from++) {
        const w = systemNatural(measures, editable, from, i);
        // A one-bar system may overflow (the scrolling case); a longer one must fit.
        if (i - from > 1 && w > available) continue;
        const cost = Math.max(best[j - 1][from], w);
        if (cost < best[j][i]) {
          best[j][i] = cost;
          cut[j][i] = from;
        }
      }
    }
  }
  const out: { bars: number[]; naturals: number[] }[] = [];
  let end = n;
  for (let j = k; j >= 1; j--) {
    const from = cut[j][end];
    out.unshift(toSystem(measures, editable, from, end));
    end = from;
  }
  return out;
}

/**
 * Breaking, justification and the scale-down rules: a bar wider than the line
 * scales the component down; in read mode a passage that would only just spill
 * onto a second line is first scaled down (to the same 0.75 limit) to stay on one.
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
  // Fit the whole passage on one line by scaling down, never below the limit and never in edit mode.
  const oneLine = measures.length > 1 && measures.length <= MAX_BARS_PER_SYSTEM ? systemNatural(measures, editable, 0, measures.length) : 0;
  if (oneLine > available && !editable.some(Boolean) && !scrolls) {
    const fitted = opts.availablePx / oneLine;
    if (fitted >= MIN_SCALE_FACTOR * opts.scale) {
      scale = Math.min(scale, fitted);
      available = Math.max(Math.floor(opts.availablePx / scale), Math.ceil(oneLine));
    }
  }
  const raw = breakBars(measures, available, editable, MAX_BARS_PER_SYSTEM);
  const systems: PlannedSystem[] = raw.map((s) => {
    const total = s.naturals.reduce((a, b) => a + b, 0);
    let widths = s.naturals.slice();
    // Several lines: every line is full width. One line: only when it is nearly full already.
    const justify = raw.length > 1 || total >= JUSTIFY_THRESHOLD * available;
    if (justify && total < available) {
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
