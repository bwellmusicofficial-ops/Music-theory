import { useCallback, useMemo, useReducer } from 'react';
import type { StaveMark } from '@/components/stave';
import type { Bar, TimeSignature } from '@/engine/types';
import { rhythm } from '@/engine/rhythm';
import { onsetAtBeat, onsetKey, onsetRefs } from './onset-map';
import type { OnsetJudgement, OnsetVerdict, PadPhase, RhythmPadProps } from './types';

/** What to show large near the notation: the beats still to count, or "Tap!". */
export type CountInCue = { kind: 'count'; value: number } | { kind: 'go' };

export interface TapAlong {
  /** Spread onto RhythmPad (free mode: also call `onTap` from the explore gate). */
  handlers: Required<
    Pick<RhythmPadProps, 'onOnsetJudged' | 'onExtraTap' | 'onOnsetDue' | 'onBeat' | 'onPhase' | 'onTap'>
  >;
  /** For Stave `marks`: judged notes (perform) or tapped notes (free). Stays after the round ends. */
  marks: Record<string, StaveMark>;
  /** For Stave `cursor`: the note due now (perform) or on the current beat (free). */
  cursor: { bar: number; event: number } | null;
  countIn: CountInCue | null;
}

interface State {
  phase: PadPhase;
  verdicts: Record<number, OnsetVerdict>;
  due: number | null;
  beatNote: number | null;
  lit: number;
  countIn: CountInCue | null;
  goBeats: number;
}

type Action =
  | { type: 'phase'; phase: PadPhase }
  | { type: 'judged'; judgement: OnsetJudgement }
  | { type: 'due'; index: number }
  | { type: 'beat'; beatIndex: number; barIndex: number; perBar: number; barsLength: number; refs: Parameters<typeof onsetAtBeat>[0]; free: boolean }
  | { type: 'tap'; count: number; total: number };

const initial: State = { phase: 'idle', verdicts: {}, due: null, beatNote: null, lit: 0, countIn: null, goBeats: 0 };

function reduce(state: State, a: Action): State {
  switch (a.type) {
    case 'phase':
      if (a.phase === 'idle') return { ...initial };
      if (a.phase === 'done') return { ...state, phase: 'done', due: null, beatNote: null, countIn: null };
      if (a.phase === 'count-in') return { ...initial, phase: 'count-in' };
      // playing: a fresh perform round, or a free play-along.
      return {
        ...(state.phase === 'count-in' ? state : initial),
        phase: 'playing',
        countIn: { kind: 'go' },
        goBeats: 0,
      };
    case 'judged':
      return { ...state, verdicts: { ...state.verdicts, [a.judgement.index]: a.judgement.verdict } };
    case 'due':
      return { ...state, due: a.index };
    case 'beat': {
      if (state.phase === 'count-in' && a.barIndex < 0) {
        const value = (-a.barIndex - 1) * a.perBar + (a.perBar - a.beatIndex);
        return { ...state, countIn: { kind: 'count', value } };
      }
      let countIn = state.countIn;
      let goBeats = state.goBeats;
      if (countIn?.kind === 'go') {
        goBeats += 1;
        // "Tap!" stays for the first beat of the round only.
        if (goBeats >= 2) countIn = null;
      }
      if (!a.free) return { ...state, countIn, goBeats };
      const bar = Math.min(Math.max(a.barIndex, 0), Math.max(0, a.barsLength - 1));
      return { ...state, countIn, goBeats, beatNote: onsetAtBeat(a.refs, bar * a.perBar + a.beatIndex) };
    }
    case 'tap':
      // Free mode: light the tapped notes in order, then start again at the end of the passage.
      return { ...state, lit: a.total === 0 ? 0 : ((a.count - 1) % a.total) + 1 };
  }
}

const MARK: Record<OnsetVerdict, StaveMark> = { perfect: 'correct', close: 'near', miss: 'wrong' };

/**
 * Turns the pad's live events into what the notation shows. The pad and the
 * notation are separate components, so a parent calls this once, spreads
 * `handlers` onto the pad and passes `marks` and `cursor` on to the stave.
 */
export function useTapAlong({ bars, time, mode }: { bars: Bar[]; time: TimeSignature; mode: 'perform' | 'free' }): TapAlong {
  const free = mode === 'free';
  const refs = useMemo(() => onsetRefs(bars, time), [bars, time]);
  const perBar = rhythm.beatsPerBar(time);
  const [state, dispatch] = useReducer(reduce, initial);

  const onPhase = useCallback((phase: PadPhase) => dispatch({ type: 'phase', phase }), []);
  const onOnsetJudged = useCallback((judgement: OnsetJudgement) => dispatch({ type: 'judged', judgement }), []);
  const onExtraTap = useCallback(() => {}, []);
  const onOnsetDue = useCallback((index: number) => dispatch({ type: 'due', index }), []);
  const onBeat = useCallback(
    (beatIndex: number, barIndex: number) =>
      dispatch({ type: 'beat', beatIndex, barIndex, perBar, barsLength: bars.length, refs, free }),
    [perBar, bars.length, refs, free],
  );
  const onTap = useCallback((count: number) => dispatch({ type: 'tap', count, total: refs.length }), [refs.length]);

  const marks = useMemo(() => {
    const out: Record<string, StaveMark> = {};
    if (free) {
      for (let i = 0; i < Math.min(state.lit, refs.length); i++) out[onsetKey(refs[i])] = 'lit';
    } else {
      for (const [i, v] of Object.entries(state.verdicts)) {
        const ref = refs[Number(i)];
        if (ref) out[onsetKey(ref)] = MARK[v];
      }
    }
    return out;
  }, [free, state.lit, state.verdicts, refs]);

  const cursor = useMemo(() => {
    if (state.phase === 'idle' || state.phase === 'done') return null;
    const index = free ? state.beatNote : state.phase === 'playing' ? state.due : null;
    const ref = index === null ? undefined : refs[index];
    return ref ? { bar: ref.bar, event: ref.event } : null;
  }, [free, state.phase, state.beatNote, state.due, refs]);

  return {
    handlers: { onOnsetJudged, onExtraTap, onOnsetDue, onBeat, onPhase, onTap },
    marks,
    cursor,
    countIn: free ? null : state.countIn,
  };
}
