import { z } from 'zod';
import { richTextSchema } from '@/lesson/schema';
import { faceSchema, idSchema, passageSchema } from '@/lesson/questions/face-view';
import type { ByEarPayload } from './types';

const clipSchema = z.strictObject({
  passage: passageSchema,
  bpm: z.number().int().min(40).max(160),
});

const optionSchema = z.strictObject({
  id: idSchema,
  face: faceSchema,
  reason: richTextSchema.optional(),
});

const CLIP_LABELS = ['A', 'B', 'C'] as const;

/** docs/question-payloads.md 2.7 "Validation": as multiple-choice, plus 1 to 3 clips and exact clip labels. */
export const payloadSchema: z.ZodType<ByEarPayload> = z
  .strictObject({
    clips: z.array(clipSchema).min(1).max(3),
    options: z.array(optionSchema).min(2).max(4),
    correct: idSchema,
  })
  .superRefine((payload, ctx) => {
    const ids = payload.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option ids must be unique' });
    }
    if (!ids.includes(payload.correct)) {
      ctx.addIssue({ code: 'custom', path: ['correct'], message: '`correct` must be the id of an option' });
    }
    payload.options.forEach((option, index) => {
      if (option.id === payload.correct) {
        if (option.reason !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['options', index, 'reason'],
            message: 'The correct option must not have a reason',
          });
        }
      } else if (option.reason === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index, 'reason'],
          message: 'Every wrong option needs a reason',
        });
      }
      if (option.face.kind === 'text' && /\bclips?\b/i.test(option.face.text)) {
        const allowed = payload.clips.length >= 2 ? CLIP_LABELS.slice(0, payload.clips.length).map((l) => `Clip ${l}`) : [];
        if (!allowed.includes(option.face.text)) {
          ctx.addIssue({
            code: 'custom',
            path: ['options', index, 'face', 'text'],
            message:
              allowed.length === 0
                ? 'Options cannot refer to clips when there is only one clip'
                : `An option that refers to a clip must read exactly ${allowed.map((a) => `"${a}"`).join(', ')}`,
          });
        }
      }
    });
    if (new Set(payload.options.map((option) => option.face.kind)).size > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'All options in one question must use the same kind of face',
      });
    }
  });
