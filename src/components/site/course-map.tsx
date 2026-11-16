'use client';

import Link from 'next/link';
import { Badge, ProgressBar } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import { useSettings } from '@/settings';
import {
  buildCourse,
  comingSoonGrades,
  gradeCompletion,
  journeyPosition,
  lessonTitle,
  nextLesson,
  type LessonMeta,
} from '@/progress-view';
import { useStoredProgress } from '@/progress-view/hooks';
import { useMemo } from 'react';
import { ComingSoonGrade } from './coming-soon-grade';
import { Skeleton } from './skeleton';
import { PageContainer, PageTitle } from './page-container';
import { UnitPath } from './unit-path';
import { IconArrowRight } from './icons';

/** The whole journey as a path: grades as sections, units as groups, a node per lesson. */
export function CourseMap({ lessons }: { lessons: readonly LessonMeta[] }) {
  const course = useMemo(() => buildCourse(lessons), [lessons]);
  const soon = useMemo(() => comingSoonGrades(course), [course]);
  const stored = useStoredProgress();
  const { settings } = useSettings();
  const terminology: Terminology = settings.terminology;
  const ready = stored.status === 'ready';
  const next = ready ? nextLesson(lessons, stored.progress) : null;
  const journey = ready ? journeyPosition(lessons, stored.progress) : null;

  return (
    <PageContainer width="md" className="gap-8">
      <PageTitle title="Learn" eyebrow="Your path">
        From your first note towards Grade 8. Everything is open, so start where you like.
      </PageTitle>

      <div className="flex flex-col gap-3" aria-busy={!ready}>
        {journey ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4 shadow-md">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-bold">
                {journey.finished ? 'Every lesson complete' : `Lesson ${journey.lessonNumber} of ${journey.total}`}
              </p>
              <p className="text-sm font-semibold text-fg-secondary">{journey.percent}% complete</p>
            </div>
            <ProgressBar value={journey.percent / 100} aria-label="Whole course progress" />
            {next ? (
              <Link
                href="#current-lesson"
                className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-surface-raised px-4 text-sm font-bold text-fg hover:bg-border-subtle"
              >
                Go to my place: {lessonTitle(next.lesson, terminology)}
                <IconArrowRight width={16} height={16} />
              </Link>
            ) : null}
          </div>
        ) : (
          <Skeleton className="h-28" />
        )}
        <p role="note" className="rounded-2xl border-2 border-warning bg-surface p-3 text-sm text-fg-secondary" data-testid="draft-note">
          Lessons marked <strong>Draft</strong> have not yet been checked by a music specialist. You can try them, but they
          may still contain mistakes.
        </p>
      </div>

      {course.length === 0 ? (
        <p className="rounded-2xl border border-border-subtle bg-surface p-5 text-fg-secondary">No lessons are available yet. Please check back soon.</p>
      ) : null}

      {course.map((grade) => {
        const completion = ready ? gradeCompletion(grade, stored.progress) : null;
        return (
          <section key={grade.grade} id={`grade-${grade.grade}`} aria-labelledby={`grade-title-${grade.grade}`} className="flex scroll-mt-20 flex-col gap-6">
            <div className="flex flex-col gap-2 border-b border-border-subtle pb-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`grade-title-${grade.grade}`} className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {grade.title}
                </h2>
                {completion ? (
                  <Badge tone={completion.percent === 100 ? 'success' : 'neutral'}>
                    {completion.done} of {completion.total}
                  </Badge>
                ) : null}
              </div>
              {completion ? <ProgressBar value={completion.percent / 100} aria-label={`${grade.title} progress`} className="h-2" /> : <Skeleton className="h-2 rounded-full" />}
            </div>
            {grade.units.map((unit) => (
              <UnitPath
                key={`${unit.grade}/${unit.id}`}
                unit={unit}
                gradeTitle={grade.title}
                progress={ready ? stored.progress : undefined}
                currentLessonId={next?.lesson.id ?? null}
                terminology={terminology}
              />
            ))}
          </section>
        );
      })}

      {soon.length > 0 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Later grades</h2>
          {soon.map((grade) => (
            <ComingSoonGrade key={grade.grade} grade={grade} />
          ))}
        </div>
      ) : null}
    </PageContainer>
  );
}
