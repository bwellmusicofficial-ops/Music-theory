import { pitch } from '@/engine/pitch';
import type { Clef, Pitch, Rng, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Face } from '@/lesson/questions/shared';
import { where } from '@/lesson/questions/notation/reason-helpers';
import { placeOptions, takeDistinct } from '../shared/options';
import { LETTERS, nat, semibreveBar } from '../shared/pitch-utils';
import { term } from '../shared/terms';
import { paramsSchema, type SameNoteOtherClefParams } from './params';

const inRange = (p: Pitch, clef: Clef): boolean => {
  const pos = pitch.stavePosition(p, clef);
  return pos >= -4 && pos <= 12;
};

/** Natural notes that sit within two ledger lines of both clefs (A3 to E4). */
export const SHARED_NOTES: Pitch[] = [2, 3, 4, 5]
  .flatMap((octave) => LETTERS.map((l) => nat(l, octave)))
  .filter((p) => inRange(p, 'treble') && inRange(p, 'bass'))
  .sort((a, b) => pitch.toMidi(a) - pitch.toMidi(b));

const name = (p: Pitch): string => pitch.displayPitchClass(p);

/**
 * docs/generators-grade-1.md 3.8. Rng calls: (1) only for `either`: pick the clef;
 * (2) pick the note; (3) the final shuffle.
 */
export function generate(params: SameNoteOtherClefParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const options = params.options ?? 3;
  const from: Clef = params.from === 'treble' || params.from === 'bass' ? params.from : rng.pick(['treble', 'bass'] as const);
  const to: Clef = from === 'treble' ? 'bass' : 'treble';
  const shown = rng.pick(SHARED_NOTES);
  const posFrom = pitch.stavePosition(shown, from);
  const posTo = pitch.stavePosition(shown, to);
  const stave = term('stave', t);
  // where() writes a plain "stave"; link it so the US swap works.
  const whereText = (pos: number): string => where(pos).replace(/\bstave\b/g, stave);

  const samePlace = pitch.pitchAtStavePosition(posFrom, to);
  const octaveAway = [1, -1].map((d) => ({ ...shown, octave: shown.octave + d })).find((p) => inRange(p, to));
  const above = pitch.pitchAtStavePosition(posTo + 1, to);
  const below = pitch.pitchAtStavePosition(posTo - 1, to);
  const candidates: { p: Pitch; reason: string }[] = [
    {
      p: samePlace,
      reason: `That note is ${whereText(posFrom)} of the ${to} ${stave}, the same place as the shown note, but the clef changes its name. It is ${name(samePlace)}, not ${name(shown)}.`,
    },
    ...(octaveAway
      ? [
          {
            p: octaveAway,
            reason: `That is a ${name(shown)}, but in a different octave. The shown note is ${whereText(posFrom)} of the ${from} ${stave}; the same sound in ${to} clef is ${whereText(posTo)}.`,
          },
        ]
      : []),
    {
      p: above,
      reason: `That is ${name(above)}, a step higher than the shown note, ${name(shown)}. The same sound in ${to} clef is ${whereText(posTo)}.`,
    },
    {
      p: below,
      reason: `That is ${name(below)}, a step lower than the shown note, ${name(shown)}. The same sound in ${to} clef is ${whereText(posTo)}.`,
    },
  ].filter((c) => inRange(c.p, to));
  const wrong = takeDistinct(candidates, options - 1, (c) => pitch.formatPitch(c.p), [pitch.formatPitch(shown)]);

  const face = (p: Pitch): Face => ({ kind: 'passage', passage: semibreveBar([{ ...p }], to) });
  const placed = placeOptions<Face>(rng, face(shown), wrong.map((w) => ({ face: face(w.p), reason: w.reason })));
  return {
    type: 'multiple-choice',
    prompt: `This note is in ${from} clef. Which ${stave} shows the same note in ${to} clef?`,
    payload: { exhibit: { kind: 'passage', passage: semibreveBar([{ ...shown }], from) }, ...placed },
  };
}

export const sameNoteOtherClef: QuestionGenerator<SameNoteOtherClefParams> = {
  id: 'same-note-other-clef',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
