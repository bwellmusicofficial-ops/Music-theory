/**
 * Keeps expression valid when an edit adds or removes events (docs/expression.md section 4, Edit mode).
 * Expression is displayed but not editable, so an edit must never leave a marking pointing at the wrong
 * event or at nothing: refs after an insertion shift; marks on a deleted event go; spans whose end vanished
 * shrink to the events that remain, or go when fewer than they need remain.
 */
import { validateExpression } from '@/engine/expression/validate';
import type { Bar, EventRef, Expression, Passage, ScoreEvent } from '@/engine/types';

/** For each old event of the edited bar: its new index, or null when the event is gone. */
type Change = NonNullable<Expression['tempoChanges']>[number];

export type EventMap = (number | null)[];

export const identityMap = (n: number): EventMap => Array.from({ length: n }, (_, i) => i);
export const insertMap = (n: number, slot: number): EventMap => Array.from({ length: n }, (_, i) => (i >= slot ? i + 1 : i));
export const deleteMap = (n: number, at: number): EventMap => Array.from({ length: n }, (_, i) => (i === at ? null : i > at ? i - 1 : i));

const isNote = (ev: ScoreEvent | undefined) => ev?.kind === 'note';

/** What the edited bar's surviving events keep that the editor itself does not model. */
export function carryEventMarks(oldBar: Bar, rebuilt: Bar, map: EventMap): Bar {
  const events = rebuilt.events.slice();
  oldBar.events.forEach((old, i) => {
    const j = map[i];
    if (j === null || j === undefined) return;
    const cur = events[j];
    if (!cur) return;
    if (cur.kind === 'note' && old.kind === 'note' && old.articulations?.length) events[j] = { ...cur, articulations: [...old.articulations] };
    const now = events[j];
    if (old.fermata) events[j] = { ...now, fermata: true };
  });
  const out: Bar = { ...rebuilt, events };
  if (oldBar.repeatStart) out.repeatStart = true;
  if (oldBar.endBarline) out.endBarline = oldBar.endBarline;
  if (oldBar.marker) out.marker = oldBar.marker;
  return out;
}

/** A tied note's continuation carries no articulation or pause of its own (rule 8). */
function stripContinuations(bars: Bar[], from: number): Bar[] {
  const out = bars.slice();
  for (const b of [from, from + 1]) {
    if (!out[b]) continue;
    const prevLast = b === 0 ? undefined : out[b - 1].events.at(-1);
    let changed = false;
    let prev: ScoreEvent | undefined = prevLast;
    const events = out[b].events.map((ev) => {
      const continuation = ev.kind === 'note' && prev?.kind === 'note' && prev.tieToNext === true;
      prev = ev;
      if (!continuation || ev.kind !== 'note' || !(ev.articulations?.length || ev.fermata)) return ev;
      changed = true;
      const copy = { ...ev };
      delete copy.articulations;
      delete copy.fermata;
      return copy;
    });
    if (changed) out[b] = { ...out[b], events };
  }
  return out;
}

export function hasExpressionOrMarks(p: Passage): boolean {
  return !!p.expression || p.bars.some((b) => b.repeatStart || b.endBarline || b.marker || b.events.some((e) => e.fermata || (e.kind === 'note' && e.articulations?.length)));
}

/**
 * `before` is the passage before the edit; `after` has the edited bar rebuilt (with marks carried). Returns
 * `after` with the expression remapped through `map`, shrunk or dropped, and tie continuations cleaned.
 */
export function remapExpression(before: Passage, after: Passage, barIdx: number, map: EventMap): Passage {
  const bars = stripContinuations(after.bars, barIdx);
  const next: Passage = { ...after, bars };
  const x = before.expression;
  if (!x) return next;

  // Flat order of the old passage, and where each old event ended up.
  const oldFlat: EventRef[] = [];
  before.bars.forEach((b, bi) => b.events.forEach((_, ei) => oldFlat.push({ bar: bi, event: ei })));
  const flatOf = new Map(oldFlat.map((r, i) => [`${r.bar}:${r.event}`, i]));
  const where = (i: number): EventRef | null => {
    const r = oldFlat[i];
    if (r.bar !== barIdx) return r;
    const j = map[r.event];
    return j === null || j === undefined ? null : { bar: barIdx, event: j };
  };
  const at = (r: EventRef): EventRef | null => {
    const i = flatOf.get(`${r.bar}:${r.event}`);
    return i === undefined ? null : where(i);
  };
  const eventAt = (r: EventRef) => bars[r.bar]?.events[r.event];

  /** The surviving events of an old span, as new refs, in order (optionally notes only). */
  const inside = (from: EventRef, to: EventRef, notesOnly: boolean): EventRef[] => {
    const a = flatOf.get(`${from.bar}:${from.event}`);
    const b = flatOf.get(`${to.bar}:${to.event}`);
    if (a === undefined || b === undefined) return [];
    const out: EventRef[] = [];
    for (let i = a; i <= b; i++) {
      const r = where(i);
      if (r && (!notesOnly || isNote(eventAt(r)))) out.push(r);
    }
    return out;
  };

  const out: Expression = {};
  if (x.tempo) out.tempo = x.tempo;

  if (x.dynamics) {
    const kept = x.dynamics.flatMap((d) => {
      const r = at(d.at);
      return r ? [{ at: r, level: d.level }] : [];
    });
    // Two in a row must differ: when deleting the one between two equal levels leaves them side by side, the second goes.
    const order = (r: EventRef) => bars.slice(0, r.bar).reduce((n, b) => n + b.events.length, 0) + r.event;
    kept.sort((p, q) => order(p.at) - order(q.at));
    const dyn = kept.filter((d, i) => i === 0 || d.level !== kept[i - 1].level);
    if (dyn.length) out.dynamics = dyn;
  }
  if (x.words) {
    const kept = x.words.flatMap((w) => {
      const r = at(w.at);
      return r ? [{ ...w, at: r }] : [];
    });
    if (kept.length) out.words = kept;
  }
  if (x.hairpins) {
    const kept = x.hairpins.flatMap((h) => {
      const s = inside(h.from, h.to, false);
      return s.length ? [{ ...h, from: s[0], to: s[s.length - 1] }] : [];
    });
    if (kept.length) out.hairpins = kept;
  }
  if (x.slurs) {
    const kept = x.slurs.flatMap((s) => {
      const n = inside(s.from, s.to, true);
      return n.length >= 2 ? [{ from: n[0], to: n[n.length - 1] }] : [];
    });
    if (kept.length) out.slurs = kept;
  }
  if (x.tempoChanges) {
    const kept = x.tempoChanges.flatMap<Change>((c) => {
      if (c.kind === 'a-tempo') {
        const r = at(c.at);
        return r ? [{ ...c, at: r }] : [];
      }
      const s = inside(c.from, c.to, false);
      return s.length ? [{ ...c, from: s[0], to: s[s.length - 1] }] : [];
    });
    // An "a tempo" whose slowing down or speeding up has gone has nothing to return from.
    const candidate: Passage = { ...next, expression: { ...out, tempoChanges: kept } };
    const orphan = new Set(validateExpression(candidate).filter((m) => m.includes('a tempo must come after')).map((m) => m.split(':')[0]));
    const final = kept.filter((c) => {
      if (c.kind !== 'a-tempo') return true;
      return !orphan.has(`Bar ${c.at.bar + 1}, ${eventAt(c.at)?.kind === 'note' ? 'note' : 'rest'} ${c.at.event + 1}`);
    });
    if (final.length) out.tempoChanges = final;
  }
  return { ...next, expression: Object.keys(out).length ? out : undefined } as Passage;
}
