/**
 * Helpers for building `reason` text (docs/question-payloads.md 1.4).
 *
 * Reasons are written in UK terms and every term with a US equivalent is a
 * glossary link, so the player's renderer can swap it.
 */

import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Duration, Fraction, PitchClass, TimeSignature } from '@/engine/types';

/** `[[bar|bar]]` and `[[bar|Bar]]`. */
export const BAR = '[[bar|bar]]';
export const BAR_CAP = '[[bar|Bar]]';

function dotWord(d: Duration): string {
  return d.dots === 1 ? 'dotted ' : d.dots === 2 ? 'double-dotted ' : '';
}

/** `dotted [[minim|minim]]`. The glossary id is the engine note value id. */
export function nv(d: Duration): string {
  return `${dotWord(d)}[[${d.value}|${d.value}]]`;
}

/** As `nv` with an `s` added inside the shown text: `[[crotchet|crotchets]]`. */
export function nvs(d: Duration): string {
  return `${dotWord(d)}[[${d.value}|${d.value}s]]`;
}

/** `pitch.displayPitchClass`, e.g. `F♯`. */
export function pitchName(pc: PitchClass): string {
  return pitch.displayPitchClass(pc);
}

const LINES_AND_SPACES: Record<number, string> = {
  0: 'on the bottom line',
  1: 'in the bottom space',
  2: 'on the second line',
  3: 'in the second space',
  4: 'on the middle line',
  5: 'in the third space',
  6: 'on the fourth line',
  7: 'in the top space',
  8: 'on the top line',
  9: 'just above the top line',
  [-1]: 'just below the bottom line',
  10: 'on the first ledger line above the [[stave|stave]]',
  [-2]: 'on the first ledger line below the [[stave|stave]]',
  11: 'just above the first ledger line above the [[stave|stave]]',
  [-3]: 'just below the first ledger line below the [[stave|stave]]',
  12: 'on the second ledger line above the [[stave|stave]]',
  [-4]: 'on the second ledger line below the [[stave|stave]]',
};

/** A stave position (`pitch.stavePosition`) in words. "stave" is a glossary link so US learners see "staff". */
export function where(pos: number): string {
  if (!Number.isInteger(pos)) throw new TheoryError(`where: stave position must be an integer, got ${pos}`);
  if (pos < -4) return 'far below the [[stave|stave]]';
  if (pos > 12) return 'far above the [[stave|stave]]';
  return LINES_AND_SPACES[pos] as string;
}

/**
 * A length as a count of beats. One beat is 1 / beatUnit of a semibreve.
 * Whole numbers are digits; quarters are ¼ ½ ¾ after the whole part; anything
 * else has two decimals. ` beat` when the count is 1 or less, else ` beats`.
 */
export function beats(len: Fraction, time: TimeSignature): string {
  const quarters = (len.n * time.beatUnit * 4) / len.d;
  const count = quarters / 4;
  let text: string;
  if (Number.isInteger(quarters)) {
    const whole = Math.floor(quarters / 4);
    const part = quarters % 4;
    const fraction = ['', '¼', '½', '¾'][part] as string;
    text = whole === 0 && part !== 0 ? fraction : `${whole}${fraction}`;
  } else {
    text = count.toFixed(2);
  }
  return `${text} ${count <= 1 ? 'beat' : 'beats'}`;
}
