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
  /**
   * Metronome click on felt beats, with an accented first beat. `startTime` is
   * the audio-clock time (see `now()`) of the first click. `options.startAt`
   * asks for that first click at a chosen audio-clock time instead of the
   * default short lead (never earlier than now); `startTime` is what was used.
   * `stopAt(time)` stops the click from `time` on; it only works if called more
   * than a third of a second before `time`, because clicks are committed to the
   * audio clock slightly ahead.
   */
  startMetronome(
    time: TimeSignature,
    bpm: number,
    onBeat?: (beat: number) => void,
    options?: { startAt?: number },
  ): { stop(): void; startTime: number; stopAt(time: number): void };
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
  /** Downloads the audio library ahead of the first gesture; silent and gesture-free. */
  preload(): Promise<void>;
}

export type UiSound = Parameters<AudioEngine['playUi']>[0];
