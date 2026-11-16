'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/components/ui/cn';
import { useSettings } from '@/settings';
import type { GlossaryItem, LessonMeta, RecapCardData } from '@/progress-view';
import { useStoredProgress } from '@/progress-view/hooks';
import { PageContainer, PageTitle } from '../page-container';
import { Skeleton } from '../skeleton';
import { GlossaryPanel } from './glossary-panel';
import { LessonsPanel } from './lessons-panel';
import { RecapPanel } from './recap-panel';

const TABS = [
  { id: 'lessons', label: 'Lessons' },
  { id: 'recap', label: 'Recap cards' },
  { id: 'glossary', label: 'Glossary' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function parseTab(value: string | null | undefined): TabId {
  return TABS.find((t) => t.id === value)?.id ?? 'lessons';
}

export interface LibraryData {
  lessons: readonly LessonMeta[];
  recaps: readonly RecapCardData[];
  glossary: readonly GlossaryItem[];
}

function Library({ lessons, recaps, glossary }: LibraryData) {
  const params = useSearchParams();
  const router = useRouter();
  const urlTab = parseTab(params.get('tab'));
  const [tab, setTab] = useState<TabId>(urlTab);
  const [seenUrlTab, setSeenUrlTab] = useState<TabId>(urlTab);
  // When the address changes tab (a link to /library?tab=glossary#adagio), follow it.
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    setTab(urlTab);
  }
  const stored = useStoredProgress();
  const { settings } = useSettings();
  const terminology = settings.terminology;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function choose(next: TabId) {
    setTab(next);
    setSeenUrlTab(next);
    router.replace(`/library?tab=${next}`, { scroll: false });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    let to = -1;
    if (e.key === 'ArrowRight') to = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') to = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = TABS.length - 1;
    if (to < 0) return;
    e.preventDefault();
    const next = TABS[to]!.id;
    choose(next);
    refs.current[next]?.focus();
  }

  return (
    <PageContainer width="lg">
      <PageTitle title="Library" eyebrow="Look things up">
        Every lesson, recap card and glossary term in one place.
      </PageTitle>
      <div role="tablist" aria-label="Library sections" onKeyDown={onKeyDown} className="grid grid-cols-3 gap-1 rounded-full border border-border-subtle bg-surface p-1">
        {TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              id={`library-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`library-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(t.id)}
              className={cn(
                'min-h-11 cursor-pointer rounded-full px-2 text-sm font-bold',
                selected ? 'bg-accent text-on-accent shadow-md' : 'text-fg-secondary hover:bg-surface-raised hover:text-fg',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`library-panel-${tab}`} aria-labelledby={`library-tab-${tab}`} tabIndex={-1}>
        {tab === 'lessons' ? (
          <LessonsPanel lessons={lessons} progress={stored.status === 'ready' ? stored.progress : undefined} terminology={terminology} />
        ) : null}
        {tab === 'recap' ? (
          <RecapPanel lessons={lessons} cards={recaps} glossary={glossary} progress={stored.status === 'ready' ? stored.progress : undefined} terminology={terminology} />
        ) : null}
        {tab === 'glossary' ? <GlossaryPanel entries={glossary} terminology={terminology} /> : null}
      </div>
    </PageContainer>
  );
}

function LibraryFallback() {
  return (
    <PageContainer width="lg">
      <PageTitle title="Library" eyebrow="Look things up" />
      <Skeleton className="h-14 rounded-full" />
      <Skeleton className="h-12 rounded-full" />
      <Skeleton className="h-40 rounded-2xl" />
    </PageContainer>
  );
}

/** The library: Lessons, Recap cards and Glossary. The tab lives in the address (`?tab=glossary`). */
export function LibraryView(props: LibraryData) {
  return (
    <Suspense fallback={<LibraryFallback />}>
      <Library {...props} />
    </Suspense>
  );
}
