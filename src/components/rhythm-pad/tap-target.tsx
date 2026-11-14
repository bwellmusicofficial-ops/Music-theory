'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from '@/components/ui/cn';

export interface TapTargetProps {
  /** Called at the moment of the event, before anything else. */
  onTap: () => void;
  active: boolean;
  pulsing: boolean;
  label: string;
}

/** Large tap surface. Timing events are pointerdown and keydown, never click. */
export function TapTarget({ onTap, active, pulsing, label }: TapTargetProps) {
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
      data-pulsing={pulsing}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      // Prevent the synthetic click from Space/Enter keyup doing anything.
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex min-h-24 w-full select-none items-center justify-center rounded-lg border-2 px-6 py-6 text-xl font-semibold',
        'touch-manipulation transition-transform duration-(--motion-duration-fast) ease-out sm:w-auto sm:min-w-64',
        'data-[pulsing=true]:scale-95 data-[pulsing=true]:bg-accent data-[pulsing=true]:text-on-accent',
        active ? 'border-accent bg-surface-raised text-fg' : 'border-border-subtle bg-surface text-muted',
      )}
    >
      Tap
    </button>
  );
}
