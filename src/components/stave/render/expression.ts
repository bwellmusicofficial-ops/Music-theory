/**
 * Expression marks (docs/expression.md section 4): articulation, pauses, tempo, navigation signs,
 * dynamics, hairpins, slurs and words. Only this file and draw.ts know how they are drawn.
 *
 * Every mark is wrapped in an SVG group carrying its class (mtn-artic, mtn-fermata, mtn-tempo,
 * mtn-repeat, mtn-dyn, mtn-hairpin, mtn-slur, mtn-words), so tests can find it and CSS colours it.
 */
import type { BarMarker, DynamicLevel, EventRef, Passage, ScoreEvent } from '@/engine/types';
import { wordKind } from '@/engine/expression/words';
import {
  DYN_ASCENT,
  DYN_BASELINE_OFFSET,
  DYN_DESCENT,
  DYN_GAP,
  DYN_NOTE_GAP,
  HAIRPIN_HEIGHT,
  HAIRPIN_LANE_GAP,
  HAIRPIN_MIN_WIDTH,
  SLUR_GAP,
  SLUR_SIGN_LIFT,
  SLUR_MAX_HEIGHT,
  SLUR_MIN_HEIGHT,
  TEMPO_BASELINE_ABOVE,
  WORDS_ABOVE_OFFSET,
  WORDS_BELOW_OFFSET,
  WORDS_FONT_PT,
} from '../constants';
import { ARTICULATION_CODES, tempoBeat } from '../notation/to-vexflow';
import type { VexFlowModule } from '../vexflow-loader';

type VF = VexFlowModule;
type Note = InstanceType<VF['StaveNote']>;
type Stave = InstanceType<VF['Stave']>;
type Ctx = ReturnType<InstanceType<VF['Renderer']>['getContext']>;

interface Drawable {
  draw(): void;
  checkContext(): Ctx;
}

function openGroup(ctx: Ctx, cls: string, attrs: Record<string, string> = {}): SVGElement {
  const g = (ctx as unknown as { openGroup(): SVGElement }).openGroup();
  g.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, v);
  return g;
}
const closeGroup = (ctx: Ctx) => (ctx as unknown as { closeGroup(): void }).closeGroup();

/** Makes a VexFlow element draw inside a group with our class (VexFlow's own `addClass` does not reach the SVG in 5.0.0). */
function classed(el: Drawable, cls: string, attrs: Record<string, string> = {}, dy = 0): void {
  const original = el.draw.bind(el);
  el.draw = () => {
    const ctx = el.checkContext();
    const g = openGroup(ctx, cls, attrs);
    if (dy !== 0) g.setAttribute('transform', `translate(0 ${dy})`);
    try {
      original();
    } finally {
      closeGroup(ctx);
    }
  };
}

// --- on notes: articulation and pauses (modifiers, so VexFlow stacks them) ---------

/** `dir` is the side the stem is on (1 up, -1 down); signs go on the notehead side, away from it. */
export function addNoteMarks(vf: VF, note: Note, ev: ScoreEvent, dir: 1 | -1, attrs: { bar: number; event: number }): void {
  const where = { 'data-bar': String(attrs.bar), 'data-event': String(attrs.event) };
  if (ev.kind === 'note') {
    for (const a of ev.articulations ?? []) {
      const art = new vf.Articulation(ARTICULATION_CODES[a]);
      art.setPosition(dir === 1 ? vf.Modifier.Position.BELOW : vf.Modifier.Position.ABOVE);
      classed(art as unknown as Drawable, 'mtn-artic', { ...where, 'data-kind': a });
      note.addModifier(art, 0);
    }
  }
  if (ev.fermata) {
    const f = new vf.Articulation('a@a');
    f.setPosition(vf.Modifier.Position.ABOVE);
    classed(f as unknown as Drawable, 'mtn-fermata', where);
    note.addModifier(f, 0);
  }
}

/** Gives the repeat, double and final bar lines the passage asked for the class mtn-repeat (the plain bar lines stay as they were). */
export function tagBarlines(vf: VF, stave: Stave): void {
  const B = vf.BarlineType;
  const names: Record<number, string> = { [B.REPEAT_BEGIN]: 'repeat-begin', [B.REPEAT_END]: 'repeat-end', [B.REPEAT_BOTH]: 'repeat-both', [B.DOUBLE]: 'double', [B.END]: 'final' };
  for (const m of stave.getModifiers()) {
    if (m.getCategory() !== 'Barline') continue;
    const type = (m as unknown as { getType(): number }).getType();
    if (names[type]) classed(m as unknown as Drawable, 'mtn-repeat', { 'data-kind': names[type] });
  }
}

