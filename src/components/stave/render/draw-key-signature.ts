/**
 * Draws the key-signature edit stave (docs/question-types-2.md 1.4): a clef, an empty key-signature area wide
 * enough for seven signs, and the learner's signs at VexFlow's own key-signature spacing. No notes.
 * Part of the VexFlow wrapper, with draw.ts. Returns a plain LayoutModel (one system, one empty bar) and the
 * x of every sign slot so the ghost can sit where the next sign would be drawn.
 */
import { LINE_GAP } from '../constants';
import { reservedFor, systemBox } from '../layout/plan';
import type { Clef } from '@/engine/types';
import type { BarLayout, KeySignatureSign, LayoutModel } from '../types';
import type { VexFlowModule } from '../vexflow-loader';

/** Positions the learner may place a sign at (one space below the stave to one space above). */
export const KEY_SIGNATURE_RANGE = { min: -1, max: 9 } as const;
export const MAX_KEY_SIGNS = 7;

const MARGIN = 1;
/** Room after the last of seven signs, before the end of the stave. */
const TAIL = 14;

export interface KeySignatureDrawInput {
  vf: VexFlowModule;
  host: HTMLElement;
  clef: Clef;
  signs: readonly KeySignatureSign[];
  uid: string;
  scale: number;
}

export interface KeySignatureDrawOutput {
  model: LayoutModel;
  svg: SVGSVGElement | null;
  /** Left edge x (units) of the first sign and the advance to each next one, per kind of sign. */
  slots: { sharp: number[]; flat: number[] };
  /** Centre x of each drawn sign. */
  signCentres: number[];
}

type Glyph = { getXShift(): number; getWidth(): number };
type KeySigInternals = {
  width: number;
  children: Glyph[];
  formatted: boolean;
  getStave(): unknown;
  convertToGlyph(acc: { type: string; line: number }, next: unknown, stave: unknown): void;
  calculateDimensions(): void;
  format: () => void;
  getX(): number;
};

/** VexFlow key-signature line numbers count down from the top line (0) in half steps; position 8 is the top line. */
const lineOf = (position: number) => (8 - position) / 2;

/** A KeySignature that draws the given signs at the given positions, and reports `reserve` as its width. */
function customKeySignature(vf: VexFlowModule, signs: readonly KeySignatureSign[], reserve: number) {
  const ks = new vf.KeySignature('C');
  const self = ks as unknown as KeySigInternals;
  self.format = function format(this: KeySigInternals) {
    const stave = this.getStave();
    this.width = 0;
    this.children = [];
    for (const s of signs) {
      this.convertToGlyph({ type: s.sign === 1 ? '#' : 'b', line: lineOf(s.position) }, undefined, stave);
    }
    this.calculateDimensions();
    this.width = Math.max(this.width, reserve);
    this.formatted = true;
  };
  return ks;
}

/** x (absolute) of the left edge of sign `i` of a stave holding `count` standard signs of one kind. */
function probeSlots(vf: VexFlowModule, clef: Clef, spec: 'C#' | 'Cb') {
  const stave = new vf.Stave(0, 0, 400);
  stave.addClef(clef).addKeySignature(spec);
  stave.format();
  const ks = stave.getModifiers(vf.StaveModifierPosition.BEGIN, 'KeySignature')[0] as unknown as KeySigInternals;
  const xs = ks.children.map((c) => ks.getX() + c.getXShift());
  const widths = ks.children.map((c) => c.getWidth());
  return { xs, widths, total: ks.width, noteStartX: stave.getNoteStartX() };
}

export function drawKeySignatureStave(input: KeySignatureDrawInput): KeySignatureDrawOutput {
  const { vf, host, clef, signs, uid, scale } = input;
  host.replaceChildren();

  const sharp = probeSlots(vf, clef, 'C#');
  const flat = probeSlots(vf, clef, 'Cb');
  const reserve = Math.max(sharp.total, flat.total);

  const reserved = reservedFor(true, KEY_SIGNATURE_RANGE, null);
  const box = systemBox(reserved.min, reserved.max);
  const topLineY = box.topLineY;

  // VexFlow's stave top line is drawn 4 line gaps below the stave's y.
  const stave = new vf.Stave(MARGIN, topLineY - 4 * LINE_GAP, 10);
  stave.setDefaultLedgerLineStyle({ strokeStyle: 'currentColor', lineWidth: 1.5 });
  stave.addClef(clef);
  stave.addModifier(customKeySignature(vf, signs, reserve).setPosition(vf.StaveModifierPosition.BEGIN));
  stave.setEndBarType(vf.BarlineType.SINGLE);
  // Width: modifiers (clef and the seven-sign area), then a little room.
  stave.format();
  const noteStartX = stave.getNoteStartX();
  stave.setWidth(noteStartX - stave.getX() + TAIL);
  stave.setEndBarType(vf.BarlineType.SINGLE);

  const renderer = new vf.Renderer(host as HTMLDivElement, vf.Renderer.Backends.SVG);
  const ctx = renderer.getContext();
  stave.setContext(ctx).draw();

  const width = stave.getX() + stave.getWidth() + MARGIN;
  const height = box.height;
  renderer.resize(width * scale, height * scale);
  (ctx as unknown as { setViewBox(x: number, y: number, w: number, h: number): void }).setViewBox(0, 0, width, height);
  const svg = (ctx as unknown as { svg?: SVGSVGElement }).svg ?? host.querySelector('svg');
  svg?.setAttribute('id', `${uid}-notation-svg`);

  // Where each drawn sign sits, read back from VexFlow.
  const ks = stave.getModifiers(vf.StaveModifierPosition.BEGIN, 'KeySignature')[0] as unknown as KeySigInternals;
  const signCentres = ks.children.map((c) => ks.getX() + c.getXShift() + c.getWidth() / 2);

  const bar: BarLayout = {
    bar: 0,
    system: 0,
    x: stave.getX(),
    width: stave.getWidth(),
    noteStartX,
    noteEndX: stave.getNoteEndX(),
    events: [],
    slotX: [noteStartX + 15],
  };
  const model: LayoutModel = {
    width,
    height,
    scale,
    clef,
    systems: [{ index: 0, top: 0, height: box.height, bottomLineY: box.bottomLineY, bars: [0] }],
    bars: [bar],
    headWidth: 11,
  };
  const centres = (p: ReturnType<typeof probeSlots>) => p.xs.map((x, i) => x + p.widths[i] / 2);
  return { model, svg: svg ?? null, slots: { sharp: centres(sharp), flat: centres(flat) }, signCentres };
}

