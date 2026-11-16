/** Shared by the tests only: the real glossary, and a small fixed one for hand-computed expectations. */
import { loadGlossary } from '@/content/load';
import type { GlossaryEntry } from '@/lesson/schema';
import { buildBank } from './bank';
import { buildDecks } from './decks';

export function realEntries(): GlossaryEntry[] {
  // The runner passes a trimmed copy (no exhibits); the game must work with either.
  return loadGlossary('8');
}

export function realBank() {
  const entries = realEntries();
  const bank = buildBank(entries);
  return { entries, bank, decks: buildDecks(entries, bank) };
}

const e = (id: string, term: string, definition: string, extra: Partial<GlossaryEntry> = {}): GlossaryEntry => ({
  id,
  term,
  language: 'en',
  definition,
  grade: '1',
  strand: 'terms',
  ...extra,
});

/** Eight made-up entries: two families of four, no equivalents, no entry names itself. */
export const TINY_ENTRIES: GlossaryEntry[] = [
  e('alpha', 'alpha', 'The first one (a.).', { language: 'it' }),
  e('bravo', 'bravo', 'The second one (b.).', { language: 'it' }),
  e('charlie', 'charlie', 'The third one (c.).', { language: 'it' }),
  e('delta', 'delta', 'The fourth one (d.).', { language: 'it' }),
  e('echo', 'echo', 'A sound that comes back.'),
  e('foxtrot', 'foxtrot', 'A dance in slow and quick steps.'),
  e('golf', 'golf', 'A game played with clubs.'),
  e('hotel', 'hotel', 'A place to stay the night.'),
];
export const TINY_FAMILIES_NOTE = 'No entry is in deck-data FAMILIES, so family falls back to strand (all "terms").';
export const TINY_IDS = TINY_ENTRIES.map((x) => x.id);
export const tinyBank = () => buildBank(TINY_ENTRIES);
