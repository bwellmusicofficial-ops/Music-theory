import type { Exhibit } from '@/lesson/schema';
import type { Face, RichText } from '@/lesson/questions/shared';

/** docs/question-payloads.md 2.1 */
export interface MultipleChoicePayload {
  /** Shown above the options. Omit when the prompt needs nothing else. */
  exhibit?: Exhibit;
  /** 2 to 4 options, shown in this order. */
  options: MultipleChoiceOption[];
  /** `id` of the one correct option. */
  correct: string;
}

export interface MultipleChoiceOption {
  id: string;
  face: Face;
  /** Required on every wrong option. Not allowed on the correct option. */
  reason?: RichText;
}

export interface MultipleChoiceAnswer {
  optionId: string;
}
