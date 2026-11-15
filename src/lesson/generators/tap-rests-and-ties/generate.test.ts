import { describe, expect, it } from 'vitest';
import { rhythm } from '@/engine/rhythm';
import { createRng } from '@/engine/rng';
import { D } from '../shared/params';
import { runBattery } from '../shared/test-kit';
import { paramsSchema, tapRestsAndTies } from './index';

const T44 = { beats: 4, beatUnit: 4 };
const base = { time: T44, values: [D('crotchet'), D('minim')], bars: 2, bpm: 80 };

runBattery({
  generator: tapRestsAndTies as never,
  sets: [
    { name: 'crotchet rests', params: { ...base, rests: [D('crotchet')] } },
    { name: 'rests of three sizes, listen first', params: { ...base, values: [D('crotchet'), D('minim'), D('quaver')], rests: [D('crotchet'), D('minim'), D('quaver')], bars: 3, listenFirst: true } },
    { name: 'ties only', params: { ...base, ties: true } },
    { name: 'rests and ties', params: { ...base, rests: [D('crotchet')], ties: true, bars: 4 } },
    { name: '3/4 rests', params: { time: { beats: 3, beatUnit: 4 }, values: [D('crotchet'), D('minim')], rests: [D('crotchet'), D('minim')], bars: 2, bpm: 70 } },
    { name: '2/4 with ties and quaver rests', params: { time: { beats: 2, beatUnit: 4 }, values: [D('crotchet'), D('quaver'), D('minim')], rests: [D('quaver')], ties: true, bars: 3, bpm: 90, showNotation: false, listenFirst: true } },
  ],
});

describe('tap-rests-and-ties spec', () => {
  it('rejects bad params', () => {
    expect(paramsSchema.safeParse({ ...base }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...base, ties: true, bars: 1 }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...base, rests: [D('minim', 1)] }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...base, rests: [D('crotchet')], showNotation: false }).success).toBe(false);
  });

  it('every bar has a note; rests appear; ties join equal pitches across a bar line', () => {
    const params = paramsSchema.parse({ ...base, rests: [D('crotchet')], ties: true, bars: 3 });
    for (let seed = 0; seed < 100; seed += 1) {
      const out = tapRestsAndTies.generate(params, createRng(seed), 'uk');
      const payload = out.payload as { bars: { events: { kind: string; tieToNext?: boolean }[] }[]; time: never; bpm: number };
      expect(payload.bars.every((b) => b.events.some((e) => e.kind === 'note'))).toBe(true);
      expect(payload.bars.some((b) => b.events.some((e) => e.kind === 'rest'))).toBe(true);
      const tied = payload.bars.flatMap((b, i) => b.events.map((e, j) => ({ e, i, j, last: j === b.events.length - 1 }))).filter((x) => x.e.tieToNext);
      expect(tied).toHaveLength(1);
      expect(tied[0]!.last).toBe(true);
      // The tied pair is one tap: onsets are the notes minus one.
      const notes = payload.bars.flatMap((b) => b.events).filter((e) => e.kind === 'note').length;
      expect(rhythm.onsetTimes(payload.bars as never, payload.time, payload.bpm)).toHaveLength(notes - 1);
    }
  });

  it('prompts say what to do with rests and ties', () => {
    const rests = tapRestsAndTies.generate(paramsSchema.parse({ ...base, rests: [D('crotchet')] }), createRng(1), 'uk');
    expect(rests.prompt).toBe('Tap this rhythm. Rests are silent: do not tap.');
    const both = tapRestsAndTies.generate(paramsSchema.parse({ ...base, rests: [D('crotchet')], ties: true }), createRng(1), 'uk');
    expect(both.prompt).toBe('Tap this rhythm. Rests are silent: do not tap. A [[tie|tie]] joins two notes into one tap.');
  });
});
