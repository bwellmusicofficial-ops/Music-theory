import Link from 'next/link';
import { Badge, Card, StrandTag } from '@/components/ui';
import type { Grade, Lesson } from '@/lesson/schema';

const GRADE_TITLES: Record<Grade, string> = {
  start: 'Start here',
  '1': 'Grade 1',
  '2': 'Grade 2',
  '3': 'Grade 3',
  '4': 'Grade 4',
  '5': 'Grade 5',
  '6': 'Grade 6',
  '7': 'Grade 7',
  '8': 'Grade 8',
};

/** "high-low-1" -> "High low 1". Units have no title of their own. */
export function unitTitle(unit: string): string {
  const words = unit.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface UnitGroup {
  unit: string;
  lessons: Lesson[];
}
interface GradeGroup {
  grade: Grade;
  units: UnitGroup[];
}

/** Groups lessons that are already in teaching order, keeping that order. */
export function groupLessons(lessons: readonly Lesson[]): GradeGroup[] {
  const grades: GradeGroup[] = [];
  for (const lesson of lessons) {
    let grade = grades.find((g) => g.grade === lesson.grade);
    if (!grade) grades.push((grade = { grade: lesson.grade, units: [] }));
    let unit = grade.units.find((u) => u.unit === lesson.unit);
    if (!unit) grade.units.push((unit = { unit: lesson.unit, lessons: [] }));
    unit.lessons.push(lesson);
  }
  return grades;
}

/** Every lesson, grouped by grade and unit, with a Draft badge on those not yet checked by a music specialist. */
export function LessonIndex({ lessons }: { lessons: readonly Lesson[] }) {
  return (
    <div className="flex flex-col gap-10">
      {groupLessons(lessons).map((g) => (
        <section key={g.grade} aria-labelledby={`grade-${g.grade}`} className="flex flex-col gap-6">
          <h2 id={`grade-${g.grade}`} className="text-2xl font-extrabold tracking-tight">
            {GRADE_TITLES[g.grade]}
          </h2>
          {g.units.map((u) => (
            <div key={u.unit} className="flex flex-col gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{unitTitle(u.unit)}</h3>
              <ul className="flex flex-col gap-3">
                {u.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link href={`/lessons/${lesson.id}`} className="group block rounded-lg">
                      <Card padding="md" className="flex flex-col gap-2 group-hover:border-accent">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-bold">{lesson.title}</span>
                          {lesson.status === 'draft' ? <Badge tone="warning">Draft</Badge> : null}
                        </div>
                        <p className="text-fg-secondary">{lesson.summary}</p>
                        <div>
                          <StrandTag strand={lesson.strand} />
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
