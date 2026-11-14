import type { Bar, NoteEvent, Pitch, ScoreEvent } from '@/engine/types';

export function samePitch(a: Pitch, b: Pitch): boolean {
  return a.letter === b.letter && a.octave === b.octave && a.accidental === b.accidental;
}

export function sharedPitch(a: NoteEvent, b: ScoreEvent | undefined): boolean {
  if (!b || b.kind !== 'note') return false;
  return a.pitches.some((p) => b.pitches.some((q) => samePitch(p, q)));
}

/** Clear ties whose target exists but is a rest or shares no pitch (4.5). Edited bar only. */
export function pruneTies(bar: Bar, nextBarFirst: ScoreEvent | undefined): Bar {
  let changed = false;
  const events = bar.events.map((ev, i) => {
    if (ev.kind !== 'note' || !ev.tieToNext) return ev;
    const target = i + 1 < bar.events.length ? bar.events[i + 1] : nextBarFirst;
    if (target === undefined || sharedPitch(ev, target)) return ev;
    changed = true;
    const copy: NoteEvent = { ...ev };
    delete copy.tieToNext;
    return copy;
  });
  return changed ? { events } : bar;
}

export interface TiePair {
  /** Source event address. */
  from: { bar: number; event: number };
  /** Target event address, or null for an open tie. */
  to: { bar: number; event: number } | null;
  /** Indexes of identical pitches in source and target. */
  fromIndexes: number[];
  toIndexes: number[];
}

/** Tie pairs for drawing, across the whole passage. */
export function tiePairs(bars: Bar[]): TiePair[] {
  const out: TiePair[] = [];
  bars.forEach((bar, b) => {
    bar.events.forEach((ev, i) => {
      if (ev.kind !== 'note' || !ev.tieToNext) return;
      let to: { bar: number; event: number } | null = null;
      if (i + 1 < bar.events.length) to = { bar: b, event: i + 1 };
      else if (b + 1 < bars.length && bars[b + 1].events.length > 0) to = { bar: b + 1, event: 0 };
      if (!to) {
        out.push({ from: { bar: b, event: i }, to: null, fromIndexes: ev.pitches.map((_, k) => k), toIndexes: [] });
        return;
      }
      const target = bars[to.bar].events[to.event];
      const fromIndexes: number[] = [];
      const toIndexes: number[] = [];
      if (target.kind === 'note') {
        ev.pitches.forEach((p, k) => {
          const j = target.pitches.findIndex((q) => samePitch(p, q));
          if (j >= 0) {
            fromIndexes.push(k);
            toIndexes.push(j);
          }
        });
      }
      if (fromIndexes.length === 0) {
        out.push({ from: { bar: b, event: i }, to: null, fromIndexes: ev.pitches.map((_, k) => k), toIndexes: [] });
      } else {
        out.push({ from: { bar: b, event: i }, to, fromIndexes, toIndexes });
      }
    });
  });
  return out;
}
