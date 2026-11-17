import { TheoryError, type PerformedEvent, type TempoMap } from '../api';
import { feltBeat } from '../rhythm/metre';
import type { Passage } from '../types';
import { performanceOrder } from './order';
import { exprOf, layoutOf, num, resolve, type Layout } from './util';
import { wordKind } from './words';

export const DEFAULT_TEMPO_FACTOR = { accel: 1.35, rit: 0.7, rall: 0.65 } as const;

export type TempoSpanKind = 'accel' | 'rit' | 'rall';

/** A gradual change in flat event positions (both inclusive), from explicit `tempoChanges` or from `words`. */
export interface TempoSpan {
  kind: TempoSpanKind;
  i0: number;
  i1: number;
  toBpm?: number;
  fromWords: boolean;
}

/**
 * Every gradual tempo change, sorted by start. Words "rit.", "rall.", "accel."
 * with no span run from their event to the end of the next bar (clamped to the
 * last bar); a word span that starts inside an earlier span is dropped.
 */
export function tempoSpans(passage: Passage, layout: Layout): TempoSpan[] {
  const x = exprOf(passage);
  const spans: TempoSpan[] = [];
  for (const c of x.tempoChanges) {
    if (c.kind === 'a-tempo') continue;
    const i0 = resolve(layout, c.from);
    const i1 = resolve(layout, c.to);
    if (i0 === undefined || i1 === undefined || i1 < i0) continue;
    spans.push({ kind: c.kind, i0, i1, ...(c.toBpm !== undefined ? { toBpm: c.toBpm } : {}), fromWords: false });
  }
  const words: TempoSpan[] = [];
  for (const w of x.words) {
    const kind = wordKind(w.text);
    const i0 = resolve(layout, w.at);
    if (i0 === undefined || (kind !== 'rit' && kind !== 'rall' && kind !== 'accel')) continue;
    const lastBar = Math.min(w.at.bar + 1, passage.bars.length - 1);
    const i1 = (layout.index[lastBar]?.at(-1) as number | undefined) ?? i0;
    words.push({ kind, i0, i1, fromWords: true });
  }
  words.sort((a, b) => a.i0 - b.i0);
  for (const w of words) if (!spans.some((s) => w.i0 >= s.i0 && w.i0 <= s.i1)) spans.push(w);
  return spans.sort((a, b) => a.i0 - b.i0);
}

interface Segment {
  b0: number;
  b1: number;
  v0: number;
  v1: number;
  t0: number;
}

/**
 * Time for the written passage at `baseBpm` felt beats per minute (the bpm
 * the caller plays at; the passage's own `tempo` marking is not read, because
 * `playPassage`'s bpm stays authoritative).
 *
 * - accel / rit / rall: the bpm moves linearly in beats from the tempo in force
 *   at the start of the first event to `toBpm` (or x1.35, x0.7, x0.65) at the
 *   end of the last event, then holds. Time over a ramp of L beats from v0 to
 *   v1 is 60 * L / (v1 - v0) * ln(v1 / v0).
 * - a-tempo: from its event, back to the tempo in force before the first change
 *   since the previous a-tempo (or the start).
 * - fermata: the event takes twice as long (the tempo at that point); later
 *   events move back by the extra.
 * - A change that starts inside an earlier one is ignored (validateExpression reports it).
 */
