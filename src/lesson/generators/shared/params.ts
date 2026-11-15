import { z } from 'zod';
import { rhythm } from '@/engine/rhythm';
import type { Duration, Letter } from '@/engine/types';
import { letterSchema, plainDurationSchema, timeSchema } from '@/lesson/questions/face-view/face-schema';
import { crotchetBeats, distinctLengths, isQuarterBeat } from './bars';

export const durationListSchema = (min: number, max: number) => z.array(plainDurationSchema).min(min).max(max);

/** A simple time signature of 2 to 4 beats. */
export const simpleTimeSchema = timeSchema.refine(
  (t) => rhythm.metreKind(t) === 'simple' && t.beats >= 2 && t.beats <= 4,
  { message: 'Use a simple time signature of 2, 3 or 4 beats' },
);

export const GRADE_1_TONICS: Letter[] = ['C', 'G', 'D', 'F'];
export const tonicListSchema = z.array(letterSchema).min(1).max(7);

export const clefChoiceSchema = z.enum(['treble', 'bass']);

/** Issues for a pool of durations: different lengths, quarter-beat lengths, rests undotted. */
export function checkPool(values: Duration[], ctx: z.RefinementCtx, path: string, opts: { rest?: boolean } = {}): void {
  if (!distinctLengths(values)) {
    ctx.addIssue({ code: 'custom', path: [path], message: 'The note values must all have different lengths' });
  }
  values.forEach((v, i) => {
    if (!isQuarterBeat(v)) {
      ctx.addIssue({ code: 'custom', path: [path, i], message: 'Lengths must be a whole number of quarter beats' });
    }
    if (opts.rest && v.dots !== 0) {
      ctx.addIssue({ code: 'custom', path: [path, i], message: 'Rests are not dotted at this grade' });
    }
    if (crotchetBeats(v) > 8) {
      ctx.addIssue({ code: 'custom', path: [path, i], message: 'Too long: at most a breve is not needed here' });
    }
  });
}

export const D = (value: Duration['value'], dots: 0 | 1 | 2 = 0): Duration => ({ value, dots });
