import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLesson, listLessons, loadGlossary } from '@/content/load';
import { LessonRunner } from './lesson-runner';

export const dynamicParams = false;

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return listLessons().map((lesson) => ({ id: lesson.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = getLesson((await params).id);
  return { title: lesson ? lesson.title : 'Lesson not found' };
}

export default async function LessonPage({ params }: Props) {
  const lesson = getLesson((await params).id);
  if (!lesson) notFound();
  return (
    <>
      {lesson.status === 'draft' ? (
        <p role="note" className="bg-warning px-4 py-1 text-center text-sm font-semibold text-on-warning">
          Draft lesson: awaiting review by a music specialist
        </p>
      ) : null}
      <LessonRunner lesson={lesson} glossary={loadGlossary(lesson.grade)} />
    </>
  );
}
