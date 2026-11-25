import type { Lesson } from '@/lesson/schema';
import { GRADES, type Grade, type Strand } from '@/lesson/vocab';
import type { Terminology } from '@/engine/types';
import { GRADE_SUMMARIES, GRADE_TITLES, unitTitle } from './titles';

/** The part of a lesson the pages need. Small enough to hand to a client component. */
export type LessonMeta = Pick<
  Lesson,
  'id' | 'title' | 'summary' | 'usTitle' | 'usSummary' | 'grade' | 'unit' | 'order' | 'strand' | 'skills' | 'status' | 'estimatedMinutes'
>;

export function toLessonMeta(lesson: Lesson): LessonMeta {
  return {
    id: lesson.id,
    title: lesson.title,
    summary: lesson.summary,
    usTitle: lesson.usTitle,
    usSummary: lesson.usSummary,
    grade: lesson.grade,
    unit: lesson.unit,
    order: lesson.order,
    strand: lesson.strand,
    skills: lesson.skills,
    status: lesson.status,
    estimatedMinutes: lesson.estimatedMinutes,
  };
}

export interface CourseUnit {
  grade: Grade;
  id: string;
  title: string;
  /** The strand of the unit's first lesson. */
  strand: Strand;
  lessons: LessonMeta[];
}

export interface CourseGrade {
  grade: Grade;
  title: string;
  units: CourseUnit[];
}

export interface ComingSoonGrade {
  grade: Grade;
  title: string;
  summary: string;
}

/** Grades, units and lessons in the order given (teaching order, as `listLessons` returns). */
export function buildCourse(lessons: readonly LessonMeta[]): CourseGrade[] {
  const grades: CourseGrade[] = [];
  for (const lesson of lessons) {
    let grade = grades.find((g) => g.grade === lesson.grade);
    if (!grade) grades.push((grade = { grade: lesson.grade, title: GRADE_TITLES[lesson.grade], units: [] }));
    let unit = grade.units.find((u) => u.id === lesson.unit);
    if (!unit) {
      grade.units.push(
        (unit = { grade: lesson.grade, id: lesson.unit, title: unitTitle(lesson.grade, lesson.unit), strand: lesson.strand, lessons: [] }),
      );
    }
    unit.lessons.push(lesson);
  }
  for (const grade of grades) {
    for (const unit of grade.units) {
      const first = unit.lessons.reduce((a, b) => (b.order < a.order ? b : a));
      unit.strand = first.strand;
    }
  }
  return grades;
}

export function findUnit(course: readonly CourseGrade[], grade: string, unit: string): CourseUnit | undefined {
  return course.find((g) => g.grade === grade)?.units.find((u) => u.id === unit);
}

/** Grades with no lessons yet, in order, each with its one-line summary. */
export function comingSoonGrades(course: readonly CourseGrade[]): ComingSoonGrade[] {
  const have = new Set(course.map((g) => g.grade));
  return GRADES.filter((g) => !have.has(g) && GRADE_SUMMARIES[g] !== undefined).map((g) => ({
    grade: g,
    title: GRADE_TITLES[g],
    summary: GRADE_SUMMARIES[g]!,
  }));
}

export function lessonTitle(lesson: Pick<LessonMeta, 'title' | 'usTitle'>, terminology: Terminology): string {
  return terminology === 'us' && lesson.usTitle ? lesson.usTitle : lesson.title;
}

export function lessonSummary(lesson: Pick<LessonMeta, 'summary' | 'usSummary'>, terminology: Terminology): string {
  return terminology === 'us' && lesson.usSummary ? lesson.usSummary : lesson.summary;
}

/** One line on what a unit covers, made from its lessons' titles in order (nothing invented). */
export function unitCovers(unit: Pick<CourseUnit, 'lessons'>, terminology: Terminology): string {
  const titles = unit.lessons.map((l) => lessonTitle(l, terminology));
  if (titles.length === 0) return '';
  return `Covers: ${titles.join('; ')}.`;
}

export function lessonHref(lesson: Pick<LessonMeta, 'id'>): string {
  return `/lessons/${lesson.id}`;
}

export function unitHref(unit: Pick<CourseUnit, 'grade' | 'id'>): string {
  return `/learn/${unit.grade}/${unit.id}`;
}
