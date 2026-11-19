import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { MarkResult } from '@/lesson/contracts';
import { absDiff, BAR, BAR_CAP, beats } from '@/lesson/questions/notation/reason-helpers';
import { flatEvents, sortedAfter, splitAt } from './bars';
import type { PlaceBarLinesAnswer, PlaceBarLinesPayload } from './types';

/** docs/question-payloads.md 2.10. Throws `TheoryError` for an answer the component could never produce. */
export function mark(payload: PlaceBarLinesPayload, answer: PlaceBarLinesAnswer): MarkResult {
  const { passage } = payload;
  const events = flatEvents(passage);
  if (!answer || !Array.isArray(answer.after)) throw new TheoryError('place-bar-lines: answer has no `after` list');
  for (const i of answer.after) {
    if (!Number.isInteger(i) || i < 0 || i > events.length - 2) {
      throw new TheoryError(`place-bar-lines: there is no gap after event ${String(i)} (the passage has ${events.length} events)`);
    }
  }
  if (new Set(answer.after).size !== answer.after.length) throw new TheoryError('place-bar-lines: a bar line is placed twice');

  const { time } = passage;
  const full = rhythm.barLength(time);
  const bars = splitAt(events, sortedAfter(answer.after));
  for (let n = 0; n < bars.length; n += 1) {
    const bar = { events: bars[n]! };
    const { status } = rhythm.checkBarLength(bar, time);
    if (status === 'complete') continue;
    const total = rhythm.eventsLength(bar.events);
    const diff = beats(absDiff(total, full), time);
    const reason =
      status === 'long'
        ? `${BAR_CAP} ${n + 1} holds ${beats(total, time)}, but each ${BAR} holds ${beats(full, time)}. It needs a bar line ${diff} sooner.`
        : `${BAR_CAP} ${n + 1} holds only ${beats(total, time)}, but each ${BAR} holds ${beats(full, time)}. Its bar line comes ${diff} too soon.`;
    return { correct: false, score: 0, reason };
  }
  return { correct: true, score: 1 };
}
