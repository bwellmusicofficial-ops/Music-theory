'use client';

import type { ReactNode } from 'react';
import { IconButton, ProgressBar, type StrandId } from '@/components/ui';

export interface ShellProps {
  progress: number;
  /** e.g. "Step 3 of 6: Name it". */
  stepLabel: string;
  strand?: StrandId;
  onExit: () => void;
  /** Shown at the right of the top bar (the challenge countdown). */
  trailing?: ReactNode;
  /** Polite announcement for screen readers. */
  announce: string;
  children: ReactNode;
}

/** The full-screen frame: thin progress bar on top, one task below. */
export function Shell({ progress, stepLabel, strand, onExit, trailing, announce, children }: ShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg" data-testid="lesson-player">
      <header className="z-10 shrink-0 border-b border-border-subtle bg-bg px-4 pt-3 pb-2">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <IconButton
            aria-label="Exit lesson"
            onClick={onExit}
            icon={
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            }
          />
          <ProgressBar value={progress} strand={strand} aria-label="Lesson progress" className="flex-1" />
          {trailing}
        </div>
        <p data-testid="step-label" className="mx-auto w-full max-w-xl pt-1 pl-14 text-xs font-semibold text-muted">{stepLabel}</p>
      </header>
      {/* The only scrolling region: a long screen scrolls here while the header and the action bar stay put. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 pt-6">{children}</div>
      </div>
      <p role="status" aria-live="polite" className="sr-only" data-testid="announcer">
        {announce}
      </p>
    </div>
  );
}
