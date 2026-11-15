import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import { recordingRng, runBattery } from '../shared/test-kit';
import { SHARED_NOTES, paramsSchema, sameNoteOtherClef } from './index';

const parse = (input: object) => paramsSchema.parse(input);

runBattery({
  generator: sameNoteOtherClef as never,
  minDistinct: 5,
  sets: [
    { name: 'defaults', params: {} },
    { name: 'from treble, four options', params: { from: 'treble', options: 4 } },
    { name: 'from bass, two options', params: { from: 'bass', options: 2 } },
  ],
});

describe('same-note-other-clef spec', () => {
  it('uses only notes that fit both staves: A3 to E4', () => {
    expect(SHARED_NOTES.map(pitch.formatPitch)).toEqual(['A3', 'B3', 'C4', 'D4', 'E4']);
  });

  it('either: pick clef, pick note, final shuffle; otherwise pick note and shuffle', () => {
    const either = recordingRng([1, 2]);
    const out = sameNoteOtherClef.generate(parse({}), either.rng, 'uk');
    expect(either.calls).toEqual(['pick', 'pick', 'shuffle']);
    expect(out.prompt).toBe('This note is in bass clef. Which [[stave|stave]] shows the same note in treble clef?');
    const fixed = recordingRng([0]);
    sameNoteOtherClef.generate(parse({ from: 'treble' }), fixed.rng, 'uk');
    expect(fixed.calls).toEqual(['pick', 'shuffle']);
  });

  it('the first wrong option is the same stave position: C4 in treble is on a ledger line, in bass the same place is E2... never the right note', () => {
    // Treble, C4 (index 2 of A3..E4): same place in bass is position -2 = E2.
    const { rng } = recordingRng([2]);
    const out = sameNoteOtherClef.generate(parse({ from: 'treble', options: 3 }), rng, 'uk');
    const payload = out.payload as { options: { reason?: string; face: { passage: { bars: { events: { pitches: { letter: string; octave: number }[] }[] }[] } } }[] };
    const wrong = payload.options.filter((o) => o.reason);
    expect(wrong[0]!.reason).toBe(
      'That note is on the first ledger line below the [[stave|stave]] of the bass [[stave|stave]], the same place as the shown note, but the clef changes its name. It is E, not C.',
    );
    const pitches = payload.options.map((o) => o.face.passage.bars[0]!.events[0]!.pitches[0]!);
    expect(pitches).toContainEqual({ letter: 'C', accidental: 0, octave: 4 });
    expect(pitches).toContainEqual({ letter: 'E', accidental: 0, octave: 2 });
  });

  it('the shown note is in the exhibit, in the from clef', () => {
    const out = sameNoteOtherClef.generate(parse({ from: 'bass' }), createRng(4), 'uk');
    const exhibit = (out.payload as { exhibit: { passage: { clef: string } } }).exhibit;
    expect(exhibit.passage.clef).toBe('bass');
  });
});
