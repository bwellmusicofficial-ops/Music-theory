import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Accidental, Letter, Pitch, PitchClass } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { pitchName, where } from '@/lesson/questions/notation/reason-helpers';
import type { NoteOnStaveAnswer, NoteOnStaveIdentify, NoteOnStavePayload, NoteOnStavePlace } from './types';

const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function checkLetter(letter: unknown): asserts letter is Letter {
  if (!LETTERS.includes(letter as Letter)) throw new TheoryError(`note-on-stave: "${String(letter)}" is not a note letter`);
}

function checkAccidental(accidental: unknown): asserts accidental is Accidental {
  if (typeof accidental !== 'number' || !Number.isInteger(accidental) || accidental < -2 || accidental > 2) {
    throw new TheoryError(`note-on-stave: "${String(accidental)}" is not an accidental`);
  }
}

/** The accidental the key signature gives this letter, or 0. */
function signatureAccidental(payload: NoteOnStavePayload, letter: Letter): Accidental {
  const signs = pitch.signatureAccidentals(pitch.keySignature(payload.key));
  return signs.find((pc) => pc.letter === letter)?.accidental ?? 0;
}

function markIdentify(payload: NoteOnStaveIdentify, name: PitchClass): MarkResult {
  checkLetter(name.letter);
  checkAccidental(name.accidental);
  const shown = payload.pitch;
  if (name.letter === shown.letter && name.accidental === shown.accidental) return { correct: true, score: 1 };

  if (name.letter !== shown.letter) {
    const pos = pitch.stavePosition(shown, payload.clef);
    return {
      correct: false,
      score: 0,
      reason: `That note is ${where(pos)} of the ${payload.clef} stave, which is ${pitchName(shown)}, not ${pitchName(name)}.`,
    };
  }
  // The key signature explains the sign only when it is the sign the note carries.
  if (signatureAccidental(payload, shown.letter) === shown.accidental && shown.accidental !== 0) {
    return {
      correct: false,
      score: 0,
      reason: `Right letter, but the key signature turns every ${shown.letter} into ${pitchName(shown)}, so this note is ${pitchName(shown)}.`,
    };
  }
  return {
    correct: false,
    score: 0,
    reason: `Right letter, but check the sign in front of the note: it is ${pitchName(shown)}, not ${pitchName(name)}.`,
  };
}

/** Stave position, nearest to `from`, whose letter is `letter` (candidates are 7 apart, so never a tie). */
function nearestPositionOf(letter: Letter, from: number, clef: NoteOnStavePayload['clef']): number {
  const base = pitch.stavePosition({ letter, accidental: 0, octave: 4 }, clef);
  const shift = Math.round((from - base) / 7);
  return base + shift * 7;
}

function markPlace(payload: NoteOnStavePlace, placed: Pitch): MarkResult {
  checkLetter(placed.letter);
  checkAccidental(placed.accidental);
  if (typeof placed.octave !== 'number' || !Number.isInteger(placed.octave)) {
    throw new TheoryError(`note-on-stave: "${String(placed.octave)}" is not an octave`);
  }
  const { target, clef } = payload;
  const sameLetter = placed.letter === target.letter;
  const sameOctave = payload.octave === undefined || placed.octave === payload.octave;
  const sameSign = placed.accidental === target.accidental;
  if (sameLetter && sameOctave && sameSign) return { correct: true, score: 1 };

  const placedPos = pitch.stavePosition(placed, clef);
  if (!sameLetter) {
    const nearPos = nearestPositionOf(target.letter, placedPos, clef);
    const natural: PitchClass = { letter: placed.letter, accidental: 0 };
    return {
      correct: false,
      score: 0,
      reason: `You put the note ${where(placedPos)}, which is ${pitchName(natural)}. ${target.letter} is ${where(nearPos)}.`,
    };
  }
  if (!sameOctave) {
    const targetPos = pitch.stavePosition({ ...target, octave: payload.octave as number }, clef);
    return {
      correct: false,
      score: 0,
      reason: `That is a ${target.letter}, but not the one asked for. You need the ${target.letter} ${where(targetPos)}, which is ${targetPos > placedPos ? 'higher' : 'lower'} than yours.`,
    };
  }
  if (target.accidental !== 0) {
    return {
      correct: false,
      score: 0,
      reason: `Right place, but ${pitchName(target)} needs a ${target.accidental > 0 ? 'sharp' : 'flat'} sign in front of it.`,
    };
  }
  return {
    correct: false,
    score: 0,
    reason: `Right place, but this should be a plain ${target.letter}. Yours is ${pitchName(placed)}.`,
  };
}

/** docs/question-payloads.md 2.4. Throws `TheoryError` for an answer the component could never produce. */
export function mark(payload: NoteOnStavePayload, answer: NoteOnStaveAnswer): MarkResult {
  if (!answer || answer.mode !== payload.mode) {
    throw new TheoryError(`note-on-stave: a "${String((answer as { mode?: unknown } | undefined)?.mode)}" answer does not fit a "${payload.mode}" question`);
  }
  if (payload.mode === 'identify' && answer.mode === 'identify') {
    if (!answer.name) throw new TheoryError('note-on-stave: identify answer has no name');
    return markIdentify(payload, answer.name);
  }
  if (payload.mode === 'place' && answer.mode === 'place') {
    if (!answer.pitch) throw new TheoryError('note-on-stave: place answer has no pitch');
    return markPlace(payload, answer.pitch);
  }
  throw new TheoryError('note-on-stave: unreachable');
}
