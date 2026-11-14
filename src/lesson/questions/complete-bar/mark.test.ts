import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Bar, ScoreEvent, TimeSignature } from '@/engine/types';
import type { Glyph } from '@/lesson/questions/shared';
import { mark } from './mark';
import type { CompleteBarPayload } from './types';

const B4 = pitch.parsePitch('B4');
const note = (value: Glyph['duration']['value'], dots: 0 | 1 | 2 = 0): ScoreEvent => ({
  kind: 'note',
  pitches: [B4],
  duration: { value, dots },
});
const rest = (value: Glyph['duration']['value']): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const g = (kind: Glyph['kind'], value: Glyph['duration']['value'], dots: 0 | 1 | 2 = 0): Glyph => ({ kind, duration: { value, dots } });

function payload(
  bar: Bar,
  over: Partial<CompleteBarPayload> = {},
  time: TimeSignature = { beats: 4, beatUnit: 4 },
): CompleteBarPayload {
  return {
    passage: { clef: 'treble', key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' }, time, bars: [bar] },
    barIndex: 0,
    palette: [g('note', 'crotchet'), g('note', 'minim')],
    fillPitch: B4,
    ...over,
  };
}
const twoCrotchets: Bar = { events: [note('crotchet'), note('crotchet')] };

describe('complete-bar mark', () => {
  it('is right when the bar is exactly full', () => {
    expect(mark(payload(twoCrotchets), { added: [g('note', 'minim')] })).toEqual({ correct: true, score: 1 });
    expect(mark(payload(twoCrotchets), { added: [g('note', 'crotchet'), g('note', 'crotchet')] })).toEqual({ correct: true, score: 1 });
  });

  it('is right with a count that matches', () => {
    expect(mark(payload(twoCrotchets, { count: 1 }), { added: [g('note', 'minim')] }).correct).toBe(true);
  });

  it('adds rests as rests', () => {
    expect(mark(payload(twoCrotchets), { added: [g('rest', 'minim')] }).correct).toBe(true);
  });

  it('bar is short', () => {
    expect(mark(payload(twoCrotchets), { added: [g('note', 'crotchet')] })).toEqual({
      correct: false,
      score: 0,
      reason: 'That [[bar|bar]] now holds 3 beats, but it needs 4 beats. It is still 1 beat short.',
    });
  });

  it('bar is short by a fraction of a beat, and with nothing added', () => {
    expect(mark(payload(twoCrotchets), { added: [g('note', 'crotchet', 1)] }).reason).toBe(
      'That [[bar|bar]] now holds 3½ beats, but it needs 4 beats. It is still ½ beat short.',
    );
    expect(mark(payload(twoCrotchets), { added: [] }).reason).toBe(
      'That [[bar|bar]] now holds 2 beats, but it needs 4 beats. It is still 2 beats short.',
    );
  });

  it('bar is long', () => {
    expect(mark(payload(twoCrotchets), { added: [g('note', 'minim'), g('note', 'crotchet')] })).toEqual({
      correct: false,
      score: 0,
      reason: 'That [[bar|bar]] now holds 5 beats, but there is only room for 4 beats. Take 1 beat away.',
    });
  });

  it('uses the beat of the time signature', () => {
    const threeEight: Bar = { events: [note('quaver')] };
    const p = payload(threeEight, { palette: [g('note', 'quaver'), g('note', 'crotchet')] }, { beats: 3, beatUnit: 8 });
    expect(mark(p, { added: [g('note', 'crotchet')] }).correct).toBe(true);
    expect(mark(p, { added: [g('note', 'quaver')] }).reason).toBe(
      'That [[bar|bar]] now holds 2 beats, but it needs 3 beats. It is still 1 beat short.',
    );
  });

  it('full, but too many symbols', () => {
    expect(mark(payload(twoCrotchets, { count: 1 }), { added: [g('note', 'crotchet'), g('note', 'crotchet')] })).toEqual({
      correct: false,
      score: 0,
      reason: 'That fills the [[bar|bar]], but with 2 symbols. The question asks for 1, so use a longer one.',
    });
  });

  it('full, but too many symbols, when more than one is asked for', () => {
    const quarterGap: Bar = { events: [note('minim')] };
    const p = payload(quarterGap, { count: 2, palette: [g('note', 'crotchet'), g('note', 'quaver')] });
    expect(mark(p, { added: [g('note', 'quaver'), g('note', 'quaver'), g('note', 'crotchet')] }).reason).toBe(
      'That fills the [[bar|bar]], but with 3 symbols. The question asks for 2, so use longer ones.',
    );
  });

  it('full, but too few symbols', () => {
    expect(mark(payload(twoCrotchets, { count: 2 }), { added: [g('note', 'minim')] })).toEqual({
      correct: false,
      score: 0,
      reason: 'That fills the [[bar|bar]], but with 1 symbol. The question asks for 2, so use shorter ones.',
    });
    const p = payload({ events: [note('crotchet')] }, { count: 3, palette: [g('note', 'crotchet'), g('note', 'minim'), g('note', 'quaver')] });
    expect(mark(p, { added: [g('note', 'minim', 1)] }).reason).toBe(
      'That fills the [[bar|bar]], but with 1 symbol. The question asks for 3, so use shorter ones.',
    );
    expect(mark(p, { added: [g('note', 'minim'), g('note', 'crotchet')] }).reason).toBe(
      'That fills the [[bar|bar]], but with 2 symbols. The question asks for 3, so use shorter ones.',
    );
  });

  it('length problems come before count problems', () => {
    expect(mark(payload(twoCrotchets, { count: 1 }), { added: [g('note', 'crotchet')] }).reason).toContain('now holds 3 beats');
  });

  describe('grouping', () => {
    const grouped = payload({ events: [note('crotchet')] }, {
      checkGrouping: true,
      palette: [g('note', 'crotchet'), g('note', 'minim'), g('rest', 'crotchet'), g('rest', 'minim')],
    });

    it('is not checked when checkGrouping is false or absent', () => {
      const loose = { ...grouped, checkGrouping: false };
      expect(mark(loose, { added: [g('note', 'minim'), g('note', 'crotchet')] }).correct).toBe(true);
      const { checkGrouping: _unused, ...absent } = grouped;
      void _unused;
      expect(mark(absent, { added: [g('note', 'minim'), g('note', 'crotchet')] }).correct).toBe(true);
    });

    it('accepts a correctly grouped bar', () => {
      expect(mark(grouped, { added: [g('note', 'crotchet'), g('note', 'minim')] }).correct).toBe(true);
    });

    it('reports the first grouping problem when the beats add up', () => {
      // note, minim rest, ... : a minim rest that starts on beat 2 hides beat 3 in 4/4.
      const result = mark(grouped, { added: [g('rest', 'minim'), g('note', 'crotchet')] });
      expect(result.correct).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/^The beats add up, but the \[\[bar\|bar\]\] is not written the standard way: .+/);
    });
  });

  it('throws TheoryError for answers the component cannot produce', () => {
    const p = payload(twoCrotchets);
    expect(() => mark(p, undefined as never)).toThrow(TheoryError);
    expect(() => mark(p, {} as never)).toThrow(TheoryError);
    expect(() => mark(p, { added: [{ kind: 'chord', duration: { value: 'minim', dots: 0 } }] } as never)).toThrow(TheoryError);
    expect(() => mark(p, { added: [g('note', 'crotchet', 3 as never)] })).toThrow(TheoryError);
    expect(() => mark(p, { added: Array.from({ length: 13 }, () => g('note', 'demisemiquaver')) })).toThrow(TheoryError);
    expect(() => mark({ ...p, barIndex: 3 }, { added: [] })).toThrow(TheoryError);
    void rest;
  });
});
