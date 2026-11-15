import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Fraction, Key, Passage, Pitch, Rng, ScoreEvent, TimeSignature } from '@/engine/types';

export const B4: Pitch = { letter: 'B', accidental: 0, octave: 4 };
export const T44: TimeSignature = { beats: 4, beatUnit: 4 };
export const C_MAJOR_KEY: Key = { tonic: { letter: 'C', accidental: 0 }, mode: 'major' };

export const sameDuration = (a: Duration, b: Duration): boolean => a.value === b.value && a.dots === b.dots;
export const plain = (d: Duration): Duration => ({ value: d.value, dots: d.dots });
export const dur = (value: Duration['value'], dots: 0 | 1 | 2 = 0): Duration => ({ value, dots });

export const noteEvent = (duration: Duration, pitch: Pitch = B4): ScoreEvent => ({
  kind: 'note',
  pitches: [{ ...pitch }],
  duration: plain(duration),
});
export const restEvent = (duration: Duration): ScoreEvent => ({ kind: 'rest', duration: plain(duration) });

export function rhythmPassage(time: TimeSignature, bars: Bar[]): Passage {
  return { clef: 'treble', key: C_MAJOR_KEY, time, bars };
}

const add = (a: Fraction, b: Fraction): Fraction => rhythm.addFractions(a, b);
const cmp = (a: Fraction, b: Fraction): number => rhythm.compareFractions(a, b);
const ZERO: Fraction = { n: 0, d: 1 };

function nextBeat(offset: Fraction, beat: Fraction): Fraction {
  const k = Math.floor((offset.n * beat.d) / (offset.d * beat.n)) + 1;
  return { n: k * beat.n, d: beat.d };
}
const onWholeBeat = (offset: Fraction, beat: Fraction): boolean => (offset.n * beat.d) % (offset.d * beat.n) === 0;

export interface Candidate {
  kind: 'note' | 'rest';
  duration: Duration;
}

/**
 * The three bar rules of docs/question-payloads.md 3.2: the symbol fits; off the beat it
 * ends by the next beat; in 4/4 a symbol that starts after beat 1 does not cross the middle.
 */
export function allowedAt(offset: Fraction, time: TimeSignature, candidates: Candidate[]): Candidate[] {
  const beat = rhythm.beatLength(time);
  const full = rhythm.barLength(time);
  const half: Fraction = { n: full.n, d: full.d * 2 };
  const fourFour = time.beats === 4 && time.beatUnit === 4;
  const whole = onWholeBeat(offset, beat);
  const beatEnd = whole ? null : nextBeat(offset, beat);
  const inFirstHalf = fourFour && offset.n > 0 && cmp(offset, half) < 0;
  return candidates.filter((c) => {
    const end = add(offset, rhythm.durationLength(c.duration));
    if (cmp(end, full) > 0) return false;
    if (beatEnd && cmp(end, beatEnd) > 0) return false;
    if (inFirstHalf && cmp(end, half) > 0) return false;
    return true;
  });
}

/** One full bar, one `rng.pick` per symbol. Null when no candidate fits (the caller retries). */
export function buildBar(rng: Rng, time: TimeSignature, candidates: Candidate[]): Bar | null {
  const full = rhythm.barLength(time);
  const events: ScoreEvent[] = [];
  let offset = ZERO;
  while (cmp(offset, full) < 0) {
    const allowed = allowedAt(offset, time, candidates);
    if (allowed.length === 0) return null;
    const chosen = rng.pick(allowed);
    events.push(chosen.kind === 'note' ? noteEvent(chosen.duration) : restEvent(chosen.duration));
    offset = add(offset, rhythm.durationLength(chosen.duration));
  }
  return { events };
}

export const noteCandidates = (values: Duration[]): Candidate[] => values.map((duration) => ({ kind: 'note', duration }));

/** `count` full bars of notes from `values`; null when stuck. */
export function buildBars(rng: Rng, time: TimeSignature, values: Duration[], count: number): Bar[] | null {
  const candidates = noteCandidates(values);
  const bars: Bar[] = [];
  for (let i = 0; i < count; i += 1) {
    const bar = buildBar(rng, time, candidates);
    if (!bar) return null;
    bars.push(bar);
  }
  return bars;
}

export const barIsClean = (bar: Bar, time: TimeSignature): boolean => rhythm.groupingProblems(bar, time).length === 0;

/** Length of a duration in crotchet beats, as a number (1 beat = 1/4 of a semibreve). */
export function crotchetBeats(d: Duration): number {
  const len = rhythm.durationLength(d);
  return (len.n * 4) / len.d;
}

/** True when the length is a whole number of quarter beats, so `beats()` writes it as ¼ ½ ¾. */
export const isQuarterBeat = (d: Duration): boolean => Number.isInteger(crotchetBeats(d) * 4);

export const lengthOf = (d: Duration): Fraction => rhythm.durationLength(d);

/** Distinct note lengths. */
export function distinctLengths(values: Duration[]): boolean {
  const seen = new Set(values.map((v) => crotchetBeats(v)));
  return seen.size === values.length;
}
