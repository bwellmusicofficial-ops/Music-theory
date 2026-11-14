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

const MIN_WHITE_KEY_PX = 40;
const MIDDLE_C = 60;

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
      style={{ background: c.solid, color: c.on, bottom: black ? '0.5rem' : '2rem' }}
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

  const groupRef = useRef<HTMLDivElement>(null);
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

  // Scroll affordance state.
  const updateScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { overflow: max > 1, left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 };
    setScroll((s) => (s.overflow === next.overflow && s.left === next.left && s.right === next.right ? s : next));
  }, []);

  // Open scrolled so the first highlighted key (else middle C) is in view.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let target: number | null = null;
    for (const midi of highlightByMidi.keys()) {
      if (keyByMidi.has(midi) && (target === null || midi < target)) target = midi;
    }
    if (target === null) target = defaultMidi;
    const key = keyByMidi.get(target);
    if (key && el.scrollWidth > el.clientWidth) {
      const centre = ((key.left + key.width / 2) / layout.units) * el.scrollWidth;
      el.scrollLeft = Math.max(0, centre - el.clientWidth / 2);
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
    if (isPressed) background = 'var(--accent)';
    else if (key.black) {
      background = colour
        ? `color-mix(in srgb, ${colour.solid} 55%, var(--bg))`
        : 'linear-gradient(180deg, var(--surface-raised), var(--bg))';
    } else {
      background = colour ? `color-mix(in srgb, ${colour.solid} 40%, var(--text))` : 'var(--text)';
    }
    const style: CSSProperties = {
      left: pct(key.left),
      width: pct(key.width),
      height: key.black ? '62%' : '100%',
      background,
      color: isPressed ? 'var(--on-accent)' : key.black ? 'var(--text)' : 'var(--bg)',
      touchAction,
      transitionDuration: 'var(--motion-duration-fast)',
      transform: isPressed ? 'translateY(2px) scale(0.985)' : undefined,
      transformOrigin: 'top center',
      boxShadow: isPressed
        ? 'inset 0 -6px 14px rgb(0 0 0 / 0.35), var(--elev-glow)'
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
            : 'z-0 rounded-b-lg border border-border-subtle',
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
      className="relative w-full rounded-lg bg-bg-raised p-2 shadow-md transition-opacity data-[disabled=true]:opacity-45"
      data-disabled={disabled}
      data-testid="keyboard"
      style={{ transitionDuration: 'var(--motion-duration-base)' }}
    >
      <div
        ref={scrollerRef}
        onScroll={updateScroll}
        className="overflow-x-auto overflow-y-hidden pb-2 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        data-overflow={scroll.overflow}
      >
        <div
          ref={groupRef}
          role="group"
          aria-label="Piano keyboard"
          aria-disabled={disabled || undefined}
          className="relative h-44 w-full sm:h-52"
          style={{ minWidth: `${layout.units * MIN_WHITE_KEY_PX}px` }}
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
          className="pointer-events-none absolute inset-y-2 left-2 flex w-10 items-center justify-start rounded-l-md bg-gradient-to-r from-bg-raised to-transparent pl-1 text-fg"
        >
          <span className="text-lg font-bold">&lsaquo;</span>
        </div>
      )}
      {scroll.right && (
        <div
          aria-hidden="true"
          data-scroll-affordance="right"
          className="pointer-events-none absolute inset-y-2 right-2 flex w-10 items-center justify-end rounded-r-md bg-gradient-to-l from-bg-raised to-transparent pr-1 text-fg"
        >
          <span className="text-lg font-bold">&rsaquo;</span>
        </div>
      )}
    </div>
  );
}
