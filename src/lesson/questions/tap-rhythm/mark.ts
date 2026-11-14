import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { MarkResult } from '@/lesson/contracts';
import { beats, nv, onsetsOf, isZero } from './reason';
import { DEFAULT_TOLERANCE_MS, type TapRhythmAnswer, type TapRhythmPayload } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function timingReason(payload: TapRhythmPayload, errors: (number | null)[], tolerance: number): string {
  const first = errors.findIndex((e) => e !== null && Math.abs(e) > tolerance);
  if (first === -1) throw new TheoryError('tap-rhythm: no mistimed tap to explain');
  const early = (errors[first] as number) < 0;
  const onsets = onsetsOf(payload.bars);
  const here = onsets[first];
  if (!here) throw new TheoryError('tap-rhythm: the answer does not match the rhythm');
  const rest = !isZero(here.gapBefore);

  if (first === 0) {
    if (rest) {
      return `This rhythm starts with a rest. Wait for ${beats(here.gapBefore, payload.time)} after the count-in before your first tap.`;
    }
    return early
      ? 'You came in early. Let the count-in finish, then tap on the very next click.'
      : 'You came in late. The first note lands on the first click after the count-in.';
  }
  const tap = first + 1;
  if (rest) {
    return early
      ? `Tap ${tap} came too early. There is a rest before it: stay silent for ${beats(here.gapBefore, payload.time)} first.`
      : `Tap ${tap} came late. The rest before it lasts only ${beats(here.gapBefore, payload.time)}.`;
  }
  const prev = onsets[first - 1];
  if (!prev) throw new TheoryError('tap-rhythm: the answer does not match the rhythm');
  const what = prev.notes >= 2 ? 'tied note' : nv(prev.duration);
  const len = beats(prev.length, payload.time);
  return early
    ? `Tap ${tap} came too early. The ${what} before it lasts ${len}, so count all of it before you tap again.`
    : `Tap ${tap} came late. The ${what} before it lasts only ${len}, so the next note follows sooner.`;
}

/** docs/question-payloads.md 2.6. `answer.accuracy` is not used. */
export function mark(payload: TapRhythmPayload, answer: TapRhythmAnswer): MarkResult {
  if (
    !answer ||
    !Array.isArray(answer.errorsMs) ||
    typeof answer.extraTaps !== 'number' ||
    !Number.isFinite(answer.extraTaps) ||
    answer.extraTaps < 0 ||
    answer.errorsMs.some((e) => e !== null && (typeof e !== 'number' || !Number.isFinite(e)))
  ) {
    throw new TheoryError('tap-rhythm: the answer must be a TapResult');
  }
  const tolerance = payload.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const N = rhythm.onsetTimes(payload.bars, payload.time, payload.bpm).length;
  const errors: (number | null)[] = Array.from({ length: N }, (_, i) => answer.errorsMs[i] ?? null);

  const hit = errors.filter((e) => e !== null && Math.abs(e) <= tolerance).length;
  const missed = errors.filter((e) => e === null).length;
  const mistimed = N - hit - missed;
  const extra = answer.extraTaps;
  const score = clamp((hit - extra) / N, 0, 1);
  if (score >= 0.8) return { correct: true, score };

  let reason: string;
  if (missed === N) {
    reason = 'No taps came through. Tap the pad once for every note, starting straight after the count-in.';
  } else if (extra > 0 && extra >= missed + mistimed) {
    reason = `You tapped ${extra} more ${extra === 1 ? 'time' : 'times'} than there are notes. Every note gets one tap, however long it lasts: tap, then wait.`;
  } else if (missed > 0 && missed >= mistimed) {
    reason = `You missed ${missed} of the ${N} notes. Tap once for every note, long ones included.`;
  } else {
    reason = timingReason(payload, errors, tolerance);
  }
  return { correct: false, score, reason };
}
