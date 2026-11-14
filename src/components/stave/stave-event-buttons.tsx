'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { LayoutModel } from './types';

export interface StaveEventButtonsProps {
  model: LayoutModel;
  labels: string[][];
  onTap: (bar: number, event: number) => void;
  onOutline: (at: { bar: number; event: number } | null) => void;
  ariaLabel: string;
}

const MIN_PX = 24;

/** Read + tap: one transparent button per event, roving tabindex (5.3). */
export function StaveEventButtons({ model, labels, onTap, onOutline, ariaLabel }: StaveEventButtonsProps) {
  const flat = model.bars.flatMap((b) => b.events.map((e) => ({ bar: b.bar, event: e.event })));
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusAt = (i: number) => {
    const c = Math.max(0, Math.min(flat.length - 1, i));
    setActive(c);
    refs.current[c]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(flat.length - 1);
    }
  };

  let index = -1;
  return (
    <div role="group" aria-label={ariaLabel} className="mtn-stave__buttons">
      {model.bars.map((b) => {
        const sys = model.systems[b.system];
        return b.events.map((ev) => {
          index++;
          const i = index;
          const widthPx = Math.max(MIN_PX, (ev.colRight - ev.colLeft) * model.scale);
          const leftPx = ((ev.colLeft + ev.colRight) / 2) * model.scale - widthPx / 2;
          return (
            <button
              key={`${b.bar}:${ev.event}`}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              className="mtn-stave__event-button"
              tabIndex={i === active ? 0 : -1}
              aria-label={labels[b.bar]?.[ev.event]}
              style={{ left: leftPx, top: sys.top * model.scale, width: widthPx, height: sys.height * model.scale }}
              onClick={() => onTap(b.bar, ev.event)}
              onKeyDown={(e) => onKey(e, i)}
              onFocus={() => {
                setActive(i);
                onOutline({ bar: b.bar, event: ev.event });
              }}
              onBlur={() => onOutline(null)}
              onPointerEnter={() => onOutline({ bar: b.bar, event: ev.event })}
              onPointerLeave={() => onOutline(null)}
            />
          );
        });
      })}
    </div>
  );
}
