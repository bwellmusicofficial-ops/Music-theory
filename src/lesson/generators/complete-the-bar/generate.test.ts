import { describe, expect, it } from 'vitest';
import { D } from '../shared/params';
import { recordingRng, runBattery } from '../shared/test-kit';
import { completeTheBar, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const four = [D('semibreve'), D('minim'), D('crotchet'), D('quaver')];

runBattery({
  generator: completeTheBar as never,
  sets: [
    { name: '4/4 notes, defaults', params: {} },
    { name: '4/4 notes with quavers, four-symbol palette', params: { values: four, paletteSize: 4 } },
    { name: '3/4 notes', params: { time: { beats: 3, beatUnit: 4 }, values: [D('minim'), D('crotchet'), D('quaver')], bars: 3 } },
    { name: '2/4 notes', params: { time: { beats: 2, beatUnit: 4 }, values: [D('minim'), D('crotchet'), D('quaver')], bars: 1, paletteSize: 2 } },
    { name: '4/4 rests', params: { missing: 'rest', values: [D('minim'), D('crotchet'), D('quaver')] } },
    { name: '3/4 rests', params: { missing: 'rest', time: { beats: 3, beatUnit: 4 }, values: [D('minim'), D('crotchet'), D('quaver')] } },
    { name: '4/4 dotted notes', params: { values: [D('minim', 1), D('minim'), D('crotchet'), D('crotchet', 1)], paletteSize: 3 } },
  ],
});

describe('complete-the-bar spec', () => {
  it('rejects a palette larger than the pool, or a pool of equal lengths', () => {
    expect(paramsSchema.safeParse({ paletteSize: 4 }).success).toBe(false);
    expect(paramsSchema.safeParse({ values: [D('crotchet'), D('crotchet'), D('minim')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ missing: 'rest', values: [D('minim', 1), D('minim'), D('crotchet')] }).success).toBe(false);
  });

  it('draws the bars, then the short bar, then the other palette symbols, then the palette order', () => {
    const { rng, calls } = recordingRng();
    const out = completeTheBar.generate(parse({}), rng, 'uk');
    // Defaults: every pick takes the first allowed value (crotchet), so each bar is four crotchets.
    expect(calls).toEqual([...Array(8).fill('pick'), 'int', 'shuffle', 'shuffle']);
    const payload = out.payload as { barIndex: number; count: number; passage: { bars: { events: unknown[] }[] }; palette: unknown[] };
    expect(payload.barIndex).toBe(0);
    expect(payload.count).toBe(1);
    expect(payload.passage.bars[0]!.events).toHaveLength(3);
    expect(payload.passage.bars[1]!.events).toHaveLength(4);
    expect(payload.palette).toEqual([
      { kind: 'note', duration: D('crotchet') },
      { kind: 'note', duration: D('minim') },
      { kind: 'note', duration: D('semibreve') },
    ]);
    expect(out.prompt).toBe('Add the missing note to complete the [[bar|bar]].');
  });

  it('a missing rest gives a palette of rests and says so', () => {
    const { rng } = recordingRng();
    const out = completeTheBar.generate(parse({ missing: 'rest' }), rng, 'us');
    expect(out.prompt).toBe('Add the missing rest to complete the [[bar|measure]].');
    expect((out.payload as { palette: { kind: string }[] }).palette.every((g) => g.kind === 'rest')).toBe(true);
  });
});
