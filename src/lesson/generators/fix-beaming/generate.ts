import { TheoryError } from '@/engine/api';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Rng, Terminology, TimeSignature } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { beamGaps, eventStarts, groupsOf, isAcceptableJoins, isBeamable, standardJoins } from '@/lesson/questions/fix-beaming/beams';
import { T44, barIsClean, buildBars, dur } from '../shared/bars';
import { noteLink } from '../shared/terms';
import { noteCount, stepwiseTune, withPitches } from '../shared/tune';
import { FAULTS, paramsSchema, type BeamFault, type FixBeamingParams } from './params';

const ATTEMPTS = 300;
const QUAVER: Duration = dur('quaver');

const defaultValues = (time: TimeSignature): Duration[] =>
  rhythm.metreKind(time) === 'compound' ? [dur('crotchet', 1), dur('quaver'), dur('crotchet')] : [dur('crotchet'), dur('quaver'), dur('minim')];

/** Which gaps (event i to i + 1) are joined when the bar is beamed wrongly in the way `fault` names. Null: it does not apply. */
function applyFault(fault: BeamFault, bar: Bar, time: TimeSignature, rng: Rng): boolean[] | null {
  const standard = standardJoins(bar, time);
  const gaps = beamGaps(bar);
  const starts = eventStarts(bar);
  const atMiddle = (i: number) => time.beats === 4 && time.beatUnit === 4 && starts[i + 1]!.n * 2 === starts[i + 1]!.d;
  const joins = [...standard];
  if (fault === 'together') {
    for (const g of gaps) joins[g] = true;
  } else if (fault === 'split') {
    const groups = groupsOf(standard);
    if (groups.length === 0) return null;
    const group = rng.pick(groups);
    joins[group[rng.int(1, group.length - 1) - 1]!] = false;
  } else {
    const open = gaps.filter((g) => !standard[g] && (fault === 'middle' ? atMiddle(g) : !atMiddle(g)));
    if (open.length === 0) return null;
    joins[rng.pick(open)] = true;
  }
  return isAcceptableJoins(bar, time, joins) ? null : joins;
}

/**
 * docs/generators-grade-1.md 3.22. Rng calls, per attempt: the bar (one pick per note). Then, when the bar has at
 * least four quavers, `pick` of the faults that apply (in the order of `FAULTS`), then the fault's own draw:
 * `split` one `pick` (a group) and one `int` (where to cut); `middle` and `beat` one `pick` (the gap). After a good
 * attempt, for `melody: 'tune'`: the stepwise tune.
 */
export function generate(params: FixBeamingParams, rng: Rng, t: Terminology): GeneratedQuestion {
  const time: TimeSignature = params.time ?? T44;
  const values = params.values ?? defaultValues(time);
  const fourFour = time.beats === 4 && time.beatUnit === 4;
  const allowed = FAULTS.filter((f) => (params.faults ?? FAULTS).includes(f) && (f !== 'middle' || fourFour));
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const made = buildBars(rng, time, values, 1);
    if (!made) continue;
    const bar = made[0]!;
    if (bar.events.filter((e) => isBeamable(e) && e.duration.value === 'quaver').length < 4) continue;
    if (!barIsClean(bar, time)) continue;
    const fits = allowed.filter((f) => applyFault(f, bar, time, { ...rng, pick: (xs) => xs[0]!, int: (min) => min } as Rng) !== null);
    if (fits.length === 0) continue;
    const fault = rng.pick(fits);
    const joins = applyFault(fault, bar, time, rng);
    if (!joins) continue;
    const [written] = params.melody === 'tune' ? withPitches([bar], stepwiseTune(rng, noteCount([bar]))) : [bar];
    const wrong: Bar = { ...written!, beams: groupsOf(joins) };
    return {
      type: 'fix-beaming',
      prompt: `Beam the ${noteLink(QUAVER, t, { plural: true })} correctly: tap between notes to join or split.`,
      payload: {
        passage: { clef: 'treble', key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' }, time, bars: [wrong] },
        barIndex: 0,
      },
    };
  }
  throw new TheoryError('fix-beaming could not build a wrongly beamed bar from these params');
}

export const fixBeaming: QuestionGenerator<FixBeamingParams> = {
  id: 'fix-beaming',
  paramsSchema,
  generate: (params, rng, t) => generate(params, rng, t),
};
