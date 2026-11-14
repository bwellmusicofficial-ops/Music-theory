import { cn } from '@/components/ui/cn';

export interface BeatIndicatorProps {
  beatsPerBar: number;
  /** Current felt beat 0-based, or -1 for none. */
  current: number;
}

/** Decorative: the count is announced separately. Beat 1 is larger and accented. */
export function BeatIndicator({ beatsPerBar, current }: BeatIndicatorProps) {
  return (
    <ol aria-hidden="true" data-testid="beat-indicator" className="flex items-center justify-center gap-3">
      {Array.from({ length: beatsPerBar }, (_, i) => (
        <li
          key={i}
          data-active={i === current}
          data-accent={i === 0}
          className={cn(
            'flex items-center justify-center rounded-full border-2 font-semibold',
            i === 0 ? 'size-12 text-lg' : 'size-10',
            i === current ? 'border-accent bg-accent text-on-accent' : 'border-border text-fg-secondary',
          )}
        >
          {i + 1}
        </li>
      ))}
    </ol>
  );
}
