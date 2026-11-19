'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { GAP_MIN_PX, GAP_TARGET_PX } from './constants';
import type { LayoutModel, StaveGapRef } from './types';

export const gapKey = (at: StaveGapRef) => `${at.bar}:${at.event}`;

export interface GapPlace {
  at: StaveGapRef;
  /** Centre x of the gap, in units. */
  x: number;
  /** Marker extent, in units: just past the stave lines. */
  top: number;
  bottom: number;
  /** System box, in units, for the button. */
  systemTop: number;
  systemHeight: number;
  system: number;
  /** Button width in CSS px: GAP_TARGET_PX where the gap allows, never under GAP_MIN_PX. */
  widthPx: number;
}

/**
 * Where each offered gap sits. A gap is centred halfway between the `centreX` of the event before it and the
 * event after it (the first event of the next bar when it is the last of its bar). Where there is no next event
 * on the same line (the end of a line, or of the passage) it sits halfway to the right edge of the bar.
 * Offered gaps that name no event are left out. Pure: reads the layout model only.
 */
export function gapPlaces(model: LayoutModel, offered: readonly StaveGapRef[]): GapPlace[] {
  const places: Omit<GapPlace, 'widthPx'>[] = [];
  for (const at of offered) {
    const bar = model.bars.find((b) => b.bar === at.bar);
    const ev = bar?.events[at.event];
    if (!bar || !ev) continue;
    const next = bar.events[at.event + 1] ?? model.bars.find((b) => b.bar === at.bar + 1 && b.system === bar.system)?.events[0];
    const x = next ? (ev.centreX + next.centreX) / 2 : (ev.centreX + (bar.x + bar.width)) / 2;
    const sys = model.systems[bar.system];
    places.push({
      at,
      x,
      top: sys.bottomLineY - 40 - 6,
      bottom: sys.bottomLineY + 6,
      systemTop: sys.top,
      systemHeight: sys.height,
      system: bar.system,
    });
  }
  return places.map((p, i) => {
    let nearest = Infinity;
    places.forEach((q, j) => {
      if (j !== i && q.system === p.system) nearest = Math.min(nearest, Math.abs(q.x - p.x) * model.scale);
    });
    return { ...p, widthPx: Math.max(GAP_MIN_PX, Math.min(GAP_TARGET_PX, nearest)) };
  });
}

export interface StaveGapButtonsProps {
  model: LayoutModel;
  offered: StaveGapRef[];
  on: ReadonlySet<string>;
  /** Spoken name per offered gap, same order as `offered`. */
  labels: string[];
  onToggle: (at: StaveGapRef) => void;
  /** The gap hovered or focused, for the guide line in the overlay. */
  onActive: (key: string | null) => void;
  ariaLabel: string;
}

/**
 * Read mode with `gaps`: one transparent toggle button per offered gap, centred between two events,
 * full stave height. Roving tabindex (one Tab stop), Left/Right/Home/End between gaps, Space or Enter
 * toggles (native button). `aria-pressed` carries on/off; the marker is drawn by the overlay.
 */
export function StaveGapButtons({ model, offered, on, labels, onToggle, onActive, ariaLabel }: StaveGapButtonsProps) {
  const labelOf = new Map(offered.map((o, i) => [gapKey(o), labels[i]]));
  const places = gapPlaces(model, offered);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.min(active, Math.max(0, places.length - 1));

  const focusAt = (i: number) => {
    const c = Math.max(0, Math.min(places.length - 1, i));
    setActive(c);
    refs.current[c]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(places.length - 1);
    }
  };

  return (
    <div role="group" aria-label={ariaLabel} className="mtn-stave__buttons" data-testid="stave-gaps">
      {places.map((p, i) => {
        const key = gapKey(p.at);
        const pressed = on.has(key);
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className="mtn-stave__gap-button"
            data-testid={`gap-${key}`}
            tabIndex={i === current ? 0 : -1}
            aria-label={labelOf.get(key)}
            aria-pressed={pressed}
            style={{
              left: p.x * model.scale - p.widthPx / 2,
              top: p.systemTop * model.scale,
              width: p.widthPx,
              height: p.systemHeight * model.scale,
            }}
            onClick={() => onToggle(p.at)}
            onKeyDown={(e) => onKey(e, i)}
            onFocus={() => {
              setActive(i);
              onActive(key);
            }}
            onBlur={() => onActive(null)}
            onPointerEnter={() => onActive(key)}
            onPointerLeave={() => onActive(null)}
          />
        );
      })}
    </div>
  );
}