// --- on staves: tempo and navigation signs -------------------------------------------

export function addTempo(vf: VF, stave: Stave, passage: Passage): void {
  const t = passage.expression?.tempo;
  if (!t || (!t.text && t.bpm === undefined)) return;
  const opts: Record<string, unknown> = {};
  if (t.text) opts.name = t.text;
  if (t.bpm !== undefined) Object.assign(opts, tempoBeat(passage.time, t.beat), { bpm: t.bpm });
  const tempo = new vf.StaveTempo(opts, stave.getX(), TEMPO_SHIFT);
  classed(tempo as unknown as Drawable, 'mtn-tempo');
  stave.addModifier(tempo);
}
/** StaveTempo sits 20 units above the top line by default; raise it clear of pauses and signs. */
const TEMPO_SHIFT = -(TEMPO_BASELINE_ABOVE - 20);

const MARKERS: Record<BarMarker, { type: 'SEGNO_LEFT' | 'DC' | 'DC_AL_FINE' | 'DS' | 'DS_AL_FINE' | 'FINE'; dy: number }> = {
  // VexFlow puts the text 35 units above the top line and the segno 50; bring both down to sit close to the stave.
  segno: { type: 'SEGNO_LEFT', dy: 44 },
  fine: { type: 'FINE', dy: 14 },
  dc: { type: 'DC', dy: 14 },
  'dc-al-fine': { type: 'DC_AL_FINE', dy: 14 },
  ds: { type: 'DS', dy: 14 },
  'ds-al-fine': { type: 'DS_AL_FINE', dy: 14 },
};

export function addMarker(vf: VF, stave: Stave, marker: BarMarker): void {
  const m = MARKERS[marker];
  const rep = new vf.Repetition(vf.Repetition.type[m.type], stave.getX(), 0);
  classed(rep as unknown as Drawable, 'mtn-repeat', { 'data-kind': marker }, m.dy);
  stave.addModifier(rep);
}

// --- everything placed by position after the notes exist ------------------------------

export interface ExpressionInput {
  vf: VF;
  ctx: Ctx;
  passage: Passage;
  notes: Map<string, Note>;
  /** Stave of each bar. */
  staves: Map<number, Stave>;
  /** Bars in each system, and the absolute y of its box top and height. */
  systems: { bars: number[]; top: number; height: number }[];
}

export interface ExpressionOverflow {
  /** Units that did not fit above / below the box, per system (0 when everything fits). */
  up: number[];
  down: number[];
  /** Rightmost x any mark reaches (a dynamic under the last note can run past the bar line). */
  right: number;
}

const key = (r: EventRef) => `${r.bar}:${r.event}`;

const ITALIAN = /^(cresc|dim|decresc|rit|rall|accel|a tempo|dolce|cantabile|poco|molto|legato|staccato|marcato|sempre|meno|pi[uù]|mezzo|forte|piano|pesante|con |espress|subito|morendo|calando|tempo|largo|lento|andante|moderato|allegro|vivace|presto|adagio)/i;

interface Rect {
  x0: number;
  x1: number;
}
const overlaps = (a: Rect, b: Rect, gap = 0) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap;

