import { describe, expect, it } from 'vitest';
import {
  buildCourse,
  comingSoonGrades,
  completion,
  findUnit,
  gradeCompletion,
  hasAnyProgress,
  journeyPosition,
  lessonHref,
  lessonState,
  lessonSummary,
  lessonTitle,
  nextLesson,
  pathLessons,
  recentlyOpened,
  stepFraction,
  strandProgress,
  toProgressMap,
  unitCompletion,
  unitCovers,
  unitHref,
} from './index';
import { attempt, meta, prog, sampleLessons } from './test-fixtures';

const map = (...rows: ReturnType<typeof prog>[]) => toProgressMap(rows);

describe('course structure', () => {
  const course = buildCourse(sampleLessons());

  it('groups grades, units and lessons in the order given', () => {
    expect(course.map((g) => g.grade)).toEqual(['start', '1']);
    expect(course[0]!.title).toBe('Start here');
    expect(course[1]!.title).toBe('Grade 1');
    expect(course[1]!.units.map((u) => u.id)).toEqual(['rhythm-1', 'pitch-1']);
    expect(course[1]!.units[0]!.lessons.map((l) => l.id)).toEqual(['g1', 'g2']);
  });

  it('titles a unit from the title map and takes its strand from its first lesson', () => {
    expect(course[1]!.units[0]!.title).toBe('Note values and time');
    expect(course[1]!.units[1]!.strand).toBe('pitch');
    const odd = buildCourse([meta('x', { unit: 'harmony-1', order: 2, strand: 'harmony' }), meta('y', { unit: 'harmony-1', order: 1, strand: 'intervals' })]);
    expect(odd[0]!.units[0]!.strand).toBe('intervals');
  });

  it('falls back to a derived title for a unit with no entry', () => {
    expect(buildCourse([meta('x', { unit: 'chords-7' })])[0]!.units[0]!.title).toBe('Chords 7');
  });

  it('finds units and builds links', () => {
    expect(findUnit(course, '1', 'pitch-1')?.id).toBe('pitch-1');
    expect(findUnit(course, '1', 'nope')).toBeUndefined();
    expect(findUnit(course, '9', 'pitch-1')).toBeUndefined();
    expect(unitHref(course[1]!.units[0]!)).toBe('/learn/1/rhythm-1');
    expect(lessonHref({ id: 'g1' })).toBe('/lessons/g1');
  });

  it('lists the later grades as coming soon, with a summary each', () => {
    const soon = comingSoonGrades(course);
    expect(soon.map((g) => g.grade)).toEqual(['2', '3', '4', '5', '6', '7', '8']);
    expect(soon[0]).toEqual({ grade: '2', title: 'Grade 2', summary: 'More keys, minor scales, triplets and new time signatures.' });
    expect(soon[6]!.summary).toBe('Advanced harmony, modulation and composition.');
    expect(comingSoonGrades(buildCourse([meta('x', { grade: '2' })])).map((g) => g.grade)).toEqual(['3', '4', '5', '6', '7', '8']);
  });

  it('swaps in US titles and summaries only for US', () => {
    const l = meta('x', { title: 'Quavers', usTitle: 'Eighth notes', summary: 'Quavers.', usSummary: 'Eighth notes.' });
    expect(lessonTitle(l, 'uk')).toBe('Quavers');
    expect(lessonTitle(l, 'us')).toBe('Eighth notes');
    expect(lessonSummary(l, 'us')).toBe('Eighth notes.');
    expect(lessonTitle(meta('y'), 'us')).toBe('Title y');
  });

  it('says what a unit covers from its lesson titles, never inventing', () => {
    const unit = course[1]!.units[1]!;
    expect(unitCovers(unit, 'uk')).toBe('Covers: Title g3; Title g4.');
    expect(unitCovers({ lessons: [] }, 'uk')).toBe('');
  });
});

