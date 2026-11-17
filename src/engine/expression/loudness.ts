import type { DynamicLevel, Passage } from '../types';
import { exprOf, layoutOf, num, resolve } from './util';
import { wordKind } from './words';

/** Gain relative to mf, in dB (docs/expression.md section 3). */
export const LEVEL_DB: Record<DynamicLevel, number> = { pp: -15, p: -10, mp: -5, mf: 0, f: 4, ff: 7 };
/** Quietest to loudest. */
export const LEVEL_LADDER: DynamicLevel[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
export const ACCENT_DB = 5;

interface Ramp {
  i0: number;
  i1: number;
  dir: 1 | -1;
}

/** `value` moved `steps` places along the ladder (from the nearest named level), clamped to pp..ff. */
function shiftLevel(value: number, steps: number): number {
  let nearest = 0;
  LEVEL_LADDER.forEach((l, k) => {
    if (Math.abs(LEVEL_DB[l] - value) < Math.abs(LEVEL_DB[LEVEL_LADDER[nearest]!] - value)) nearest = k;
  });
  const k = Math.min(LEVEL_LADDER.length - 1, Math.max(0, nearest + steps));
  return LEVEL_DB[LEVEL_LADDER[k]!];
}

/**
 * dB relative to mf for every event: `result[bar][event]`, null for rests.
 *
 * - Dynamics apply from their event until the next one; before the first, mf.
 * - A hairpin runs from the level in force at its first event to the level of
 *   the first dynamic strictly after its last event; with none, two steps up
 *   (cresc) or down (dim) the pp p mp mf f ff ladder, clamped. The value of
 *   each event is interpolated linearly by onset position: 0 at the first
 *   event's onset, 1 at the end of the last event (so the next note reaches the
 *   target). After the hairpin the target level holds until the next dynamic.
 *   A dynamic written on an event inside a hairpin is ignored by that hairpin.
 * - `words` cresc./dim. (and long forms) are hairpins from their event up to the
 *   event before the next dynamic, or, with none, to the end of the bar after
 *   next (bar + 2, clamped). They are ignored when they start inside a hairpin
 *   or inside an earlier word-hairpin.
 * - An accent adds 5 dB to that note only (slurs change nothing).
 * - A tied continuation reports the same value as the first note of its tie
 *   (the tie sounds as one note at the first note's loudness, accent included).
 */
export function loudnessAt(passage: Passage): (number | null)[][] {
  const layout = layoutOf(passage);
  const x = exprOf(passage);
  const n = layout.flat.length;

  const dyn = new Map<number, number>();
  for (const d of x.dynamics) {
    const i = resolve(layout, d.at);
    if (i !== undefined && !dyn.has(i)) dyn.set(i, LEVEL_DB[d.level]);
  }
  const dynIndexes = [...dyn.keys()].sort((a, b) => a - b);

  const ramps: Ramp[] = [];
  const covered = (i: number) => ramps.some((r) => i >= r.i0 && i <= r.i1);
  for (const h of x.hairpins) {
    const i0 = resolve(layout, h.from);
    const i1 = resolve(layout, h.to);
    if (i0 === undefined || i1 === undefined || i1 < i0) continue;
    ramps.push({ i0, i1, dir: h.kind === 'cresc' ? 1 : -1 });
  }
  const wordRamps: Ramp[] = [];
  for (const w of x.words) {
    const kind = wordKind(w.text);
    const i0 = resolve(layout, w.at);
    if (i0 === undefined || (kind !== 'cresc' && kind !== 'dim')) continue;
    const nextDyn = dynIndexes.find((d) => d > i0);
    let i1: number;
    if (nextDyn !== undefined) {
      i1 = Math.max(i0, nextDyn - 1);
    } else {
      const lastBar = Math.min(w.at.bar + 2, passage.bars.length - 1);
      i1 = (layout.index[lastBar]?.at(-1) as number | undefined) ?? i0;
    }
    wordRamps.push({ i0, i1, dir: kind === 'cresc' ? 1 : -1 });
  }
  wordRamps.sort((a, b) => a.i0 - b.i0);
  for (const r of wordRamps) if (!covered(r.i0)) ramps.push(r);
  ramps.sort((a, b) => a.i0 - b.i0);
  const rampAt = new Map(ramps.map((r) => [r.i0, r]));

  const base: number[] = new Array<number>(n).fill(0);
  let current = 0;
  let i = 0;
  while (i < n) {
    const d = dyn.get(i);
    if (d !== undefined) current = d;
    const ramp = rampAt.get(i);
    if (!ramp) {
      base[i] = current;
      i += 1;
      continue;
    }
    const start = current;
    const nextDyn = dynIndexes.find((k) => k > ramp.i1);
    const target = nextDyn !== undefined ? (dyn.get(nextDyn) as number) : shiftLevel(start, 2 * ramp.dir);
    const t0 = num(layout.start[ramp.i0]!);
    const t1 = num(layout.start[ramp.i1]!) + num(layout.length[ramp.i1]!);
    for (let k = ramp.i0; k <= ramp.i1; k++) {
      base[k] = start + (target - start) * ((num(layout.start[k]!) - t0) / (t1 - t0));
    }
    current = target;
    i = ramp.i1 + 1;
  }

  const out: (number | null)[][] = passage.bars.map((bar) => bar.events.map(() => null));
  layout.flat.forEach((f, k) => {
    if (f.ev.kind === 'rest') return;
    const h = layout.head[k]!;
    const headEv = layout.flat[h]!.ev;
    const accent = headEv.kind === 'note' && (headEv.articulations ?? []).includes('accent');
    out[f.bar]![f.event] = base[h]! + (accent ? ACCENT_DB : 0);
  });
  return out;
}
