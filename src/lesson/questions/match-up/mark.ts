import { TheoryError } from '@/engine/api';
import type { MarkResult } from '@/lesson/contracts';
import type { MatchUpAnswer, MatchUpPayload } from './types';

/**
 * docs/question-payloads.md 2.2. A left item is right when its pair is its `match`.
 * An answer must pair every left item exactly once with a right item (the component
 * never produces anything else), so anything else throws TheoryError.
 */
export function mark(payload: MatchUpPayload, answer: MatchUpAnswer): MarkResult {
  const leftIds = new Set(payload.left.map((item) => item.id));
  const rightIds = new Set(payload.right.map((item) => item.id));

  for (const leftId of Object.keys(answer.pairs)) {
    if (!leftIds.has(leftId)) {
      throw new TheoryError(`match-up: "${leftId}" is not a left item in this question`);
    }
  }
  const chosenRights = new Set<string>();
  for (const leftId of leftIds) {
    if (!Object.hasOwn(answer.pairs, leftId)) {
      throw new TheoryError(`match-up: left item "${leftId}" has no pair in the answer`);
    }
    const rightId = answer.pairs[leftId];
    if (!rightIds.has(rightId)) {
      throw new TheoryError(`match-up: "${rightId}" is not a right item in this question`);
    }
    if (chosenRights.has(rightId)) {
      throw new TheoryError(`match-up: right item "${rightId}" is used more than once`);
    }
    chosenRights.add(rightId);
  }

  const total = payload.left.length;
  const right = payload.left.filter((item) => answer.pairs[item.id] === item.match).length;
  const score = right / total;
  if (score === 1) {
    return { correct: true, score: 1 };
  }

  const first = payload.left.find((item) => answer.pairs[item.id] !== item.match);
  if (!first) {
    throw new TheoryError('match-up: no wrong pair found although the score is below 1');
  }
  return { correct: false, score, reason: `${right} of ${total} pairs are right. ${first.reason}` };
}
