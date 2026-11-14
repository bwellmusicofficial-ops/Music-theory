import type { Clef, Key, Pitch, PitchClass } from '@/engine/types';

/** docs/question-payloads.md 2.4 */
export type NoteOnStavePayload = NoteOnStaveIdentify | NoteOnStavePlace;

export interface NoteOnStaveIdentify {
  mode: 'identify';
  clef: Clef;
  /** Sets the key signature drawn. Use C major for none. */
  key: Key;
  /** The note shown. Its accidental is the sounding one (in G major the top-line F is F sharp). */
  pitch: Pitch;
  /** true: the learner must also choose sharp, flat or natural. false: letters only. */
  accidentals: boolean;
}

export interface NoteOnStavePlace {
  mode: 'place';
  clef: Clef;
  key: Key;
  /** The note asked for. The prompt must name it. */
  target: PitchClass;
  /** Omit to accept the target in any octave. Give it only when the prompt makes the octave clear. */
  octave?: number;
  /** true: the learner can add a sharp or flat sign. */
  accidentals: boolean;
}

export type NoteOnStaveAnswer =
  | { mode: 'identify'; name: PitchClass }
  | { mode: 'place'; pitch: Pitch };
