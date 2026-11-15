import { z } from 'zod';
import type { Duration, TimeSignature } from '@/engine/types';
import { D, checkPool, durationListSchema, simpleTimeSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.1 */
export interface ChooseNoteValueParams {
  kind?: 'note' | 'rest';
  values?: Duration[];
  question?: 'name' | 'beats' | 'longer' | 'shorter' | 'whole-bar';
  options?: number;
  time?: TimeSignature;
}

export const paramsSchema: z.ZodType<ChooseNoteValueParams> = z
  .strictObject({
    kind: z.enum(['note', 'rest']).default('note'),
    values: durationListSchema(2, 6).default([D('crotchet'), D('minim')]),
    question: z.enum(['name', 'beats', 'longer', 'shorter', 'whole-bar']).default('name'),
    options: z.number().int().min(2).max(4).optional(),
    time: simpleTimeSchema.default({ beats: 4, beatUnit: 4 }),
  })
  .superRefine((p, ctx) => {
    checkPool(p.values, ctx, 'values', { rest: p.kind === 'rest' });
    if (p.question === 'whole-bar') {
      if (p.kind !== 'rest') ctx.addIssue({ code: 'custom', path: ['kind'], message: '`whole-bar` is a question about rests' });
    } else if (p.options !== undefined && p.options > p.values.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '`options` cannot exceed the number of `values`' });
    }
  });
