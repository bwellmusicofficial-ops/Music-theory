'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './cx';

export interface ScreenHeadingProps {
  children: ReactNode;
  /** Small label above the heading, e.g. "Practice 2 of 4". */
  eyebrow?: string;
  size?: 'lg' | 'xl';
  className?: string;
}

/**
 * The one h1 of a screen. It takes focus when it mounts, so a screen reader
 * and a keyboard user land at the top of every new task.
 */
export function ScreenHeading({ children, eyebrow, size = 'xl', className }: ScreenHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, []);
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? (
        <p className="text-sm font-bold uppercase tracking-widest text-accent" data-testid="eyebrow">
          {eyebrow}
        </p>
      ) : null}
      <h1
        ref={ref}
        tabIndex={-1}
        className={cx(
          'font-extrabold leading-tight tracking-tight outline-none focus-visible:outline-none',
          size === 'xl' ? 'text-2xl' : 'text-xl',
          className,
        )}
      >
        {children}
      </h1>
    </div>
  );
}
