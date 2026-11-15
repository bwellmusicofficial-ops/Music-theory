import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Rng, Terminology, TimeSignature } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Glyph } from '@/lesson/questions/shared';
import { B4, T44, buildBars, dur, plain, restEvent, rhythmPassage } from '../shared/bars';
import { crotchetBeats } from '../shared/bars';
import { term } from '../shared/terms';
import { paramsSchema, type CompleteTheBarParams } from './params';

const ATTEMPTS = 50;

/**
 * docs/generators-grade-1.md 3.5. Rng calls, per attempt: the bars (one pick per note),
 * then `int(0, bars - 1)` for the short bar. After a good attempt: shuffle(other values),
 * then the final shuffle of the palette.
 */
export function generate(params: CompleteTheBarParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const time: TimeSignature = params.time ?? T44;
  const values = params.values ?? [dur('crotchet'), dur('minim'), dur('semibreve')];
  const missing = params.missing ?? 'note';
  const barCount = params.bars ?? 2;
  const paletteSize = params.paletteSize ?? 3;

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const bars = buildBars(rng, time, values, barCount);
    if (!bars) continue;
    const barIndex = rng.int(0, barCount - 1);
    const full = bars[barIndex]!;
    if (full.events.length < 2) continue;
    const answer: Duration = plain(full.events[full.events.length - 1]!.duration);
    const finished: Bar =
      missing === 'rest' ? { events: [...full.events.slice(0, -1), restEvent(answer)] } : full;
    if (rhythm.groupingProblems(finished, time).length > 0) continue;

    const short: Bar = { events: full.events.slice(0, -1) };
    const others = rng
      .shuffle(values.filter((v) => crotchetBeats(v) !== crotchetBeats(answer)))
      .slice(0, paletteSize - 1);
    const palette: Glyph[] = rng.shuffle([answer, ...others]).map((d) => ({ kind: missing, duration: plain(d) }));
    return {
      type: 'complete-bar',
      prompt: `Add the missing ${missing} to complete the ${term('bar', t)}.`,
      payload: {
        passage: rhythmPassage(time, bars.map((b, i) => (i === barIndex ? short : b))),
        barIndex,
        palette,
        fillPitch: { ...B4 },
        count: 1,
        checkGrouping: true,
      },
    };
  }
  throw new TheoryError('complete-the-bar could not build a bar from these params');
}

export const completeTheBar: QuestionGenerator<CompleteTheBarParams> = {
  id: 'complete-the-bar',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
