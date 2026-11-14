import type { RhythmEngine } from '../api';
import type { Bar, Fraction, TimeSignature } from '../types';
import { beamGroups } from './beams';
import { NOTE_VALUES, durationLength, eventsLength, noteValueName, restName } from './duration';
import { add, cmp, normalise } from './fraction';
import { groupingProblems } from './grouping';
import { barLength, beatLength, beatsPerBar, isWholeBarRest, metreKind, metreName } from './metre';
import { onsetTimes } from './onsets';
import { restsToFill } from './rest-fill';

function checkBarLength(
  bar: Bar,
  time: TimeSignature,
): { status: 'complete' | 'short' | 'long'; difference: Fraction } {
  const full = barLength(time);
  if (isWholeBarRest(bar.events, time)) return { status: 'complete', difference: { n: 0, d: 1 } };
  const actual = eventsLength(bar.events);
  const order = cmp(actual, full);
  if (order === 0) return { status: 'complete', difference: { n: 0, d: 1 } };
  // difference is always non-negative: how much is missing or extra.
  return order < 0
    ? { status: 'short', difference: add(full, { n: -actual.n, d: actual.d }) }
    : { status: 'long', difference: add(actual, { n: -full.n, d: full.d }) };
}

export const rhythm: RhythmEngine = {
  durationLength,
  barLength,
  eventsLength,
  addFractions: (a, b) => add(normalise(a), normalise(b)),
  compareFractions: (a, b) => cmp(normalise(a), normalise(b)),
  noteValueName,
  restName,
  noteValues: () => NOTE_VALUES,
  metreKind,
  beatsPerBar,
  beatLength,
  metreName,
  checkBarLength,
  beamGroups,
  groupingProblems,
  restsToFill,
  onsetTimes,
};
