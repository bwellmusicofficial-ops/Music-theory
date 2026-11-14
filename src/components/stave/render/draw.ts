/**
 * The only file that uses VexFlow classes. Draws a passage into a host element
 * and returns a plain-data LayoutModel (docs/stave-interaction.md 1.3 and 1.4).
 */
import type { Bar, Duration, NoteValue, Passage, ScoreEvent } from '@/engine/types';
import { LINE_GAP, POSITION_UNITS, SYSTEM_GAP } from '../constants';
import { signsForBar } from '../edit/accidentals';
import { tiePairs } from '../edit/ties';
import { finishBarColumns } from '../layout/hit-test';
import { notesWidth, planSystems, reservedFor, systemBox, type BarMeasure } from '../layout/plan';
import { stemDirections } from '../notation/stems';
import { accidentalType, beamIndexGroups, durationCode, keySpec, restKey, timeSpec, vexKey } from '../notation/to-vexflow';
import { tupletChunks } from '../notation/tuplets';
import type { BarLayout, Engines, EventLayout, LayoutModel, SystemLayout } from '../types';
import type { VexFlowModule } from '../vexflow-loader';

export interface DrawInput {
  vf: VexFlowModule;
  host: HTMLElement;
  engines: Engines;
  passage: Passage;
  uid: string;
  scale: number;
  availablePx: number;
  edit: boolean;
  /** Per bar: editable bars are wider (1.7). */
  editableBars: boolean[];
  range: { min: number; max: number };
  /** Read mode: an explicit `range` prop reserves room for those positions (Note Rush alignment). */
  readRange?: { lowest: number; highest: number } | null;
  show: { clef: boolean; keySignature: boolean; timeSignature: boolean; finalBarline: boolean };
}

export interface EventElements {
  group: Element | null;
  stem: Element | null;
}

export interface DrawOutput {
  model: LayoutModel;
  elements: Map<string, EventElements>;
  svg: SVGSVGElement | null;
}

const MARGIN = 1;
const GHOST_VALUES: NoteValue[] = ['breve', 'semibreve', 'minim', 'crotchet', 'quaver', 'semiquaver', 'demisemiquaver'];

export const eventKey = (bar: number, event: number) => `${bar}:${event}`;

function ghostDurations(e: Engines, bar: Bar, time: Passage['time']): Duration[] {
  const check = e.rhythm.checkBarLength(bar, time);
  if (check.status !== 'short') return [];
  try {
    return e.rhythm.restsToFill(e.rhythm.eventsLength(bar.events), check.difference, time);
  } catch {
    const out: Duration[] = [];
    let left = check.difference;
    for (let guard = 0; guard < 64 && left.n > 0; guard++) {
      const next = GHOST_VALUES.find((v) =>
        e.rhythm.compareFractions(e.rhythm.durationLength({ value: v, dots: 0 }), left) <= 0,
      );
      if (!next) break;
      const d: Duration = { value: next, dots: 0 };
      out.push(d);
      const len = e.rhythm.durationLength(d);
      left = e.rhythm.addFractions(left, { n: -len.n, d: len.d });
    }
    return out;
  }
}

interface BarBuild {
  notes: unknown[];
  voice: { draw(ctx: unknown, stave: unknown): void };
  formatter: { preCalculateMinTotalWidth(v: unknown[]): number; format(v: unknown[], w: number): unknown };
  beams: { setContext(c: unknown): { draw(): void } }[];
  tuplets: { setContext(c: unknown): { draw(): void } }[];
  voices: unknown[];
  count: number;
}

