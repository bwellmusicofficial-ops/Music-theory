import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import type { Pitch } from '@/engine/types';
import { pitchSchema } from '@/lesson/questions/notation/schemas';
import { candidatePositions } from '../name-note-on-stave/params';

/** docs/generators-grade-1.md 3.13 */
export interface AccidentalLastsParams {
  clef?: 'treble' | 'bass';
  across?: 'same-bar' | 'next-bar' | 'either';
  low?: Pitch;
  high?: Pitch;
  options?: number;
}

export const paramsSchema: z.ZodType<AccidentalLastsParams> = z
  .strictObject({
    clef: z.enum(['treble', 'bass']).default('treble'),
    across: z.enum(['same-bar', 'next-bar', 'either']).default('either'),
    low: pitchSchema.optional(),
    high: pitchSchema.optional(),
    options: z.number().int().min(2).max(3).default(3),
  })
  .superRefine((p, ctx) => {
    if ((p.low === undefined) !== (p.high === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['low'], message: 'Give both `low` and `high`, or neither' });
      return;
    }
    if (!p.low || !p.high) return;
    if (p.low.accidental !== 0 || p.high.accidental !== 0) ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` and `high` must be naturals' });
    if (pitch.comparePitch(p.low, p.high) >= 0) {
      ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` must be below `high`' });
      return;
    }
    const lo = pitch.stavePosition(p.low, p.clef);
    const hi = pitch.stavePosition(p.high, p.clef);
    if (lo < -2 || hi > 10) ctx.addIssue({ code: 'custom', path: ['low'], message: 'Stay within one ledger line of the stave, so the other notes fit' });
    if (candidatePositions(lo, hi, 'all').length < 3) ctx.addIssue({ code: 'custom', path: ['high'], message: 'At least three notes are needed' });
  });
