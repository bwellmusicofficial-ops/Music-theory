import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { type Judgement, judge } from './scoring';

const CONFIG: Record<Judgement, { label: string; tone: string; shape: ReactNode }> = {
  early: {
    label: 'Early',
    tone: 'border-warning text-warning',
    shape: <path d="M15 5 7 12l8 7z" fill="currentColor" />,
  },
  'on-time': {
    label: 'On time',
    tone: 'border-success text-success',
    shape: <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  late: {
    label: 'Late',
    tone: 'border-warning text-warning',
    shape: <path d="m9 5 8 7-8 7z" fill="currentColor" />,
  },
  missed: {
    label: 'Missed',
    tone: 'border-danger text-danger',
    shape: <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />,
  },
};

export interface FeedbackRowProps {
  errorsMs: (number | null)[];
  perfectMs: number;
  /** Matched taps further out than this are shown as Early or Late in the danger colour with a cross. */
  toleranceMs?: number;
}

/** One marker per onset: a distinct shape plus a text label, so colour is never the only signal. */
export function FeedbackRow({ errorsMs, perfectMs, toleranceMs }: FeedbackRowProps) {
  return (
    <ol aria-label="Result for each note" data-testid="feedback-row" className="flex flex-wrap justify-center gap-3">
      {errorsMs.map((e, i) => {
        const kind = judge(e, perfectMs);
        const off = e !== null && toleranceMs !== undefined && Math.abs(e) > toleranceMs;
        const c = off ? { ...CONFIG[kind], tone: CONFIG.missed.tone, shape: CONFIG.missed.shape } : CONFIG[kind];
        return (
          <li
            key={i}
            data-kind={kind}
            data-off={off ? 'true' : undefined}
            className={cn('flex min-w-16 flex-col items-center gap-1 rounded-md border-2 bg-surface px-2 py-2 text-sm', c.tone)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6">
              {c.shape}
            </svg>
            <span className="text-fg">
              <span className="sr-only">{`Note ${i + 1}: `}</span>
              {c.label}
            </span>
            {e !== null && kind !== 'on-time' ? (
              <span className="text-xs text-fg-secondary">{`${e > 0 ? '+' : '-'}${Math.round(Math.abs(e))} ms`}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
