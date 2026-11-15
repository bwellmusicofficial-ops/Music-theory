import { rhythm } from '@/engine/rhythm';
import type { Bar, TimeSignature } from '@/engine/types';
import type { OnsetJudgement, OnsetVerdict, TapResult } from './types';

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
/** Two distances closer than this (ms) are a tie, so float noise cannot pick the later onset. */
const TIE_MS = 1e-6;

export interface MatcherOptions {
  /** Errors up to this size are 'perfect'. Default 60. */
  perfectMs?: number;
  /** Errors up to this size are 'close'. Default 180. */
  toleranceMs?: number;
  /**
   * How far from an onset a tap may land and still be paired with it. Default
   * `toleranceMs`. A tap matched beyond `toleranceMs` is still a 'miss'.
   */
  windowMs?: number;
}

/** The verdict for one onset's signed error (null = no tap). Same thresholds as the final result. */
export function verdictOf(
  errorMs: number | null,
  options: Pick<MatcherOptions, 'perfectMs' | 'toleranceMs'> = {},
): OnsetVerdict {
  if (errorMs === null) return 'miss';
  const perfect = options.perfectMs ?? DEFAULT_PERFECT_MS;
  const tolerance = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const abs = Math.abs(errorMs);
  if (abs <= perfect) return 'perfect';
  return abs <= tolerance + EPSILON ? 'close' : 'miss';
}

export type TapOutcome = { kind: 'matched'; judgement: OnsetJudgement } | { kind: 'extra' };

/**
 * Pure incremental matcher: the single place that decides which tap belongs to
 * which onset. The live pad feeds it taps and clock ticks as they happen; the
 * final result is read from the same state, so they cannot disagree.
 *
 * Rules: a tap is paired at once with the nearest onset that is not yet judged
 * and lies within the window (an exact tie goes to the earlier onset); a tap
 * that pairs with nothing is extra; an onset whose window has passed with no
 * tap is a miss. Taps must be fed in time order.
 */
export interface TapMatcher {
  readonly size: number;
  /** A tap at `seconds` (latency already removed). */
  tap(seconds: number): TapOutcome;
  /** The clock has reached `nowSeconds`: judges as 'miss' every unclaimed onset whose window ended earlier. */
  advance(nowSeconds: number): OnsetJudgement[];
  /** The round is over: judges every remaining onset as 'miss'. */
  finish(): OnsetJudgement[];
  /** Per-onset signed errors (null = no tap) and the extra count so far; unjudged onsets read as null. */
  snapshot(): { errorsMs: (number | null)[]; extraTaps: number; verdicts: OnsetVerdict[] };
}

export function createTapMatcher(expectedSeconds: readonly number[], options: MatcherOptions = {}): TapMatcher {
  const perfectMs = options.perfectMs ?? DEFAULT_PERFECT_MS;
  const toleranceMs = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const windowMs = options.windowMs ?? toleranceMs;
  const n = expectedSeconds.length;
  const order = expectedSeconds.map((_, i) => i).sort((a, b) => expectedSeconds[a] - expectedSeconds[b]);
  const errors: (number | null)[] = new Array(n).fill(null);
  const verdicts: (OnsetVerdict | null)[] = new Array(n).fill(null);
  let extra = 0;

  const judge = (index: number, errorMs: number | null): OnsetJudgement => {
    const verdict = verdictOf(errorMs, { perfectMs, toleranceMs });
    errors[index] = errorMs;
    verdicts[index] = verdict;
    return { index, verdict, errorMs };
  };

  return {
    size: n,
    tap(seconds) {
      let best = -1;
      let bestAbs = Infinity;
      for (const i of order) {
        if (verdicts[i] !== null) continue;
        const abs = Math.abs(seconds - expectedSeconds[i]) * 1000;
        if (abs <= windowMs + EPSILON && abs < bestAbs - TIE_MS) {
          best = i;
          bestAbs = abs;
        }
      }
      if (best < 0) {
        extra += 1;
        return { kind: 'extra' };
      }
      return { kind: 'matched', judgement: judge(best, (seconds - expectedSeconds[best]) * 1000) };
    },
    advance(nowSeconds) {
      const out: OnsetJudgement[] = [];
      for (const i of order) {
        if (verdicts[i] !== null) continue;
        if ((nowSeconds - expectedSeconds[i]) * 1000 > windowMs + EPSILON) out.push(judge(i, null));
      }
      return out;
    },
    finish() {
      const out: OnsetJudgement[] = [];
      for (const i of order) if (verdicts[i] === null) out.push(judge(i, null));
      return out;
    },
    snapshot() {
      return {
        errorsMs: [...errors],
        extraTaps: extra,
        verdicts: verdicts.map((v) => v ?? 'miss'),
      };
    },
  };
}

/**
 * Pairs each expected onset with a tap, tap by tap in time order, as the live
 * pad does (see TapMatcher). Errors are signed (tap minus expected, negative =
 * early) in ms, null when missed.
 */
export function matchTaps(
  expectedSeconds: readonly number[],
  tapSeconds: readonly number[],
  toleranceMs: number,
): { errorsMs: (number | null)[]; extraTaps: number } {
  const m = createTapMatcher(expectedSeconds, { toleranceMs });
  for (const t of [...tapSeconds].sort((a, b) => a - b)) m.tap(t);
  m.finish();
  const { errorsMs, extraTaps } = m.snapshot();
  return { errorsMs, extraTaps };
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

/** The final result of a finished matcher: the same errors the live events reported. */
export function resultOf(matcher: TapMatcher, options: AccuracyOptions = {}): TapResult {
  const { errorsMs, extraTaps } = matcher.snapshot();
  return { errorsMs, extraTaps, accuracy: accuracy(errorsMs, extraTaps, options) };
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
