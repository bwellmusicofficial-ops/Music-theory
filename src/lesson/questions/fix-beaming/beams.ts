import { rhythm } from '@/engine/rhythm';
import type { Bar, Fraction, ScoreEvent, TimeSignature } from '@/engine/types';

const BEAMABLE = new Set(['quaver', 'semiquaver', 'demisemiquaver']);

/** A note of quaver value or shorter: the only kind a beam can join. */
export const isBeamable = (event: ScoreEvent | undefined): boolean => event?.kind === 'note' && BEAMABLE.has(event.duration.value);

/** Gaps a learner can toggle: `i` is a gap when events `i` and `i + 1` are both beamable notes. */
export function beamGaps(bar: Bar): number[] {
  const gaps: number[] = [];
  for (let i = 0; i + 1 < bar.events.length; i += 1) if (isBeamable(bar.events[i]) && isBeamable(bar.events[i + 1])) gaps.push(i);
  return gaps;
}

/** `joins[i]` is true when events `i` and `i + 1` are in one beam group. Groups of fewer than two notes join nothing. */
export function joinsOf(bar: Bar, groups: readonly (readonly number[])[]): boolean[] {
  const joins = Array.from({ length: Math.max(0, bar.events.length - 1) }, () => false);
  for (const group of groups) {
    for (let k = 0; k + 1 < group.length; k += 1) {
      const i = group[k]!;
      if (isBeamable(bar.events[i]) && isBeamable(bar.events[i + 1]) && group[k + 1] === i + 1) joins[i] = true;
    }
  }
  return joins;
}

/** Beam groups (runs of joined events, at least two) from joins. */
export function groupsOf(joins: readonly boolean[]): number[][] {
  const groups: number[][] = [];
  let run: number[] = [];
  joins.forEach((joined, i) => {
    if (joined) {
      if (run.length === 0) run.push(i);
      run.push(i + 1);
    } else if (run.length > 0) {
      groups.push(run);
      run = [];
    }
  });
  if (run.length > 0) groups.push(run);
  return groups;
}

/** The standard beaming of a bar, as joins. */
export const standardJoins = (bar: Bar, time: TimeSignature): boolean[] => joinsOf(bar, rhythm.beamGroups(bar, time));

export const sameJoins = (a: readonly boolean[], b: readonly boolean[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Start of every event, as a length in semibreves. */
export function eventStarts(bar: Bar): Fraction[] {
  const starts: Fraction[] = [];
  let at: Fraction = { n: 0, d: 1 };
  for (const event of bar.events) {
    starts.push(at);
    at = rhythm.addFractions(at, rhythm.durationLength(event.duration));
  }
  return starts;
}

/** The length of one felt beat: a dotted beat in compound time, the written beat unit otherwise. */
export function feltBeat(time: TimeSignature): Fraction {
  return rhythm.metreKind(time) === 'compound' ? { n: 3, d: time.beatUnit } : { n: 1, d: time.beatUnit };
}

/** The 1-based beat that a start falls in. */
export function beatNumber(start: Fraction, time: TimeSignature): number {
  const beat = feltBeat(time);
  return Math.floor((start.n * beat.d) / (start.d * beat.n)) + 1;
}
