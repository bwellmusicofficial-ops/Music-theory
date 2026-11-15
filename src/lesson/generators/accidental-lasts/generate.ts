import { pitch } from '@/engine/pitch';
import type { Accidental, Bar, Clef, Pitch, Rng, ScoreEvent, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Face } from '@/lesson/questions/shared';
import { C_MAJOR_KEY, T44, dur } from '../shared/bars';
import { candidatePositions } from '../name-note-on-stave/params';
import { placeOptions } from '../shared/options';
import { AWKWARD, nameWithNatural, nat } from '../shared/pitch-utils';
import { plainTerm, term } from '../shared/terms';
import { paramsSchema, type AccidentalLastsParams } from './params';

const DEFAULT_RANGE: Record<Clef, { low: Pitch; high: Pitch }> = {
  treble: { low: nat('E', 4), high: nat('F', 5) },
  bass: { low: nat('G', 2), high: nat('A', 3) },
  alto: { low: nat('F', 3), high: nat('G', 4) },
  tenor: { low: nat('D', 3), high: nat('E', 4) },
};

const text = (s: string): Face => ({ kind: 'text', text: s });
const signWord = (a: Accidental): string => (a === 1 ? 'sharp' : 'flat');

const note = (p: Pitch, extra: { showAccidental?: boolean } = {}): ScoreEvent => ({
  kind: 'note',
  pitches: [p],
  duration: dur('crotchet'),
  ...extra,
});

/**
 * docs/generators-grade-1.md 3.13. Rng calls: (1) pick the stave position; (2) pick the
 * sign from the valid ones; (3) only for `either`: pick same-bar or next-bar; (4) one pick of
 * a step offset for every filler note, left to right (bar 1, then bar 2).
 */
export function generate(params: AccidentalLastsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const clef = (params.clef ?? 'treble') as 'treble' | 'bass';
  const range = { ...DEFAULT_RANGE[clef], ...(params.low && params.high ? { low: params.low, high: params.high } : {}) };
  const options = params.options ?? 3;
  const candidates = candidatePositions(pitch.stavePosition(range.low, clef), pitch.stavePosition(range.high, clef), 'all');

  const pos = rng.pick(candidates);
  const letter = pitch.pitchAtStavePosition(pos, clef);
  const sign = rng.pick(([-1, 1] as const).filter((a) => !AWKWARD.has(`${letter.letter}${a}`)));
  const across = params.across && params.across !== 'either' ? params.across : rng.pick(['same-bar', 'next-bar'] as const);
  const filler = (): Pitch => {
    const offsets = [-2, -1, 1, 2].filter((o) => pos + o >= -4 && pos + o <= 12);
    return pitch.pitchAtStavePosition(pos + rng.pick(offsets), clef);
  };

  const marked: Pitch = { ...letter, accidental: sign };
  const plain: Pitch = { ...letter, accidental: 0 };
  const other: Pitch = { ...letter, accidental: sign === 1 ? -1 : 1 };
  const bars: Bar[] = [];
  let prompt: string;
  let wrongs: { p: Pitch; reason: string }[];
  let correct: Pitch;
  const L = letter.letter;
  const barLink = term('bar', t);
  const opposite = signWord(sign === 1 ? -1 : 1);

  if (across === 'same-bar') {
    bars.push({ events: [note(marked), note(filler()), note(marked, { showAccidental: false }), note(filler())] });
    prompt = 'Name the third note.';
    wrongs = [
      {
        p: plain,
        reason: `The ${signWord(sign)} earlier in the ${barLink} lasts to the ${plainTerm('bar-line', 'bar line')}, so this ${L} is still ${pitch.displayPitchClass({ letter: marked.letter, accidental: marked.accidental })}, even with no sign.`,
      },
      {
        p: other,
        reason: `There is no ${opposite} anywhere here. The ${signWord(sign)} in the first ${barLink} still applies, so this note is ${pitch.displayPitchClass({ letter: marked.letter, accidental: marked.accidental })}.`,
      },
    ];
    correct = marked;
  } else {
    bars.push({ events: [note(filler()), note(marked), note(filler()), note(filler())] });
    bars.push({ events: [note(plain, { showAccidental: false }), note(filler()), note(filler()), note(filler())] });
    prompt = `Name the first note of ${barLink} 2.`;
    wrongs = [
      {
        p: marked,
        reason: `An accidental lasts only to the end of its ${barLink}. The ${L} in ${barLink} 2 has no sign, so it is plain ${L}.`,
      },
      {
        p: other,
        reason: `There is no ${opposite} in this music. The ${L} in ${barLink} 2 has no sign, so it is plain ${L}.`,
      },
    ];
    correct = plain;
  }

  const placed = placeOptions<Face>(
    rng,
    text(nameWithNatural(correct)),
    wrongs
      .filter((w) => !AWKWARD.has(`${w.p.letter}${w.p.accidental}`))
      .slice(0, options - 1)
      .map((w) => ({ face: text(nameWithNatural(w.p)), reason: w.reason })),
  );
  return {
    type: 'multiple-choice',
    prompt,
    payload: {
      exhibit: { kind: 'passage', passage: { clef, key: C_MAJOR_KEY, time: { ...T44 }, bars } },
      ...placed,
    },
  };
}

export const accidentalLasts: QuestionGenerator<AccidentalLastsParams> = {
  id: 'accidental-lasts',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