export function tempoMap(passage: Passage, baseBpm: number): TempoMap {
  if (!Number.isFinite(baseBpm) || baseBpm <= 0) {
    throw new TheoryError(`bpm must be a positive number, got ${baseBpm}`);
  }
  const layout = layoutOf(passage);
  const beat = num(feltBeat(passage.time));
  const beatOf = (i: number) => num(layout.start[i]!) / beat;
  const beatEnd = (i: number) => (num(layout.start[i]!) + num(layout.length[i]!)) / beat;

  const spans = tempoSpans(passage, layout);
  type Item = { at: number; span?: TempoSpan };
  const items: Item[] = spans.map((s) => ({ at: s.i0, span: s }));
  for (const c of exprOf(passage).tempoChanges) {
    if (c.kind !== 'a-tempo') continue;
    const i = resolve(layout, c.at);
    if (i !== undefined) items.push({ at: i });
  }
  // A span and an a-tempo never share a position in valid input; spans first if they do.
  items.sort((a, b) => a.at - b.at || (a.span ? -1 : 1) - (b.span ? -1 : 1));

  const segments: Segment[] = [];
  let cur = baseBpm;
  let reference: number | null = null;
  let cursor = 0;
  let t = 0;
  const constant = (to: number) => {
    if (to <= cursor) return;
    segments.push({ b0: cursor, b1: to, v0: cur, v1: cur, t0: t });
    t += (to - cursor) * (60 / cur);
    cursor = to;
  };
  for (const item of items) {
    const at = beatOf(item.at);
    if (at < cursor) continue;
    if (item.span) {
      const s = item.span;
      const end = beatEnd(s.i1);
      if (reference === null) reference = cur;
      constant(at);
      const target = s.toBpm ?? cur * DEFAULT_TEMPO_FACTOR[s.kind];
      const L = end - at;
      segments.push({ b0: at, b1: end, v0: cur, v1: target, t0: t });
      t += target === cur ? L * (60 / cur) : ((60 * L) / (target - cur)) * Math.log(target / cur);
      cursor = end;
      cur = target;
    } else if (reference !== null) {
      constant(at);
      cur = reference;
      reference = null;
    }
  }
  segments.push({ b0: cursor, b1: Infinity, v0: cur, v1: cur, t0: t });

  const timeAtBeat = (b: number): number => {
    let seg = segments[segments.length - 1]!;
    for (const s of segments) {
      if (b < s.b1) {
        seg = s;
        break;
      }
    }
    const x = b - seg.b0;
    if (seg.v0 === seg.v1) return seg.t0 + x * (60 / seg.v0);
    const L = seg.b1 - seg.b0;
    const vb = seg.v0 + ((seg.v1 - seg.v0) * x) / L;
    return seg.t0 + ((60 * L) / (seg.v1 - seg.v0)) * Math.log(vb / seg.v0);
  };

  const n = layout.flat.length;
  const writtenStart = layout.flat.map((_, i) => timeAtBeat(beatOf(i)));
  const writtenLen = layout.flat.map((_, i) => timeAtBeat(beatEnd(i)) - writtenStart[i]!);
  const startTime: number[] = [];
  const duration: number[] = [];
  let extra = 0;
  for (let i = 0; i < n; i++) {
    const held = layout.flat[i]!.ev.fermata === true;
    startTime.push(writtenStart[i]! + extra);
    duration.push(writtenLen[i]! * (held ? 2 : 1));
    if (held) extra += writtenLen[i]!;
  }

  const lookup = (bar: number, event: number): number => {
    const i = layout.index[bar]?.[event];
    if (i === undefined) throw new TheoryError(`There is no event ${event} in bar ${bar}`);
    return i;
  };
  const last = n - 1;
  return {
    timeOf: (bar, event) => startTime[lookup(bar, event)]!,
    durationOf: (bar, event) => duration[lookup(bar, event)]!,
    totalSeconds: n === 0 ? 0 : startTime[last]! + duration[last]!,
  };
}

/**
 * The whole schedule in playing order (repeats, D.C., D.S. and Fine expanded by
 * `performanceOrder`). Every event, rests and tied continuations included, is
 * listed with its WRITTEN position. Tempo is a function of written position,
 * so a bar played again is timed exactly as before (a repeat or D.C. restarts
 * the written tempo, a rit inside a repeated section happens again).
 */
export function performedEvents(passage: Passage, baseBpm: number): PerformedEvent[] {
  const map = tempoMap(passage, baseBpm);
  const out: PerformedEvent[] = [];
  let offset = 0;
  for (const b of performanceOrder(passage)) {
    const events = passage.bars[b]!.events;
    if (events.length === 0) continue;
    const barStart = map.timeOf(b, 0);
    let span = 0;
    events.forEach((_, e) => {
      const duration = map.durationOf(b, e);
      out.push({ bar: b, event: e, time: offset + map.timeOf(b, e) - barStart, duration });
      span += duration;
    });
    offset += span;
  }
  return out;
}
