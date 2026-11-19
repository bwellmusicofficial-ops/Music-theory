import type { Passage } from '@/engine/types';

/** docs/question-payloads.md 2.10 */
export interface PlaceBarLinesPayload {
  /** The passage as it should be barred. Every bar full. 2 to 4 bars, 4 to 12 events in total. */
  passage: Passage;
}

export interface PlaceBarLinesAnswer {
  /** Bar lines the learner placed, as indexes into the flat event list: a bar line after event i. */
  after: number[];
}
