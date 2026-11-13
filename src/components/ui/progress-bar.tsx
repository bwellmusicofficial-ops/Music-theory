import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import { STRAND_BG_CLASS, type StrandId } from './strand';

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
  /** Progress from 0 to 1; values outside are clamped. */
  value: number;
  /** Tints the fill with a strand colour; otherwise the accent is used. */
  strand?: StrandId;
  /** Accessible name, e.g. "Lesson progress". */
  'aria-label': string;
}

export function ProgressBar({ value, strand, className, ...rest }: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(clamped * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      data-strand={strand}
      className={cn('h-3 w-full overflow-hidden rounded-full border border-border bg-surface-raised', className)}
      {...rest}
    >
      <div
        data-testid="progress-fill"
        className={cn(
          'h-full rounded-full transition-[width] duration-(--motion-duration-slow) ease-out',
          strand ? STRAND_BG_CLASS[strand] : 'bg-accent',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
