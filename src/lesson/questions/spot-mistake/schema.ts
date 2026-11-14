import { z } from 'zod';
import { richTextSchema } from '@/lesson/schema';
import { passageSchema, wordCount } from '@/lesson/questions/face-view';
import { addBarLengthIssues, passageShapeSchema } from '@/lesson/questions/notation/schemas';
import type { SpotMistakePayload } from './types';

const clipSchema = z.strictObject({
  passage: passageSchema,
  bpm: z.number().int().min(40).max(160),
});

const MAX_EXPLANATION_WORDS = 40;

/** docs/question-payloads.md 2.9 */
export const payloadSchema: z.ZodType<SpotMistakePayload> = z
  .strictObject({
    passage: passageShapeSchema,
    select: z.enum(['bar', 'event']),
    mistake: z.strictObject({
      bar: z.number().int().min(0),
      event: z.number().int().min(0).optional(),
    }),
    explanation: richTextSchema.refine((text) => wordCount(text) <= MAX_EXPLANATION_WORDS, {
      message: `The explanation is limited to ${MAX_EXPLANATION_WORDS} words`,
    }),
    reference: clipSchema.optional(),
  })
  .superRefine((payload, ctx) => {
    const { passage, select, mistake } = payload;
    const bar = passage.bars[mistake.bar];
    if (select === 'bar') {
      if (passage.bars.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['passage', 'bars'], message: 'With `select: "bar"` the passage needs at least two bars' });
      }
      if (mistake.event !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['mistake', 'event'], message: '`mistake.event` is not allowed when `select` is "bar"' });
      }
    } else {
      const total = passage.bars.reduce((sum, b) => sum + b.events.length, 0);
      if (total < 3) {
        ctx.addIssue({ code: 'custom', path: ['passage', 'bars'], message: 'With `select: "event"` the passage needs at least three notes and rests' });
      }
      if (mistake.event === undefined) {
        ctx.addIssue({ code: 'custom', path: ['mistake', 'event'], message: '`mistake.event` is required when `select` is "event"' });
      }
    }
    if (!bar) {
      ctx.addIssue({ code: 'custom', path: ['mistake', 'bar'], message: '`mistake.bar` must point at a bar of the passage' });
    } else if (mistake.event !== undefined && mistake.event >= bar.events.length) {
      ctx.addIssue({ code: 'custom', path: ['mistake', 'event'], message: '`mistake.event` must point at a note or rest of that bar' });
    }
    addBarLengthIssues(passage, ctx, ['passage'], select === 'bar' && bar ? mistake.bar : null);
  });
