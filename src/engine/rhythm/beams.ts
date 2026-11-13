import type { Bar, Fraction, ScoreEvent, TimeSignature } from '../types';
import { feltBeat, barLength, metreKind, beatsPerBar, validateTime } from './metre';
import { layout } from './duration';
import { ZERO, add, eq, frac, le, lt, mul, sub } from './fraction';

type Span = [Fraction, Fraction];

const BEAMABLE = new Set(['quaver', 'semiquaver', 'demisemiquaver']);

function isBeamable(e: ScoreEvent): boolean {
  return e.kind === 'note' && BEAMABLE.has(e.duration.value);
}

function isPlainQuaver(e: ScoreEvent): boolean {
  return (
    e.kind === 'note' && e.duration.value === 'quaver' && e.duration.dots === 0 && !e.duration.tuplet
  );
}

/**
 * Beam groups: indexes into bar.events. Beams stay inside a beat (the dotted
 * beat in compound time). In simple time, beats are joined into one span when
 * that span is nothing but plain quavers (or, for x/8 and x/16, any beamable
 * notes): the whole bar of 2/4, 3/4, 3/8, or each half of a four-beat bar.
 */
export function beamGroups(bar: Bar, time: TimeSignature): number[][] {
  validateTime(time);
  const events = bar.events;
  const pos = layout(events);
  const beat = feltBeat(time);
  const nBeats = metreKind(time) === 'irregular' ? time.beats : beatsPerBar(time);
  // Validates bar length computation for the time signature.
  barLength(time);

  const beatSpan = (i: number): Span => [mul(beat, frac(i)), mul(beat, frac(i + 1))];

  const spans: Span[] = [];
  const mergedPlan: [number, number][] =
    metreKind(time) === 'simple' && time.beatUnit >= 4
      ? nBeats <= 3
        ? [[0, nBeats]]
        : [
            [0, 2],
            [2, 4],
          ]
      : [];

  const mergeable = (from: number, to: number): boolean => {
    const ss = mul(beat, frac(from));
    const se = mul(beat, frac(to));
    const inside = events.map((e, i) => ({ e, i })).filter(({ i }) => le(ss, pos[i].start) && lt(pos[i].start, se));
    if (inside.length === 0 || !eq(pos[inside[0].i].start, ss)) return false;
    let total = ZERO;
    for (const { e, i } of inside) {
      const ok = time.beatUnit === 4 ? isPlainQuaver(e) : isBeamable(e);
      if (!ok) return false;
      total = add(total, sub(pos[i].end, pos[i].start));
    }
    return eq(total, sub(se, ss));
  };

  if (mergedPlan.length > 0) {
    for (const [from, to] of mergedPlan) {
      if (mergeable(from, to)) {
        spans.push([mul(beat, frac(from)), mul(beat, frac(to))]);
      } else {
        for (let i = from; i < to; i++) spans.push(beatSpan(i));
      }
    }
  } else {
    for (let i = 0; i < nBeats; i++) spans.push(beatSpan(i));
  }

  const groups: number[][] = [];
  for (const [ss, se] of spans) {
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 2) groups.push(run);
      run = [];
    };
    events.forEach((e, i) => {
      if (!(le(ss, pos[i].start) && lt(pos[i].start, se))) return;
      if (isBeamable(e) && le(pos[i].end, se)) {
        run.push(i);
      } else {
        flush();
      }
    });
    flush();
  }
  return groups;
}
