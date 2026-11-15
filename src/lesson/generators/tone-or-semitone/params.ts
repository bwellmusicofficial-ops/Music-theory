import { z } from 'zod';
import type { Letter } from '@/engine/types';
import { GRADE_1_TONICS, tonicListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.12 */
export interface ToneOrSemitoneParams {
  source?: 'keyboard' | 'major-scale';
  keys?: Letter[];
}

export const paramsSchema: z.ZodType<ToneOrSemitoneParams> = z.strictObject({
  source: z.enum(['keyboard', 'major-scale']).default('keyboard'),
  keys: tonicListSchema.default(GRADE_1_TONICS),
});
