import { Badge } from '@/components/ui';
import type { ComingSoonGrade as ComingSoon } from '@/progress-view';
import { IconLock } from './icons';

/** A later grade on the course map: locked-looking, with one line on what it will cover. Not a link, and nothing behind it is locked. */
export function ComingSoonGrade({ grade }: { grade: ComingSoon }) {
  return (
    <section
      aria-labelledby={`grade-title-${grade.grade}`}
      id={`grade-${grade.grade}`}
      className="flex items-start gap-4 rounded-2xl border-2 border-dashed border-border-subtle bg-bg-raised p-5"
    >
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-raised text-fg-secondary">
        <IconLock width={20} height={20} />
      </span>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`grade-title-${grade.grade}`} className="text-xl font-extrabold tracking-tight text-fg-secondary">
            {grade.title}
          </h2>
          <Badge>Coming soon</Badge>
        </div>
        <p className="text-fg-secondary">{grade.summary}</p>
      </div>
    </section>
  );
}
