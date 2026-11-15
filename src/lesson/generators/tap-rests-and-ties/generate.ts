import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Rng } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { buildBar, noteCandidates, type Candidate } from '../shared/bars';
import { plainTerm } from '../shared/terms';
import { paramsSchema, type TapRestsAndTiesParams } from './params';

const ATTEMPTS = 50;

/**
 * docs/generators-grade-1.md 3.7. Per attempt: one pick per symbol in every bar (notes then
 * rests in the allowed list), then, with `ties`, one pick among the bar lines that have a
 * note on both sides.
 */
export function generate(params: TapRestsAndTiesParams, rng: Rng): GeneratedQuestion {
  const { time, values, bars: barCount, bpm } = params;
  const rests = params.rests ?? [];
  const ties = params.ties ?? false;
  const candidates: Candidate[] = [...noteCandidates(values), ...rests.map((duration) => ({ kind: 'rest' as const, duration }))];

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const bars: Bar[] = [];
    let stuck = false;
    for (let i = 0; i < barCount && !stuck; i += 1) {
      const bar = buildBar(rng, time, candidates);
      if (bar) bars.push(bar);
      else stuck = true;
    }
    if (stuck) continue;
    if (!bars.every((b) => b.events.some((e) => e.kind === 'note'))) continue;
    if (rests.length > 0 && !bars.some((b) => b.events.some((e) => e.kind === 'rest'))) continue;
    if (!bars.every((b) => rhythm.groupingProblems(b, time).length === 0)) continue;

    let tiedBars = bars;
    if (ties) {
      const lines: number[] = [];
      for (let i = 0; i + 1 < bars.length; i += 1) {
        const last = bars[i]!.events[bars[i]!.events.length - 1]!;
        const first = bars[i + 1]!.events[0]!;
        if (last.kind === 'note' && first.kind === 'note') lines.push(i);
      }
      if (lines.length === 0) continue;
      const at = rng.pick(lines);
      tiedBars = bars.map((b, i) =>
        i === at ? { events: b.events.map((e, j) => (j === b.events.length - 1 && e.kind === 'note' ? { ...e, tieToNext: true } : e)) } : b,
      );
    }

    const parts: string[] = [];
    if (rests.length > 0) parts.push('Rests are silent: do not tap.');
    if (ties) parts.push(`A ${plainTerm('tie')} joins two notes into one tap.`);
    return {
      type: 'tap-rhythm',
      prompt: `Tap this rhythm. ${parts.join(' ')}`,
      payload: {
        time,
        bars: tiedBars,
        bpm,
        countInBars: 1,
        showNotation: params.showNotation ?? true,
        listenFirst: params.listenFirst ?? false,
      },
    };
  }
  throw new TheoryError('tap-rests-and-ties could not build a rhythm from these params');
}

export const tapRestsAndTies: QuestionGenerator<TapRestsAndTiesParams> = {
  id: 'tap-rests-and-ties',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
