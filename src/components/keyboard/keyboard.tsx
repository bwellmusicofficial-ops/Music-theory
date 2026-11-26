'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getAudioEngine } from '@/audio';
import type { Pitch } from '@/engine/types';
import { buildLayout, computerKeyMap, isBlackMidi, type KeyModel } from './keys';
import { pitch as pitchEngine } from '@/engine/pitch';

export interface KeyboardProps {
  low: Pitch;
  high: Pitch;
  showLabels?: boolean;
  highlight?: { pitch: Pitch; state: 'target' | 'correct' | 'wrong' }[];
  /** Reports the sounding key. Black keys are reported as sharps; callers respell if needed. */
  onNote?: (pitch: Pitch) => void;
  /** When false the component makes no sound itself. Default true. */
  sound?: boolean;
  disabled?: boolean;
}

type HighlightState = 'target' | 'correct' | 'wrong';

/**
 * The narrowest a white key is allowed to get before the keyboard stops shrinking and scrolls instead.
 * Keys grow to fill the width, so this only bites when the range is long or the screen is narrow.
 * 21px lets the widest range used in the lessons (two octaves, 15 white keys) fit a 360px phone
 * and anything wider. Piano keys are tall and narrow by design: they follow the instrument, so the
 * 44px minimum for buttons is not applied to them (a key is 176px or more tall, and sliding a finger
 * across keys works too). The scroll buttons are real buttons and are 44px.
 */
export const MIN_WHITE_KEY_PX = 21;
const MIDDLE_C = 60;
const SCROLL_EPSILON = 1;

const SCROLL_BUTTON_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-border bg-bg px-3 text-fg transition-colors hover:bg-bg-raised disabled:cursor-not-allowed disabled:opacity-40';

function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'true') return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

const STATE_COLOUR: Record<HighlightState, { solid: string; on: string; label: string }> = {
  target: { solid: 'var(--accent)', on: 'var(--on-accent)', label: 'target' },
  correct: { solid: 'var(--success)', on: 'var(--on-success)', label: 'correct' },
  wrong: { solid: 'var(--danger)', on: 'var(--on-danger)', label: 'wrong' },
};

function noop() {}

/** Runs an audio call without ever letting it break input handling. */
function safely(fn: () => unknown) {
  try {
    void Promise.resolve(fn()).catch(noop);
  } catch {
    // Audio is best effort; the keyboard still reports notes.
  }
}

function Marker({ state, black }: { state: HighlightState; black: boolean }) {
  const c = STATE_COLOUR[state];
  return (
    <span
      aria-hidden="true"
      data-marker={state}
      className="pointer-events-none absolute left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full"
      style={{
        background: c.solid,
        color: c.on,
        bottom: black ? '0.5rem' : '2rem',
        // A ring in the opposite key colour keeps the marker readable on a white and on a black key.
        boxShadow: `0 0 0 2px ${black ? 'var(--piano-white)' : 'var(--piano-black)'}`,
      }}
    >
      {state === 'target' && <span className="block h-2 w-2 rounded-full" style={{ background: 'currentColor' }} />}
      {state === 'correct' && (
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6.5 4.8 9 10 3" />
        </svg>
      )}
      {state === 'wrong' && (
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      )}
    </span>
  );
}

