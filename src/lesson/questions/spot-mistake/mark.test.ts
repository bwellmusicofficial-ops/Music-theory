import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Bar, ScoreEvent } from '@/engine/types';
import { mark } from './mark';
import type { SpotMistakePayload } from './types';

const B4 = pitch.parsePitch('B4');
const note = (value: 'minim' | 'crotchet'): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots: 0 } });
const rest = (value: 'minim' | 'crotchet'): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const passage = (...bars: Bar[]) => ({
  clef: 'treble' as const,
  key: { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const },
  time: { beats: 4, beatUnit: 4 as const },
  bars,
});

const EXPLANATION = 'Bar 2 has 5 beats. That is one beat too many.';
const barQuestion: SpotMistakePayload = {
  passage: passage(
    { events: [note('minim'), note('minim')] },
    { events: [note('minim'), note('crotchet'), note('minim')] },
    { events: [note('minim'), rest('minim')] },
  ),
  select: 'bar',
  mistake: { bar: 1 },
  explanation: EXPLANATION,
};
const eventQuestion: SpotMistakePayload = {
  passage: passage(
    { events: [note('minim'), rest('minim')] },
    { events: [note('crotchet'), note('crotchet'), note('minim')] },
  ),
  select: 'event',
  mistake: { bar: 1, event: 2 },
  explanation: EXPLANATION,
};

describe('spot-mistake mark: select "bar"', () => {
  it('is right for the mistake bar', () => {
    expect(mark(barQuestion, { bar: 1 })).toEqual({ correct: true, score: 1 });
  });

  it('wrong bar: says that bar is fine, then the explanation', () => {
    expect(mark(barQuestion, { bar: 2 })).toEqual({
      correct: false,
      score: 0,
      reason: `[[bar|Bar]] 3 is fine. ${EXPLANATION}`,
    });
    expect(mark(barQuestion, { bar: 0 }).reason).toBe(`[[bar|Bar]] 1 is fine. ${EXPLANATION}`);
  });
});

describe('spot-mistake mark: select "event"', () => {
  it('is right when bar and event both match', () => {
    expect(mark(eventQuestion, { bar: 1, event: 2 })).toEqual({ correct: true, score: 1 });
  });

  it('wrong bar: that note is fine', () => {
    expect(mark(eventQuestion, { bar: 0, event: 0 })).toEqual({
      correct: false,
      score: 0,
      reason: `That note is fine. ${EXPLANATION}`,
    });
  });

  it('wrong bar: that rest is fine', () => {
    expect(mark(eventQuestion, { bar: 0, event: 1 }).reason).toBe(`That rest is fine. ${EXPLANATION}`);
  });

  it('right bar, wrong event: names the kind of the tapped event', () => {
    expect(mark(eventQuestion, { bar: 1, event: 0 })).toEqual({
      correct: false,
      score: 0,
      reason: `Right [[bar|bar]], wrong note. ${EXPLANATION}`,
    });
    const restMistake: SpotMistakePayload = {
      ...eventQuestion,
      passage: passage({ events: [note('minim'), note('minim')] }, { events: [note('minim'), rest('minim')] }),
      mistake: { bar: 1, event: 0 },
    };
    expect(mark(restMistake, { bar: 1, event: 1 }).reason).toBe(`Right [[bar|bar]], wrong rest. ${EXPLANATION}`);
  });
});

describe('spot-mistake mark: answers the component cannot produce', () => {
  it('throws TheoryError for a missing or unknown bar', () => {
    expect(() => mark(barQuestion, undefined as never)).toThrow(TheoryError);
    expect(() => mark(barQuestion, { bar: 3 })).toThrow(TheoryError);
    expect(() => mark(barQuestion, { bar: -1 })).toThrow(TheoryError);
    expect(() => mark(barQuestion, { bar: 0.5 })).toThrow(TheoryError);
  });
  it('throws for an event in a "bar" answer, or a missing or unknown event in an "event" answer', () => {
    expect(() => mark(barQuestion, { bar: 1, event: 0 })).toThrow(TheoryError);
    expect(() => mark(eventQuestion, { bar: 1 })).toThrow(TheoryError);
    expect(() => mark(eventQuestion, { bar: 1, event: 3 })).toThrow(TheoryError);
    expect(() => mark(eventQuestion, { bar: 1, event: -1 })).toThrow(TheoryError);
  });
});
