import { z } from 'zod';
import type { Duration, TimeSignature } from '@/engine/types';
import { D, checkPool, durationListSchema, simpleTimeSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.5 */
export interface CompleteTheBarParams {
  time?: TimeSignature;
  values?: Duration[];
  missing?: 'note' | 'rest';
  bars?: number;
  paletteSize?: number;
}

export const paramsSchema: z.ZodType<CompleteTheBarParams> = z
  .strictObject({
    time: simpleTimeSchema.default({ beats: 4, beatUnit: 4 }),
    values: durationListSchema(3, 6).default([D('crotchet'), D('minim'), D('semibreve')]),
    missing: z.enum(['note', 'rest']).default('note'),
    bars: z.number().int().min(1).max(3).default(2),
    paletteSize: z.number().int().min(2).max(4).default(3),
  })
  .superRefine((p, ctx) => {
    checkPool(p.values, ctx, 'values', { rest: p.missing === 'rest' });
    if (p.paletteSize > p.values.length) {
      ctx.addIssue({ code: 'custom', path: ['paletteSize'], message: '`paletteSize` cannot exceed the number of `values`' });
    }
  });
