import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Bar, NoteValue, ScoreEvent, TimeSignature } from '@/engine/types';
import { useTapAlong } from './use-tap-along';

const note = (value: NoteValue, tie = false): ScoreEvent => ({
  kind: 'note',
  pitches: [{ letter: 'B', accidental: 0, octave: 4 }],
  duration: { value, dots: 0 },
  ...(tie ? { tieToNext: true } : {}),
});
const rest = (value: NoteValue): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const T44: TimeSignature = { beats: 4, beatUnit: 4 };
// Onsets: 0:0, 0:2 (after a rest; 0:3 is its tied continuation), 1:0.
const bars: Bar[] = [
  { events: [note('crotchet'), rest('crotchet'), note('crotchet', true), note('crotchet')] },
  { events: [note('semibreve')] },
];

function perform(time = T44) {
  return renderHook(() => useTapAlong({ bars, time, mode: 'perform' }));
}

describe('useTapAlong (perform)', () => {
  it('maps onset indexes to bar and event, skipping rests and tied continuations', () => {
    const { result } = perform();
    act(() => {
      result.current.handlers.onPhase('count-in');
      result.current.handlers.onPhase('playing');
      result.current.handlers.onOnsetJudged({ index: 0, verdict: 'perfect', errorMs: 3 });
      result.current.handlers.onOnsetJudged({ index: 1, verdict: 'close', errorMs: 90 });
      result.current.handlers.onOnsetJudged({ index: 2, verdict: 'miss', errorMs: null });
    });
    expect(result.current.marks).toEqual({ '0:0': 'correct', '0:2': 'near', '1:0': 'wrong' });
  });

  it('moves the cursor to the note due, and has none in the count-in', () => {
    const { result } = perform();
    act(() => result.current.handlers.onPhase('count-in'));
    act(() => result.current.handlers.onOnsetDue(0));
    expect(result.current.cursor).toBeNull();
    act(() => result.current.handlers.onPhase('playing'));
    act(() => result.current.handlers.onOnsetDue(0));
    expect(result.current.cursor).toEqual({ bar: 0, event: 0 });
    act(() => result.current.handlers.onOnsetDue(1));
    expect(result.current.cursor).toEqual({ bar: 0, event: 2 });
  });

  it('keeps the marks after the round ends but drops the cursor; a new round clears them', () => {
    const { result } = perform();
    act(() => {
      result.current.handlers.onPhase('count-in');
      result.current.handlers.onPhase('playing');
      result.current.handlers.onOnsetDue(2);
      result.current.handlers.onOnsetJudged({ index: 2, verdict: 'perfect', errorMs: 0 });
      result.current.handlers.onPhase('done');
    });
    expect(result.current.cursor).toBeNull();
    expect(result.current.marks).toEqual({ '1:0': 'correct' });
    act(() => result.current.handlers.onPhase('idle'));
    expect(result.current.marks).toEqual({});
  });

  it('counts up through the beats of a bar in 4/4, then Tap!, then clears after the first beat', () => {
    const { result } = perform();
    const beat = (b: number, bar: number) => act(() => result.current.handlers.onBeat(b, bar));
    act(() => result.current.handlers.onPhase('count-in'));
    const seen: unknown[] = [];
    for (let b = 0; b < 4; b++) {
      beat(b, -1);
      seen.push(result.current.countIn);
    }
    expect(seen).toEqual([1, 2, 3, 4].map((value) => ({ kind: 'count', value })));
    act(() => result.current.handlers.onPhase('playing'));
    beat(0, 0);
    expect(result.current.countIn).toEqual({ kind: 'go' });
    beat(1, 0);
    expect(result.current.countIn).toBeNull();
  });

  it('counts the felt beats of one bar: 1 2 3 in 3/4, 1 2 in 6/8, and again over a two-bar count-in', () => {
    const run = (time: TimeSignature, beats: [number, number][]) => {
      const { result } = perform(time);
      act(() => result.current.handlers.onPhase('count-in'));
      return beats.map(([b, bar]) => {
        act(() => result.current.handlers.onBeat(b, bar));
        const c = result.current.countIn;
        return c?.kind === 'count' ? c.value : -1;
      });
    };
    expect(run({ beats: 3, beatUnit: 4 }, [[0, -2], [1, -2], [2, -2], [0, -1], [1, -1], [2, -1]])).toEqual([1, 2, 3, 1, 2, 3]);
    expect(run({ beats: 6, beatUnit: 8 }, [[0, -1], [1, -1]])).toEqual([1, 2]);
  });
});

describe('useTapAlong (free)', () => {
  it('lights each tapped note in order and loops at the end of the passage', () => {
    const { result } = renderHook(() => useTapAlong({ bars, time: T44, mode: 'free' }));
    act(() => result.current.handlers.onPhase('playing'));
    const lit = () => Object.keys(result.current.marks).sort();
    act(() => result.current.handlers.onTap(1));
    expect(lit()).toEqual(['0:0']);
    expect(result.current.marks['0:0']).toBe('lit');
    act(() => result.current.handlers.onTap(2));
    act(() => result.current.handlers.onTap(3));
    expect(lit()).toEqual(['0:0', '0:2', '1:0']);
    act(() => result.current.handlers.onTap(4)); // back to the first note
    expect(lit()).toEqual(['0:0']);
    act(() => result.current.handlers.onTap(5));
    expect(lit()).toEqual(['0:0', '0:2']);
  });

  it('pulses the note on the current beat, and shows no count-in', () => {
    const { result } = renderHook(() => useTapAlong({ bars, time: T44, mode: 'free' }));
    act(() => result.current.handlers.onPhase('playing'));
    act(() => result.current.handlers.onBeat(0, 0));
    expect(result.current.cursor).toEqual({ bar: 0, event: 0 });
    act(() => result.current.handlers.onBeat(1, 0)); // the rest
    expect(result.current.cursor).toBeNull();
    act(() => result.current.handlers.onBeat(2, 0));
    expect(result.current.cursor).toEqual({ bar: 0, event: 2 });
    act(() => result.current.handlers.onBeat(3, 0)); // the tied continuation still sounds
    expect(result.current.cursor).toEqual({ bar: 0, event: 2 });
    act(() => result.current.handlers.onBeat(0, 1));
    expect(result.current.cursor).toEqual({ bar: 1, event: 0 });
    expect(result.current.countIn).toBeNull();
  });

  it('clears everything when stopped', () => {
    const { result } = renderHook(() => useTapAlong({ bars, time: T44, mode: 'free' }));
    act(() => {
      result.current.handlers.onPhase('playing');
      result.current.handlers.onTap(1);
      result.current.handlers.onBeat(0, 0);
      result.current.handlers.onPhase('idle');
    });
    expect(result.current.marks).toEqual({});
    expect(result.current.cursor).toBeNull();
  });
});
