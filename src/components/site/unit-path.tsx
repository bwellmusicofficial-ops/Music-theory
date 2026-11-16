import Link from 'next/link';
import type { LessonState } from '@/lesson/contracts';
import { STRAND_NAMES } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import { lessonState, unitCompletion, unitHref, type CourseUnit, type ProgressMap } from '@/progress-view';
import { isDone } from '@/progress-view';
import { nodePositions, pathHeight, segmentPath } from '@/progress-view/map-layout';
import { IconArrowRight } from './icons';
import { LessonNode } from './lesson-node';
import { strandColour } from './strand-colour';

export interface UnitPathProps {
  unit: CourseUnit;
  gradeTitle: string;
  /** Undefined until progress has loaded. */
  progress?: ProgressMap;
  currentLessonId: string | null;
  terminology: Terminology;
}

/** One unit on the course map: a header that opens the unit page, then its lessons along a winding path. */
export function UnitPath({ unit, gradeTitle, progress, currentLessonId, terminology }: UnitPathProps) {
  const positions = nodePositions(unit.lessons.length);
  const height = pathHeight(unit.lessons.length);
  const states: (LessonState | undefined)[] = unit.lessons.map((l) => (progress ? lessonState(progress, l.id) : undefined));
  const completion = progress ? unitCompletion(unit, progress) : null;
  const colour = strandColour(unit.strand);
  return (
    <section aria-labelledby={`unit-${unit.grade}-${unit.id}`} className="flex flex-col gap-4">
      <Link
        href={unitHref(unit)}
        className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface p-4 pl-6 shadow-md hover:border-border"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2" style={{ background: colour }} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colour }}>
            {STRAND_NAMES[unit.strand]}
          </span>
          <h3 id={`unit-${unit.grade}-${unit.id}`} className="text-lg font-extrabold leading-tight text-fg">
            {unit.title}
          </h3>
          <span className="text-sm text-fg-secondary">
            {completion ? `${completion.done} of ${completion.total} complete` : `${unit.lessons.length} lessons`}
          </span>
        </span>
        <IconArrowRight className="shrink-0 text-fg-secondary group-hover:text-fg" width={22} height={22} />
        <span className="sr-only">Open unit page</span>
      </Link>
      <div className="relative" style={{ height }}>
        <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
          {positions.slice(1).map((to, i) => {
            const walked = isDone(states[i] ?? 'not-started') && isDone(states[i + 1] ?? 'not-started');
            return (
              <path
                key={i}
                d={segmentPath(positions[i]!, to)}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={walked ? 5 : 3}
                strokeLinecap="round"
                strokeDasharray={walked ? undefined : '2 9'}
                stroke={walked ? colour : 'var(--border)'}
              />
            );
          })}
        </svg>
        <ol className="absolute inset-0">
          {unit.lessons.map((lesson, i) => (
            <LessonNode
              key={lesson.id}
              lesson={lesson}
              gradeTitle={gradeTitle}
              position={positions[i]!}
              number={i + 1}
              state={states[i]}
              current={lesson.id === currentLessonId}
              terminology={terminology}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
