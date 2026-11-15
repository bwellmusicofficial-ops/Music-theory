import { z } from 'zod';
import type { Duration, TimeSignature } from '@/engine/types';
import { durationListSchema, simpleTimeSchema } from '../shared/params';

/** docs/generators-grade-1.md 3.7 */
export interface TapRestsAndTiesParams {
  time: TimeSignature;
  values: Duration[];
  rests?: Duration[];
  ties?: boolean;
  bars: number;
  bpm: number;
  showNotation?: boolean;
  listenFirst?: boolean;
}

export const paramsSchema: z.ZodType<TapRestsAndTiesParams> = z
  .strictObject({
    time: simpleTimeSchema,
    values: durationListSchema(1, 4),
    rests: durationListSchema(0, 3).default([]),
    ties: z.boolean().default(false),
    bars: z.number().int().min(1).max(4),
    bpm: z.number().int().min(50).max(120),
    showNotation: z.boolean().default(true),
    listenFirst: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (p.rests.length === 0 && !p.ties) issue('rests', 'Give `rests`, or turn `ties` on; use tap-note-values otherwise');
    if (p.rests.some((r) => r.dots !== 0)) issue('rests', 'Rests are not dotted at this grade');
    if (p.ties && p.bars < 2) issue('bars', 'A tie across a bar line needs at least 2 bars');
    if (!p.showNotation && !p.listenFirst) issue('showNotation', 'At least one of `showNotation` and `listenFirst` must be true');
  });
