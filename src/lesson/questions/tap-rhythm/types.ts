import type { TapResult } from '@/components/rhythm-pad';
import type { Bar, TimeSignature } from '@/engine/types';

/** docs/question-payloads.md 2.6 */
export interface TapRhythmPayload {
  time: TimeSignature;
  /** 1 to 4 full bars. Pitches are ignored; use B4. */
  bars: Bar[];
  /** Felt beats per minute, 50 to 120. */
  bpm: number;
  /** Bars of click before the learner starts. Default 1. */
  countInBars?: 1 | 2;
  /** true: the rhythm is shown as notation. */
  showNotation: boolean;
  /** true: the rhythm is played once before the count-in. */
  listenFirst: boolean;
  /** How far from the beat a tap may land and still count, in ms. Default 150. */
  toleranceMs?: number;
}

/** Exactly what the rhythm pad reports (docs/architecture.md). */
export type TapRhythmAnswer = TapResult;

export const DEFAULT_TOLERANCE_MS = 150;
