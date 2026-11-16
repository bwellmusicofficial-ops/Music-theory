import { z } from 'zod';
import type { Duration, TimeSignature } from '@/engine/types';
import { crotchetBeats, isQuarterBeat } from '../shared/bars';
import { D, durationListSchema } from '../shared/params';
import { timeSchema } from '@/lesson/questions/face-view/face-schema';

/** docs/generators-grade-1.md 3.4 */
export interface CountBeatsParams {
  ask?: 'dotted' | 'tie' | 'exchange' | 'fits' | 'meaning';
  values?: Duration[];
  times?: TimeSignature[];
  options?: number;
  /** `fits` only: show the bar as notation with its time signature hidden, not as a list in words. Default false. */
  showBar?: boolean;
}

export const DEFAULT_TIMES: TimeSignature[] = [
  { beats: 2, beatUnit: 4 },
  { beats: 3, beatUnit: 4 },
  { beats: 4, beatUnit: 4 },
];

/** Pairs (big, small) from the pool whose lengths are in a ratio of 2 to 8. */
export function exchangePairs(values: Duration[]): { big: Duration; small: Duration; ratio: number }[] {
  const out: { big: Duration; small: Duration; ratio: number }[] = [];
  for (const big of values) {
    for (const small of values) {
      const ratio = crotchetBeats(big) / crotchetBeats(small);
      if (Number.isInteger(ratio) && ratio >= 2 && ratio <= 8) out.push({ big, small, ratio });
    }
  }
  return out;
}

export const paramsSchema: z.ZodType<CountBeatsParams> = z
  .strictObject({
    ask: z.enum(['dotted', 'tie', 'exchange', 'fits', 'meaning']).default('dotted'),
    values: durationListSchema(1, 5).default([D('crotchet'), D('minim'), D('quaver')]),
    times: z.array(timeSchema).min(2).max(3).default(DEFAULT_TIMES),
    options: z.number().int().min(2).max(4).optional(),
    showBar: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (new Set(p.values.map((v) => `${v.value}.${v.dots}`)).size !== p.values.length) issue('values', 'Values must all be different');
    if (p.ask === 'dotted') {
      for (const v of p.values) {
        if (v.dots !== 0) issue('values', 'For `dotted`, give plain values: the question adds the dot');
        else if (!isQuarterBeat({ value: v.value, dots: 1 })) issue('values', 'That value with a dot is not a whole number of quarter beats');
      }
    } else {
      if (p.values.length < 2) issue('values', 'This question needs at least two values');
      for (const v of p.values) {
        if (v.dots !== 0) issue('values', 'Give plain values (no dots) for this question');
        if (!isQuarterBeat(v)) issue('values', 'Lengths must be a whole number of quarter beats');
      }
    }
    if (p.ask === 'exchange' && exchangePairs(p.values).length === 0) issue('values', '`exchange` needs two values in a ratio of 2 to 8');
    if (p.ask === 'fits') {
      if (p.values.some((v) => crotchetBeats(v) < 0.5)) issue('values', '`fits` lists the notes in words, so use crotchets, quavers and longer');
      if (!p.values.some((v) => crotchetBeats(v) <= 1)) issue('values', '`fits` needs a value of a crotchet or shorter');
    }
    if (p.ask === 'tie' && (p.options ?? 3) > 3) issue('options', '`tie` has at most 3 options');
    if (p.ask === 'exchange' && (p.options ?? 3) > 3) issue('options', '`exchange` has at most 3 options');
    if (p.ask === 'fits' || p.ask === 'meaning') {
      p.times.forEach((t) => {
        if (t.beatUnit !== 4 || t.beats < 2 || t.beats > 4) issue('times', 'Use 2/4, 3/4 or 4/4');
      });
      if (new Set(p.times.map((t) => t.beats)).size !== p.times.length) issue('times', 'The time signatures must have different numbers of beats');
    }
  });
