/**
 * Types shared by several question payloads.
 *
 * CONTRACT FILE. Owned by the orchestrator. Defined in
 * docs/question-payloads.md section 1.2; each type's module builds its own Zod
 * schema from the helpers its task adds beside its code.
 */

import type { Duration, Passage } from '@/engine/types';

/** The inline text format from schema.ts: plain text, **bold**, *italic*, [[term-id|shown text]]. */
export type RichText = string;

/** One note or rest symbol drawn on its own, with no stave. */
export interface Glyph {
  kind: 'note' | 'rest';
  duration: Duration;
}

/** Something an option, a card or a sortable item can show. */
export type Face =
  | { kind: 'text'; text: RichText }
  | { kind: 'glyph'; glyph: Glyph }
  | { kind: 'passage'; passage: Passage; hideClef?: boolean; hideTime?: boolean };

/** A passage to be heard, not seen. */
export interface Clip {
  passage: Passage;
  /** Felt beats per minute, 40 to 160. */
  bpm: number;
}
