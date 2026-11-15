import { describe, expect, it } from 'vitest';
import { recordingRng, runBattery } from '../shared/test-kit';
import { intervalByNumber, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);

runBattery({
  generator: intervalByNumber as never,
  sets: [
    { name: 'defaults', params: {} },
    { name: 'four options, bass', params: { options: 4, clef: 'bass' } },
    { name: 'two options, 2nd to 5th', params: { options: 2, numbers: [2, 3, 4, 5] } },
    { name: 'wide keys', params: { keys: ['C', 'G', 'D', 'F', 'A', 'E', 'B'], options: 4 } },
  ],
});

describe('interval-by-number spec', () => {
  it('pick key, pick number, final shuffle', () => {
    const { rng, calls } = recordingRng([2, 3]);
    const out = intervalByNumber.generate(parse({}), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'shuffle']);
    expect(out.prompt).toBe('What is the [[interval|interval]] from the first note (the key note) up to the second?');
  });

  it('example: D up to A is a 5th; the wrong 4th stops at G', () => {
    const { rng } = recordingRng([2, 3]);
    const out = intervalByNumber.generate(parse({}), rng, 'uk');
    const payload = out.payload as { options: { face: { text: string }; reason?: string }[]; exhibit: { passage: { key: { tonic: { letter: string } }; bars: { events: { pitches: { letter: string; accidental: number }[] }[] }[] } } };
    expect(payload.options).toEqual([
      { id: 'a', face: { kind: 'text', text: '5th' } },
      { id: 'b', face: { kind: 'text', text: '4th' }, reason: 'Counting D as 1, the 4th is G. The second note is A, which is the 5th.' },
      { id: 'c', face: { kind: 'text', text: '6th' }, reason: 'Counting D as 1, the 6th is B. The second note is A, which is the 5th.' },
    ]);
    expect(payload.exhibit.passage.bars[0]!.events.map((e) => e.pitches[0]!.letter)).toEqual(['D', 'A']);
  });

  it('the 2nd and the 8th still have enough wrong options', () => {
    for (const n of [2, 8]) {
      const out = intervalByNumber.generate(parse({ numbers: [n], options: 4 }), recordingRng([0, 0]).rng, 'uk');
      expect((out.payload as { options: unknown[] }).options).toHaveLength(4);
    }
  });
});
