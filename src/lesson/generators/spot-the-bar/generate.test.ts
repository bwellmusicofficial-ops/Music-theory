import { describe, expect, it } from 'vitest';
import { rhythm } from '@/engine/rhythm';
import { D } from '../shared/params';
import { recordingRng, runBattery } from '../shared/test-kit';
import { paramsSchema, spotTheBar } from './index';

const parse = (input: object) => paramsSchema.parse(input);

runBattery({
  generator: spotTheBar as never,
  sets: [
    { name: '4/4, defaults', params: {} },
    { name: '4/4, four bars, quavers', params: { bars: 4, values: [D('crotchet'), D('minim'), D('quaver'), D('semibreve')] } },
    { name: '3/4, short only', params: { time: { beats: 3, beatUnit: 4 }, fault: 'short', values: [D('crotchet'), D('minim')] } },
    { name: '2/4, long only', params: { time: { beats: 2, beatUnit: 4 }, fault: 'long', values: [D('crotchet'), D('minim'), D('quaver')] } },
    { name: '2/2', params: { time: { beats: 2, beatUnit: 2 }, values: [D('minim'), D('crotchet'), D('semibreve')] } },
  ],
});

describe('spot-the-bar spec', () => {
  it('the faulty bar is wrong by the right amount, every other bar is full', () => {
    for (const fault of ['short', 'long'] as const) {
      const { rng } = recordingRng();
      const out = spotTheBar.generate(parse({ fault }), rng, 'uk');
      const payload = out.payload as { passage: { time: never; bars: never[] }; mistake: { bar: number }; select: string };
      payload.passage.bars.forEach((bar, i) => {
        const status = rhythm.checkBarLength(bar, payload.passage.time).status;
        expect(status).toBe(i === payload.mistake.bar ? fault : 'complete');
      });
    }
  });

  it('either: bars, int, pick(short/long) and, for a long bar, pick(extra)', () => {
    const short = recordingRng([]);
    spotTheBar.generate(parse({}), short.rng, 'uk');
    // All picks index 0: four crotchets per bar (12), the bar, then 'short'.
    expect(short.calls).toEqual([...Array(12).fill('pick'), 'int', 'pick']);
    const long = recordingRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    spotTheBar.generate(parse({}), long.rng, 'uk');
    expect(long.calls).toEqual([...Array(12).fill('pick'), 'int', 'pick', 'pick']);
  });

  it('explanation example: a long bar', () => {
    const { rng } = recordingRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    const out = spotTheBar.generate(parse({}), rng, 'uk');
    expect(out.prompt).toBe('One [[bar|bar]] has the wrong number of beats. Tap it.');
    expect((out.payload as { explanation: string }).explanation).toBe(
      '[[bar|Bar]] 1 has 6 beats: 4 [[crotchet|crotchets]] (1 each), [[minim|minim]] (2). That is 2 beats too many.',
    );
  });

  it('a one-note short bar becomes long instead', () => {
    const { rng } = recordingRng([0]);
    const out = spotTheBar.generate(parse({ fault: 'short', values: [D('semibreve'), D('crotchet')] }), rng, 'uk');
    const payload = out.payload as { passage: { bars: { events: unknown[] }[] }; mistake: { bar: number } };
    expect(payload.passage.bars[payload.mistake.bar]!.events.length).toBeGreaterThan(1);
  });
});
