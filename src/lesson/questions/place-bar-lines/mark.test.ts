import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import { mark } from './mark';
import type { PlaceBarLinesPayload } from './types';

const B4 = pitch.parsePitch('B4');
const note = (value: NoteValue, dots: 0 | 1 = 0): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots } });
const rest = (value: NoteValue): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });
const passage = (time: { beats: number; beatUnit: 4 | 8 }, ...bars: Bar[]) => ({
  clef: 'treble' as const,
  key: { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const },
  time,
  bars,
});

/** 4/4: four crotchets (events 0-3), two minims (4-5), dotted minim and crotchet (6-7). */
const question: PlaceBarLinesPayload = {
  passage: passage(
    { beats: 4, beatUnit: 4 },
    bar(note('crotchet'), note('crotchet'), note('crotchet'), note('crotchet')),
    bar(note('minim'), note('minim')),
    bar(note('minim', 1), note('crotchet')),
  ),
};

describe('place-bar-lines mark', () => {
  it('is right when every learner bar is full', () => {
    expect(mark(question, { after: [3, 5] })).toEqual({ correct: true, score: 1 });
  });

  it('does not mind the order the bar lines are listed in', () => {
    expect(mark(question, { after: [5, 3] })).toEqual({ correct: true, score: 1 });
  });

  it('too long: names the first bar that holds too much, and how much sooner the bar line is needed', () => {
    expect(mark(question, { after: [] })).toEqual({
      correct: false,
      score: 0,
      reason: '[[bar|Bar]] 1 holds 12 beats, but each [[bar|bar]] holds 4 beats. It needs a bar line 8 beats sooner.',
    });
    expect(mark(question, { after: [5] }).reason).toBe(
      '[[bar|Bar]] 1 holds 8 beats, but each [[bar|bar]] holds 4 beats. It needs a bar line 4 beats sooner.',
    );
  });

  it('too short: names the first bar that holds too little, and how much too soon the bar line comes', () => {
    expect(mark(question, { after: [2, 5] })).toEqual({
      correct: false,
      score: 0,
      reason: '[[bar|Bar]] 1 holds only 3 beats, but each [[bar|bar]] holds 4 beats. Its bar line comes 1 beat too soon.',
    });
  });

  it('numbers the bar from 1 and reports the first fault from the left', () => {
    // Bar 1 is right, bar 2 is one minim (2 beats), bar 3 is a minim and the rest.
    expect(mark(question, { after: [3, 4] }).reason).toBe(
      '[[bar|Bar]] 2 holds only 2 beats, but each [[bar|bar]] holds 4 beats. Its bar line comes 2 beats too soon.',
    );
  });

  it('a bar line after every note leaves the first bar short', () => {
    expect(mark(question, { after: [0, 1, 2, 3, 4, 5, 6] }).reason).toBe(
      '[[bar|Bar]] 1 holds only 1 beat, but each [[bar|bar]] holds 4 beats. Its bar line comes 3 beats too soon.',
    );
  });

  it('counts beats by the time signature: in 6/8 a beat is a dotted crotchet, in 3/4 a crotchet', () => {
    const compound: PlaceBarLinesPayload = {
      passage: passage(
        { beats: 6, beatUnit: 8 },
        bar(note('crotchet', 1), note('crotchet', 1)),
        bar(note('crotchet', 1), rest('crotchet'), rest('quaver')),
      ),
    };
    expect(mark(compound, { after: [1] }).correct).toBe(true);
    expect(mark(compound, { after: [0] }).reason).toBe(
      '[[bar|Bar]] 1 holds only 3 beats, but each [[bar|bar]] holds 6 beats. Its bar line comes 3 beats too soon.',
    );
    const triple: PlaceBarLinesPayload = {
      passage: passage({ beats: 3, beatUnit: 4 }, bar(note('minim'), note('crotchet')), bar(note('crotchet'), rest('minim'))),
    };
    expect(mark(triple, { after: [2] }).reason).toBe(
      '[[bar|Bar]] 1 holds 4 beats, but each [[bar|bar]] holds 3 beats. It needs a bar line 1 beat sooner.',
    );
  });

  it('a rest can sit at either end of a bar', () => {
    const withRests: PlaceBarLinesPayload = {
      passage: passage({ beats: 2, beatUnit: 4 }, bar(note('crotchet'), rest('crotchet')), bar(rest('crotchet'), note('crotchet'))),
    };
    expect(mark(withRests, { after: [1] })).toEqual({ correct: true, score: 1 });
  });

  it('throws for answers the component could never produce', () => {
    expect(() => mark(question, { after: [7] })).toThrow(TheoryError);
    expect(() => mark(question, { after: [-1] })).toThrow(TheoryError);
    expect(() => mark(question, { after: [1.5] })).toThrow(TheoryError);
    expect(() => mark(question, { after: [3, 3] })).toThrow(TheoryError);
    expect(() => mark(question, {} as never)).toThrow(TheoryError);
    expect(() => mark(question, undefined as never)).toThrow(TheoryError);
  });

  it('reasons are within 40 words and never blame', () => {
    for (const after of [[], [0], [2, 5], [3, 4], [5]]) {
      const reason = mark(question, { after }).reason!;
      expect(reason.replace(/\[\[[^|\]]+\|([^\]]*)\]\]/g, '$1').split(/\s+/).length).toBeLessThanOrEqual(40);
      expect(reason).not.toMatch(/!|you /i);
    }
  });
});
