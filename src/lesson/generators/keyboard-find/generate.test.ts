import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { recordingRng, runBattery } from '../shared/test-kit';
import { blackKeyGroups, keyboardFind, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const names = (payload: unknown) => (payload as { targets: never[] }).targets.map(pitch.formatPitch);

runBattery({
  generator: keyboardFind as never,
  sets: [
    { name: 'find every C', params: { ask: 'find-every', letters: ['C'] } },
    { name: 'find every letter', params: { ask: 'find-every', showLabels: true } },
    { name: 'black key groups', params: { ask: 'black-keys' } },
    { name: 'next note', params: { ask: 'next-note' } },
    { name: 'previous note', params: { ask: 'previous-note', letters: ['A', 'C', 'G'] } },
    { name: 'steps', params: { ask: 'step' } },
    { name: 'semitones up', params: { ask: 'step', steps: ['semitone'], directions: ['up'] } },
    { name: 'tones down', params: { ask: 'step', steps: ['tone'], directions: ['down'] } },
  ],
});

describe('keyboard-find spec', () => {
  it('reads the black key groups off the keyboard', () => {
    const { twos, threes } = blackKeyGroups();
    expect(twos.map(pitch.formatPitch)).toEqual(['C#4', 'D#4']);
    expect(threes.map(pitch.formatPitch)).toEqual(['F#4', 'G#4', 'A#4']);
  });

  it('find-every: pick letter, int octave; targets are every key with that letter', () => {
    const { rng, calls } = recordingRng([0, 0]);
    const out = keyboardFind.generate(parse({ ask: 'find-every', letters: ['C'] }), rng, 'uk');
    expect(calls).toEqual(['pick', 'int']);
    expect(out.prompt).toBe('Play every C on this keyboard.');
    expect(names(out.payload)).toEqual(['C3', 'C4', 'C5']);
    const d = keyboardFind.generate(parse({ ask: 'find-every', letters: ['D'] }), recordingRng([0, 1]).rng, 'uk');
    expect(names(d.payload)).toEqual(['D4', 'D5']);
  });

  it('black-keys: one pick', () => {
    const { rng, calls } = recordingRng([1]);
    const out = keyboardFind.generate(parse({ ask: 'black-keys' }), rng, 'uk');
    expect(calls).toEqual(['pick']);
    expect(out.prompt).toBe('Play the group of three black keys.');
    expect(names(out.payload)).toEqual(['F#4', 'G#4', 'A#4']);
  });

  it('next and previous follow the musical alphabet round the corner', () => {
    const next = keyboardFind.generate(parse({ ask: 'next-note', letters: ['G'] }), recordingRng([0]).rng, 'uk');
    expect(next.prompt).toBe('Play the note after G in the musical alphabet.');
    expect(names(next.payload)).toEqual(['A4']);
    const previous = keyboardFind.generate(parse({ ask: 'previous-note', letters: ['A'] }), recordingRng([0]).rng, 'uk');
    expect(names(previous.payload)).toEqual(['G4']);
    expect(previous.payload).toMatchObject({ octave: 'any', mode: 'sequence' });
  });

  it('step: start, step, direction; spelled as a keyboard player names it', () => {
    // C4 index 0, steps index 1 (semitone), directions index 0 (up): C sharp.
    const a = keyboardFind.generate(parse({ ask: 'step' }), recordingRng([0, 1, 0]).rng, 'uk');
    expect(a.prompt).toBe('Play the note a [[semitone|semitone]] above C.');
    expect(names(a.payload)).toEqual(['C#4']);
    // E4 up a semitone is F; B4 up a semitone is C5; F4 down is E4; D4 down is Db4.
    const e = keyboardFind.generate(parse({ ask: 'step' }), recordingRng([2, 1, 0]).rng, 'uk');
    expect(names(e.payload)).toEqual(['F4']);
    const b = keyboardFind.generate(parse({ ask: 'step' }), recordingRng([6, 1, 0]).rng, 'uk');
    expect(names(b.payload)).toEqual(['C5']);
    const f = keyboardFind.generate(parse({ ask: 'step' }), recordingRng([3, 1, 1]).rng, 'uk');
    expect(names(f.payload)).toEqual(['E4']);
    const d = keyboardFind.generate(parse({ ask: 'step' }), recordingRng([1, 1, 1]).rng, 'uk');
    expect(names(d.payload)).toEqual(['Db4']);
    const tone = keyboardFind.generate(parse({ ask: 'step' }), recordingRng([2, 0, 0]).rng, 'us');
    expect(tone.prompt).toBe('Play the note a [[tone|whole step]] above E.');
    expect(names(tone.payload)).toEqual(['F#4']);
  });
});
