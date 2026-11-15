import { z } from 'zod';
import type { Letter } from '@/engine/types';
import { GRADE_1_TONICS, tonicListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.16 */
export interface IntervalByNumberParams {
  keys?: Letter[];
  numbers?: number[];
  clef?: 'treble' | 'bass';
  options?: number;
}

export const paramsSchema: z.ZodType<IntervalByNumberParams> = z
  .strictObject({
    keys: tonicListSchema.default(GRADE_1_TONICS),
    numbers: z.array(z.number().int().min(2).max(8)).min(1).max(7).default([2, 3, 4, 5, 6, 7, 8]),
    clef: z.enum(['treble', 'bass']).default('treble'),
    options: z.number().int().min(2).max(4).default(3),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.keys).size !== p.keys.length) ctx.addIssue({ code: 'custom', path: ['keys'], message: 'No repeats' });
    if (new Set(p.numbers).size !== p.numbers.length) ctx.addIssue({ code: 'custom', path: ['numbers'], message: 'No repeats' });
  });
