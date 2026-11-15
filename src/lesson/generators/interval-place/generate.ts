import { pitch } from '@/engine/pitch';
import type { Degree, Letter, Rng, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { GRADE_1_TONICS } from '../shared/params';
import { majorKey } from '../shared/pitch-utils';
import { ordinal, term } from '../shared/terms';
import { paramsSchema, type IntervalPlaceParams } from './params';

/** docs/generators-grade-1.md 3.17. Rng calls: (1) pick the key; (2) pick the number. */
export function generate(params: IntervalPlaceParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const tonicLetter: Letter = rng.pick(params.keys ?? GRADE_1_TONICS);
  const n = rng.pick(params.numbers ?? [2, 3, 4, 5, 6, 7]);
  const key = majorKey(tonicLetter);
  const target = pitch.degree(key, n as Degree);
  return {
    type: 'note-on-stave',
    prompt: `In ${pitch.keyName(key)}, put the note that is a ${ordinal(n)} above the key note, ${tonicLetter}, on the ${term('stave', t)}.`,
    payload: {
      mode: 'place',
      clef: params.clef ?? 'treble',
      key,
      target: { letter: target.letter, accidental: target.accidental as -1 | 0 | 1 },
      accidentals: pitch.keySignature(key) !== 0,
    },
  };
}

export const intervalPlace: QuestionGenerator<IntervalPlaceParams> = {
  id: 'interval-place',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
