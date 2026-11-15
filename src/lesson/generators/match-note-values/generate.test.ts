import { describe, expect, it } from 'vitest';
import { D } from '../shared/params';
import { recordingRng, runBattery } from '../shared/test-kit';
import { matchNoteValues, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const five = [D('semibreve'), D('minim'), D('crotchet'), D('quaver'), D('semiquaver')];

runBattery({
  generator: matchNoteValues as never,
  sets: [
    { name: 'beats, defaults', params: {} },
    { name: 'beats, five notes', params: { values: five } },
    { name: 'name, four notes', params: { match: 'name', values: five.slice(0, 4) } },
    { name: 'name, rests', params: { kind: 'rest', match: 'name', values: five } },
    { name: 'beats, rests', params: { kind: 'rest', values: five.slice(1) } },
    { name: 'beats, dotted', params: { values: [D('minim', 1), D('minim'), D('crotchet', 1), D('crotchet')] } },
  ],
});

describe('match-note-values spec', () => {
  it('rejects pools that are too small or have equal lengths', () => {
    expect(paramsSchema.safeParse({ values: [D('crotchet'), D('minim')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ values: [D('crotchet'), D('minim'), D('crotchet')] }).success).toBe(false);
  });

  it('draws one shuffle for the left order, then shuffles the right side', () => {
    const { rng, calls } = recordingRng();
    const out = matchNoteValues.generate(parse({}), rng, 'uk');
    // The recording shuffle never reorders, so every attempt fails and the right side is rotated.
    expect(calls).toEqual(['shuffle', ...Array(10).fill('shuffle')]);
    const payload = out.payload as { left: { id: string; match: string }[]; right: { id: string }[] };
    expect(payload.right.map((r) => r.id)).toEqual(['r-minim', 'r-semibreve', 'r-crotchet']);
    expect(payload.left.map((l) => l.id)).toEqual(['crotchet', 'minim', 'semibreve']);
  });

  it('example: the spec JSON with the rotated right side', () => {
    const { rng } = recordingRng();
    const out = matchNoteValues.generate(parse({}), rng, 'uk');
    expect(out.prompt).toBe('Match each symbol with how long it lasts.');
    expect((out.payload as { left: { reason: string }[] }).left[1]!.reason).toBe(
      'The [[minim|minim]] lasts 2 beats, so it belongs with 2 beats.',
    );
  });
});
