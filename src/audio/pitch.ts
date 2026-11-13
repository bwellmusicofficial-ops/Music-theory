import type { Letter, Pitch } from '@/engine/types';

/**
 * Local pitch conversions for the audio layer. These deliberately do not use
 * `src/engine/pitch` (built in parallel); swap for `pitch.toMidi` later if
 * desired. C4 = MIDI 60, A4 = 440 Hz.
 */

const LETTER_CHROMA: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI note number of a spelled pitch. Cb4 = 59, B#3 = 60. */
export function pitchToMidi(pitch: Pitch): number {
  return 12 * (pitch.octave + 1) + LETTER_CHROMA[pitch.letter] + pitch.accidental;
}

/** Equal-tempered frequency in Hz for a MIDI note number (A4 = 69 = 440 Hz). */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function pitchToFrequency(pitch: Pitch): number {
  return midiToFrequency(pitchToMidi(pitch));
}

const SHARP_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'] as const;

/** Salamander-style file stem for a MIDI number: 61 -> "Cs4", 66 -> "Fs4". */
export function midiToSampleStem(midi: number): string {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Tone-style note name using sharps: 66 -> "F#4". */
export function midiToToneName(midi: number): string {
  return midiToSampleStem(midi).replace('s', '#');
}
