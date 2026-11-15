import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { recordingRng, runBattery } from '../shared/test-kit';
import { paramsSchema, playScaleOrTriad } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const names = (payload: unknown) => (payload as { targets: never[] }).targets.map(pitch.formatPitch);

runBattery({
  generator: playScaleOrTriad as never,
  sets: [
    { name: 'scale', params: { ask: 'scale' } },
    { name: 'scale, labels, wider keys', params: { ask: 'scale', keys: ['C', 'G', 'D', 'F', 'A', 'E', 'B'], showLabels: true } },
    { name: 'degree', params: { ask: 'degree' } },
    { name: 'degree 3, 5 and 8', params: { ask: 'degree', degrees: [3, 5, 8] } },
    { name: 'triad', params: { ask: 'triad' } },
    { name: 'triad, wider keys', params: { ask: 'triad', keys: ['A', 'E', 'B', 'F'] } },
  ],
});

describe('play-scale-or-triad spec', () => {
  it('scale: one pick for the tonic', () => {
    const { rng, calls } = recordingRng([2]);
    const out = playScaleOrTriad.generate(parse({ ask: 'scale' }), rng, 'uk');
    expect(calls).toEqual(['pick']);
    expect(out.prompt).toBe('Play the scale of D major, going up.');
    expect(names(out.payload)).toEqual(['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5']);
    expect(out.payload).toMatchObject({ low: { letter: 'D', octave: 4 }, high: { letter: 'D', octave: 5 }, mode: 'sequence', octave: 'exact' });
  });

  it('degree: pick tonic, pick degree', () => {
    const { rng, calls } = recordingRng([1, 3]);
    const out = playScaleOrTriad.generate(parse({ ask: 'degree' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick']);
    expect(out.prompt).toBe('Play note 5 of the scale of G major.');
    expect(names(out.payload)).toEqual(['D5']);
  });

  it('triad: together, from the engine', () => {
    const out = playScaleOrTriad.generate(parse({ ask: 'triad' }), recordingRng([3]).rng, 'uk');
    expect(out.prompt).toBe('Play the tonic [[triad|triad]] of F major.');
    expect(names(out.payload)).toEqual(['F4', 'A4', 'C5']);
    expect(out.payload).toMatchObject({ mode: 'together' });
  });
});
