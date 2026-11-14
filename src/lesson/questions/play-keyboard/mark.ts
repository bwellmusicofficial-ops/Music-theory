import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Pitch } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { joinList, name, playedName } from './reason';
import type { PlayKeyboardAnswer, PlayKeyboardPayload } from './types';

const LETTERS = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);

function assertPitch(value: unknown, where: string): asserts value is Pitch {
  const p = value as Partial<Pitch> | null;
  if (
    typeof p !== 'object' ||
    p === null ||
    typeof p.letter !== 'string' ||
    !LETTERS.has(p.letter) ||
    typeof p.accidental !== 'number' ||
    !Number.isInteger(p.accidental) ||
    Math.abs(p.accidental) > 2 ||
    typeof p.octave !== 'number' ||
    !Number.isInteger(p.octave)
  ) {
    throw new TheoryError(`play-keyboard: ${where} is not a pitch`);
  }
}

/** Two pitches match on `toMidi` (exact) or on `chroma` (any octave). Spelling is ignored. */
function matches(a: Pitch, b: Pitch, octave: PlayKeyboardPayload['octave']): boolean {
  return octave === 'exact' ? pitch.toMidi(a) === pitch.toMidi(b) : pitch.chroma(a) === pitch.chroma(b);
}

/**
 * "Too high or too low" for `octave: 'any'`: compares the played key with the
 * nearest key in range that has the target's name. On an exact tie the lower
 * key is taken, so the played key counts as too high.
 */
function nearestSameName(payload: PlayKeyboardPayload, target: Pitch, played: Pitch): number {
  const low = pitch.toMidi(payload.low);
  const high = pitch.toMidi(payload.high);
  const chroma = pitch.chroma(target);
  const playedMidi = pitch.toMidi(played);
  let best = pitch.toMidi(target);
  let bestDistance = Math.abs(best - playedMidi);
  for (let midi = low; midi <= high; midi += 1) {
    if (((midi % 12) + 12) % 12 !== chroma) continue;
    const distance = Math.abs(midi - playedMidi);
    if (distance < bestDistance || (distance === bestDistance && midi < best)) {
      best = midi;
      bestDistance = distance;
    }
  }
  return best;
}

function markSequence(payload: PlayKeyboardPayload, played: Pitch[]): MarkResult {
  const { targets, octave } = payload;
  if (played.length !== targets.length) {
    throw new TheoryError(
      `play-keyboard: a sequence answer needs ${targets.length} notes, got ${played.length}`,
    );
  }
  let matching = 0;
  let first = -1;
  targets.forEach((target, index) => {
    if (matches(target, played[index] as Pitch, octave)) matching += 1;
    else if (first === -1) first = index;
  });
  const score = matching / targets.length;
  if (first === -1) return { correct: true, score: 1 };

  const target = targets[first] as Pitch;
  const got = played[first] as Pitch;
  const single = targets.length === 1;
  const subject = single ? 'That' : `Note ${first + 1}`;

  if (octave === 'exact' && pitch.chroma(target) === pitch.chroma(got)) {
    const side = pitch.toMidi(target) > pitch.toMidi(got) ? 'right' : 'left';
    return {
      correct: false,
      score,
      reason: `${subject} is the right letter but the wrong key. You need the ${name(target)} further to the ${side}.`,
    };
  }
  const reference = octave === 'exact' ? pitch.toMidi(target) : nearestSameName(payload, target, got);
  const direction = pitch.toMidi(got) > reference ? 'high' : 'low';
  const should = single ? 'That should be' : `Note ${first + 1} should be`;
  return {
    correct: false,
    score,
    reason: `${should} ${name(target)}, but you played ${playedName(got, targets)}, which is too ${direction}.`,
  };
}

function markTogether(payload: PlayKeyboardPayload, played: Pitch[]): MarkResult {
  const { targets, octave } = payload;
  const ordered = [...played].sort((a, b) => pitch.toMidi(a) - pitch.toMidi(b));
  for (let i = 1; i < ordered.length; i += 1) {
    if (pitch.toMidi(ordered[i] as Pitch) === pitch.toMidi(ordered[i - 1] as Pitch)) {
      throw new TheoryError('play-keyboard: a chord answer cannot hold the same key twice');
    }
  }
  const matched = targets.filter((target) => ordered.some((p) => matches(target, p, octave))).length;
  const score = matched / Math.max(targets.length, ordered.length);
  if (score === 1) return { correct: true, score: 1 };

  const list = joinList(targets.map(name));
  if (ordered.length < targets.length) {
    const keys = ordered.length === 1 ? 'key' : 'keys';
    return {
      correct: false,
      score,
      reason: `You chose ${ordered.length} ${keys}, but this needs ${targets.length}: ${list}.`,
    };
  }
  const wrong = ordered.find((p) => !targets.some((target) => matches(target, p, octave)));
  if (wrong) {
    return {
      correct: false,
      score,
      reason: `${playedName(wrong, targets)} does not belong. The notes are ${list}.`,
    };
  }
  // Only reachable with octave 'any': two keys share one note name, so a target is left out.
  return {
    correct: false,
    score,
    reason: `Two of your keys have the same note name, so a note is missing. The notes are ${list}.`,
  };
}

/** docs/question-payloads.md 2.5. */
export function mark(payload: PlayKeyboardPayload, answer: PlayKeyboardAnswer): MarkResult {
  if (!answer || !Array.isArray(answer.played)) {
    throw new TheoryError('play-keyboard: the answer needs a `played` list');
  }
  answer.played.forEach((p, index) => assertPitch(p, `played[${index}]`));
  return payload.mode === 'sequence'
    ? markSequence(payload, answer.played)
    : markTogether(payload, answer.played);
}
