import type { Duration, Fraction, TimeSignature } from '@/engine/types';
import { beats } from '@/lesson/questions/notation/reason-helpers';
import { lengthOf, T44 } from './bars';

/** A length as `beats()` text ("1½ beats"), with a crotchet beat unless `time` says otherwise. */
export const beatsText = (len: Fraction, time: TimeSignature = T44): string => beats(len, time);

export const durationBeats = (d: Duration, time: TimeSignature = T44): string => beats(lengthOf(d), time);

/** A count of crotchet beats (a number, possibly with halves and quarters) as `beats()` text. */
export function crotchetsText(count: number, time: TimeSignature = T44): string {
  return beats({ n: Math.round(count * 4), d: 16 }, time);
}

/** Just the number part of `beats()` text: "1½". */
export const beatsNumber = (text: string): string => text.replace(/ beats?$/, '');
