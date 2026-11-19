import type { Passage } from '@/engine/types';
import type { RichText } from '@/lesson/questions/shared';

/** docs/question-payloads.md 2.13 */
export interface FindInPassagePayload {
  passage: Passage;
  /** What the learner taps: single notes and rests, or whole bars. */
  select: 'event' | 'bar';
  /** Every correct place. 1 to 6. `event` is present exactly when `select` is 'event'. */
  targets: { bar: number; event?: number }[];
  /** What the learner is looking for, as a short noun phrase for the reason text: "dotted notes". */
  feature: RichText;
}

export interface FindInPassageAnswer {
  /** Places the learner chose, sorted by bar then event. */
  chosen: { bar: number; event?: number }[];
}

export const MAX_TARGETS = 6;
