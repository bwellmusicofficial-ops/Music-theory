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
  return <LessonRunner lesson={lesson} glossary={loadGlossary(lesson.grade)} />;
}