function buildBar(input: DrawInput, barIndex: number): BarBuild {
  const { vf, engines: e, passage } = input;
  const bar = passage.bars[barIndex];
  const tieInLast = barIndex > 0 ? passage.bars[barIndex - 1].events.at(-1) : undefined;
  const signs = signsForBar(e, bar, passage.key, tieInLast && tieInLast.kind === 'note' && tieInLast.tieToNext ? tieInLast : undefined);
  const groups = beamIndexGroups(e, bar, passage.time);
  const stems = stemDirections(e, bar, groups, passage.clef);

  const notes = bar.events.map((ev: ScoreEvent, i) => {
    const isRest = ev.kind === 'rest';
    const struct = isRest
      ? { keys: [restKey(e, ev.duration.value, passage.clef)], duration: durationCode(ev.duration.value, true), dots: ev.duration.dots, clef: passage.clef }
      : {
          keys: ev.pitches
            .map((p, j) => ({ p, j, pos: e.pitch.stavePosition(p, passage.clef) }))
            .sort((a, b) => a.pos - b.pos)
            .map((x) => vexKey(x.p)),
          duration: durationCode(ev.duration.value, false),
          dots: ev.duration.dots,
          clef: passage.clef,
          stemDirection: stems[i],
        };
    const note = new vf.StaveNote(struct);
    if (ev.kind === 'note') {
      const order = ev.pitches
        .map((p, j) => ({ j, pos: e.pitch.stavePosition(p, passage.clef) }))
        .sort((a, b) => a.pos - b.pos);
      order.forEach((o, k) => {
        const sign = signs[i]?.[o.j];
        if (sign !== null && sign !== undefined) note.addModifier(new vf.Accidental(accidentalType(sign)), k);
      });
    }
    for (let d = 0; d < ev.duration.dots; d++) vf.Dot.buildAndAttach([note], { all: true });
    note.setAttribute('id', `${input.uid}-${barIndex}-${i}`);
    return note;
  });

  const tuplets = tupletChunks(bar).map(
    (c) =>
      new vf.Tuplet(notes.slice(c.start, c.start + c.count), { numNotes: c.actual, notesOccupied: c.normal }),
  );

  const ghosts = ghostDurations(e, bar, passage.time).map(
    (d) => new vf.GhostNote({ duration: durationCode(d.value, false), dots: d.dots }),
  );
  const tickables = [...notes, ...ghosts];
  const voice = new vf.Voice({ numBeats: passage.time.beats, beatValue: passage.time.beatUnit }).setMode(vf.VoiceMode.SOFT);
  voice.addTickables(tickables as never[]);
  const formatter = new vf.Formatter().joinVoices([voice]);
  const beams = groups.map((g) => new vf.Beam(g.map((i) => notes[i]), false));
  return {
    notes,
    voice: voice as never,
    formatter: formatter as never,
    beams: beams as never,
    tuplets: tuplets as never,
    voices: [voice],
    count: notes.length,
  };
}

function addModifiers(input: DrawInput, stave: InstanceType<VexFlowModule['Stave']>, first: boolean, barIndex: number) {
  const { passage, engines, show } = input;
  if (first && show.clef) stave.addClef(passage.clef);
  if (first && show.keySignature) stave.addKeySignature(keySpec(engines, passage.key));
  if (barIndex === 0 && show.timeSignature) stave.addTimeSignature(timeSpec(passage.time));
}

function headRange(input: DrawInput, barIdx: number[]): { lowest: number; highest: number } | null {
  let lowest = Infinity;
  let highest = -Infinity;
  for (const b of barIdx) {
    for (const ev of input.passage.bars[b].events) {
      if (ev.kind !== 'note') continue;
      for (const p of ev.pitches) {
        const pos = input.engines.pitch.stavePosition(p, input.passage.clef);
        lowest = Math.min(lowest, pos);
        highest = Math.max(highest, pos);
      }
    }
  }
  return lowest === Infinity ? null : { lowest, highest };
}

function withReadRange(
  input: DrawInput,
  heads: { lowest: number; highest: number } | null,
): { lowest: number; highest: number } | null {
  if (input.edit || !input.readRange) return heads;
  if (!heads) return input.readRange;
  return { lowest: Math.min(heads.lowest, input.readRange.lowest), highest: Math.max(heads.highest, input.readRange.highest) };
}

