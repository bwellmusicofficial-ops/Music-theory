import { rhythm } from '@/engine/rhythm';
import { pitch } from '@/engine/pitch';
import type { Duration, Pitch, Rng, ScoreEvent, TimeSignature } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Clip, Face } from '@/lesson/questions/shared';
import { C_MAJOR_KEY, dur, lengthOf, noteEvent, plain, restEvent, sameDuration } from '../shared/bars';
import { placeOptions } from '../shared/options';
import { paramsSchema, type ContrastByEarParams } from './params';

const text = (s: string): Face => ({ kind: 'text', text: s });
const T24: TimeSignature = { beats: 2, beatUnit: 4 };
const T34: TimeSignature = { beats: 3, beatUnit: 4 };
const T44: TimeSignature = { beats: 4, beatUnit: 4 };

/** Treble stave positions of C4 to D5: the clips stay on natural notes in this range. */
const POSITIONS = [-2, -1, 0, 1, 2, 3, 4, 5, 6];
const at = (pos: number): Pitch => pitch.pitchAtStavePosition(pos, 'treble');

const clip = (events: ScoreEvent[], time: TimeSignature, bpm: number): Clip => ({
  passage: { clef: 'treble', key: C_MAJOR_KEY, time, bars: [{ events }] },
  bpm,
});
const crotchet = (pos: number): ScoreEvent => noteEvent(dur('crotchet'), at(pos));

const LABELS = ['A', 'B'] as const;
type Which = 0 | 1;

/** Two options "Clip A" and "Clip B", in that order, with the reason for the wrong one. */
function clipOptions(correct: Which, reasonFor: (chosen: string, other: string) => string) {
  const options = LABELS.map((label, i) => ({
    id: i === 0 ? 'a' : 'b',
    face: text(`Clip ${label}`),
    ...(i === correct ? {} : { reason: reasonFor(label, LABELS[correct]!) }),
  }));
  return { options, correct: correct === 0 ? 'a' : 'b' };
}

