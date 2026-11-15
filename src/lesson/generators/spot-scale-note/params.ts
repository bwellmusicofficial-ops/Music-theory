import { z } from 'zod';
import type { Letter } from '@/engine/types';
import { GRADE_1_TONICS, tonicListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.15 */
export interface SpotScaleNoteParams {
  keys?: Letter[];
  faults?: ('wrong-letter' | 'missing-sign')[];
  clef?: 'treble' | 'bass';
}

export const paramsSchema: z.ZodType<SpotScaleNoteParams> = z
  .strictObject({
    keys: tonicListSchema.default(GRADE_1_TONICS),
    faults: z.array(z.enum(['wrong-letter', 'missing-sign'])).min(1).max(2).default(['wrong-letter', 'missing-sign']),
    clef: z.enum(['treble', 'bass']).default('treble'),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.keys).size !== p.keys.length) ctx.addIssue({ code: 'custom', path: ['keys'], message: 'No repeats' });
    if (new Set(p.faults).size !== p.faults.length) ctx.addIssue({ code: 'custom', path: ['faults'], message: 'No repeats' });
  });
