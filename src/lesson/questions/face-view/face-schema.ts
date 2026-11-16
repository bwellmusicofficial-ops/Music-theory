/**
 * Zod schemas for `Face`, `Glyph` and `Passage` (docs/question-payloads.md 1.2 and 1.3).
 *
 * Lives in face-view/ because src/lesson/questions/shared.ts is a contract file
 * that this task may not edit. The three question types import from here.
 */

import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import { rhythm } from '@/engine/rhythm';
import type { Passage, ScoreEvent } from '@/engine/types';
import { richTextSchema } from '@/lesson/schema';
import type { Face, Glyph } from '@/lesson/questions/shared';

/** Ids inside payloads: kebab-case, unique within their array (checked by each schema). */
export const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const letterSchema = z.enum(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
export const accidentalSchema = z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]);
export const noteValueSchema = z.enum([
  'breve',
  'semibreve',
  'minim',
  'crotchet',
  'quaver',
  'semiquaver',
  'demisemiquaver',
]);
export const dotsSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const pitchClassSchema = z.strictObject({ letter: letterSchema, accidental: accidentalSchema });
export const pitchSchema = z.strictObject({
  letter: letterSchema,
  accidental: accidentalSchema,
  octave: z.number().int(),
});
export const clefSchema = z.enum(['treble', 'bass', 'alto', 'tenor']);
export const keySchema = z.strictObject({ tonic: pitchClassSchema, mode: z.enum(['major', 'minor']) });
export const timeSchema = z.strictObject({
  beats: z.number().int().min(1),
  beatUnit: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
});
export const tupletSchema = z.strictObject({
  actual: z.number().int().min(1),
  normal: z.number().int().min(1),
});
export const durationSchema = z.strictObject({
  value: noteValueSchema,
  dots: dotsSchema,
  tuplet: tupletSchema.optional(),
});
/** A note value with dots and no tuplet: glyphs, tap-rhythm and generator params. */
export const plainDurationSchema = z.strictObject({ value: noteValueSchema, dots: dotsSchema });

const noteEventSchema = z.strictObject({
  kind: z.literal('note'),
  pitches: z.array(pitchSchema).min(1),
  duration: durationSchema,
  tieToNext: z.boolean().optional(),
  showAccidental: z.union([z.boolean(), z.array(z.boolean())]).optional(),
});
const restEventSchema = z.strictObject({ kind: z.literal('rest'), duration: durationSchema });
export const eventSchema = z.discriminatedUnion('kind', [noteEventSchema, restEventSchema]);
export const barSchema = z.strictObject({ events: z.array(eventSchema).min(1) });

function samePitches(a: ScoreEvent & { kind: 'note' }, b: ScoreEvent & { kind: 'note' }): boolean {
  const names = (event: ScoreEvent & { kind: 'note' }) => event.pitches.map((p) => pitch.formatPitch(p)).sort();
  const left = names(a);
  const right = names(b);
  return left.length === right.length && left.every((name, i) => name === right[i]);
}

/**
 * A passage's structure without the bar-length rule: at least one bar, every
 * bar has an event, a tied note is followed by a note with the same pitches,
 * consecutive tuplet notes share one ratio. `complete-bar` and `spot-mistake`
 * build on this because they may break the length rule for one named bar.
 */
export const passageShapeSchema: z.ZodType<Passage> = z
  .strictObject({
    clef: clefSchema,
    key: keySchema,
    time: timeSchema,
    bars: z.array(barSchema).min(1),
  })
  .superRefine((passage, ctx) => {
    const events = passage.bars.flatMap((bar) => bar.events);
    events.forEach((event, index) => {
      if (event.kind !== 'note' || !event.tieToNext) return;
      const next = events[index + 1];
      if (!next || next.kind !== 'note' || !samePitches(event, next)) {
        ctx.addIssue({
          code: 'custom',
          path: ['bars'],
          message: `Tied note ${index + 1} must be followed by a note with the same pitches`,
        });
      }
    });

    passage.bars.forEach((bar, index) => {
      let previous: { actual: number; normal: number } | null = null;
      for (const event of bar.events) {
        const tuplet = event.duration.tuplet;
        if (!tuplet) {
          previous = null;
          continue;
        }
        if (previous && (previous.actual !== tuplet.actual || previous.normal !== tuplet.normal)) {
          ctx.addIssue({
            code: 'custom',
            path: ['bars', index],
            message: 'Consecutive tuplet notes in one bar must share one tuplet ratio',
          });
        }
        previous = tuplet;
      }
    });
  });

/** A passage in a payload: the structure above, and every bar exactly full (1.3). */
export const passageSchema: z.ZodType<Passage> = passageShapeSchema.superRefine((passage, ctx) => {
  passage.bars.forEach((bar, index) => {
    const check = rhythm.checkBarLength(bar, passage.time);
    if (check.status !== 'complete') {
      ctx.addIssue({
        code: 'custom',
        path: ['bars', index],
        message: `Bar ${index + 1} is ${check.status}: every bar must be exactly full`,
      });
    }
  });
});

/** A single note or rest drawn on its own. Tuplets are not allowed (2.1 and 1.2). */
export const glyphSchema: z.ZodType<Glyph> = z.strictObject({
  kind: z.enum(['note', 'rest']),
  duration: plainDurationSchema,
});

/** One face: plain text, one glyph or one passage. */
export const faceSchema: z.ZodType<Face> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: richTextSchema }),
  z.strictObject({ kind: z.literal('glyph'), glyph: glyphSchema }),
  z.strictObject({
    kind: z.literal('passage'),
    passage: passageSchema,
    /** Draw the stave without its clef. Default false. */
    hideClef: z.boolean().optional(),
    /** Draw the bars without the time signature. Default false. */
    hideTime: z.boolean().optional(),
  }),
]);
