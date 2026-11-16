/**
 * Term Blitz: the card bank. One `TermInfo` per glossary entry, with the texts a card needs
 * worked out once, in both terminologies. Pure: no React, no DOM, no randomness.
 */
import type { Terminology } from '@/engine/types';
import type { GlossaryEntry } from '@/lesson/schema';
import { EQUIVALENTS, FAMILIES } from './deck-data';
import { containsTerm, parseAbbreviations, shortenMeaning } from './meaning';

export type Language = GlossaryEntry['language'];

export interface TermInfo {
  id: string;
  /** UK term, canonical. */
  term: string;
  /** US equivalent, when the glossary gives one. */
  us?: string;
  language: Language;
  grade: GlossaryEntry['grade'];
  strand: GlossaryEntry['strand'];
  family: string;
  /** Short meaning for a card, by `shortenMeaning`. */
  meaning: Record<Terminology, string>;
  /** Abbreviations from the definition's brackets ("cresc."), as written. */
  abbreviations: string[];
  /** True when the short meaning contains the entry's own term (in either terminology). */
  selfReferring: boolean;
}

export interface Bank {
  readonly byId: ReadonlyMap<string, TermInfo>;
  /** In glossary order. */
  readonly ids: readonly string[];
  /** True when the two entries must never be offered against each other. */
  readonly equivalent: (a: string, b: string) => boolean;
}

/** The term as shown to a learner: the US word for a US learner when there is one. Italian terms never change. */
export function termLabel(info: TermInfo, terminology: Terminology): string {
  const raw = terminology === 'us' && info.us ? info.us : info.term;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function meaningLabel(info: TermInfo, terminology: Terminology): string {
  return info.meaning[terminology];
}

const LANGUAGE_NAMES: Record<Language, string | null> = { en: null, it: 'Italian', fr: 'French', de: 'German' };
/** "Italian" for an Italian term, and so on; null for English. */
export function languageLabel(info: TermInfo): string | null {
  return LANGUAGE_NAMES[info.language];
}

/** Every spelling of the term a learner could see, so a check works in either terminology. */
export function termSpellings(info: TermInfo): string[] {
  return info.us ? [info.term, info.us] : [info.term];
}

export function buildBank(entries: readonly GlossaryEntry[]): Bank {
  const byId = new Map<string, TermInfo>();
  for (const e of entries) {
    const meaning = {
      uk: shortenMeaning(e.definition, 'uk', entries),
      us: shortenMeaning(e.definition, 'us', entries),
    };
    const spellings = e.us ? [e.term, e.us] : [e.term];
    byId.set(e.id, {
      id: e.id,
      term: e.term,
      us: e.us,
      language: e.language,
      grade: e.grade,
      strand: e.strand,
      family: FAMILIES[e.id] ?? e.strand,
      meaning,
      abbreviations: parseAbbreviations(e.definition),
      selfReferring: spellings.some((s) => containsTerm(meaning.uk, s) || containsTerm(meaning.us, s)),
    });
  }
  const pairs = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const group of EQUIVALENTS) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) pairs.add(key(group[i], group[j]));
    }
  }
  return {
    byId,
    ids: [...byId.keys()],
    equivalent: (a, b) => a === b || pairs.has(key(a, b)),
  };
}
