import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Letter, Rng } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Face } from '@/lesson/questions/shared';
import { T44, dur } from '../shared/bars';
import { GRADE_1_TONICS } from '../shared/params';
import { placeOptions, takeDistinct } from '../shared/options';
import { letterAbove, majorKey } from '../shared/pitch-utils';
import { ordinal, plainTerm } from '../shared/terms';
import { paramsSchema, type IntervalByNumberParams } from './params';

/**
 * docs/generators-grade-1.md 3.16. Rng calls: (1) pick the key; (2) pick the number;
 * (3) the final shuffle.
 */
export function generate(params: IntervalByNumberParams, rng: Rng): GeneratedQuestion {
  const clef = params.clef ?? 'treble';
  const options = params.options ?? 3;
  const tonicLetter: Letter = rng.pick(params.keys ?? GRADE_1_TONICS);
  const n = rng.pick(params.numbers ?? [2, 3, 4, 5, 6, 7, 8]);
  const key = majorKey(tonicLetter);
  const scale = pitch.scale(key.tonic, 'major', clef === 'treble' ? 4 : 3);
  const lower = scale[0]!;
  const upper = scale[n - 1]!;
  const found = pitch.intervalBetween(lower, upper).number;
  if (found !== n) throw new TheoryError(`interval-by-number: expected a ${n}th, the engine found a ${found}th`);

  const upperLetter = upper.letter;
  const wrongNumbers = takeDistinct(
    [n - 1, n + 1, n - 2, n + 2, n + 3, n - 3].filter((m) => m >= 2 && m <= 8),
    options - 1,
    String,
    [String(n)],
  );
  const placed = placeOptions<Face>(
    rng,
    { kind: 'text', text: ordinal(n) },
    wrongNumbers.map((m) => ({
      face: { kind: 'text' as const, text: ordinal(m) },
      reason: `Counting ${tonicLetter} as 1, the ${ordinal(m)} is ${letterAbove(tonicLetter, m)}. The second note is ${upperLetter}, which is the ${ordinal(n)}.`,
    })),
  );
  const half = dur('minim');
  return {
    type: 'multiple-choice',
    prompt: `What is the ${plainTerm('interval')} from the first note (the key note) up to the second?`,
    payload: {
      exhibit: {
        kind: 'passage',
        passage: {
          clef,
          key,
          time: { ...T44 },
          bars: [
            {
              events: [
                { kind: 'note', pitches: [lower], duration: half },
                { kind: 'note', pitches: [upper], duration: half },
              ],
            },
          ],
        },
      },
      ...placed,
    },
  };
}

export const intervalByNumber: QuestionGenerator<IntervalByNumberParams> = {
  id: 'interval-by-number',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
