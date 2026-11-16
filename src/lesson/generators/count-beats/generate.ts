import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Passage, Rng, Terminology, TimeSignature } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import type { Face } from '@/lesson/questions/shared';
import { buildBars, crotchetBeats, dur, sameDuration } from '../shared/bars';
import { beatsNumber, crotchetsText } from '../shared/beats-text';
import { placeOptions, takeDistinct } from '../shared/options';
import { noteLink, plainTerm, term } from '../shared/terms';
import { DEFAULT_TIMES, exchangePairs, paramsSchema, type CountBeatsParams } from './params';

const MAX_LISTED = 5;
const text = (s: string): Face => ({ kind: 'text', text: s });
const timeText = (t: TimeSignature): string => `${t.beats}/${t.beatUnit}`;
const beatWord = (x: number): string => `${x} ${x === 1 ? 'beat' : 'beats'}`;
const pl = (d: Duration, t: Terminology): string => noteLink(d, t, { plural: true });

interface Wrong {
  value: number;
  reason: string;
}

function dotted(params: CountBeatsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const values = params.values!;
  const options = params.options ?? 3;
  const d = rng.pick(values);
  const b = crotchetBeats(d);
  const correct = b * 1.5;
  const N = noteLink(d, t);
  const bT = crotchetsText(b);
  const halfT = crotchetsText(b / 2);
  const rightT = crotchetsText(correct);
  const candidates: Wrong[] = [
    { value: b, reason: `That is the plain ${N} without its dot. The dot adds half as much again: ${bT} plus ${halfT} is ${rightT}.` },
    { value: 2 * b, reason: `A dot adds half the note's length, not all of it. The dotted ${N} is ${bT} plus ${halfT}, which is ${rightT}.` },
    { value: b + 1, reason: `The dot adds half the note's own length (${halfT}), not a whole beat. The dotted ${N} lasts ${rightT}.` },
    ...[3 * b, correct + 1].map((x) => ({
      value: x,
      reason: `Half of the plain ${N}'s ${bT} is ${halfT}. Added on, that makes ${rightT}, not ${crotchetsText(x)}.`,
    })),
  ];
  const wrong = takeDistinct(candidates, options - 1, (c) => String(c.value), [String(correct)]);
  const placed = placeOptions<Face>(
    rng,
    text(rightT),
    wrong.map((w) => ({ face: text(crotchetsText(w.value)), reason: w.reason })),
  );
  return { type: 'multiple-choice', payload: placed, prompt: `How many beats does a dotted ${N} last?` };
}

function tie(params: CountBeatsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const values = params.values!;
  const options = params.options ?? 3;
  const first = rng.pick(values);
  const second = rng.pick(values.filter((v) => !sameDuration(v, first)));
  const a = crotchetBeats(first);
  const b = crotchetBeats(second);
  const sum = a + b;
  const sumT = crotchetsText(sum);
  const candidates: Wrong[] = [
    { value: a, reason: `A tie joins the notes into one sound, so the second note counts too: ${crotchetsText(a)} plus ${crotchetsText(b)} is ${sumT}.` },
    { value: b, reason: `A tie joins the notes into one sound, so the first note counts too: ${crotchetsText(a)} plus ${crotchetsText(b)} is ${sumT}.` },
    { value: sum + 1, reason: `The tie itself adds no time. It joins the notes, so the total is ${crotchetsText(a)} plus ${crotchetsText(b)}, which is ${sumT}.` },
  ];
  const wrong = takeDistinct(candidates, options - 1, (c) => String(c.value), [String(sum)]);
  const placed = placeOptions<Face>(
    rng,
    text(sumT),
    wrong.map((w) => ({ face: text(crotchetsText(w.value)), reason: w.reason })),
  );
  return {
    type: 'multiple-choice',
    payload: placed,
    prompt: `A ${plainTerm('tie')} joins one ${noteLink(first, t)} and one ${noteLink(second, t)}. How many beats in all?`,
  };
}

function exchange(params: CountBeatsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const options = params.options ?? 3;
  const pairs = exchangePairs(params.values!);
  const bigs = pairs.map((p) => p.big).filter((d, i, all) => all.findIndex((x) => sameDuration(x, d)) === i);
  const big = rng.pick(bigs);
  const { small, ratio: n } = rng.pick(pairs.filter((p) => sameDuration(p.big, big)));
  const bigT = crotchetsText(crotchetBeats(big));
  const reasonFor = (x: number): string =>
    `${x} ${x === 1 ? noteLink(small, t) : pl(small, t)} ${x === 1 ? 'lasts' : 'last'} ${crotchetsText(x * crotchetBeats(small))} in all, but the ${noteLink(big, t)} lasts ${bigT}. You need ${n}.`;
  const candidates = [2 * n, n % 2 === 0 ? n / 2 : 0, n + 2, n - 1 >= 2 ? n - 1 : 0].filter((x) => x >= 1);
  const wrong = takeDistinct(candidates, options - 1, String, [String(n)]);
  const placed = placeOptions<Face>(
    rng,
    text(String(n)),
    wrong.map((x) => ({ face: text(String(x)), reason: reasonFor(x) })),
  );
  return {
    type: 'multiple-choice',
    payload: placed,
    prompt: `How many ${pl(small, t)} last as long as one ${noteLink(big, t)}?`,
  };
}

