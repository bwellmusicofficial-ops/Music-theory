import { rhythm } from '@/engine/rhythm';
import type { Duration, Fraction, Passage, Pitch, TimeSignature } from '@/engine/types';
import { midiToFrequency, pitchToMidi } from './pitch';

/**
 * Pure duration and scheduling arithmetic for playback. Note lengths come from
 * the rhythm engine. The felt-beat helpers below stay local: they differ from
 * `rhythm.beatsPerBar` / `rhythm.beatLength` for 6/4 (the engine counts any
 * 6, 9 or 12 over any unit as compound) and for irregular metres (the engine
 * throws; playback needs a beat to click).
 */

// --- fractions (whole notes) ------------------------------------------------

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

export function fraction(n: number, d = 1): Fraction {
  if (d === 0) throw new RangeError('Fraction denominator must not be zero');
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export function fractionValue(f: Fraction): number {
  return f.n / f.d;
}

// --- durations ----------------------------------------------------------------

/** Length in whole notes including dots and tuplet ratio. */
export const durationLength: (duration: Duration) => Fraction = rhythm.durationLength;

// --- metre ----------------------------------------------------------------------

/** 6/8, 9/8, 12/8 (and 6/16 etc.) are compound: the felt beat is a dotted note. */
export function isCompound(time: TimeSignature): boolean {
  return time.beatUnit >= 8 && time.beats >= 6 && time.beats % 3 === 0;
}

/** Felt beats per bar: 6/8 = 2, 3/4 = 3, 2/2 = 2. */
export function feltBeatsPerBar(time: TimeSignature): number {
  return isCompound(time) ? time.beats / 3 : time.beats;
}

/** Length of one felt beat in whole notes: 6/8 = 3/8, 3/4 = 1/4. */
export function feltBeatLength(time: TimeSignature): Fraction {
  return isCompound(time) ? fraction(3, time.beatUnit) : fraction(1, time.beatUnit);
}

/** Seconds per felt beat. */
export function beatSeconds(bpm: number): number {
  if (!(bpm > 0) || !Number.isFinite(bpm)) throw new RangeError(`Invalid bpm: ${bpm}`);
  return 60 / bpm;
}

/** Seconds in one whole note when bpm counts felt beats of the given metre. */
export function secondsPerWholeNote(time: TimeSignature, bpm: number): number {
  return beatSeconds(bpm) / fractionValue(feltBeatLength(time));
}

// --- passage timeline -----------------------------------------------------------

export interface Attack {
  pitch: Pitch;
  midi: number;
  frequency: number;
  /** Seconds the note sounds, including any tied continuations. */
  sustain: number;
}

export interface TimedEvent {
  bar: number;
  event: number;
  kind: 'note' | 'rest';
  /** Seconds from the start of the schedule (count-in included). */
  start: number;
  /** Seconds this event occupies on the page. */
  length: number;
  /** New attacks only; empty for rests and for fully tied continuations. */
  attacks: Attack[];
}

export interface Click {
  time: number;
  accent: boolean;
}

export interface PassageTiming {
  events: TimedEvent[];
  clicks: Click[];
  /** Seconds of count-in before the first event. */
  countInSeconds: number;
  /** Seconds from the start of the schedule to the end of the last event. */
  totalSeconds: number;
}

/**
 * Works out when everything in a passage sounds. Ties (within or across bars)
 * extend the first attack instead of re-attacking; chords tie pitch by pitch.
 */
export function schedulePassage(
  passage: Passage,
  bpm: number,
  countInBeats = 0,
): PassageTiming {
  const perBeat = beatSeconds(bpm);
  const perWhole = secondsPerWholeNote(passage.time, bpm);
  const perBar = feltBeatsPerBar(passage.time);
  const countInSeconds = Math.max(0, Math.floor(countInBeats)) * perBeat;

  const clicks: Click[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(countInBeats)); i++) {
    clicks.push({ time: i * perBeat, accent: i % perBar === 0 });
  }

  const events: TimedEvent[] = [];
  // Open ties: midi -> attack still sustaining.
  let open = new Map<number, Attack>();
  let position = fraction(0);

  passage.bars.forEach((bar, barIndex) => {
    bar.events.forEach((ev, eventIndex) => {
      const length = durationLength(ev.duration);
      const start = countInSeconds + fractionValue(position) * perWhole;
      const lengthSeconds = fractionValue(length) * perWhole;
      const attacks: Attack[] = [];
      const nextOpen = new Map<number, Attack>();

      if (ev.kind === 'note') {
        for (const pitch of ev.pitches) {
          const midi = pitchToMidi(pitch);
          const continuing = open.get(midi);
          let attack: Attack;
          if (continuing) {
            continuing.sustain += lengthSeconds;
            attack = continuing;
          } else {
            attack = { pitch, midi, frequency: midiToFrequency(midi), sustain: lengthSeconds };
            attacks.push(attack);
          }
          if (ev.tieToNext) nextOpen.set(midi, attack);
        }
      }
      open = nextOpen;

      events.push({
        bar: barIndex,
        event: eventIndex,
        kind: ev.kind,
        start,
        length: lengthSeconds,
        attacks,
      });
      position = rhythm.addFractions(position, length);
    });
  });

  return {
    events,
    clicks,
    countInSeconds,
    totalSeconds: countInSeconds + fractionValue(position) * perWhole,
  };
}
