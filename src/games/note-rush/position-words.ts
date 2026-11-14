import type { Terminology } from '@/engine/types';

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `number ${n}`;
}

/** "stave" in UK English, "staff" in US English. */
export function staveWord(terminology: Terminology): string {
  return terminology === 'us' ? 'staff' : 'stave';
}

/**
 * Where a note sits, in words, without naming it. Position 0 is the bottom
 * line, 1 the first space, 8 the top line; negatives and 9+ are ledger lines
 * and the spaces between them.
 */
export function describeStavePosition(position: number, terminology: Terminology): string {
  const stave = staveWord(terminology);
  if (position >= 0 && position <= 8) {
    return position % 2 === 0
      ? `${ordinal(position / 2 + 1)} line`
      : `${ordinal((position - 1) / 2 + 1)} space`;
  }
  if (position < 0) {
    if (position % 2 === 0) return `${ordinal(-position / 2)} ledger line below the ${stave}`;
    const n = (-position - 1) / 2;
    return n === 0
      ? `space below the bottom line`
      : `space below the ${ordinal(n)} ledger line below the ${stave}`;
  }
  if (position % 2 === 0) return `${ordinal((position - 8) / 2)} ledger line above the ${stave}`;
  const n = (position - 9) / 2;
  return n === 0
    ? `space above the top line`
    : `space above the ${ordinal(n)} ledger line above the ${stave}`;
}
