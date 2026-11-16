import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UnitView } from '@/components/site/unit-view';
import { listLessons } from '@/content/load';
import { buildCourse, findUnit, toLessonMeta } from '@/progress-view';

export const dynamicParams = false;

type Props = { params: Promise<{ grade: string; unit: string }> };

function course() {
  return buildCourse(listLessons().map(toLessonMeta));
}

export function generateStaticParams() {
  return course().flatMap((g) => g.units.map((u) => ({ grade: g.grade, unit: u.id })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { grade, unit } = await params;
  const found = findUnit(course(), grade, unit);
  return { title: found ? found.title : 'Unit not found' };
}

export default async function UnitPage({ params }: Props) {
  const { grade, unit } = await params;
  const all = course();
  const found = findUnit(all, grade, unit);
  if (!found) notFound();
  const gradeTitle = all.find((g) => g.grade === grade)!.title;
  return <UnitView unit={found} gradeTitle={gradeTitle} />;
}
