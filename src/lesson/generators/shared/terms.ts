import { rhythm } from '@/engine/rhythm';
import type { Duration, NoteValue, Terminology } from '@/engine/types';

/**
 * Glossary link builders (docs/question-payloads.md 1.4 and docs/generators-grade-1.md 0).
 * The link id is always the UK id; the shown text is the name for `terminology`, so the
 * text reads correctly whether or not the renderer swaps it.
 */

const US_TERMS: Record<string, { one: string; many: string }> = {
  bar: { one: 'measure', many: 'measures' },
  stave: { one: 'staff', many: 'staves' },
  tone: { one: 'whole step', many: 'whole steps' },
  semitone: { one: 'half step', many: 'half steps' },
};
const UK_PLURAL: Record<string, string> = { stave: 'staves' };

const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export interface TermOptions {
  plural?: boolean;
  cap?: boolean;
}

/** `[[bar|bar]]` / `[[bar|measure]]`, `[[stave|staves]]`, `[[tone|Tone]]` ... */
export function term(id: 'bar' | 'stave' | 'tone' | 'semitone', t: Terminology, opts: TermOptions = {}): string {
  const us = US_TERMS[id]!;
  let shown = t === 'us' ? (opts.plural ? us.many : us.one) : opts.plural ? (UK_PLURAL[id] ?? `${id}s`) : id;
  if (opts.cap) shown = capital(shown);
  return `[[${id}|${shown}]]`;
}

/** A link with no US equivalent: `[[tie|tie]]`. */
export function plainTerm(id: string, shown: string = id.replace(/-/g, ' ')): string {
  return `[[${id}|${shown}]]`;
}

const dotWord = (d: Duration): string => (d.dots === 1 ? 'dotted ' : d.dots === 2 ? 'double-dotted ' : '');

/** `dotted [[minim|minim]]` / `dotted [[minim|half note]]`. */
export function noteLink(d: Duration, t: Terminology, opts: TermOptions = {}): string {
  const base = rhythm.noteValueName({ value: d.value, dots: 0 }, t);
  const shown = opts.plural ? `${base}s` : base;
  return `${dotWord(d)}[[${d.value}|${opts.cap ? capital(shown) : shown}]]`;
}

/** `[[crotchet-rest|crotchet rest]]`; rests are undotted at Grade 1. */
export function restLink(d: Duration, t: Terminology, opts: TermOptions = {}): string {
  const base = rhythm.restName({ value: d.value, dots: 0 }, t);
  const shown = opts.plural ? `${base}s` : base;
  return `${dotWord(d)}[[${d.value}-rest|${opts.cap ? capital(shown) : shown}]]`;
}

export const glyphLink = (kind: 'note' | 'rest', d: Duration, t: Terminology, opts: TermOptions = {}): string =>
  kind === 'rest' ? restLink(d, t, opts) : noteLink(d, t, opts);

export const noteValueId = (v: NoteValue): string => v;

/** 1st, 2nd, 3rd, 4th ... */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Joins "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
