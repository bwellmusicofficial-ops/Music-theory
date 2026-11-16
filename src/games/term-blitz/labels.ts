/**
 * Term Blitz: the words a card shows, for a terminology. Pure.
 *
 * All learner-facing wording of a card comes from here and the glossary, so the screens only lay it out.
 */
import type { Terminology } from '@/engine/types';
import { languageLabel, meaningLabel, termLabel, type Bank, type TermInfo } from './bank';
import type { Card } from './cards';

export interface CardView {
  /** The question in a few words, above the prompt. */
  kicker: string;
  prompt: string;
  promptKind: 'term' | 'meaning' | 'abbreviation';
  /** "Italian" under a term prompt for a term from another language, else null. */
  language: string | null;
  /** The four button texts, in order. */
  options: string[];
  /** The whole card as one sentence, for a screen reader. */
  speech: string;
}

export interface AnswerView {
  term: string;
  /** "Italian" for an Italian term, else null. */
  language: string | null;
  meaning: string;
  /** Abbreviations as written, e.g. ["cresc."]. */
  abbreviations: string[];
  /** The pairing as one sentence, for a screen reader. */
  speech: string;
}

function info(bank: Bank, id: string): TermInfo {
  const found = bank.byId.get(id);
  if (!found) throw new Error(`Term Blitz: unknown entry ${id}`);
  return found;
}

export function answerView(bank: Bank, entryId: string, terminology: Terminology): AnswerView {
  const e = info(bank, entryId);
  const term = termLabel(e, terminology);
  const language = languageLabel(e);
  const meaning = meaningLabel(e, terminology);
  const abbreviations = e.abbreviations;
  const speech =
    `${term}${language ? `, an ${language} word,` : ''} means ${meaning.charAt(0).toLowerCase()}${meaning.slice(1)}` +
    (abbreviations.length > 0 ? ` Written ${abbreviations.join(' or ')}.` : '');
  return { term, language, meaning, abbreviations, speech };
}

export function cardView(bank: Bank, card: Card, terminology: Terminology): CardView {
  const asked = info(bank, card.entryId);
  const optionInfos = card.options.map((id) => info(bank, id));
  if (card.type === 'term-meaning') {
    const term = termLabel(asked, terminology);
    const language = languageLabel(asked);
    return {
      kicker: 'What does this mean?',
      prompt: term,
      promptKind: 'term',
      language,
      options: optionInfos.map((o) => meaningLabel(o, terminology)),
      speech: `What does ${term}${language ? `, an ${language} word,` : ''} mean?`,
    };
  }
  if (card.type === 'meaning-term') {
    const meaning = meaningLabel(asked, terminology);
    return {
      kicker: 'Which term means this?',
      prompt: meaning,
      promptKind: 'meaning',
      language: null,
      options: optionInfos.map((o) => termLabel(o, terminology)),
      speech: `Which term means: ${meaning}`,
    };
  }
  const abbreviation = card.abbreviation ?? asked.abbreviations[0];
  return {
    kicker: 'What does this stand for?',
    prompt: abbreviation,
    promptKind: 'abbreviation',
    language: null,
    options: optionInfos.map((o) => termLabel(o, terminology)),
    speech: `What does the abbreviation ${abbreviation} stand for?`,
  };
}
