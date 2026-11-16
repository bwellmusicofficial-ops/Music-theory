import { GRADES, STRANDS, type Lesson } from '@/lesson/schema';

/**
 * Teaching order. Grades go in the order of `GRADES` (Start here first). Within a
 * grade, units are ordered by the strand of their first lesson (the order of
 * `STRANDS`: rhythm, pitch, scales and keys, ...), then by how deep their first
 * lesson sits in the prerequisite chain (a unit that needs earlier lessons of the
 * same strand comes later), then by unit id. Within a unit, by `order`.
 *
 * Pure, so it can be tested without the file system.
 */
export function sortInTeachingOrder(lessons: readonly Lesson[]): Lesson[] {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const levels = new Map<string, number>();
  const level = (lesson: Lesson, seen: ReadonlySet<string> = new Set()): number => {
    const known = levels.get(lesson.id);
    if (known !== undefined) return known;
    if (seen.has(lesson.id)) return 0; // a prerequisite cycle is a content error; do not loop on it
    const next = new Set(seen).add(lesson.id);
    const deepest = lesson.prerequisites.reduce((max, id) => {
      const pre = byId.get(id);
      return pre ? Math.max(max, level(pre, next) + 1) : max;
    }, 0);
    levels.set(lesson.id, deepest);
    return deepest;
  };

  const unitKey = (grade: string, unit: string) => `${grade}/${unit}`;
  const units = new Map<string, { strand: number; level: number }>();
  for (const lesson of lessons) {
    const key = unitKey(lesson.grade, lesson.unit);
    const first = lessons
      .filter((l) => l.grade === lesson.grade && l.unit === lesson.unit)
      .reduce((a, b) => (b.order < a.order ? b : a));
    if (!units.has(key)) units.set(key, { strand: STRANDS.indexOf(first.strand), level: level(first) });
  }

  return [...lessons].sort((a, b) => {
    const grade = GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade);
    if (grade !== 0) return grade;
    if (a.unit !== b.unit) {
      const ua = units.get(unitKey(a.grade, a.unit))!;
      const ub = units.get(unitKey(b.grade, b.unit))!;
      return ua.strand - ub.strand || ua.level - ub.level || a.unit.localeCompare(b.unit);
    }
    return a.order - b.order;
  });
}
