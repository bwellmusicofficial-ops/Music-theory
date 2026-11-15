import { z } from 'zod';
import type { Duration } from '@/engine/types';
import { D, checkPool, durationListSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.3 */
export interface OrderNoteValuesParams {
  kind?: 'note' | 'rest';
  values?: Duration[];
  count?: number;
  direction?: 'shortest-first' | 'longest-first' | 'either';
}

export const paramsSchema: z.ZodType<OrderNoteValuesParams> = z
  .strictObject({
    kind: z.enum(['note', 'rest']).default('note'),
    values: durationListSchema(3, 6).default([D('crotchet'), D('minim'), D('semibreve')]),
    count: z.number().int().min(3).max(6).optional(),
    direction: z.enum(['shortest-first', 'longest-first', 'either']).default('shortest-first'),
  })
  .superRefine((p, ctx) => {
    checkPool(p.values, ctx, 'values', { rest: p.kind === 'rest' });
    if (p.count !== undefined && p.count > p.values.length) {
      ctx.addIssue({ code: 'custom', path: ['count'], message: '`count` cannot exceed the number of `values`' });
    }
  });
