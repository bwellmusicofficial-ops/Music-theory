import type { EventRef, Fraction, Passage, ScoreEvent } from '../types';
import { durationLength } from '../rhythm/duration';
import { ZERO, add, toNumber } from '../rhythm/fraction';
import { barLength, isWholeBarRest } from '../rhythm/metre';

/** Every event of a passage in written order, with its exact position. */
export interface Layout {
  /** Events in written order. */
  flat: { bar: number; event: number; ev: ScoreEvent }[];
  /** `index[bar][event]` is the position of that event in `flat`. */
  index: number[][];
  /** Onset of each flat event, in whole notes from the start (written order, one pass). */
  start: Fraction[];
  /** Length of each flat event in whole notes. A lone whole-bar rest counts as the full bar. */
  length: Fraction[];
  /** True when the event is a note that continues the tie from the note before it. */
  continuation: boolean[];
  /** For each flat event, the flat index of the first note of its tie chain (itself if not tied on). */
  head: number[];
  /** For each flat event, the flat index of the last note of its tie chain. */
  tail: number[];
}

/** Positions follow `rhythm.onsetTimes`: short bars are not padded; a lone whole-bar rest takes the full bar. */
export function layoutOf(passage: Passage): Layout {
  const flat: Layout['flat'] = [];
  const index: number[][] = [];
  const start: Fraction[] = [];
  const length: Fraction[] = [];
  let t = ZERO;
  passage.bars.forEach((bar, b) => {
    const row: number[] = [];
    const whole = isWholeBarRest(bar.events, passage.time);
    bar.events.forEach((ev, e) => {
      row.push(flat.length);
      flat.push({ bar: b, event: e, ev });
      start.push(t);
      const len = whole ? barLength(passage.time) : durationLength(ev.duration);
      length.push(len);
      t = add(t, len);
    });
    index.push(row);
  });
  const continuation = flat.map((f, i) => {
    const prev = flat[i - 1]?.ev;
    return f.ev.kind === 'note' && prev?.kind === 'note' && prev.tieToNext === true;
  });
  const head = flat.map((_, i) => i);
  for (let i = 1; i < flat.length; i++) if (continuation[i]) head[i] = head[i - 1] as number;
  const tail = flat.map((_, i) => i);
  for (let i = flat.length - 2; i >= 0; i--) if (continuation[i + 1]) tail[i] = tail[i + 1] as number;
  return { flat, index, start, length, continuation, head, tail };
}

/** Flat position of a reference, or undefined when it points at nothing. */
export function resolve(layout: Layout, ref: EventRef | undefined): number | undefined {
  if (!ref || !Number.isInteger(ref.bar) || !Number.isInteger(ref.event)) return undefined;
  return layout.index[ref.bar]?.[ref.event];
}

export const num = toNumber;

export function pluralBars(n: number): string {
  return `${n} bar${n === 1 ? '' : 's'}`;
}

/** Plain-English place of an event: "Bar 2, note 3" (events are counted from 1 and include rests). */
export function place(passage: Passage, ref: EventRef): string {
  const ev = passage.bars[ref.bar]?.events[ref.event];
  const noun = ev ? (ev.kind === 'note' ? 'note' : 'rest') : 'event';
  return `Bar ${ref.bar + 1}, ${noun} ${ref.event + 1}`;
}

/** Everything the expression functions read, with absent parts defaulted. */
export function exprOf(passage: Passage) {
  const x = passage.expression ?? {};
  return {
    dynamics: x.dynamics ?? [],
    hairpins: x.hairpins ?? [],
    slurs: x.slurs ?? [],
    tempoChanges: x.tempoChanges ?? [],
    words: x.words ?? [],
    tempo: x.tempo,
  };
}
