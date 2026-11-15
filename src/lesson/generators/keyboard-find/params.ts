import { z } from 'zod';
import type { Letter } from '@/engine/types';
import { letterSchema } from '@/lesson/questions/face-view/face-schema';
import { LETTERS } from '../shared/pitch-utils';

/** docs/generators-grade-1.md 3.10 */
export interface KeyboardFindParams {
  ask: 'find-every' | 'black-keys' | 'next-note' | 'previous-note' | 'step';
  letters?: Letter[];
  groups?: ('twos' | 'threes')[];
  steps?: ('tone' | 'semitone')[];
  directions?: ('up' | 'down')[];
  showLabels?: boolean;
}

const unique = <T,>(list: T[]) => new Set(list).size === list.length;

export const paramsSchema: z.ZodType<KeyboardFindParams> = z
  .strictObject({
    ask: z.enum(['find-every', 'black-keys', 'next-note', 'previous-note', 'step']),
    letters: z.array(letterSchema).min(1).max(7).default([...LETTERS]),
    groups: z.array(z.enum(['twos', 'threes'])).min(1).max(2).default(['twos', 'threes']),
    steps: z.array(z.enum(['tone', 'semitone'])).min(1).max(2).default(['tone', 'semitone']),
    directions: z.array(z.enum(['up', 'down'])).min(1).max(2).default(['up', 'down']),
    showLabels: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    for (const k of ['letters', 'groups', 'steps', 'directions'] as const) {
      if (!unique(p[k] as unknown[])) ctx.addIssue({ code: 'custom', path: [k], message: 'No repeats in this list' });
    }
  });
