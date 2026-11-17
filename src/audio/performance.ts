import { expression } from '@/engine/expression';
import { rhythm } from '@/engine/rhythm';
import type { Passage, Pitch } from '@/engine/types';
import { midiToFrequency, pitchToMidi } from './pitch';
import { beatSeconds, feltBeatLength, feltBeatsPerBar, fractionValue, schedulePassage, type Click } from './timing';

/**
 * Turns a passage into a performance: when each sound starts, how long it
 * sounds and how loudly, following docs/expression.md section 3. Pure, so the
 * tests can check every number without any audio.
 *
 * Everything musical comes from `expression` (E1): the order of the bars, the
 * seconds of each event (fermatas, accel, rit), loudness in dB and how much of
 * its written length each note sounds. This file only converts those into what
 * Tone needs: seconds and a velocity.
 */

/** Velocity of a note at mf in a passage with no dynamics: today's default. */
export const DEFAULT_VELOCITY = 0.8;

/** The release gap that keeps repeated notes apart when a note sounds its full length (unchanged from before expression). */
const RELEASE_GAP_MAX = 0.03;
const RELEASE_GAP_FRACTION = 0.1;
/** No sound is scheduled shorter than this. */
const MIN_SOUND_SECONDS = 0.01;

/**
 * Velocity for a loudness in dB relative to mf: `mfVelocity * 10^(dB/20)`.
 * Both Tone voices use velocity as a plain linear amplitude (the synth's
 * envelope peaks at the velocity; the sampler's gain is the velocity), so a
 * ratio of velocities is a ratio of amplitudes and the dB steps come out as
 * specified. The tests check this against the real Tone code as well.
 */
export function velocityFor(db: number, mfVelocity: number): number {
  return Math.min(1, mfVelocity * Math.pow(10, db / 20));
}

/**
 * The velocity of mf for this passage. It is today's `DEFAULT_VELOCITY` unless
 * the passage reaches a level that would not fit under 1 (f is +4 dB, ff +7 dB,
 * an accent adds 5 more). Then mf is lowered, for that passage only, just enough
 * that its loudest note has velocity 1 and every step keeps its specified size.
 * A passage with no expression, or nothing above mf, is therefore unchanged.
 */
export function mfVelocityFor(loudestDb: number): number {
  return Math.min(DEFAULT_VELOCITY, Math.pow(10, -Math.max(0, loudestDb) / 20));
}

export interface PerformedAttack {
  pitch: Pitch;
  midi: number;
  frequency: number;
  /** Seconds to hand to the voice: the sounding length (ties merged, articulation applied). */
  duration: number;
  /** 0 to 1, as Tone receives it. */
  velocity: number;
}

export interface PerformedSlot {
  /** WRITTEN position, as `onEvent` reports it. */
  bar: number;
  event: number;
  kind: 'note' | 'rest';
  /** Seconds from the start of the schedule (count-in included). */
  start: number;
  /** Seconds the event occupies. */
  length: number;
  /** New attacks only; empty for rests and tied continuations. */
  attacks: PerformedAttack[];
}

export interface Performance {
  events: PerformedSlot[];
  clicks: Click[];
  countInSeconds: number;
  /** Seconds from the start of the schedule (count-in included) to the end of the last event. */
  totalSeconds: number;
  /** The velocity used for mf in this passage. */
  mfVelocity: number;
}

/** This module counts felt beats as playback always has; the expression engine counts them its own way for 6/4. */
function bpmForExpressionEngine(passage: Passage, bpm: number): number {
  const mine = fractionValue(feltBeatLength(passage.time));
  const theirs =
    rhythm.metreKind(passage.time) === 'irregular'
      ? 1 / passage.time.beatUnit
      : fractionValue(rhythm.beatLength(passage.time));
  return bpm * (mine / theirs);
}

/** True when anything in the passage changes how it is performed: markings, pauses, repeats or navigation signs. */
export function hasExpression(passage: Passage): boolean {
  const x = passage.expression;
  if (x && Object.values(x).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined))) return true;
  return passage.bars.some(
    (bar) =>
      bar.repeatStart === true ||
      bar.endBarline === 'repeat-end' ||
      bar.marker !== undefined ||
      bar.events.some((ev) => ev.fermata === true || (ev.kind === 'note' && (ev.articulations?.length ?? 0) > 0)),
  );
}

/**
 * Timing of a passage with no expression: the original scheduler's, untouched.
 * The expression engine times a lone whole-bar rest as the whole bar (right in
 * 3/4); the original scheduler gave it a full semibreve, which in 3/4 or 2/4 is
 * longer than the bar. "A passage without expression sounds exactly as before"
 * is a rule of this task, so those passages keep the original timing. No
 * lesson content has that case today.
 */
function plainTimes(passage: Passage, bpm: number): { bar: number; event: number; time: number; duration: number }[] {
  return schedulePassage(passage, bpm, 0).events.map((e) => ({
    bar: e.bar,
    event: e.event,
    time: e.start,
    duration: e.length,
  }));
}

