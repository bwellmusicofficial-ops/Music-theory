'use client';

import { Badge } from '@/components/ui';
import { formatClock, timeWarning } from '../engine';

const SPOKEN = {
  'five-minutes': '5 minutes left',
  'one-minute': '1 minute left',
} as const;

/**
 * The visible countdown plus a polite live region that speaks only when the
 * 5 minute and 1 minute marks are crossed (a ticking region would be read out
 * every second). Untimed tests show nothing.
 */
export function Countdown({ secondsLeft }: { secondsLeft: number | null }) {
  const warning = timeWarning(secondsLeft);
  return (
    <>
      {secondsLeft === null ? null : (
        <div className="flex items-center gap-2">
          {warning ? (
            <Badge tone={warning === 'one-minute' ? 'danger' : 'warning'} data-testid="time-warning">
              {SPOKEN[warning]}
            </Badge>
          ) : null}
          <span
            role="timer"
            aria-label="Time left"
            data-testid="countdown"
            className={`min-w-14 text-right text-xl font-extrabold tabular-nums ${warning === 'one-minute' ? 'text-danger' : 'text-fg'}`}
          >
            {formatClock(secondsLeft)}
          </span>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only" data-testid="time-announcer">
        {warning ? SPOKEN[warning] : ''}
      </p>
    </>
  );
}
