import { describe, expect, it } from 'vitest';
import { D } from '../shared/params';
import { recordingRng, runBattery } from '../shared/test-kit';
import { countBeats, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const five = [D('semibreve'), D('minim'), D('crotchet'), D('quaver')];

runBattery({
  generator: countBeats as never,
  sets: [
    { name: 'dotted, defaults', params: {} },
    { name: 'dotted, four options, all values', params: { ask: 'dotted', values: [D('minim'), D('crotchet'), D('quaver'), D('semibreve')], options: 4 } },
    { name: 'tie, defaults', params: { ask: 'tie' } },
    { name: 'tie, four values', params: { ask: 'tie', values: five, options: 3 } },
    { name: 'exchange, defaults', params: { ask: 'exchange' } },
    { name: 'exchange, wide pool', params: { ask: 'exchange', values: [...five, D('semiquaver')], options: 3 } },
    { name: 'fits, defaults', params: { ask: 'fits' } },
    { name: 'fits, two times', params: { ask: 'fits', times: [{ beats: 3, beatUnit: 4 }, { beats: 4, beatUnit: 4 }], values: [D('minim'), D('crotchet')] } },
    { name: 'fits, quavers', params: { ask: 'fits', values: [D('crotchet'), D('quaver')] } },
    { name: 'meaning, defaults', params: { ask: 'meaning' } },
    { name: 'meaning, four options', params: { ask: 'meaning', options: 4 } },
  ],
});

describe('count-beats spec', () => {
  it('rejects bad params', () => {
    expect(paramsSchema.safeParse({ ask: 'dotted', values: [D('semiquaver')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ ask: 'dotted', values: [D('minim', 1)] }).success).toBe(false);
    expect(paramsSchema.safeParse({ ask: 'tie', values: [D('minim')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ ask: 'tie', options: 4 }).success).toBe(false);
    expect(paramsSchema.safeParse({ ask: 'exchange', values: [D('minim'), D('semibreve')] }).success).toBe(true);
    expect(paramsSchema.safeParse({ ask: 'exchange', values: [D('semibreve'), D('crotchet', 1)] }).success).toBe(false);
    expect(paramsSchema.safeParse({ ask: 'fits', values: [D('minim'), D('semibreve')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ ask: 'fits', times: [{ beats: 6, beatUnit: 8 }, { beats: 3, beatUnit: 4 }] }).success).toBe(false);
  });

  it('dotted: pick, final shuffle', () => {
    const { rng, calls, lists } = recordingRng([1]);
    const out = countBeats.generate(parse({}), rng, 'uk');
    expect(calls).toEqual(['pick', 'shuffle']);
    expect(lists[0]).toEqual([D('crotchet'), D('minim'), D('quaver')]);
    expect(out.prompt).toBe('How many beats does a dotted [[minim|minim]] last?');
  });

  it('dotted: the minim is 3 beats and the wrong options are the plain, doubled and bar-beat mistakes', () => {
    const { rng } = recordingRng([1]);
    const out = countBeats.generate(parse({ options: 4 }), rng, 'uk');
    const payload = out.payload as { options: { face: { text: string }; reason?: string }[]; correct: string };
    expect(payload.options.map((o) => o.face.text)).toEqual(['3 beats', '2 beats', '4 beats', '3 beats'.replace('3', '6')]);
    expect(payload.options[1]!.reason).toContain('plain [[minim|minim]] without its dot');
    expect(payload.options[2]!.reason).toContain('adds half the note');
    expect(payload.options[3]!.reason).toContain('not 6 beats');
  });

  it('tie: pick, pick, final shuffle; example', () => {
    const { rng, calls } = recordingRng([1, 0]);
    const out = countBeats.generate(parse({ ask: 'tie' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'shuffle']);
    // first = minim; the second pick is from [crotchet, quaver]: crotchet
    expect(out.prompt).toBe('A [[tie|tie]] joins one [[minim|minim]] and one [[crotchet|crotchet]]. How many beats in all?');
    expect(out.payload).toEqual({
      options: [
        { id: 'a', face: { kind: 'text', text: '3 beats' } },
        { id: 'b', face: { kind: 'text', text: '2 beats' }, reason: 'A tie joins the notes into one sound, so the second note counts too: 2 beats plus 1 beat is 3 beats.' },
        { id: 'c', face: { kind: 'text', text: '1 beat' }, reason: 'A tie joins the notes into one sound, so the first note counts too: 2 beats plus 1 beat is 3 beats.' },
      ],
      correct: 'a',
    });
  });

  it('exchange: pick big, pick small, final shuffle; the answer is the length ratio', () => {
    const { rng, calls, lists } = recordingRng([1, 0]);
    const out = countBeats.generate(parse({ ask: 'exchange' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'shuffle']);
    expect(lists[0]).toEqual([D('crotchet'), D('minim')]);
    expect(out.prompt).toBe('How many [[crotchet|crotchets]] last as long as one [[minim|minim]]?');
    const payload = out.payload as { options: { face: { text: string } }[]; correct: string };
    expect(payload.options.map((o) => o.face.text)).toEqual(['2', '4', '1']);
  });

  it('fits: pick time, build the bar, final shuffle; options are the times', () => {
    const { rng, calls } = recordingRng([1]);
    const out = countBeats.generate(parse({ ask: 'fits', values: [D('minim'), D('crotchet')] }), rng, 'uk');
    expect(calls[0]).toBe('pick');
    expect(calls[calls.length - 1]).toBe('shuffle');
    const payload = out.payload as { options: { face: { text: string } }[]; correct: string };
    expect(payload.options.map((o) => o.face.text)).toEqual(['3/4', '2/4', '4/4']);
  });

  it('meaning: pick time, pick part, final shuffle', () => {
    const { rng, calls } = recordingRng([2, 0]);
    const out = countBeats.generate(parse({ ask: 'meaning' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'shuffle']);
    expect(out.prompt).toBe('In 4/4 time, how many beats are in each [[bar|bar]]?');
  });

  it('meaning, bottom number: crotchet is right and never "a quaver"', () => {
    const { rng } = recordingRng([1, 1]);
    const out = countBeats.generate(parse({ ask: 'meaning', options: 4 }), rng, 'uk');
    expect(out.prompt).toBe('In 3/4, what does the bottom number 4 tell you?');
    const text = JSON.stringify(out.payload);
    expect(text).toContain('Each beat is the [[quaver|quaver]]');
    expect(text).not.toMatch(/a \[\[quaver\|/);
  });
});
