import { z } from 'zod';
import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Fraction, Pitch, Rng, ScoreEvent, TimeSignature } from '@/engine/types';
import { plainDurationSchema, timeSchema } from '@/lesson/questions/face-view/face-schema';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';

/** docs/question-payloads.md 3.2 */
export interface TapNoteValuesParams {
  time: TimeSignature;
  /** Note values the rhythm may use. 1 to 6, all different, no tuplets. */
  values: Duration[];
  /** Values that must each appear at least once. Each must also be in `values`. Default []. */
  require?: Duration[];
  /** Number of bars, 1 to 4. */
  bars: number;
  /** Felt beats per minute, 50 to 120. */
  bpm: number;
  /** Passed through to the payload. Defaults: true, false. */
  showNotation?: boolean;
  listenFirst?: boolean;
}

const sameDuration = (a: Duration, b: Duration) => a.value === b.value && a.dots === b.dots;

export const paramsSchema: z.ZodType<TapNoteValuesParams> = z
  .strictObject({
    time: timeSchema,
    values: z.array(plainDurationSchema).min(1).max(6),
    require: z.array(plainDurationSchema).default([]),
    bars: z.number().int().min(1).max(4),
    bpm: z.number().int().min(50).max(120),
    showNotation: z.boolean().default(true),
    listenFirst: z.boolean().default(false),
  })
  .superRefine((params, ctx) => {
    params.values.forEach((value, index) => {
      if (params.values.findIndex((other) => sameDuration(other, value)) !== index) {
        ctx.addIssue({ code: 'custom', path: ['values', index], message: 'Note values must all be different' });
      }
    });
    params.require.forEach((value, index) => {
      if (!params.values.some((other) => sameDuration(other, value))) {
        ctx.addIssue({ code: 'custom', path: ['require', index], message: 'Every required value must also be in `values`' });
      }
    });
    if (rhythm.metreKind(params.time) !== 'simple') {
      ctx.addIssue({ code: 'custom', path: ['time'], message: 'Only simple time is supported for now' });
    }
    if (!params.showNotation && !params.listenFirst) {
      ctx.addIssue({
        code: 'custom',
        path: ['showNotation'],
        message: 'At least one of `showNotation` and `listenFirst` must be true',
      });
    }
  });

const B4: Pitch = { letter: 'B', accidental: 0, octave: 4 };
const ATTEMPTS = 50;

const add = (a: Fraction, b: Fraction): Fraction => rhythm.addFractions(a, b);
const cmp = (a: Fraction, b: Fraction): number => rhythm.compareFractions(a, b);

/** Smallest multiple of `beat` that is greater than `offset`. */
function nextBeat(offset: Fraction, beat: Fraction): Fraction {
  const k = Math.floor((offset.n * beat.d) / (offset.d * beat.n)) + 1;
  return { n: k * beat.n, d: beat.d };
}

function onWholeBeat(offset: Fraction, beat: Fraction): boolean {
  return (offset.n * beat.d) % (offset.d * beat.n) === 0;
}

function generate(params: TapNoteValuesParams, rng: Rng): GeneratedQuestion {
  const { time, values, bars: barCount, bpm } = params;
  const require = params.require ?? [];
  const showNotation = params.showNotation ?? true;
  const listenFirst = params.listenFirst ?? false;
  const beat = rhythm.beatLength(time);
  const full = rhythm.barLength(time);
  const half: Fraction = { n: full.n, d: full.d * 2 };
  const fourFour = time.beats === 4 && time.beatUnit === 4;
  const lengths = values.map((value) => rhythm.durationLength(value));

  /** Rules 1 to 3 of section 3.2. */
  function allowedAt(offset: Fraction): Duration[] {
    const whole = onWholeBeat(offset, beat);
    const beatEnd = whole ? null : nextBeat(offset, beat);
    const inFirstHalf = fourFour && offset.n > 0 && cmp(offset, half) < 0;
    return values.filter((_, index) => {
      const end = add(offset, lengths[index] as Fraction);
      if (cmp(end, full) > 0) return false;
      if (beatEnd && cmp(end, beatEnd) > 0) return false;
      if (inFirstHalf && cmp(end, half) > 0) return false;
      return true;
    });
  }

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const bars: Bar[] = [];
    let abandoned = false;
    for (let b = 0; b < barCount && !abandoned; b += 1) {
      const events: ScoreEvent[] = [];
      let offset: Fraction = { n: 0, d: 1 };
      while (cmp(offset, full) < 0) {
        const allowed = allowedAt(offset);
        if (allowed.length === 0) {
          abandoned = true;
          break;
        }
        const chosen = rng.pick(allowed);
        events.push({ kind: 'note', pitches: [{ ...B4 }], duration: { value: chosen.value, dots: chosen.dots } });
        offset = add(offset, rhythm.durationLength(chosen));
      }
      bars.push({ events });
    }
    if (abandoned) continue;
    const used = bars.flatMap((bar) => bar.events);
    if (require.every((needed) => used.some((event) => sameDuration(event.duration, needed)))) {
      return {
        type: 'tap-rhythm',
        payload: { time, bars, bpm, countInBars: 1, showNotation, listenFirst },
      };
    }
  }
  throw new TheoryError('tap-note-values could not build a rhythm from these params');
}

export const tapNoteValues: QuestionGenerator<TapNoteValuesParams> = {
  id: 'tap-note-values',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
