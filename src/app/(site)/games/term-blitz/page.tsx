import type { Metadata } from 'next';
import { loadGlossary } from '@/content/load';
import type { GlossaryEntry } from '@/lesson/schema';
import { TermBlitzRunner } from './runner';

export const metadata: Metadata = { title: 'Term Blitz' };

/** Every grade that has a glossary file; the game builds its decks from these entries, so new grades need no code. */
export default function TermBlitzPage() {
  // Only what the game uses: the exhibits (whole passages) stay on the server.
  const entries: GlossaryEntry[] = loadGlossary('8').map((e) => ({
    id: e.id,
    term: e.term,
    us: e.us,
    language: e.language,
    definition: e.definition,
    grade: e.grade,
    strand: e.strand,
  }));
  return <TermBlitzRunner entries={entries} />;
}
