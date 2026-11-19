import type { Accidental, NoteValue, Passage } from '@/engine/types';
import { BAR_CAPACITY_EVENTS, BAR_CAPACITY_FACTOR, DEFAULT_RANGE } from '../constants';
import type { Engines, StaveProps } from '../types';
import type { EditConstraints } from './actions';

export function isTupletEvent(passage: Passage, bar: number, event: number): boolean {
  const ev = passage.bars[bar]?.events[event];
  return !!ev && !!ev.duration.tuplet;
}

export function editableEntry(c: EditConstraints, bar: number) {
  return c.editable.find((x) => x.bar === bar);
}

export function isBarEditable(c: EditConstraints, bar: number): boolean {
  return editableEntry(c, bar) !== undefined;
}

/** Locked by constraints (not tuplets, which are `not-allowed` rather than locked). */
export function isEventLocked(c: EditConstraints, passage: Passage, bar: number, event: number): boolean {
  const entry = editableEntry(c, bar);
  const len = passage.bars[bar]?.events.length ?? 0;
  if (!entry) return true;
  return event < entry.lockedPrefix || event >= len - entry.lockedSuffix;
}

/** Valid slot range [first, last] for insertion in a bar, or null when not editable. */
export function slotRange(c: EditConstraints, passage: Passage, bar: number): [number, number] | null {
  const entry = editableEntry(c, bar);
  if (!entry) return null;
  const len = passage.bars[bar].events.length;
  const first = entry.lockedPrefix;
  const last = len - entry.lockedSuffix;
  return last < first ? null : [first, last];
}

export function withinCapacity(e: Engines, passage: Passage, events: Passage['bars'][number]['events']): boolean {
  if (events.length > BAR_CAPACITY_EVENTS) return false;
  const len = e.rhythm.eventsLength(events);
  const cap = e.rhythm.barLength(passage.time);
  return e.rhythm.compareFractions(len, { n: cap.n * BAR_CAPACITY_FACTOR, d: cap.d }) <= 0;
}

const SIGN_SETS: Record<'single' | 'double', Accidental[]> = {
  single: [-1, 0, 1],
  double: [-2, -1, 0, 1, 2],
};

/** Build reducer constraints from props. */
export function buildConstraints(e: Engines, props: Pick<StaveProps, 'passage' | 'palette' | 'edit' | 'range'>): EditConstraints {
  const { passage, palette = {}, edit = {}, range } = props;
  let min = DEFAULT_RANGE.min;
  let max = DEFAULT_RANGE.max;
  if (range) {
    const lo = e.pitch.stavePosition(range.low, passage.clef);
    const hi = e.pitch.stavePosition(range.high, passage.clef);
    min = Math.max(min, Math.min(lo, hi));
    max = Math.min(max, Math.max(lo, hi));
  }
  const values: NoteValue[] = (palette.durations ?? []).map((d) => d.value);
  const acc = palette.accidentals;
  const signs = acc === 'double' ? SIGN_SETS.double : acc ? SIGN_SETS.single : [];
  // 'key-signature' has its own component and never reaches the reducer.
  const kind = edit.kind === 'single-note' ? 'single-note' : 'free';
  const source: { bar: number; lockedPrefix?: number; lockedSuffix?: number }[] =
    edit.editable ?? passage.bars.map((_, bar) => ({ bar }));
  const editable = source
    .filter((x) => x.bar >= 0 && x.bar < passage.bars.length)
    .map((x) => ({ bar: x.bar, lockedPrefix: x.lockedPrefix ?? 0, lockedSuffix: x.lockedSuffix ?? 0 }));
  return {
    kind,
    editable: kind === 'single-note' ? editable.slice(0, 1) : editable,
    range: { min, max: Math.max(min, max) },
    maxChordSize: palette.chords ? 4 : 1,
    allow: {
      values,
      rests: palette.rests === true,
      signs,
      maxDots: palette.dots ?? 0,
      ties: palette.ties === true,
    },
  };
}
