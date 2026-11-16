import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { IconCheck } from '../icons';

/** A toggle chip for a filter. Pressed is shown by a tick and a filled background as well as aria-pressed. */
export function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold',
        pressed ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg hover:bg-surface-raised',
      )}
    >
      {pressed ? <IconCheck width={14} height={14} /> : null}
      {children}
    </button>
  );
}
