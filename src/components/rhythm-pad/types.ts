import type { ReactNode } from 'react';
import type { Bar, TimeSignature } from '@/engine/types';

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
  /** Rendered above the tap target (the parent shows the notation here). */
  children?: ReactNode;
}
