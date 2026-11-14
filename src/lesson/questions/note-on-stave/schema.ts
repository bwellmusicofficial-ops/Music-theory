import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import type { Key } from '@/engine/types';
import { clefSchema, keySchema, pitchClassSchema, pitchSchema } from '@/lesson/questions/notation/schemas';
import type { NoteOnStavePayload } from './types';

const signSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const signedPitchClass = z.strictObject({ letter: pitchClassSchema.shape.letter, accidental: signSchema });
const signedPitch = z.strictObject({
  letter: pitchSchema.shape.letter,
  accidental: signSchema,
  octave: z.number().int(),
});

/** Key signature size, or null when the key cannot be written (more than seven sharps or flats). */
function signatureOf(key: Key): number | null {
  try {
    return pitch.keySignature(key);
  } catch {
    return null;
  }
}

function checkKey(
  data: { key: Key; accidentals: boolean },
  ctx: z.RefinementCtx,
): void {
  const signature = signatureOf(data.key);
  if (signature === null) {
    ctx.addIssue({ code: 'custom', path: ['key'], message: 'This is not a key with a signature of up to seven sharps or flats' });
  } else if (!data.accidentals && signature !== 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['key'],
      message: 'When `accidentals` is false the key must be C major or A minor',
    });
  }
}

const identifySchema = z
  .strictObject({
    mode: z.literal('identify'),
    clef: clefSchema,
    key: keySchema,
    pitch: signedPitch,
    accidentals: z.boolean(),
  })
  .superRefine((data, ctx) => {
    checkKey(data, ctx);
    if (!data.accidentals && data.pitch.accidental !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['pitch', 'accidental'],
        message: 'When `accidentals` is false the pitch must have no accidental',
      });
    }
    const position = pitch.stavePosition(data.pitch, data.clef);
    if (position < -4 || position > 12) {
      ctx.addIssue({
        code: 'custom',
        path: ['pitch'],
        message: `The note must sit between the second ledger line below and the second ledger line above the stave (position ${position})`,
      });
    }
  });

const placeSchema = z
  .strictObject({
    mode: z.literal('place'),
    clef: clefSchema,
    key: keySchema,
    target: signedPitchClass,
    octave: z.number().int().optional(),
    accidentals: z.boolean(),
  })
  .superRefine((data, ctx) => {
    checkKey(data, ctx);
    if (!data.accidentals && data.target.accidental !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['target', 'accidental'],
        message: 'When `accidentals` is false the target must have no accidental',
      });
    }
  });

/** docs/question-payloads.md 2.4 */
export const payloadSchema: z.ZodType<NoteOnStavePayload> = z.discriminatedUnion('mode', [
  identifySchema,
  placeSchema,
]);