export function performPassage(
  passage: Passage,
  bpm: number,
  countInBeats = 0,
  /** For tests: `true` forces the expression engine's timing even when the passage has no expression. */
  options: { expressionTiming?: boolean } = {},
): Performance {
  const perBeat = beatSeconds(bpm);
  const perBar = feltBeatsPerBar(passage.time);
  const beats = Math.max(0, Math.floor(countInBeats));
  const countInSeconds = beats * perBeat;
  const clicks: Click[] = [];
  for (let i = 0; i < beats; i++) clicks.push({ time: i * perBeat, accent: i % perBar === 0 });

  const performed = options.expressionTiming ?? hasExpression(passage)
    ? expression.performedEvents(passage, bpmForExpressionEngine(passage, bpm))
    : plainTimes(passage, bpm);
  const dbs = expression.loudnessAt(passage);
  const details = expression.soundingDetails(passage);

  let loudest = 0;
  for (const row of dbs) for (const db of row) if (db !== null && db > loudest) loudest = db;
  const mfVelocity = mfVelocityFor(loudest);

  // A tie that jumps (a repeat or D.C. sends playing elsewhere) ends there: it continues
  // only into the event written next.
  const writtenNext = (bar: number, event: number): [number, number] | null => {
    if (event + 1 < passage.bars[bar]!.events.length) return [bar, event + 1];
    for (let b = bar + 1; b < passage.bars.length; b++) if (passage.bars[b]!.events.length > 0) return [b, 0];
    return null;
  };

  const slots: PerformedSlot[] = [];
  /** Open ties: midi -> the attack still sounding and the seconds it has so far. */
  let open = new Map<number, { attack: PerformedAttack; chain: number; detail: DetailOf }>();
  /** The resolved detail of the previous written event, so a pitch that starts on a tied continuation inherits it. */
  const detailOfEvent = new Map<string, DetailOf>();
  const pending: { attack: PerformedAttack; chain: number; detail: DetailOf }[] = [];
  let prev: { bar: number; event: number } | null = null;

  for (const p of performed) {
    const ev = passage.bars[p.bar]!.events[p.event]!;
    const attacks: PerformedAttack[] = [];
    const nextOpen = new Map<number, { attack: PerformedAttack; chain: number; detail: DetailOf }>();
    const continues =
      prev !== null &&
      (() => {
        const w = writtenNext(prev.bar, prev.event);
        return w !== null && w[0] === p.bar && w[1] === p.event;
      })();

    if (ev.kind === 'note') {
      const db = dbs[p.bar]?.[p.event] ?? 0;
      let detail = details[p.bar]?.[p.event] ?? null;
      const key = `${p.bar}.${p.event}`;
      if (!detail) {
        const before = prev ? detailOfEvent.get(`${prev.bar}.${prev.event}`) : undefined;
        detail = continues && before ? before : PLAIN;
      }
      detailOfEvent.set(key, detail);
      for (const pitch of ev.pitches) {
        const midi = pitchToMidi(pitch);
        const tied = continues ? open.get(midi) : undefined;
        let entry: { attack: PerformedAttack; chain: number; detail: DetailOf };
        if (tied) {
          tied.chain += p.duration;
          entry = tied;
        } else {
          const attack: PerformedAttack = {
            pitch,
            midi,
            frequency: midiToFrequency(midi),
            duration: 0,
            velocity: velocityFor(db, mfVelocity),
          };
          entry = { attack, chain: p.duration, detail };
          attacks.push(attack);
          pending.push(entry);
        }
        if (ev.tieToNext) nextOpen.set(midi, entry);
      }
    }
    open = nextOpen;
    prev = { bar: p.bar, event: p.event };
    slots.push({
      bar: p.bar,
      event: p.event,
      kind: ev.kind,
      start: countInSeconds + p.time,
      length: p.duration,
      attacks,
    });
  }

  for (const { attack, chain, detail } of pending) attack.duration = soundingSeconds(chain, detail);

  const last = slots[slots.length - 1];
  return {
    events: slots,
    clicks,
    countInSeconds,
    totalSeconds: last ? last.start + last.length : countInSeconds,
    mfVelocity,
  };
}

type DetailOf = NonNullable<ReturnType<typeof expression.soundingDetails>[number][number]>;
const PLAIN: DetailOf = { fraction: 1, overlap: false, staccato: false };

/**
 * Seconds a note sounds, from the written seconds of its whole tie chain.
 * - Full length (no marking anywhere, or tenuto): the chain less the small release
 *   gap, exactly as before expression existed.
 * - Slurred: the full chain plus the overlap into the next note, no gap.
 * - Staccato: the fraction, but at least the floor and never longer than written.
 * - Plain note in a passage with markings: the fraction (85%), as it is.
 */
export function soundingSeconds(chain: number, detail: DetailOf): number {
  if (detail.overlap) return chain * detail.fraction + expression.slurOverlapSeconds;
  if (detail.staccato) {
    return Math.min(chain, Math.max(detail.fraction * chain, expression.staccatoMinSeconds));
  }
  if (detail.fraction === 1) {
    const gap = Math.min(RELEASE_GAP_MAX, chain * RELEASE_GAP_FRACTION);
    return Math.max(MIN_SOUND_SECONDS, chain - gap);
  }
  return Math.max(MIN_SOUND_SECONDS, chain * detail.fraction);
}
