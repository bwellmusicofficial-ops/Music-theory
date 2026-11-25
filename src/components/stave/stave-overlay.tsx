'use client';

import { useImperativeHandle, useRef, type Ref } from 'react';
import { BADGE_GAP, BADGE_SIZE, POSITION_UNITS } from './constants';
import type { Armed, Caret, LayoutModel, Selection, StaveMark } from './types';

export interface GhostSpec {
  x: number;
  y: number;
  position: number;
  hollow: boolean;
  /** Left and right of the bar, for the guide band. */
  guideX1: number;
  guideX2: number;
  /** Position is a space (5 unit band) or a line. */
  sign?: string;
  shake?: boolean;
  /**
   * Key-signature edit: no notehead, the sign itself is the ghost, drawn as a Bravura glyph
   * with its baseline on the position's line, centred on `x`.
   */
  glyph?: string;
}

export interface OverlayHandle {
  setGhost(spec: GhostSpec | null): void;
  /** Briefly shakes the ghost, if one is visible (rejected edit). */
  shake(): void;
}

/** One offered gap between events (docs/question-types-2.md 1.3), in units. */
export interface GapMarker {
  key: string;
  x: number;
  top: number;
  bottom: number;
  on: boolean;
  /** Hovered or focused: off gaps show a faint guide only then. */
  active: boolean;
  /** An on gap is already shown by the notation (a beam): draw it only while hovered or focused. */
  quiet?: boolean;
}

export interface StaveOverlayProps {
  uid: string;
  gaps?: GapMarker[];
  model: LayoutModel;
  marks?: Record<string, StaveMark>;
  cursor?: { bar: number; event: number } | null;
  selection?: Selection | null;
  caret?: Caret | null;
  /** Bars that may not be edited (edit mode with restrictions). */
  lockedBars?: ReadonlySet<number>;
  editableBars?: ReadonlySet<number>;
  outline?: { bar: number; event: number } | null;
  armed?: Armed | null;
  handleRef?: Ref<OverlayHandle>;
}

const HEAD_RX = 6;
const HEAD_RY = 4.6;

