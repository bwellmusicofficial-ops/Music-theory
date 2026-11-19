import { pitch } from '@/engine/pitch';
import type { Rng } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { GRADE_1_KEYS, paramsSchema, type WriteKeySignatureParams } from './params';

/**
 * docs/generators-grade-1.md 3.23. Rng calls: `pick(keys)`, then `pick(clefs)`. The key name is the engine's
 * `pitch.keyName`; where the signs go is decided by `mark` from `pitch.keySignaturePositions`, not here.
 */
export function generate(params: WriteKeySignatureParams, rng: Rng): GeneratedQuestion {
  const key = rng.pick(params.keys ?? GRADE_1_KEYS);
  const clef = rng.pick(params.clefs ?? ['treble', 'bass']);
  return {
    type: 'write-key-signature',
    prompt: `Write the [[key-signature|key signature]] of ${pitch.keyName(key)}.`,
    payload: { clef, key, ...(params.placement ? { placement: params.placement } : {}) },
  };
}

export const writeKeySignature: QuestionGenerator<WriteKeySignatureParams> = {
  id: 'write-key-signature',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
