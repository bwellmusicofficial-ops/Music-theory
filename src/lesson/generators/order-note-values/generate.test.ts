import { describe, expect, it } from 'vitest';
import { D } from '../shared/params';
import { recordingRng, runBattery } from '../shared/test-kit';
import { orderNoteValues, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const six = [D('semibreve'), D('minim', 1), D('minim'), D('crotchet'), D('quaver'), D('semiquaver')];

runBattery({
  generator: orderNoteValues as never,
  sets: [
    { name: 'defaults', params: {} },
    { name: 'six notes with a dotted one', params: { values: six, count: 6 } },
    { name: 'four of six, longest first', params: { values: six, count: 4, direction: 'longest-first' } },
    { name: 'rests, either direction', params: { kind: 'rest', values: [D('semibreve'), D('minim'), D('crotchet'), D('quaver')], direction: 'either' } },
    { name: 'three of three', params: { count: 3 } },
  ],
});

describe('order-note-values spec', () => {
  it('rejects a count above the pool', () => {
    expect(paramsSchema.safeParse({ count: 4 }).success).toBe(false);
    expect(paramsSchema.safeParse({ count: 3 }).success).toBe(true);
  });

  it('either: pick, shuffle(values), shuffle(shown)', () => {
    const { rng, calls } = recordingRng();
    orderNoteValues.generate(parse({ direction: 'either' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'shuffle', 'shuffle']);
    const fixed = recordingRng();
    orderNoteValues.generate(parse({}), fixed.rng, 'uk');
    expect(fixed.calls).toEqual(['shuffle', 'shuffle']);
  });

  it('example: the spec JSON (rotated start)', () => {
    const { rng } = recordingRng();
    const out = orderNoteValues.generate(parse({}), rng, 'uk');
    expect(out.prompt).toBe('Put these in order, shortest first.');
    expect(out.payload).toEqual({
      items: [
        { id: 'minim', face: { kind: 'glyph', glyph: { kind: 'note', duration: D('minim') } } },
        { id: 'semibreve', face: { kind: 'glyph', glyph: { kind: 'note', duration: D('semibreve') } } },
        { id: 'crotchet', face: { kind: 'glyph', glyph: { kind: 'note', duration: D('crotchet') } } },
      ],
      correctOrder: ['crotchet', 'minim', 'semibreve'],
      ends: { first: 'shortest', last: 'longest' },
      reason:
        'Shortest to longest: [[crotchet|crotchet]] 1 beat, [[minim|minim]] 2 beats, [[semibreve|semibreve]] 4 beats.',
    });
  });
});
