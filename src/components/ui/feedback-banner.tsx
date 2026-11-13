import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface FeedbackBannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
  kind: 'correct' | 'wrong';
  /** Why the answer is right or wrong; shown as text. */
  reason: string;
  /** Overrides the default heading ("Correct" / "Not quite"). */
  title?: string;
}

const CONFIG = {
  correct: { title: 'Correct', border: 'border-success', icon: 'text-success' },
  wrong: { title: 'Not quite', border: 'border-danger', icon: 'text-danger' },
} as const;

export function FeedbackBanner({ kind, reason, title, className, ...rest }: FeedbackBannerProps) {
  const c = CONFIG[kind];
  return (
    <div
      role="status"
      data-kind={kind}
      className={cn(
        'flex items-start gap-3 rounded-md border-2 bg-surface p-4 text-fg shadow-md',
        'animate-[banner-in_var(--motion-duration-base)_var(--motion-ease-out)]',
        c.border,
        className,
      )}
      {...rest}
    >
      <svg
        aria-hidden="true"
        data-testid="feedback-icon"
        viewBox="0 0 24 24"
        className={cn('mt-0.5 size-6 shrink-0', c.icon)}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === 'correct' ? <path d="M5 13l4 4L19 7" /> : <path d="M6 6l12 12M18 6L6 18" />}
      </svg>
      <div>
        <p className="font-bold">{title ?? c.title}</p>
        <p className="text-fg-secondary">{reason}</p>
      </div>
    </div>
  );
}