function fits(params: CountBeatsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const times = params.times ?? DEFAULT_TIMES;
  const time = rng.pick(times);
  let bar: Bar | null = null;
  for (let attempt = 0; attempt < 50 && !bar; attempt += 1) {
    const built = buildBars(rng, time, params.values!, 1)?.[0] ?? null;
    // At most five notes, so the prompt stays short in both terminologies.
    if (built && built.events.length <= MAX_LISTED) bar = built;
  }
  if (!bar) throw new TheoryError('count-beats could not build a bar from these params');
  const lengths = bar.events.map((e) => crotchetBeats(e.duration));
  const total = lengths.reduce((s, x) => s + x, 0);
  const sum = lengths.map((x) => beatsNumber(crotchetsText(x))).join(' + ');
  const barLink = term('bar', t);
  const placed = placeOptions<Face>(
    rng,
    text(timeText(time)),
    times
      .filter((x) => x.beats !== time.beats)
      .map((x) => ({
        face: text(timeText(x)),
        reason: `${timeText(x)} means ${beatWord(x.beats)} in each ${barLink}, but these notes add up to ${crotchetsText(total)}: ${sum}.`,
      })),
  );
  if (params.showBar) {
    // The bar is shown as notation with the time signature hidden. No extra rng draw: the same seed gives the same bar.
    const passage: Passage = {
      clef: 'treble',
      key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
      time,
      bars: [bar],
    };
    return {
      type: 'multiple-choice',
      payload: { ...placed, exhibit: { kind: 'passage', passage, hideTime: true } },
      prompt: `This ${barLink} has no time signature. Which ${plainTerm('time-signature', 'time signature')} fits it?`,
    };
  }
  const notes = bar.events.map((e) => noteLink(e.duration, t)).join(', ');
  return {
    type: 'multiple-choice',
    payload: placed,
    prompt: `These notes fill one ${barLink}: ${notes}. Which ${plainTerm('time-signature', 'time signature')} fits?`,
  };
}

function meaning(params: CountBeatsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const times = params.times ?? DEFAULT_TIMES;
  const options = params.options ?? 3;
  const time = rng.pick(times);
  const part = rng.pick(['top', 'bottom'] as const);
  const barLink = term('bar', t);
  const tt = timeText(time);
  const crotchet = dur('crotchet');

  if (part === 'top') {
    const top = time.beats;
    const candidates: Wrong[] = [time.beatUnit, top + 1, top - 1, top + 2, top - 2]
      .filter((x) => x >= 1)
      .map((x) => ({
        value: x,
        reason:
          x === time.beatUnit
            ? `The bottom ${time.beatUnit} does not count the beats. The top number does: ${tt} has ${beatWord(top)} in each ${barLink}.`
            : `${beatWord(x)} would be ${x}/${time.beatUnit}. The top number of ${tt} is ${top}, so each ${barLink} has ${beatWord(top)}.`,
      }));
    const wrong = takeDistinct(candidates, options - 1, (c) => String(c.value), [String(top)]);
    const placed = placeOptions<Face>(
      rng,
      text(beatWord(top)),
      wrong.map((w) => ({ face: text(beatWord(w.value)), reason: w.reason })),
    );
    return { type: 'multiple-choice', payload: placed, prompt: `In ${tt} time, how many beats are in each ${barLink}?` };
  }

  const beatName = (d: Duration) => `Each beat is the ${noteLink(d, t)}`;
  const wrong = takeDistinct([dur('minim'), dur('quaver'), dur('semibreve')], options - 1, (d) => d.value, [crotchet.value]);
  const placed = placeOptions<Face>(
    rng,
    text(beatName(crotchet)),
    wrong.map((d) => {
      const n = Math.round(1 / (rhythm.durationLength(d).n / rhythm.durationLength(d).d));
      return {
        face: text(beatName(d)),
        reason: `A bottom number of ${n} stands for the ${noteLink(d, t)}. The 4 stands for the ${noteLink(crotchet, t)}, so each beat in ${tt} is a ${noteLink(crotchet, t)}.`,
      };
    }),
  );
  return { type: 'multiple-choice', payload: placed, prompt: `In ${tt}, what does the bottom number 4 tell you?` };
}

/** docs/generators-grade-1.md 3.4: rng order per `ask` is given there. */
export function generate(params: CountBeatsParams, rng: Rng, t: Terminology): GeneratedQuestion {
  switch (params.ask ?? 'dotted') {
    case 'dotted':
      return dotted(params, rng, t);
    case 'tie':
      return tie(params, rng, t);
    case 'exchange':
      return exchange(params, rng, t);
    case 'fits':
      return fits(params, rng, t);
    case 'meaning':
      return meaning(params, rng, t);
  }
}

export const countBeats: QuestionGenerator<CountBeatsParams> = {
  id: 'count-beats',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
