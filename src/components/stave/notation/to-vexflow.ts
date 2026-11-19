/** Pure translation of engine types to VexFlow strings (docs/stave-interaction.md 0 and 1.4). */
import type { Accidental, Bar, Clef, Duration, Key, NoteValue, Pitch, TimeSignature } from '@/engine/types';
import type { Engines } from '../types';

export function vexKey(p: Pitch): string {
  return `${p.letter.toLowerCase()}/${p.octave}`;
}

const CODES: Record<NoteValue, string> = {
  breve: '1/2',
  semibreve: 'w',
  minim: 'h',
  crotchet: 'q',
  quaver: '8',
  semiquaver: '16',
  demisemiquaver: '32',
};

export function durationCode(value: NoteValue, isRest: boolean): string {
  return CODES[value] + (isRest ? 'r' : '');
}

/** Rest key: the middle line, except the semibreve rest which hangs from the fourth line (position 6). */
export function restKey(e: Engines, value: NoteValue, clef: Clef): string {
  return vexKey(e.pitch.pitchAtStavePosition(value === 'semibreve' ? 6 : 4, clef));
}

/** Major-key name of the signature, as VexFlow's key spec ('C', 'F#', 'Cb'). */
export function keySpec(e: Engines, key: Key): string {
  const sig = e.pitch.keySignature(key);
  const tonic = e.pitch.keyFromSignature(sig, 'major').tonic;
  return tonic.letter + (tonic.accidental === 1 ? '#' : tonic.accidental === -1 ? 'b' : '');
}

export function timeSpec(t: TimeSignature): string {
  return `${t.beats}/${t.beatUnit}`;
}

export function accidentalType(sign: Accidental): string {
  return ({ [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' } as Record<number, string>)[sign];
}

const SHORT = new Set<NoteValue>(['quaver', 'semiquaver', 'demisemiquaver']);

/**
 * Beam groups, restricted to notes of quaver or shorter, at least two each. Errors give no beams.
 * `bar.beams`, when present, is what is written and replaces the standard grouping ([] draws no beams).
 */
export function beamIndexGroups(e: Engines, bar: Bar, time: TimeSignature): number[][] {
  let groups: number[][];
  if (bar.beams) {
    groups = bar.beams;
  } else {
    try {
      groups = e.rhythm.beamGroups(bar, time);
    } catch {
      return [];
    }
  }
  return groups
    .map((g) => g.filter((i) => bar.events[i]?.kind === 'note' && SHORT.has(bar.events[i].duration.value)))
    .filter((g) => g.length >= 2);
}

// --- expression (docs/expression.md section 4) --------------------------------

export const ARTICULATION_CODES = { staccato: 'a.', accent: 'a>', tenuto: 'a-' } as const;

const TEMPO_CODES: Record<NoteValue, string> = {
  breve: '1/2',
  semibreve: 'w',
  minim: 'h',
  crotchet: 'q',
  quaver: '8',
  semiquaver: '16',
  demisemiquaver: '32',
};

/**
 * The note that `bpm` counts, as StaveTempo wants it. Default: the felt beat of the time
 * signature (a dotted note in compound time; the written beat unit in irregular metres).
 */
export function tempoBeat(time: TimeSignature, beat?: Duration): { duration: string; dots: number } {
  if (beat) return { duration: TEMPO_CODES[beat.value], dots: beat.dots };
  const compound = time.beats === 6 || time.beats === 9 || time.beats === 12;
  const unit = compound ? time.beatUnit / 2 : time.beatUnit;
  const value: NoteValue = ({ 1: 'semibreve', 2: 'minim', 4: 'crotchet', 8: 'quaver', 16: 'semiquaver' } as Record<number, NoteValue>)[unit] ?? 'crotchet';
  return { duration: TEMPO_CODES[value], dots: compound ? 1 : 0 };
}
