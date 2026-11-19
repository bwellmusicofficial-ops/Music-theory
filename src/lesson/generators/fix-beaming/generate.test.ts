import { describe, expect, it } from 'vitest';
import { rhythm } from '@/engine/rhythm';
import { createRng } from '@/engine/rng';
import type { Bar } from '@/engine/types';
import { beamGaps, eventStarts, joinsOf, standardJoins } from '@/lesson/questions/fix-beaming/beams';
import { runBattery } from '../shared/test-kit';
import { fixBeaming, paramsSchema } from './index';

runBattery({
  generator: fixBeaming as never,
  sets: [
    { name: '4/4 defaults', params: {} },
    { name: '3/4', params: { time: { beats: 3, beatUnit: 4 } } },
    { name: '2/4', params: { time: { beats: 2, beatUnit: 4 }, faults: ['split'] } },
    { name: '6/8', params: { time: { beats: 6, beatUnit: 8 } } },
    { name: '4/4 across the middle, tune', params: { faults: ['middle'], melody: 'tune' } },
    { name: '3/4 split only', params: { time: { beats: 3, beatUnit: 4 }, faults: ['split'] } },
  ],
});

type Payload = { passage: { time: { beats: number; beatUnit: 4 | 8 }; bars: Bar[] }; barIndex: number };
const draw = (params: object, seed: number) => {
  const out = fixBeaming.generate(paramsSchema.parse(params), createRng(seed), 'uk');
  const p = out.payload as Payload;
  const bar = p.passage.bars[0]!;
  return { out, p, bar, time: p.passage.time };
};

describe('fix-beaming spec', () => {
  it('rejects unknown faults, `middle` outside 4/4, other metres', () => {
    expect(paramsSchema.safeParse({ faults: ['nope'] }).success).toBe(false);
    expect(paramsSchema.safeParse({ faults: ['middle'], time: { beats: 3, beatUnit: 4 } }).success).toBe(false);
    expect(paramsSchema.safeParse({ time: { beats: 5, beatUnit: 4 } }).success).toBe(false);
    expect(paramsSchema.safeParse({ faults: ['split', 'split'] }).success).toBe(false);
  });

  it('the bar is full, has at least four quavers and is beamed differently from the standard', () => {
    for (let seed = 0; seed < 150; seed += 1) {
      const { bar, time } = draw({}, seed);
      expect(rhythm.checkBarLength(bar, time).status).toBe('complete');
      expect(bar.events.filter((e) => e.kind === 'note' && e.duration.value === 'quaver').length).toBeGreaterThanOrEqual(4);
      expect(joinsOf(bar, bar.beams!)).not.toEqual(standardJoins(bar, time));
    }
  });

  it('`middle` joins exactly one pair across the middle of a 4/4 bar and changes nothing else', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const { bar, time } = draw({ faults: ['middle'] }, seed);
      const std = standardJoins(bar, time);
      const got = joinsOf(bar, bar.beams!);
      const changed = got.map((j, i) => (j !== std[i] ? i : -1)).filter((i) => i >= 0);
      expect(changed).toHaveLength(1);
      expect(got[changed[0]!]).toBe(true);
      const starts = eventStarts(bar);
      expect(starts[changed[0]! + 1]).toEqual({ n: 1, d: 2 });
    }
  });

  it('`split` takes one join away and `together` only adds joins', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const s = draw({ faults: ['split'] }, seed);
      const std = standardJoins(s.bar, s.time);
      const got = joinsOf(s.bar, s.bar.beams!);
      expect(got.filter((j, i) => j !== std[i])).toHaveLength(1);
      expect(got.filter(Boolean).length).toBe(std.filter(Boolean).length - 1);
      const t = draw({ faults: ['together'] }, seed);
      const tstd = standardJoins(t.bar, t.time);
      joinsOf(t.bar, t.bar.beams!).forEach((j, i) => expect(j || !tstd[i]).toBe(true));
      expect(beamGaps(t.bar).every((g) => joinsOf(t.bar, t.bar.beams!)[g])).toBe(true);
    }
  });

  it('the same seed gives the same question, and seeds differ', () => {
    expect(draw({}, 5).out).toEqual(draw({}, 5).out);
    expect(new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(draw({}, s).out.payload))).size).toBeGreaterThan(2);
  });

  it('the prompt links quavers and beams in both terminologies', () => {
    expect(fixBeaming.generate(paramsSchema.parse({}), createRng(1), 'uk').prompt).toBe('Beam the [[quaver|quavers]] correctly: tap between notes to join or split.');
    expect(fixBeaming.generate(paramsSchema.parse({}), createRng(1), 'us').prompt).toBe('Beam the [[quaver|eighth notes]] correctly: tap between notes to join or split.');
  });
});
