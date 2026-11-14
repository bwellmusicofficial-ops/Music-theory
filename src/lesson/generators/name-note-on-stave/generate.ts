import { pitch } from '@/engine/pitch';
import type { Accidental, Rng } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { NoteOnStavePayload } from '@/lesson/questions/note-on-stave';
import { C_MAJOR, candidatePositions, paramsSchema, type NameNoteOnStaveParams } from './params';

/** Accidentals that are not worth drawing in a first lesson: E sharp, B sharp, C flat, F flat. */
const AWKWARD = new Set(['E1', 'B1', 'C-1', 'F-1']);

/**
 * docs/question-payloads.md 3.1. The order of rng calls is part of the
 * specification: one `pick` for the position, then one `pick` for the
 * accidental when `accidentals` is true. Nothing else draws.
 */
export function generate(params: NameNoteOnStaveParams, rng: Rng): GeneratedQuestion {
  const { mode, clef, low, high } = params;
  const key = params.key ?? C_MAJOR;
  const accidentals = params.accidentals ?? false;
  const lo = pitch.stavePosition(low, clef);
  const hi = pitch.stavePosition(high, clef);
  const candidates = candidatePositions(lo, hi, params.positions ?? 'all');

  const pos = rng.pick(candidates);
  const natural = pitch.pitchAtStavePosition(pos, clef);

  const signature = pitch.keySignature(key);
  let a: Accidental;
  if (accidentals) {
    const drawn = rng.pick<Accidental>([-1, 0, 1]);
    a = AWKWARD.has(`${natural.letter}${drawn}`) ? 0 : drawn;
  } else {
    a = pitch.signatureAccidentals(signature).find((pc) => pc.letter === natural.letter)?.accidental ?? 0;
  }
  const note = { letter: natural.letter, accidental: a, octave: natural.octave };
  const needsSigns = accidentals || signature !== 0;

  if (mode === 'identify') {
    const payload: NoteOnStavePayload = { mode: 'identify', clef, key, pitch: note, accidentals: needsSigns };
    return { type: 'note-on-stave', payload };
  }
  const target = { letter: natural.letter, accidental: a };
  const payload: NoteOnStavePayload = { mode: 'place', clef, key, target, accidentals: needsSigns };
  return {
    type: 'note-on-stave',
    payload,
    prompt: `Put the note **${pitch.displayPitchClass(target)}** on the stave.`,
  };
}

export const nameNoteOnStave: QuestionGenerator<NameNoteOnStaveParams> = {
  id: 'name-note-on-stave',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
