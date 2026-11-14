import { TheoryError } from '@/engine/api';
import type { MarkResult } from '@/lesson/contracts';
import type { ByEarAnswer, ByEarPayload } from './types';

/** docs/question-payloads.md 2.7: right when the chosen option is the correct one; otherwise its own reason. */
export function mark(payload: ByEarPayload, answer: ByEarAnswer): MarkResult {
  const chosen = payload.options.find((option) => option.id === answer?.optionId);
  if (!chosen) {
    throw new TheoryError(`by-ear: "${answer?.optionId}" is not an option in this question`);
  }
  if (chosen.id === payload.correct) {
    return { correct: true, score: 1 };
  }
  if (chosen.reason === undefined) {
    throw new TheoryError(`by-ear: wrong option "${chosen.id}" has no reason`);
  }
  return { correct: false, score: 0, reason: chosen.reason };
}
