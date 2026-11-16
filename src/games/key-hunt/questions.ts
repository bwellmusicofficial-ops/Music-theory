/**
 * Key Hunt: building one question. Pure; all randomness comes from the injected Rng.
 *
 * Every key, signature, accidental and key name comes from the pitch engine
 * (`keySignature`, `signatureAccidentals`, `keyFromSignature`, `keyName`).
 */
import { pitch } from '@/engine/pitch';
import type { Clef, Key, Letter, Passage, Rng } from '@/engine/types';

/** The two ways of asking the learner chooses on the start screen. */
export type AskMode = 'sig-to-key' | 'key-to-sig';
/** The two extra kinds that join in from level 2. */
export type QuestionKind = AskMode | 'which-accidental' | 'count';

export interface QuestionOption {
  /** Text on the button (and the accessible name). */
  label: string;
  /** Key-to-signature options draw this signature on a stave. */
  passage?: Passage;
}

export interface Question {
  kind: QuestionKind;
  /** The key the question is about. */
  key: Key;
  clef: Clef;
  prompt: string;
  /** What to draw above the buttons: the signature on a stave, or the key's name. */
  exhibit: { type: 'signature'; passage: Passage } | { type: 'key-name'; text: string };
  options: QuestionOption[];
  correct: number;
  /** One line, from the engine, shown when the learner is wrong or runs out of time. */
  reason: string;
  /** Plain-words description of the correct answer, for the live region. */
  answerText: string;
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

export const keyId = (key: Key): string => pitch.keyName(key);

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "no sharps or flats", "one sharp, F♯", "two sharps, F♯ and C♯", "one flat, B♭". */
export function describeSignature(key: Key): string {
  const signature = pitch.keySignature(key);
  if (signature === 0) return 'no sharps or flats';
  const names = pitch.signatureAccidentals(signature).map(pitch.displayPitchClass);
  const count = Math.abs(signature);
  return `${NUMBER_WORDS[count]} ${signature > 0 ? 'sharp' : 'flat'}${count > 1 ? 's' : ''}, ${joinNames(names)}`;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A passage that holds only a whole-bar rest, so the stave shows the clef and the key signature alone. */
export function signaturePassage(clef: Clef, key: Key): Passage {
  return {
    clef,
    key,
    time: { beats: 4, beatUnit: 4 },
    bars: [{ events: [{ kind: 'rest', duration: { value: 'semibreve', dots: 0 } }] }],
  };
}

export interface QuestionContext {
  keys: readonly Key[];
  level: number;
  /** The key of the previous question: never asked twice in a row. */
  lastKey: Key | null;
  lastKind: QuestionKind | null;
  lastClef: Clef | null;
}

/** Answer buttons at a level: three at levels 1 and 2, four from level 3. */
export function optionCountFor(level: number): number {
  return level >= 3 ? 4 : 3;
}

/** From level 3 the clef alternates; before that it is always treble. */
export function clefFor(level: number, lastClef: Clef | null): Clef {
  if (level < 3) return 'treble';
  return lastClef === 'treble' ? 'bass' : 'treble';
}

const MAIN_CHANCE = 0.5;
const ACCIDENTAL_CHANCE = 0.25; // the rest is "how many"

/** Which kind to ask. Level 1 only asks the chosen way; from level 2 the two extra kinds join in. */
export function pickKind(mode: AskMode, level: number, lastKind: QuestionKind | null, rng: Rng): QuestionKind {
  if (level < 2) return mode;
  const r = rng.next();
  const kind: QuestionKind = r < MAIN_CHANCE ? mode : r < MAIN_CHANCE + ACCIDENTAL_CHANCE ? 'which-accidental' : 'count';
  if (kind !== lastKind) return kind;
  // Not the same kind twice running: step to the next one.
  const order: QuestionKind[] = [mode, 'which-accidental', 'count'];
  return order[(order.indexOf(kind) + 1) % order.length] as QuestionKind;
}

function candidateKeys(kind: QuestionKind, keys: readonly Key[]): Key[] {
  switch (kind) {
    case 'sig-to-key':
      // A signature fits a major key and its relative minor; the buttons name the major key.
      return keys.filter((k) => k.mode === 'major');
    case 'which-accidental':
      return keys.filter((k) => pitch.keySignature(k) !== 0);
    default:
      return [...keys];
  }
}

const ALL_LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function indexOfKey(options: Key[], key: Key): number {
  return options.findIndex((k) => keyId(k) === keyId(key));
}

export function buildQuestion(mode: AskMode, ctx: QuestionContext, rng: Rng): Question {
  let kind = pickKind(mode, ctx.level, ctx.lastKind, rng);
  let pool = candidateKeys(kind, ctx.keys);
  if (pool.length === 0) {
    kind = mode;
    pool = candidateKeys(kind, ctx.keys);
  }
  if (pool.length === 0) pool = [...ctx.keys];
  // Never the same key twice in a row, while another is available.
  const fresh = ctx.lastKey ? pool.filter((k) => keyId(k) !== keyId(ctx.lastKey as Key)) : pool;
  const key = rng.pick(fresh.length > 0 ? fresh : pool);
  const name = pitch.keyName(key);
  const signature = pitch.keySignature(key);
  const described = describeSignature(key);
  const wanted = optionCountFor(ctx.level);
  const clef = kind === 'sig-to-key' || kind === 'key-to-sig' ? clefFor(ctx.level, ctx.lastClef) : (ctx.lastClef ?? 'treble');

  if (kind === 'sig-to-key') {
    const others = ctx.keys.filter((k) => k.mode === 'major' && keyId(k) !== keyId(key));
    const keys = rng.shuffle([key, ...rng.shuffle(others).slice(0, wanted - 1)]);
    return {
      kind,
      key,
      clef,
      prompt: 'Which major key has this signature?',
      exhibit: { type: 'signature', passage: signaturePassage(clef, key) },
      options: keys.map((k) => ({ label: pitch.keyName(k) })),
      correct: indexOfKey(keys, key),
      reason: `${capitalise(described)}: that is ${name}`,
      answerText: name,
    };
  }

  if (kind === 'key-to-sig') {
    const seen = new Set<number>([signature]);
    const others: Key[] = [];
    for (const k of rng.shuffle([...ctx.keys])) {
      const s = pitch.keySignature(k);
      if (seen.has(s)) continue;
      seen.add(s);
      others.push(k);
    }
    // Each option is drawn as the major key of its signature, so a minor key in the pool never changes the picture.
    const signatures = rng.shuffle([signature, ...others.slice(0, wanted - 1).map((k) => pitch.keySignature(k))]);
    const options = signatures.map((s) => {
      const drawn: Key = pitch.keyFromSignature(s, 'major');
      return { label: capitalise(describeSignature(drawn)), passage: signaturePassage(clef, drawn) };
    });
    return {
      kind,
      key,
      clef,
      prompt: 'Which signature belongs to this key?',
      exhibit: { type: 'key-name', text: name },
      options,
      correct: signatures.indexOf(signature),
      reason: `${name} has ${described}`,
      answerText: described,
    };
  }

  if (kind === 'which-accidental') {
    const accidentals = pitch.signatureAccidentals(signature);
    const right = rng.pick(accidentals);
    const taken = new Set(accidentals.map((a) => a.letter));
    const wrongLetters = rng.shuffle(ALL_LETTERS.filter((l) => !taken.has(l))).slice(0, wanted - 1);
    const letters = rng.shuffle<Letter>([right.letter, ...wrongLetters]);
    const word = signature > 0 ? 'sharp' : 'flat';
    return {
      kind,
      key,
      clef,
      prompt: `Which of these notes is ${word} in ${name}?`,
      exhibit: { type: 'key-name', text: name },
      options: letters.map((l) => ({ label: l })),
      correct: letters.indexOf(right.letter),
      reason: `${name} has ${described}`,
      answerText: `${pitch.displayPitchClass(right)}`,
    };
  }

  // count
  const count = Math.abs(signature);
  const top = Math.max(4, count + 1);
  const choices = rng.shuffle(Array.from({ length: top + 1 }, (_, i) => i).filter((i) => i !== count)).slice(0, wanted - 1);
  const counts = [count, ...choices].sort((a, b) => a - b);
  return {
    kind,
    key,
    clef,
    prompt: `How many sharps or flats does ${name} have?`,
    exhibit: { type: 'key-name', text: name },
    options: counts.map((c) => ({ label: String(c) })),
    correct: counts.indexOf(count),
    reason: `${name} has ${described}`,
    answerText: String(count),
  };
}
