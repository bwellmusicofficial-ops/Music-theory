import { describe, expect, it } from 'vitest';
import { rhythm } from '@/engine/rhythm';
import { createRng } from '@/engine/rng';
import type { Bar, ScoreEvent } from '@/engine/types';
import { LEVELS, barFitsLevel, levelSpec, sixteenths, usesNewVocabulary } from './levels';
import { BARS_PER_RHYTHM, countOnsets, generateRhythm, rhythmKey } from './rhythms';

const SEEDS = 500;
const events = (bars: Bar[]): ScoreEvent[] => bars.flatMap((b) => b.events);

describe('level table', () => {
  it('has the tempos and vocabulary the brief gives, each level keeping the last one', () => {
    expect(LEVELS.map((l) => l.bpm)).toEqual([70, 72, 75, 78, 82, 85, 90, 96]);
    expect(levelSpec(1).times).toEqual([{ beats: 4, beatUnit: 4 }]);
    expect(levelSpec(1).notes.map((n) => n.value)).toEqual(['crotchet', 'minim']);
    expect(levelSpec(2).times.map((t) => `${t.beats}/${t.beatUnit}`)).toEqual(['4/4', '3/4', '2/4']);
    expect(levelSpec(2).notes.map((n) => n.value)).toContain('semibreve');
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => levelSpec(l).pairedQuavers)).toEqual([false, false, true, true, true, true, true, true]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => levelSpec(l).rests.length > 0)).toEqual([false, false, false, true, true, true, true, true]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => levelSpec(l).dottedCrotchetQuaver)).toEqual([false, false, false, false, true, true, true, true]);
    expect(levelSpec(5).notes.some((n) => n.value === 'minim' && n.dots === 1)).toBe(true);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => levelSpec(l).ties)).toEqual([false, false, false, false, false, true, true, true]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => levelSpec(l).semiquaverGroups)).toEqual([false, false, false, false, false, false, true, true]);
  });
  it('clamps levels', () => {
    expect(levelSpec(0).level).toBe(1);
    expect(levelSpec(99).level).toBe(8);
  });
  it('measures lengths in sixteenths', () => {
    expect(sixteenths({ value: 'semibreve', dots: 0 })).toBe(16);
    expect(sixteenths({ value: 'minim', dots: 1 })).toBe(12);
    expect(sixteenths({ value: 'crotchet', dots: 1 })).toBe(6);
    expect(sixteenths({ value: 'quaver', dots: 0 })).toBe(2);
    expect(sixteenths({ value: 'semiquaver', dots: 0 })).toBe(1);
  });
});

describe('barFitsLevel', () => {
  const n = (value: 'crotchet' | 'quaver' | 'semiquaver' | 'minim', dots: 0 | 1 = 0): ScoreEvent => ({
    kind: 'note',
    pitches: [{ letter: 'B', accidental: 0, octave: 4 }],
    duration: { value, dots },
  });
  const bar = (...e: ScoreEvent[]): Bar => ({ events: e });
  it('accepts quavers only in pairs on the beat', () => {
    expect(barFitsLevel(bar(n('quaver'), n('quaver'), n('crotchet'), n('minim')), levelSpec(3))).toBe(true);
    expect(barFitsLevel(bar(n('crotchet'), n('quaver'), n('semiquaver'), n('semiquaver'), n('minim')), levelSpec(7))).toBe(false);
    expect(barFitsLevel(bar(n('quaver'), n('quaver'), n('crotchet'), n('minim')), levelSpec(2))).toBe(false);
  });
  it('accepts a dotted crotchet only with its quaver, from level 5', () => {
    const dotted = bar(n('crotchet', 1), n('quaver'), n('minim'));
    expect(barFitsLevel(dotted, levelSpec(4))).toBe(false);
    expect(barFitsLevel(dotted, levelSpec(5))).toBe(true);
  });
  it('accepts semiquavers only in whole groups of four, from level 7', () => {
    const four = bar(n('semiquaver'), n('semiquaver'), n('semiquaver'), n('semiquaver'), n('crotchet'), n('minim'));
    expect(barFitsLevel(four, levelSpec(6))).toBe(false);
    expect(barFitsLevel(four, levelSpec(7))).toBe(true);
    const three = bar(n('semiquaver'), n('semiquaver'), n('quaver'), n('crotchet'), n('minim'));
    expect(barFitsLevel(three, levelSpec(8))).toBe(false);
  });
});

