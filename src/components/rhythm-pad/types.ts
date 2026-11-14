import type { ReactNode } from 'react';
import type { Bar, TimeSignature } from '@/engine/types';

export interface TapResult {
  /** One entry per expected onset: signed error in ms (negative = early), or null if missed. */
  errorsMs: (number | null)[];
  extraTaps: number;
  /** 0..1 */
  accuracy: number;
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
  /** Perform mode scoring windows. Defaults 60 and 180 ms. */
  perfectMs?: number;
  toleranceMs?: number;
  /** Show the pad's own "Try again" after a performance. Default true; a parent that owns retrying (the lesson player) passes false. */
  showRetry?: boolean;
  /** Rendered above the tap target (the parent shows the notation here). */
  children?: ReactNode;
}
