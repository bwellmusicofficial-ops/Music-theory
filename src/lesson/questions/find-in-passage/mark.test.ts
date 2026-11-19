import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import { mark } from './mark';
import type { FindInPassagePayload } from './types';

const B4 = pitch.parsePitch('B4');
const note = (value: NoteValue, dots: 0 | 1 = 0): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });
const passage = {
  clef: 'treble' as const,
  key: { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const },
  time: { beats: 4, beatUnit: 4 as const },
  bars: [
    bar(note('minim', 1), note('crotchet')),
    bar(note('crotchet'), note('crotchet'), note('minim')),
    bar(note('minim', 1), note('crotchet')),
    bar(note('crotchet', 1), note('quaver'), note('minim')),
  ],
};
/** Three dotted notes, in bars 1, 3 and 4. */
const events: FindInPassagePayload = {
  passage,
  select: 'event',
  targets: [{ bar: 0, event: 0 }, { bar: 2, event: 0 }, { bar: 3, event: 0 }],
  feature: 'dotted notes',
};
const bars: FindInPassagePayload = { passage, select: 'bar', targets: [{ bar: 1 }, { bar: 2 }], feature: 'the bars without a minim' };

describe('find-in-passage mark', () => {
  it('is right when the chosen places are the targets, in any order', () => {
    expect(mark(events, { chosen: [{ bar: 0, event: 0 }, { bar: 2, event: 0 }, { bar: 3, event: 0 }] })).toEqual({ correct: true, score: 1 });
    expect(mark(events, { chosen: [{ bar: 3, event: 0 }, { bar: 0, event: 0 }, { bar: 2, event: 0 }] })).toEqual({ correct: true, score: 1 });
    expect(mark(bars, { chosen: [{ bar: 2 }, { bar: 1 }] })).toEqual({ correct: true, score: 1 });
  });

  it('some wrong: how many of the choices are right, then where to look again', () => {
    expect(mark(events, { chosen: [{ bar: 0, event: 0 }, { bar: 2, event: 0 }, { bar: 1, event: 0 }] })).toEqual({
      correct: false,
      score: 2 / 3,
      reason: '2 of your 3 choices are dotted notes. Look again at [[bar|bar]] 4.',
    });
  });

  it('one right uses "is"', () => {
    expect(mark(events, { chosen: [{ bar: 0, event: 0 }, { bar: 1, event: 0 }, { bar: 1, event: 1 }] }).reason).toBe(
      '1 of your 3 choices is dotted notes. Look again at [[bar|bars]] 3 and 4.',
    );
  });

  it('lists several missed bars as "1, 2 and 4" and counts each bar once', () => {
    const many: FindInPassagePayload = {
      passage,
      select: 'event',
      targets: [{ bar: 0, event: 0 }, { bar: 0, event: 1 }, { bar: 1, event: 0 }, { bar: 3, event: 1 }],
      feature: 'notes shorter than a minim',
    };
    expect(mark(many, { chosen: [{ bar: 2, event: 1 }, { bar: 3, event: 2 }, { bar: 1, event: 2 }, { bar: 0, event: 0 }] }).reason).toBe(
      '1 of your 4 choices is notes shorter than a minim. Look again at [[bar|bars]] 1, 2 and 4.',
    );
  });

  it('missed targets in one bar give "bar n"', () => {
    const two: FindInPassagePayload = { ...events, targets: [{ bar: 0, event: 0 }, { bar: 0, event: 1 }] };
    expect(mark(two, { chosen: [{ bar: 0, event: 0 }, { bar: 3, event: 2 }] }).reason).toBe(
      '1 of your 2 choices is dotted notes. Look again at [[bar|bar]] 1.',
    );
  });

  it('none right: says so, then how many there are and in which bars', () => {
    expect(mark(events, { chosen: [{ bar: 1, event: 0 }, { bar: 1, event: 1 }, { bar: 1, event: 2 }] })).toEqual({
      correct: false,
      score: 0,
      reason: 'None of those are dotted notes. There are 3 in [[bar|bars]] 1, 3 and 4.',
    });
    const single: FindInPassagePayload = { ...events, targets: [{ bar: 2, event: 0 }] };
    expect(mark(single, { chosen: [{ bar: 1, event: 0 }] }).reason).toBe('None of those are dotted notes. There is 1 in [[bar|bar]] 3.');
  });

  it('bar questions use the same wording with bars', () => {
    expect(mark(bars, { chosen: [{ bar: 0 }, { bar: 1 }] }).reason).toBe('1 of your 2 choices is the bars without a minim. Look again at [[bar|bar]] 3.');
    expect(mark(bars, { chosen: [{ bar: 0 }, { bar: 3 }] }).reason).toBe('None of those are the bars without a minim. There are 2 in [[bar|bars]] 2 and 3.');
  });

  it('partial credit is the share of targets found; correct only when every place matches', () => {
    expect(mark(events, { chosen: [{ bar: 0, event: 0 }, { bar: 2, event: 0 }, { bar: 1, event: 0 }] }).score).toBeCloseTo(2 / 3);
    expect(mark(events, { chosen: [{ bar: 1, event: 0 }, { bar: 1, event: 1 }, { bar: 1, event: 2 }] }).score).toBe(0);
  });

  it('all targets chosen with others besides: not correct, score below 1, reason without a place to look again', () => {
    const result = mark(events, { chosen: [...events.targets, { bar: 1, event: 0 }] });
    expect(result.correct).toBe(false);
    expect(result.score).toBeCloseTo(3 / 4);
    expect(result.reason).toBe('3 of your 4 choices are dotted notes. The others are not.');
  });

  it('throws for answers the component could never produce', () => {
    expect(() => mark(events, { chosen: [{ bar: 9, event: 0 }] })).toThrow(TheoryError);
    expect(() => mark(events, { chosen: [{ bar: 0, event: 9 }] })).toThrow(TheoryError);
    expect(() => mark(events, { chosen: [{ bar: 0 }] })).toThrow(TheoryError);
    expect(() => mark(bars, { chosen: [{ bar: 0, event: 0 }] })).toThrow(TheoryError);
    expect(() => mark(events, { chosen: [{ bar: 0, event: 0 }, { bar: 0, event: 0 }] })).toThrow(TheoryError);
    expect(() => mark(events, { chosen: [{ bar: 0.5, event: 0 }] })).toThrow(TheoryError);
    expect(() => mark(events, {} as never)).toThrow(TheoryError);
  });

  it('every reason is within 40 words and never blames', () => {
    for (const chosen of [[{ bar: 0, event: 0 }, { bar: 1, event: 0 }], [{ bar: 1, event: 0 }]]) {
      const reason = mark(events, { chosen }).reason!;
      expect(reason.replace(/\[\[[^|\]]+\|([^\]]*)\]\]/g, '$1').split(/\s+/).length).toBeLessThanOrEqual(40);
      expect(reason).not.toMatch(/!|you /i);
    }
  });
});
