import { z } from 'zod';
import type { Duration } from '@/engine/types';
import { D, checkPool, durationListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.2 */
export interface MatchNoteValuesParams {
  kind?: 'note' | 'rest';
  values?: Duration[];
  match?: 'beats' | 'name';
}

export const paramsSchema: z.ZodType<MatchNoteValuesParams> = z
  .strictObject({
    kind: z.enum(['note', 'rest']).default('note'),
    values: durationListSchema(3, 5).default([D('crotchet'), D('minim'), D('semibreve')]),
    match: z.enum(['beats', 'name']).default('beats'),
  })
  .superRefine((p, ctx) => checkPool(p.values, ctx, 'values', { rest: p.kind === 'rest' }));