describe('generateRhythm: every level, 500 seeds', () => {
  for (const spec of LEVELS) {
    it(`level ${spec.level}: exactly full bars, no grouping problems, inside the vocabulary`, () => {
      let fallbacks = 0;
      let usedNew = 0;
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const r = generateRhythm(spec.level, createRng(seed));
        if (r.fallback) fallbacks += 1;
        expect(r.level).toBe(spec.level);
        expect(r.bpm).toBe(spec.bpm);
        expect(r.bars).toHaveLength(BARS_PER_RHYTHM);
        expect(spec.times.some((t) => t.beats === r.time.beats && t.beatUnit === r.time.beatUnit)).toBe(true);
        for (const bar of r.bars) {
          expect(rhythm.checkBarLength(bar, r.time).status).toBe('complete');
          expect(rhythm.groupingProblems(bar, r.time)).toEqual([]);
          expect(barFitsLevel(bar, spec)).toBe(true);
          expect(bar.events.some((e) => e.kind === 'note')).toBe(true);
        }
        expect(r.onsets).toBe(countOnsets(r.bars, r.time));
        expect(r.onsets).toBeGreaterThanOrEqual(3);
        // Ties: only across the bar line, only from level 6, only between two notes.
        const tied = r.bars.flatMap((b, i) => b.events.map((e, j) => ({ e, i, j, last: j === b.events.length - 1 }))).filter((x) => x.e.kind === 'note' && x.e.tieToNext);
        if (!spec.ties) expect(tied).toEqual([]);
        for (const t of tied) {
          expect(t.i).toBe(0);
          expect(t.last).toBe(true);
          expect(r.bars[1]!.events[0]!.kind).toBe('note');
        }
        if (usesNewVocabulary(r.bars, r.time, spec.level)) usedNew += 1;
        // No rests before level 4.
        if (spec.rests.length === 0) expect(events(r.bars).some((e) => e.kind === 'rest')).toBe(false);
      }
      expect(fallbacks).toBe(0);
      if (spec.level >= 2 && spec.level <= 7) expect(usedNew).toBeGreaterThan(SEEDS * 0.6);
    });
  }
});

describe('generateRhythm: determinism and variety', () => {
  it('gives the same rhythm for the same seed', () => {
    const a = generateRhythm(6, createRng(7));
    const b = generateRhythm(6, createRng(7));
    expect(rhythmKey(a.time, a.bars)).toBe(rhythmKey(b.time, b.bars));
  });
  it('does not repeat the rhythm it is told to avoid', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const first = generateRhythm(1, createRng(seed));
      const key = rhythmKey(first.time, first.bars);
      const again = generateRhythm(1, createRng(seed), key);
      expect(rhythmKey(again.time, again.bars)).not.toBe(key);
    }
  });
  it('level 1 uses only crotchets and minims in 4/4', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const r = generateRhythm(1, createRng(seed));
      expect(r.time).toEqual({ beats: 4, beatUnit: 4 });
      for (const e of events(r.bars)) expect(['crotchet', 'minim']).toContain(e.duration.value);
    }
  });
  it('levels 3 and 7 really show quavers and semiquavers across seeds', () => {
    const has = (level: number, value: string) =>
      Array.from({ length: 100 }, (_, i) => generateRhythm(level, createRng(i + 1))).filter((r) => events(r.bars).some((e) => e.duration.value === value)).length;
    expect(has(3, 'quaver')).toBeGreaterThan(50);
    expect(has(7, 'semiquaver')).toBeGreaterThan(50);
  });
});
