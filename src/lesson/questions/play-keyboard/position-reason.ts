import { pitch } from '@/engine/pitch';
import type { Pitch } from '@/engine/types';

/**
 * Reason text that describes keys by where they are and what colour they are,
 * never by letter or accidental: for lessons before the note names are taught
 * (`nameNotes: false`). Counts are in keys of one colour: white keys between two
 * white keys, black keys between two black keys.
 */

const WHITE_INDEX: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const BLACK_INDEX: Record<number, number> = { 1: 0, 3: 1, 6: 2, 8: 3, 10: 4 };

export type KeyColour = 'white' | 'black';

export const colourOf = (midi: number): KeyColour => (((midi % 12) + 12) % 12 in WHITE_INDEX ? 'white' : 'black');

/** Position of a key among the keys of its own colour, counted from the bottom of the MIDI range. */
function indexAmongOwnColour(midi: number): number {
  const chroma = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12);
  return colourOf(midi) === 'white' ? octave * 7 + WHITE_INDEX[chroma]! : octave * 5 + BLACK_INDEX[chroma]!;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const countWord = (n: number): string => WORDS[n] ?? String(n);

/** "two keys", "one key"; the colour is added when it is not obvious ("two white keys"). */
function keys(n: number, colour: KeyColour | null): string {
  const noun = colour ? `${colour} key` : 'key';
  return `${countWord(n)} ${noun}${n === 1 ? '' : 's'}`;
}

/** Why `got` is not `wanted`, as a sentence starting with `subject` ("That key", "Note 2"). */
export function sequenceReasonByPosition(subject: string, wanted: number, got: number): string {
  const colourWanted = colourOf(wanted);
  const colourGot = colourOf(got);
  if (colourWanted !== colourGot) {
    return `${subject} is a ${colourGot} key, but this one needs a ${colourWanted} key.`;
  }
  const n = Math.abs(indexAmongOwnColour(got) - indexAmongOwnColour(wanted));
  const side = got > wanted ? 'right' : 'left';
  // Black keys are counted as black keys so the learner knows what to count.
  return `${subject} is ${keys(n, colourWanted === 'black' ? 'black' : null)} too far to the ${side}.`;
}

/** What the keys wanted for a chord look like, without naming them. */
function describeTargets(targets: readonly Pitch[]): string {
  const colours = new Set(targets.map((t) => colourOf(pitch.toMidi(t))));
  if (colours.size === 1) {
    const colour = [...colours][0]!;
    return colour === 'black'
      ? `the group you want is the ${countWord(targets.length)} black keys`
      : `the keys you want are all white keys`;
  }
  return 'the keys you want are a mix of black and white keys';
}

/** Why a chord key does not belong, by colour when it differs from every target, else by distance. */
export function chordReasonByPosition(wrong: Pitch, targets: readonly Pitch[]): string {
  const midi = pitch.toMidi(wrong);
  const colour = colourOf(midi);
  const sameColour = targets.filter((t) => colourOf(pitch.toMidi(t)) === colour);
  if (sameColour.length === 0) {
    return `One of those is a ${colour} key: ${describeTargets(targets)}.`;
  }
  const nearest = sameColour
    .map((t) => ({ t, d: Math.abs(indexAmongOwnColour(pitch.toMidi(t)) - indexAmongOwnColour(midi)) }))
    .sort((a, b) => a.d - b.d)[0]!;
  const side = midi > pitch.toMidi(nearest.t) ? 'right' : 'left';
  return `One of those keys is ${keys(nearest.d, colour === 'black' ? 'black' : null)} too far to the ${side} of the nearest key you need.`;
}

export function tooFewReason(chosen: number, needed: number): string {
  return `You chose ${chosen} ${chosen === 1 ? 'key' : 'keys'}, but this needs ${needed} keys.`;
}

export const SAME_SOUND_REASON =
  'Two of your keys sound like the same note in different places, so one of the notes you need is missing.';
