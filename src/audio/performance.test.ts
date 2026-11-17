import { describe, expect, it } from 'vitest';
import { expression } from '@/engine/expression';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Passage, TimeSignature } from '@/engine/types';
import {
  DEFAULT_VELOCITY,
  hasExpression,
  mfVelocityFor,
  performPassage,
  soundingSeconds,
  velocityFor,
} from './performance';
import { schedulePassage } from './timing';
import { A4, C4, C5, D4, G4, at, bar, crotchet, dur, fourCrotchets, note, passageOf, rest } from './test-build';

describe('velocity from dB', () => {
  it('mf is today\'s default and a passage with nothing above mf keeps it', () => {
    expect(DEFAULT_VELOCITY).toBe(0.8);
    expect(mfVelocityFor(0)).toBe(0.8);
    expect(mfVelocityFor(-15)).toBe(0.8);
    expect(velocityFor(0, 0.8)).toBe(0.8);
  });

  it('lowers mf only as far as needed so the loudest note is exactly 1', () => {
    // f: 10^(-4/20) = 0.630957; ff: 10^(-7/20) = 0.446684; accent on ff (+12): 10^(-12/20) = 0.251189.
    expect(mfVelocityFor(4)).toBeCloseTo(0.630957, 6);
    expect(mfVelocityFor(7)).toBeCloseTo(0.446684, 6);
    expect(mfVelocityFor(12)).toBeCloseTo(0.251189, 6);
    // +1 dB still fits above 0.8: 0.8 * 10^(1/20) = 0.8976
    expect(mfVelocityFor(1)).toBe(0.8);
    for (const db of [4, 7, 12]) expect(velocityFor(db, mfVelocityFor(db))).toBeCloseTo(1, 12);
  });

  it('never exceeds 1', () => {
    expect(velocityFor(40, 0.8)).toBe(1);
  });
});

describe('soundingSeconds', () => {
  const plain = { fraction: 1, overlap: false, staccato: false };
  it('full length keeps the old release gap: min(0.03 s, 10%)', () => {
    expect(soundingSeconds(0.5, plain)).toBeCloseTo(0.47, 9);
    expect(soundingSeconds(0.2, plain)).toBeCloseTo(0.18, 9);
    expect(soundingSeconds(0.05, plain)).toBeCloseTo(0.045, 9);
    expect(soundingSeconds(0.01, plain)).toBe(0.01);
  });
  it('slur: whole chain plus 20 ms; staccato: 40% with a 60 ms floor, never longer than written; plain: 85%', () => {
    expect(soundingSeconds(0.5, { fraction: 1, overlap: true, staccato: false })).toBeCloseTo(0.52, 9);
    expect(soundingSeconds(0.5, { fraction: 0.4, overlap: false, staccato: true })).toBeCloseTo(0.2, 9);
    expect(soundingSeconds(0.1, { fraction: 0.4, overlap: false, staccato: true })).toBeCloseTo(0.06, 9);
    expect(soundingSeconds(0.04, { fraction: 0.4, overlap: false, staccato: true })).toBeCloseTo(0.04, 9);
    expect(soundingSeconds(0.5, { fraction: 0.85, overlap: false, staccato: false })).toBeCloseTo(0.425, 9);
  });
});

describe('hasExpression', () => {
  it('is false for a bare passage and for empty lists, true for any marking', () => {
    expect(hasExpression(passageOf([fourCrotchets()]))).toBe(false);
    expect(hasExpression(passageOf([fourCrotchets({ end: 'double' })]))).toBe(false);
    expect(hasExpression(passageOf([fourCrotchets()], { dynamics: [], slurs: [] }))).toBe(false);
    expect(hasExpression(passageOf([fourCrotchets()], { tempo: { text: 'Allegro' } }))).toBe(true);
    expect(hasExpression(passageOf([fourCrotchets({ repeatStart: true })]))).toBe(true);
    expect(hasExpression(passageOf([fourCrotchets({ marker: 'fine' })]))).toBe(true);
    expect(hasExpression(passageOf([bar([note(C4, crotchet, { fermata: true })])]))).toBe(true);
    expect(hasExpression(passageOf([bar([rest(crotchet, true)])]))).toBe(true);
    expect(hasExpression(passageOf([bar([note(C4, crotchet, { art: ['tenuto'] })])]))).toBe(true);
  });
});

