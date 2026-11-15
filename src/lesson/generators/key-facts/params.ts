import { z } from 'zod';
import type { Letter } from '@/engine/types';
import { GRADE_1_TONICS, tonicListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.14 */
export interface KeyFactsParams {
  ask: 'name-key' | 'accidentals' | 'from-triad' | 'degree-note' | 'note-degree';
  keys?: Letter[];
  clef?: 'treble' | 'bass';
  options?: number;
}

const DEGREE_ASKS = ['degree-note', 'note-degree'];

export const paramsSchema: z.ZodType<KeyFactsParams> = z
  .strictObject({
    ask: z.enum(['name-key', 'accidentals', 'from-triad', 'degree-note', 'note-degree']),
    keys: tonicListSchema.default(GRADE_1_TONICS),
    clef: z.enum(['treble', 'bass']).default('treble'),
    options: z.number().int().min(2).max(4).optional(),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.keys).size !== p.keys.length) ctx.addIssue({ code: 'custom', path: ['keys'], message: 'No repeats' });
    if (!DEGREE_ASKS.includes(p.ask)) {
      const options = p.options ?? Math.min(4, p.keys.length);
      if (p.keys.length < 2) ctx.addIssue({ code: 'custom', path: ['keys'], message: 'This question needs at least two keys' });
      if (options > p.keys.length) ctx.addIssue({ code: 'custom', path: ['options'], message: '`options` cannot exceed the number of keys' });
    }
  });
