import type { Passage, Pitch } from '@/engine/types';
import type { Glyph } from '@/lesson/questions/shared';

/** docs/question-payloads.md 2.8 */
export interface CompleteBarPayload {
  /** Every bar is full except the one at `barIndex`, which is short. */
  passage: Passage;
  barIndex: number;
  /** 2 to 6 symbols the learner may add, shown in this order. Each may be used many times. */
  palette: Glyph[];
  /** Pitch given to added notes. */
  fillPitch: Pitch;
  /** If given, the learner must add exactly this many symbols. */
  count?: number;
  /** true: the finished bar must also follow grouping conventions. Default false. */
  checkGrouping?: boolean;
}

export interface CompleteBarAnswer {
  /** The symbols added, left to right. */
  added: Glyph[];
}

/** The most symbols a learner may add, even if the bar overflows. */
export const MAX_ADDED = 12;
