import type { Metadata } from 'next';
import { listLessons } from '@/content/load';
import { LessonIndex } from './lesson-index';

export const metadata: Metadata = { title: 'All lessons' };

export default function LessonsPage() {
  const lessons = listLessons();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">All lessons</h1>
        <p className="mt-3 max-w-prose text-lg text-fg-secondary">In the order they are taught, from your first note onwards.</p>
      </div>
      <p role="note" className="max-w-prose rounded-lg border-2 border-warning bg-surface p-4 text-fg-secondary" data-testid="draft-note">
        Lessons marked <strong>Draft</strong> have not yet been checked by a music specialist. You can try them, but they
        may still contain mistakes.
      </p>
      <LessonIndex lessons={lessons} />
    </div>
  );
}
