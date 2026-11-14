import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Fraction, TimeSignature } from '@/engine/types';

/** `nv(d)`: "dotted " or "double-dotted " by `d.dots`, then `[[value|value]]` (docs/question-payloads.md 1.4). */
export function nv(d: Duration): string {
  const dots = d.dots === 1 ? 'dotted ' : d.dots === 2 ? 'double-dotted ' : '';
  return `${dots}[[${d.value}|${d.value}]]`;
}

/** `nvs(d)`: as `nv` with an `s` added inside the shown text. */
export function nvs(d: Duration): string {
  const dots = d.dots === 1 ? 'dotted ' : d.dots === 2 ? 'double-dotted ' : '';
  return `${dots}[[${d.value}|${d.value}s]]`;
}

/** `Bar` / `bar` as glossary links. */
export const BAR = '[[bar|bar]]';
export const BAR_CAPITAL = '[[bar|Bar]]';

const QUARTERS = ['', '¼', '½', '¾'];

/**
 * `beats(len, time)`: a length as a count of beats, where one beat is
 * `1 / time.beatUnit` of a semibreve. Whole numbers as digits, quarters as
 * ¼ ½ ¾ after the whole part, anything else to two decimal places. " beat"
 * when the count is 1 or less, otherwise " beats".
 */
export function beats(len: Fraction, time: TimeSignature): string {
  const b = (len.n * time.beatUnit) / len.d;
  const quarters = Math.round(b * 4);
  let text: string;
  if (Math.abs(b * 4 - quarters) < 1e-9) {
    const whole = Math.floor(quarters / 4);
    const part = QUARTERS[quarters % 4] as string;
    text = whole === 0 ? part || '0' : `${whole}${part}`;
  } else {
    text = b.toFixed(2);
  }
  return `${text}${b <= 1 + 1e-9 ? ' beat' : ' beats'}`;
}

/** One sounded note, with any notes tied to it folded in. */
export interface Onset {
  /** The duration of the first note of the group. */
  duration: Duration;
  /** Total length including tied notes. */
  length: Fraction;
  /** How many written notes make up this onset (2 or more means tied). */
  notes: number;
  /** Total length of the rests since the previous onset ended (for the first onset, the rests before it). */
  gapBefore: Fraction;
}

const ZERO: Fraction = { n: 0, d: 1 };

/** The sounded onsets of a rhythm, in order. Matches `rhythm.onsetTimes`: rests and tied continuations are not onsets. */
export function onsetsOf(bars: Bar[]): Onset[] {
  const out: Onset[] = [];
  let gap = ZERO;
  let tiedFromPrevious = false;
  for (const bar of bars) {
    for (const event of bar.events) {
      const length = rhythm.durationLength(event.duration);
      if (event.kind === 'rest') {
        gap = rhythm.addFractions(gap, length);
        tiedFromPrevious = false;
        continue;
      }
      if (tiedFromPrevious && out.length > 0) {
        const last = out[out.length - 1] as Onset;
        last.length = rhythm.addFractions(last.length, length);
        last.notes += 1;
      } else {
        out.push({ duration: event.duration, length, notes: 1, gapBefore: gap });
        gap = ZERO;
      }
      tiedFromPrevious = event.tieToNext === true;
    }
  }
  return out;
}

export const isZero = (f: Fraction): boolean => f.n === 0;
