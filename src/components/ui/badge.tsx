import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children?: ReactNode;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'text-fg-secondary border-border',
  accent: 'text-accent border-accent',
  success: 'text-success border-success',
  danger: 'text-danger border-danger',
  warning: 'text-warning border-warning',
};

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full border bg-surface px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
