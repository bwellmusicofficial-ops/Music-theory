import { rhythm } from '@/engine/rhythm';
import type { Bar, TimeSignature } from '@/engine/types';
import type { TapResult } from './types';

export const DEFAULT_PERFECT_MS = 60;
export const DEFAULT_TOLERANCE_MS = 180;
export const DEFAULT_EXTRA_PENALTY = 0.5;

export interface AccuracyOptions {
  /** Errors up to this size score 1. */
  perfectMs?: number;
  /** Errors at or beyond this size score 0. */
  toleranceMs?: number;
  /** Each extra tap subtracts this fraction of one onset's weight. */
  extraPenalty?: number;
}

/** Expected onset times on the audio clock: score onsets, then the count-in, then `startSeconds`. */
export function expectedOnsets(
  bars: Bar[],
  time: TimeSignature,
  bpm: number,
  countInSeconds: number,
  startSeconds = 0,
): number[] {
  return rhythm.onsetTimes(bars, time, bpm).map((t) => t + countInSeconds + startSeconds);
}

const EPSILON = 1e-9;

/**
 * Pairs each expected onset (in time order) with the nearest unused tap within
 * tolerance. A tap is used at most once; unused taps are extra. Errors are
 * signed (tap minus expected, negative = early) in ms, null when missed.
 */
export function matchTaps(
  expectedSeconds: readonly number[],
  tapSeconds: readonly number[],
  toleranceMs: number,
): { errorsMs: (number | null)[]; extraTaps: number } {
  const taps = [...tapSeconds].sort((a, b) => a - b);
  const used = new Array<boolean>(taps.length).fill(false);
  const order = expectedSeconds.map((_, i) => i).sort((a, b) => expectedSeconds[a] - expectedSeconds[b]);
  const errorsMs: (number | null)[] = new Array(expectedSeconds.length).fill(null);

  for (const i of order) {
    let best = -1;
    let bestAbs = Infinity;
    for (let j = 0; j < taps.length; j++) {
      if (used[j]) continue;
      const abs = Math.abs(taps[j] - expectedSeconds[i]) * 1000;
      // Strict < keeps the earlier tap on an exact tie.
      if (abs <= toleranceMs + EPSILON && abs < bestAbs) {
        best = j;
        bestAbs = abs;
      }
    }
    if (best >= 0) {
      used[best] = true;
      errorsMs[i] = (taps[best] - expectedSeconds[i]) * 1000;
    }
  }
  return { errorsMs, extraTaps: used.filter((u) => !u).length };
}

/** 0..1. See AccuracyOptions; missed onsets score 0, no onsets and no taps scores 1. */
export function accuracy(
  errorsMs: readonly (number | null)[],
  extraTaps: number,
  options: AccuracyOptions = {},
): number {
  const perfect = options.perfectMs ?? DEFAULT_PERFECT_MS;
  const tolerance = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const penalty = options.extraPenalty ?? DEFAULT_EXTRA_PENALTY;
  if (errorsMs.length === 0) return extraTaps > 0 ? 0 : 1;
  let total = 0;
  for (const e of errorsMs) {
    if (e === null) continue;
    const a = Math.abs(e);
    if (a <= perfect) total += 1;
    else if (a < tolerance) total += 1 - (a - perfect) / (tolerance - perfect);
  }
  total -= extraTaps * penalty;
  return Math.min(1, Math.max(0, total / errorsMs.length));
}

/** Match then score. `tapSeconds` must already have the latency offset removed. */
export function scoreTaps(
  expectedSeconds: readonly number[],
  tapSeconds: readonly number[],
  options: AccuracyOptions = {},
): TapResult {
  const tolerance = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const { errorsMs, extraTaps } = matchTaps(expectedSeconds, tapSeconds, tolerance);
  return { errorsMs, extraTaps, accuracy: accuracy(errorsMs, extraTaps, options) };
}

/** Applies a latency offset: a device that reports taps `offsetMs` late is corrected back. */
export function applyLatency(tapSeconds: readonly number[], offsetMs: number): number[] {
  return tapSeconds.map((t) => t - offsetMs / 1000);
}

export type Judgement = 'early' | 'on-time' | 'late' | 'missed';

export function judge(errorMs: number | null, perfectMs = DEFAULT_PERFECT_MS): Judgement {
  if (errorMs === null) return 'missed';
  if (Math.abs(errorMs) <= perfectMs) return 'on-time';
  return errorMs < 0 ? 'early' : 'late';
}

export const CALIBRATION_MIN_MS = -50;
export const CALIBRATION_MAX_MS = 300;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Calibration offset from per-click signed errors (null = missed): median of
 * the last `use` clicks' errors that were hit, rounded, clamped to -50..300.
 * Returns null when fewer than `minHits` of them were hit.
 */
export function calibrationOffset(
  errorsMs: readonly (number | null)[],
  use = 6,
  minHits = 3,
): number | null {
  const hits = errorsMs.slice(-use).filter((e): e is number => e !== null);
  if (hits.length < minHits) return null;
  return Math.min(CALIBRATION_MAX_MS, Math.max(CALIBRATION_MIN_MS, Math.round(median(hits))));
}
