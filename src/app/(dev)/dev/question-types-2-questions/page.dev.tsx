import { loadGlossary } from '@/content/load';
import { QuestionsHarness } from './questions-harness';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Test harness (dev routes only): one authored question of each of the four new types (place-bar-lines,
 * fix-beaming, write-key-signature, find-in-passage) and one item from each of the three new generators,
 * each played by the lesson player's own question stage. /dev/question-types-2-questions?seed=<n>
 */
export default async function DevQuestionTypes2QuestionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const seed = Number(first(params.seed) ?? '1') || 1;
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <QuestionsHarness seed={seed} glossary={loadGlossary('1')} />
    </main>
  );
}
