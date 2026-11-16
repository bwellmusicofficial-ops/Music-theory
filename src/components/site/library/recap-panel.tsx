'use client';

import { useMemo } from 'react';
import type { Terminology } from '@/engine/types';
import { makeGlossaryLookup, type GlossarySource } from '@/lesson/player';
import { orderRecaps, type GlossaryItem, type LessonMeta, type ProgressMap, type RecapCardData } from '@/progress-view';
import type { GlossaryEntry } from '@/lesson/schema';
import { Skeleton } from '../skeleton';
import { RecapCard } from './recap-card';

/** One card per lesson, from its recap step: the learner's completed lessons first. */
export function RecapPanel({
  lessons,
  cards,
  glossary,
  progress,
  terminology,
}: {
  lessons: readonly LessonMeta[];
  cards: readonly RecapCardData[];
  glossary: readonly GlossaryItem[];
  /** Undefined until progress has loaded. */
  progress?: ProgressMap;
  terminology: Terminology;
}) {
  const source: GlossarySource = useMemo(() => makeGlossaryLookup(glossary as readonly GlossaryEntry[]), [glossary]);
  const rows = useMemo(() => (progress ? orderRecaps(lessons, cards, progress) : []), [lessons, cards, progress]);

  if (!progress) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only">Loading your recap cards</span>
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-border-subtle bg-surface p-5 text-fg-secondary">No recap cards are available yet.</p>;
  }
  const earned = rows.filter((r) => r.earned);
  const rest = rows.filter((r) => !r.earned);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="recap-earned" className="flex flex-col gap-4">
        <h2 id="recap-earned" className="text-xl font-extrabold">
          Your cards ({earned.length})
        </h2>
        {earned.length === 0 ? (
          <p className="rounded-2xl border border-border-subtle bg-surface p-5 text-fg-secondary">
            Finish a lesson and its recap card lands here, ready to revise from. Cards still to earn are below.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {earned.map((row) => (
              <RecapCard key={row.lesson.id} row={row} glossary={source} terminology={terminology} />
            ))}
          </div>
        )}
      </section>
      {rest.length > 0 ? (
        <section aria-labelledby="recap-rest" className="flex flex-col gap-4">
          <h2 id="recap-rest" className="text-xl font-extrabold">
            Still to earn ({rest.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {rest.map((row) => (
              <RecapCard key={row.lesson.id} row={row} glossary={source} terminology={terminology} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
