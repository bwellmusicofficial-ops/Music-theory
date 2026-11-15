import { cn } from '@/components/ui/cn';

export type LiveVerdict = 'perfect' | 'close' | 'miss' | 'extra';

const CONFIG: Record<LiveVerdict, { word: string; tone: string; shape: React.ReactNode }> = {
  perfect: {
    word: 'Perfect',
    tone: 'text-success',
    shape: <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  close: {
    word: 'Close',
    tone: 'text-warning',
    shape: <path d="M4 14c2.5-5 5-5 8 0s5.5 5 8 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />,
  },
  miss: {
    word: 'Missed',
    tone: 'text-danger',
    shape: <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />,
  },
  extra: {
    word: 'Extra tap',
    tone: 'text-danger',
    shape: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />,
  },
};

export const verdictWord = (v: LiveVerdict): string => CONFIG[v].word;

export function VerdictIcon({ verdict, className }: { verdict: LiveVerdict; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn('size-5', className)} data-verdict-icon={verdict}>
      {CONFIG[verdict].shape}
    </svg>
  );
}

/** The short live verdict word with its shape. Decorative to assistive tech: the pad's live region speaks. */
export function VerdictChip({ verdict }: { verdict: LiveVerdict }) {
  const c = CONFIG[verdict];
  return (
    <span
      aria-hidden="true"
      data-testid="verdict-chip"
      data-verdict={verdict}
      className={cn('inline-flex items-center gap-1 text-base font-bold', c.tone)}
    >
      <VerdictIcon verdict={verdict} />
      {c.word}
    </span>
  );
}