export function draw(input: DrawInput): DrawOutput {
  const { vf, passage } = input;
  const nBars = passage.bars.length;

  // --- stage 1: measure ----------------------------------------------------
  const measures: BarMeasure[] = [];
  for (let i = 0; i < nBars; i++) {
    const build = buildBar(input, i);
    const minTotal = build.count > 0 ? build.formatter.preCalculateMinTotalWidth(build.voices) : 0;
    const sFirst = new vf.Stave(0, 0, 500);
    addModifiers(input, sFirst, true, i);
    const sOther = new vf.Stave(0, 0, 500);
    addModifiers(input, sOther, false, i);
    measures.push({
      notes: notesWidth(minTotal, passage.bars[i].events.length, input.scale, input.editableBars[i]),
      modFirst: sFirst.getNoteStartX() - sFirst.getX(),
      modOther: sOther.getNoteStartX() - sOther.getX(),
    });
  }

  const plan = planSystems(measures, input.editableBars, { availablePx: input.availablePx - MARGIN * 2 * input.scale, scale: input.scale });
  const scale = plan.scale;

  // --- stage 2: draw (at most two passes: the second only when boxes overflow) ---
  const extras: { up: number; down: number }[] = plan.systems.map(() => ({ up: 0, down: 0 }));
  let result: DrawOutput | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const out = drawPass(input, plan, scale, extras);
    result = out.output;
    let overflow = false;
    out.overflows.forEach((o, s) => {
      if (o.up > 0 || o.down > 0) {
        overflow = true;
        extras[s] = { up: extras[s].up + o.up, down: extras[s].down + o.down };
      }
    });
    if (!overflow) break;
  }
  return result as DrawOutput;
}