describe('lesson state and completion', () => {
  const lessons = sampleLessons();
  const course = buildCourse(lessons);

  it('defaults to not started', () => {
    expect(lessonState(map(), 's1')).toBe('not-started');
    expect(lessonState(map(prog('s1', 'mastered')), 's1')).toBe('mastered');
  });

  it('counts complete and mastered, per unit, grade and overall', () => {
    const m = map(prog('s1', 'complete'), prog('s2', 'mastered'), prog('g1', 'complete'), prog('g2', 'in-progress'));
    expect(unitCompletion(course[0]!.units[0]!, m)).toEqual({ done: 2, total: 2, percent: 100 });
    expect(unitCompletion(course[1]!.units[0]!, m)).toEqual({ done: 1, total: 2, percent: 50 });
    expect(gradeCompletion(course[1]!, m)).toEqual({ done: 1, total: 4, percent: 25 });
    expect(completion(lessons, m)).toEqual({ done: 3, total: 6, percent: 50 });
  });

  it('rounds and handles an empty list', () => {
    expect(completion(lessons, map(prog('s1', 'complete')))).toEqual({ done: 1, total: 6, percent: 17 });
    expect(completion([], map())).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('ignores progress for lessons that no longer exist', () => {
    expect(completion(lessons, map(prog('gone', 'complete'))).done).toBe(0);
  });

  it('measures how far through the six steps an in-progress lesson is', () => {
    expect(stepFraction(undefined)).toBe(0);
    expect(stepFraction(prog('a', 'in-progress', { step: 'hook' }))).toBe(0);
    expect(stepFraction(prog('a', 'in-progress', { step: 'practice' }))).toBe(0.5);
    expect(stepFraction(prog('a', 'in-progress', { step: 'recap' }))).toBeCloseTo(5 / 6);
    expect(stepFraction(prog('a', 'complete', { step: 'recap' }))).toBe(1);
  });
});

describe('the path and drafts', () => {
  const lessons = sampleLessons(); // s1 reviewed, the rest drafts

  it('includes drafts by default and with includeDrafts', () => {
    expect(pathLessons(lessons).map((l) => l.id)).toHaveLength(6);
    expect(pathLessons(lessons, { includeDrafts: true })).toHaveLength(6);
  });

  it('keeps only reviewed lessons when drafts are off, falling back to all if none is reviewed', () => {
    expect(pathLessons(lessons, { includeDrafts: false }).map((l) => l.id)).toEqual(['s1']);
    const allDrafts = lessons.map((l) => ({ ...l, status: 'draft' as const }));
    expect(pathLessons(allDrafts, { includeDrafts: false })).toHaveLength(6);
  });

  it('never continues at a draft while a reviewed lesson is available, when drafts are off', () => {
    const m = map(prog('g1', 'in-progress'));
    expect(nextLesson(lessons, m, { includeDrafts: false })?.lesson.id).toBe('s1');
    expect(nextLesson(lessons, m, { includeDrafts: true })?.lesson.id).toBe('g1');
  });

  it('measures percent over the reviewed lessons only when drafts are off', () => {
    const m = map(prog('s1', 'complete'));
    expect(completion(lessons, m, { includeDrafts: false })).toEqual({ done: 1, total: 1, percent: 100 });
    expect(nextLesson(lessons, m, { includeDrafts: false })).toBeNull();
    expect(journeyPosition(lessons, m, { includeDrafts: false }).finished).toBe(true);
  });
});

describe('the recommended next lesson', () => {
  const lessons = sampleLessons();

  it('is the first lesson when nothing is started', () => {
    const next = nextLesson(lessons, map())!;
    expect(next.lesson.id).toBe('s1');
    expect(next.state).toBe('not-started');
    expect(next.fraction).toBe(0);
    expect(next.resumeStep).toBeNull();
  });

  it('is the first not-started lesson after completed ones', () => {
    expect(nextLesson(lessons, map(prog('s1', 'complete')))!.lesson.id).toBe('s2');
  });

  it('prefers an in-progress lesson, the first in teaching order, over earlier not-started ones', () => {
    const m = map(prog('g2', 'in-progress', { step: 'challenge' }), prog('g3', 'in-progress'), prog('s1', 'complete'));
    const next = nextLesson(lessons, m)!;
    expect(next.lesson.id).toBe('g2');
    expect(next.state).toBe('in-progress');
    expect(next.resumeStep).toBe('challenge');
    expect(next.fraction).toBeCloseTo(4 / 6);
  });

  it('skips past gaps: a later lesson complete does not hide an earlier unstarted one', () => {
    expect(nextLesson(lessons, map(prog('g1', 'complete')))!.lesson.id).toBe('s1');
  });

  it('is null when everything is complete or there are no lessons', () => {
    const all = map(...lessons.map((l) => prog(l.id, 'mastered')));
    expect(nextLesson(lessons, all)).toBeNull();
    expect(nextLesson([], map())).toBeNull();
  });
});

describe('journey position', () => {
  const lessons = sampleLessons();

  it('starts at lesson 1 with nothing done', () => {
    expect(journeyPosition(lessons, map())).toEqual({
      done: 0, total: 6, percent: 0, lessonNumber: 1, currentLessonId: 's1', finished: false,
    });
  });

  it('points at the current lesson', () => {
    const j = journeyPosition(lessons, map(prog('s1', 'complete'), prog('s2', 'complete'), prog('g1', 'complete')));
    expect(j).toMatchObject({ done: 3, percent: 50, lessonNumber: 4, currentLessonId: 'g2', finished: false });
  });

  it('is finished at the end, on the last lesson', () => {
    const j = journeyPosition(lessons, map(...lessons.map((l) => prog(l.id, 'complete'))));
    expect(j).toMatchObject({ done: 6, percent: 100, lessonNumber: 6, currentLessonId: null, finished: true });
  });

  it('copes with an empty course', () => {
    expect(journeyPosition([], map())).toMatchObject({ total: 0, lessonNumber: 0, finished: false });
  });
});

describe('strand progress', () => {
  it('shares complete lessons by strand, for strands that have lessons, in strand order', () => {
    const m = map(prog('s1', 'complete'), prog('g1', 'complete'), prog('g3', 'mastered'), prog('g4', 'in-progress'));
    expect(strandProgress(sampleLessons(), m)).toEqual([
      { strand: 'rhythm', done: 2, total: 4, fraction: 0.5, percent: 50 },
      { strand: 'pitch', done: 1, total: 2, fraction: 0.5, percent: 50 },
    ]);
  });

  it('is empty with no lessons', () => {
    expect(strandProgress([], map())).toEqual([]);
  });
});

describe('recently opened lessons', () => {
  const lessons = sampleLessons();

  it('lists opened lessons newest first, limited, leaving out untouched ones', () => {
    const m = map(
      prog('s1', 'complete', { updatedAt: '2026-11-01T10:00:00.000Z' }),
      prog('g1', 'in-progress', { updatedAt: '2026-11-12T10:00:00.000Z' }),
      prog('g3', 'complete', { updatedAt: '2026-11-10T10:00:00.000Z' }),
      prog('g4', 'not-started', { updatedAt: '2026-11-13T10:00:00.000Z' }),
      prog('gone', 'complete', { updatedAt: '2026-11-14T10:00:00.000Z' }),
      prog('s2', 'complete', { updatedAt: 'not a date' }),
    );
    expect(recentlyOpened(lessons, m, 3).map((r) => r.lesson.id)).toEqual(['g1', 'g3', 's1']);
    expect(recentlyOpened(lessons, m, 2)).toHaveLength(2);
    expect(recentlyOpened(lessons, m, 0)).toEqual([]);
    expect(recentlyOpened(lessons, map())).toEqual([]);
  });
});

describe('hasAnyProgress', () => {
  it('is false for nothing or only not-started rows, true for an opened lesson or an attempt', () => {
    expect(hasAnyProgress(map(), 0)).toBe(false);
    expect(hasAnyProgress(map(prog('s1', 'not-started')), 0)).toBe(false);
    expect(hasAnyProgress(map(prog('s1', 'in-progress')), 0)).toBe(true);
    expect(hasAnyProgress(map(), 1)).toBe(true);
    expect(attempt(new Date())).toBeTruthy();
  });
});
