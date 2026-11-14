/**
 * Zod building blocks for the stave-based question types.
 *
 * `face-view/face-schema.ts` keeps its primitives private and its `passageSchema`
 * always demands full bars, but `complete-bar` and `spot-mistake` may break
 * that rule for one named bar (docs/question-payloads.md 1.3, rule 2). So the
 * primitives and a length-free passage schema live here; the length rule is
 * applied by `addBarLengthIssues`, which takes the exempt bar.
 */

import { z } from 'zod';
import { rhythm } from '@/engine/rhythm';
import type { Passage, ScoreEvent } from '@/engine/types';
import { pitch } from '@/engine/pitch';

export const letterSchema = z.enum(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
const accidentalSchema = z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]);
export const pitchClassSchema = z.strictObject({ letter: letterSchema, accidental: accidentalSchema });
export const pitchSchema = z.strictObject({
  letter: letterSchema,
  accidental: accidentalSchema,
  octave: z.number().int(),
});
export const keySchema = z.strictObject({ tonic: pitchClassSchema, mode: z.enum(['major', 'minor']) });
export const clefSchema = z.enum(['treble', 'bass', 'alto', 'tenor']);

const noteValueSchema = z.enum([
  'breve',
  'semibreve',
  'minim',
  'crotchet',
  'quaver',
  'semiquaver',
  'demisemiquaver',
]);
const dotsSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const timeSchema = z.strictObject({
  beats: z.number().int().min(1),
  beatUnit: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
});
const tupletSchema = z.strictObject({
  actual: z.number().int().min(1),
  normal: z.number().int().min(1),
});
const durationSchema = z.strictObject({
  value: noteValueSchema,
  dots: dotsSchema,
  tuplet: tupletSchema.optional(),
});
const noteEventSchema = z.strictObject({
  kind: z.literal('note'),
  pitches: z.array(pitchSchema).min(1),
  duration: durationSchema,
  tieToNext: z.boolean().optional(),
  showAccidental: z.union([z.boolean(), z.array(z.boolean())]).optional(),
});
const restEventSchema = z.strictObject({ kind: z.literal('rest'), duration: durationSchema });
const eventSchema = z.discriminatedUnion('kind', [noteEventSchema, restEventSchema]);
const barSchema = z.strictObject({ events: z.array(eventSchema).min(1) });

type NoteEv = ScoreEvent & { kind: 'note' };
function samePitches(a: NoteEv, b: NoteEv): boolean {
  const names = (e: NoteEv) => e.pitches.map((p) => pitch.formatPitch(p)).sort();
  const left = names(a);
  const right = names(b);
  return left.length === right.length && left.every((n, i) => n === right[i]);
}

/**
 * A passage with every rule of 1.3 except bar length: at least one bar, every
 * bar has an event, every note has a pitch, a tied note is followed by a note
 * with the same pitches, tuplet notes in a run share one ratio.
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

/**
 * Rule 2 of 1.3 with at most one exempt bar. For every other bar a status other
 * than 'complete' is an issue. Returns the status of the exempt bar.
 */
export function addBarLengthIssues(
  passage: Passage,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
  exemptBar: number | null,
): void {
  passage.bars.forEach((bar, index) => {
    if (index === exemptBar) return;
    const check = rhythm.checkBarLength(bar, passage.time);
    if (check.status !== 'complete') {
      ctx.addIssue({
        code: 'custom',
        path: [...basePath, 'bars', index],
        message: `Bar ${index + 1} is ${check.status}: every bar must be exactly full`,
      });
    }
  });
}
