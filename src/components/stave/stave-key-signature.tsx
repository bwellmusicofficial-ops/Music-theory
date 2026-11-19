'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { pitch } from '@/engine/pitch';
import { rhythm } from '@/engine/rhythm';
import {
  announceGhostAt,
  announceSignPlaced,
  describeKeySignatureStave,
  KEY_SIGNATURE_FULL,
  KEY_SIGNATURE_HELP,
  KEY_SIGNATURE_LABELS,
} from './a11y/key-signature-text';
import { MESSAGES, SURFACE_ROLE_DESCRIPTION } from './a11y/strings';
import {
  FLAT_GLYPH,
  LOUPE_MIN_ABOVE_PX,
  LOUPE_OFFSET_PX,
  LOUPE_SIZE_PX,
  SCALES,
  SHARP_GLYPH,
  SLOP_MOUSE_PX,
  SLOP_TOUCH_PX,
} from './constants';
import { setStaveLayout } from './layout-registry';
import { clientToUnits, positionAtY, snapPosition, yAtPosition } from './layout/hit-test';
import { drawKeySignatureStave, KEY_SIGNATURE_RANGE, MAX_KEY_SIGNS, type KeySignatureDrawOutput } from './render/draw-key-signature';
import './stave.css';
import { StaveLoupe } from './stave-loupe';
import { StaveOverlay, type OverlayHandle } from './stave-overlay';
import type { Engines, KeySignatureSign, StaveProps } from './types';
import { fontsReady, loadVexFlow, type VexFlowModule } from './vexflow-loader';

const engines: Engines = { pitch, rhythm };
const EMPTY: KeySignatureSign[] = [];
/** Where the keyboard ghost starts: the middle line (it must not hint at a standard position). */
const START_POSITION = 4;

const TOOLS = [
  { id: 'up', label: KEY_SIGNATURE_LABELS.up, glyph: '↑' },
  { id: 'down', label: KEY_SIGNATURE_LABELS.down, glyph: '↓' },
  { id: 'place', label: KEY_SIGNATURE_LABELS.place, glyph: '+' },
] as const;

interface Gesture {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  rect: DOMRect;
  position: number;
  moved: boolean;
}

/**
 * Stave for `edit.kind: 'key-signature'` (docs/question-types-2.md 1.4, docs/stave-interaction.md 15).
 * A clef, an empty key-signature area wide enough for seven signs, and `keySignatureSigns` drawn in it.
 * A tap, a press-and-drag release (with the loupe, on touch) or Enter reports the stave position, -1 to 9,
 * through `onKeySignatureTap`. The parent owns the signs; this component never changes them.
 */
