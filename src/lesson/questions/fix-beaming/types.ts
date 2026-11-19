import type { Passage } from '@/engine/types';

/** docs/question-payloads.md 2.11 */
export interface FixBeamingPayload {
  /** One bar is beamed wrongly with `bars[barIndex].beams`; others are beamed normally. */
  passage: Passage;
  barIndex: number;
}

export interface FixBeamingAnswer {
  /** The learner's beam groups for the bar, in the same form as Bar.beams. */
  beams: number[][];
}
