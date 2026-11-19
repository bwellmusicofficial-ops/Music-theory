import { rhythm } from '@/engine/rhythm';
import type { Bar, Passage, ScoreEvent } from '@/engine/types';

/** Every event of the passage in order, bar lines ignored. */
export const flatEvents = (passage: Passage): ScoreEvent[] => passage.bars.flatMap((bar) => bar.events);

/** `after` sorted ascending with repeats removed. */
export const sortedAfter = (after: readonly number[]): number[] => [...new Set(after)].sort((a, b) => a - b);

/** The events cut into bars by a bar line after each index of `after` (sorted, in range). */
export function splitAt(events: readonly ScoreEvent[], after: readonly number[]): ScoreEvent[][] {
  const bars: ScoreEvent[][] = [];
  let from = 0;
  for (const i of after) {
    bars.push(events.slice(from, i + 1));
    from = i + 1;
  }
  bars.push(events.slice(from));
  return bars;
}

/**
 * The passage re-barred at the learner's bar lines. Bars may be short or long. Written beams are the standard
 * beams of the passage's own bars (the answer is not hinted by them), cut where a learner's bar line falls.
 */
export function rebar(passage: Passage, after: readonly number[]): Passage {
  const events = flatEvents(passage);
  const cuts = splitAt(events, after);
  // Standard beam groups of the correct bars, as flat event indexes.
  const groups: number[][] = [];
  let offset = 0;
  for (const bar of passage.bars) {
    for (const group of rhythm.beamGroups(bar, passage.time)) groups.push(group.map((i) => i + offset));
    offset += bar.events.length;
  }
  let start = 0;
  const bars: Bar[] = cuts.map((cut) => {
    const end = start + cut.length;
    const beams: number[][] = [];
    for (const group of groups) {
      const inside = group.filter((i) => i >= start && i < end).map((i) => i - start);
      if (inside.length >= 2) beams.push(inside);
    }
    start = end;
    return { events: cut, beams };
  });
  return { ...passage, bars };
}
