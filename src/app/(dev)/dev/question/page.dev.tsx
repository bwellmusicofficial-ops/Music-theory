import { notFound } from 'next/navigation';
import { getLesson, loadGlossary } from '@/content/load';
import { QuestionHarness } from './question-harness';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Test harness (dev routes only): renders one question of one lesson, exactly as
 * the lesson player does, by lesson id and question id, with a seed for generated
 * questions. /dev/question?lesson=<id>&q=<question id>&seed=<n>
 */
export default async function DevQuestionPage({ searchParams }: Props) {
  const params = await searchParams;
  const lesson = getLesson(first(params.lesson) ?? '');
  if (!lesson) notFound();
  const id = first(params.q);
  const question = [...lesson.steps.practice.questions, ...lesson.steps.challenge.questions].find((q) => q.id === id);
  if (!question) notFound();
  const seed = Number(first(params.seed) ?? '1') || 1;
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <QuestionHarness lessonId={lesson.id} question={question} seed={seed} glossary={loadGlossary(lesson.grade)} />
    </main>
  );
}
