/**
 * RichText parsing and the US terminology swap. Pure: no React, no DOM.
 *
 * Grammar (see schema.ts): plain text, **bold**, *italic*, [[term-id|shown text]].
 * Markers that never close are left in the text as written.
 */

import type { Terminology } from '@/engine/types';
import type { GlossaryEntry } from '../schema';

export type RichNode =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: RichNode[] }
  | { kind: 'italic'; children: RichNode[] }
  | { kind: 'term'; id: string; shown: string };

const TOKEN =
  /\[\[([^\]|]+)\|([^\]]*)\]\]|\[\[([^\]|]+)\]\]|\*\*(?=\S)([\s\S]*?\S)\*\*|\*(?=\S)([\s\S]*?\S)\*/g;

export function parseRichText(text: string): RichNode[] {
  const nodes: RichNode[] = [];
  const re = new RegExp(TOKEN.source, 'g');
  let last = 0;
  const pushText = (t: string) => {
    if (t) nodes.push({ kind: 'text', text: t });
  };
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    pushText(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push({ kind: 'term', id: m[1].trim(), shown: m[2] });
    } else if (m[3] !== undefined) {
      const id = m[3].trim();
      nodes.push({ kind: 'term', id, shown: id });
    } else if (m[4] !== undefined) {
      nodes.push({ kind: 'bold', children: parseRichText(m[4]) });
    } else if (m[5] !== undefined) {
      nodes.push({ kind: 'italic', children: parseRichText(m[5]) });
    }
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
  return nodes;
}

/** Plain text of a RichText string: markers removed, links shown as written (UK). */
export function stripRichText(text: string): string {
  const walk = (nodes: RichNode[]): string =>
    nodes
      .map((n) => {
        if (n.kind === 'text') return n.text;
        if (n.kind === 'term') return n.shown;
        return walk(n.children);
      })
      .join('');
  return walk(parseRichText(text));
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * The text a glossary link shows. UK: as written. US: when the entry has a `us`
 * value, the entry's `term` inside the shown text (ignoring case) is replaced by
 * it; whatever surrounds it (a plural "s", a leading word) is kept, and an
 * initial capital on the matched term carries over.
 */
export function displayTerm(shown: string, entry: GlossaryEntry | undefined, terminology: Terminology): string {
  if (terminology !== 'us' || !entry?.us || !entry.term) return shown;
  const at = shown.toLowerCase().indexOf(entry.term.toLowerCase());
  if (at < 0) return shown;
  const matched = shown.slice(at, at + entry.term.length);
  const isCapital = matched[0] !== matched[0].toLowerCase();
  const replacement = isCapital ? capitalise(entry.us) : entry.us;
  return shown.slice(0, at) + replacement + shown.slice(at + entry.term.length);
}

/** Text with markers stripped and US terms swapped, for aria-labels and plain contexts. */
export function plainText(
  text: string,
  terminology: Terminology,
  lookup: (id: string) => GlossaryEntry | undefined,
): string {
  const walk = (nodes: RichNode[]): string =>
    nodes
      .map((n) => {
        if (n.kind === 'text') return n.text;
        if (n.kind === 'term') return displayTerm(n.shown, lookup(n.id), terminology);
        return walk(n.children);
      })
      .join('');
  return walk(parseRichText(text));
}

export type GlossarySource = readonly GlossaryEntry[] | ReadonlyMap<string, GlossaryEntry> | ((id: string) => GlossaryEntry | undefined);

export function makeGlossaryLookup(source: GlossarySource | undefined): (id: string) => GlossaryEntry | undefined {
  if (!source) return () => undefined;
  if (typeof source === 'function') return source;
  if (source instanceof Map) return (id) => source.get(id);
  const map = new Map<string, GlossaryEntry>();
  for (const e of source as readonly GlossaryEntry[]) map.set(e.id, e);
  return (id) => map.get(id);
}
