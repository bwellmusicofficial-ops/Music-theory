import { z } from 'zod';
import type { Duration, TimeSignature } from '@/engine/types';
import { D, checkPool, durationListSchema, simpleTimeSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.6 */
export interface SpotTheBarParams {
  time?: TimeSignature;
  values?: Duration[];
  bars?: number;
  fault?: 'short' | 'long' | 'either';
}

export const paramsSchema: z.ZodType<SpotTheBarParams> = z
  .strictObject({
    time: simpleTimeSchema.default({ beats: 4, beatUnit: 4 }),
    values: durationListSchema(2, 6).default([D('crotchet'), D('minim')]),
    bars: z.number().int().min(3).max(4).default(3),
    fault: z.enum(['short', 'long', 'either']).default('either'),
  })
  .superRefine((p, ctx) => checkPool(p.values, ctx, 'values'));
