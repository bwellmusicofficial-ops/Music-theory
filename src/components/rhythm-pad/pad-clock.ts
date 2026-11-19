import { getAudioEngine } from '@/audio';
import { rhythm } from '@/engine/rhythm';
import type { TimeSignature } from '@/engine/types';

/**
 * A metronome owned by a parent, so that several rhythm pads in a row share one unbroken click.
 *
 * The pad normally starts its own metronome for each performance. With a `PadClock` (the pad's
 * `clock` prop) it asks the clock for a bar line instead: the click is already running, and the
 * pad's count-in and onsets are measured from that bar line, so every rhythm enters on a bar line
 * of the one click. When the next rhythm has a different tempo or time signature, the clock hands
 * over to a new metronome exactly on a bar line, with no gap and no double click.
 *
 * Audio still starts only after a user gesture: the parent (or the pad's `start()`) unlocks the
 * engine as before; the clock only schedules.
 */
export interface PadClock {
  /**
   * Makes sure the click is running at this metre and tempo and returns the audio-clock time of the
   * first bar line at or after `notBefore` (default: a short lead from now). Changing tempo or
   * metre moves the hand-over to a bar line at least `CLOCK_HANDOVER_LEAD_S` from now, so the old
   * click can still be told to stop in time.
   */
  claimBarLine(time: TimeSignature, bpm: number, notBefore?: number): number;
  /** The first bar line of the click now running at or after `notBefore`, or null when it is not running. */
  nextBarLine(notBefore: number): number | null;
  /** Stops the click (a pause, the end of the game). Safe to call twice. */
  stop(): void;
}

/** How soon after "now" a bar line can be claimed when the click is already running at the right tempo. */
export const CLOCK_CLAIM_LEAD_S = 0.15;
/** Before a tempo or metre change the old click must be told to stop this long ahead (the engine commits clicks 0.25 s ahead). */
export const CLOCK_HANDOVER_LEAD_S = 0.4;

interface Segment {
  time: TimeSignature;
  bpm: number;
  /** Audio-clock time of the segment's first click (a bar line). */
  startTime: number;
  barSeconds: number;
  metro: { stop(): void; stopAt(time: number): void };
}

/** The first bar line of a click that started on a bar line at `startTime`, at or after `notBefore`. */
export function barLineAtOrAfter(startTime: number, barSeconds: number, notBefore: number): number {
  // A microsecond of slack so a time exactly on a bar line is that bar line, not the next.
  const n = Math.max(0, Math.ceil((notBefore - startTime) / barSeconds - 1e-9));
  return startTime + n * barSeconds;
}

export function createPadClock(): PadClock {
  let seg: Segment | null = null;

  const begin = (time: TimeSignature, bpm: number, startAt?: number): Segment => {
    const metro = getAudioEngine().startMetronome(time, bpm, undefined, startAt === undefined ? undefined : { startAt });
    return { time, bpm, startTime: metro.startTime, barSeconds: (rhythm.beatsPerBar(time) * 60) / bpm, metro };
  };
  const same = (s: Segment, time: TimeSignature, bpm: number) =>
    s.bpm === bpm && s.time.beats === time.beats && s.time.beatUnit === time.beatUnit;

  return {
    claimBarLine(time, bpm, notBefore) {
      const now = getAudioEngine().now();
      if (!seg) {
        // Nothing is clicking yet: the first click is itself a bar line, so the performance starts on it.
        seg = begin(time, bpm);
        return barLineAtOrAfter(seg.startTime, seg.barSeconds, Math.max(notBefore ?? 0, now));
      }
      const wanted = Math.max(notBefore ?? 0, now + CLOCK_CLAIM_LEAD_S);
      if (same(seg, time, bpm)) return barLineAtOrAfter(seg.startTime, seg.barSeconds, wanted);
      // A new tempo or metre: the old click stops, and the new one starts, on the same bar line.
      const at = barLineAtOrAfter(seg.startTime, seg.barSeconds, Math.max(wanted, now + CLOCK_HANDOVER_LEAD_S));
      seg.metro.stopAt(at);
      seg = begin(time, bpm, at);
      return seg.startTime;
    },
    nextBarLine(notBefore) {
      return seg ? barLineAtOrAfter(seg.startTime, seg.barSeconds, notBefore) : null;
    },
    stop() {
      seg?.metro.stop();
      seg = null;
    },
  };
}
