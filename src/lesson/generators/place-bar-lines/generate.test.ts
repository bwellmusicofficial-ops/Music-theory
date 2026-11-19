import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { D } from '../shared/params';
import { recordingRng, runBattery } from '../shared/test-kit';
import { paramsSchema, placeBarLines } from './index';

runBattery({
  generator: placeBarLines as never,
  sets: [
    { name: '4/4 crotchets and minims, defaults', params: {} },
    { name: '4/4 with quavers', params: { values: [D('crotchet'), D('minim'), D('quaver')] } },
    { name: '3/4 two bars', params: { time: { beats: 3, beatUnit: 4 }, bars: 2, values: [D('crotchet'), D('minim'), D('quaver')] } },
    { name: '2/4 crotchets, minims and quavers', params: { time: { beats: 2, beatUnit: 4 }, values: [D('crotchet'), D('minim'), D('quaver')] } },
    { name: '4/4 tune', params: { melody: 'tune', values: [D('crotchet'), D('minim'), D('quaver')] } },
    { name: '3/4 dotted minims, tune', params: { time: { beats: 3, beatUnit: 4 }, melody: 'tune', values: [D('crotchet'), D('minim'), D('minim', 1)] } },
  ],
});

type Payload = { passage: { bars: { events: { kind: string; pitches?: { letter: string; accidental: number; octave: number }[] }[] }[] } };

describe('place-bar-lines spec', () => {
  it('rejects a pool of equal lengths and unknown params', () => {
    expect(paramsSchema.safeParse({ values: [D('crotchet'), D('crotchet', 0)] }).success).toBe(false);
    expect(paramsSchema.safeParse({ bars: 4 }).success).toBe(false);
  });

  it('draws the bars (one pick per note); a tune adds an int and one pick per further note', () => {
    // Bars: four crotchets, two minims, four crotchets (ten notes).
    const { rng, calls } = recordingRng([0, 0, 0, 0, 1, 1, 0, 0, 0, 0]);
    placeBarLines.generate(paramsSchema.parse({ melody: 'tune' }), rng, 'uk');
    expect(calls).toEqual([...Array(10).fill('pick'), 'int', ...Array(9).fill('pick')]);
    const plain = recordingRng([0, 0, 0, 0, 1, 1, 0, 0, 0, 0]);
    placeBarLines.generate(paramsSchema.parse({}), plain.rng, 'uk');
    expect(plain.calls).toEqual(Array(10).fill('pick'));
  });

  it('every bar differs from the one before, and there are 4 to 12 notes in 2 to 3 bars', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { passage } = placeBarLines.generate(paramsSchema.parse({}), createRng(seed), 'uk').payload as Payload;
      expect(passage.bars.length).toBeGreaterThanOrEqual(2);
      passage.bars.forEach((bar, i) => {
        if (i > 0) expect(JSON.stringify(bar.events)).not.toBe(JSON.stringify(passage.bars[i - 1]!.events));
      });
      const total = passage.bars.reduce((s, b) => s + b.events.length, 0);
      expect(total).toBeGreaterThanOrEqual(4);
      expect(total).toBeLessThanOrEqual(12);
    }
  });

  it('a rhythm-only question is all B4; a tune moves by step in C major with no accidentals', () => {
    const rhythmOnly = placeBarLines.generate(paramsSchema.parse({ values: [D('crotchet'), D('minim')] }), createRng(3), 'uk').payload as Payload;
    for (const e of rhythmOnly.passage.bars.flatMap((b) => b.events)) expect(e.pitches).toEqual([{ letter: 'B', accidental: 0, octave: 4 }]);
    const tune = placeBarLines.generate(paramsSchema.parse({ melody: 'tune', values: [D('crotchet'), D('minim')] }), createRng(3), 'uk').payload as Payload;
    const letters = 'CDEFGAB';
    const steps = tune.passage.bars.flatMap((b) => b.events).map((e) => e.pitches![0]!.octave * 7 + letters.indexOf(e.pitches![0]!.letter));
    for (let i = 1; i < steps.length; i += 1) expect(Math.abs(steps[i]! - steps[i - 1]!)).toBe(1);
  });

  it('the prompt links bar lines', () => {
    expect(placeBarLines.generate(paramsSchema.parse({}), createRng(1), 'us').prompt).toBe('Tap the gaps where the missing [[bar-line|bar lines]] go.');
  });
});
