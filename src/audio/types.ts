import type { Passage, Pitch, TimeSignature } from '@/engine/types';

export interface AudioEngine {
  /** Must be called from a user gesture before anything sounds (mobile browsers). */
  unlock(): Promise<void>;
  isUnlocked(): boolean;
  /** Loads piano samples; resolves when playable. Safe to call repeatedly. */
  load(): Promise<void>;
  /** Immediate note, for keyboard and stave taps. */
  noteOn(pitch: Pitch, velocity?: number): void;
  noteOff(pitch: Pitch): void;
  /** Plays a passage; resolves when it ends or is stopped. `onEvent` drives a cursor. */
  playPassage(
    passage: Passage,
    options: { bpm: number; countInBeats?: number; onEvent?: (bar: number, event: number) => void },
  ): { stop(): void; done: Promise<void> };
  /** Metronome click on felt beats, with an accented first beat. */
  startMetronome(time: TimeSignature, bpm: number, onBeat?: (beat: number) => void): { stop(): void };
  /** Short interface sounds; silent when muted. */
  playUi(sound: 'correct' | 'wrong' | 'tap' | 'complete'): void;
  setMuted(muted: boolean): void;
  /** Seconds on the audio clock, for timing taps against scheduled beats. */
  now(): number;
}

/** Extra, non-contract diagnostics implemented by the engine. */
export interface AudioEngineVoice {
  /** Which piano voice is active: real samples, or the built-in synth fallback. */
  voice(): 'sampled' | 'synth';
}

export type UiSound = Parameters<AudioEngine['playUi']>[0];
