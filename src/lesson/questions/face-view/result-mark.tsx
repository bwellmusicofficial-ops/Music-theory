import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export interface ResultMarkProps {
  tone: 'right' | 'wrong';
  /** The text label. It carries the meaning; colour and icon only support it. */
  children: ReactNode;
  className?: string;
}

/** A right or wrong label with an icon, so the result never relies on colour alone. */
export function ResultMark({ tone, children, className }: ResultMarkProps) {
  const right = tone === 'right';
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-bold',
        right ? 'bg-success text-on-success' : 'bg-danger text-on-danger',
        className,
      )}
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
        {right ? <path d="M5 13l4 4L19 7" /> : <path d="M6 6l12 12M18 6L6 18" />}
      </svg>
      {children}
    </span>
  );
}