export function Keyboard({
  low,
  high,
  showLabels = false,
  highlight,
  onNote,
  sound = true,
  disabled = false,
}: KeyboardProps) {
  const layout = useMemo(() => buildLayout(low, high), [low, high]);
  const keyByMidi = useMemo(() => new Map(layout.keys.map((k) => [k.midi, k])), [layout]);
  const computerKeys = useMemo(() => computerKeyMap(layout.low, layout.high), [layout]);

  const highlightByMidi = useMemo(() => {
    const map = new Map<number, HighlightState>();
    for (const h of highlight ?? []) map.set(pitchEngine.toMidi(h.pitch), h.state);
    return map;
  }, [highlight]);

  const [pressed, setPressed] = useState<ReadonlySet<number>>(() => new Set());
  const [focusedMidi, setFocusedMidi] = useState<number | null>(null);
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });
  /** Width of the scrolling box in px; 0 until measured. */
  const [avail, setAvail] = useState(0);
  /** True once the learner has scrolled or used a scroll button, which retires the hint. */
  const [scrolled, setScrolled] = useState(false);

  const groupRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLButtonElement>(null);
  const higherRef = useRef<HTMLButtonElement>(null);
  const restingLeft = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const keyEls = useRef(new Map<number, HTMLButtonElement>());
  /** Holder id (a pointer or a computer key) to the midi it is holding down. */
  const holdersRef = useRef(new Map<string, number>());
  const audioStarted = useRef(false);

  const latest = useRef({ onNote, sound, disabled, keyByMidi });
  useEffect(() => {
    latest.current = { onNote, sound, disabled, keyByMidi };
  });

  const defaultMidi = Math.min(Math.max(MIDDLE_C, layout.low), layout.high);
  const activeMidi = focusedMidi !== null && keyByMidi.has(focusedMidi) ? focusedMidi : defaultMidi;

  const syncPressed = useCallback(() => {
    setPressed(new Set(holdersRef.current.values()));
  }, []);

  const press = useCallback(
    (holder: string, midi: number) => {
      const { onNote: report, sound: audible, disabled: off, keyByMidi: byMidi } = latest.current;
      const holders = holdersRef.current;
      if (off || holders.get(holder) === midi) return;
      const key = byMidi.get(midi);
      if (!key) return;
      const previous = holders.get(holder);
      if (previous !== undefined) {
        holders.delete(holder);
        const prevKey = byMidi.get(previous);
        if (audible !== false && prevKey && ![...holders.values()].includes(previous)) {
          safely(() => getAudioEngine().noteOff(prevKey.pitch));
        }
      }
      const alreadySounding = [...holders.values()].includes(midi);
      holders.set(holder, midi);
      if (audible !== false) {
        const engine = getAudioEngine();
        if (!audioStarted.current) {
          audioStarted.current = true;
          safely(() => engine.unlock());
          safely(() => engine.load());
        }
        if (!alreadySounding) safely(() => engine.noteOn(key.pitch));
      }
      syncPressed();
      report?.(key.pitch);
    },
    [syncPressed],
  );

  const release = useCallback(
    (holder: string) => {
      const holders = holdersRef.current;
      const midi = holders.get(holder);
      if (midi === undefined) return;
      holders.delete(holder);
      const { sound: audible, keyByMidi: byMidi } = latest.current;
      const key = byMidi.get(midi);
      if (audible !== false && key && ![...holders.values()].includes(midi)) {
        safely(() => getAudioEngine().noteOff(key.pitch));
      }
      syncPressed();
    },
    [syncPressed],
  );

  const releaseWhere = useCallback(
    (test: (holder: string) => boolean) => {
      for (const holder of [...holdersRef.current.keys()]) if (test(holder)) release(holder);
    },
    [release],
  );

  // Disabling mid-press stops every sounding note.
  useEffect(() => {
    if (disabled) releaseWhere(() => true);
  }, [disabled, releaseWhere]);

  // Pointer up/cancel can land anywhere on the page once a press started.
  useEffect(() => {
    const onEnd = (e: PointerEvent) => release(`p:${e.pointerId ?? 0}`);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    const holders = holdersRef.current;
    return () => {
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      // Unmounting must not leave notes hanging.
      if (latest.current.sound !== false) {
        for (const midi of new Set(holders.values())) {
          const key = latest.current.keyByMidi.get(midi);
          if (key) safely(() => getAudioEngine().noteOff(key.pitch));
        }
      }
      holders.clear();
    };
  }, [release]);

  // Fit to width: keys fill the box, but never get narrower than MIN_WHITE_KEY_PX; past that it scrolls.
  const naturalWidth = layout.units * MIN_WHITE_KEY_PX;
  const contentWidth = Math.max(avail, naturalWidth);
  const keyPx = avail > 0 ? contentWidth / layout.units : MIN_WHITE_KEY_PX;

  const updateScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    setAvail((a) => (a === width ? a : width));
    const max = width > 0 ? Math.max(width, layout.units * MIN_WHITE_KEY_PX) - width : 0;
    const left = el.scrollLeft;
    const next = { overflow: max > SCROLL_EPSILON, left: left > SCROLL_EPSILON, right: left < max - SCROLL_EPSILON };
    setScroll((s) => (s.overflow === next.overflow && s.left === next.left && s.right === next.right ? s : next));
    if (restingLeft.current !== null && Math.abs(left - restingLeft.current) > 4) setScrolled(true);
  }, [layout.units]);

  const scrollToX = useCallback((x: number, smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ left: x, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    } else {
      el.scrollLeft = x;
    }
  }, []);

  // Open scrolled to the most relevant keys: the highlighted ones, else the middle of the range.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const content = Math.max(width, layout.units * MIN_WHITE_KEY_PX);
    if (width > 0 && content > width) {
      let lo: number | null = null;
      let hi: number | null = null;
      for (const midi of highlightByMidi.keys()) {
        if (!keyByMidi.has(midi)) continue;
        if (lo === null || midi < lo) lo = midi;
        if (hi === null || midi > hi) hi = midi;
      }
      const centreOf = (midi: number) => {
        const k = keyByMidi.get(midi)!;
        return k.left + k.width / 2;
      };
      const centreUnits = lo !== null && hi !== null ? (centreOf(lo) + centreOf(hi)) / 2 : layout.units / 2;
      const x = Math.min(content - width, Math.max(0, (centreUnits / layout.units) * content - width / 2));
      scrollToX(x, false);
      restingLeft.current = x;
    } else {
      restingLeft.current = null;
    }
    updateScroll();
    // Only on mount or when the range changes; later highlight changes must not yank the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScroll]);

  // A scroll button that disables itself at the end of the range must not drop keyboard focus:
  // hand it to the other button, which is enabled by then.
  useEffect(() => {
    if (document.activeElement === lowerRef.current && !scroll.left) higherRef.current?.focus();
    else if (document.activeElement === higherRef.current && !scroll.right) lowerRef.current?.focus();
  }, [scroll.left, scroll.right]);

  const scrollByButton = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const max = Math.max(width, naturalWidth) - width;
    const step = Math.max(keyPx * 7, width * 0.7);
    const x = Math.min(max, Math.max(0, el.scrollLeft + direction * step));
    setScrolled(true);
    scrollToX(x, true);
  };

  const midiFromEvent = (e: ReactPointerEvent): number | null => {
    const hit = (typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY)
      : null) ?? (e.target as Element | null);
    const el = hit?.closest?.('[data-midi]') as HTMLElement | null | undefined;
    if (!el || !groupRef.current?.contains(el)) return null;
    return Number(el.dataset.midi);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = (e.target as Element).closest('[data-midi]') as HTMLElement | null;
    if (!el) return;
    try {
      // Touch pointers are captured implicitly; release so sliding reaches other keys.
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      // Not captured: nothing to release.
    }
    press(`p:${e.pointerId ?? 0}`, Number(el.dataset.midi));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const holder = `p:${e.pointerId ?? 0}`;
    if (!holdersRef.current.has(holder)) return;
    const midi = midiFromEvent(e);
    if (midi === null) release(holder);
    else press(holder, midi);
  };

  const onPointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => release(`p:${e.pointerId ?? 0}`);

  const moveFocus = (midi: number) => {
    keyEls.current.get(midi)?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const { low: lo, high: hi } = layout;
    const current = activeMidi;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(Math.min(hi, current + 1));
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(Math.max(lo, current - 1));
        return;
      case 'Home':
        e.preventDefault();
        moveFocus(lo);
        return;
      case 'End':
        e.preventDefault();
        moveFocus(hi);
        return;
      case 'ArrowUp': {
        e.preventDefault();
        if (isBlackMidi(current)) return;
        if (current + 1 <= hi && isBlackMidi(current + 1)) moveFocus(current + 1);
        else if (current - 1 >= lo && isBlackMidi(current - 1)) moveFocus(current - 1);
        return;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (!isBlackMidi(current)) return;
        moveFocus(current - 1 >= lo ? current - 1 : Math.min(hi, current + 1));
        return;
      }
      case ' ':
      case 'Enter': {
        e.preventDefault();
        if (e.repeat) return;
        const el = (e.target as Element).closest?.('[data-midi]') as HTMLElement | null;
        press(`k:${e.key}`, el ? Number(el.dataset.midi) : current);
        return;
      }
      default: {
        const midi = computerKeys.get(e.key.toLowerCase());
        if (midi === undefined) return;
        e.preventDefault();
        if (!e.repeat) press(`k:${e.key.toLowerCase()}`, midi);
      }
    }
  };

  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      release(`k:${e.key}`);
    } else {
      release(`k:${e.key.toLowerCase()}`);
    }
  };

  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof Node && groupRef.current?.contains(e.relatedTarget)) return;
    releaseWhere((h) => h.startsWith('k:'));
  };

  const touchAction = scroll.overflow ? 'pan-x' : 'none';
  const pct = (units: number) => `${(units / layout.units) * 100}%`;

  const renderKey = (key: KeyModel) => {
    const state = highlightByMidi.get(key.midi);
    const isPressed = pressed.has(key.midi);
    const colour = state ? STATE_COLOUR[state] : null;
    let background: string;
    if (isPressed) background = key.black ? 'var(--piano-black-pressed)' : 'var(--piano-white-pressed)';
    else if (key.black) {
      background = colour
        ? `color-mix(in srgb, ${colour.solid} 55%, var(--piano-black))`
        : 'var(--piano-black)';
    } else {
      background = colour ? `color-mix(in srgb, ${colour.solid} 40%, var(--piano-white))` : 'var(--piano-white)';
    }
    const style: CSSProperties = {
      left: pct(key.left),
      width: pct(key.width),
      height: key.black ? '62%' : '100%',
      background,
      color: 'var(--piano-label)',
      touchAction,
      transitionDuration: 'var(--motion-duration-fast)',
      transform: isPressed ? 'translateY(2px) scale(0.985)' : undefined,
      transformOrigin: 'top center',
      boxShadow: isPressed
        ? 'inset 0 -6px 14px rgb(0 0 0 / 0.35)'
        : key.black
          ? 'var(--elev-md)'
          : 'inset 0 -4px 0 rgb(0 0 0 / 0.18)',
    };
    const description = state ? STATE_COLOUR[state].label : undefined;
    return (
      <button
        key={key.midi}
        ref={(el) => {
          if (el) keyEls.current.set(key.midi, el);
          else keyEls.current.delete(key.midi);
        }}
        type="button"
        aria-label={key.name}
        aria-pressed={isPressed}
        {...(description ? { 'aria-description': description } : {})}
        data-midi={key.midi}
        data-key={key.black ? 'black' : 'white'}
        data-highlight={state}
        data-pressed={isPressed}
        style={style}
        disabled={disabled}
        tabIndex={key.midi === activeMidi ? 0 : -1}
        onFocus={() => setFocusedMidi(key.midi)}
        onContextMenu={(e) => e.preventDefault()}
        className={[
          'absolute top-0 select-none transition-[background-color,transform,box-shadow] ease-(--motion-ease-standard) [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]',
          key.black
            ? 'z-10 rounded-b-md border border-border'
            : 'z-0 rounded-b-lg border border-border',
          'focus-visible:z-20',
        ].join(' ')}
      >
        {showLabels && !key.black && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-bold"
          >
            {key.pitch.letter}
            {key.pitch.letter === 'C' ? key.pitch.octave : ''}
          </span>
        )}
        {state && <Marker state={state} black={key.black} />}
      </button>
    );
  };

  return (
    <div
      className="relative w-full rounded-lg bg-bg-raised p-1.5 shadow-md transition-opacity data-[disabled=true]:opacity-45"
      data-disabled={disabled}
      data-testid="keyboard"
      data-fit={scroll.overflow ? 'scroll' : 'fit'}
      data-key-px={avail > 0 ? keyPx.toFixed(1) : undefined}
      style={{ transitionDuration: 'var(--motion-duration-base)' }}
    >
      <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={updateScroll}
        className="overflow-x-auto overflow-y-hidden [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        data-overflow={scroll.overflow}
      >
        <div
          ref={groupRef}
          role="group"
          aria-label="Piano keyboard"
          aria-disabled={disabled || undefined}
          className="relative h-44 w-full sm:h-52"
          style={{ minWidth: `${naturalWidth}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={onBlur}
        >
          {layout.keys.map(renderKey)}
        </div>
      </div>
      {scroll.left && (
        <div
          aria-hidden="true"
          data-scroll-affordance="left"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-md bg-gradient-to-r from-bg-raised/90 to-transparent"
        />
      )}
      {scroll.right && (
        <div
          aria-hidden="true"
          data-scroll-affordance="right"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-md bg-gradient-to-l from-bg-raised/90 to-transparent"
        />
      )}
      </div>
      {scroll.overflow && (
        <div className="mt-1.5 flex items-center justify-between gap-2" data-testid="keyboard-scroll-bar">
          <button
            ref={lowerRef}
            type="button"
            aria-label="Show lower keys"
            data-scroll-button="lower"
            disabled={!scroll.left}
            onClick={() => scrollByButton(-1)}
            className={SCROLL_BUTTON_CLASS}
          >
            <span aria-hidden="true" className="text-xl font-bold leading-none">&lsaquo;</span>
            <span aria-hidden="true" className="text-sm font-semibold">Lower</span>
          </button>
          <p data-testid="keyboard-scroll-hint" className="min-h-6 flex-1 text-center text-sm font-semibold text-fg-secondary">
            {scrolled ? null : scroll.right ? 'More keys this way \u2192' : '\u2190 More keys this way'}
          </p>
          <button
            ref={higherRef}
            type="button"
            aria-label="Show higher keys"
            data-scroll-button="higher"
            disabled={!scroll.right}
            onClick={() => scrollByButton(1)}
            className={SCROLL_BUTTON_CLASS}
          >
            <span aria-hidden="true" className="text-sm font-semibold">Higher</span>
            <span aria-hidden="true" className="text-xl font-bold leading-none">&rsaquo;</span>
          </button>
        </div>
      )}
    </div>
  );
}