export function drawExpression(inp: ExpressionInput): ExpressionOverflow {
  const { vf, ctx, passage, notes, staves, systems } = inp;
  const x = passage.expression;
  const up = systems.map(() => 0);
  let reachRight = 0;
  const down = systems.map(() => 0);
  const barSystem = new Map<number, number>();
  systems.forEach((s, i) => s.bars.forEach((b) => barSystem.set(b, i)));
  const sysOf = (r: EventRef) => barSystem.get(r.bar) ?? 0;
  const noteAt = (r: EventRef) => notes.get(key(r));
  const left = (r: EventRef) => noteAt(r)?.getNoteHeadBeginX() ?? 0;
  const right = (r: EventRef) => noteAt(r)?.getNoteHeadEndX() ?? 0;
  const staveOf = (s: number) => staves.get(systems[s].bars[0]) as Stave;
  const lastStaveOf = (s: number) => staves.get(systems[s].bars[systems[s].bars.length - 1]) as Stave;

  const growUp = (s: number, y: number) => {
    up[s] = Math.max(up[s], Math.ceil(systems[s].top + 1 - y));
  };
  const growDown = (s: number, y: number) => {
    down[s] = Math.max(down[s], Math.ceil(y - (systems[s].top + systems[s].height) + 1));
  };

  // Flat order of events, to find the event after another.
  const flat: EventRef[] = [];
  passage.bars.forEach((b, bi) => b.events.forEach((_, ei) => flat.push({ bar: bi, event: ei })));
  const flatIndex = new Map(flat.map((r, i) => [key(r), i]));

  // --- slurs first: the dynamics row must clear a slur drawn below the notes ------------
  const slurExtent = systems.map(() => ({ above: Infinity, below: -Infinity }));
  for (const slur of x?.slurs ?? []) {
    const a = flatIndex.get(key(slur.from));
    const b = flatIndex.get(key(slur.to));
    if (a === undefined || b === undefined) continue;
    const refs = flat.slice(a, b + 1).filter((r) => noteAt(r) && passage.bars[r.bar].events[r.event].kind === 'note');
    if (refs.length < 2) continue;
    // Away from the stems: below the heads when every stem points up, otherwise above (mixed stems put the slur above).
    let upStems = 0;
    let downStems = 0;
    for (const r of refs) {
      const n = noteAt(r) as Note;
      const dirn = n.hasStem() ? n.getStemDirection() : n.getYs()[0] < staveOf(sysOf(r)).getYForLine(2) ? -1 : 1;
      if (dirn === 1) upStems++;
      else downStems++;
    }
    const below = upStems > 0 && downStems === 0;
    const sFrom = sysOf(slur.from);
    const sTo = sysOf(slur.to);
    const parts: { from?: Note; to?: Note; system: number; middle?: boolean }[] =
      sFrom === sTo ? [{ from: noteAt(slur.from), to: noteAt(slur.to), system: sFrom }] : [{ from: noteAt(slur.from), system: sFrom }];
    if (sFrom !== sTo) {
      // Systems the slur passes through completely, then the last piece.
      for (let m = sFrom + 1; m < sTo; m++) parts.push({ system: m, middle: true });
      parts.push({ to: noteAt(slur.to), system: sTo });
    }
    for (const part of parts) {
      if (part.middle) {
        // A system the slur crosses from edge to edge: no note to hang it on, so draw it between the stave ends.
        const st = staveOf(part.system);
        const y = below ? st.getYForLine(4) + SLUR_GAP + 6 : st.getYForLine(0) - SLUR_GAP - 6;
        const anchor = noteAt({ bar: systems[part.system].bars[0], event: 0 });
        if (!anchor) continue;
        const h = SLUR_MAX_HEIGHT;
        const curve = new vf.Curve(anchor, undefined, { thickness: 2.4, xShift: 0, yShift: 0, cps: [{ x: 0, y: h }, { x: 0, y: h }] });
        curve.setContext(ctx);
        openGroup(ctx, 'mtn-slur', { 'data-from': key(slur.from), 'data-to': key(slur.to), 'data-side': below ? 'below' : 'above' });
        curve.renderCurve({ firstX: st.getTieStartX(), lastX: lastStaveOf(part.system).getTieEndX(), firstY: y, lastY: y, direction: below ? 1 : -1 });
        closeGroup(ctx);
        if (below) growDown(part.system, y + h * 0.75 + 3);
        else growUp(part.system, y - h * 0.75 - 3);
        continue;
      }
      const first = part.from ?? (part.to as Note);
      const last = part.to ?? (part.from as Note);
      const startX = part.from ? part.from.getTieRightX() : staveOf(part.system).getTieStartX();
      const endX = part.to ? part.to.getTieLeftX() : lastStaveOf(part.system).getTieEndX();
      const span = Math.max(0, endX - startX);
      const height = Math.min(SLUR_MAX_HEIGHT, Math.max(SLUR_MIN_HEIGHT, 10 + span / 9));
      // Where the stem points at the slur, start from its tip so the curve clears it.
      const tip = (n: Note) => (below ? n.getStemDirection() === -1 : n.getStemDirection() === 1) && n.hasStem();
      // Signs on the notehead side sit inside the slur: lift it clear of them.
      const signOnSide = [part.from && slur.from, part.to && slur.to].some((r) => {
        if (!r) return false;
        const ev = passage.bars[r.bar].events[r.event];
        const n = noteAt(r) as Note;
        const stemUp = n.hasStem() ? n.getStemDirection() === 1 : n.getYs()[0] > staveOf(sysOf(r)).getYForLine(2);
        return ev.kind === 'note' && (ev.articulations?.length ?? 0) > 0 && stemUp === below;
      });
      const curve = new vf.Curve(part.from, part.to, {
        openingDirection: below ? 'up' : 'down',
        thickness: 2.4,
        // Reach to the middle of each head; a piece that runs to the edge of the stave stops there.
        xShift: part.from && part.to ? -4 : 0,
        yShift: SLUR_GAP + (signOnSide ? SLUR_SIGN_LIFT : 0),
        cps: [
          { x: 0, y: height },
          { x: 0, y: height },
        ],
        position: tip(first) ? 'nearTop' : 'nearHead',
        positionEnd: tip(last) ? 'nearTop' : 'nearHead',
      });
      curve.setContext(ctx);
      classed(curve as unknown as Drawable, 'mtn-slur', { 'data-from': key(slur.from), 'data-to': key(slur.to), 'data-side': below ? 'below' : 'above' });
      curve.draw();
      // Room: where the curve starts and how far it bulges.
      const ys = [first, last].map((n) => (below ? Math.max(...n.getYs()) : Math.min(...n.getYs())));
      const lift = SLUR_GAP + (signOnSide ? SLUR_SIGN_LIFT : 0) + height * 0.75 + 3;
      const reach = (below ? Math.max(...ys) : Math.min(...ys)) + (below ? 1 : -1) * lift;
      const e = slurExtent[part.system];
      if (below) e.below = Math.max(e.below, reach);
      else e.above = Math.min(e.above, reach);
      if (below) growDown(part.system, reach);
      else growUp(part.system, reach);
    }
  }

  // --- the common rows ------------------------------------------------------------------
  const belowBase = systems.map((s, si) => {
    const bottomLine = staveOf(si).getYForLine(4);
    let lowest = bottomLine;
    for (const b of s.bars) {
      passage.bars[b].events.forEach((_, ei) => {
        const n = noteAt({ bar: b, event: ei });
        if (!n) return;
        const bb = n.getBoundingBox();
        lowest = Math.max(lowest, bb.y + bb.h);
      });
    }
    lowest = Math.max(lowest, slurExtent[si].below);
    return Math.max(bottomLine + DYN_BASELINE_OFFSET, lowest + DYN_NOTE_GAP + DYN_ASCENT);
  });
  const aboveBase = systems.map((s, si) => {
    const topLine = staveOf(si).getYForLine(0);
    let highest = topLine;
    for (const b of s.bars) {
      passage.bars[b].events.forEach((_, ei) => {
        const n = noteAt({ bar: b, event: ei });
        if (!n) return;
        highest = Math.min(highest, n.getBoundingBox().y);
      });
    }
    highest = Math.min(highest, slurExtent[si].above);
    return Math.min(topLine - WORDS_ABOVE_OFFSET, highest - 5);
  });

  // --- dynamics ---------------------------------------------------------------------------
  const dynRects = new Map<string, Rect>();
  const dynBySystem = systems.map(() => [] as { at: EventRef; level: DynamicLevel }[]);
  for (const d of x?.dynamics ?? []) if (noteAt(d.at)) dynBySystem[sysOf(d.at)].push(d);
  dynBySystem.forEach((list, si) => {
    list.sort((p, q) => (flatIndex.get(key(p.at)) ?? 0) - (flatIndex.get(key(q.at)) ?? 0));
    let prevRight = -Infinity;
    for (const d of list) {
      const glyphs = [...d.level].map((c) => vf.TextDynamics.GLYPHS[c]).join('');
      const el = new vf.Element('TextDynamics');
      el.setText(glyphs);
      const w = el.getWidth();
      const px = Math.max(left(d.at), prevRight + DYN_GAP);
      const y = belowBase[si];
      openGroup(ctx, 'mtn-dyn', { 'data-level': d.level, 'data-bar': String(d.at.bar), 'data-event': String(d.at.event) });
      el.renderText(ctx, px, y);
      closeGroup(ctx);
      dynRects.set(key(d.at), { x0: px, x1: px + w });
      reachRight = Math.max(reachRight, px + w);
      prevRight = px + w;
      growDown(si, y + DYN_DESCENT);
    }
  });

  // --- hairpins -----------------------------------------------------------------------------
  const hairpinRects = systems.map(() => [] as Rect[]);
  for (const h of x?.hairpins ?? []) {
    const a = flatIndex.get(key(h.from));
    const b = flatIndex.get(key(h.to));
    if (a === undefined || b === undefined || !noteAt(h.from) || !noteAt(h.to)) continue;
    const sFrom = sysOf(h.from);
    const sTo = sysOf(h.to);
    const next = flat[b + 1];
    const parts: { s: number; x0: number; x1: number; lane: number }[] = [];
    for (let s = sFrom; s <= sTo; s++) {
      const startsHere = s === sFrom;
      const endsHere = s === sTo;
      let x0 = startsHere ? left(h.from) : staveOf(s).getNoteStartX() + 2;
      let x1 = endsHere ? right(h.to) + 2 : lastStaveOf(s).getNoteEndX() - 3;
      const full = { x0, x1 };
      // Keep clear of the letters: start after a dynamic on the first event, stop before one on the last or the next.
      const own = dynRects.get(key(h.from));
      if (startsHere && own) x0 = Math.max(x0, own.x1 + DYN_GAP);
      const stop = [dynRects.get(key(h.to)), next && sysOf(next) === s ? dynRects.get(key(next)) : undefined].filter(Boolean) as Rect[];
      for (const r of stop) if (endsHere && r.x0 > x0) x1 = Math.min(x1, r.x0 - DYN_GAP);
      const inside = [...dynRects.entries()].some(([k, r]) => {
        const i = flatIndex.get(k) ?? -1;
        return i > a && i <= b && sysOf(flat[i]) === s && overlaps({ x0, x1 }, r, DYN_GAP);
      });
      let lane = 0;
      if (x1 - x0 < HAIRPIN_MIN_WIDTH || inside) {
        lane = 1;
        x0 = full.x0;
        x1 = Math.max(full.x1, full.x0 + HAIRPIN_MIN_WIDTH);
      }
      parts.push({ s, x0, x1, lane });
    }
    // The wedge opens (or closes) evenly along its whole length, so a split hairpin's two pieces meet at the same width.
    const total = parts.reduce((sum, p) => sum + (p.x1 - p.x0), 0) || 1;
    let done = 0;
    parts.forEach((p, i) => {
      const t0 = done / total;
      done += p.x1 - p.x0;
      const t1 = done / total;
      const yc = belowBase[p.s] - DYN_ASCENT * 0.3 + p.lane * HAIRPIN_LANE_GAP;
      drawHairpin(vf, ctx, noteAt(h.from) as Note, h.kind, p, yc, t0, t1, { from: key(h.from), to: key(h.to), part: parts.length === 1 ? 'whole' : i === 0 ? 'first' : i === parts.length - 1 ? 'last' : 'middle' });
      hairpinRects[p.s].push({ x0: p.x0, x1: p.x1 });
      growDown(p.s, yc + HAIRPIN_HEIGHT);
    });
  }

  // --- words and written tempo changes ---------------------------------------------------
  type Word = { at: EventRef; text: string; place: 'above' | 'below'; lang: string; tempoChange?: boolean };
  const words: Word[] = [];
  for (const w of x?.words ?? []) {
    if (!noteAt(w.at)) continue;
    words.push({ at: w.at, text: w.text, place: w.place ?? 'above', lang: w.lang ?? (ITALIAN.test(w.text.trim()) ? 'it' : 'en') });
  }
  for (const c of x?.tempoChanges ?? []) {
    const at = c.kind === 'a-tempo' ? c.at : c.from;
    if (!noteAt(at)) continue;
    const text = c.kind === 'a-tempo' ? 'a tempo' : `${c.kind}.`;
    // A word already written at the same event says the same thing.
    const same = words.some((w) => key(w.at) === key(at) && (c.kind === 'a-tempo' ? w.text.trim().toLowerCase() === 'a tempo' : wordKind(w.text) === c.kind));
    if (!same) words.push({ at, text, place: 'above', lang: 'it', tempoChange: true });
  }
  words.sort((p, q) => (flatIndex.get(key(p.at)) ?? 0) - (flatIndex.get(key(q.at)) ?? 0));
  const aboveRight = systems.map(() => -Infinity);
  const belowRects = systems.map(() => [] as Rect[]);
  for (const w of words) {
    const s = sysOf(w.at);
    const el = new vf.Element('Annotation');
    el.setFont('Academico', WORDS_FONT_PT, 'normal', 'italic');
    el.setText(w.text);
    const width = el.getWidth();
    let y: number;
    let px = left(w.at);
    if (w.place === 'above') {
      px = Math.max(px, aboveRight[s] + DYN_GAP);
      aboveRight[s] = px + width;
      y = aboveBase[s];
      growUp(s, y - WORDS_FONT_PT * 1.1);
    } else {
      let lane = 0;
      const rect = { x0: px, x1: px + width };
      const busy = [...dynRects.values(), ...hairpinRects[s], ...belowRects[s]].some((r) => overlaps(rect, r, 2));
      // Same system only: dynamics of other systems never collide.
      if (busy) lane = 1;
      y = belowBase[s] + (WORDS_BELOW_OFFSET - DYN_BASELINE_OFFSET) + lane * HAIRPIN_LANE_GAP;
      belowRects[s].push(rect);
      growDown(s, y + 5);
    }
    reachRight = Math.max(reachRight, px + width);
    const g = openGroup(ctx, 'mtn-words', { 'data-bar': String(w.at.bar), 'data-event': String(w.at.event), ...(w.tempoChange ? { 'data-tempo-change': 'true' } : {}) });
    el.renderText(ctx, px, y);
    g.lastElementChild?.setAttribute('lang', w.lang);
    closeGroup(ctx);
  }

  // The tempo and navigation signs are stave modifiers; account for the room they take above.
  systems.forEach((s, si) => {
    const top = staveOf(si).getYForLine(0);
    if (si === 0 && x?.tempo && (x.tempo.text || x.tempo.bpm !== undefined)) growUp(si, top - TEMPO_BASELINE_ABOVE - 19);
    for (const b of s.bars) {
      const m = passage.bars[b].marker;
      if (m) growUp(si, top - (m === 'segno' ? 12 + 34 : 22 + 12));
    }
  });
  return { up, down, right: reachRight };
}

