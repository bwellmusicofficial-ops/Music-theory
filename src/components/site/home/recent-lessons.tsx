import Link from 'next/link';
import { Badge } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import { lessonHref, lessonTitle, type RecentLesson } from '@/progress-view';
import { SectionCard } from '../section-card';
import { StateLabel, StateMark } from '../state-mark';

/** Lessons the learner opened most recently. */
export function RecentLessons({ rows, terminology }: { rows: readonly RecentLesson[]; terminology: Terminology }) {
  if (rows.length === 0) return null;
  return (
    <SectionCard title="Recently opened">
      <ul className="flex flex-col gap-2">
        {rows.map(({ lesson, state }) => (
          <li key={lesson.id}>
            <Link href={lessonHref(lesson)} className="flex items-center gap-3 rounded-2xl bg-surface-raised p-3 hover:bg-border-subtle">
              <StateMark state={state} strand={lesson.strand} size="sm" />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                <span className="font-bold">{lessonTitle(lesson, terminology)}</span>
                {lesson.status === 'draft' ? <Badge tone="warning">Draft</Badge> : null}
              </span>
              <StateLabel state={state} />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
