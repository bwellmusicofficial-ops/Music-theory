/**
 * Term Blitz: the decks offered on the start screen, built from the glossary entries.
 *
 * - "Start here words": entries whose grade is 'start'.
 * - "Italian terms": entries whose language is 'it' (any grade).
 * - "Tempo", "Dynamics", "Articulation and signs", "Note values and rests": the curated id lists in deck-data.ts.
 * - "Everything in Grade N": entries of that grade, for each grade that has a glossary file.
 *
 * A deck that cannot ask at least MIN_DECK_CARDS different cards is not offered, and a grade with
 * no glossary file has no entries, so it never appears.
 */
import type { GlossaryEntry } from '@/lesson/schema';
import { GRADES } from '@/lesson/schema';
import type { Bank } from './bank';
import { CURATED_DECKS, MIN_DECK_CARDS, type CuratedDeckId } from './deck-data';
import { playableIds } from './engine';

export interface Deck {
  /** Stable id, used as the storage key of the personal best. */
  id: string;
  name: string;
  blurb: string;
  /** Entry ids a card can be asked about, in glossary order. */
  entryIds: string[];
}

const CURATED_TEXT: Record<CuratedDeckId, { name: string; blurb: string }> = {
  tempo: { name: 'Tempo', blurb: 'Fast, slow, and speeding up or slowing down.' },
  dynamics: { name: 'Dynamics', blurb: 'Loud, quiet, and getting louder or quieter.' },
  'articulation-signs': { name: 'Articulation and signs', blurb: 'Smooth, short, and the signs that steer a piece.' },
  'note-values-rests': { name: 'Note values and rests', blurb: 'How long each note and rest lasts.' },
};

/** Ids of an entry list in glossary order, restricted to a set. */
function inOrder(entries: readonly GlossaryEntry[], keep: (e: GlossaryEntry) => boolean): string[] {
  return entries.filter(keep).map((e) => e.id);
}

export function buildDecks(entries: readonly GlossaryEntry[], bank: Bank): Deck[] {
  const known = new Set(entries.map((e) => e.id));
  const candidates: Deck[] = [];
  candidates.push({
    id: 'start',
    name: 'Start here words',
    blurb: 'The first words of music, in plain language.',
    entryIds: inOrder(entries, (e) => e.grade === 'start'),
  });
  candidates.push({
    id: 'italian',
    name: 'Italian terms',
    blurb: 'Every Italian word and abbreviation so far.',
    entryIds: inOrder(entries, (e) => e.language === 'it'),
  });
  for (const id of Object.keys(CURATED_DECKS) as CuratedDeckId[]) {
    candidates.push({ id, ...CURATED_TEXT[id], entryIds: CURATED_DECKS[id].filter((e) => known.has(e)) });
  }
  for (const grade of GRADES) {
    if (grade === 'start') continue;
    candidates.push({
      id: `grade-${grade}`,
      name: `Everything in Grade ${grade}`,
      blurb: `All the words of Grade ${grade}.`,
      entryIds: inOrder(entries, (e) => e.grade === grade),
    });
  }
  return candidates
    .map((d) => ({ ...d, entryIds: playableIds(bank, d.entryIds) }))
    .filter((d) => d.entryIds.length >= MIN_DECK_CARDS);
}
