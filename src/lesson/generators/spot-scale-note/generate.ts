import { pitch } from '@/engine/pitch';
import type { Letter, Pitch, Rng, ScoreEvent } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { T44, dur } from '../shared/bars';
import { GRADE_1_TONICS } from '../shared/params';
import { majorKey, nameWithNatural, signAccidental } from '../shared/pitch-utils';
import { paramsSchema, type SpotScaleNoteParams } from './params';

const crotchet = (p: Pitch): ScoreEvent => ({ kind: 'note', pitches: [p], duration: dur('crotchet') });

/**
 * docs/generators-grade-1.md 3.15. Rng calls: (1) pick the key; (2) pick the fault from those
 * allowed for the key; (3) pick the note: missing-sign among the notes that carry a sign,
 * wrong-letter among positions 1 to 6; (4) only for wrong-letter: pick -1 or 1.
 */
export function generate(params: SpotScaleNoteParams, rng: Rng): GeneratedQuestion {
  const clef = params.clef ?? 'treble';
  const octave = clef === 'treble' ? 4 : 3;
  const tonic: Letter = rng.pick(params.keys ?? GRADE_1_TONICS);
  const key = majorKey(tonic);
  const keyName = pitch.keyName(key);
  const scale = pitch.scale(key.tonic, 'major', octave);
  const signed = scale.map((p, i) => (p.accidental !== 0 ? i : -1)).filter((i) => i >= 0);
  const wanted = (params.faults ?? ['wrong-letter', 'missing-sign']).filter((f) => f === 'wrong-letter' || signed.length > 0);
  const fault = rng.pick(wanted.length > 0 ? wanted : ['wrong-letter' as const]);

  let index: number;
  let wrong: Pitch;
  let explanation: string;
  const right = (i: number) => scale[i]!;
  if (fault === 'missing-sign') {
    index = rng.pick([...new Set(signed)]);
    const correct = right(index);
    wrong = { ...correct, accidental: 0 };
    const sign = correct.accidental === 1 ? 'sharp' : 'flat';
    explanation = `Note ${index + 1} of ${keyName} should be ${pitch.displayPitchClass(correct)}. This note is ${nameWithNatural(wrong)}. The key signature makes every ${correct.letter} ${sign}.`;
  } else {
    index = rng.pick([1, 2, 3, 4, 5, 6]);
    const dir = rng.pick([-1, 1] as const);
    const correct = right(index);
    const moved = pitch.pitchAtStavePosition(pitch.stavePosition(correct, clef) + dir, clef);
    wrong = { ...moved, accidental: signAccidental(key, moved.letter) };
    explanation = `Note ${index + 1} of ${keyName} should be ${pitch.displayPitchClass(correct)}. This note is ${pitch.displayPitchClass(wrong)}.`;
  }

  const notes = scale.map((p, i) => (i === index ? wrong : p));
  return {
    type: 'spot-mistake',
    prompt: `This should be the scale of ${keyName}, going up. Tap the one wrong note.`,
    payload: {
      passage: {
        clef,
        key,
        time: { ...T44 },
        bars: [
          { events: notes.slice(0, 4).map(crotchet) },
          { events: notes.slice(4).map(crotchet) },
        ],
      },
      select: 'event',
      mistake: { bar: Math.floor(index / 4), event: index % 4 },
      explanation,
    },
  };
}

export const spotScaleNote: QuestionGenerator<SpotScaleNoteParams> = {
  id: 'spot-scale-note',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
