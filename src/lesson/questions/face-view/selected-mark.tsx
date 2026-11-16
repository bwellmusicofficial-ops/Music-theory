import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export interface SelectedMarkProps {
  /** Text label; it carries the meaning, the tick only supports it. */
  children?: ReactNode;
  className?: string;
}

/** "Selected": the learner's current choice before any marking. Neither right nor wrong. */
export function SelectedMark({ children = 'Your choice', className }: SelectedMarkProps) {
  return (
    <span
      data-tone="selected"
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-bold text-accent', className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
      {children}
    </span>
  );
}
