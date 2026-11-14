import type { Face, RichText } from '@/lesson/questions/shared';

/** docs/question-payloads.md 2.2 */
export interface MatchUpPayload {
  /** 3 to 5 items, shown in this order. */
  left: MatchUpLeft[];
  /** Same length as `left`, shown in this order. */
  right: MatchUpRight[];
}

export interface MatchUpLeft {
  id: string;
  face: Face;
  /** `id` of the item in `right` that this item belongs with. */
  match: string;
  /** Used when this item is paired wrongly. Says what this item is and what it belongs with. */
  reason: RichText;
}

export interface MatchUpRight {
  id: string;
  face: Face;
}

/** One entry for every left item: left id -> chosen right id. */
export interface MatchUpAnswer {
  pairs: Record<string, string>;
}
