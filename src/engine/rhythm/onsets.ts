import { TheoryError } from '../api';
import type { Bar, TimeSignature } from '../types';
import { durationLength } from './duration';
import { ZERO, add, div, toNumber } from './fraction';
import { feltBeat, validateTime } from './metre';

/**
 * Onset times in seconds. Time runs on from the actual lengths of the events
 * (short bars are not padded). A note that follows a note marked tieToNext is a
 * continuation and has no onset; rests never do. Irregular metres count the
 * written beat unit as the beat.
 */
export function onsetTimes(bars: Bar[], time: TimeSignature, bpm: number): number[] {
  validateTime(time);
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new TheoryError(`bpm must be a positive number, got ${bpm}`);
  }
  const beat = feltBeat(time);
  const secondsPerBeat = 60 / bpm;
  const out: number[] = [];
  let t = ZERO;
  let tied = false;
  for (const bar of bars) {
    for (const e of bar.events) {
      if (e.kind === 'note' && !tied) {
        out.push(toNumber(div(t, beat)) * secondsPerBeat);
      }
      tied = e.kind === 'note' && e.tieToNext === true;
      t = add(t, durationLength(e.duration));
    }
  }
  return out;
}
