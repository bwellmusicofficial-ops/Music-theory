import { TheoryError } from '@/engine/api';
import type { Bar, Rng, TimeSignature } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { T44, barIsClean, buildBars, dur, rhythmPassage } from '../shared/bars';
import { stepwiseTune, withPitches, noteCount } from '../shared/tune';
import { paramsSchema, type PlaceBarLinesParams } from './params';

const ATTEMPTS = 100;
const sameBar = (a: Bar, b: Bar): boolean => JSON.stringify(a.events) === JSON.stringify(b.events);

/**
 * docs/generators-grade-1.md 3.21. Rng calls, per attempt: the bars (one pick per note). After a good attempt, for
 * `melody: 'tune'`: the stepwise tune (`int`, then one `pick` per further note).
 */
export function generate(params: PlaceBarLinesParams, rng: Rng): GeneratedQuestion {
  const time: TimeSignature = params.time ?? T44;
  const values = params.values ?? [dur('crotchet'), dur('minim')];
  const barCount = params.bars ?? 3;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const bars = buildBars(rng, time, values, barCount);
    if (!bars) continue;
    const events = bars.reduce((sum, bar) => sum + bar.events.length, 0);
    if (events < 4 || events > 12) continue;
    if (bars.some((bar, i) => i > 0 && sameBar(bar, bars[i - 1]!))) continue;
    if (!bars.every((bar) => barIsClean(bar, time))) continue;
    const written = params.melody === 'tune' ? withPitches(bars, stepwiseTune(rng, noteCount(bars))) : bars;
    return {
      type: 'place-bar-lines',
      prompt: 'Tap the gaps where the missing [[bar-line|bar lines]] go.',
      payload: { passage: rhythmPassage(time, written) },
    };
  }
  throw new TheoryError('place-bar-lines could not build bars from these params');
}

export const placeBarLines: QuestionGenerator<PlaceBarLinesParams> = {
  id: 'place-bar-lines',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
