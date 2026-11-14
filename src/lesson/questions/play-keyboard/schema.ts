import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import { passageSchema, pitchSchema } from '@/lesson/questions/face-view/face-schema';
import type { PlayKeyboardPayload } from './types';

/** docs/question-payloads.md 2.5 "Validation". */
export const payloadSchema: z.ZodType<PlayKeyboardPayload> = z
  .strictObject({
    low: pitchSchema,
    high: pitchSchema,
    showLabels: z.boolean().default(false),
    targets: z.array(pitchSchema).min(1).max(8),
    mode: z.enum(['sequence', 'together']),
    octave: z.enum(['exact', 'any']),
    passage: passageSchema.optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.low.accidental !== 0) {
      ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` must be a natural (a white key)' });
    }
    if (payload.high.accidental !== 0) {
      ctx.addIssue({ code: 'custom', path: ['high'], message: '`high` must be a natural (a white key)' });
    }
    const low = pitch.toMidi(payload.low);
    const high = pitch.toMidi(payload.high);
    if (low >= high) {
      ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` must be below `high`' });
    }
    payload.targets.forEach((target, index) => {
      const midi = pitch.toMidi(target);
      if (midi < low || midi > high) {
        ctx.addIssue({
          code: 'custom',
          path: ['targets', index],
          message: 'Every target must be within the keyboard range',
        });
      }
    });
    if (payload.mode === 'together') {
      if (payload.targets.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'A chord (`together`) needs at least two targets',
        });
      }
      // With octave 'any' the keys are matched by note name, so two targets with one name would be ambiguous.
      const sounds = payload.targets.map((target) =>
        payload.octave === 'any' ? pitch.chroma(target) : pitch.toMidi(target),
      );
      if (new Set(sounds).size !== sounds.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'No two targets may sound the same',
        });
      }
    }
  });
