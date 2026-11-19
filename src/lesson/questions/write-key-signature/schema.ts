import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import { clefSchema, keySchema } from '@/lesson/questions/notation/schemas';
import type { WriteKeySignaturePayload } from './types';

/** docs/question-payloads.md 2.12 */
export const payloadSchema: z.ZodType<WriteKeySignaturePayload> = z
  .strictObject({
    clef: clefSchema,
    key: keySchema,
    placement: z.enum(['standard', 'any-octave']).default('standard'),
  })
  .superRefine((payload, ctx) => {
    let signature: number | null = null;
    try {
      signature = pitch.keySignature(payload.key);
    } catch {
      /* reported below */
    }
    if (signature === null || signature === 0 || Math.abs(signature) > 7) {
      ctx.addIssue({
        code: 'custom',
        path: ['key'],
        message: 'The key must have 1 to 7 sharps or flats (not C major or A minor)',
      });
    }
  });
