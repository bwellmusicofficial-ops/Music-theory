import { TheoryError } from '@/engine/api';
import type { MarkResult } from '@/lesson/contracts';
import { BAR, BAR_CAP } from '@/lesson/questions/notation/reason-helpers';
import type { SpotMistakeAnswer, SpotMistakePayload } from './types';

/** docs/question-payloads.md 2.9. Throws `TheoryError` for an answer the component could never produce. */
export function mark(payload: SpotMistakePayload, answer: SpotMistakeAnswer): MarkResult {
  const { passage, select, mistake, explanation } = payload;
  const bar = answer ? passage.bars[answer.bar] : undefined;
  if (!bar || !Number.isInteger(answer.bar)) {
    throw new TheoryError(`spot-mistake: there is no bar ${String(answer?.bar)}`);
  }
  if (select === 'bar') {
    if (answer.event !== undefined) throw new TheoryError('spot-mistake: a "bar" question takes an answer without `event`');
    if (answer.bar === mistake.bar) return { correct: true, score: 1 };
    return { correct: false, score: 0, reason: `${BAR_CAP} ${answer.bar + 1} is fine. ${explanation}` };
  }

  if (answer.event === undefined) throw new TheoryError('spot-mistake: an "event" question needs `event` in the answer');
  const tapped = bar.events[answer.event];
  if (!tapped || !Number.isInteger(answer.event)) {
    throw new TheoryError(`spot-mistake: bar ${answer.bar + 1} has no event ${answer.event}`);
  }
  if (answer.bar === mistake.bar && answer.event === mistake.event) return { correct: true, score: 1 };
  const kind = tapped.kind;
  const reason =
    answer.bar === mistake.bar
      ? `Right ${BAR}, wrong ${kind}. ${explanation}`
      : `That ${kind} is fine. ${explanation}`;
  return { correct: false, score: 0, reason };
}
