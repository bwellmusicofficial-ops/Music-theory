'use client';

import Link from 'next/link';
import { Badge, Button, Card, ProgressBar } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import { RichTextView, makeGlossaryLookup, type GlossarySource } from '@/lesson/player';
import { useMemo } from 'react';
import { BAND_LABEL, type MockBand, type MockResult, type QuestionResult } from '../engine';
import { duration, marks, percent, plural, skillLabel } from '../format';
import type { MockConfig } from '../schema';

export interface LessonLink {
  id: string;
  title: string;
}

export interface ResultsScreenProps {
  config: MockConfig;
  result: MockResult;
  lessons: readonly LessonLink[];
  terminology: Terminology;
  glossary: GlossarySource;
  onReview: (index: number) => void;
  onRetry: () => void;
}

const BAND_TONE: Record<MockBand, 'success' | 'accent' | 'warning'> = {
  distinction: 'success',
  merit: 'success',
  pass: 'accent',
  'not-yet': 'warning',
};

const BAND_LINE: Record<MockBand, string> = {
  distinction: 'Excellent work.',
  merit: 'Well done, a strong result.',
  pass: 'You passed this practice paper.',
  'not-yet': 'Not there yet. The skills below are the best place to start.',
};

export function statusOf(q: Pick<QuestionResult, 'answered' | 'correct'>): { label: string; symbol: string } {
  if (!q.answered) return { label: 'Not answered', symbol: '–' };
  return q.correct ? { label: 'Correct', symbol: '✓' } : { label: 'Not correct', symbol: '✗' };
}

