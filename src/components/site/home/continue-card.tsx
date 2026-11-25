import Link from 'next/link';
import { Badge, ProgressBar } from '@/components/ui';
import { buttonClasses } from '../button-link';
import { IconArrowRight } from '../icons';
import { strandColour } from '../strand-colour';
import { STRAND_NAMES } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import { STEP_LABELS, lessonHref, lessonTitle, unitTitle, type NextLesson } from '@/progress-view';
import { STEP_ORDER } from '@/lesson/vocab';

/** The big card at the top of the dashboard: the next lesson, with a bar across its six steps when it is under way. */
export function ContinueCard({ next, terminology }: { next: NextLesson; terminology: Terminology }) {
  const { lesson } = next;
  const colour = strandColour(lesson.strand);
  const inProgress = next.state === 'in-progress';
  const stepNumber = next.resumeStep ? STEP_ORDER.indexOf(next.resumeStep) + 1 : 1;
  return (
    <section
      aria-labelledby="continue-title"
      className="relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-border-subtle p-6 shadow-lg"
      style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${colour} 30%, var(--surface)), var(--surface) 75%)` }}
    >
      <span aria-hidden="true" className="absolute -right-10 -top-10 size-40 rounded-full opacity-30 blur-2xl" style={{ background: colour }} />
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-extrabold uppercase tracking-wider text-fg">{inProgress ? 'Continue' : 'Up next'}</p>
        <span aria-hidden="true" className="size-1 rounded-full bg-fg-secondary" />
        <p className="text-sm font-semibold text-fg-secondary">
          {unitTitle(lesson.grade, lesson.unit)} · {STRAND_NAMES[lesson.strand]}
        </p>
      </div>
      <div className="relative flex flex-col gap-2">
        <h2 id="continue-title" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {lessonTitle(lesson, terminology)}
          {lesson.status === 'draft' ? <Badge tone="warning">Draft</Badge> : null}
        </h2>
        {inProgress ? (
          <>
            <ProgressBar value={next.fraction} strand={lesson.strand} aria-label="Lesson progress across its six steps" />
            <p className="text-sm font-semibold text-fg-secondary">
              Step {stepNumber} of {STEP_ORDER.length}: {next.resumeStep ? STEP_LABELS[next.resumeStep] : ''}
            </p>
          </>
        ) : (
          <p className="text-fg-secondary">{lesson.estimatedMinutes} minutes, six short steps.</p>
        )}
      </div>
      <Link href={lessonHref(lesson)} className={buttonClasses('primary', 'lg', 'relative w-full sm:w-auto sm:self-start')}>
        {inProgress ? 'Continue lesson' : 'Start lesson'}
        <IconArrowRight width={20} height={20} />
      </Link>
    </section>
  );
}
