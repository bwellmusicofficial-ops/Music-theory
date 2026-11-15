import { z } from 'zod';
import type { Duration } from '@/engine/types';
import { D, checkPool, durationListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.18 */
export interface ContrastByEarParams {
  ask: 'higher' | 'lower' | 'direction' | 'step-or-jump' | 'bigger-jump' | 'longer' | 'shorter';
  bpm?: number;
  values?: Duration[];
}

export const paramsSchema: z.ZodType<ContrastByEarParams> = z
  .strictObject({
    ask: z.enum(['higher', 'lower', 'direction', 'step-or-jump', 'bigger-jump', 'longer', 'shorter']),
    bpm: z.number().int().min(40).max(160).default(80),
    values: durationListSchema(2, 3).default([D('semibreve'), D('minim'), D('crotchet')]),
  })
  .superRefine((p, ctx) => {
    checkPool(p.values, ctx, 'values');
    if (p.values.some((v) => v.dots !== 0)) ctx.addIssue({ code: 'custom', path: ['values'], message: 'Plain note values only' });
  });