export function StaveOverlay(p: StaveOverlayProps) {
  const { model, uid } = p;
  const ghostRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGEllipseElement>(null);
  const bandRef = useRef<SVGRectElement>(null);
  const ledgerRef = useRef<SVGGElement>(null);
  const signRef = useRef<SVGTextElement>(null);

  useImperativeHandle(
    p.handleRef,
    () => ({
      shake() {
        const g = ghostRef.current;
        if (!g || g.getAttribute('visibility') !== 'visible') return;
        g.classList.remove('mtn-ghost--shake');
        // Restart the animation.
        void g.getBoundingClientRect();
        g.classList.add('mtn-ghost--shake');
      },
      setGhost(spec) {
        const g = ghostRef.current;
        if (!g) return;
        if (!spec) {
          g.setAttribute('visibility', 'hidden');
          g.classList.remove('mtn-ghost--shake');
          return;
        }
        g.setAttribute('visibility', 'visible');
        g.classList.toggle('mtn-ghost--shake', spec.shake === true);
        const head = headRef.current;
        if (head) {
          head.setAttribute('cx', String(spec.x));
          head.setAttribute('cy', String(spec.y));
          head.setAttribute('fill', spec.hollow ? 'none' : 'var(--stave-accent)');
          head.setAttribute('stroke', 'var(--stave-accent)');
          head.setAttribute('visibility', spec.glyph ? 'hidden' : 'visible');
        }
        const band = bandRef.current;
        if (band) {
          const isLine = spec.position % 2 === 0;
          const h = isLine ? 1.5 : POSITION_UNITS * 2;
          band.setAttribute('x', String(spec.guideX1));
          band.setAttribute('width', String(Math.max(0, spec.guideX2 - spec.guideX1)));
          band.setAttribute('y', String(spec.y - h / 2));
          band.setAttribute('height', String(h));
        }
        const ledger = ledgerRef.current;
        if (ledger) {
          ledger.replaceChildren();
          // Ledger lines for positions outside the stave, drawn from the stave edge to the ghost.
          const bottom = spec.y + spec.position * POSITION_UNITS; // y of position 0
          const lines: number[] = [];
          const lowest = spec.position % 2 === 0 ? spec.position : spec.position + 1;
          for (let q = -2; q >= lowest; q -= 2) lines.push(q);
          for (let q = 10; q <= spec.position; q += 2) lines.push(q);
          for (const q of lines) {
            const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const yy = bottom - q * POSITION_UNITS;
            ln.setAttribute('x1', String(spec.x - 9));
            ln.setAttribute('x2', String(spec.x + 9));
            ln.setAttribute('y1', String(yy));
            ln.setAttribute('y2', String(yy));
            ln.setAttribute('stroke', 'var(--stave-accent)');
            ln.setAttribute('stroke-width', '1.5');
            ledger.appendChild(ln);
          }
        }
        const sign = signRef.current;
        if (sign) {
          if (spec.glyph) {
            // Key signature: a real glyph, centred on x, baseline on the line (as VexFlow draws it).
            sign.textContent = spec.glyph;
            sign.setAttribute('x', String(spec.x));
            sign.setAttribute('y', String(spec.y));
            sign.setAttribute('text-anchor', 'middle');
            sign.setAttribute('font-family', 'Bravura');
            sign.setAttribute('font-size', '30pt');
          } else {
            sign.textContent = spec.sign ?? '';
            sign.setAttribute('x', String(spec.x - 16));
            sign.setAttribute('y', String(spec.y + 4));
            sign.removeAttribute('text-anchor');
            sign.removeAttribute('font-family');
            sign.setAttribute('font-size', '14');
          }
        }
      },
    }),
    [],
  );

  const sysOfBar = (bar: number) => model.systems[model.bars.find((b) => b.bar === bar)?.system ?? 0];
  const barOf = (bar: number) => model.bars.find((b) => b.bar === bar);
  const eventOf = (bar: number, event: number) => barOf(bar)?.events[event];

  const out: React.ReactNode[] = [];

  // Locks and editable underline.
  model.bars.forEach((b) => {
    const sys = model.systems[b.system];
    if (p.lockedBars?.has(b.bar)) {
      out.push(
        <rect key={`lock-${b.bar}`} data-testid="lock-hatch" x={b.x} y={sys.bottomLineY - 40 - 4} width={b.width} height={48} fill={`url(#${uid}-hatch)`} opacity={0.06} />,
      );
    } else if (p.editableBars?.has(b.bar)) {
      out.push(
        <rect key={`ed-${b.bar}`} data-testid="editable-underline" x={b.noteStartX} y={sys.bottomLineY + 6} width={Math.max(0, b.x + b.width - b.noteStartX)} height={1} fill="var(--stave-accent)" />,
      );
    }
  });

  // Playback cursor column.
  if (p.cursor) {
    const ev = eventOf(p.cursor.bar, p.cursor.event);
    if (ev) {
      const sys = sysOfBar(p.cursor.bar);
      out.push(
        <rect key="cursor" data-testid="cursor-column" x={ev.colLeft} y={sys.bottomLineY - 40} width={ev.colRight - ev.colLeft} height={40} fill="var(--stave-accent)" opacity={0.2} />,
        // A pointer under the column, so "now" is a shape as well as a tint.
        <path key="cursor-pointer" data-testid="cursor-pointer" d={`M${ev.centreX - 5} ${sys.bottomLineY + 9}L${ev.centreX} ${sys.bottomLineY + 2}L${ev.centreX + 5} ${sys.bottomLineY + 9}Z`} fill="var(--stave-accent)" />,
      );
    }
  }

  // Marks.
  for (const [key, mark] of Object.entries(p.marks ?? {})) {
    if (key.includes(':')) {
      const [b, e] = key.split(':').map(Number);
      const ev = eventOf(b, e);
      if (!ev) continue;
      const sys = sysOfBar(b);
      if (mark === 'highlight') {
        out.push(
          <rect key={`m-${key}`} data-testid="mark-highlight" x={ev.box.x - 3} y={ev.box.y - 3} width={ev.box.w + 6} height={ev.box.h + 6} rx={4} fill="none" stroke="var(--stave-accent)" strokeWidth={2} />,
        );
        continue;
      }
      if (mark === 'lit') {
        // Lit: a filled, outlined box in the accent colour round the note (shape as well as colour).
        out.push(
          <rect key={`m-${key}`} data-testid="mark-lit" x={ev.box.x - 3} y={ev.box.y - 3} width={ev.box.w + 6} height={ev.box.h + 6} rx={4} fill="var(--stave-accent)" fillOpacity={0.18} stroke="var(--stave-accent)" strokeWidth={2} />,
        );
        continue;
      }
      let cy = ev.box.y - BADGE_GAP - BADGE_SIZE / 2;
      if (cy - BADGE_SIZE / 2 < sys.top) cy = ev.box.y + ev.box.h + BADGE_GAP + BADGE_SIZE / 2;
      out.push(<Badge key={`m-${key}`} mark={mark} cx={ev.centreX} cy={cy} />);
    } else {
      const bar = Number(key);
      const b = barOf(bar);
      if (!b) continue;
      const sys = model.systems[b.system];
      const x1 = b.noteStartX;
      const x2 = b.x + b.width - 4;
      const y = sys.bottomLineY - 40 - 10;
      if (mark === 'highlight' || mark === 'lit') {
        out.push(
          <rect key={`m-${key}`} data-testid="mark-highlight" x={x1 - 2} y={sys.bottomLineY - 40 - 6} width={x2 - x1 + 4} height={52} rx={4} fill="none" stroke="var(--stave-accent)" strokeWidth={2} />,
        );
        continue;
      }
      const color = markColor(mark);
      out.push(
        <path key={`mb-${key}`} data-testid={`bracket-${mark}`} d={`M${x1} ${y + 4}V${y}H${x2}V${y + 4}`} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={mark === 'wrong' ? '4 3' : mark === 'near' ? '1.5 3' : undefined} />,
        <Badge key={`m-${key}`} mark={mark} cx={(x1 + x2) / 2} cy={y - BADGE_SIZE / 2 - 1} />,
      );
    }
  }

  // Outline for hover or focus in read + tap.
  if (p.outline) {
    const ev = eventOf(p.outline.bar, p.outline.event);
    if (ev) {
      out.push(
        <rect key="outline" data-testid="event-outline" x={ev.box.x - 3} y={ev.box.y - 3} width={ev.box.w + 6} height={ev.box.h + 6} rx={4} fill="none" stroke="var(--stave-accent)" strokeWidth={1.5} />,
      );
    }
  }

  // Gap toggles (read mode): an "on" gap is a solid accent line with a diamond cap that reaches past the
  // stave lines, so it is a shape and not only a colour; hover or focus shows a faint dashed guide.
  for (const g of p.gaps ?? []) {
    if (g.on && g.quiet) {
      // Quiet join: the beam is the marker. Hover or focus adds a thin solid line (off gaps get a dashed one).
      if (g.active) {
        out.push(
          <line key={`gap-${g.key}`} data-testid="gap-guide" data-on="true" x1={g.x} x2={g.x} y1={g.top} y2={g.bottom} stroke="var(--stave-accent)" strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />,
        );
      }
    } else if (g.on) {
      out.push(
        <g key={`gap-${g.key}`} data-testid="gap-marker" data-on="true" className="mtn-gap-marker">
          <line x1={g.x} x2={g.x} y1={g.top} y2={g.bottom} stroke="var(--stave-accent)" strokeWidth={2.5} strokeLinecap="round" />
          <path d={`M${g.x} ${g.top - 5}L${g.x + 4} ${g.top - 1}L${g.x} ${g.top + 3}L${g.x - 4} ${g.top - 1}Z`} fill="var(--stave-accent)" />
        </g>,
      );
    } else if (g.active) {
      out.push(
        <line key={`gap-${g.key}`} data-testid="gap-guide" x1={g.x} x2={g.x} y1={g.top} y2={g.bottom} stroke="var(--stave-accent)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.7} />,
      );
    }
  }

  // Selection ring on the selected head (or around a rest).
  if (p.selection) {
    const ev = eventOf(p.selection.bar, p.selection.event);
    if (ev) {
      const head = ev.heads.find((h) => h.pitchIndex === p.selection!.pitchIndex);
      if (head) {
        out.push(<circle key="sel" data-testid="selection-ring" cx={head.x} cy={head.y} r={HEAD_RX + 3} fill="none" stroke="var(--stave-accent)" strokeWidth={1.5} />);
      } else {
        out.push(<rect key="sel" data-testid="selection-ring" x={ev.box.x - 2} y={ev.box.y - 2} width={ev.box.w + 4} height={ev.box.h + 4} rx={4} fill="none" stroke="var(--stave-accent)" strokeWidth={1.5} />);
      }
    }
  }

  // Caret.
  if (p.caret) {
    const b = barOf(p.caret.bar);
    if (b) {
      const sys = model.systems[b.system];
      const x = b.slotX[Math.min(p.caret.slot, b.slotX.length - 1)];
      out.push(
        <line key="caret" data-testid="caret" x1={x} x2={x} y1={sys.bottomLineY - 40 - 6} y2={sys.bottomLineY + 6} stroke="var(--stave-accent)" strokeWidth={1.5} strokeDasharray="3 2" />,
      );
    }
  }

  return (
    <svg
      id={`${uid}-overlay`}
      className="mtn-stave__overlay"
      aria-hidden="true"
      viewBox={`0 0 ${model.width} ${model.height}`}
      width={model.width * model.scale}
      height={model.height * model.scale}
    >
      <defs>
        <pattern id={`${uid}-hatch`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={2} height={6} fill="currentColor" />
        </pattern>
      </defs>
      {out}
      <g ref={ghostRef} className="mtn-ghost" visibility="hidden" opacity={0.6}>
        <rect ref={bandRef} fill="var(--stave-accent)" opacity={0.33} />
        <g ref={ledgerRef} />
        <ellipse ref={headRef} rx={HEAD_RX} ry={HEAD_RY} strokeWidth={1.5} />
        <text ref={signRef} fill="var(--stave-accent)" fontSize={14} />
      </g>
    </svg>
  );
}

function markColor(mark: StaveMark): string {
  return mark === 'correct' ? 'var(--stave-correct)' : mark === 'near' ? 'var(--stave-near)' : 'var(--stave-wrong)';
}

/** Three shapes, so colour is never the only signal: circle + tick, diamond + tilde, rounded square + cross. */
function Badge({ mark, cx, cy }: { mark: StaveMark; cx: number; cy: number }) {
  const r = BADGE_SIZE / 2;
  const color = markColor(mark);
  const ink = { fill: 'none', stroke: 'var(--stave-badge-ink)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <g className="mtn-badge" data-testid={`badge-${mark}`}>
      {mark === 'correct' ? (
        <circle cx={cx} cy={cy} r={r} fill={color} />
      ) : mark === 'near' ? (
        <rect x={cx - r * 0.72} y={cy - r * 0.72} width={BADGE_SIZE * 0.72} height={BADGE_SIZE * 0.72} rx={1.5} fill={color} transform={`rotate(45 ${cx} ${cy})`} />
      ) : (
        <rect x={cx - r} y={cy - r} width={BADGE_SIZE} height={BADGE_SIZE} rx={2.5} fill={color} />
      )}
      {mark === 'correct' ? (
        <path d={`M${cx - 3} ${cy}L${cx - 0.8} ${cy + 2.4}L${cx + 3.2} ${cy - 2.6}`} {...ink} />
      ) : mark === 'near' ? (
        <path d={`M${cx - 3.4} ${cy + 0.6}C${cx - 2} ${cy - 2.2} ${cx - 0.8} ${cy - 2.2} ${cx} ${cy + 0.1}S${cx + 2} ${cy + 2.4} ${cx + 3.4} ${cy - 0.6}`} {...ink} />
      ) : (
        <path d={`M${cx - 2.8} ${cy - 2.8}L${cx + 2.8} ${cy + 2.8}M${cx + 2.8} ${cy - 2.8}L${cx - 2.8} ${cy + 2.8}`} {...ink} />
      )}
    </g>
  );
}