export function ResultsScreen({ config, result, lessons, onReview, onRetry }: ResultsScreenProps) {
  const titleOf = useMemo(() => new Map(lessons.map((l) => [l.id, l.title])), [lessons]);
  const { score } = result;
  const strandOf = (id: string) => result.sections.find((x) => x.id === id)?.strand;

  return (
    <div className="flex flex-1 flex-col gap-6 py-6" data-testid="mock-results">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-muted">{config.title}: result</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          <span data-testid="score">
            {marks(score.points)} out of {score.total}
          </span>
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge tone={BAND_TONE[result.band]} className="px-4 py-1 text-base" data-testid="band">
            {BAND_LABEL[result.band]}
          </Badge>
          <span className="text-xl font-bold tabular-nums" data-testid="percent">
            {percent(score.fraction)}
          </span>
        </div>
        <p className="mt-3 text-fg-secondary">
          {BAND_LINE[result.band]} Pass mark {percent(config.passMark)}, merit {percent(config.meritMark)},
          distinction {percent(config.distinctionMark)}.
        </p>
        {result.timedOut ? (
          <p role="note" className="mt-3 rounded-md border border-warning p-3 text-fg-secondary" data-testid="timed-out">
            Time ran out, so the test was handed in for you. Unanswered questions count as wrong.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">Finished in {duration(result.elapsedMs)}.</p>
        )}
      </div>

      <section aria-labelledby="mock-sections" className="flex flex-col gap-3">
        <h2 id="mock-sections" className="text-xl font-bold">
          By section
        </h2>
        <ul className="flex flex-col gap-3">
          {result.sections.map((s) => (
            <li key={s.id} data-testid={`section-${s.id}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{s.title}</span>
                <span className="tabular-nums text-fg-secondary">
                  {marks(s.points)} of {s.total} ({percent(s.fraction)})
                </span>
              </div>
              <ProgressBar value={s.fraction} strand={strandOf(s.id)} aria-label={`${s.title} score`} className="mt-1" />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mock-weakest" className="flex flex-col gap-3">
        <h2 id="mock-weakest" className="text-xl font-bold">
          Skills to work on
        </h2>
        {result.weakest.length === 0 ? (
          <p className="text-fg-secondary">You got every question right, so there is nothing to work on.</p>
        ) : (
          <ol className="flex flex-col gap-3" data-testid="weakest">
            {result.weakest.map((w) => (
              <li key={w.skill}>
                <Card padding="md">
                  <p className="font-bold">{skillLabel(w.skill)}</p>
                  <p className="text-sm text-fg-secondary">
                    {w.correct} of {plural(w.total, 'question')} right
                  </p>
                  {w.lessonIds.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {w.lessonIds.map((id) => (
                        <li key={id}>
                          <Link
                            href={`/lessons/${id}`}
                            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4"
                          >
                            Lesson: {titleOf.get(id) ?? id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">There is no lesson for this skill yet.</p>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="mock-review" className="flex flex-col gap-3">
        <h2 id="mock-review" className="text-xl font-bold">
          Review your answers
        </h2>
        <ol className="flex flex-col gap-2" data-testid="review-list">
          {result.questions.map((q) => {
            const st = statusOf(q);
            return (
              <li key={q.index}>
                <button
                  type="button"
                  onClick={() => onReview(q.index)}
                  className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-border-subtle bg-surface px-3 py-2 text-left hover:border-accent"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-sm font-bold">
                    <span className="sr-only">Question </span>
                    {q.index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg-secondary">{skillLabel(q.skill)}</span>
                    <span className={`block font-semibold ${q.correct ? 'text-success' : q.answered ? 'text-danger' : 'text-fg-secondary'}`}>
                      <span aria-hidden="true">{st.symbol} </span>
                      {st.label}
                    </span>
                  </span>
                  <span className="text-accent">
                    Review<span aria-hidden="true"> &rsaquo;</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-col gap-3 pb-6 sm:flex-row">
        <Button size="lg" onClick={onRetry}>
          Take another paper
        </Button>
        <Link
          href="/mock"
          className="inline-flex min-h-14 items-center justify-center rounded-lg border border-border bg-surface-raised px-7 text-lg font-semibold text-fg hover:bg-surface"
        >
          All mock tests
        </Link>
      </div>
    </div>
  );
}

export interface ReviewHeaderProps {
  result: MockResult;
  index: number;
  terminology: Terminology;
  glossary: GlossarySource;
}

/** Above the locked question in the review: its number, outcome and the reason. */
export function ReviewHeader({ result, index }: Pick<ReviewHeaderProps, 'result' | 'index'>) {
  const q = result.questions[index];
  const section = result.sections.find((s) => s.id === q.sectionId);
  const st = statusOf(q);
  return (
    <div className="flex flex-col gap-1 pt-4 pb-3" data-testid="review-header">
      <h1 className="text-sm font-bold uppercase tracking-wide text-muted">
        Review: question {index + 1} of {result.questions.length}
        {q.flagged ? ' (flagged)' : ''}
      </h1>
      <p className="text-sm text-fg-secondary">
        {section ? `${section.title}. ` : ''}Skill: {skillLabel(q.skill)}
      </p>
      <p
        className={`text-xl font-extrabold ${q.correct ? 'text-success' : q.answered ? 'text-danger' : 'text-fg-secondary'}`}
        data-testid="review-status"
      >
        <span aria-hidden="true">{st.symbol} </span>
        {st.label}
      </p>
    </div>
  );
}

export function ReviewExplanation({
  result,
  index,
  terminology,
  glossary,
}: ReviewHeaderProps) {
  const lookup = useMemo(() => makeGlossaryLookup(glossary), [glossary]);
  const q = result.questions[index];
  return (
    <div className="mt-4 rounded-lg border-2 border-border-subtle bg-surface p-4" data-testid="review-explanation">
      {q.correct ? (
        <p className="font-semibold">Correct. Your answer is the one marked above.</p>
      ) : (
        <>
          <p className="font-semibold">
            {q.answered ? 'Your answer was not right.' : 'You did not answer this question.'} The correct answer is
            marked above.
          </p>
          {q.answered && q.reason ? (
            <p className="mt-2 text-fg-secondary" data-testid="review-reason">
              <RichTextView text={q.reason} terminology={terminology} glossary={lookup} />
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
