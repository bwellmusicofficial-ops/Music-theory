import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { pitch } from '@/engine/pitch';
import type { Rng } from '@/engine/types';
import { payloadSchema as noteOnStaveSchema } from '@/lesson/questions/note-on-stave/schema';
import { nameNoteOnStave } from './index';
import { paramsSchema } from './params';

const P = pitch.parsePitch;
const key = (tonic: string, mode: 'major' | 'minor' = 'major') => ({ tonic: pitch.parsePitchClass(tonic), mode });

/** Authored-shape params, as a lesson file would give them. */
const treble = { mode: 'identify', clef: 'treble', low: P('E4'), high: P('F5') };

const parse = (input: object) => paramsSchema.parse(input);
const run = (input: object, seed: number) => nameNoteOnStave.generate(parse(input), createRng(seed), 'uk');

/** An rng that records every call and answers `pick` with the chosen index. */
function recordingRng(indexes: number[]): { rng: Rng; calls: string[]; lists: unknown[][] } {
  const calls: string[] = [];
  const lists: unknown[][] = [];
  let at = 0;
  const rng: Rng = {
    next: () => {
      calls.push('next');
      return 0;
    },
    int: () => {
      calls.push('int');
      return 0;
    },
    pick: <T,>(items: readonly T[]): T => {
      calls.push('pick');
      lists.push([...items]);
      return items[indexes[at++] ?? 0] as T;
    },
    shuffle: <T,>(items: readonly T[]): T[] => {
      calls.push('shuffle');
      return [...items];
    },
  };
  return { rng, calls, lists };
}

describe('name-note-on-stave paramsSchema', () => {
  it('applies the defaults', () => {
    expect(parse(treble)).toEqual({
      ...treble,
      positions: 'all',
      key: key('C'),
      accidentals: false,
    });
  });

  it('rejects unknown keys', () => {
    expect(paramsSchema.safeParse({ ...treble, extra: 1 }).success).toBe(false);
  });

  it('needs naturals, low below high', () => {
    expect(paramsSchema.safeParse({ ...treble, low: P('F#4') }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, high: P('Bb5') }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, low: P('F5'), high: P('E4') }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, low: P('E4'), high: P('E4') }).success).toBe(false);
  });

  it('keeps low and high within stave positions -4 to 12', () => {
    expect(paramsSchema.safeParse({ ...treble, low: P('A3'), high: P('C6') }).success).toBe(true);
    expect(paramsSchema.safeParse({ ...treble, low: P('G3') }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, high: P('D6') }).success).toBe(false);
  });

  it('needs at least three candidates after the positions filter', () => {
    // E4..G4 is positions 0..2: lines are 0 and 2 only.
    expect(paramsSchema.safeParse({ ...treble, high: P('G4'), positions: 'lines' }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, high: P('G4'), positions: 'all' }).success).toBe(true);
    // E4..B4 is positions 0..4: spaces are 1 and 3.
    expect(paramsSchema.safeParse({ ...treble, high: P('B4'), positions: 'spaces' }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...treble, high: P('B4'), positions: 'lines' }).success).toBe(true);
  });
});

