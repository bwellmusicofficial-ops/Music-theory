'use client';

import Link from 'next/link';
import { Badge, ProgressBar, StrandTag } from '@/components/ui';
import { buttonClasses } from './button-link';
import { useSettings } from '@/settings';
import {
  lessonHref,
  lessonState,
  lessonSummary,
  lessonTitle,
  unitCompletion,
  unitCovers,
  type CourseUnit,
} from '@/progress-view';
import { useStoredProgress } from '@/progress-view/hooks';
import { IconArrowLeft } from './icons';
import { PageContainer } from './page-container';
import { Skeleton } from './skeleton';
import { StateLabel, StateMark } from './state-mark';
import { strandColour } from './strand-colour';

/** A unit page: what it covers, a Start/Continue button, and its lessons in order with their state. */
export function UnitView({ unit, gradeTitle }: { unit: CourseUnit; gradeTitle: string }) {
  const stored = useStoredProgress();
  const { settings } = useSettings();
  const terminology = settings.terminology;
  const ready = stored.status === 'ready';
  const completion = ready ? unitCompletion(unit, stored.progress) : null;

  let action: { label: string; lessonId: string } | null = null;
  if (ready) {
    const states = unit.lessons.map((l) => ({ l, s: lessonState(stored.progress, l.id) }));
    const resume = states.find((x) => x.s === 'in-progress') ?? states.find((x) => x.s === 'not-started');
    const touched = states.some((x) => x.s !== 'not-started');
    if (resume) action = { label: touched ? 'Continue unit' : 'Start unit', lessonId: resume.l.id };
    else if (unit.lessons[0]) action = { label: 'Review unit', lessonId: unit.lessons[0].id };
  }
  const colour = strandColour(unit.strand);

  return (
    <PageContainer width="md" className="gap-6">
      <Link href="/learn" className="inline-flex min-h-11 items-center gap-2 self-start rounded-full text-sm font-semibold text-fg-secondary hover:text-fg">
        <IconArrowLeft width={18} height={18} />
        Learn
      </Link>

      <header className="relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-border-subtle p-6 shadow-md" style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${colour} 24%, var(--surface)), var(--surface) 70%)` }}>
        <p className="text-sm font-bold uppercase tracking-wider text-fg-secondary">{gradeTitle}</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{unit.title}</h1>
        <div>
          <StrandTag strand={unit.strand} />
        </div>
        <p className="max-w-prose text-fg-secondary">{unitCovers(unit, terminology)}</p>
        {completion ? (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-sm font-semibold">
              {completion.done} of {completion.total} complete
            </p>
            <ProgressBar value={completion.percent / 100} strand={unit.strand} aria-label={`${unit.title} progress`} />
          </div>
        ) : (
          <Skeleton className="h-12" />
        )}
        {action ? (
          <Link href={lessonHref({ id: action.lessonId })} className={buttonClasses('primary', 'lg', 'mt-2 self-start')}>
            {action.label}
          </Link>
        ) : (
          <Skeleton className="mt-2 h-14 w-40 rounded-lg" />
        )}
      </header>

      <section aria-labelledby="unit-lessons" className="flex flex-col gap-3">
        <h2 id="unit-lessons" className="text-xl font-extrabold">
          Lessons
        </h2>
        {unit.lessons.length === 0 ? (
          <p className="rounded-2xl border border-border-subtle bg-surface p-5 text-fg-secondary">There are no lessons in this unit yet.</p>
        ) : null}
        <ol className="flex flex-col gap-3">
          {unit.lessons.map((lesson, i) => {
            const state = ready ? lessonState(stored.progress, lesson.id) : undefined;
            const best = ready ? stored.progress.get(lesson.id)?.bestScore ?? null : null;
            return (
              <li key={lesson.id}>
                <Link
                  href={lessonHref(lesson)}
                  className="group flex items-start gap-4 rounded-2xl border border-border-subtle bg-surface p-4 shadow-md hover:border-border"
                >
                  <StateMark state={state} strand={lesson.strand} number={i + 1} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold leading-snug">{lessonTitle(lesson, terminology)}</span>
                      {lesson.status === 'draft' ? <Badge tone="warning">Draft</Badge> : null}
                    </span>
                    <span className="text-fg-secondary">{lessonSummary(lesson, terminology)}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-fg-secondary">
                      {state ? <StateLabel state={state} /> : null}
                      <span>{lesson.estimatedMinutes} min</span>
                      {best !== null ? <span>Best challenge: {Math.round(best * 100)}%</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </PageContainer>
  );
}
