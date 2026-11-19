import { z } from 'zod';
import { richTextSchema } from '@/lesson/schema';
import { passageSchema, wordCount } from '@/lesson/questions/face-view';
import { MAX_TARGETS, type FindInPassagePayload } from './types';

const MAX_FEATURE_WORDS = 8;

/** docs/question-payloads.md 2.13 */
export const payloadSchema: z.ZodType<FindInPassagePayload> = z
  .strictObject({
    passage: passageSchema,
    select: z.enum(['event', 'bar']),
    targets: z
      .array(z.strictObject({ bar: z.number().int().min(0), event: z.number().int().min(0).optional() }))
      .min(1)
      .max(MAX_TARGETS),
    feature: richTextSchema.refine((text) => wordCount(text) <= MAX_FEATURE_WORDS, {
      message: `The feature is limited to ${MAX_FEATURE_WORDS} words`,
    }),
  })
  .superRefine(({ passage, select, targets }, ctx) => {
    const seen = new Set<string>();
    targets.forEach((target, i) => {
      const path = ['targets', i];
      const bar = passage.bars[target.bar];
      if (!bar) {
        ctx.addIssue({ code: 'custom', path: [...path, 'bar'], message: 'The target `bar` must point at a bar of the passage' });
      } else if (target.event !== undefined && target.event >= bar.events.length) {
        ctx.addIssue({ code: 'custom', path: [...path, 'event'], message: 'The target `event` must point at a note or rest of that bar' });
      }
      if (select === 'event' && target.event === undefined) {
        ctx.addIssue({ code: 'custom', path: [...path, 'event'], message: '`event` is required when `select` is "event"' });
      }
      if (select === 'bar' && target.event !== undefined) {
        ctx.addIssue({ code: 'custom', path: [...path, 'event'], message: '`event` is not allowed when `select` is "bar"' });
      }
      const key = `${target.bar}:${select === 'event' ? target.event : ''}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path, message: 'Two targets are the same place' });
      seen.add(key);
    });
  });
