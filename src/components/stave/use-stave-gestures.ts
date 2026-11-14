'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Passage, Pitch } from '@/engine/types';
import { announceRejected } from './a11y/describe';
import { signKeyMap } from './edit/accidentals';
import type { EditConstraints } from './edit/actions';
import { isBarEditable, isEventLocked, isTupletEvent } from './edit/constraints';
import {
  HOVER_TARGET_HYSTERESIS,
  LOUPE_MIN_ABOVE_PX,
  LOUPE_OFFSET_PX,
  LOUPE_SIZE_PX,
  SLOP_MOUSE_PX,
  SLOP_TOUCH_PX,
} from './constants';
import { clientToUnits, locate, nearestHead, positionAtY, snapPosition, yAtPosition, type Target } from './layout/hit-test';
import { setLifted } from './render/decorate';
import type { EventElements } from './render/draw';
import type { OverlayHandle } from './stave-overlay';
import type { StaveSound } from './stave-sound';
import type { Engines, LayoutModel } from './types';
import type { Editor } from './use-stave-editor';

interface Gesture {
  kind: 'placing' | 'placing-head' | 'pending-head' | 'moving' | 'pending-tap';
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  rect: DOMRect;
  bar: number;
  slot: number;
  event: number;
  pitchIndex: number;
  nearest: number | null;
  original: number;
  position: number | null;
  moved: boolean;
  cancelled: boolean;
  clampSaid: boolean;
  liftedKey: string | null;
  downPosition: number;
}

export interface GestureDeps {
  enabled: boolean;
  engines: Engines;
  editor: Editor;
  constraints: EditConstraints;
  getPassage: () => Passage;
  modelRef: RefObject<LayoutModel | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  elementsRef: RefObject<Map<string, EventElements> | null>;
  overlayRef: RefObject<OverlayHandle | null>;
  loupeRef: RefObject<SVGSVGElement | null>;
  setLoupe: (v: { gx: number; gy: number } | null) => void;
  reducedMotion: boolean;
  sound: StaveSound;
}

