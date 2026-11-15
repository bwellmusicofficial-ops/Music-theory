import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { recordingRng, runBattery } from '../shared/test-kit';
import { intervalPlace, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);

runBattery({
  generator: intervalPlace as never,
  sets: [
    { name: 'defaults', params: {} },
    { name: 'bass', params: { clef: 'bass' } },
    { name: 'thirds and fifths in wide keys', params: { numbers: [3, 5], keys: ['C', 'G', 'D', 'F', 'A', 'E', 'B'] } },
  ],
});

describe('interval-place spec', () => {
  it('excludes the 8th: the octave cannot be checked on an empty stave', () => {
    expect(paramsSchema.safeParse({ numbers: [8] }).success).toBe(false);
  });

  it('pick key, pick number; the target is the scale degree and no octave is given', () => {
    const { rng, calls } = recordingRng([2, 3]);
    const out = intervalPlace.generate(parse({}), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick']);
    expect(out.prompt).toBe('In D major, put the note that is a 5th above the key note, D, on the [[stave|stave]].');
    expect(out.payload).toEqual({
      mode: 'place',
      clef: 'treble',
      key: { tonic: pitch.parsePitchClass('D'), mode: 'major' },
      target: { letter: 'A', accidental: 0 },
      accidentals: true,
    });
  });

  it('C major needs no accidentals; D major 3rd is F sharp', () => {
    const c = intervalPlace.generate(parse({}), recordingRng([0, 0]).rng, 'us');
    expect(c.prompt).toContain('[[stave|staff]]');
    expect((c.payload as { accidentals: boolean }).accidentals).toBe(false);
    const d = intervalPlace.generate(parse({}), recordingRng([2, 1]).rng, 'uk');
    expect((d.payload as { target: unknown }).target).toEqual({ letter: 'F', accidental: 1 });
  });
});
