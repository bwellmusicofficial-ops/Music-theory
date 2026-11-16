/**
 * Term Blitz: turning glossary definitions into short, readable answer text.
 * Pure: no React, no DOM.
 *
 * Glossary definitions are written for the lesson player: a couple of sentences,
 * with RichText markers and, for Italian terms, the written abbreviation in
 * brackets, such as "Gradually getting louder (cresc.)." An answer button on a
 * phone has room for about three short lines, so a card uses `shortenMeaning`.
 */
import { plainText, type GlossarySource, makeGlossaryLookup } from '@/lesson/player';
import type { Terminology } from '@/engine/types';

/**
 * Longest meaning shown on an answer button, in characters.
 *
 * Why 90: the button text column on a 390 px phone is about 300 px (390 minus page
 * padding and the button's own padding, key chip and border). At the 1 rem (16 px)
 * semi-bold sans font used, an average character is a little under 8 px, so a line
 * holds about 37 characters; word wrapping wastes some, so call it 30 to be safe.
 * Three lines at 30 is 90. A test measures every Grade 1 meaning against this, in
 * both UK and US wording, and a real-browser check confirms the layout.
 */
export const MEANING_LIMIT = 90;

/** Brackets holding a written abbreviation: letters and dots only, no spaces, e.g. "(cresc.)", "(D.C.)", "(mf)". */
const ABBREVIATION = /\(([A-Za-z][A-Za-z.]{0,9})\)/g;

/** The abbreviations a definition gives in brackets, in order, as written ("cresc.", "f"). */
export function parseAbbreviations(definition: string): string[] {
  const found: string[] = [];
  for (const m of definition.matchAll(ABBREVIATION)) found.push(m[1]);
  return found;
}

/** Removes abbreviation brackets together with the space before them. */
export function stripAbbreviations(text: string): string {
  return text
    .replace(/\s*\(([A-Za-z][A-Za-z.]{0,9})\)/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The first sentence of a text. A sentence ends at ".", "!" or "?" followed by a space and a
 * capital letter or digit (or the end of the text), so "such as 3/4. The top number" splits
 * after "3/4." but "1 and a half" and "C up to E" do not split.
 */
export function firstSentence(text: string): string {
  const t = text.trim();
  const m = /^[\s\S]*?[.!?](?=\s+[A-Z0-9♩]|\s*$)/.exec(t);
  return (m ? m[0] : t).trim();
}

/** Words a cut sentence must not end on ("louder or with."). */
const DANGLING = new Set(['a', 'an', 'the', 'or', 'and', 'with', 'of', 'to', 'in', 'on', 'as', 'by', 'for', 'that', 'than', 'but', 'so', 'if', 'at', 'from']);

/** Cuts an over-long sentence at the last clause break that fits, or the last whole word, and ends it with a full stop. */
function cutToFit(sentence: string, limit: number): string {
  if (sentence.length <= limit) return sentence;
  const head = sentence.slice(0, limit);
  const at = Math.max(head.lastIndexOf(', '), head.lastIndexOf(': '), head.lastIndexOf('; '));
  if (at >= Math.floor(limit / 2)) return `${head.slice(0, at)}.`;
  // No clause break far enough along: cut at a word boundary and drop words that cannot end a phrase.
  const words = head.slice(0, head.lastIndexOf(' ') > 0 ? head.lastIndexOf(' ') : limit).split(' ');
  while (words.length > 1 && DANGLING.has(words[words.length - 1].replace(/[,:;]$/, '').toLowerCase())) words.pop();
  return `${words.join(' ').replace(/[,:;]$/, '')}.`;
}

/**
 * The rule, in order:
 * 1. strip RichText markers and apply the US swap for linked terms (`plainText`);
 * 2. remove the abbreviation in brackets;
 * 3. keep the first sentence;
 * 4. if that is longer than `limit`, cut it at the last comma, colon or semicolon that
 *    leaves at least half the limit, otherwise at the last word, and end it with a full stop.
 */
export function shortenMeaning(
  definition: string,
  terminology: Terminology,
  glossary: GlossarySource | undefined,
  limit: number = MEANING_LIMIT,
): string {
  const plain = plainText(definition, terminology, makeGlossaryLookup(glossary));
  return cutToFit(firstSentence(stripAbbreviations(plain)), limit);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `text` contains `term` as whole words, allowing a plural "s" or "es" ("line" matches "lines"). */
export function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(t)}(s|es)?(?![\\p{L}\\p{N}])`, 'iu').test(text);
}
