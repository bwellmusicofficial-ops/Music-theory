import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import type { Pitch } from '@/engine/types';
import { recordingRng, runBattery } from '../shared/test-kit';
import { paramsSchema, spotScaleNote } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const wide = ['C', 'G', 'D', 'F', 'A', 'E', 'B'];

runBattery({
  generator: spotScaleNote as never,
  sets: [
    { name: 'defaults', params: {} },
    { name: 'missing sign only', params: { faults: ['missing-sign'] } },
    { name: 'wrong letter only, bass', params: { faults: ['wrong-letter'], clef: 'bass' } },
    { name: 'wider keys', params: { keys: wide } },
    { name: 'C major only (missing-sign cannot apply)', params: { keys: ['C'] } },
  ],
});

interface P {
  passage: { key: { tonic: Pitch }; clef: string; bars: { events: { pitches: Pitch[] }[] }[] };
  mistake: { bar: number; event: number };
  explanation: string;
}

describe('spot-scale-note spec', () => {
  it('exactly one note differs from the true scale, and it is the marked one', () => {
    const params = parse({ keys: wide });
    for (let seed = 0; seed < 300; seed += 1) {
      const out = spotScaleNote.generate(params, createRng(seed), 'uk');
      const p = out.payload as P;
      const scale = pitch.scale(p.passage.key.tonic, 'major', p.passage.clef === 'treble' ? 4 : 3);
      const written = p.passage.bars.flatMap((b) => b.events.map((e) => e.pitches[0]!));
      const wrong = written.map((w, i) => (pitch.formatPitch(w) !== pitch.formatPitch(scale[i]!) ? i : -1)).filter((i) => i >= 0);
      expect(wrong).toEqual([p.mistake.bar * 4 + p.mistake.event]);
      expect(wrong[0]).not.toBe(0);
      expect(wrong[0]).not.toBe(7);
    }
  });

  it('C major never gets a missing-sign fault', () => {
    const { rng, lists } = recordingRng([0, 0, 0, 0]);
    spotScaleNote.generate(parse({ keys: ['C'] }), rng, 'uk');
    expect(lists[1]).toEqual(['wrong-letter']);
  });

  it('missing-sign example: G major, note 7 written as F natural', () => {
    // key index 1 (G), fault index 1 (missing-sign), note index 0 of the signed notes.
    const { rng, calls } = recordingRng([1, 1, 0]);
    const out = spotScaleNote.generate(parse({}), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'pick']);
    expect(out.prompt).toBe('This should be the scale of G major, going up. Tap the one wrong note.');
    const p = out.payload as P;
    expect(p.mistake).toEqual({ bar: 1, event: 2 });
    expect(p.explanation).toBe('Note 7 of G major should be F♯. This note is F natural. The key signature makes every F sharp.');
  });

  it('wrong-letter example: pick key, fault, position, direction', () => {
    // C major (index 0), only fault is wrong-letter; position index 3 (note 5), direction index 1 (up): G becomes A.
    const { rng, calls } = recordingRng([0, 0, 3, 1]);
    const out = spotScaleNote.generate(parse({ keys: ['C'] }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'pick', 'pick']);
    expect((out.payload as P).explanation).toBe('Note 5 of C major should be G. This note is A.');
  });
});
