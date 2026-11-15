import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import type { Key, Pitch } from '@/engine/types';
import { clefSchema, keySchema, pitchSchema } from '@/lesson/questions/notation/schemas';
import { C_MAJOR, candidatePositions } from '../name-note-on-stave/params';

/** docs/generators-grade-1.md 3.9 */
export interface PlayWrittenNoteParams {
  clef: 'treble' | 'bass';
  low: Pitch;
  high: Pitch;
  positions?: 'all' | 'lines' | 'spaces';
  key?: Key;
  accidentals?: boolean;
  octaves?: 1 | 2;
  showLabels?: boolean;
}

export const paramsSchema: z.ZodType<PlayWrittenNoteParams> = z
  .strictObject({
    clef: clefSchema.refine((c) => c === 'treble' || c === 'bass', 'Use treble or bass'),
    low: pitchSchema,
    high: pitchSchema,
    positions: z.enum(['all', 'lines', 'spaces']).default('all'),
    key: keySchema.default(C_MAJOR),
    accidentals: z.boolean().default(false),
    octaves: z.union([z.literal(1), z.literal(2)]).default(1),
    showLabels: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.low.accidental !== 0) ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` must be a natural' });
    if (p.high.accidental !== 0) ctx.addIssue({ code: 'custom', path: ['high'], message: '`high` must be a natural' });
    if (pitch.comparePitch(p.low, p.high) >= 0) {
      ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` must be below `high`' });
      return;
    }
    const lo = pitch.stavePosition(p.low, p.clef);
    const hi = pitch.stavePosition(p.high, p.clef);
    for (const [name, pos] of [['low', lo], ['high', hi]] as const) {
      if (pos < -4 || pos > 12) ctx.addIssue({ code: 'custom', path: [name], message: `\`${name}\` must be within two ledger lines of the stave` });
    }
    if (candidatePositions(lo, hi, p.positions).length < 3) {
      ctx.addIssue({ code: 'custom', path: ['positions'], message: 'At least three notes must remain after the `positions` filter' });
    }
  });
