import { rhythm } from '@/engine/rhythm';
import type { Duration, Rng, Terminology, TimeSignature } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Face } from '@/lesson/questions/shared';
import { T44, dur, lengthOf, plain, sameDuration } from '../shared/bars';
import { beatsText } from '../shared/beats-text';
import { placeOptions, takeDistinct } from '../shared/options';
import { glyphLink, restLink, term } from '../shared/terms';
import { paramsSchema, type ChooseNoteValueParams } from './params';

const face = (kind: 'note' | 'rest', d: Duration): Face => ({ kind: 'glyph', glyph: { kind, duration: plain(d) } });
const key = (d: Duration): string => `${d.value}.${d.dots}`;
const longer = (a: Duration, b: Duration): number => rhythm.compareFractions(lengthOf(a), lengthOf(b));

/** Wrong options for a whole bar of silence, most plausible first (3.1). */
function wholeBarDistractors(time: TimeSignature): Duration[] {
  const barLen = rhythm.barLength(time);
  const sameLength = [dur('minim', 1), dur('minim')].filter((d) => rhythm.compareFractions(lengthOf(d), barLen) === 0);
  return [...sameLength, dur('minim'), dur('crotchet'), dur('quaver')];
}

/**
 * docs/generators-grade-1.md 3.1. Rng calls: name/beats: pick, shuffle(others), final shuffle;
 * longer/shorter: shuffle(values), final shuffle; whole-bar: shuffle(distractors), final shuffle.
 */
export function generate(params: ChooseNoteValueParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const kind = params.kind ?? 'note';
  const values = params.values ?? [dur('crotchet'), dur('minim')];
  const question = params.question ?? 'name';
  const options = params.options ?? Math.min(3, values.length);
  const time = params.time ?? T44;
  const L = (d: Duration) => glyphLink(kind, d, t);
  const b = (d: Duration) => beatsText(lengthOf(d));
  const noun = kind === 'rest' ? 'rest' : 'note';

  if (question === 'whole-bar') {
    const semibreve = dur('semibreve');
    const candidates = rng.shuffle(wholeBarDistractors(time));
    const wrong = takeDistinct(candidates, options - 1, key, [key(semibreve)]);
    const barText = term('bar', t);
    const full = beatsText(rhythm.barLength(time), time);
    const placed = placeOptions<Face>(
      rng,
      face('rest', semibreve),
      wrong.map((d) => ({
        face: face('rest', d),
        reason:
          rhythm.compareFractions(lengthOf(d), rhythm.barLength(time)) === 0
            ? `A ${restLink(d, t)} does last ${beatsText(lengthOf(d), time)}, the length of this ${barText}, but a whole ${barText} of silence is always the ${restLink(semibreve, t)}, in every time signature.`
            : `A ${restLink(d, t)} lasts only ${beatsText(lengthOf(d), time)}, but this ${barText} has ${full}. Silence for a whole ${barText} is the ${restLink(semibreve, t)}.`,
      })),
    );
    return {
      type: 'multiple-choice',
      payload: placed,
      prompt: `A whole ${barText} of silence in ${time.beats}/${time.beatUnit}. Which rest do you write?`,
    };
  }

  if (question === 'name' || question === 'beats') {
    const target = rng.pick(values);
    const others = rng.shuffle(values.filter((v) => !sameDuration(v, target))).slice(0, options - 1);
    const placed = placeOptions<Face>(
      rng,
      face(kind, target),
      others.map((o) => ({
        face: face(kind, o),
        reason:
          question === 'name'
            ? `That symbol lasts ${b(o)}, so it is the ${L(o)}. The ${L(target)} lasts ${b(target)}.`
            : `That ${noun} lasts ${b(o)}, not ${b(target)}. It is the ${L(o)}.`,
      })),
    );
    return {
      type: 'multiple-choice',
      payload: placed,
      prompt: question === 'name' ? `Which of these is the ${L(target)}?` : `Which ${noun} lasts ${b(target)}?`,
    };
  }

  const shown = rng.shuffle(values).slice(0, options);
  const sorted = [...shown].sort(longer);
  const correct = question === 'longer' ? sorted[sorted.length - 1]! : sorted[0]!;
  const placed = placeOptions<Face>(
    rng,
    face(kind, correct),
    shown
      .filter((d) => !sameDuration(d, correct))
      .map((o) => ({
        face: face(kind, o),
        reason:
          question === 'longer'
            ? `That ${L(o)} lasts ${b(o)}. The ${L(correct)} lasts ${b(correct)}, which is longer.`
            : `That ${L(o)} lasts ${b(o)}. The ${L(correct)} lasts only ${b(correct)}, which is shorter.`,
      })),
  );
  const superlative = options > 2;
  const prompt =
    question === 'longer'
      ? `Which ${noun} lasts ${superlative ? 'longest' : 'longer'}?`
      : `Which ${noun} is ${superlative ? 'shortest' : 'shorter'}?`;
  return { type: 'multiple-choice', payload: placed, prompt };
}

export const chooseNoteValue: QuestionGenerator<ChooseNoteValueParams> = {
  id: 'choose-note-value',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
