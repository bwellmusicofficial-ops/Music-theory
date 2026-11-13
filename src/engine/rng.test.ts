import { describe, expect, it } from 'vitest';
import { TheoryError } from './api';
import { createRng } from './rng';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    expect(sa).toEqual(sb);
  });

  it('gives different sequences for different seeds', () => {
    const a = Array.from({ length: 5 }, ((r) => () => r.next())(createRng(1)));
    const b = Array.from({ length: 5 }, ((r) => () => r.next())(createRng(2)));
    expect(a).not.toEqual(b);
  });

  it('matches the reference mulberry32 value for seed 1', () => {
    expect(createRng(1).next()).toBeCloseTo(0.6270739405881613, 12);
  });

  it('keeps next() within [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() is inclusive at both ends and covers the range', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(-2, 2));
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2]);
    expect(r.int(5, 5)).toBe(5);
  });

  it('int() rejects bad ranges', () => {
    const r = createRng(3);
    expect(() => r.int(3, 2)).toThrow(TheoryError);
    expect(() => r.int(1.5, 2)).toThrow(TheoryError);
  });

  it('pick() returns members and rejects empty lists', () => {
    const r = createRng(9);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow(TheoryError);
  });

  it('shuffle() returns a permutation without mutating the input, deterministically', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...items];
    const out = createRng(11).shuffle(items);
    expect(items).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(createRng(11).shuffle(items)).toEqual(out);
  });

  it('rejects a non-finite seed', () => {
    expect(() => createRng(Number.NaN)).toThrow(TheoryError);
  });
});
