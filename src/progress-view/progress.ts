import type { LessonProgress, LessonState } from '@/lesson/contracts';
import { STEP_ORDER, STRANDS, type StepId, type Strand } from '@/lesson/vocab';
import { INCLUDE_DRAFTS_IN_PATH } from './config';
import type { CourseGrade, CourseUnit, LessonMeta } from './course';

export type ProgressMap = ReadonlyMap<string, LessonProgress>;

export interface PathOptions {
  /** Defaults to `INCLUDE_DRAFTS_IN_PATH`. */
  includeDrafts?: boolean;
}

export const STATE_LABELS: Record<LessonState, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
  mastered: 'Mastered',
};

export const STEP_LABELS: Record<StepId, string> = {
  hook: 'Hook',
  explore: 'Explore',
  name: 'Name it',
  practice: 'Practice',
  challenge: 'Challenge',
  recap: 'Recap',
};

export function toProgressMap(list: readonly LessonProgress[]): ProgressMap {
  return new Map(list.map((p) => [p.lessonId, p]));
}

export function lessonState(map: ProgressMap, lessonId: string): LessonState {
  return map.get(lessonId)?.state ?? 'not-started';
}

export function isDone(state: LessonState): boolean {
  return state === 'complete' || state === 'mastered';
}

/**
 * The lessons that make up the learner's path. With drafts included, every
 * lesson. Without, reviewed lessons only, unless there are none (the path
 * then falls back to everything so that it is never empty).
 */
export function pathLessons<T extends Pick<LessonMeta, 'status'>>(lessons: readonly T[], options: PathOptions = {}): T[] {
  const includeDrafts = options.includeDrafts ?? INCLUDE_DRAFTS_IN_PATH;
  if (includeDrafts) return [...lessons];
  const reviewed = lessons.filter((l) => l.status === 'reviewed');
  return reviewed.length > 0 ? reviewed : [...lessons];
}

export interface Completion {
  done: number;
  total: number;
  /** Whole number, 0..100. */
  percent: number;
}

export function completion(lessons: readonly LessonMeta[], map: ProgressMap, options: PathOptions = {}): Completion {
  const path = pathLessons(lessons, options);
  const done = path.filter((l) => isDone(lessonState(map, l.id))).length;
  return { done, total: path.length, percent: path.length === 0 ? 0 : Math.round((done / path.length) * 100) };
}

export function unitCompletion(unit: Pick<CourseUnit, 'lessons'>, map: ProgressMap, options: PathOptions = {}): Completion {
  return completion(unit.lessons, map, options);
}

export function gradeCompletion(grade: Pick<CourseGrade, 'units'>, map: ProgressMap, options: PathOptions = {}): Completion {
  return completion(
    grade.units.flatMap((u) => u.lessons),
    map,
    options,
  );
}

/** How far through its six steps a lesson is, 0..1: the steps finished before the one to resume at. */
export function stepFraction(progress: Pick<LessonProgress, 'step' | 'state'> | undefined): number {
  if (!progress) return 0;
  if (isDone(progress.state)) return 1;
  return STEP_ORDER.indexOf(progress.step) / STEP_ORDER.length;
}

export interface NextLesson {
  lesson: LessonMeta;
  state: LessonState;
  /** The step to resume at, when the lesson is in progress. */
  resumeStep: StepId | null;
  /** 0..1 across the six steps; 0 when not started. */
  fraction: number;
}

/**
 * The "continue" target: the first lesson in teaching order that is in
 * progress, else the first that is not started. Null when every lesson on the
 * path is complete (or there are none).
 */
export function nextLesson(lessons: readonly LessonMeta[], map: ProgressMap, options: PathOptions = {}): NextLesson | null {
  const path = pathLessons(lessons, options);
  const pick =
    path.find((l) => lessonState(map, l.id) === 'in-progress') ?? path.find((l) => lessonState(map, l.id) === 'not-started');
  if (!pick) return null;
  const progress = map.get(pick.id);
  const state = lessonState(map, pick.id);
  return {
    lesson: pick,
    state,
    resumeStep: state === 'in-progress' && progress ? progress.step : null,
    fraction: state === 'in-progress' ? stepFraction(progress) : 0,
  };
}

export interface JourneyPosition extends Completion {
  /** 1-based place of the current lesson on the path; the last lesson's place when finished. 0 when the path is empty. */
  lessonNumber: number;
  currentLessonId: string | null;
  finished: boolean;
}

export function journeyPosition(lessons: readonly LessonMeta[], map: ProgressMap, options: PathOptions = {}): JourneyPosition {
  const path = pathLessons(lessons, options);
  const base = completion(lessons, map, options);
  const next = nextLesson(lessons, map, options);
  const index = next ? path.findIndex((l) => l.id === next.lesson.id) : -1;
  return {
    ...base,
    lessonNumber: next ? index + 1 : path.length,
    currentLessonId: next?.lesson.id ?? null,
    finished: path.length > 0 && next === null,
  };
}

export interface StrandMeter {
  strand: Strand;
  done: number;
  total: number;
  /** 0..1 */
  fraction: number;
  percent: number;
}

/** Share of each strand's lessons complete, in strand order, for the strands that have lessons. */
export function strandProgress(lessons: readonly LessonMeta[], map: ProgressMap, options: PathOptions = {}): StrandMeter[] {
  const path = pathLessons(lessons, options);
  return STRANDS.flatMap((strand) => {
    const mine = path.filter((l) => l.strand === strand);
    if (mine.length === 0) return [];
    const done = mine.filter((l) => isDone(lessonState(map, l.id))).length;
    return [{ strand, done, total: mine.length, fraction: done / mine.length, percent: Math.round((done / mine.length) * 100) }];
  });
}

export interface RecentLesson {
  lesson: LessonMeta;
  state: LessonState;
  updatedAt: string;
}

/** Lessons the learner has opened, most recently touched first. */
export function recentlyOpened(lessons: readonly LessonMeta[], map: ProgressMap, limit = 3): RecentLesson[] {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const rows: RecentLesson[] = [];
  for (const p of map.values()) {
    const lesson = byId.get(p.lessonId);
    if (!lesson || p.state === 'not-started') continue;
    if (Number.isNaN(Date.parse(p.updatedAt))) continue;
    rows.push({ lesson, state: p.state, updatedAt: p.updatedAt });
  }
  rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.lesson.id.localeCompare(b.lesson.id));
  return rows.slice(0, Math.max(0, limit));
}

/** True when anything is stored: a lesson that has been opened, or an answer given. */
export function hasAnyProgress(map: ProgressMap, attemptCount: number): boolean {
  if (attemptCount > 0) return true;
  for (const p of map.values()) if (p.state !== 'not-started') return true;
  return false;
}
