import { z } from 'zod';
import { richTextSchema } from '@/lesson/schema';
import { faceSchema, idSchema } from '@/lesson/questions/face-view';
import type { MatchUpPayload } from './types';

const leftSchema = z.strictObject({
  id: idSchema,
  face: faceSchema,
  match: idSchema,
  reason: richTextSchema,
});

const rightSchema = z.strictObject({
  id: idSchema,
  face: faceSchema,
});

export const payloadSchema: z.ZodType<MatchUpPayload> = z
  .strictObject({
    left: z.array(leftSchema).min(3).max(5),
    right: z.array(rightSchema),
  })
  .superRefine((payload, ctx) => {
    const { left, right } = payload;
    if (right.length !== left.length) {
      ctx.addIssue({ code: 'custom', path: ['right'], message: '`right` must have as many items as `left`' });
    }

    const leftIds = left.map((item) => item.id);
    if (new Set(leftIds).size !== leftIds.length) {
      ctx.addIssue({ code: 'custom', path: ['left'], message: 'Left item ids must be unique' });
    }
    const rightIds = right.map((item) => item.id);
    if (new Set(rightIds).size !== rightIds.length) {
      ctx.addIssue({ code: 'custom', path: ['right'], message: 'Right item ids must be unique' });
    }

    const rightIdSet = new Set(rightIds);
    left.forEach((item, index) => {
      if (!rightIdSet.has(item.match)) {
        ctx.addIssue({
          code: 'custom',
          path: ['left', index, 'match'],
          message: '`match` must be the id of a right item',
        });
      }
    });

    const matches = left.map((item) => item.match);
    if (new Set(matches).size !== matches.length) {
      ctx.addIssue({ code: 'custom', path: ['left'], message: 'No two left items may share a `match`' });
    }

    const misplaced = left.filter((item, index) => right[index]?.id !== item.match).length;
    if (right.length === left.length && misplaced < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['right'],
        message: 'The right items must not already be in matching order (at least two must differ)',
      });
    }
  });
