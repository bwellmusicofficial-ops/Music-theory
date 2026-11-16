/**
 * Term Blitz: building one card. Pure; randomness only through the injected Rng.
 *
 * Three card types:
 * - 'term-meaning': a term is shown, choose its meaning (answers are meanings);
 * - 'meaning-term': a meaning is shown, choose the term (answers are terms);
 * - 'abbr-term':    an abbreviation from the definition ("cresc.", "mf") is shown, choose the full term.
 *
 * Wrong answers (distractors) are other entries of the same deck, same family first. They are
 * never an equivalent of the right answer, never repeat a button text, and a meaning button
 * never contains the term being asked.
 */
import type { Rng } from '@/engine/types';
import { termSpellings, type Bank, type TermInfo } from './bank';
import { containsTerm } from './meaning';

export type CardType = 'term-meaning' | 'meaning-term' | 'abbr-term';
export const CARD_TYPES: readonly CardType[] = ['term-meaning', 'meaning-term', 'abbr-term'];
export const OPTION_COUNT = 4;

export interface Card {
  /** 1 for the first card of a round. */
  seq: number;
  type: CardType;
  /** The entry the card asks about. */
  entryId: string;
  /** For 'abbr-term': the abbreviation shown. */
  abbreviation?: string;
  /** Entry ids behind the four buttons, in display order. */
  options: string[];
  correctIndex: number;
}

/** Types an entry can be asked as, before looking at the deck. */
export function availableTypes(info: TermInfo): CardType[] {
  const types: CardType[] = [];
  // Both a and b put the meaning on screen; a meaning that contains its own term gives the answer away
  // (or, as an answer button, breaks the "never contains the term" rule).
  if (!info.selfReferring) types.push('term-meaning', 'meaning-term');
  if (info.abbreviations.length > 0) types.push('abbr-term');
  return types;
}

function meaningTexts(info: TermInfo): string[] {
  return [info.meaning.uk, info.meaning.us];
}

function containsAnySpelling(texts: string[], asked: TermInfo): boolean {
  return termSpellings(asked).some((s) => texts.some((t) => containsTerm(t, s)));
}

/** Button texts an entry would show for a type (both terminologies), for the no-duplicates rule. */
function buttonTexts(info: TermInfo, type: CardType): string[] {
  if (type === 'term-meaning') return meaningTexts(info).map((t) => t.toLowerCase());
  return termSpellings(info).map((t) => t.toLowerCase());
}

/**
 * Candidate wrong answers in preference order, as groups (lowest tier first) so the caller can
 * shuffle inside a tier. Hard rules remove candidates; soft rules only push them to a later tier.
 */
function candidateTiers(bank: Bank, pool: readonly string[], correct: TermInfo, type: CardType): string[][] {
  const correctTexts = new Set(buttonTexts(correct, type));
  const tiers: string[][] = [[], [], [], [], [], [], [], []];
  for (const id of pool) {
    const c = bank.byId.get(id);
    if (!c || bank.equivalent(correct.id, id)) continue;
    if (buttonTexts(c, type).some((t) => correctTexts.has(t))) continue;
    // A meaning button must not contain the asked term.
    if (type === 'term-meaning' && containsAnySpelling(meaningTexts(c), correct)) continue;
    let tier = c.family === correct.family ? 0 : 2;
    if (type === 'abbr-term' && c.abbreviations.length === 0) tier += 1;
    // Meaning shown: a term that appears in the shown meaning is trivially wrong, so use it last.
    if (type === 'meaning-term' && containsAnySpelling(meaningTexts(correct), c)) tier += 4;
    tiers[tier].push(id);
  }
  return tiers;
}

function distractorIds(
  bank: Bank,
  pool: readonly string[],
  correct: TermInfo,
  type: CardType,
  rng: Rng | null,
): string[] {
  const picked: string[] = [];
  const used = new Set(buttonTexts(correct, type));
  for (const tier of candidateTiers(bank, pool, correct, type)) {
    for (const id of rng ? rng.shuffle(tier) : tier) {
      const texts = buttonTexts(bank.byId.get(id)!, type);
      if (texts.some((t) => used.has(t))) continue;
      for (const t of texts) used.add(t);
      picked.push(id);
      if (picked.length === OPTION_COUNT - 1) return picked;
    }
  }
  return picked;
}

/** Whether `buildCard` can make this card from this pool (no randomness involved). */
export function canBuild(bank: Bank, pool: readonly string[], entryId: string, type: CardType): boolean {
  const info = bank.byId.get(entryId);
  if (!info || !availableTypes(info).includes(type)) return false;
  return distractorIds(bank, pool, info, type, null).length === OPTION_COUNT - 1;
}

/** Types that can be built for an entry from this pool. */
export function buildableTypes(bank: Bank, pool: readonly string[], entryId: string): CardType[] {
  return CARD_TYPES.filter((t) => canBuild(bank, pool, entryId, t));
}

/** Builds a card, or null when the pool cannot give three fair wrong answers. */
export function buildCard(
  bank: Bank,
  pool: readonly string[],
  entryId: string,
  type: CardType,
  rng: Rng,
  seq: number,
): Card | null {
  const info = bank.byId.get(entryId);
  if (!info || !availableTypes(info).includes(type)) return null;
  const wrong = distractorIds(bank, pool, info, type, rng);
  if (wrong.length < OPTION_COUNT - 1) return null;
  const options = rng.shuffle([entryId, ...wrong]);
  const card: Card = { seq, type, entryId, options, correctIndex: options.indexOf(entryId) };
  if (type === 'abbr-term') card.abbreviation = rng.pick(info.abbreviations);
  return card;
}
