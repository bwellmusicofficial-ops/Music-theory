/**
 * The zod description of one stored mock attempt. Used by the account sync (which already ships zod).
 * `mock/store.ts` has a hand-written check of the same rules for pages that must not download zod;
 * `attempt-schema.test.ts` keeps the two in agreement.
 */

import { z } from 'zod';

const tallySchema = z.object({
  correct: z.number().min(0),
  total: z.number().min(0),
});

export const mockAttemptSchema = z.object({
  configId: z.string().min(1),
  /** ISO 8601. */
  at: z.string().min(1),
  seed: z.number(),
  /** Marks gained / marks available, 0..1. */
  score: z.number().min(0).max(1),
  correct: z.number().min(0),
  /** Marks available. 0 means unknown: a result brought over from the account, which keeps only the score. */
  total: z.number().min(0),
  band: z.enum(['distinction', 'merit', 'pass', 'not-yet']),
  timedOut: z.boolean(),
  elapsedMs: z.number().min(0),
  sections: z.array(tallySchema.extend({ id: z.string() })),
  skills: z.array(tallySchema.extend({ skill: z.string() })),
});
