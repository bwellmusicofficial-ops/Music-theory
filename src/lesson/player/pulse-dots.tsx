import { onsetKey, type OnsetRef } from '@/components/rhythm-pad/onset-map';
import type { StaveMark } from '@/components/stave';
import { cn } from '@/components/ui/cn';

export interface PulseDotsProps {
  /** One dot per onset, in order (from `onsetRefs`). */
  onsets: readonly OnsetRef[];
  /** The tap-along marks, keyed "bar:event"; a dot is lit when its onset has a mark. */
  marks: Record<string, StaveMark>;
  /** The onset on the current beat, ringed so the learner can see where the click is. */
  cursor: { bar: number; event: number } | null;
  label: string;
}

/** A row of plain dots standing in for the notation: one per tap to make, lit as they are tapped. */
export function PulseDots({ onsets, marks, cursor, label }: PulseDotsProps) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center justify-center gap-3 py-4" data-testid="pulse-dots">
      {onsets.map((ref, i) => {
        const lit = marks[onsetKey(ref)] !== undefined;
        const now = cursor !== null && cursor.bar === ref.bar && cursor.event === ref.event;
        return (
          <li
            key={i}
            data-lit={lit}
            data-now={now}
            aria-label={`Pulse ${i + 1}${lit ? ', tapped' : ''}`}
            className={cn(
              'size-7 rounded-full border-2 transition-colors duration-(--motion-duration-fast)',
              lit ? 'border-accent bg-accent' : 'border-border bg-surface',
              now && 'outline-2 outline-offset-2 outline-accent',
            )}
          />
        );
      })}
    </ol>
  );
}
