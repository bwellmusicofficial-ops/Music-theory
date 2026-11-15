'use client';

import { cn } from '@/components/ui/cn';

export interface QuestionNavigatorProps {
  count: number;
  current: number;
  answers: readonly unknown[];
  flagged: readonly boolean[];
  onSelect: (index: number) => void;
}

function label(index: number, answered: boolean, flagged: boolean, current: boolean) {
  return [
    `Question ${index + 1}`,
    answered ? 'answered' : 'not answered',
    flagged ? 'flagged for review' : null,
    current ? 'current question' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** A grid of question numbers. Status is shown by a symbol and the accessible name as well as by colour. */
export function QuestionNavigator({ count, current, answers, flagged, onSelect }: QuestionNavigatorProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="navigator">
      <ol className="grid grid-cols-6 gap-2 sm:grid-cols-8" aria-label="Questions">
        {Array.from({ length: count }, (_, i) => {
          const answered = answers[i] !== undefined;
          const isFlagged = flagged[i] === true;
          const isCurrent = i === current;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-label={label(i, answered, isFlagged, isCurrent)}
                aria-current={isCurrent ? 'step' : undefined}
                data-answered={answered}
                data-flagged={isFlagged}
                className={cn(
                  'relative flex min-h-12 w-full flex-col items-center justify-center rounded-md border-2 text-base font-bold leading-none',
                  'cursor-pointer hover:border-accent',
                  answered ? 'bg-surface-raised text-fg' : 'bg-surface text-fg-secondary',
                  isFlagged ? 'border-warning' : answered ? 'border-border' : 'border-border-subtle border-dashed',
                  isCurrent && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
                )}
              >
                <span aria-hidden="true">{i + 1}</span>
                <span aria-hidden="true" className="mt-1 h-3 text-xs leading-3">
                  {isFlagged ? '⚑' : answered ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-fg-secondary">
        <span aria-hidden="true">{'✓'}</span> answered, dashed outline: not answered yet,{' '}
        <span aria-hidden="true">{'⚑'}</span> flagged for review.
      </p>
    </div>
  );
}