export function useStaveGestures(deps: GestureDeps) {
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });
  const gestureRef = useRef<Gesture | null>(null);
  const hoverRef = useRef<{ key: string; anchorX: number } | null>(null);
  const loupePos = useRef<{ x: number; y: number } | null>(null);

  /** Pitch of the ghost: key signature and armed sign, ignoring earlier accidentals in the bar. */
  const ghostPitch = (position: number, passage: Passage): Pitch => {
    const d = depsRef.current;
    const base = d.engines.pitch.pitchAtStavePosition(position, passage.clef);
    const sig = signKeyMap(d.engines, passage.key);
    const armed = d.editor.uiRef.current.armed.sign;
    return { ...base, accidental: armed ?? sig.get(base.letter) ?? 0 };
  };

  const placeLoupe = useCallback(() => {
    const d = depsRef.current;
    const el = d.loupeRef.current;
    const pos = loupePos.current;
    if (!el || !pos) return;
    const above = pos.y >= LOUPE_MIN_ABOVE_PX;
    const cy = above ? pos.y - LOUPE_OFFSET_PX : pos.y + LOUPE_OFFSET_PX;
    const half = LOUPE_SIZE_PX / 2;
    const cx = Math.min(Math.max(pos.x, half), Math.max(half, window.innerWidth - half));
    el.style.left = `${cx - half}px`;
    el.style.top = `${cy - half}px`;
  }, []);

  const hideVisuals = useCallback(() => {
    const d = depsRef.current;
    d.overlayRef.current?.setGhost(null);
    d.setLoupe(null);
    loupePos.current = null;
    const g = gestureRef.current;
    if (g?.liftedKey && d.elementsRef.current) setLifted(d.elementsRef.current, g.liftedKey, false);
  }, []);

  const abort = useCallback((): boolean => {
    const g = gestureRef.current;
    if (!g) return false;
    const liftedKey = g.liftedKey;
    gestureRef.current = null;
    const d = depsRef.current;
    d.overlayRef.current?.setGhost(null);
    d.setLoupe(null);
    loupePos.current = null;
    if (liftedKey && d.elementsRef.current) setLifted(d.elementsRef.current, liftedKey, false);
    return true;
  }, []);

  useEffect(() => {
    const onBlur = () => abort();
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [abort]);

  /** Show the ghost for a placing or moving gesture. */
  const showGhost = (g: Gesture, position: number) => {
    const d = depsRef.current;
    const model = d.modelRef.current;
    if (!model) return;
    const b = model.bars.find((x) => x.bar === g.bar);
    if (!b) return;
    const system = model.systems[b.system];
    let x: number;
    if (g.kind === 'placing') x = b.slotX[Math.min(g.slot, b.slotX.length - 1)];
    else x = b.events[g.event]?.heads.find((h) => h.pitchIndex === g.pitchIndex)?.x ?? b.events[g.event]?.centreX ?? b.noteStartX;
    if (g.kind === 'placing-head') x = b.events[g.event]?.centreX ?? x;
    const armed = d.editor.uiRef.current.armed;
    const hollow = g.kind === 'moving' ? false : ['breve', 'semibreve', 'minim'].includes(armed.value);
    d.overlayRef.current?.setGhost({
      x,
      y: yAtPosition(position, system),
      position,
      hollow,
      guideX1: b.noteStartX,
      guideX2: b.x + b.width,
      sign: g.kind !== 'moving' && armed.sign !== null ? ({ [-2]: '\u{1D12B}', [-1]: '♭', 0: '♮', 1: '♯', 2: '\u{1D12A}' } as Record<number, string>)[armed.sign] : undefined,
    });
    if (g.pointerType === 'touch' && g.moved) {
      d.setLoupe({ gx: x, gy: yAtPosition(position, system) });
    }
  };

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = depsRef.current;
      if (!d.enabled) return;
      if (gestureRef.current) return; // a second pointer during a gesture is ignored
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const canvas = d.canvasRef.current;
      const model = d.modelRef.current;
      if (!canvas || !model) return;
      const rect = canvas.getBoundingClientRect();
      const pt = clientToUnits(e.clientX, e.clientY, rect, model);
      const target: Target = locate(pt, model);
      const passage = d.getPassage();
      const c = d.constraints;

      const locked =
        target.kind === 'none' ||
        !isBarEditable(c, target.bar) ||
        (target.kind === 'event' &&
          (isEventLocked(c, passage, target.bar, target.event) || isTupletEvent(passage, target.bar, target.event)));
      if (locked) {
        d.editor.clearSelection();
        return;
      }
      const t = target as Exclude<Target, { kind: 'none' }>;
      const barLayout = model.bars.find((b) => b.bar === t.bar);
      if (!barLayout) return;
      const system = model.systems[barLayout.system];
      const range = c.range;
      const raw = positionAtY(pt.y, system);
      const position = snapPosition(raw, null, range);

      const base: Gesture = {
        kind: 'pending-tap',
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        rect,
        bar: t.bar,
        slot: 0,
        event: 0,
        pitchIndex: 0,
        nearest: null,
        original: position,
        position,
        moved: false,
        cancelled: false,
        clampSaid: false,
        liftedKey: null,
        downPosition: position,
      };

      if (c.kind === 'single-note') {
        base.kind = 'placing';
        base.slot = 0;
      } else if (t.kind === 'slot') {
        base.kind = 'placing';
        base.slot = t.slot;
      } else {
        const ev = passage.bars[t.bar].events[t.event];
        base.event = t.event;
        const evLayout = barLayout.events[t.event];
        base.nearest = evLayout ? nearestHead(evLayout, pt.y) : null;
        if (base.nearest === null && evLayout?.heads.length) {
          base.nearest = evLayout.heads.reduce((best, h) => (Math.abs(h.y - pt.y) < Math.abs(best.y - pt.y) ? h : best)).pitchIndex;
        }
        const armed = d.editor.uiRef.current.armed;
        if (armed.chord && ev.kind === 'note' && t.pitchIndex === null) {
          base.kind = 'placing-head';
        } else if (t.pitchIndex !== null) {
          base.kind = 'pending-head';
          base.pitchIndex = t.pitchIndex;
          base.original = evLayout?.heads.find((h) => h.pitchIndex === t.pitchIndex)?.position ?? position;
          base.position = base.original;
        } else {
          base.pitchIndex = base.nearest ?? 0;
        }
      }
      gestureRef.current = base;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* jsdom or an already-released pointer */
      }
      if (base.kind === 'placing' || base.kind === 'placing-head') {
        showGhost(base, position);
      }
      hoverRef.current = null;
    },
    [],
  );

  const hover = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = depsRef.current;
    const canvas = d.canvasRef.current;
    const model = d.modelRef.current;
    if (!canvas || !model || e.buttons !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const pt = clientToUnits(e.clientX, e.clientY, rect, model);
    const target = locate(pt, model);
    const c = d.constraints;
    const passage = d.getPassage();
    const armed = d.editor.uiRef.current.armed;
    if (target.kind === 'none') {
      hoverRef.current = null;
      d.overlayRef.current?.setGhost(null);
      return;
    }
    const ok =
      isBarEditable(c, target.bar) &&
      (c.kind === 'single-note' ||
        target.kind === 'slot' ||
        (target.kind === 'event' &&
          armed.chord &&
          target.pitchIndex === null &&
          passage.bars[target.bar].events[target.event]?.kind === 'note' &&
          !isEventLocked(c, passage, target.bar, target.event)));
    if (!ok) {
      hoverRef.current = null;
      d.overlayRef.current?.setGhost(null);
      return;
    }
    const key = c.kind === 'single-note' ? `b${target.bar}` : target.kind === 'slot' ? `s${target.bar}:${target.slot}` : `e${target.bar}:${target.event}`;
    const prev = hoverRef.current;
    if (prev && prev.key !== key && Math.abs(pt.x - prev.anchorX) < HOVER_TARGET_HYSTERESIS) {
      // Stay on the previous target until the pointer is clearly past the boundary.
    } else if (!prev || prev.key !== key) {
      hoverRef.current = { key, anchorX: pt.x };
    }
    const use = hoverRef.current!.key;
    const barLayout = model.bars.find((b) => b.bar === target.bar)!;
    const system = model.systems[barLayout.system];
    const position = snapPosition(positionAtY(pt.y, system), null, c.range);
    let x: number;
    if (use.startsWith('s')) x = barLayout.slotX[Math.min(Number(use.split(':')[1]), barLayout.slotX.length - 1)];
    else if (use.startsWith('e')) x = barLayout.events[Number(use.split(':')[1])]?.centreX ?? pt.x;
    else x = barLayout.slotX[0];
    d.overlayRef.current?.setGhost({
      x,
      y: yAtPosition(position, system),
      position,
      hollow: ['breve', 'semibreve', 'minim'].includes(armed.value),
      guideX1: barLayout.noteStartX,
      guideX2: barLayout.x + barLayout.width,
    });
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = depsRef.current;
      if (!d.enabled) return;
      const g = gestureRef.current;
      const canvas = d.canvasRef.current;
      const model = d.modelRef.current;
      if (!canvas || !model) return;
      if (!g) {
        if (e.pointerType !== 'touch') hover(e);
        return;
      }
      if (e.pointerId !== g.pointerId) return;
      const slop = g.pointerType === 'touch' ? SLOP_TOUCH_PX : SLOP_MOUSE_PX;
      const travel = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
      if (travel > slop) g.moved = true;
      if (g.pointerType === 'touch') loupePos.current = { x: e.clientX, y: e.clientY };

      if (g.kind === 'pending-tap') {
        if (g.moved) g.cancelled = true;
        return;
      }
      if (g.kind === 'pending-head') {
        if (!g.moved) return;
        g.kind = 'moving';
        g.liftedKey = `${g.bar}:${g.event}`;
        if (d.elementsRef.current) setLifted(d.elementsRef.current, g.liftedKey, true);
      }
      const bar = model.bars.find((b) => b.bar === g.bar);
      if (!bar) return;
      const system = model.systems[bar.system];
      const pt = clientToUnits(e.clientX, e.clientY, g.rect, model);
      const raw = positionAtY(pt.y, system);
      const range = d.constraints.range;
      const next = snapPosition(raw, g.position, range);
      if (!g.clampSaid && (raw > range.max + 0.5 || raw < range.min - 0.5)) {
        g.clampSaid = true;
        d.editor.announce(announceRejected('out-of-range', raw > range.max ? 'high' : 'low'));
      }
      const changed = next !== g.position;
      g.position = next;
      if (changed || g.moved) {
        showGhost(g, next);
        if (g.pointerType === 'touch') placeLoupe();
      }
      if (changed) {
        // At most once per 80 ms, handled by the sound player.
        d.sound.play([ghostPitch(next, d.getPassage())], { throttle: true });
      }
    },
    [hover, placeLoupe],
  );

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = depsRef.current;
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
      const model = d.modelRef.current;
      hideVisuals();
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {
        /* nothing captured */
      }
      if (!model) return;
      const pos = g.position ?? g.downPosition;
      switch (g.kind) {
        case 'placing':
          d.editor.placeAt(g.bar, g.slot, pos);
          return;
        case 'placing-head':
          d.editor.addHeadAt(g.bar, g.event, pos);
          return;
        case 'moving': {
          if (pos === g.original) return;
          const res = d.editor.commitMove(g.bar, g.event, g.pitchIndex, pos);
          if (!res.ok && res.reason === 'position-occupied' && !d.reducedMotion) {
            // Shake the ghost at the rejected position, then let the note return.
            showGhost({ ...g, kind: 'moving', moved: false }, pos);
            d.overlayRef.current?.setGhost(null);
          }
          return;
        }
        case 'pending-head':
          d.editor.tapEvent(g.bar, g.event, g.pitchIndex, g.nearest, g.downPosition);
          return;
        case 'pending-tap':
          if (!g.cancelled) d.editor.tapEvent(g.bar, g.event, null, g.nearest, g.downPosition);
          return;
      }
    },
    [hideVisuals],
  );

  const onPointerCancel = useCallback(() => {
    abort();
  }, [abort]);

  const onLostPointerCapture = useCallback(() => {
    // Fires after pointerup too; by then the gesture is already null.
    abort();
  }, [abort]);

  const onPointerLeave = useCallback(() => {
    hoverRef.current = null;
    if (!gestureRef.current) depsRef.current.overlayRef.current?.setGhost(null);
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel,
      onLostPointerCapture,
      onPointerLeave,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    abort,
    placeLoupe,
  };
}
