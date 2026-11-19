/** Spoken text for the key-signature edit stave (docs/question-types-2.md 1.4). Pure; letters come from the engine. */
import type { Clef, Terminology } from '@/engine/types';
import type { Engines } from '../types';
import { positionName } from './describe';
import { SIGN_WORDS, strings } from './strings';

const WORDS: Record<number, string> = {
  0: 'bottom line',
  1: 'first space',
  2: 'second line',
  3: 'second space',
  4: 'middle line',
  5: 'third space',
  6: 'fourth line',
  7: 'top space',
  8: 'top line',
};

/** A stave position in words: "top line", "third space", "space above the stave". */
export function whereWords(position: number, terminology: Terminology = 'uk'): string {
  const stave = strings(terminology).stave;
  if (position === -1) return `space below the ${stave}`;
  if (position === 9) return `space above the ${stave}`;
  return WORDS[position] ?? positionName(position, terminology);
}

/** "top line, F": the position in words, then the letter that sits there in this clef. */
export function positionAndLetter(e: Engines, clef: Clef, position: number, terminology: Terminology = 'uk'): string {
  return `${whereWords(position, terminology)}, ${e.pitch.pitchAtStavePosition(position, clef).letter}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ghost moved by keyboard or button: "Top line, F." */
export function announceGhostAt(e: Engines, clef: Clef, position: number, terminology: Terminology = 'uk'): string {
  return `${capital(positionAndLetter(e, clef, position, terminology))}.`;
}

/** Enter pressed: "Sharp placed on the top line, F." */
export function announceSignPlaced(e: Engines, clef: Clef, sign: 1 | -1, position: number, terminology: Terminology = 'uk'): string {
  return `${capital(SIGN_WORDS[sign])} placed on ${positionAndLetter(e, clef, position, terminology)}.`;
}

export const KEY_SIGNATURE_FULL = 'The key signature is full: there is room for seven signs.';

/** Passage description for the surface: the clef and the signs placed so far, in order. */
export function describeKeySignatureStave(
  e: Engines,
  clef: Clef,
  signs: readonly { sign: 1 | -1; position: number }[],
  terminology: Terminology = 'uk',
): string {
  const lead = `${strings(terminology).clef[clef]}. Key signature area.`;
  if (signs.length === 0) return `${lead} No signs placed yet.`;
  const list = signs.map((s) => `${SIGN_WORDS[s.sign]} on ${positionAndLetter(e, clef, s.position, terminology)}`).join('; ');
  return `${lead} ${signs.length} sign${signs.length === 1 ? '' : 's'} placed, left to right: ${list}.`;
}

export const KEY_SIGNATURE_HELP =
  'Up and Down arrows move the sign along the stave. Enter places it. Positions run from the space below the stave to the space above it.';

export const KEY_SIGNATURE_LABELS = {
  toolbar: 'Key signature tools',
  up: 'Move sign up',
  down: 'Move sign down',
  place: 'Place sign here',
} as const;
