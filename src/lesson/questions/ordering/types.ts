import type { Face, RichText } from '@/lesson/questions/shared';

/** docs/question-payloads.md 2.3 */
export interface OrderingPayload {
  /** 3 to 6 items, in the order they are first shown. */
  items: { id: string; face: Face }[];
  /** Every item id once, in the correct order. */
  correctOrder: string[];
  /** Labels shown at the two ends of the row, e.g. "shortest" and "longest". */
  ends: { first: RichText; last: RichText };
  /** The rule that sorts the items, with the values that prove it. */
  reason: RichText;
}

export interface OrderingAnswer {
  /** Every item id once, in the learner's order. */
  order: string[];
}
