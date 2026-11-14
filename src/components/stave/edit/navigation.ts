import type { Letter, Passage } from '@/engine/types';
import type { Engines } from '../types';
import type { EditConstraints } from './actions';
import { isBarEditable, isEventLocked, isTupletEvent, slotRange } from './constraints';

export type Stop =
  | { kind: 'event'; bar: number; event: number }
  | { kind: 'slot'; bar: number; slot: number };

/** Stops of one bar: its unlocked events in order, then its end slot. */
export function stopsForBar(c: EditConstraints, passage: Passage, bar: number): Stop[] {
  if (!isBarEditable(c, bar)) return [];
  const stops: Stop[] = [];
  const len = passage.bars[bar].events.length;
  for (let i = 0; i < len; i++) {
    if (isEventLocked(c, passage, bar, i) || isTupletEvent(passage, bar, i)) continue;
    stops.push({ kind: 'event', bar, event: i });
  }
  const r = slotRange(c, passage, bar);
  if (r) stops.push({ kind: 'slot', bar, slot: r[1] });
  return stops;
}

export function allStops(c: EditConstraints, passage: Passage): Stop[] {
  return passage.bars.flatMap((_, b) => stopsForBar(c, passage, b));
}

export function sameStop(a: Stop, b: Stop): boolean {
  if (a.kind !== b.kind || a.bar !== b.bar) return false;
  return a.kind === 'event' ? a.event === (b as typeof a).event : a.slot === (b as typeof a).slot;
}

/** Stop for a selection or caret; a caret in a non-end slot maps to the end slot of its bar. */
export function stopFor(c: EditConstraints, passage: Passage, at: { selection: { bar: number; event: number } | null; caret: { bar: number; slot: number } }): Stop {
  if (at.selection) return { kind: 'event', bar: at.selection.bar, event: at.selection.event };
  const r = slotRange(c, passage, at.caret.bar);
  return { kind: 'slot', bar: at.caret.bar, slot: r ? r[1] : at.caret.slot };
}

export function stepStop(c: EditConstraints, passage: Passage, from: Stop, dir: 1 | -1): Stop | null {
  const stops = allStops(c, passage);
  if (stops.length === 0) return null;
  let i = stops.findIndex((s) => sameStop(s, from));
  if (i < 0) {
    // Not a stop (for example the caret sits in a slot before the end): position by bar.
    i = stops.findIndex((s) => s.bar === from.bar && s.kind === 'slot');
    if (i < 0) i = dir === 1 ? -1 : stops.length;
  }
  const n = i + dir;
  return n >= 0 && n < stops.length ? stops[n] : null;
}

/** First stop of the previous / next editable bar (Ctrl+Left / Right). */
export function jumpBar(c: EditConstraints, passage: Passage, bar: number, dir: 1 | -1): Stop | null {
  for (let b = bar + dir; b >= 0 && b < passage.bars.length; b += dir) {
    const s = stopsForBar(c, passage, b);
    if (s.length) return s[0];
  }
  return null;
}

/** Position of the top head of the nearest note before the caret (any bar), else 4. */
export function referencePosition(e: Engines, passage: Passage, caret: { bar: number; slot: number }): number {
  for (let b = caret.bar; b >= 0; b--) {
    const events = passage.bars[b]?.events ?? [];
    const from = b === caret.bar ? Math.min(caret.slot, events.length) - 1 : events.length - 1;
    for (let i = from; i >= 0; i--) {
      const ev = events[i];
      if (ev.kind === 'note') {
        return Math.max(...ev.pitches.map((p) => e.pitch.stavePosition(p, passage.clef)));
      }
    }
  }
  return 4;
}

function positionsWithLetter(e: Engines, letter: Letter, clef: Passage['clef'], range: { min: number; max: number }): number[] {
  const out: number[] = [];
  for (let p = range.min; p <= range.max; p++) {
    if (e.pitch.pitchAtStavePosition(p, clef).letter === letter) out.push(p);
  }
  return out;
}

/** Position with this letter nearest to `ref`; a tie goes to the higher. Null if none in range. */
export function nearestLetterPosition(e: Engines, letter: Letter, ref: number, clef: Passage['clef'], range: { min: number; max: number }): number | null {
  const cands = positionsWithLetter(e, letter, clef, range);
  if (!cands.length) return null;
  return cands.reduce((best, p) => {
    const d = Math.abs(p - ref);
    const bd = Math.abs(best - ref);
    return d < bd || (d === bd && p > best) ? p : best;
  });
}

/** Nearest position with this letter above `top`, else the nearest below `bottom`. */
export function chordLetterPosition(
  e: Engines,
  letter: Letter,
  top: number,
  bottom: number,
  clef: Passage['clef'],
  range: { min: number; max: number },
  occupied: number[],
): number | null {
  const cands = positionsWithLetter(e, letter, clef, range).filter((p) => !occupied.includes(p));
  const above = cands.filter((p) => p > top).sort((a, b) => a - b)[0];
  if (above !== undefined) return above;
  const below = cands.filter((p) => p < bottom).sort((a, b) => b - a)[0];
  return below ?? null;
}

/** First bar that differs between two passages (for the caret after undo/redo). */
export function firstDifferingBar(a: Passage, b: Passage): number {
  const n = Math.max(a.bars.length, b.bars.length);
  for (let i = 0; i < n; i++) {
    if (a.bars[i] !== b.bars[i] && JSON.stringify(a.bars[i]) !== JSON.stringify(b.bars[i])) return i;
  }
  return 0;
}
