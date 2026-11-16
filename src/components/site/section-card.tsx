import { useId, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

/** A titled card: an h2 and its content, for the dashboard's panels. */
export function SectionCard({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-4 rounded-3xl border border-border-subtle bg-surface p-5 shadow-md', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-extrabold tracking-tight">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
