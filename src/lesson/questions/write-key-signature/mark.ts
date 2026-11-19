import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { PitchClass } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { joinList, ordinal, pitchName, where } from '@/lesson/questions/notation/reason-helpers';
import { HIGHEST_POSITION, LOWEST_POSITION, MAX_SIGNS, type WriteKeySignatureAnswer, type WriteKeySignaturePayload } from './types';

const sharp = (plural: boolean) => `[[sharp|${plural ? 'sharps' : 'sharp'}]]`;
const flat = (plural: boolean) => `[[flat|${plural ? 'flats' : 'flat'}]]`;
/** `[[sharp|sharps]]` or `[[flat|flats]]` for a kind, singular or plural. */
const signWord = (kind: 1 | -1, plural: boolean) => (kind === 1 ? sharp(plural) : flat(plural));

/** docs/question-payloads.md 2.12. Throws `TheoryError` for an answer the component could never produce. */
export function mark(payload: WriteKeySignaturePayload, answer: WriteKeySignatureAnswer): MarkResult {
  const { clef, key } = payload;
  const placement = payload.placement ?? 'standard';
  if (!answer || !Array.isArray(answer.signs)) throw new TheoryError('write-key-signature: answer has no `signs` list');
  if (answer.signs.length > MAX_SIGNS) throw new TheoryError(`write-key-signature: at most ${MAX_SIGNS} signs, got ${answer.signs.length}`);
  for (const s of answer.signs) {
    if (!s || (s.sign !== 1 && s.sign !== -1) || !Number.isInteger(s.position) || s.position < LOWEST_POSITION || s.position > HIGHEST_POSITION) {
      throw new TheoryError(`write-key-signature: ${JSON.stringify(s)} is not a sign on the stave`);
    }
  }

  const signature = pitch.keySignature(key);
  const kind: 1 | -1 = signature > 0 ? 1 : -1;
  const want: PitchClass[] = pitch.signatureAccidentals(signature);
  const wantPos = pitch.keySignaturePositions(signature, clef);
  const K = pitch.keyName(key);
  const list = joinList(want.map(pitchName));
  const signs = answer.signs;
  const fail = (reason: string): MarkResult => ({ correct: false, score: 0, reason });

  if (signs.some((s) => s.sign !== kind)) {
    return fail(`${K} has ${signWord(kind, true)}, not ${signWord(kind === 1 ? -1 : 1, true)}. Its key signature is ${list}.`);
  }
  if (signs.length !== want.length) {
    return fail(`That is ${signs.length} ${signWord(kind, signs.length !== 1)}. ${K} has ${want.length}: ${list}.`);
  }
  const letters = signs.map((s) => pitch.pitchAtStavePosition(s.position, clef).letter);
  const wantLetters = want.map((pc) => pc.letter);
  const wrongAt = letters.findIndex((letter, i) => letter !== wantLetters[i]);
  if (wrongAt >= 0) {
    if ([...letters].sort().join('') === [...wantLetters].sort().join('')) {
      return fail(`Those are the right ${signWord(kind, true)}, but key signatures are written in a fixed order: ${list}.`);
    }
    const here = signs[wrongAt]!;
    const named = pitchName({ letter: letters[wrongAt]!, accidental: kind });
    return fail(`The ${ordinal(wrongAt + 1)} ${signWord(kind, false)} is ${where(here.position)}, which is ${named}. In ${K} it should be ${pitchName(want[wrongAt]!)}.`);
  }
  if (placement === 'standard') {
    const at = signs.findIndex((s, i) => s.position !== wantPos[i]);
    if (at >= 0) {
      return fail(`${pitchName(want[at]!)} is right, but in a key signature it goes ${where(wantPos[at]!)}, not ${where(signs[at]!.position)}.`);
    }
  }
  return { correct: true, score: 1 };
}
