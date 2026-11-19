import type { ReactNode, Ref } from 'react';
import type { Bar, TimeSignature } from '@/engine/types';
import type { PadClock } from './pad-clock';

export interface TapResult {
  /** One entry per expected onset: signed error in ms (negative = early), or null if missed. */
  errorsMs: (number | null)[];
  extraTaps: number;
  /** 0..1 */
  accuracy: number;
}

/** Live verdict for one expected onset. */
export type OnsetVerdict = 'perfect' | 'close' | 'miss';

export interface OnsetJudgement {
  /** Index into the expected onsets (see `onsetEvents` for the bar and event). */
  index: number;
  verdict: OnsetVerdict;
  /** Signed error in ms (negative = early), or null when no tap was matched. */
  errorMs: number | null;
}

export type PadPhase = 'idle' | 'count-in' | 'playing' | 'done';

/**
 * What a parent can do with the pad through `ref`. The pad is still the one that listens for taps and
 * scores them; the parent only decides when a performance begins and ends.
 */
export interface RhythmPadHandle {
  /**
   * Begins a performance (count-in first), exactly as the pad's own Start button does. Resolves once the
   * count-in is under way. Does nothing while a performance is running. Sound can only begin after a user
   * gesture, so call it from a tap handler, or after something else has unlocked the audio (Tap It's
   * Start press does); the pad also unlocks and loads the engine, which is harmless when already done.
   */
  start(): Promise<void>;
  /** Ends a performance early without calling `onComplete` and returns the pad to idle. Does nothing when idle or done. */
  stop(): void;
}

export interface RhythmPadProps {
  bars: Bar[];
  time: TimeSignature;
  bpm: number;
  countInBars?: number;
  /** Called when the performance ends. */
  onComplete: (result: TapResult) => void;
  /** 'perform' (default) is scored; 'free' is an unscored play-along. */
  mode?: 'perform' | 'free';
  /** Milliseconds subtracted from tap times before scoring. Default 0. */
  latencyOffsetMs?: number;
  /** Whether the click continues after the count-in. Default true. */
  metronome?: boolean;
  /** Free mode: called with the running tap count after each tap. */
  onTap?: (count: number) => void;
  /** Perform mode scoring thresholds. Defaults 60 and 180 ms: 'perfect' within perfectMs, 'close' within toleranceMs. */
  perfectMs?: number;
  toleranceMs?: number;
  /**
   * How far from an onset a tap is still matched to it. Default `toleranceMs`.
   * A tap matched beyond `toleranceMs` is a 'miss' that still carries its signed
   * error, so the UI can say "Early" or "Late".
   */
  matchWindowMs?: number;
  /**
   * Perform mode, live: once per expected onset, as soon as it is decided (a tap
   * is matched, or its window passes with no tap). Same thresholds, latency offset
   * and matching rules as the final TapResult, so the verdicts equal it.
   */
  onOnsetJudged?: (judgement: OnsetJudgement) => void;
  /** Perform mode, live: a tap that matched no onset. */
  onExtraTap?: () => void;
  /**
   * Perform mode, live: an expected onset has just come due (its time on the clock).
   * Drives a "now" marker on the notation. Not called in the count-in.
   */
  onOnsetDue?: (index: number) => void;
  /**
   * Each felt beat as it clicks. `beatIndex` is 0-based within the bar. `barIndex`
   * is 0-based within the passage; negative during the count-in (-1 is the last
   * count-in bar). In free mode it wraps with the passage.
   */
  onBeat?: (beatIndex: number, barIndex: number) => void;
  /** Reports idle, count-in, playing and done (free mode: idle and playing). */
  onPhase?: (phase: PadPhase) => void;
  /** From LearnerSettings.reducedMotion; the OS setting is honoured as well. No pulsing or flashing. */
  reducedMotion?: boolean;
  /** Show the pad's own "Try again" after a performance. Default true; a parent that owns retrying (the lesson player) passes false. */
  showRetry?: boolean;
  /** Pass a ref to start and stop the pad from the parent. */
  ref?: Ref<RhythmPadHandle>;
  /** Start as soon as the pad mounts, as if the parent had called `start()`. Default false. */
  autoStart?: boolean;
  /**
   * 'full' (default) shows the pad's Start and Try again buttons and its own result block. 'minimal' shows
   * none of them: the parent starts the pad (`ref` or `autoStart`) and shows the result itself. The tap
   * surface, beat dots, tally, verdict chip and live region stay, and so does Stop in free mode.
   */
  chrome?: 'full' | 'minimal';
  /** 'large' makes the tap surface taller and fill the width, for a game. Default 'default'. */
  tapSize?: 'default' | 'large';
  /**
   * A metronome owned by the parent (see `createPadClock`). The pad then starts no click of its own: its
   * count-in begins on the next bar line of that click, and `metronome` is ignored (the parent decides when
   * the click stops). Several pads in a row sharing one clock hear one unbroken click. Perform mode only.
   */
  clock?: PadClock;
  /** Rendered above the tap target (the parent shows the notation here). */
  children?: ReactNode;
}