/** docs/generators-grade-1.md 3.18: the rng calls per `ask` are in the table there. */
export function generate(params: ContrastByEarParams, rng: Rng): GeneratedQuestion {
  const bpm = params.bpm ?? 80;

  switch (params.ask) {
    case 'higher':
    case 'lower': {
      const p1 = rng.pick(POSITIONS);
      const p2 = rng.pick(POSITIONS.filter((p) => Math.abs(p - p1) >= 3));
      const clips = [p1, p2].map((p) => clip([noteEvent(dur('minim'), at(p))], T24, bpm));
      const wantHigher = params.ask === 'higher';
      const correct: Which = (p1 > p2) === wantHigher ? 0 : 1;
      return {
        type: 'by-ear',
        prompt: `Which clip sounds ${wantHigher ? 'higher' : 'lower'}?`,
        payload: {
          clips,
          ...clipOptions(correct, (x, y) =>
            wantHigher
              ? `Clip ${x} sounds lower than clip ${y}. Listen for the clip that sounds higher.`
              : `Clip ${x} sounds higher than clip ${y}. Listen for the clip that sounds lower.`,
          ),
        },
      };
    }
    case 'direction': {
      const dir = rng.pick(['up', 'down', 'same'] as const);
      const step = rng.pick([1, 2]);
      const d = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
      const starts = POSITIONS.filter((s) => s + 2 * step * d >= -2 && s + 2 * step * d <= 6);
      const start = rng.pick(starts);
      const events = [0, 1, 2].map((i) => crotchet(start + i * step * d));
      const label = { up: 'going up', down: 'going down', same: 'staying the same' };
      const heard = { up: 'get higher one by one', down: 'get lower one by one', same: 'stay on the same note' };
      const placed = placeOptions<Face>(
        rng,
        text(dir === 'same' ? 'Staying the same' : `Going ${dir}`),
        (['up', 'down', 'same'] as const)
          .filter((o) => o !== dir)
          .map((o) => ({
            face: text(o === 'same' ? 'Staying the same' : `Going ${o}`),
            reason: `The notes ${heard[dir]}, so the tune is ${label[dir]}, not ${label[o]}.`,
          })),
      );
      return { type: 'by-ear', prompt: 'Does the tune go up, go down or stay the same?', payload: { clips: [clip(events, T34, bpm)], ...placed } };
    }
    case 'step-or-jump': {
      const kind = rng.pick(['step', 'jump'] as const);
      const n = kind === 'step' ? 2 : rng.pick([4, 5, 6]);
      const start = rng.pick(POSITIONS.filter((s) => s + n - 1 <= 6));
      const events = [crotchet(start), crotchet(start + n - 1)];
      const placed = placeOptions<Face>(rng, text(kind === 'step' ? 'A step' : 'A jump'), [
        kind === 'step'
          ? { face: text('A jump'), reason: 'The two notes sit close together, next door to each other. That is a step, not a jump.' }
          : { face: text('A step'), reason: 'The second note is well away from the first. A step moves to the next note along; this is a jump.' },
      ]);
      return { type: 'by-ear', prompt: 'Is this a step or a jump?', payload: { clips: [clip(events, T24, bpm)], ...placed } };
    }
    case 'bigger-jump': {
      const sizes = [3, 4, 5, 6];
      const n1 = rng.pick(sizes);
      const n2 = rng.pick(sizes.filter((s) => Math.abs(s - n1) >= 2));
      const s1 = rng.pick(POSITIONS.filter((s) => s + n1 - 1 <= 6));
      const s2 = rng.pick(POSITIONS.filter((s) => s + n2 - 1 <= 6));
      const clips = [
        clip([crotchet(s1), crotchet(s1 + n1 - 1)], T24, bpm),
        clip([crotchet(s2), crotchet(s2 + n2 - 1)], T24, bpm),
      ];
      const correct: Which = n1 > n2 ? 0 : 1;
      return {
        type: 'by-ear',
        prompt: 'Which clip has the bigger jump?',
        payload: {
          clips,
          ...clipOptions(correct, (x, y) => `Clip ${x}'s notes sit closer together, so that is the smaller jump. Clip ${y} has the bigger jump.`),
        },
      };
    }
    case 'longer':
    case 'shorter': {
      const values = params.values ?? [dur('semibreve'), dur('minim'), dur('crotchet')];
      const v1 = rng.pick(values);
      const v2 = rng.pick(values.filter((v) => !sameDuration(v, v1)));
      const G4 = at(2);
      const build = (v: Duration) => {
        const gap = rhythm.addFractions(rhythm.barLength(T44), { n: -lengthOf(v).n, d: lengthOf(v).d });
        const rests = gap.n === 0 ? [] : rhythm.restsToFill(lengthOf(v), gap, T44);
        return clip([noteEvent(plain(v), G4), ...rests.map(restEvent)], T44, bpm);
      };
      const wantLonger = params.ask === 'longer';
      const firstLonger = rhythm.compareFractions(lengthOf(v1), lengthOf(v2)) > 0;
      const correct: Which = firstLonger === wantLonger ? 0 : 1;
      return {
        type: 'by-ear',
        prompt: `Which clip has the ${wantLonger ? 'longer' : 'shorter'} note?`,
        payload: {
          clips: [build(v1), build(v2)],
          ...clipOptions(correct, (x, y) =>
            wantLonger
              ? `Clip ${x} holds its note for less time than clip ${y}. Listen for the note that lasts longer before it stops.`
              : `Clip ${x} holds its note for more time than clip ${y}. Listen for the note that stops sooner.`,
          ),
        },
      };
    }
  }
}

export const contrastByEar: QuestionGenerator<ContrastByEarParams> = {
  id: 'contrast-by-ear',
  paramsSchema,
  generate: (params, rng) => generate(params, rng),
};
