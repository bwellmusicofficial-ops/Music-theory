import { pitch } from '@/engine/pitch';
import type { PlayKeyboardPayload } from './types';

/**
 * The line under the prompt that says how to answer, worded for the kind of question (plain English,
 * UK terms, readable by an 11-year-old). It describes how to use the keys; the prompt says what to find.
 *
 * - `sequence`, one note: "Press the key that plays the note."
 * - `sequence`, several: "Play the 8 notes one after another."
 * - `together`, every key shares one note name (find every C): choose each, undo by pressing again.
 * - `together`, all black keys (a group of twos or threes): the same, naming the black keys.
 * - `together`, anything else is a chord: turn each key on or off.
 *
 * `octave: 'any'` adds that any octave will do. `hideCheck` drops the "then press Check" part for
 * hosts that read the answer as it changes.
 */
export function playKeyboardInstruction(
  payload: Pick<PlayKeyboardPayload, 'mode' | 'octave' | 'targets'>,
  hideCheck: boolean,
): string {
  const { mode, octave, targets } = payload;
  const anyOctave = octave === 'any' ? ' Any octave is fine.' : '';
  if (mode === 'sequence') {
    const n = targets.length;
    return n === 1
      ? `Press the key that plays the note.${anyOctave}`
      : `Play the ${n} notes one after another.${anyOctave}`;
  }
  const then = hideCheck ? '.' : ', then press Check.';
  const sameNote = targets.every((t) => pitch.chroma(t) === pitch.chroma(targets[0]!));
  if (sameNote) return `Press each key to choose it (press again to undo)${then}${anyOctave}`;
  // A group of black keys: all black, each a tone above the last. (An all-black chord is spaced wider.)
  const midis = targets.map((t) => pitch.toMidi(t)).sort((a, b) => a - b);
  if (targets.every((t) => t.accidental !== 0) && midis.every((m, i) => i === 0 || m - midis[i - 1]! === 2)) {
    return `Press each black key to choose it (press again to undo)${then}${anyOctave}`;
  }
  return `Press each key of the chord to turn it on or off${then}${anyOctave}`;
}
