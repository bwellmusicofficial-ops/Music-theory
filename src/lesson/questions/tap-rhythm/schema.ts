import { z } from 'zod';
import { rhythm } from '@/engine/rhythm';
import { pitch } from '@/engine/pitch';
import type { Bar, ScoreEvent } from '@/engine/types';
import type { TapRhythmPayload } from './types';

const letterSchema = z.enum(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
const accidentalSchema = z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]);
const pitchSchema = z.strictObject({ letter: letterSchema, accidental: accidentalSchema, octave: z.number().int() });
const noteValueSchema = z.enum(['breve', 'semibreve', 'minim', 'crotchet', 'quaver', 'semiquaver', 'demisemiquaver']);
const dotsSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
/** No tuplets in Phase 0 (2.6), so the duration has no `tuplet` key at all. */
const durationSchema = z.strictObject({ value: noteValueSchema, dots: dotsSchema });
const eventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('note'),
    pitches: z.array(pitchSchema).min(1),
    duration: durationSchema,
    tieToNext: z.boolean().optional(),
    showAccidental: z.union([z.boolean(), z.array(z.boolean())]).optional(),
  }),
  z.strictObject({ kind: z.literal('rest'), duration: durationSchema }),
]);
const barSchema = z.strictObject({ events: z.array(eventSchema).min(1) });
const timeSchema = z.strictObject({
  beats: z.number().int().min(1),
  beatUnit: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
});

const spell = (event: ScoreEvent & { kind: 'note' }) =>
  event.pitches.map((p) => pitch.formatPitch(p)).sort().join('|');

/** docs/question-payloads.md 2.6 "Validation" and the passage rules in 1.3. */
export const payloadSchema: z.ZodType<TapRhythmPayload> = z
  .strictObject({
    time: timeSchema,
    bars: z.array(barSchema).min(1).max(4),
    bpm: z.number().int().min(50).max(120),
    countInBars: z.union([z.literal(1), z.literal(2)]).default(1),
    showNotation: z.boolean(),
    listenFirst: z.boolean(),
    toleranceMs: z.number().min(60).max(250).default(150),
  })
  .superRefine((payload, ctx) => {
    try {
      rhythm.beatLength(payload.time);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['time'], message: 'This time signature has no felt beat the pad can click' });
    }
    payload.bars.forEach((bar, index) => {
      const check = rhythm.checkBarLength(bar as Bar, payload.time);
      if (check.status !== 'complete') {
        ctx.addIssue({
          code: 'custom',
          path: ['bars', index],
          message: `Bar ${index + 1} is ${check.status}: every bar must be exactly full`,
        });
      }
    });
    const events = payload.bars.flatMap((bar) => bar.events);
    if (!events.some((event) => event.kind === 'note')) {
      ctx.addIssue({ code: 'custom', path: ['bars'], message: 'The rhythm needs at least one note to tap' });
    }
    events.forEach((event, index) => {
      if (event.kind !== 'note' || !event.tieToNext) return;
      const next = events[index + 1];
      if (!next || next.kind !== 'note' || spell(next as ScoreEvent & { kind: 'note' }) !== spell(event as ScoreEvent & { kind: 'note' })) {
        ctx.addIssue({
          code: 'custom',
          path: ['bars'],
          message: `Tied note ${index + 1} must be followed by a note with the same pitches`,
        });
      }
    });
    if (!payload.showNotation && !payload.listenFirst) {
      ctx.addIssue({
        code: 'custom',
        path: ['showNotation'],
        message: 'At least one of `showNotation` and `listenFirst` must be true',
      });
    }
  });
