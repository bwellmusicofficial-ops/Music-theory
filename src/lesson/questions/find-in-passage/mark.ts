import { TheoryError } from '@/engine/api';
import type { MarkResult } from '@/lesson/contracts';
import type { FindInPassageAnswer, FindInPassagePayload } from './types';

type Place = { bar: number; event?: number };

/** "bar 2", "bars 1 and 3", "bars 1, 2 and 4", each with `bar` a glossary link so US learners read "measure". */
function barList(places: Place[]): string {
  const bars = [...new Set(places.map((p) => p.bar + 1))].sort((a, b) => a - b).map(String);
  if (bars.length === 1) return `[[bar|bar]] ${bars[0]}`;
  return `[[bar|bars]] ${bars.slice(0, -1).join(', ')} and ${bars[bars.length - 1]}`;
}

/** docs/question-payloads.md 2.13. Throws `TheoryError` for an answer the component could never produce. */
export function mark(payload: FindInPassagePayload, answer: FindInPassageAnswer): MarkResult {
  const { passage, select, targets, feature } = payload;
  if (!answer || !Array.isArray(answer.chosen)) throw new TheoryError('find-in-passage: answer has no `chosen` list');
  const keyOf = (p: Place) => `${p.bar}:${p.event ?? ''}`;
  const seen = new Set<string>();
  for (const place of answer.chosen) {
    const bar = place ? passage.bars[place.bar] : undefined;
    if (!bar || !Number.isInteger(place.bar)) throw new TheoryError(`find-in-passage: there is no bar ${String(place?.bar)}`);
    if (select === 'bar') {
      if (place.event !== undefined) throw new TheoryError('find-in-passage: a "bar" question takes places without `event`');
    } else if (place.event === undefined || !Number.isInteger(place.event) || !bar.events[place.event]) {
      throw new TheoryError(`find-in-passage: bar ${place.bar + 1} has no event ${String(place.event)}`);
    }
    if (seen.has(keyOf(place))) throw new TheoryError('find-in-passage: a place is chosen twice');
    seen.add(keyOf(place));
  }

  const wanted = new Set(targets.map(keyOf));
  const right = answer.chosen.filter((p) => wanted.has(keyOf(p))).length;
  const n = answer.chosen.length;
  if (right === targets.length && n === targets.length) return { correct: true, score: 1 };

  const score = right / Math.max(targets.length, n);
  const missed = targets.filter((t) => !seen.has(keyOf(t)));
  if (right === 0) {
    return {
      correct: false,
      score,
      reason: `None of those are ${feature}. There ${targets.length === 1 ? 'is' : 'are'} ${targets.length} in ${barList(targets)}.`,
    };
  }
  const head = `${right} of your ${n} choices ${right === 1 ? 'is' : 'are'} ${feature}.`;
  return {
    correct: false,
    score,
    reason: missed.length > 0 ? `${head} Look again at ${barList(missed)}.` : `${head} The others are not.`,
  };
}
