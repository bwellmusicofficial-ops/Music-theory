import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, TimeSignature } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { BAR, nv, nvs } from '@/lesson/questions/notation/reason-helpers';
import { beatNumber, eventStarts, isBeamable, joinsOf, sameJoins, targetJoins } from './beams';
import type { FixBeamingAnswer, FixBeamingPayload } from './types';

function checkBeams(bar: Bar, beams: unknown): number[][] {
  if (!Array.isArray(beams)) throw new TheoryError('fix-beaming: answer has no `beams` list');
  const used = new Set<number>();
  for (const group of beams as unknown[]) {
    if (!Array.isArray(group) || group.length < 2) throw new TheoryError('fix-beaming: a beam group needs at least two notes');
    group.forEach((i: unknown, k: number) => {
      if (!Number.isInteger(i) || !isBeamable(bar.events[i as number])) {
        throw new TheoryError(`fix-beaming: event ${String(i)} is not a note of quaver value or shorter in this bar`);
      }
      if (k > 0 && i !== (group[k - 1] as number) + 1) throw new TheoryError('fix-beaming: a beam group must be consecutive notes in order');
      if (used.has(i as number)) throw new TheoryError(`fix-beaming: event ${String(i)} is in two beam groups`);
      used.add(i as number);
    });
  }
  return beams as number[][];
}

const timeText = (time: TimeSignature) => `${time.beats}/${time.beatUnit}`;
const beatsText = (from: number, to: number) => (to === from + 1 ? `beats ${from} and ${to}` : `beats ${from} to ${to}`);

/** docs/question-payloads.md 2.11. Throws `TheoryError` for an answer the component could never produce. */
export function mark(payload: FixBeamingPayload, answer: FixBeamingAnswer): MarkResult {
  const { passage, barIndex } = payload;
  const bar = passage.bars[barIndex];
  if (!bar) throw new TheoryError(`fix-beaming: there is no bar ${barIndex}`);
  const { time } = passage;
  const learner = joinsOf(bar, checkBeams(bar, answer?.beams));
  // The standard beaming, or its multi-beat groups beamed one beat at a time: whichever the learner is nearer.
  const standard = targetJoins(bar, time, learner);
  if (sameJoins(learner, standard)) return { correct: true, score: 1 };

  // The first difference from the left, as a gap between events i and i + 1.
  const i = learner.findIndex((joined, k) => joined !== standard[k]);
  const a = i + 1;
  const b = i + 2;
  const fail = (reason: string): MarkResult => ({ correct: false, score: 0, reason });

  if (rhythm.metreKind(time) === 'compound') {
    return fail(
      `In ${timeText(time)} the ${nvs({ value: 'quaver', dots: 0 })} are grouped in threes, one group for each ${nv({ value: 'crotchet', dots: 1 })} beat.`,
    );
  }
  const starts = eventStarts(bar);
  const x = beatNumber(starts[i]!, time);
  const y = beatNumber(starts[i + 1]!, time);
  if (learner[i]) {
    const middle = time.beats === 4 && time.beatUnit === 4 && starts[i + 1]!.n * 2 === starts[i + 1]!.d;
    if (middle) return fail(`A beam should not cross the middle of a 4/4 ${BAR}, between beats 2 and 3.`);
    return fail(
      `Notes ${a} and ${b} are joined, but a beam should not cross from beat ${x} into beat ${y}. Beam each beat's ${nvs({ value: 'quaver', dots: 0 })} together.`,
    );
  }
  if (x === y) return fail(`Notes ${a} and ${b} are in the same beat, so they are beamed together.`);
  // Not joined, and the standard beams them across a beat: a whole run of beats that hold nothing but quavers.
  const group = rhythm.beamGroups(bar, time).find((g) => g.includes(i) && g.includes(i + 1))!;
  const first = beatNumber(starts[group[0]!]!, time);
  const last = beatNumber(starts[group[group.length - 1]!]!, time);
  // The learner joined some of this group's beat crossings but not this one.
  return fail(
    `${beatsText(first, last).replace(/^b/, 'B')} hold only ${nvs({ value: 'quaver', dots: 0 })}. Beam them all together, or one beat at a time, not a mixture.`,
  );
}
