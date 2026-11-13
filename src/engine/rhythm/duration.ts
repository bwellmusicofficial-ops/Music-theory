import { TheoryError } from '../api';
import type { Duration, Fraction, NoteValue, ScoreEvent, Terminology } from '../types';
import { ZERO, add, eq, frac, mul } from './fraction';

export const NOTE_VALUES: readonly NoteValue[] = [
  'breve',
  'semibreve',
  'minim',
  'crotchet',
  'quaver',
  'semiquaver',
  'demisemiquaver',
];

const BASE_LENGTH: Record<NoteValue, Fraction> = {
  breve: { n: 2, d: 1 },
  semibreve: { n: 1, d: 1 },
  minim: { n: 1, d: 2 },
  crotchet: { n: 1, d: 4 },
  quaver: { n: 1, d: 8 },
  semiquaver: { n: 1, d: 16 },
  demisemiquaver: { n: 1, d: 32 },
};

const DOT_FACTOR: Record<0 | 1 | 2, Fraction> = {
  0: { n: 1, d: 1 },
  1: { n: 3, d: 2 },
  2: { n: 7, d: 4 },
};

const UK_NAMES: Record<NoteValue, string> = {
  breve: 'breve',
  semibreve: 'semibreve',
  minim: 'minim',
  crotchet: 'crotchet',
  quaver: 'quaver',
  semiquaver: 'semiquaver',
  demisemiquaver: 'demisemiquaver',
};

const US_NOTE_NAMES: Record<NoteValue, string> = {
  breve: 'double whole note',
  semibreve: 'whole note',
  minim: 'half note',
  crotchet: 'quarter note',
  quaver: 'eighth note',
  semiquaver: 'sixteenth note',
  demisemiquaver: 'thirty-second note',
};

const US_REST_NAMES: Record<NoteValue, string> = {
  breve: 'double whole rest',
  semibreve: 'whole rest',
  minim: 'half rest',
  crotchet: 'quarter rest',
  quaver: 'eighth rest',
  semiquaver: 'sixteenth rest',
  demisemiquaver: 'thirty-second rest',
};

export function validateDuration(duration: Duration): void {
  if (!NOTE_VALUES.includes(duration.value)) {
    throw new TheoryError(`Unknown note value "${String(duration.value)}"`);
  }
  if (duration.dots !== 0 && duration.dots !== 1 && duration.dots !== 2) {
    throw new TheoryError(`Dots must be 0, 1 or 2, got ${String(duration.dots)}`);
  }
  const t = duration.tuplet;
  if (t !== undefined) {
    if (!Number.isInteger(t.actual) || !Number.isInteger(t.normal) || t.actual < 1 || t.normal < 1) {
      throw new TheoryError(
        `Tuplet ratio must be positive integers, got ${t.actual}:${t.normal}`,
      );
    }
  }
}

export function durationLength(duration: Duration): Fraction {
  validateDuration(duration);
  let length = mul(BASE_LENGTH[duration.value], DOT_FACTOR[duration.dots]);
  if (duration.tuplet) {
    length = mul(length, frac(duration.tuplet.normal, duration.tuplet.actual));
  }
  return length;
}

export function eventsLength(events: ScoreEvent[]): Fraction {
  return events.reduce((sum, e) => add(sum, durationLength(e.duration)), ZERO);
}

/** Start and end of every event, measured from the start of the bar. */
export function layout(events: ScoreEvent[]): { start: Fraction; end: Fraction }[] {
  let t = ZERO;
  return events.map((e) => {
    const start = t;
    t = add(t, durationLength(e.duration));
    return { start, end: t };
  });
}

/** The plain (untupleted) duration with exactly this length, if one exists. */
export function plainDuration(length: Fraction): Duration | null {
  for (const value of NOTE_VALUES) {
    for (const dots of [0, 1, 2] as const) {
      if (eq(durationLength({ value, dots }), length)) {
        return { value, dots };
      }
    }
  }
  return null;
}

const TUPLET_WORDS: Record<number, string> = {
  2: 'duplet',
  3: 'triplet',
  4: 'quadruplet',
  5: 'quintuplet',
  6: 'sextuplet',
  7: 'septuplet',
};

function describe(duration: Duration, names: Record<NoteValue, string>): string {
  validateDuration(duration);
  const parts: string[] = [];
  if (duration.dots === 1) parts.push('dotted');
  if (duration.dots === 2) parts.push('double-dotted');
  if (duration.tuplet) {
    parts.push(
      TUPLET_WORDS[duration.tuplet.actual] ??
        `${duration.tuplet.actual}:${duration.tuplet.normal} tuplet`,
    );
  }
  parts.push(names[duration.value]);
  return parts.join(' ');
}

export function noteValueName(duration: Duration, terminology: Terminology): string {
  return describe(duration, terminology === 'uk' ? UK_NAMES : US_NOTE_NAMES);
}

export function restName(duration: Duration, terminology: Terminology): string {
  if (terminology === 'uk') {
    return `${describe(duration, UK_NAMES)} rest`;
  }
  return describe(duration, US_REST_NAMES);
}
