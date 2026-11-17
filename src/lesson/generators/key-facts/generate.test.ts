import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { recordingRng, runBattery } from '../shared/test-kit';
import { keyFacts, paramsSchema } from './index';

const parse = (input: object) => paramsSchema.parse(input);
const wide = ['C', 'G', 'D', 'F', 'A', 'E', 'B'];

runBattery({
  generator: keyFacts as never,
  sets: [
    { name: 'name-key', params: { ask: 'name-key' } },
    { name: 'name-key, bass, wide', params: { ask: 'name-key', clef: 'bass', keys: wide } },
    { name: 'accidentals', params: { ask: 'accidentals' } },
    { name: 'accidentals, three options', params: { ask: 'accidentals', options: 3, keys: wide } },
    { name: 'from-triad', params: { ask: 'from-triad' } },
    { name: 'from-triad, bass', params: { ask: 'from-triad', clef: 'bass', options: 3 } },
    { name: 'degree-note', params: { ask: 'degree-note' } },
    { name: 'degree-note, four options', params: { ask: 'degree-note', options: 4, keys: wide } },
    { name: 'note-degree', params: { ask: 'note-degree' } },
    { name: 'note-degree, four options', params: { ask: 'note-degree', options: 4 } },
  ],
});

const options = (out: { payload: unknown }) =>
  (out.payload as { options: { face: { text: string }; reason?: string }[] }).options;

describe('key-facts spec', () => {
  it('rejects bad params', () => {
    expect(paramsSchema.safeParse({ ask: 'name-key', keys: ['C'] }).success).toBe(false);
    expect(paramsSchema.safeParse({ ask: 'degree-note', keys: ['C'] }).success).toBe(true);
  });

  it('name-key: pick key, shuffle others, final shuffle; example with reasons from the engine', () => {
    const { rng, calls } = recordingRng([2]);
    const out = keyFacts.generate(parse({ ask: 'name-key', options: 3 }), rng, 'uk');
    expect(calls).toEqual(['pick', 'shuffle', 'shuffle']);
    expect(out.prompt).toBe('Which key has this [[key-signature|key signature]]?');
    expect(options(out).map((o) => o.face.text)).toEqual(['D major', 'C major', 'G major']);
    expect(options(out)[1]!.reason).toBe('C major has no sharps or flats. This signature has two sharps, F♯ and C♯, so the key is D major.');
    expect(options(out)[2]!.reason).toBe('G major has one sharp, F♯. This signature has two sharps, F♯ and C♯, so the key is D major.');
  });

  it('name-key: C major says its empty signature has no sharps or flats; other keys do not', () => {
    const c = keyFacts.generate(parse({ ask: 'name-key' }), recordingRng([0]).rng, 'uk');
    expect(c.prompt).toBe('Which key has this [[key-signature|key signature]]? It has no sharps or flats.');
    const g = keyFacts.generate(parse({ ask: 'name-key' }), recordingRng([1]).rng, 'uk');
    expect(g.prompt).toBe('Which key has this [[key-signature|key signature]]?');
  });

  it('name-key: C major is asked, and no more often than each other Grade 1 key', () => {
    const counts: Record<string, number> = { C: 0, G: 0, D: 0, F: 0 };
    for (let seed = 1; seed <= 800; seed++) {
      const out = keyFacts.generate(parse({ ask: 'name-key' }), createRng(seed), 'uk');
      const passage = (out.payload as { exhibit: { passage: { key: { tonic: { letter: string } } } } }).exhibit.passage;
      counts[passage.key.tonic.letter]!++;
    }
    expect(counts.C).toBeGreaterThan(100);
    const others = [counts.G!, counts.D!, counts.F!];
    expect(counts.C!).toBeLessThanOrEqual(Math.min(...others) * 1.4);
  });

  it('accidentals: the options are the signatures', () => {
    const { rng } = recordingRng([3]);
    const out = keyFacts.generate(parse({ ask: 'accidentals' }), rng, 'uk');
    expect(out.prompt).toBe('Which notes are sharp or flat in F major?');
    expect(options(out).map((o) => o.face.text)).toEqual(['B♭', 'No sharps or flats', 'F♯', 'F♯ and C♯']);
    expect(options(out)[1]!.reason).toBe('That is the signature of C major: no sharps or flats. F major has one flat, B♭.');
  });

  it('from-triad: the exhibit chord is the tonic triad and the reasons list the other triads', () => {
    const { rng } = recordingRng([2]);
    const out = keyFacts.generate(parse({ ask: 'from-triad', options: 3 }), rng, 'uk');
    const payload = out.payload as { exhibit: { passage: { key: { tonic: { letter: string } }; bars: { events: { pitches: { letter: string; accidental: number }[] }[] }[] } } };
    expect(payload.exhibit.passage.key.tonic.letter).toBe('C');
    expect(payload.exhibit.passage.bars[0]!.events[0]!.pitches.map((p) => `${p.letter}${p.accidental}`)).toEqual(['D0', 'F1', 'A0']);
    expect(options(out)[1]!.reason).toBe('The tonic [[triad|triad]] of C major is C, E and G. These notes are D, F♯ and A, so the key is D major.');
  });

  it('degree-note: pick key, pick degree, final shuffle; F sharp loses its sign as a wrong option', () => {
    const { rng, calls } = recordingRng([1, 5]);
    const out = keyFacts.generate(parse({ ask: 'degree-note', options: 4 }), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'shuffle']);
    // G major, degree 7 is F sharp.
    expect(out.prompt).toBe('In G major, which note is note 7 of the scale?');
    expect(options(out).map((o) => o.face.text)).toEqual(['F♯', 'E', 'D', 'F']);
    expect(options(out)[1]!.reason).toBe('E is note 6 of G major, not note 7.');
    expect(options(out)[3]!.reason).toBe('F is not in G major: the key signature makes it F♯.');
  });

  it('note-degree: ordinals, and the reason names the note on the wrong degree', () => {
    const { rng } = recordingRng([2, 2]);
    const out = keyFacts.generate(parse({ ask: 'note-degree' }), rng, 'uk');
    // D major, n = 4: G.
    expect(out.prompt).toBe('In D major, which number is the note G?');
    expect(options(out).map((o) => o.face.text)).toEqual(['4th', '3rd', '5th']);
    expect(options(out)[1]!.reason).toBe('G is note 4 of D major. Note 3 is F♯.');
  });
});