function drawHairpin(
  vf: VF,
  ctx: Ctx,
  anchor: Note,
  kind: 'cresc' | 'dim',
  seg: { x0: number; x1: number },
  yc: number,
  t0: number,
  t1: number,
  ids: { from: string; to: string; part: 'whole' | 'first' | 'middle' | 'last' },
): void {
  openGroup(ctx, 'mtn-hairpin', { 'data-kind': kind, 'data-from': ids.from, 'data-to': ids.to, 'data-part': ids.part });
  ctx.save();
  ctx.setLineWidth(1.3);
  const open = HAIRPIN_HEIGHT;
  if (ids.part === 'whole') {
    const hp = new vf.StaveHairpin({ firstNote: anchor, lastNote: anchor }, kind === 'cresc' ? vf.StaveHairpin.type.CRESC : vf.StaveHairpin.type.DECRESC);
    hp.setContext(ctx);
    hp.setRenderOptions({ height: open, yShift: 0, leftShiftPx: 0, rightShiftPx: 0 });
    // renderHairpin puts the wedge 20 units below the y it is given.
    const firstY = yc - open / 2 - 20;
    hp.renderHairpin({ firstX: seg.x0, lastX: seg.x1, firstY, lastY: firstY, staffHeight: 0 });
  } else {
    // One piece of a hairpin split by a system break: its two ends have different openings.
    const [h0, h1] = kind === 'cresc' ? [open * t0, open * t1] : [open * (1 - t0), open * (1 - t1)];
    ctx.beginPath();
    ctx.moveTo(seg.x0, yc - h0 / 2);
    ctx.lineTo(seg.x1, yc - h1 / 2);
    ctx.moveTo(seg.x0, yc + h0 / 2);
    ctx.lineTo(seg.x1, yc + h1 / 2);
    ctx.stroke();
    ctx.closePath();
  }
  ctx.restore();
  closeGroup(ctx);
}
