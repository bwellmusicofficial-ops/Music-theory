import { z } from 'zod';
import type { Letter } from '@/engine/types';
import { GRADE_1_TONICS, tonicListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.11 */
export interface PlayScaleOrTriadParams {
  ask: 'scale' | 'degree' | 'triad';
  keys?: Letter[];
  degrees?: number[];
  showLabels?: boolean;
}

export const paramsSchema: z.ZodType<PlayScaleOrTriadParams> = z
  .strictObject({
    ask: z.enum(['scale', 'degree', 'triad']),
    keys: tonicListSchema.default(GRADE_1_TONICS),
    degrees: z.array(z.number().int().min(2).max(8)).min(1).max(7).default([2, 3, 4, 5, 6, 7, 8]),
    showLabels: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.keys).size !== p.keys.length) ctx.addIssue({ code: 'custom', path: ['keys'], message: 'No repeats' });
    if (new Set(p.degrees).size !== p.degrees.length) ctx.addIssue({ code: 'custom', path: ['degrees'], message: 'No repeats' });
  });
