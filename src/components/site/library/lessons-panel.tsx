'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, STRAND_NAMES } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import type { Grade, Strand } from '@/lesson/schema';
import {
  filterLessons,
  filterOptions,
  gradeTitle,
  lessonHref,
  lessonState,
  lessonSummary,
  lessonTitle,
  NO_LESSON_FILTER,
  type LessonMeta,
  type ProgressMap,
} from '@/progress-view';
import { StateLabel, StateMark } from '../state-mark';
import { strandColour } from '../strand-colour';
import { FilterChip } from './filter-chip';
import { SearchField } from './search-field';

/** Every lesson, filterable by grade and strand and searchable by title and summary. */
export function LessonsPanel({ lessons, progress, terminology }: { lessons: readonly LessonMeta[]; progress?: ProgressMap; terminology: Terminology }) {
  const [filter, setFilter] = useState(NO_LESSON_FILTER);
  const options = useMemo(() => filterOptions(lessons), [lessons]);
  const shown = useMemo(() => filterLessons(lessons, filter), [lessons, filter]);
  const filtered = filter.grade !== 'all' || filter.strand !== 'all' || filter.query !== '';

  return (
    <div className="flex flex-col gap-4">
      <SearchField label="Search lessons" placeholder="Search lessons" value={filter.query} onChange={(query) => setFilter((f) => ({ ...f, query }))} />
      <div role="group" aria-label="Filter by grade" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip pressed={filter.grade === 'all'} onClick={() => setFilter((f) => ({ ...f, grade: 'all' }))}>
          All grades
        </FilterChip>
        {options.grades.map((g: Grade) => (
          <FilterChip key={g} pressed={filter.grade === g} onClick={() => setFilter((f) => ({ ...f, grade: g }))}>
            {gradeTitle(g)}
          </FilterChip>
        ))}
      </div>
      <div role="group" aria-label="Filter by strand" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip pressed={filter.strand === 'all'} onClick={() => setFilter((f) => ({ ...f, strand: 'all' }))}>
          All strands
        </FilterChip>
        {options.strands.map((s: Strand) => (
          <FilterChip key={s} pressed={filter.strand === s} onClick={() => setFilter((f) => ({ ...f, strand: s }))}>
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: strandColour(s) }} />
            {STRAND_NAMES[s]}
          </FilterChip>
        ))}
      </div>

      <p role="status" className="text-sm font-semibold text-fg-secondary">
        {shown.length === 1 ? '1 lesson' : `${shown.length} lessons`}
        {filtered ? ' match' : ''}
      </p>

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-5">
          <p className="text-fg-secondary">{lessons.length === 0 ? 'No lessons are available yet.' : 'No lessons match. Try fewer words or clear the filters.'}</p>
          {lessons.length > 0 ? (
            <button
              type="button"
              onClick={() => setFilter(NO_LESSON_FILTER)}
              className="min-h-11 cursor-pointer rounded-full border border-border bg-surface-raised px-4 text-sm font-semibold hover:bg-border-subtle"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((lesson) => {
            const state = progress ? lessonState(progress, lesson.id) : undefined;
            return (
              <li key={lesson.id}>
                <Link href={lessonHref(lesson)} className="flex items-start gap-4 rounded-2xl border border-border-subtle bg-surface p-4 shadow-md hover:border-border">
                  <StateMark state={state} strand={lesson.strand} size="sm" number={lesson.order} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold leading-snug">{lessonTitle(lesson, terminology)}</span>
                      {lesson.status === 'draft' ? <Badge tone="warning">Draft</Badge> : null}
                    </span>
                    <span className="text-sm text-fg-secondary">{lessonSummary(lesson, terminology)}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-semibold text-fg-secondary">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: strandColour(lesson.strand) }} />
                        {STRAND_NAMES[lesson.strand]}
                      </span>
                      <span>{gradeTitle(lesson.grade)}</span>
                      {state ? <StateLabel state={state} className="text-xs" /> : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
