import { pitch } from '@/engine/pitch';
import type { Letter, Pitch, Rng, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { PlayKeyboardPayload } from '@/lesson/questions/play-keyboard';
import { LETTERS, OCTAVE_FOUR, nat, semitoneStep, toneStep } from '../shared/pitch-utils';
import { term } from '../shared/terms';
import { paramsSchema, type KeyboardFindParams } from './params';

/** The musical alphabet is a cycle: A B C D E F G, then A again. */
const ALPHABET: readonly Letter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** The groups of black keys in an octave from C4, read from the keyboard: twos and threes. */
export function blackKeyGroups(): { twos: Pitch[]; threes: Pitch[] } {
  const groups: Pitch[][] = [];
  LETTERS.forEach((l, i) => {
    const p = nat(l, 4);
    const next = i + 1 < LETTERS.length ? nat(LETTERS[i + 1]!, 4) : nat('C', 5);
    if (pitch.toMidi(next) - pitch.toMidi(p) !== 2) return;
    const black: Pitch = { ...p, accidental: 1 };
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && pitch.toMidi(black) - pitch.toMidi(prev) === 2) last.push(black);
    else groups.push([black]);
  });
  return { twos: groups.find((g) => g.length === 2)!, threes: groups.find((g) => g.length === 3)! };
}

const base = (low: Pitch, high: Pitch, targets: Pitch[], mode: 'sequence' | 'together', octave: 'exact' | 'any', showLabels: boolean): PlayKeyboardPayload => ({
  low,
  high,
  showLabels,
  targets,
  mode,
  octave,
});

/** docs/generators-grade-1.md 3.10: the rng calls per `ask` are in the table there. */
export function generate(params: KeyboardFindParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const labels = params.showLabels ?? false;
  const letters = params.letters ?? [...LETTERS];
  const range = { low: nat('C', 4), high: nat('B', 4) };

  switch (params.ask) {
    case 'find-every': {
      const letter = rng.pick(letters);
      const a = rng.int(3, 4);
      const low = nat('C', a);
      const high = nat('C', a + 2);
      const targets = [a, a + 1, a + 2]
        .map((o) => nat(letter, o))
        .filter((p) => pitch.toMidi(p) >= pitch.toMidi(low) && pitch.toMidi(p) <= pitch.toMidi(high));
      return { type: 'play-keyboard', prompt: `Play every ${letter} on this keyboard.`, payload: base(low, high, targets, 'together', 'exact', labels) };
    }
    case 'black-keys': {
      const groups = params.groups ?? ['twos', 'threes'];
      const g = rng.pick(groups);
      const targets = blackKeyGroups()[g];
      return {
        type: 'play-keyboard',
        prompt: `Play the group of ${g === 'twos' ? 'two' : 'three'} black keys.`,
        payload: base(range.low, range.high, targets, 'together', 'exact', labels),
      };
    }
    case 'next-note':
    case 'previous-note': {
      const letter = rng.pick(letters);
      const at = ALPHABET.indexOf(letter);
      const answer = ALPHABET[(at + (params.ask === 'next-note' ? 1 : 6)) % 7]!;
      return {
        type: 'play-keyboard',
        prompt: `Play the note ${params.ask === 'next-note' ? 'after' : 'before'} ${letter} in the musical alphabet.`,
        payload: base(range.low, range.high, [nat(answer, 4)], 'sequence', 'any', labels),
      };
    }
    case 'step': {
      const steps = params.steps ?? ['tone', 'semitone'];
      const directions = params.directions ?? ['up', 'down'];
      const start = rng.pick(OCTAVE_FOUR);
      const step = rng.pick(steps);
      const direction = rng.pick(directions);
      const target = step === 'tone' ? toneStep(start, direction) : semitoneStep(start, direction);
      return {
        type: 'play-keyboard',
        prompt: `Play the note a ${term(step, t)} ${direction === 'up' ? 'above' : 'below'} ${pitch.displayPitchClass(start)}.`,
        payload: base(nat('A', 3), nat('D', 5), [target], 'sequence', 'exact', labels),
      };
    }
  }
}

export const keyboardFind: QuestionGenerator<KeyboardFindParams> = {
  id: 'keyboard-find',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