describe('the expression path agrees with the original scheduler where nothing is marked', () => {
  const same = (p: Passage, bpm: number, countIn: number) => {
    const old = schedulePassage(p, bpm, countIn);
    const now = performPassage(p, bpm, countIn, { expressionTiming: true });
    expect(now.events.map((e) => [e.bar, e.event])).toEqual(old.events.map((e) => [e.bar, e.event]));
    now.events.forEach((e, i) => {
      expect(e.start).toBeCloseTo(old.events[i]!.start, 9);
      expect(e.length).toBeCloseTo(old.events[i]!.length, 9);
      expect(e.attacks.map((a) => a.midi)).toEqual(old.events[i]!.attacks.map((a) => a.midi));
      e.attacks.forEach((a, k) => {
        const sustain = old.events[i]!.attacks[k]!.sustain;
        expect(a.duration).toBeCloseTo(Math.max(0.01, sustain - Math.min(0.03, sustain * 0.1)), 9);
        expect(a.velocity).toBe(0.8);
      });
    });
    expect(now.totalSeconds).toBeCloseTo(old.totalSeconds, 9);
    expect(now.clicks).toEqual(old.clicks);
  };

  it('simple, compound, 6/4 and irregular time, ties, chords', () => {
    const t = (beats: number, beatUnit: TimeSignature['beatUnit']): TimeSignature => ({ beats, beatUnit });
    same(passageOf([fourCrotchets(), fourCrotchets()]), 100, 4);
    same(
      passageOf(
        [
          bar([note([C4, G4], dur('minim'), { tie: true }), note([C4, D4], dur('crotchet', 1)), note(D4, dur('quaver'))]),
          bar([note(C4, dur('semibreve'))]),
        ],
        undefined,
        t(4, 4),
      ),
      88,
      0,
    );
    same(passageOf([bar([note(C4, dur('crotchet', 1)), note(D4, dur('crotchet', 1))])], undefined, t(6, 8)), 60, 2);
    same(passageOf([bar([note(C4, dur('minim')), note(D4, dur('minim')), note(G4, dur('minim'))])], undefined, t(6, 4)), 90, 6);
    same(passageOf([bar([note(C4, dur('minim')), note(D4, dur('minim')), note(A4, dur('crotchet'))])], undefined, t(5, 4)), 100, 5);
  });

  it('every passage in the lesson content', () => {
    const root = join(process.cwd(), 'content', 'lessons');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.json')) files.push(full);
      }
    };
    walk(root);
    let checked = 0;
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      const o = value as Record<string, unknown>;
      if (o.clef && o.key && o.time && Array.isArray(o.bars)) {
        const p = o as unknown as Passage;
        if (!hasExpression(p)) {
          same(p, 96, 2);
          checked++;
        }
        return;
      }
      Object.values(o).forEach(visit);
    };
    files.forEach((f) => visit(JSON.parse(readFileSync(f, 'utf8'))));
    expect(checked).toBeGreaterThan(100);
  });
});

describe('performPassage', () => {
  it('uses the engine for order, seconds, loudness and lengths, nothing of its own', () => {
    const p = passageOf([fourCrotchets({ end: 'repeat-end' }, [C4, D4, G4, C5])], {
      dynamics: [{ at: at(0, 0), level: 'f' }],
      slurs: [{ from: at(0, 0), to: at(0, 1) }],
    });
    const perf = performPassage(p, 120, 0);
    const order = expression.performedEvents(p, 120);
    expect(perf.events.map((e) => [e.bar, e.event, e.start, e.length])).toEqual(
      order.map((e) => [e.bar, e.event, e.time, e.duration]),
    );
    expect(perf.events).toHaveLength(8);
    expect(perf.totalSeconds).toBeCloseTo(4, 9);
    // f is +4 dB: mf = 10^(-4/20); everything here is at f, so velocity 1
    expect(perf.mfVelocity).toBeCloseTo(0.630957, 6);
    expect(perf.events[0]!.attacks[0]!.velocity).toBeCloseTo(1, 9);
  });

  it('count-in leaves the notes later by the count-in at the starting tempo', () => {
    const perf = performPassage(passageOf([fourCrotchets()]), 90, 3);
    expect(perf.countInSeconds).toBeCloseTo(3 * (60 / 90), 9);
    expect(perf.events[0]!.start).toBeCloseTo(2, 9);
    expect(perf.clicks.map((c) => c.accent)).toEqual([true, false, false]);
  });
});
