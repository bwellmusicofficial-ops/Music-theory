import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { D } from '../shared/params';
import { recordingRng, runBattery } from '../shared/test-kit';
import { chooseNoteValue, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const all = [D('semibreve'), D('minim'), D('crotchet'), D('quaver'), D('semiquaver')];

runBattery({
  generator: chooseNoteValue as never,
  sets: [
    { name: 'name, notes (defaults)', params: {} },
    { name: 'name, five notes, four options', params: { values: all, options: 4 } },
    { name: 'name, rests', params: { kind: 'rest', values: all, options: 3 } },
    { name: 'beats, notes with a dotted value', params: { question: 'beats', values: [D('minim', 1), D('minim'), D('crotchet'), D('quaver')], options: 4 } },
    { name: 'beats, rests', params: { question: 'beats', kind: 'rest', values: all } },
    { name: 'longer, two options', params: { question: 'longer', values: all, options: 2 } },
    { name: 'longest, four notes', params: { question: 'longer', values: all, options: 4 } },
    { name: 'shortest, rests', params: { question: 'shorter', kind: 'rest', values: all, options: 3 } },
    { name: 'whole bar in 4/4', params: { question: 'whole-bar', kind: 'rest', options: 4 } },
    { name: 'whole bar in 3/4', params: { question: 'whole-bar', kind: 'rest', options: 4, time: { beats: 3, beatUnit: 4 } } },
    { name: 'whole bar in 2/4', params: { question: 'whole-bar', kind: 'rest', options: 3, time: { beats: 2, beatUnit: 4 } } },
  ],
});

describe('choose-note-value spec', () => {
  it('rejects bad params', () => {
    expect(paramsSchema.safeParse({ values: [D('crotchet')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ values: [D('crotchet'), D('crotchet')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ options: 3 }).success).toBe(false);
    expect(paramsSchema.safeParse({ question: 'whole-bar' }).success).toBe(false);
    expect(paramsSchema.safeParse({ kind: 'rest', values: [D('minim', 1), D('minim')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ values: [D('quaver', 1), D('quaver')] }).success).toBe(true);
    expect(paramsSchema.safeParse({ values: [D('semiquaver', 1), D('quaver')] }).success).toBe(false);
  });

  it('name: pick, shuffle(others), final shuffle', () => {
    const { rng, calls, lists } = recordingRng([1]);
    chooseNoteValue.generate(parse({ values: all, options: 3 }), rng, 'uk');
    expect(calls).toEqual(['pick', 'shuffle', 'shuffle']);
    expect(lists[0]).toEqual(all);
    expect(lists[1]).toEqual([all[0], all[2], all[3], all[4]]);
  });

  it('longer: shuffle(values), final shuffle', () => {
    const { rng, calls } = recordingRng();
    chooseNoteValue.generate(parse({ question: 'longer', values: all, options: 3 }), rng, 'uk');
    expect(calls).toEqual(['shuffle', 'shuffle']);
  });

  it('whole-bar: shuffle(distractors), final shuffle; the semibreve rest is correct', () => {
    const { rng, calls } = recordingRng();
    const out = chooseNoteValue.generate(parse({ question: 'whole-bar', kind: 'rest', options: 4, time: { beats: 3, beatUnit: 4 } }), rng, 'uk');
    expect(calls).toEqual(['shuffle', 'shuffle']);
    const payload = out.payload as { options: { id: string; face: { glyph: { duration: { value: string; dots: number } } }; reason?: string }[]; correct: string };
    const right = payload.options.find((o) => o.id === payload.correct)!;
    expect(right.face.glyph.duration).toEqual(D('semibreve'));
    // 3/4: the dotted minim rest is the plausible mistake
    const dotted = payload.options.find((o) => o.face.glyph.duration.dots === 1)!;
    expect(dotted.reason).toContain('does last 3 beats');
  });

  it('example: name a minim rest', () => {
    const { rng } = recordingRng([1]);
    const out = chooseNoteValue.generate(parse({ kind: 'rest', values: [D('crotchet'), D('minim'), D('semibreve')], options: 3 }), rng, 'uk');
    expect(out.prompt).toBe('Which of these is the [[minim-rest|minim rest]]?');
    expect(out.payload).toEqual({
      options: [
        { id: 'a', face: { kind: 'glyph', glyph: { kind: 'rest', duration: D('minim') } } },
        {
          id: 'b',
          face: { kind: 'glyph', glyph: { kind: 'rest', duration: D('crotchet') } },
          reason: 'That symbol lasts 1 beat, so it is the [[crotchet-rest|crotchet rest]]. The [[minim-rest|minim rest]] lasts 2 beats.',
        },
        {
          id: 'c',
          face: { kind: 'glyph', glyph: { kind: 'rest', duration: D('semibreve') } },
          reason: 'That symbol lasts 4 beats, so it is the [[semibreve-rest|semibreve rest]]. The [[minim-rest|minim rest]] lasts 2 beats.',
        },
      ],
      correct: 'a',
    });
  });

  it('US text uses quarter, half and whole rests', () => {
    const out = chooseNoteValue.generate(parse({ kind: 'rest', values: all, question: 'beats' }), createRng(3), 'us');
    expect(out.prompt).toMatch(/^Which rest lasts /);
    expect(JSON.stringify(out.payload)).toMatch(/quarter rest|half rest|whole rest|eighth rest|sixteenth rest/);
  });
});
