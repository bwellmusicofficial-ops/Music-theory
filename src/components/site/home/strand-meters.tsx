import { ProgressBar, STRAND_NAMES } from '@/components/ui';
import type { StrandMeter } from '@/progress-view';
import { SectionCard } from '../section-card';
import { strandColour } from '../strand-colour';

/** Share of each strand's lessons complete. */
export function StrandMeters({ meters }: { meters: readonly StrandMeter[] }) {
  if (meters.length === 0) return null;
  return (
    <SectionCard title="By strand">
      <ul className="grid gap-4 sm:grid-cols-2">
        {meters.map((m) => (
          <li key={m.strand} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold">
                <span aria-hidden="true" className="size-3 rounded-full" style={{ background: strandColour(m.strand) }} />
                {STRAND_NAMES[m.strand]}
              </span>
              <span className="text-sm font-semibold text-fg-secondary">
                {m.done} of {m.total}
              </span>
            </div>
            <ProgressBar value={m.fraction} strand={m.strand} aria-label={`${STRAND_NAMES[m.strand]} progress`} className="h-2" />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
