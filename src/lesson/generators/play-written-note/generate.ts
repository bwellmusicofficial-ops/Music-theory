import { pitch } from '@/engine/pitch';
import type { Accidental, Rng } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { C_MAJOR, candidatePositions } from '../name-note-on-stave/params';
import { AWKWARD, nat, semibreveBar, signAccidental } from '../shared/pitch-utils';
import { paramsSchema, type PlayWrittenNoteParams } from './params';

/**
 * docs/generators-grade-1.md 3.9. Rng calls: (1) pick the stave position; (2) with
 * `accidentals`, pick -1, 0 or 1; (3) only for `octaves: 2`, `int(0, 1)` for where the
 * note sits in the keyboard.
 */
export function generate(params: PlayWrittenNoteParams, rng: Rng): GeneratedQuestion {
  const { clef, low, high } = params;
  const key = params.key ?? C_MAJOR;
  const accidentals = params.accidentals ?? false;
  const octaves = params.octaves ?? 1;
  const candidates = candidatePositions(pitch.stavePosition(low, clef), pitch.stavePosition(high, clef), params.positions ?? 'all');

  const natural = pitch.pitchAtStavePosition(rng.pick(candidates), clef);
  let a: Accidental;
  if (accidentals) {
    const drawn = rng.pick<Accidental>([-1, 0, 1]);
    a = AWKWARD.has(`${natural.letter}${drawn}`) ? 0 : drawn;
  } else {
    a = signAccidental(key, natural.letter);
  }
  const note = { ...natural, accidental: a };
  const shift = octaves === 2 ? rng.int(0, 1) : 0;
  const lowC = nat('C', note.octave - shift);
  const highC = nat('C', note.octave - shift + octaves);

  return {
    type: 'play-keyboard',
    prompt: 'Play this note on the keyboard.',
    payload: {
      low: lowC,
      high: highC,
      showLabels: params.showLabels ?? false,
      targets: [note],
      mode: 'sequence',
      octave: 'exact',
      passage: semibreveBar([{ ...note }], clef, key),
    },
  };
}

export const playWrittenNote: QuestionGenerator<PlayWrittenNoteParams> = {
  id: 'play-written-note',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
