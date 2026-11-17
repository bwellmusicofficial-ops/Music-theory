'use client';

import { useMemo } from 'react';
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
export function HomeView({ lessons }: { lessons: readonly LessonMeta[] }) {
  const stored = useStoredProgress();
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
        <Welcome startHref={startHref} />
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
      <div className="lg:col-span-2 lg:[&>div]:gap-6">
        <PracticeCards bests={bests} />
      </div>
    </PageContainer>
  );
}