function drawPass(
  input: DrawInput,
  plan: ReturnType<typeof planSystems>,
  scale: number,
  extras: { up: number; down: number }[],
): { output: DrawOutput; overflows: { up: number; down: number }[] } {
  const { vf, host, passage, engines: e } = input;
  host.replaceChildren();
  const renderer = new vf.Renderer(host as HTMLDivElement, vf.Renderer.Backends.SVG);
  const ctx = renderer.getContext();

  // Vertical plan.
  const boxes = plan.systems.map((s, si) => {
    const r = reservedFor(input.edit, input.range, withReadRange(input, headRange(input, s.bars)));
    return systemBox(r.min - extras[si].down, r.max + extras[si].up);
  });
  const emptyReserved = reservedFor(input.edit, input.range, withReadRange(input, null));
  const emptyBox = systemBox(emptyReserved.min, emptyReserved.max);
  const systems: SystemLayout[] = [];
  let y = 0;
  const useBoxes = plan.systems.length ? boxes : [emptyBox];
  useBoxes.forEach((b, si) => {
    systems.push({ index: si, top: y, height: b.height, bottomLineY: y + b.bottomLineY, bars: plan.systems[si]?.bars ?? [] });
    y += b.height + SYSTEM_GAP;
  });
  const height = Math.max(1, y - SYSTEM_GAP);
  let width = 1;

  const barLayouts: BarLayout[] = [];
  const elements = new Map<string, EventElements>();
  const staveNotes = new Map<string, unknown>();
  const barSystem = new Map<number, number>();
  const overflows = useBoxes.map(() => ({ up: 0, down: 0 }));
  let headWidth = 11;

  if (plan.systems.length === 0) {
    const stave = new vf.Stave(MARGIN, systems[0].top + useBoxes[0].topLineY - 4 * LINE_GAP, 120);
    if (input.show.clef) stave.addClef(passage.clef);
    if (input.show.keySignature) stave.addKeySignature(keySpec(e, passage.key));
    if (input.show.timeSignature) stave.addTimeSignature(timeSpec(passage.time));
    stave.setEndBarType(vf.BarlineType.NONE);
    stave.setContext(ctx).draw();
    width = stave.getNoteStartX() + 10;
  }

  plan.systems.forEach((sys, si) => {
    let x = MARGIN;
    const box = useBoxes[si];
    const systemTop = systems[si].top;
    sys.bars.forEach((barIndex, k) => {
      const first = k === 0;
      const w = sys.widths[k];
      const stave = new vf.Stave(x, systemTop + box.topLineY - 4 * LINE_GAP, w);
      stave.setDefaultLedgerLineStyle({ strokeStyle: 'currentColor', lineWidth: 1.5 });
      addModifiers(input, stave, first, barIndex);
      if (barIndex === passage.bars.length - 1 && input.show.finalBarline) stave.setEndBarType(vf.BarlineType.END);
      stave.setContext(ctx).draw();
      barSystem.set(barIndex, si);

      const bar = passage.bars[barIndex];
      const evLayouts: EventLayout[] = [];
      if (bar.events.length > 0) {
        const build = buildBar(input, barIndex);
        const editable = input.editableBars[barIndex];
        const avail = Math.max(20, stave.getNoteEndX() - stave.getNoteStartX() - (editable ? 30 : 0) - 10);
        build.formatter.format(build.voices, avail);
        build.voice.draw(ctx, stave);
        build.beams.forEach((b) => b.setContext(ctx).draw());
        build.tuplets.forEach((t) => t.setContext(ctx).draw());
        build.notes.forEach((raw, ei) => {
          const note = raw as InstanceType<VexFlowModule['StaveNote']>;
          staveNotes.set(eventKey(barIndex, ei), note);
          const ev = bar.events[ei];
          const bb = note.getBoundingBox();
          const centreX = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
          const ys = note.getYs();
          const order = ev.kind === 'note'
            ? ev.pitches.map((p, j) => ({ j, pos: e.pitch.stavePosition(p, passage.clef) })).sort((a, b) => a.pos - b.pos)
            : [];
          const heads = order.map((o, k) => {
            const nh = note.noteHeads[k];
            const hw = nh?.getWidth?.() ?? 11;
            if (k === 0 && hw > 0) headWidth = hw;
            return {
              pitchIndex: o.j,
              position: o.pos,
              x: nh ? nh.getAbsoluteX() + hw / 2 : centreX,
              y: ys[k] ?? 0,
            };
          });
          evLayouts.push({
            bar: barIndex,
            event: ei,
            isRest: ev.kind === 'rest',
            centreX,
            box: { x: bb.x, y: bb.y, w: bb.w, h: bb.h },
            heads,
            colLeft: 0,
            colRight: 0,
          });
          if (bb.y < systemTop) overflows[si].up = Math.max(overflows[si].up, Math.ceil((systemTop - bb.y) / POSITION_UNITS));
          if (bb.y + bb.h > systemTop + box.height) {
            overflows[si].down = Math.max(overflows[si].down, Math.ceil((bb.y + bb.h - systemTop - box.height) / POSITION_UNITS));
          }
        });
      }
      const layout = finishBarColumns(
        {
          bar: barIndex,
          system: si,
          x,
          width: w,
          noteStartX: stave.getNoteStartX(),
          noteEndX: stave.getNoteEndX(),
          events: evLayouts,
        },
        headWidth,
        scale,
        first ? stave.getNoteStartX() : x,
      );
      barLayouts.push(layout);
      x += w;
    });
    width = Math.max(width, x + MARGIN);
  });

  // Ties after every bar of every system exists.
  for (const pair of tiePairs(passage.bars)) {
    const src = staveNotes.get(eventKey(pair.from.bar, pair.from.event)) as never;
    if (!src) continue;
    const tie = (n: object) => new vf.StaveTie(n).setContext(ctx).draw();
    if (!pair.to) {
      tie({ firstNote: src, lastNote: null, firstIndexes: pair.fromIndexes, lastIndexes: pair.fromIndexes });
      continue;
    }
    const dst = staveNotes.get(eventKey(pair.to.bar, pair.to.event)) as never;
    if (!dst) continue;
    if (barSystem.get(pair.from.bar) === barSystem.get(pair.to.bar)) {
      tie({ firstNote: src, lastNote: dst, firstIndexes: pair.fromIndexes, lastIndexes: pair.toIndexes });
    } else {
      tie({ firstNote: src, lastNote: null, firstIndexes: pair.fromIndexes, lastIndexes: pair.fromIndexes });
      tie({ firstNote: null, lastNote: dst, firstIndexes: pair.toIndexes, lastIndexes: pair.toIndexes });
    }
  }

  renderer.resize(width * scale, height * scale);
  (ctx as unknown as { setViewBox(x: number, y: number, w: number, h: number): void }).setViewBox(0, 0, width, height);
  const svg = (ctx as unknown as { svg?: SVGSVGElement }).svg ?? host.querySelector('svg');
  svg?.setAttribute('id', `${input.uid}-notation-svg`);

  staveNotes.forEach((raw, key) => {
    const note = raw as InstanceType<VexFlowModule['StaveNote']>;
    const group = host.querySelector(`[id="vf-${input.uid}-${key.replace(':', '-')}"]`);
    let stem: Element | null = null;
    try {
      stem = note.getStem()?.getSVGElement() ?? null;
    } catch {
      stem = null;
    }
    elements.set(key, { group, stem });
  });

  const model: LayoutModel = { width, height, scale, clef: passage.clef, systems, bars: barLayouts, headWidth };
  return {
    output: { model, elements, svg: svg ?? null },
    overflows,
  };
}

