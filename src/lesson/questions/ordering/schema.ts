import { z } from 'zod';
import { richTextSchema } from '@/lesson/schema';
import { faceSchema, idSchema, wordCount } from '@/lesson/questions/face-view';
import type { OrderingPayload } from './types';

const itemSchema = z.strictObject({
  id: idSchema,
  face: faceSchema,
});

export const payloadSchema: z.ZodType<OrderingPayload> = z
  .strictObject({
    items: z.array(itemSchema).min(3).max(6),
    correctOrder: z.array(idSchema),
    ends: z.strictObject({ first: richTextSchema, last: richTextSchema }),
    reason: richTextSchema.refine((text) => wordCount(text) <= 30, {
      message: 'The ordering reason is limited to 30 words',
    }),
  })
  .superRefine((payload, ctx) => {
    const ids = payload.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Item ids must be unique' });
    }

    const sortedIds = [...ids].sort().join('|');
    const sortedCorrect = [...payload.correctOrder].sort().join('|');
    const isPermutation =
      payload.correctOrder.length === ids.length &&
      new Set(payload.correctOrder).size === payload.correctOrder.length &&
      sortedIds === sortedCorrect;
    if (!isPermutation) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctOrder'],
        message: '`correctOrder` must list every item id exactly once',
      });
    }

    if (ids.join('|') === payload.correctOrder.join('|')) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'The items must not start in the correct order',
      });
    }
  });
