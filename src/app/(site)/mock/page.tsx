import type { Metadata } from 'next';
import { MockList } from '@/mock/components/mock-list';
import { listMockConfigs } from '@/mock/load';
import { configQuestionCount } from '@/mock/schema';

export const metadata: Metadata = { title: 'Mock tests' };

export default function MockListPage() {
  const entries = listMockConfigs().map((c) => ({
    id: c.id,
    grade: c.grade,
    title: c.title,
    summary: c.summary,
    minutes: c.minutes,
    questionCount: configQuestionCount(c),
  }));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Mock tests</h1>
        <p className="mt-3 max-w-prose text-lg text-fg-secondary">
          Timed practice papers with no feedback until the end, in the style of a theory exam. They are practice only.
        </p>
      </div>
      <MockList entries={entries} />
    </div>
  );
}
