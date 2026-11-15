import { pitch } from '@/engine/pitch';
import type { Pitch, Rng, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Face } from '@/lesson/questions/shared';
import { GRADE_1_TONICS } from '../shared/params';
import { placeOptions } from '../shared/options';
import { OCTAVE_FOUR, keyNameAtMidi, majorKey, semitoneStep, toneStep } from '../shared/pitch-utils';
import { term } from '../shared/terms';
import { paramsSchema, type ToneOrSemitoneParams } from './params';

const text = (s: string): Face => ({ kind: 'text', text: s });

/**
 * docs/generators-grade-1.md 3.12. Rng calls: keyboard: (1) pick the start, (2) pick the
 * size (1 or 2 semitones), (3) final shuffle. major-scale: (1) pick the tonic, (2)
 * `int(1, 7)` for the degree, (3) final shuffle.
 */
export function generate(params: ToneOrSemitoneParams, rng: Rng, t: Terminology): GeneratedQuestion {
  let a: Pitch;
  let b: Pitch;
  let flats = false;
  let prompt: string;
  let scaleNote = false;
  let keyboard: { low: string; high: string };

  if ((params.source ?? 'keyboard') === 'keyboard') {
    a = rng.pick(OCTAVE_FOUR);
    const size = rng.pick([1, 2] as const);
    b = size === 1 ? semitoneStep(a, 'up') : toneStep(a, 'up');
    prompt = `What is the step from ${pitch.displayPitchClass(a)} up to ${pitch.displayPitchClass(b)}?`;
    keyboard = { low: 'C4', high: 'E5' };
  } else {
    const tonic = rng.pick(params.keys ?? GRADE_1_TONICS);
    const d = rng.int(1, 7);
    const key = majorKey(tonic);
    const scale = pitch.scale(key.tonic, 'major', 4);
    a = scale[d - 1]!;
    b = scale[d]!;
    flats = pitch.keySignature(key) < 0;
    scaleNote = true;
    prompt = `In ${pitch.keyName(key)}, what is the step from note ${d} (${pitch.displayPitchClass(a)}) to note ${d + 1} (${pitch.displayPitchClass(b)})?`;
    keyboard = { low: 'C4', high: 'C6' };
  }

  const gap = pitch.toMidi(b) - pitch.toMidi(a);
  const isSemitone = gap === 1;
  const A = pitch.displayPitchClass(a);
  const B = pitch.displayPitchClass(b);
  const tone = term('tone', t);
  const semitone = term('semitone', t);
  const mid = keyNameAtMidi(pitch.toMidi(a) + 1, flats);
  const extra = scaleNote ? ` Only notes 3 to 4 and 7 to 8 of a major scale are a ${semitone} apart.` : '';
  const wrongReason = isSemitone
    ? `${A} and ${B} are neighbouring keys with nothing between them. Neighbours are a ${semitone}, not a ${tone}.${extra}`
    : `${A} and ${B} have one key between them, ${mid}, so they are a ${tone} apart, not a ${semitone}.${extra}`;

  const right = isSemitone ? `A ${semitone}` : `A ${tone}`;
  const wrong = isSemitone ? `A ${tone}` : `A ${semitone}`;
  const placed = placeOptions<Face>(rng, text(right), [{ face: text(wrong), reason: wrongReason }]);
  return {
    type: 'multiple-choice',
    prompt,
    payload: {
      exhibit: { kind: 'keyboard', highlight: [pitch.formatPitch(a), pitch.formatPitch(b)], ...keyboard },
      ...placed,
    },
  };
}

export const toneOrSemitone: QuestionGenerator<ToneOrSemitoneParams> = {
  id: 'tone-or-semitone',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
