import { describe, expect, it } from 'vitest';
import { rhythm } from '@/engine/rhythm';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import type { Passage } from '@/engine/types';
import { recordingRng, runBattery } from '../shared/test-kit';
import { contrastByEar, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);

runBattery({
  generator: contrastByEar as never,
  sets: [
    { name: 'higher', params: { ask: 'higher' } },
    { name: 'lower, slower', params: { ask: 'lower', bpm: 60 } },
    { name: 'direction', params: { ask: 'direction' } },
    { name: 'step or jump', params: { ask: 'step-or-jump' } },
    { name: 'bigger jump', params: { ask: 'bigger-jump' } },
    { name: 'longer', params: { ask: 'longer' } },
    { name: 'shorter, two values', params: { ask: 'shorter', values: [{ value: 'minim', dots: 0 }, { value: 'crotchet', dots: 0 }] } },
  ],
});

interface ByEar {
  clips: { passage: Passage; bpm: number }[];
  options: { id: string; face: { text: string } }[];
  correct: string;
}
const lowestPos = (p: Passage) => Math.min(...p.bars[0]!.events.map((e) => (e.kind === 'note' ? pitch.stavePosition(e.pitches[0]!, 'treble') : 99)));

describe('contrast-by-ear spec', () => {
  it('higher and lower: the marked clip is really the higher or the lower, at least a 4th apart', () => {
    for (const ask of ['higher', 'lower'] as const) {
      const params = parse({ ask });
      for (let seed = 0; seed < 200; seed += 1) {
        const p = contrastByEar.generate(params, createRng(seed), 'uk').payload as ByEar;
        const [a, b] = p.clips.map((c) => lowestPos(c.passage)) as [number, number];
        expect(Math.abs(a - b)).toBeGreaterThanOrEqual(3);
        const winner = p.correct === 'a' ? a : b;
        expect(winner).toBe(ask === 'higher' ? Math.max(a, b) : Math.min(a, b));
      }
    }
  });

  it('higher: pick, pick; options are Clip A and Clip B in that order with no shuffle', () => {
    const { rng, calls } = recordingRng([0, 0]);
    const out = contrastByEar.generate(parse({ ask: 'higher' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick']);
    expect(out.prompt).toBe('Which clip sounds higher?');
    const p = out.payload as ByEar;
    expect(p.options.map((o) => o.face.text)).toEqual(['Clip A', 'Clip B']);
    expect(p.correct).toBe('b');
    expect(p.options[0]).toMatchObject({ reason: 'Clip A sounds lower than clip B. Listen for the clip that sounds higher.' });
  });

  it('direction: dir, step, start, final shuffle; the notes really go that way', () => {
    const { rng, calls } = recordingRng([0, 1, 0]);
    const out = contrastByEar.generate(parse({ ask: 'direction' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'pick', 'shuffle']);
    const p = out.payload as ByEar & { options: { face: { text: string }; reason?: string }[] };
    const positions = p.clips[0]!.passage.bars[0]!.events.map((e) => (e.kind === 'note' ? pitch.stavePosition(e.pitches[0]!, 'treble') : 0));
    expect(positions).toEqual([-2, 0, 2]);
    expect(p.options.map((o) => o.face.text)).toEqual(['Going up', 'Going down', 'Staying the same']);
    expect(p.options[1]!.reason).toBe('The notes get higher one by one, so the tune is going up, not going down.');
  });

  it('step-or-jump: the clip is a second apart for a step and at least a 4th for a jump', () => {
    const step = contrastByEar.generate(parse({ ask: 'step-or-jump' }), recordingRng([0, 0]).rng, 'uk').payload as ByEar;
    const [s1, s2] = step.clips[0]!.passage.bars[0]!.events.map((e) => (e.kind === 'note' ? pitch.stavePosition(e.pitches[0]!, 'treble') : 0)) as [number, number];
    expect(s2 - s1).toBe(1);
    expect(step.options.find((o) => o.id === step.correct)!.face.text).toBe('A step');
    const jump = contrastByEar.generate(parse({ ask: 'step-or-jump' }), recordingRng([1, 0, 0]).rng, 'uk').payload as ByEar;
    const [j1, j2] = jump.clips[0]!.passage.bars[0]!.events.map((e) => (e.kind === 'note' ? pitch.stavePosition(e.pitches[0]!, 'treble') : 0)) as [number, number];
    expect(j2 - j1).toBe(3);
    expect(jump.options.find((o) => o.id === jump.correct)!.face.text).toBe('A jump');
  });

  it('bigger-jump: the two jumps differ by at least two letters', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const p = contrastByEar.generate(parse({ ask: 'bigger-jump' }), createRng(seed), 'uk').payload as ByEar;
      const [a, b] = p.clips.map((c) => {
        const [x, y] = c.passage.bars[0]!.events.map((e) => (e.kind === 'note' ? pitch.stavePosition(e.pitches[0]!, 'treble') : 0)) as [number, number];
        return y - x;
      }) as [number, number];
      expect(Math.abs(a - b)).toBeGreaterThanOrEqual(2);
      expect(p.correct).toBe(a > b ? 'a' : 'b');
    }
  });

  it('longer and shorter: one note then the rests that fill the bar; the semibreve has no rests', () => {
    const { rng, calls } = recordingRng([0, 0]);
    const out = contrastByEar.generate(parse({ ask: 'longer' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick']);
    const p = out.payload as ByEar;
    expect(p.clips[0]!.passage.bars[0]!.events).toHaveLength(1);
    expect(p.clips[1]!.passage.bars[0]!.events.map((e) => `${e.kind}:${e.duration.value}`)).toEqual(['note:minim', 'rest:minim']);
    expect(p.correct).toBe('a');
    const shorter = contrastByEar.generate(parse({ ask: 'shorter' }), recordingRng([2, 0]).rng, 'uk').payload as ByEar;
    expect(shorter.clips[0]!.passage.bars[0]!.events.map((e) => `${e.kind}:${e.duration.value}`)).toEqual(['note:crotchet', 'rest:crotchet', 'rest:minim']);
    for (const clip of shorter.clips) expect(rhythm.checkBarLength(clip.passage.bars[0]!, clip.passage.time).status).toBe('complete');
    expect(shorter.correct).toBe('a');
  });
});
