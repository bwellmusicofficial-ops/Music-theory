export { RhythmPad } from './rhythm-pad';
export { LatencyCalibration, type LatencyCalibrationProps } from './latency-calibration';
export type { RhythmPadProps, TapResult } from './types';
export { accuracy, calibrationOffset, expectedOnsets, matchTaps, scoreTaps } from './scoring';
export type { OnsetJudgement, OnsetVerdict, PadPhase } from './types';
export { createTapMatcher, resultOf, verdictOf, type MatcherOptions, type TapMatcher, type TapOutcome } from './scoring';
export { onsetAtBeat, onsetKey, onsetRefs, type OnsetRef } from './onset-map';
export { useTapAlong, type CountInCue, type TapAlong } from './use-tap-along';
export { CountInOverlay } from './count-in-cue';
