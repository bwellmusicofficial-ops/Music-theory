import { TheoryError } from '@/engine/api';
import type { MarkResult } from '@/lesson/contracts';
import type { MultipleChoiceAnswer, MultipleChoicePayload } from './types';

/** docs/question-payloads.md 2.1: right when the chosen option is the correct one; otherwise its own reason. */
export function mark(payload: MultipleChoicePayload, answer: MultipleChoiceAnswer): MarkResult {
  const chosen = payload.options.find((option) => option.id === answer.optionId);
  if (!chosen) {
    throw new TheoryError(`multiple-choice: "${answer.optionId}" is not an option in this question`);
  }
  if (answer.optionId === payload.correct) {
    return { correct: true, score: 1 };
  }
  if (chosen.reason === undefined) {
    throw new TheoryError(`multiple-choice: wrong option "${chosen.id}" has no reason`);
  }
  return { correct: false, score: 0, reason: chosen.reason };
}
