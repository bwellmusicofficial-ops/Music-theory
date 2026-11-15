import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Rng, Terminology, TimeSignature } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { T44, buildBars, dur, lengthOf, noteEvent, rhythmPassage } from '../shared/bars';
import { beatsNumber, beatsText } from '../shared/beats-text';
import { noteLink, term } from '../shared/terms';
import { paramsSchema, type SpotTheBarParams } from './params';

/**
 * docs/generators-grade-1.md 3.6. Rng calls: (1) the bars (one pick per note);
 * (2) `int(0, bars - 1)` for the faulty bar; (3) only for `either`: pick short or long;
 * (4) only for a long bar: pick the extra note's value.
 */
export function generate(params: SpotTheBarParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const time: TimeSignature = params.time ?? T44;
  const values = params.values ?? [dur('crotchet'), dur('minim')];
  const barCount = params.bars ?? 3;
  const faultParam = params.fault ?? 'either';

  let bars: Bar[] | null = null;
  for (let attempt = 0; attempt < 50 && !bars; attempt += 1) bars = buildBars(rng, time, values, barCount);
  if (!bars) throw new TheoryError('spot-the-bar could not build bars from these params');

  const mistake = rng.int(0, barCount - 1);
  let fault = faultParam === 'either' ? rng.pick(['short', 'long'] as const) : faultParam;
  const good = bars[mistake]!;
  if (fault === 'short' && good.events.length < 2) fault = 'long';
  let bad: Bar;
  if (fault === 'short') {
    bad = { events: good.events.slice(0, -1) };
  } else {
    const extra: Duration = rng.pick(values);
    bad = { events: [...good.events, noteEvent(extra)] };
  }

  const check = rhythm.checkBarLength(bad, time);
  // Consecutive equal symbols are one run: "4 crotchets (1 each)", so the explanation stays short.
  const runs: { d: Duration; n: number }[] = [];
  for (const e of bad.events) {
    const last = runs[runs.length - 1];
    if (last && last.d.value === e.duration.value && last.d.dots === e.duration.dots) last.n += 1;
    else runs.push({ d: e.duration, n: 1 });
  }
  const listed = runs
    .map(({ d, n }) => {
      const each = beatsNumber(beatsText(lengthOf(d), time));
      return n === 1 ? `${noteLink(d, t)} (${each})` : `${n} ${noteLink(d, t, { plural: true })} (${each} each)`;
    })
    .join(', ');
  const total = beatsText(rhythm.eventsLength(bad.events), time);
  const diff = beatsText(check.difference, time);
  const explanation = `${term('bar', t, { cap: true })} ${mistake + 1} has ${total}: ${listed}. That is ${diff} too ${check.status === 'long' ? 'many' : 'few'}.`;

  return {
    type: 'spot-mistake',
    prompt: `One ${term('bar', t)} has the wrong number of beats. Tap it.`,
    payload: {
      passage: rhythmPassage(time, bars.map((b, i) => (i === mistake ? bad : b))),
      select: 'bar',
      mistake: { bar: mistake },
      explanation,
    },
  };
}

export const spotTheBar: QuestionGenerator<SpotTheBarParams> = {
  id: 'spot-the-bar',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
