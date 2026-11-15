import { z } from 'zod';
import type { Letter } from '@/engine/types';
import { GRADE_1_TONICS, tonicListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.17 */
export interface IntervalPlaceParams {
  keys?: Letter[];
  numbers?: number[];
  clef?: 'treble' | 'bass';
}

export const paramsSchema: z.ZodType<IntervalPlaceParams> = z
  .strictObject({
    keys: tonicListSchema.default(GRADE_1_TONICS),
    numbers: z.array(z.number().int().min(2).max(7)).min(1).max(6).default([2, 3, 4, 5, 6, 7]),
    clef: z.enum(['treble', 'bass']).default('treble'),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.keys).size !== p.keys.length) ctx.addIssue({ code: 'custom', path: ['keys'], message: 'No repeats' });
    if (new Set(p.numbers).size !== p.numbers.length) ctx.addIssue({ code: 'custom', path: ['numbers'], message: 'No repeats' });
  });
