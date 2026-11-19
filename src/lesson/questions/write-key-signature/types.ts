import type { Clef, Key } from '@/engine/types';

/** docs/question-payloads.md 2.12 */
export interface WriteKeySignaturePayload {
  clef: Clef;
  /** Must have 1 to 7 sharps or flats (not C major or A minor). */
  key: Key;
  /** 'standard' (default): each sign must sit at its standard position. 'any-octave': the right letter at any position. */
  placement?: 'standard' | 'any-octave';
}

export interface WriteKeySignatureAnswer {
  /** Signs left to right. */
  signs: { sign: 1 | -1; position: number }[];
}

/** The most signs a key signature can hold. */
export const MAX_SIGNS = 7;
/** The stave positions the key-signature stave takes a tap at (docs/stave-interaction.md 15.3). */
export const LOWEST_POSITION = -1;
export const HIGHEST_POSITION = 9;