describe('name-note-on-stave generate', () => {
  it('has the id lesson files use', () => {
    expect(nameNoteOnStave.id).toBe('name-note-on-stave');
  });

  it('draws the position, then (only with accidentals) the accidental, and nothing else', () => {
    const plain = recordingRng([0]);
    nameNoteOnStave.generate(parse(treble), plain.rng, 'uk');
    expect(plain.calls).toEqual(['pick']);
    expect(plain.lists[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    const signs = recordingRng([0, 2]);
    nameNoteOnStave.generate(parse({ ...treble, accidentals: true }), signs.rng, 'uk');
    expect(signs.calls).toEqual(['pick', 'pick']);
    expect(signs.lists[1]).toEqual([-1, 0, 1]);
  });

  it('lists candidates ascending, lines even and spaces odd, ledger lines counting as lines', () => {
    const lines = recordingRng([0]);
    nameNoteOnStave.generate(parse({ ...treble, low: P('C4'), high: P('A5'), positions: 'lines' }), lines.rng, 'uk');
    expect(lines.lists[0]).toEqual([-2, 0, 2, 4, 6, 8, 10]);
    const spaces = recordingRng([0]);
    nameNoteOnStave.generate(parse({ ...treble, low: P('C4'), high: P('A5'), positions: 'spaces' }), spaces.rng, 'uk');
    expect(spaces.lists[0]).toEqual([-1, 1, 3, 5, 7, 9]);
  });

  it('identify: with the spec params and position 2 the payload is the spec example', () => {
    const { rng } = recordingRng([1]); // lines E4..F5 are positions 0,2,4,6,8: index 1 is position 2
    const out = nameNoteOnStave.generate(parse({ ...treble, positions: 'lines' }), rng, 'uk');
    expect(out).toEqual({
      type: 'note-on-stave',
      payload: {
        mode: 'identify',
        clef: 'treble',
        key: key('C'),
        pitch: { letter: 'G', accidental: 0, octave: 4 },
        accidentals: false,
      },
    });
    expect('prompt' in out).toBe(false);
  });

  it('place: never sets octave, and the prompt names the target in bold', () => {
    const { rng } = recordingRng([1]);
    const out = nameNoteOnStave.generate(parse({ ...treble, mode: 'place', positions: 'lines' }), rng, 'uk');
    expect(out).toEqual({
      type: 'note-on-stave',
      payload: { mode: 'place', clef: 'treble', key: key('C'), target: { letter: 'G', accidental: 0 }, accidentals: false },
      prompt: 'Put the note **G** on the stave.',
    });
    expect(out.payload).not.toHaveProperty('octave');
  });

  it('place: the prompt shows a sharp or flat with its glyph', () => {
    // Lines are positions 0,2,4,6,8: index 1 is G. Index 2 of [-1, 0, 1] is a sharp.
    const { rng } = recordingRng([1, 2]);
    const out = nameNoteOnStave.generate(
      parse({ ...treble, mode: 'place', positions: 'lines', accidentals: true }),
      rng,
      'uk',
    );
    expect(out.prompt).toBe('Put the note **G♯** on the stave.');
  });

  it('with accidentals false, the key signature sets the accidental of the letter', () => {
    // G major: top line F is F sharp. Position 8 in the lines of E4..F5 is index 4.
    const { rng } = recordingRng([4]);
    const out = nameNoteOnStave.generate(parse({ ...treble, positions: 'lines', key: key('G') }), rng, 'uk');
    expect(out.payload).toEqual({
      mode: 'identify',
      clef: 'treble',
      key: key('G'),
      pitch: { letter: 'F', accidental: 1, octave: 5 },
      accidentals: true,
    });
  });

  it('a key signature makes needsSigns true even when accidentals is false', () => {
    const out = run({ ...treble, key: key('F') }, 3);
    expect((out.payload as { accidentals: boolean }).accidentals).toBe(true);
    const none = run({ ...treble, key: key('A', 'minor') }, 3);
    expect((none.payload as { accidentals: boolean }).accidentals).toBe(false);
  });

  it('with accidentals true, E sharp, B sharp, C flat and F flat become naturals without a second draw', () => {
    // Positions for E4..F5: E4=0 F=1 G=2 A=3 B=4 C5=5 D=6 E5=7 F5=8. Pick the sharp (index 2) each time.
    const results: Record<string, number> = {};
    for (const [index, letter] of [[0, 'E'], [4, 'B']] as const) {
      const { rng, calls } = recordingRng([index, 2]);
      const out = nameNoteOnStave.generate(parse({ ...treble, accidentals: true }), rng, 'uk');
      const note = (out.payload as { pitch: { letter: string; accidental: number } }).pitch;
      expect(note.letter).toBe(letter);
      results[letter] = note.accidental;
      expect(calls).toEqual(['pick', 'pick']);
    }
    expect(results).toEqual({ E: 0, B: 0 });
    // C flat and F flat: pick the flat (index 0).
    for (const [index, letter] of [[5, 'C'], [1, 'F']] as const) {
      const { rng } = recordingRng([index, 0]);
      const out = nameNoteOnStave.generate(parse({ ...treble, accidentals: true }), rng, 'uk');
      expect((out.payload as { pitch: { letter: string; accidental: number } }).pitch).toMatchObject({ letter, accidental: 0 });
    }
    // Other letters keep their sharp or flat.
    const { rng } = recordingRng([2, 2]);
    const g = nameNoteOnStave.generate(parse({ ...treble, accidentals: true }), rng, 'uk');
    expect((g.payload as { pitch: { accidental: number } }).pitch.accidental).toBe(1);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const params = { ...treble, accidentals: true, key: key('D') };
    for (const seed of [1, 7, 42, 12345]) {
      expect(run(params, seed)).toEqual(run(params, seed));
    }
    const distinct = new Set(Array.from({ length: 50 }, (_, seed) => JSON.stringify(run(params, seed))));
    expect(distinct.size).toBeGreaterThan(10);
  });
});

describe('name-note-on-stave output validates against the note-on-stave payloadSchema', () => {
  const setups: [string, object][] = [
    ['identify, treble lines', { ...treble, positions: 'lines' }],
    ['identify, treble spaces', { ...treble, positions: 'spaces' }],
    ['identify, treble with ledger lines', { ...treble, low: P('A3'), high: P('C6') }],
    ['identify, bass, accidentals', { mode: 'identify', clef: 'bass', low: P('G2'), high: P('A3'), accidentals: true }],
    ['identify, alto, key', { mode: 'identify', clef: 'alto', low: P('F3'), high: P('G4'), key: key('E', 'major') }],
    ['identify, tenor, flats and accidentals', { mode: 'identify', clef: 'tenor', low: P('D3'), high: P('E4'), key: key('Bb'), accidentals: true }],
    ['place, treble', { ...treble, mode: 'place' }],
    ['place, bass, accidentals', { mode: 'place', clef: 'bass', low: P('F2'), high: P('B3'), accidentals: true }],
    ['place, key of A major', { ...treble, mode: 'place', key: key('A') }],
    ['place, C sharp minor, accidentals', { ...treble, mode: 'place', key: key('C#', 'minor'), accidentals: true }],
    ['place, spaces only', { ...treble, mode: 'place', positions: 'spaces' }],
  ];

  it.each(setups)('%s: 500 seeds', (_label, input) => {
    const params = parse(input);
    for (let seed = 0; seed < 500; seed++) {
      const out = nameNoteOnStave.generate(params, createRng(seed), 'uk');
      expect(out.type).toBe('note-on-stave');
      const result = noteOnStaveSchema.safeParse(out.payload);
      if (!result.success) throw new Error(`seed ${seed}: ${JSON.stringify(out.payload)} ${result.error.message}`);
      if (params.mode === 'place') expect(typeof out.prompt).toBe('string');
      else expect(out.prompt).toBeUndefined();
    }
  });
});
