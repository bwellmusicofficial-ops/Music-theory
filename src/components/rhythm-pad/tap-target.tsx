'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from '@/components/ui/cn';
import { VerdictIcon, type LiveVerdict } from './verdict-chip';

export interface TapTargetProps {
  /** Called at the moment of the event, before anything else. */
  onTap: () => void;
  active: boolean;
  pulsing: boolean;
  label: string;
  /** Verdict colour and shape for the last tap; null for none. */
  flash?: LiveVerdict | null;
  /** True for a moment on each click. */
  beatPulse?: boolean;
  /** No scaling or pulsing; the verdict colour still shows. */
  reduced?: boolean;
}

/** Large tap surface. Timing events are pointerdown and keydown, never click. */
export function TapTarget({ onTap, active, pulsing, label, flash = null, beatPulse = false, reduced = false }: TapTargetProps) {
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    onTap();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    onTap();
  };
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={!active}
      data-testid="tap-target"
      data-pulsing={pulsing && !reduced}
      data-accent-pulse={pulsing && !reduced && !flash}
      data-flash={flash ?? undefined}
      data-beat={beatPulse && !reduced}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      // Prevent the synthetic click from Space/Enter keyup doing anything.
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex min-h-24 w-full select-none items-center justify-center rounded-lg border-2 px-6 py-6 text-xl font-semibold',
        'touch-manipulation transition-transform duration-(--motion-duration-fast) ease-out sm:w-auto sm:min-w-64',
        'data-[pulsing=true]:scale-95 data-[accent-pulse=true]:bg-accent data-[accent-pulse=true]:text-on-accent',
        'data-[beat=true]:ring-4 data-[beat=true]:ring-accent/50',
        'data-[flash=perfect]:border-success data-[flash=perfect]:bg-success data-[flash=perfect]:text-on-success',
        'data-[flash=close]:border-warning data-[flash=close]:bg-warning data-[flash=close]:text-on-warning',
        'data-[flash=miss]:border-danger data-[flash=miss]:bg-danger data-[flash=miss]:text-on-danger',
        'data-[flash=extra]:border-danger data-[flash=extra]:bg-danger data-[flash=extra]:text-on-danger',
        active ? 'border-accent bg-surface-raised text-fg' : 'border-border-subtle bg-surface text-muted',
      )}
    >
      {flash ? <VerdictIcon verdict={flash} className="mr-2 size-7" /> : null}
      Tap
    </button>
  );
}
