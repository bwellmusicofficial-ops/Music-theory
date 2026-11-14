import { pitch as pitchEngine } from '@/engine/pitch';
import type { Pitch } from '@/engine/types';

/** Pitch conversions for the audio layer. C4 = MIDI 60, A4 = 440 Hz. */

/** MIDI note number of a spelled pitch. Cb4 = 59, B#3 = 60. */
export const pitchToMidi: (pitch: Pitch) => number = pitchEngine.toMidi;

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
