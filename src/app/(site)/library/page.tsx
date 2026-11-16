import type { Metadata } from 'next';
import { LibraryView } from '@/components/site/library/library-view';
import { listLessons, loadGlossary } from '@/content/load';
import { toLessonMeta, type GlossaryItem, type RecapCardData } from '@/progress-view';

export const metadata: Metadata = { title: 'Library' };

export default function LibraryPage() {
  const full = listLessons();
  const recaps: RecapCardData[] = full.map((lesson) => {
    const { points, exhibit } = lesson.steps.recap;
    return {
      lessonId: lesson.id,
      points,
      passage:
        exhibit?.kind === 'passage'
          ? { passage: exhibit.passage, hideClef: exhibit.hideClef, hideTime: exhibit.hideTime }
          : undefined,
    };
  });
  // Every entry of every grade. The exhibits stay on the server: the library does not draw them.
  const glossary: GlossaryItem[] = loadGlossary('8').map(({ id, term, us, language, definition, grade, strand }) => ({ id, term, us, language, definition, grade, strand }));
  return <LibraryView lessons={full.map(toLessonMeta)} recaps={recaps} glossary={glossary} />;
}
