import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import { STRAND_BG_CLASS, STRAND_BORDER_CLASS, STRAND_NAMES, type StrandId } from './strand';

export interface StrandTagProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  strand: StrandId;
  /** Overrides the default strand name. */
  label?: string;
}

/** Strand name as text, with its colour as a dot and border. Colour is never the only signal. */
export function StrandTag({ strand, label, className, ...rest }: StrandTagProps) {
  return (
    <span
      data-strand={strand}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border-2 bg-surface px-3 py-1 text-sm font-semibold text-fg',
        STRAND_BORDER_CLASS[strand],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className={cn('size-2.5 rounded-full', STRAND_BG_CLASS[strand])} />
      {label ?? STRAND_NAMES[strand]}
    </span>
  );
}
