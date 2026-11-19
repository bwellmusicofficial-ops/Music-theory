'use client';

import { useMemo, useState } from 'react';
import { useSettings } from '@/settings';
import {
  buildCourse,
  hasAnyProgress,
  journeyPosition,
  nextLesson,
  recentlyOpened,
  strandProgress,
  streak as streakOf,
  weakestSkills,
  weekSummary,
  type LessonMeta,
} from '@/progress-view';
import { useBests, useStoredProgress } from '@/progress-view/hooks';
import { GAMES } from '../games';
import { PageContainer } from '../page-container';
import { ContinueCard } from './continue-card';
import { FinishedCard } from './finished-card';
import { LazyLandingDemo } from '../landing-demo/lazy';
import type { LandingDemoContent } from '../landing-demo/content';
import { HomeSkeleton } from './home-skeleton';
import { JourneyCard } from './journey-card';
import { PracticeCards } from './practice-cards';
import { RecentLessons } from './recent-lessons';
import { StrandMeters } from './strand-meters';
import { WeekCard } from './week-card';
import { Welcome } from './welcome';
import { WorthAnotherLook } from './worth-another-look';

/**
 * The home page: a welcome for someone new, a dashboard for someone who has
 * started. Progress is read after mount; until then a skeleton shows, so there
 * is no flash of the wrong one and no hydration mismatch.
 */
export function HomeView({ lessons, demo }: { lessons: readonly LessonMeta[]; demo?: LandingDemoContent }) {
  const stored = useStoredProgress();
  // While the demo's finish card shows, the page's own "Start here" buttons would duplicate it, so they step aside.
  const [demoFinished, setDemoFinished] = useState(false);
  const bests = useBests(GAMES);
  const { settings } = useSettings();
  const course = useMemo(() => buildCourse(lessons), [lessons]);
  const startHref = useMemo(() => {
    const first = lessons.find((l) => l.grade === 'start') ?? lessons[0];
    return first ? `/lessons/${first.id}` : '/learn';
  }, [lessons]);

  if (stored.status === 'loading') {
    return (
      <PageContainer>
        <HomeSkeleton />
      </PageContainer>
    );
  }

  const { progress, attempts, now } = stored;
  if (!hasAnyProgress(progress, attempts.length)) {
    return (
      <PageContainer className="gap-6">
        <Welcome
          startHref={startHref}
          hideActions={demoFinished}
          demo={demo ? <LazyLandingDemo content={demo} startHref={startHref} defaultOpen onFinishChange={setDemoFinished} /> : undefined}
        />
        <PracticeCards bests={bests} />
      </PageContainer>
    );
  }

  const terminology = settings.terminology;
  const next = nextLesson(lessons, progress);
  return (
    // One column on a phone. From 1024px: the page widens to two columns, with the
    // heading and the practice cards spanning both.
    <PageContainer className="lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:col-span-2">Welcome back</h1>
      <div className="flex min-w-0 flex-col gap-6">
        {next ? <ContinueCard next={next} terminology={terminology} /> : <FinishedCard />}
        <WeekCard week={weekSummary(attempts, now)} streak={streakOf(attempts, now)} />
        <JourneyCard course={course} journey={journeyPosition(lessons, progress)} progress={progress} />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <StrandMeters meters={strandProgress(lessons, progress)} />
        <WorthAnotherLook skills={weakestSkills(attempts, lessons)} terminology={terminology} />
        <RecentLessons rows={recentlyOpened(lessons, progress, 3)} terminology={terminology} />
      </div>
      {demo ? (
        // A returning learner's way back in stays first; the demo is a slim card further down.
        <div className="lg:col-span-2">
          <LazyLandingDemo content={demo} startHref={startHref} defaultOpen={false} />
        </div>
      ) : null}
      <div className="lg:col-span-2 lg:[&>div]:gap-6">
        <PracticeCards bests={bests} />
      </div>
    </PageContainer>
  );
}
