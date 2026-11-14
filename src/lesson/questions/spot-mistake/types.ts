import type { Passage } from '@/engine/types';
import type { Clip, RichText } from '@/lesson/questions/shared';

/** docs/question-payloads.md 2.9 */
export interface SpotMistakePayload {
  /** Shown as notation. With `select: 'bar'`, the bar at `mistake.bar` may be the wrong length. */
  passage: Passage;
  /** What the learner taps: a whole bar, or one note or rest. */
  select: 'bar' | 'event';
  /** Where the mistake is. `event` is required when `select` is 'event' and not allowed otherwise. */
  mistake: { bar: number; event?: number };
  /** Names the place and the fault: "Bar 2 has 5 beats: ...". 40 words at most. */
  explanation: RichText;
  /** A correct version to listen to, for "one note on the page does not match what you hear". */
  reference?: Clip;
}

export interface SpotMistakeAnswer {
  bar: number;
  /** Present exactly when `select` is 'event'. */
  event?: number;
}
