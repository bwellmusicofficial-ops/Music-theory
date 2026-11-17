/** Pure: does a system need extra room above or below for expression marks? (docs/expression.md section 4, layout rules.) */
import type { Passage } from '@/engine/types';

export interface ExpressionRoom {
  /** Tempo, pause, navigation sign or words above. */
  top: boolean;
  /** Dynamic, hairpin or words below. */
  bottom: boolean;
}

export const NO_ROOM: ExpressionRoom = { top: false, bottom: false };

/** What the systems holding `bars` must reserve. A passage without expression and without pauses or signs needs nothing. */
export function expressionRoom(passage: Passage, bars: number[]): ExpressionRoom {
  const inSystem = new Set(bars);
  const x = passage.expression;
  let top = false;
  let bottom = false;
  for (const b of bars) {
    const bar = passage.bars[b];
    if (!bar) continue;
    if (bar.marker) top = true;
    if (bar.events.some((e) => e.fermata)) top = true;
  }
  if (x) {
    if (inSystem.has(0) && (x.tempo?.text || x.tempo?.bpm !== undefined)) top = true;
    if (x.dynamics?.some((d) => inSystem.has(d.at.bar))) bottom = true;
    if (x.hairpins?.some((h) => bars.some((b) => b >= h.from.bar && b <= h.to.bar))) bottom = true;
    for (const w of x.words ?? []) {
      if (!inSystem.has(w.at.bar)) continue;
      if (w.place === 'below') bottom = true;
      else top = true;
    }
    for (const c of x.tempoChanges ?? []) {
      const at = c.kind === 'a-tempo' ? c.at : c.from;
      if (inSystem.has(at.bar)) top = true;
    }
  }
  return { top, bottom };
}
