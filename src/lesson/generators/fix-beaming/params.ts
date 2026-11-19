import { z } from 'zod';
import type { Duration, TimeSignature } from '@/engine/types';
import { timeSchema } from '@/lesson/questions/face-view/face-schema';
import { checkPool, durationListSchema } from '../shared/params';

export const FAULTS = ['together', 'split', 'middle', 'beat'] as const;
export type BeamFault = (typeof FAULTS)[number];

/** docs/generators-grade-1.md 3.22 */
export interface FixBeamingParams {
  time?: TimeSignature;
  values?: Duration[];
  faults?: BeamFault[];
  melody?: 'rhythm' | 'tune';
}

const ALLOWED_TIMES = ['2/4', '3/4', '4/4', '6/8'];

export const paramsSchema: z.ZodType<FixBeamingParams> = z
  .strictObject({
    time: timeSchema
      .refine((t) => ALLOWED_TIMES.includes(`${t.beats}/${t.beatUnit}`), { message: 'Use 2/4, 3/4, 4/4 or 6/8' })
      .default({ beats: 4, beatUnit: 4 }),
    values: durationListSchema(2, 6).optional(),
    faults: z.array(z.enum(FAULTS)).min(1).max(4).optional(),
    melody: z.enum(['rhythm', 'tune']).default('rhythm'),
  })
  .superRefine((p, ctx) => {
    if (p.values) checkPool(p.values, ctx, 'values');
    if (p.faults && new Set(p.faults).size !== p.faults.length) ctx.addIssue({ code: 'custom', path: ['faults'], message: 'List each fault once' });
    if (p.faults?.includes('middle') && !(p.time.beats === 4 && p.time.beatUnit === 4)) {
      ctx.addIssue({ code: 'custom', path: ['faults'], message: '`middle` is for 4/4 only' });
    }
  });
