import { pitch } from '@/engine/pitch';
import type { Degree, Key, Letter, PitchClass, Rng, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Face } from '@/lesson/questions/shared';
import { GRADE_1_TONICS } from '../shared/params';
import { placeOptions, takeDistinct } from '../shared/options';
import { describeSignature, joinNames, majorKey, signatureNames, silentBar, semibreveBar } from '../shared/pitch-utils';
import { ordinal } from '../shared/terms';
import { plainTerm } from '../shared/terms';
import { C_MAJOR_KEY } from '../shared/bars';
import { paramsSchema, type KeyFactsParams } from './params';

const text = (s: string): Face => ({ kind: 'text', text: s });
const name = (pc: PitchClass): string => pitch.displayPitchClass(pc);

/** The note on scale degree `k` (1 to 8; 8 is the tonic again). */
const noteAt = (key: Key, k: number): PitchClass => pitch.degree(key, (((k - 1) % 7) + 1) as Degree);

/**
 * docs/generators-grade-1.md 3.14. Rng calls: (1) pick the key; then
 * name-key, accidentals, from-triad: (2) shuffle(other keys), (3) final shuffle;
 * degree-note, note-degree: (2) pick the degree n, (3) final shuffle.
 */
export function generate(params: KeyFactsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  void t;
  const keys = params.keys ?? GRADE_1_TONICS;
  const clef = params.clef ?? 'treble';
  const tonicLetter: Letter = rng.pick(keys);
  const key = majorKey(tonicLetter);
  const keyName = pitch.keyName(key);

  if (params.ask === 'degree-note' || params.ask === 'note-degree') {
    const options = params.options ?? 3;
    const n = rng.pick([2, 3, 4, 5, 6, 7]);
    if (params.ask === 'degree-note') {
      const right = noteAt(key, n);
      const fromDegree = (k: number) => ({
        pc: noteAt(key, k),
        reason: `${name(noteAt(key, k))} is note ${k} of ${keyName}, not note ${n}.`,
      });
      const noSign =
        right.accidental !== 0
          ? [{ pc: { letter: right.letter, accidental: 0 as const }, reason: `${right.letter} is not in ${keyName}: the key signature makes it ${name(right)}.` }]
          : [];
      const around = [n - 1, n + 1, n - 2, n + 2, n - 3, n + 3].filter((k) => k >= 1 && k <= 7);
      const candidates = [fromDegree(around[0]!), fromDegree(around[1]!), ...noSign, ...around.slice(2).map(fromDegree)];
      const wrong = takeDistinct(candidates, options - 1, (c) => name(c.pc), [name(right)]);
      const placed = placeOptions<Face>(
        rng,
        text(name(right)),
        wrong.map((w) => ({ face: text(name(w.pc)), reason: w.reason })),
      );
      return { type: 'multiple-choice', payload: placed, prompt: `In ${keyName}, which note is note ${n} of the scale?` };
    }
    const candidates = [n - 1, n + 1, n + 2, n - 2].filter((k) => k >= 1 && k <= 8);
    const wrong = takeDistinct(candidates, options - 1, String, [String(n)]);
    const right = noteAt(key, n);
    const placed = placeOptions<Face>(
      rng,
      text(ordinal(n)),
      wrong.map((m) => ({
        face: text(ordinal(m)),
        reason: `${name(right)} is note ${n} of ${keyName}. Note ${m} is ${name(noteAt(key, m))}.`,
      })),
    );
    return { type: 'multiple-choice', payload: placed, prompt: `In ${keyName}, which number is the note ${name(right)}?` };
  }

  const options = params.options ?? Math.min(4, keys.length);
  const others = rng.shuffle(keys.filter((k) => k !== tonicLetter)).slice(0, options - 1).map(majorKey);
  const triadNotes = (k: Key): string => {
    const notes = pitch.triadPitches({ root: k.tonic, quality: 'major', inversion: 0 }, 4);
    return joinNames(notes.map(name));
  };

  if (params.ask === 'name-key') {
    const placed = placeOptions<Face>(
      rng,
      text(keyName),
      others.map((k) => ({
        face: text(pitch.keyName(k)),
        reason: `${pitch.keyName(k)} has ${describeSignature(k)}. This signature has ${describeSignature(key)}, so the key is ${keyName}.`,
      })),
    );
    return {
      type: 'multiple-choice',
      // C major draws an empty signature, which reads as broken, so the prompt says what it shows.
      prompt: `Which key has this ${plainTerm('key-signature', 'key signature')}?${key.tonic.letter === 'C' ? ' It has no sharps or flats.' : ''}`,
      payload: { exhibit: { kind: 'passage', passage: silentBar(clef, key) }, ...placed },
    };
  }

  if (params.ask === 'accidentals') {
    const placed = placeOptions<Face>(
      rng,
      text(signatureNames(key)),
      others.map((k) => ({
        face: text(signatureNames(k)),
        reason: `That is the signature of ${pitch.keyName(k)}: ${describeSignature(k)}. ${keyName} has ${describeSignature(key)}.`,
      })),
    );
    return { type: 'multiple-choice', payload: placed, prompt: `Which notes are sharp or flat in ${keyName}?` };
  }

  // from-triad
  const triad = pitch.triadPitches({ root: key.tonic, quality: 'major', inversion: 0 }, clef === 'treble' ? 4 : 3);
  const placed = placeOptions<Face>(
    rng,
    text(keyName),
    others.map((k) => ({
      face: text(pitch.keyName(k)),
      reason: `The tonic ${plainTerm('triad')} of ${pitch.keyName(k)} is ${triadNotes(k)}. These notes are ${triadNotes(key)}, so the key is ${keyName}.`,
    })),
  );
  return {
    type: 'multiple-choice',
    prompt: `This is the tonic ${plainTerm('triad')} of a key. Which key?`,
    payload: { exhibit: { kind: 'passage', passage: semibreveBar(triad, clef, C_MAJOR_KEY) }, ...placed },
  };
}

export const keyFacts: QuestionGenerator<KeyFactsParams> = {
  id: 'key-facts',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
