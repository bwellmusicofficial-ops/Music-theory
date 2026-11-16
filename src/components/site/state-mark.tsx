import type { LessonState } from '@/lesson/contracts';
import type { Strand } from '@/lesson/schema';
import { cn } from '@/components/ui/cn';
import { STATE_LABELS } from '@/progress-view';
import { IconCheck, IconPlay, IconStar } from './icons';
import { strandColour } from './strand-colour';

const SIZES = { sm: 'size-8', md: 'size-11', lg: 'size-14' } as const;
const ICON_PX = { sm: 16, md: 20, lg: 26 } as const;

export interface StateMarkProps {
  /** Omit for the neutral placeholder drawn before progress has loaded. */
  state?: LessonState;
  strand: Strand;
  /** Shown inside a not-started node. */
  number?: number;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * The round marker for a lesson. The state is told by its shape and icon as
 * well as colour: an empty ring with the lesson number (not started), a ring
 * with a play arrow (in progress), a solid disc with a tick (complete) and a
 * solid disc with a star and a second ring (mastered).
 */
export function StateMark({ state, strand, number, size = 'md', className }: StateMarkProps) {
  const colour = strandColour(strand);
  const base = cn('relative flex shrink-0 items-center justify-center rounded-full font-extrabold', SIZES[size], className);
  const px = ICON_PX[size];
  if (state === undefined) {
    return <span aria-hidden="true" data-state="pending" className={cn(base, 'border-2 border-border-subtle bg-surface')} />;
  }
  switch (state) {
    case 'not-started':
      return (
        <span aria-hidden="true" data-state={state} className={cn(base, 'border-2 border-border bg-surface text-fg-secondary')}>
          {number ?? ''}
        </span>
      );
    case 'in-progress':
      return (
        <span aria-hidden="true" data-state={state} className={cn(base, 'border-4 bg-surface')} style={{ borderColor: colour, color: colour }}>
          <IconPlay width={px} height={px} className="translate-x-px" />
        </span>
      );
    case 'complete':
      return (
        <span aria-hidden="true" data-state={state} className={cn(base, 'text-bg')} style={{ background: colour }}>
          <IconCheck width={px} height={px} />
        </span>
      );
    case 'mastered':
      return (
        <span
          aria-hidden="true"
          data-state={state}
          className={cn(base, 'text-bg ring-4 ring-offset-2 ring-offset-bg')}
          style={{ background: colour, ['--tw-ring-color' as string]: 'var(--warning)' }}
        >
          <IconStar width={px} height={px} />
        </span>
      );
  }
}

/** The state as words with its small icon, for lists. */
export function StateLabel({ state, className }: { state: LessonState; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', state === 'not-started' ? 'text-muted' : 'text-fg', className)}>
      {state === 'complete' ? <IconCheck width={14} height={14} className="text-success" /> : null}
      {state === 'mastered' ? <IconStar width={14} height={14} className="text-warning" /> : null}
      {state === 'in-progress' ? <IconPlay width={12} height={12} className="text-accent" /> : null}
      {STATE_LABELS[state]}
    </span>
  );
}
