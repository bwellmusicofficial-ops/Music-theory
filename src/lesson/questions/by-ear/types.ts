import type { Clip, Face, RichText } from '@/lesson/questions/shared';

/** docs/question-payloads.md 2.7 */
export interface ByEarPayload {
  /** 1 to 3 clips. Two or more are labelled "A", "B", "C" in array order. */
  clips: Clip[];
  /** 2 to 4 options, shown in this order. */
  options: ByEarOption[];
  /** `id` of the one correct option. */
  correct: string;
}

export interface ByEarOption {
  id: string;
  face: Face;
  /** Required on every wrong option. Not allowed on the correct option. */
  reason?: RichText;
}

export interface ByEarAnswer {
  optionId: string;
}
