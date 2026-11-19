import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import type { Key } from '@/engine/types';
import { recordingRng, runBattery } from '../shared/test-kit';
import { GRADE_1_KEYS, paramsSchema, writeKeySignature } from './index';

const major = (letter: string, accidental = 0) => ({ tonic: { letter, accidental }, mode: 'major' });
const minor = (letter: string, accidental = 0) => ({ tonic: { letter, accidental }, mode: 'minor' });

runBattery({
  generator: writeKeySignature as never,
  sets: [
    { name: 'Grade 1 defaults', params: {} },
    { name: 'treble only', params: { clefs: ['treble'] } },
    { name: 'Grade 2 keys', params: { keys: [major('A'), major('B', -1), major('E', -1), minor('E'), minor('D'), minor('A')].slice(0, 5) } },
    { name: 'every key with a signature, any octave', params: { keys: pitch.allKeys().filter((k) => pitch.keySignature(k) !== 0), placement: 'any-octave' } },
  ],
});

describe('write-key-signature spec', () => {
  it('rejects C major, A minor, duplicates and unknown params', () => {
    expect(paramsSchema.safeParse({ keys: [major('C')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ keys: [minor('A')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ keys: [major('G'), major('G')] }).success).toBe(false);
    expect(paramsSchema.safeParse({ clefs: ['alto'] }).success).toBe(false);
  });

  it('draws the key, then the clef, in that order', () => {
    const { rng, calls, lists } = recordingRng([1, 1]);
    const out = writeKeySignature.generate(paramsSchema.parse({}), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick']);
    expect(lists[0]).toEqual(GRADE_1_KEYS);
    expect(out.payload).toEqual({ clef: 'bass', key: GRADE_1_KEYS[1] });
    expect(out.prompt).toBe('Write the [[key-signature|key signature]] of D major.');
  });

  it('names the key with the engine, flats with real glyphs', () => {
    const out = writeKeySignature.generate(paramsSchema.parse({ keys: [major('B', -1)] }), createRng(1), 'us');
    expect(out.prompt).toBe('Write the [[key-signature|key signature]] of B♭ major.');
  });

  it('never gives C major, and puts placement in the payload only when asked', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const { payload } = writeKeySignature.generate(paramsSchema.parse({}), createRng(seed), 'uk');
      expect(pitch.keySignature((payload as { key: Key }).key)).not.toBe(0);
      expect(payload).not.toHaveProperty('placement');
    }
    expect(writeKeySignature.generate(paramsSchema.parse({ placement: 'any-octave' }), createRng(1), 'uk').payload).toHaveProperty('placement', 'any-octave');
  });
});
