import { TheoryError } from '@/engine/api';
import type { MarkResult } from '@/lesson/contracts';
import type { OrderingAnswer, OrderingPayload } from './types';

/**
 * docs/question-payloads.md 2.3. Score is the share of positions that hold the right item.
 * The answer must be a permutation of the item ids (the component never produces anything else).
 */
export function mark(payload: OrderingPayload, answer: OrderingAnswer): MarkResult {
  const ids = new Set(payload.items.map((item) => item.id));
  const seen = new Set<string>();
  for (const id of answer.order) {
    if (!ids.has(id)) {
      throw new TheoryError(`ordering: "${id}" is not an item in this question`);
    }
    if (seen.has(id)) {
      throw new TheoryError(`ordering: "${id}" appears more than once in the answer`);
    }
    seen.add(id);
  }
  if (answer.order.length !== ids.size) {
    throw new TheoryError('ordering: the answer must place every item exactly once');
  }

  let matching = 0;
  let firstOut = -1;
  payload.correctOrder.forEach((id, index) => {
    if (answer.order[index] === id) {
      matching += 1;
    } else if (firstOut === -1) {
      firstOut = index;
    }
  });

  const score = matching / ids.size;
  if (firstOut === -1) {
    return { correct: true, score: 1 };
  }
  return {
    correct: false,
    score,
    reason: `Number ${firstOut + 1} in your order is the first one out of place. ${payload.reason}`,
  };
}
