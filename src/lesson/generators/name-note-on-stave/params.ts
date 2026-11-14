import { z } from 'zod';
import { pitch } from '@/engine/pitch';
import type { Clef, Key, Pitch } from '@/engine/types';
import { clefSchema, keySchema, pitchSchema } from '@/lesson/questions/notation/schemas';

/** docs/question-payloads.md 3.1 */
export interface NameNoteOnStaveParams {
  mode: 'identify' | 'place';
  clef: Clef;
  /** Lowest and highest note that can be drawn, inclusive. Both naturals. */
  low: Pitch;
  high: Pitch;
  /** Limit the draw to notes on lines or in spaces. Default 'all'. */
  positions?: 'all' | 'lines' | 'spaces';
  /** Key signature shown. Default C major. */
  key?: Key;
  /** true: the note may get a sharp or flat of its own. Default false. */
  accidentals?: boolean;
}

export const C_MAJOR: Key = { tonic: { letter: 'C', accidental: 0 }, mode: 'major' };

/** Stave positions from `lo` to `hi`, ascending, filtered by `positions` (even = lines, odd = spaces). */
export function candidatePositions(lo: number, hi: number, positions: 'all' | 'lines' | 'spaces'): number[] {
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) {
    if (positions === 'lines' && p % 2 !== 0) continue;
    if (positions === 'spaces' && p % 2 === 0) continue;
    out.push(p);
  }
  return out;
}

export const paramsSchema: z.ZodType<NameNoteOnStaveParams> = z
  .strictObject({
    mode: z.enum(['identify', 'place']),
    clef: clefSchema,
    low: pitchSchema,
    high: pitchSchema,
    positions: z.enum(['all', 'lines', 'spaces']).default('all'),
    key: keySchema.default(C_MAJOR),
    accidentals: z.boolean().default(false),
  })
  .superRefine((params, ctx) => {
    if (params.low.accidental !== 0) ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` must be a natural' });
    if (params.high.accidental !== 0) ctx.addIssue({ code: 'custom', path: ['high'], message: '`high` must be a natural' });
    if (pitch.comparePitch(params.low, params.high) >= 0) {
      ctx.addIssue({ code: 'custom', path: ['low'], message: '`low` must be below `high`' });
      return;
    }
    const lo = pitch.stavePosition(params.low, params.clef);
    const hi = pitch.stavePosition(params.high, params.clef);
    for (const [name, pos] of [['low', lo], ['high', hi]] as const) {
      if (pos < -4 || pos > 12) {
        ctx.addIssue({ code: 'custom', path: [name], message: `\`${name}\` must be within two ledger lines of the stave (position ${pos})` });
      }
    }
    if (candidatePositions(lo, hi, params.positions).length < 3) {
      ctx.addIssue({ code: 'custom', path: ['positions'], message: 'At least three notes must remain after the `positions` filter' });
    }
  });
