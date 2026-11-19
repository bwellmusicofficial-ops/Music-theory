/**
 * Zod schemas for `Face`, `Glyph` and `Passage` (docs/question-payloads.md 1.2 and 1.3).
 *
 * Lives in face-view/ because src/lesson/questions/shared.ts is a contract file
 * that this task may not edit. The three question types import from here.
 */

import { z } from 'zod';
import { expression } from '@/engine/expression';
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

export const articulationSchema = z.enum(['staccato', 'accent', 'tenuto']);
export const endBarlineSchema = z.enum(['single', 'double', 'final', 'repeat-end']);
export const barMarkerSchema = z.enum(['segno', 'fine', 'dc', 'dc-al-fine', 'ds', 'ds-al-fine']);
export const dynamicLevelSchema = z.enum(['pp', 'p', 'mp', 'mf', 'f', 'ff']);

const noteEventSchema = z.strictObject({
  kind: z.literal('note'),
  pitches: z.array(pitchSchema).min(1),
  duration: durationSchema,
  tieToNext: z.boolean().optional(),
  showAccidental: z.union([z.boolean(), z.array(z.boolean())]).optional(),
  articulations: z.array(articulationSchema).optional(),
  fermata: z.boolean().optional(),
});
const restEventSchema = z.strictObject({
  kind: z.literal('rest'),
  duration: durationSchema,
  fermata: z.boolean().optional(),
});
export const eventSchema = z.discriminatedUnion('kind', [noteEventSchema, restEventSchema]);
export const barSchema = z.strictObject({
  events: z.array(eventSchema).min(1),
  repeatStart: z.boolean().optional(),
  endBarline: endBarlineSchema.optional(),
  marker: barMarkerSchema.optional(),
  beams: z.array(z.array(z.number().int().min(0))).optional(),
});

// Expression (docs/expression.md). Shape only: the rules (refs point at events, ranges, overlaps,
// repeat structure) are `expression.validateExpression`, called from passageShapeSchema below.
const eventRefSchema = z.strictObject({ bar: z.number().int().min(0), event: z.number().int().min(0) });
const eventSpanShape = { from: eventRefSchema, to: eventRefSchema };

export const expressionSchema = z.strictObject({
  dynamics: z.array(z.strictObject({ at: eventRefSchema, level: dynamicLevelSchema })).optional(),
  hairpins: z.array(z.strictObject({ ...eventSpanShape, kind: z.enum(['cresc', 'dim']) })).optional(),
  slurs: z.array(z.strictObject(eventSpanShape)).optional(),
  tempo: z
    .strictObject({ text: z.string().optional(), bpm: z.number().optional(), beat: durationSchema.optional() })
    .optional(),
  tempoChanges: z
    .array(
      z.union([
        z.strictObject({ ...eventSpanShape, kind: z.enum(['accel', 'rit', 'rall']), toBpm: z.number().optional() }),
        z.strictObject({ at: eventRefSchema, kind: z.literal('a-tempo') }),
      ]),
    )
    .optional(),
  words: z
    .array(
      z.strictObject({
        at: eventRefSchema,
        text: z.string(),
        place: z.enum(['above', 'below']).optional(),
        lang: z.enum(['it', 'en', 'fr', 'de']).optional(),
      }),
    )
    .optional(),
});

const BEAMABLE_VALUES = new Set(['quaver', 'semiquaver', 'demisemiquaver']);

function samePitches(a: ScoreEvent & { kind: 'note' }, b: ScoreEvent & { kind: 'note' }): boolean {
  const names = (event: ScoreEvent & { kind: 'note' }) => event.pitches.map((p) => pitch.formatPitch(p)).sort();
  const left = names(a);
  const right = names(b);
  return left.length === right.length && left.every((name, i) => name === right[i]);
}

/**
 * A passage's structure without the bar-length rule: at least one bar, every
 * bar has an event, a tied note is followed by a note with the same pitches,
 * consecutive tuplet notes share one ratio, and the expression markings obey
 * `expression.validateExpression`. `complete-bar` and `spot-mistake`
 * build on this because they may break the length rule for one named bar.
 */
export const passageShapeSchema: z.ZodType<Passage> = z
  .strictObject({
    clef: clefSchema,
    key: keySchema,
    time: timeSchema,
    bars: z.array(barSchema).min(1),
    expression: expressionSchema.optional(),
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

    // Written beams (docs/question-types-2.md 1.1): groups of 2+ consecutive ascending notes of quaver or shorter.
    passage.bars.forEach((bar, index) => {
      if (!bar.beams) return;
      const used = new Set<number>();
      bar.beams.forEach((group, g) => {
        const where = ['bars', index, 'beams', g];
        if (group.length < 2) {
          ctx.addIssue({ code: 'custom', path: where, message: `Bar ${index + 1}: a beam group needs at least two notes` });
        }
        group.forEach((i, k) => {
          if (k > 0 && i !== group[k - 1] + 1) {
            ctx.addIssue({ code: 'custom', path: where, message: `Bar ${index + 1}: beam group ${g + 1} must be consecutive ascending event indexes` });
          }
          const event = bar.events[i];
          if (!event) {
            ctx.addIssue({ code: 'custom', path: where, message: `Bar ${index + 1}: beam group ${g + 1} names event ${i}, which does not exist` });
          } else if (event.kind !== 'note' || !BEAMABLE_VALUES.has(event.duration.value)) {
            ctx.addIssue({ code: 'custom', path: where, message: `Bar ${index + 1}: beam group ${g + 1} includes event ${i}, which is not a note of quaver or shorter` });
          }
          if (used.has(i)) {
            ctx.addIssue({ code: 'custom', path: where, message: `Bar ${index + 1}: event ${i} is in two beam groups` });
          }
          used.add(i);
        });
      });
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

    // Dynamics, hairpins, slurs, tempo, repeats and signs (docs/expression.md section 2).
    for (const message of expression.validateExpression(passage as Passage)) {
      ctx.addIssue({ code: 'custom', path: [], message });
    }
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