export function StaveKeySignature(props: StaveProps) {
  const { passage, ariaLabel, onKeySignatureTap } = props;
  const signs = props.keySignatureSigns ?? EMPTY;
  const kind = props.keySignatureArmed ?? 1;
  const terminology = props.terminology ?? 'uk';
  const clef = passage.clef;
  const scale = SCALES[props.size ?? 'lg'];
  const rawId = useId();
  const uid = `mtn${rawId.replace(/[^A-Za-z0-9_-]/g, '')}`;

  const canvasRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<OverlayHandle>(null);
  const loupeRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const hoverRef = useRef(false);
  const loupePos = useRef<{ x: number; y: number } | null>(null);

  const [vf, setVf] = useState<VexFlowModule | null>(null);
  const [fontTick, setFontTick] = useState(0);
  const [drawn, setDrawn] = useState<KeySignatureDrawOutput | null>(null);
  const [loupe, setLoupe] = useState<{ gx: number; gy: number } | null>(null);
  const [live, setLive] = useState('');
  const [kbPos, setKbPos] = useState(START_POSITION);
  const [kbGhost, setKbGhost] = useState(false);

  // Always-current values for event handlers.
  const latest = useRef({ signs, kind, onKeySignatureTap, clef, terminology, drawn });
  useLayoutEffect(() => {
    latest.current = { signs, kind, onKeySignatureTap, clef, terminology, drawn };
  });

  const announce = useCallback((text: string) => {
    setLive((prev) => (prev.replace(/​/g, '') === text ? text + '​' : text));
  }, []);

  // --- loading VexFlow (client only) --------------------------------------------------
  useEffect(() => {
    let alive = true;
    const wasReady = fontsReady();
    void loadVexFlow().then((m) => {
      if (alive) setVf(m);
    });
    const onLoaded = () => {
      if (!wasReady) setFontTick((t) => t + 1);
    };
    document.fonts?.addEventListener?.('loadingdone', onLoaded);
    return () => {
      alive = false;
      document.fonts?.removeEventListener?.('loadingdone', onLoaded);
    };
  }, []);

  // --- draw -----------------------------------------------------------------------------
  const signsKey = JSON.stringify(signs);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!vf || !host) return;
    const out = drawKeySignatureStave({ vf, host, clef, signs, uid, scale });
    if (canvasRef.current) setStaveLayout(canvasRef.current, out.model);
    setDrawn(out);
    // `signs` is tracked through signsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vf, signsKey, clef, scale, fontTick, uid]);

  const model = drawn?.model;
  const system = model?.systems[0];

  // --- ghost ------------------------------------------------------------------------------
  const showGhost = useCallback(
    (position: number): { x: number; y: number } | null => {
      const { drawn: d, signs: s, kind: k } = latest.current;
      if (!d || !d.model.systems[0]) return null;
      const slots = k === 1 ? d.slots.sharp : d.slots.flat;
      const x = slots[Math.min(s.length, slots.length - 1, MAX_KEY_SIGNS - 1)] ?? d.model.bars[0].noteStartX + 15;
      const y = yAtPosition(position, d.model.systems[0]);
      const bar = d.model.bars[0];
      overlayRef.current?.setGhost({
        x,
        y,
        position,
        hollow: false,
        guideX1: bar.x,
        guideX2: bar.x + bar.width,
        glyph: k === 1 ? SHARP_GLYPH : FLAT_GLYPH,
      });
      return { x, y };
    },
    [],
  );
  const hideGhost = useCallback(() => overlayRef.current?.setGhost(null), []);

  // The keyboard ghost follows the keyboard position, the signs and the armed sign; pointer hover takes over while it lasts.
  useLayoutEffect(() => {
    if (!model || hoverRef.current || gestureRef.current) return;
    if (kbGhost) showGhost(kbPos);
    else hideGhost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, kbGhost, kbPos, signsKey, kind]);

  const placeLoupe = useCallback(() => {
    const el = loupeRef.current;
    const pos = loupePos.current;
    if (!el || !pos) return;
    const above = pos.y >= LOUPE_MIN_ABOVE_PX;
    const cy = above ? pos.y - LOUPE_OFFSET_PX : pos.y + LOUPE_OFFSET_PX;
    const half = LOUPE_SIZE_PX / 2;
    const cx = Math.min(Math.max(pos.x, half), Math.max(half, window.innerWidth - half));
    el.style.left = `${cx - half}px`;
    el.style.top = `${cy - half}px`;
  }, []);
  useLayoutEffect(() => {
    if (loupe) placeLoupe();
  }, [loupe, placeLoupe]);

  const endGesture = useCallback(() => {
    gestureRef.current = null;
    setLoupe(null);
    loupePos.current = null;
  }, []);

  /** Report a position to the parent. At seven signs the area is full. */
  const place = useCallback(
    (position: number) => {
      const { signs: s, kind: k, onKeySignatureTap: cb, clef: c, terminology: t } = latest.current;
      if (s.length >= MAX_KEY_SIGNS) {
        announce(KEY_SIGNATURE_FULL);
        return;
      }
      cb?.(position);
      announce(announceSignPlaced(engines, c, k, position, t));
    },
    [announce],
  );

  // --- pointer ----------------------------------------------------------------------------
  const positionFor = (e: { clientX: number; clientY: number }, rect: DOMRect, previous: number | null): number | null => {
    const d = latest.current.drawn;
    if (!d) return null;
    const pt = clientToUnits(e.clientX, e.clientY, rect, d.model);
    return snapPosition(positionAtY(pt.y, d.model.systems[0]), previous, KEY_SIGNATURE_RANGE);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (gestureRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas || !latest.current.drawn) return;
    const rect = canvas.getBoundingClientRect();
    const position = positionFor(e, rect, null);
    if (position === null) return;
    gestureRef.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      rect,
      position,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom or a released pointer */
    }
    showGhost(position);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    const d = latest.current.drawn;
    if (!d) return;
    if (!g) {
      // Mouse hover: a ghost where a click would place the sign.
      if (e.pointerType === 'touch' || e.buttons !== 0 || !canvasRef.current) return;
      const position = positionFor(e, canvasRef.current.getBoundingClientRect(), null);
      if (position === null) return;
      hoverRef.current = true;
      showGhost(position);
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    const slop = g.pointerType === 'touch' ? SLOP_TOUCH_PX : SLOP_MOUSE_PX;
    if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > slop) g.moved = true;
    if (g.pointerType === 'touch') loupePos.current = { x: e.clientX, y: e.clientY };
    const next = positionFor(e, g.rect, g.position);
    if (next === null) return;
    g.position = next;
    const at = showGhost(next);
    if (g.pointerType === 'touch' && g.moved && at) {
      setLoupe({ gx: at.x, gy: at.y });
      placeLoupe();
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const position = g.position;
    endGesture();
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* nothing captured */
    }
    hoverRef.current = false;
    hideGhost();
    setKbGhost(false);
    place(position);
  };

  const onPointerCancel = () => {
    endGesture();
    hideGhost();
  };
  const onPointerLeave = () => {
    hoverRef.current = false;
    if (!gestureRef.current) {
      if (kbGhost) showGhost(kbPos);
      else hideGhost();
    }
  };

  // --- keyboard and buttons ---------------------------------------------------------------
  const moveGhost = (delta: number) => {
    const next = Math.min(KEY_SIGNATURE_RANGE.max, Math.max(KEY_SIGNATURE_RANGE.min, kbPos + delta));
    setKbGhost(true);
    if (next === kbPos) {
      announce(delta > 0 ? MESSAGES.tooHigh : MESSAGES.tooLow);
      return;
    }
    setKbPos(next);
    announce(announceGhostAt(engines, clef, next, terminology));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveGhost(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveGhost(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setKbGhost(true);
      place(kbPos);
    }
  };

  const description = useMemo(
    () => describeKeySignatureStave(engines, clef, signs, terminology),
    // signs via signsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clef, signsKey, terminology],
  );
  const placeholderHeight = 148 * scale;

  // Toolbar: roving tabindex over three buttons (Up, Down, Place).
  const toolRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [toolActive, setToolActive] = useState(0);
  const onToolKey = (e: KeyboardEvent<HTMLElement>) => {
    const n = 3;
    let next = -1;
    if (e.key === 'ArrowRight') next = (toolActive + 1) % n;
    else if (e.key === 'ArrowLeft') next = (toolActive + n - 1) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    setToolActive(next);
    toolRefs.current[next]?.focus();
  };
  const runTool = (id: (typeof TOOLS)[number]['id']) => {
    if (id === 'up') moveGhost(1);
    else if (id === 'down') moveGhost(-1);
    else {
      setKbGhost(true);
      place(kbPos);
    }
  };

  return (
    <div
      className="mtn-stave"
      dir="ltr"
      data-stave-kind="key-signature"
      aria-busy={!model}
      style={model ? undefined : { minHeight: placeholderHeight }}
    >
      <p id={`${uid}-desc`} className="mtn-stave__sr">
        {description}
      </p>
      <p id={`${uid}-keys`} className="mtn-stave__sr">
        {KEY_SIGNATURE_HELP}
      </p>
      <div className="mtn-stave__scroll">
        <div
          ref={canvasRef}
          className="mtn-stave__canvas"
          style={model ? { width: model.width * model.scale, height: model.height * model.scale } : { height: placeholderHeight }}
        >
          <div ref={hostRef} className="mtn-stave__notation" aria-hidden="true" />
          {model ? <StaveOverlay uid={uid} model={model} handleRef={overlayRef} /> : null}
          {model && system ? (
            <div
              className="mtn-stave__surface"
              role="application"
              aria-roledescription={SURFACE_ROLE_DESCRIPTION}
              aria-label={ariaLabel}
              aria-describedby={`${uid}-desc ${uid}-keys`}
              tabIndex={0}
              data-testid="stave-surface"
              onKeyDown={onKeyDown}
              onFocus={(e) => {
                if (e.currentTarget !== e.target) return;
                let visible = true;
                try {
                  visible = e.currentTarget.matches(':focus-visible');
                } catch {
                  /* a DOM without :focus-visible (jsdom) */
                }
                if (visible) setKbGhost(true);
              }}
              onBlur={() => setKbGhost(false)}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onLostPointerCapture={onPointerCancel}
              onPointerLeave={onPointerLeave}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div
                className="mtn-stave__zone"
                style={{ left: 0, width: model.width * model.scale, top: system.top * model.scale, height: system.height * model.scale }}
              />
            </div>
          ) : null}
        </div>
      </div>
      {loupe ? <StaveLoupe uid={uid} gx={loupe.gx} gy={loupe.gy} svgRef={loupeRef} /> : null}
      <div role="toolbar" aria-label={KEY_SIGNATURE_LABELS.toolbar} className="mtn-stave__palette" onKeyDown={onToolKey}>
        {TOOLS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              toolRefs.current[i] = el;
            }}
            type="button"
            className="mtn-stave__tool"
            data-group="step"
            data-testid={`ks-${t.id}`}
            aria-label={t.label}
            tabIndex={i === toolActive ? 0 : -1}
            onPointerDown={(e) => e.preventDefault()}
            onFocus={() => setToolActive(i)}
            onClick={() => runTool(t.id)}
          >
            <span aria-hidden="true" className="mtn-stave__glyph">
              {t.glyph}
            </span>
          </button>
        ))}
      </div>
      <div className="mtn-stave__sr" aria-live="polite" aria-atomic="true" data-testid="stave-live">
        {live}
      </div>
    </div>
  );
}
