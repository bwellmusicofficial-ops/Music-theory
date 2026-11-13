import { TheoryError } from './api';
import type { Rng } from './types';

/**
 * Deterministic seeded generator (mulberry32). The same seed always yields the
 * same sequence, on every platform, so questions can be replayed from a seed.
 */
export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) {
    throw new TheoryError(`createRng: seed must be a finite number, got ${seed}`);
  }
  let state = Math.trunc(seed) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new TheoryError(`Rng.int: need integers with min <= max, got ${min}, ${max}`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new TheoryError('Rng.pick: cannot pick from an empty list');
    return items[int(0, items.length - 1)];
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  return { next, int, pick, shuffle };
}
