import { pitch } from '@/engine/pitch';
import type { Accidental, Clef, Key, Letter, Passage, Pitch, PitchClass } from '@/engine/types';
import { C_MAJOR_KEY, T44, dur } from './bars';

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** E sharp, B sharp, C flat and F flat are not worth drawing in a first lesson. */
export const AWKWARD = new Set(['E1', 'B1', 'C-1', 'F-1']);

export const majorKey = (letter: Letter): Key => ({ tonic: { letter, accidental: 0 }, mode: 'major' });

export const nat = (letter: Letter, octave: number): Pitch => ({ letter, accidental: 0, octave });

/** The accidental the key signature gives a letter, or 0. */
export function signAccidental(key: Key, letter: Letter): Accidental {
  return pitch.signatureAccidentals(pitch.keySignature(key)).find((pc) => pc.letter === letter)?.accidental ?? 0;
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** "no sharps or flats", "one sharp, F♯", "two sharps, F♯ and C♯", "one flat, B♭". */
export function describeSignature(key: Key): string {
  const signature = pitch.keySignature(key);
  if (signature === 0) return 'no sharps or flats';
  const names = pitch.signatureAccidentals(signature).map(pitch.displayPitchClass);
  const count = Math.abs(signature);
  return `${NUMBER_WORDS[count]} ${signature > 0 ? 'sharp' : 'flat'}${count > 1 ? 's' : ''}, ${joinNames(names)}`;
}

/** The sharps or flats alone: "F♯ and C♯", or "no sharps or flats". */
export function signatureNames(key: Key): string {
  const signature = pitch.keySignature(key);
  if (signature === 0) return 'No sharps or flats';
  return joinNames(pitch.signatureAccidentals(signature).map(pitch.displayPitchClass));
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "F♯", or "F natural" for a plain note where the sign matters. */
export function nameWithNatural(pc: PitchClass): string {
  return pc.accidental === 0 ? `${pc.letter} natural` : pitch.displayPitchClass({ letter: pc.letter, accidental: pc.accidental });
}

/** One 4/4 bar holding one semibreve (or chord) of `pitches`. */
export function semibreveBar(pitches: Pitch[], clef: Clef, key: Key = C_MAJOR_KEY): Passage {
  return {
    clef,
    key,
    time: { ...T44 },
    bars: [{ events: [{ kind: 'note', pitches, duration: dur('semibreve') }] }],
  };
}

/** A whole bar of silence, to show a clef and key signature on their own. */
export function silentBar(clef: Clef, key: Key): Passage {
  return { clef, key, time: { ...T44 }, bars: [{ events: [{ kind: 'rest', duration: dur('semibreve') }] }] };
}

/**
 * A semitone above or below a natural note as a keyboard player names it: the next
 * natural when it is a semitone away (E to F), otherwise the same letter with a sharp (up)
 * or flat (down).
 */
export function semitoneStep(p: Pitch, direction: 'up' | 'down'): Pitch {
  const pos = pitch.stavePosition(p, 'treble');
  const neighbour = pitch.pitchAtStavePosition(pos + (direction === 'up' ? 1 : -1), 'treble');
  const gap = direction === 'up' ? pitch.toMidi(neighbour) - pitch.toMidi(p) : pitch.toMidi(p) - pitch.toMidi(neighbour);
  if (gap === 1) return neighbour;
  return { ...p, accidental: direction === 'up' ? 1 : -1 };
}

/** A tone above or below, correctly spelled by the engine. */
export function toneStep(p: Pitch, direction: 'up' | 'down'): Pitch {
  return pitch.transpose(p, { quality: 'major', number: 2 }, direction);
}

/** The name of the key at `midi` as a keyboard shows it: a letter, or a sharp (flat when `flats`). */
export function keyNameAtMidi(midi: number, flats: boolean): string {
  const chroma = ((midi % 12) + 12) % 12;
  const natural = LETTERS.find((l) => pitch.chroma({ letter: l, accidental: 0 }) === chroma);
  if (natural) return natural;
  const lower = LETTERS.find((l) => pitch.chroma({ letter: l, accidental: 0 }) === (chroma + 11) % 12)!;
  const upper = LETTERS.find((l) => pitch.chroma({ letter: l, accidental: 0 }) === (chroma + 1) % 12)!;
  return flats ? pitch.displayPitchClass({ letter: upper, accidental: -1 }) : pitch.displayPitchClass({ letter: lower, accidental: 1 });
}

/** Letter `steps - 1` letters above `letter` (steps 1 = the letter itself). */
export function letterAbove(letter: Letter, steps: number): Letter {
  return LETTERS[(LETTERS.indexOf(letter) + steps - 1) % 7]!;
}

/** Natural pitches C4 to B4. */
export const OCTAVE_FOUR: Pitch[] = LETTERS.map((l) => nat(l, 4));
