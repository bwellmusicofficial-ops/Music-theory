import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import { recordingRng, runBattery } from '../shared/test-kit';
import { paramsSchema, playWrittenNote } from './index';

const P = pitch.parsePitch;
const parse = (input: object) => paramsSchema.parse(input);
const key = (tonic: string) => ({ tonic: pitch.parsePitchClass(tonic), mode: 'major' as const });
const treble = { clef: 'treble', low: P('E4'), high: P('F5') };

runBattery({
  generator: playWrittenNote as never,
  sets: [
    { name: 'treble lines', params: { ...treble, positions: 'lines' } },
    { name: 'treble with ledger lines', params: { ...treble, low: P('A3'), high: P('C6'), octaves: 2 } },
    { name: 'bass spaces, labels', params: { clef: 'bass', low: P('G2'), high: P('A3'), positions: 'spaces', showLabels: true } },
    { name: 'bass with middle C', params: { clef: 'bass', low: P('E2'), high: P('E4'), octaves: 2 } },
    { name: 'accidentals', params: { ...treble, accidentals: true } },
    { name: 'key of D, two octaves', params: { ...treble, key: key('D'), octaves: 2 } },
    { name: 'key of F, accidentals', params: { clef: 'bass', low: P('G2'), high: P('A3'), key: key('F'), accidentals: true } },
  ],
});

describe('play-written-note spec', () => {
  it('rejects bad params', () => {
    expect(paramsSchema.safeParse({ ...treble, clef: 'alto' }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, low: P('F#4') }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, high: P('D6') }).success).toBe(false);
  });

  it('draws position, then accidental, then keyboard shift only for two octaves', () => {
    const one = recordingRng([0]);
    playWrittenNote.generate(parse(treble), one.rng, 'uk');
    expect(one.calls).toEqual(['pick']);
    const signs = recordingRng([0, 2]);
    playWrittenNote.generate(parse({ ...treble, accidentals: true }), signs.rng, 'uk');
    expect(signs.calls).toEqual(['pick', 'pick']);
    const two = recordingRng([0, 2, 1]);
    playWrittenNote.generate(parse({ ...treble, accidentals: true, octaves: 2 }), two.rng, 'uk');
    expect(two.calls).toEqual(['pick', 'pick', 'int']);
  });

  it('example: E4 on the bottom line, a one-octave keyboard from C4', () => {
    const { rng } = recordingRng([0]);
    const out = playWrittenNote.generate(parse(treble), rng, 'uk');
    expect(out.prompt).toBe('Play this note on the keyboard.');
    expect(out.payload).toMatchObject({
      low: { letter: 'C', accidental: 0, octave: 4 },
      high: { letter: 'C', accidental: 0, octave: 5 },
      targets: [{ letter: 'E', accidental: 0, octave: 4 }],
      mode: 'sequence',
      octave: 'exact',
    });
  });

  it('the note sits inside the keyboard, even a sharp next to the top C', () => {
    const params = parse({ ...treble, accidentals: true, octaves: 2 });
    for (let seed = 0; seed < 200; seed += 1) {
      const out = playWrittenNote.generate(params, createRng(seed), 'uk');
      const p = out.payload as { low: never; high: never; targets: never[] };
      const midi = pitch.toMidi(p.targets[0]!);
      expect(midi).toBeGreaterThanOrEqual(pitch.toMidi(p.low));
      expect(midi).toBeLessThanOrEqual(pitch.toMidi(p.high));
    }
  });
});
