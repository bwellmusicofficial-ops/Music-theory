import { pitch } from '@/engine/pitch';
import type { Rng } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { GRADE_1_TONICS } from '../shared/params';
import { majorKey, nat } from '../shared/pitch-utils';
import { plainTerm } from '../shared/terms';
import { paramsSchema, type PlayScaleOrTriadParams } from './params';

/**
 * docs/generators-grade-1.md 3.11. Rng calls: (1) pick the tonic; (2) only for `degree`:
 * pick the degree.
 */
export function generate(params: PlayScaleOrTriadParams, rng: Rng): GeneratedQuestion {
  const tonicLetter = rng.pick(params.keys ?? GRADE_1_TONICS);
  const key = majorKey(tonicLetter);
  const keyName = pitch.keyName(key);
  const keyboard = { low: nat(tonicLetter, 4), high: nat(tonicLetter, 5), showLabels: params.showLabels ?? false };

  if (params.ask === 'scale') {
    return {
      type: 'play-keyboard',
      prompt: `Play the scale of ${keyName}, going up.`,
      payload: { ...keyboard, targets: pitch.scale(key.tonic, 'major', 4), mode: 'sequence', octave: 'exact' },
    };
  }
  if (params.ask === 'degree') {
    const n = rng.pick(params.degrees ?? [2, 3, 4, 5, 6, 7, 8]);
    return {
      type: 'play-keyboard',
      prompt: `Play note ${n} of the scale of ${keyName}.`,
      payload: { ...keyboard, targets: [pitch.scale(key.tonic, 'major', 4)[n - 1]!], mode: 'sequence', octave: 'exact' },
    };
  }
  return {
    type: 'play-keyboard',
    prompt: `Play the tonic ${plainTerm('triad')} of ${keyName}.`,
    payload: {
      ...keyboard,
      targets: pitch.triadPitches({ root: key.tonic, quality: 'major', inversion: 0 }, 4),
      mode: 'together',
      octave: 'exact',
    },
  };
}

export const playScaleOrTriad: QuestionGenerator<PlayScaleOrTriadParams> = {
  id: 'play-scale-or-triad',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
