import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import { recordingRng, runBattery } from '../shared/test-kit';
import { paramsSchema, toneOrSemitone } from './index';

const parse = (input: object) => paramsSchema.parse(input);

runBattery({
  generator: toneOrSemitone as never,
  sets: [
    { name: 'keyboard', params: {} },
    { name: 'major scale, grade 1 keys', params: { source: 'major-scale' } },
    { name: 'major scale, more keys', params: { source: 'major-scale', keys: ['A', 'E', 'B', 'F', 'C'] } },
  ],
});

describe('tone-or-semitone spec', () => {
  it('keyboard: pick start, pick size, final shuffle; E to F is a semitone', () => {
    const { rng, calls } = recordingRng([2, 0]);
    const out = toneOrSemitone.generate(parse({}), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'shuffle']);
    expect(out.prompt).toBe('What is the step from E up to F?');
    const payload = out.payload as { exhibit: unknown; options: { face: { text: string }; reason?: string }[]; correct: string };
    expect(payload.exhibit).toEqual({ kind: 'keyboard', highlight: ['E4', 'F4'], low: 'C4', high: 'E5' });
    expect(payload.options).toEqual([
      { id: 'a', face: { kind: 'text', text: 'A [[semitone|semitone]]' } },
      {
        id: 'b',
        face: { kind: 'text', text: 'A [[tone|tone]]' },
        reason: 'E and F are neighbouring keys with nothing between them. Neighbours are a [[semitone|semitone]], not a [[tone|tone]].',
      },
    ]);
  });

  it('keyboard: C to D has a black key between', () => {
    const { rng } = recordingRng([0, 1]);
    const out = toneOrSemitone.generate(parse({}), rng, 'us');
    expect(JSON.stringify(out.payload)).toContain('have one key between them, C♯, so they are a [[tone|whole step]] apart');
  });

  it('major scale: pick tonic, int degree, final shuffle; 3 to 4 and 7 to 8 are semitones', () => {
    const { rng, calls } = recordingRng([1, 2]);
    const out = toneOrSemitone.generate(parse({ source: 'major-scale' }), rng, 'uk');
    expect(calls).toEqual(['pick', 'int', 'shuffle']);
    // G major, degree 3 (B) to 4 (C): a semitone.
    expect(out.prompt).toBe('In G major, what is the step from note 3 (B) to note 4 (C)?');
    expect((out.payload as { options: { face: { text: string } }[]; correct: string }).options[0]!.face.text).toBe('A [[semitone|semitone]]');
  });

  it('in every major scale only degrees 3 and 7 give a semitone', () => {
    const params = parse({ source: 'major-scale', keys: ['C', 'G', 'D', 'F', 'A', 'E', 'B'] });
    const seen = new Map<string, Set<boolean>>();
    for (let seed = 0; seed < 300; seed += 1) {
      const out = toneOrSemitone.generate(params, createRng(seed), 'uk');
      const m = /note (\d)/.exec(out.prompt!)!;
      const payload = out.payload as { exhibit: { highlight: string[] } };
      const [a, b] = payload.exhibit.highlight.map((s) => pitch.parsePitch(s));
      const semitone = pitch.toMidi(b!) - pitch.toMidi(a!) === 1;
      const set = seen.get(m[1]!) ?? new Set<boolean>();
      set.add(semitone);
      seen.set(m[1]!, set);
    }
    for (const [d, set] of seen) expect([...set]).toEqual([d === '3' || d === '7']);
  });
});
