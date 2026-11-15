import { z } from 'zod';

/** docs/generators-grade-1.md 3.8 */
export interface SameNoteOtherClefParams {
  from?: 'treble' | 'bass' | 'either';
  options?: number;
}

export const paramsSchema: z.ZodType<SameNoteOtherClefParams> = z.strictObject({
  from: z.enum(['treble', 'bass', 'either']).default('either'),
  options: z.number().int().min(2).max(4).default(3),
});
