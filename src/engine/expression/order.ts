import type { Passage } from '../types';

/**
 * Bar indexes in playing order (docs/expression.md section 3, "Repeats and navigation").
 *
 * - A `repeat-end` sends playing back to the nearest `repeatStart` at or before
 *   that bar (or bar 0 when there is none); each repeat is taken once.
 * - A `dc` / `dc-al-fine` bar sends playing to bar 0, `ds` / `ds-al-fine` to the
 *   segno bar. The jump happens after the marked bar is played, once only.
 * - After either jump no repeat is taken, and with "al fine" playing stops after
 *   the bar marked `fine`. A plain dc/ds met a second time is simply played on.
 * - A ds with no segno, or any other problem that `validateExpression` reports,
 *   never makes this loop: every jump is taken at most once.
 */
export function performanceOrder(passage: Passage): number[] {
  const bars = passage.bars;
  const out: number[] = [];
  const segno = bars.findIndex((b) => b.marker === 'segno');
  const taken = new Set<number>();
  let jumped = false;
  let stopAtFine = false;
  let i = 0;
  while (i < bars.length) {
    const bar = bars[i]!;
    out.push(i);
    if (jumped) {
      if (stopAtFine && bar.marker === 'fine') break;
      i += 1;
      continue;
    }
    if (bar.endBarline === 'repeat-end' && !taken.has(i)) {
      taken.add(i);
      let back = i;
      while (back > 0 && !bars[back]!.repeatStart) back -= 1;
      i = back;
      continue;
    }
    const m = bar.marker;
    if (m === 'dc' || m === 'dc-al-fine') {
      jumped = true;
      stopAtFine = m === 'dc-al-fine';
      i = 0;
      continue;
    }
    if ((m === 'ds' || m === 'ds-al-fine') && segno >= 0) {
      jumped = true;
      stopAtFine = m === 'ds-al-fine';
      i = segno;
      continue;
    }
    i += 1;
  }
  return out;
}
