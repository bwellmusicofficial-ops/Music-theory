import { cn } from '@/components/ui/cn';
import type { CountInCue } from './use-tap-along';

/**
 * The count-in, large, straddling the top edge of the notation's box so it never
 * covers a note: the beat being counted (1, 2, 3, 4), then "Tap!". Place inside a `relative`
 * box around the notation. Decorative: the pad announces the count-in.
 */
export function CountInOverlay({ cue }: { cue: CountInCue | null }) {
  if (!cue) return null;
  return (
    <div aria-hidden="true" data-testid="count-in-cue" className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
      <span
        data-cue={cue.kind}
        className={cn(
          'block rounded-lg border-2 bg-surface px-4 py-1 text-4xl font-bold leading-none shadow-(--elev-md)',
          cue.kind === 'go' ? 'border-success text-success' : 'border-accent text-fg',
        )}
      >
        {cue.kind === 'go' ? 'Tap!' : cue.value}
      </span>
    </div>
  );
}
