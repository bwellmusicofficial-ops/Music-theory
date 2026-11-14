import type { Bar, Clef } from '@/engine/types';
import type { Engines } from '../types';

export type StemDir = 1 | -1;

const MIDDLE = 4;

function singleRule(position: number): StemDir {
  return position < MIDDLE ? 1 : -1;
}

/** Section 4.4. Notes: explicit direction for every event (rests get a placeholder). */
export function stemDirections(e: Engines, bar: Bar, groups: number[][], clef: Clef): StemDir[] {
  const out: StemDir[] = bar.events.map((ev) => {
    if (ev.kind === 'rest') return 1;
    if (ev.duration.value === 'semibreve' || ev.duration.value === 'breve') return 1;
    const ps = ev.pitches.map((p) => e.pitch.stavePosition(p, clef));
    if (ps.length === 1) return singleRule(ps[0]);
    const above = Math.max(...ps) - MIDDLE;
    const below = MIDDLE - Math.min(...ps);
    return above > below ? -1 : above < below ? 1 : -1;
  });
  for (const g of groups) {
    let best = { dist: -1, dir: -1 as StemDir };
    for (const i of g) {
      const ev = bar.events[i];
      if (ev.kind !== 'note') continue;
      for (const p of ev.pitches) {
        const pos = e.pitch.stavePosition(p, clef);
        const dist = Math.abs(pos - MIDDLE);
        const dir = singleRule(pos);
        if (dist > best.dist) best = { dist, dir };
        else if (dist === best.dist && dir !== best.dir) best = { dist, dir: -1 };
      }
    }
    for (const i of g) out[i] = best.dir;
  }
  return out;
}
