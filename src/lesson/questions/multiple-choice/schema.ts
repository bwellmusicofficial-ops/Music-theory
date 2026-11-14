import { z } from 'zod';
import { exhibitSchema, richTextSchema } from '@/lesson/schema';
import { faceSchema, idSchema } from '@/lesson/questions/face-view';
import type { MultipleChoicePayload } from './types';

const optionSchema = z.strictObject({
  id: idSchema,
  face: faceSchema,
  reason: richTextSchema.optional(),
});

export const payloadSchema: z.ZodType<MultipleChoicePayload> = z
  .strictObject({
    exhibit: exhibitSchema.optional(),
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
    });
    if (new Set(payload.options.map((option) => option.face.kind)).size > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'All options in one question must use the same kind of face',
      });
    }
  });
