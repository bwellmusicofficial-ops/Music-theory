import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import { recordingRng, runBattery } from '../shared/test-kit';
import { accidentalLasts, paramsSchema } from './index';

const P = pitch.parsePitch;
const parse = (input: object) => paramsSchema.parse(input);

runBattery({
  generator: accidentalLasts as never,
  sets: [
    { name: 'defaults', params: {} },
    { name: 'same bar, treble', params: { across: 'same-bar' } },
    { name: 'next bar, bass, two options', params: { clef: 'bass', across: 'next-bar', options: 2 } },
    { name: 'custom range', params: { low: P('C4'), high: P('G4'), across: 'either' } },
  ],
});

describe('accidental-lasts spec', () => {
  it('rejects bad params', () => {
    expect(paramsSchema.safeParse({ low: P('E4') }).success).toBe(false);
    expect(paramsSchema.safeParse({ low: P('F#4'), high: P('F5') }).success).toBe(false);
    expect(paramsSchema.safeParse({ low: P('A3'), high: P('F5') }).success).toBe(false);
  });

  it('same-bar: pick position, pick sign, two filler picks (pick across for either)', () => {
    const fixed = recordingRng([1, 0]);
    accidentalLasts.generate(parse({ across: 'same-bar' }), fixed.rng, 'uk');
    expect(fixed.calls).toEqual(['pick', 'pick', 'pick', 'pick', 'shuffle']);
    const either = recordingRng([1, 0, 0]);
    accidentalLasts.generate(parse({}), either.rng, 'uk');
    expect(either.calls).toEqual(['pick', 'pick', 'pick', 'pick', 'pick', 'shuffle']);
  });

  it('next-bar draws six fillers', () => {
    const { rng, calls } = recordingRng([1, 0, 1]);
    accidentalLasts.generate(parse({}), rng, 'uk');
    expect(calls).toEqual(['pick', 'pick', 'pick', ...Array(6).fill('pick'), 'shuffle']);
  });

  it('example: F sharp carried to the third note of the bar', () => {
    // Treble E4..F5: index 1 is F4. Signs for F are [sharp only]; the filler offsets pick the first allowed.
    const { rng } = recordingRng([1, 0, 0, 0]);
    const out = accidentalLasts.generate(parse({ across: 'same-bar' }), rng, 'uk');
    expect(out.prompt).toBe('Name the third note.');
    const payload = out.payload as { exhibit: { passage: { bars: { events: { pitches: { letter: string; accidental: number }[]; showAccidental?: boolean }[] }[] } }; options: { face: { text: string }; reason?: string }[] };
    const events = payload.exhibit.passage.bars[0]!.events;
    expect(events[0]!.pitches[0]).toMatchObject({ letter: 'F', accidental: 1 });
    expect(events[2]!.pitches[0]).toMatchObject({ letter: 'F', accidental: 1 });
    expect(events[2]!.showAccidental).toBe(false);
    expect(payload.options.map((o) => o.face.text)).toEqual(['F♯', 'F natural']);
    expect(payload.options[1]!.reason).toBe(
      'The sharp earlier in the [[bar|bar]] lasts to the [[bar-line|bar line]], so this F is still F♯, even with no sign.',
    );
  });

  it('next-bar: the right answer is the plain letter', () => {
    const { rng } = recordingRng([1, 0, 1]);
    const out = accidentalLasts.generate(parse({}), rng, 'us');
    expect(out.prompt).toBe('Name the first note of [[bar|measure]] 2.');
    const payload = out.payload as { options: { face: { text: string }; reason?: string }[]; correct: string };
    expect(payload.options[0]!.face.text).toBe('F natural');
    expect(payload.options[1]!.reason).toBe(
      'An accidental lasts only to the end of its [[bar|measure]]. The F in [[bar|measure]] 2 has no sign, so it is plain F.',
    );
  });

  it('flats are never offered on E, F... letters that would give awkward notes', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const out = accidentalLasts.generate(parse({}), createRng(seed), 'uk');
      const texts = (out.payload as { options: { face: { text: string } }[] }).options.map((o) => o.face.text);
      expect(texts.join(' ')).not.toMatch(/E♯|B♯|C♭|F♭/);
    }
  });
});
