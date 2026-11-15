import { rhythm } from '@/engine/rhythm';
import type { Bar, TimeSignature } from '@/engine/types';

/** Where one expected onset sits in the passage. */
export interface OnsetRef {
  bar: number;
  event: number;
  /** Felt beats from the start of the passage. */
  beat: number;
  /** Felt beats the note lasts, tied continuations included. */
  length: number;
}

const toNumber = (f: { n: number; d: number }) => f.n / f.d;

/**
 * One entry per expected onset, in the order `rhythm.onsetTimes` lists them, so
 * index i here is index i of the pad's onset events. Same rule as the engine:
 * rests have no onset, and a note that follows a note marked `tieToNext` is a
 * continuation, not an onset.
 */
export function onsetRefs(bars: Bar[], time: TimeSignature): OnsetRef[] {
  // At 60 bpm, seconds are felt beats: the engine stays the only source of onset times.
  const beats = rhythm.onsetTimes(bars, time, 60);
  const felt = (rhythm.metreKind(time) === 'compound' ? 3 : 1) / time.beatUnit;
  const out: OnsetRef[] = [];
  let tied = false;
  bars.forEach((b, bar) => {
    b.events.forEach((e, event) => {
      const length = toNumber(rhythm.durationLength(e.duration)) / felt;
      if (e.kind === 'note') {
        if (tied && out.length > 0) out[out.length - 1].length += length;
        else out.push({ bar, event, beat: beats[out.length] ?? Number.NaN, length });
      }
      tied = e.kind === 'note' && e.tieToNext === true;
    });
  });
  return out;
}

/** Stave mark key for an onset: "bar:event". */
export const onsetKey = (ref: Pick<OnsetRef, 'bar' | 'event'>): string => `${ref.bar}:${ref.event}`;

const EPS = 1e-6;

/**
 * The onset to pulse for a click on `beat` (felt beats from the start): the first
 * note that starts within this beat, else the note still sounding on it, else null.
 */
export function onsetAtBeat(refs: readonly OnsetRef[], beat: number): number | null {
  const starting = refs.findIndex((r) => r.beat >= beat - EPS && r.beat < beat + 1 - EPS);
  if (starting >= 0) return starting;
  const sounding = refs.findIndex((r) => r.beat < beat - EPS && r.beat + r.length > beat + EPS);
  return sounding >= 0 ? sounding : null;
}
