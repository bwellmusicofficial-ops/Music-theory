import { z } from 'zod';
import type { Duration, TimeSignature } from '@/engine/types';
import { D, checkPool, durationListSchema, simpleTimeSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.21 */
export interface PlaceBarLinesParams {
  time?: TimeSignature;
  values?: Duration[];
  bars?: number;
  melody?: 'rhythm' | 'tune';
}

export const paramsSchema: z.ZodType<PlaceBarLinesParams> = z
  .strictObject({
    time: simpleTimeSchema.default({ beats: 4, beatUnit: 4 }),
    values: durationListSchema(2, 6).default([D('crotchet'), D('minim')]),
    bars: z.number().int().min(2).max(3).default(3),
    melody: z.enum(['rhythm', 'tune']).default('rhythm'),
  })
  .superRefine((p, ctx) => checkPool(p.values, ctx, 'values'));
