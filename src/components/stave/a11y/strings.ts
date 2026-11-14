/** All fixed words for announcements, keyed by terminology. */
import type { Terminology } from '@/engine/types';

export interface Strings {
  bar: string;
  barPlural: string;
  stave: string;
  note: string;
  of: string;
  clef: Record<'treble' | 'bass' | 'alto' | 'tenor', string>;
}

const UK: Strings = {
  bar: 'Bar',
  barPlural: 'Bars',
  stave: 'stave',
  note: 'note',
  of: 'of',
  clef: { treble: 'Treble clef', bass: 'Bass clef', alto: 'Alto clef', tenor: 'Tenor clef' },
};
const US: Strings = { ...UK, bar: 'Measure', barPlural: 'Measures', stave: 'staff' };

export function strings(t: Terminology): Strings {
  return t === 'us' ? US : UK;
}

export const SIGN_WORDS: Record<number, string> = {
  [-2]: 'double flat',
  [-1]: 'flat',
  0: 'natural',
  1: 'sharp',
  2: 'double sharp',
};

export const MESSAGES = {
  undone: 'Undone.',
  redone: 'Redone.',
  fixed: 'That note is fixed.',
  full: 'This bar is full.',
  tooHigh: 'Too high for this stave.',
  tooLow: 'Too low for this stave.',
  notAvailable: 'Not available here.',
  inChord: 'That note is already in the chord.',
  tied: 'Tied to next note.',
  tieRemoved: 'Tie removed.',
  empty: 'empty',
  tiedWord: 'tied',
  signRemoved: 'sign removed',
  signAdded: 'sign added',
} as const;

/** One help sentence group for the surface (6.1). Only bindings available in the current palette. */
export function keyHelp(opts: {
  singleNote: boolean;
  durations: boolean;
  rests: boolean;
  dots: boolean;
  signs: boolean;
  ties: boolean;
  chords: boolean;
  terminology: Terminology;
}): string {
  const parts: string[] = [];
  if (opts.singleNote) {
    parts.push('Up and Down arrows move the note one step; hold Shift to move an octave.');
    parts.push('Letters A to G set the note.');
  } else {
    parts.push('Arrow keys move between notes.');
    parts.push('Up and Down arrows change the pitch of the selected note; hold Shift for an octave.');
    parts.push('Letters A to G add a note.');
    if (opts.rests) parts.push('R adds a rest.');
    if (opts.durations) parts.push('Number keys 2 to 8 choose the note length.');
    if (opts.dots) parts.push('Full stop adds a dot.');
    if (opts.ties) parts.push('T ties to the next note.');
    if (opts.chords) parts.push('Shift with a letter adds a note to a chord.');
    parts.push('Backspace deletes.');
  }
  if (opts.signs) parts.push('Plus makes sharp, minus makes flat, N makes natural.');
  parts.push('Space plays the selected note. Control Z undoes.');
  return parts.join(' ');
}

export const PALETTE_LABELS = {
  toolbar: 'Note tools',
  rest: 'Rest',
  dot: 'Dot',
  tie: 'Tie to next note',
  chord: 'Chord',
  previous: 'Previous note',
  next: 'Next note',
  up: 'Move up',
  down: 'Move down',
  add: 'Add note',
  undo: 'Undo',
  redo: 'Redo',
  delete: 'Delete',
  flat: 'Flat',
  natural: 'Natural',
  sharp: 'Sharp',
  doubleFlat: 'Double flat',
  doubleSharp: 'Double sharp',
} as const;

export const SURFACE_ROLE_DESCRIPTION = 'music stave editor';
