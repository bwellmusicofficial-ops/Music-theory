import { TheoryError } from '../api';
import type { Fraction } from '../types';

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Builds a fraction in lowest terms with a positive denominator. */
export function frac(n: number, d = 1): Fraction {
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    throw new TheoryError(`Fraction parts must be integers, got ${n}/${d}`);
  }
  if (d === 0) {
    throw new TheoryError('Fraction denominator must not be zero');
  }
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

/** Re-reduces an incoming fraction, rejecting malformed ones. */
export function normalise(f: Fraction): Fraction {
  return frac(f.n, f.d);
}

export const ZERO: Fraction = { n: 0, d: 1 };

export function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.n, a.d * b.d);
}

export function div(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d, a.d * b.n);
}

/** -1, 0 or 1. */
export function cmp(a: Fraction, b: Fraction): number {
  return Math.sign(a.n * b.d - b.n * a.d);
}

export const eq = (a: Fraction, b: Fraction): boolean => cmp(a, b) === 0;
export const lt = (a: Fraction, b: Fraction): boolean => cmp(a, b) < 0;
export const le = (a: Fraction, b: Fraction): boolean => cmp(a, b) <= 0;

/** Whole number of times b fits in a (a, b >= 0, b > 0). */
export function floorDiv(a: Fraction, b: Fraction): number {
  return Math.floor((a.n * b.d) / (a.d * b.n));
}

/** True when a is an exact whole-number multiple of b (b > 0). */
export function isMultipleOf(a: Fraction, b: Fraction): boolean {
  return (a.n * b.d) % (a.d * b.n) === 0;
}

export function toNumber(a: Fraction): number {
  return a.n / a.d;
}
