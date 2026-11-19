import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const B4 = { letter: 'B', accidental: 0, octave: 4 };
const note = (value: string) => ({ kind: 'note', pitches: [B4], duration: { value, dots: 0 } });
const rest = (value: string) => ({ kind: 'rest', duration: { value, dots: 0 } });
const quavers = (n: number) => Array.from({ length: n }, () => note('quaver'));
const passage = (bars: object[], time = { beats: 4, beatUnit: 4 }) => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time,
  bars,
});
const wrong = { events: quavers(8), beams: [[0, 1, 2, 3, 4, 5, 6, 7]] };
const normal = { events: [note('minim'), note('minim')] };
const spec = { passage: passage([normal, wrong]), barIndex: 1 };
const messages = (input: unknown) => {
  const result = payloadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('fix-beaming payloadSchema', () => {
  it('accepts a wrongly beamed bar among normal ones', () => {
    expect(payloadSchema.safeParse(spec).success).toBe(true);
    expect(payloadSchema.safeParse({ passage: passage([wrong]), barIndex: 0 }).success).toBe(true);
  });

  it('accepts no beams at all as the wrong beaming', () => {
    expect(payloadSchema.safeParse({ passage: passage([{ events: quavers(8), beams: [] }]), barIndex: 0 }).success).toBe(true);
  });

  it('accepts 6/8 and a bar where the standard beams in beats', () => {
    expect(payloadSchema.safeParse({ passage: passage([{ events: quavers(6), beams: [[0, 1], [2, 3], [4, 5]] }], { beats: 6, beatUnit: 8 }), barIndex: 0 }).success).toBe(true);
    const mixed = { events: [note('crotchet'), ...quavers(4), note('crotchet')], beams: [[1, 2, 3, 4]] };
    expect(payloadSchema.safeParse({ passage: passage([mixed]), barIndex: 0 }).success).toBe(true);
  });

  it('rejects a barIndex that is not a bar', () => {
    expect(messages({ ...spec, barIndex: 2 }).join()).toMatch(/barIndex/);
  });

  it('rejects a bar without written beams', () => {
    expect(messages({ passage: passage([normal, { events: quavers(8) }]), barIndex: 1 }).join()).toMatch(/must have written `beams`/);
  });

  it('rejects beams that are the standard beaming', () => {
    const standard = { events: quavers(8), beams: [[0, 1, 2, 3], [4, 5, 6, 7]] };
    expect(messages({ passage: passage([standard]), barIndex: 0 }).join()).toMatch(/nothing to fix/);
    // Group order and a single-note group make no difference to what is written.
    expect(messages({ passage: passage([{ events: quavers(8), beams: [[4, 5, 6, 7], [0, 1, 2, 3]] }]), barIndex: 0 }).join()).toMatch(/nothing to fix/);
  });

  it('rejects a bar that is not full', () => {
    expect(messages({ passage: passage([{ events: quavers(6), beams: [] }]), barIndex: 0 }).join()).toMatch(/Bar 1 is short/);
  });

  it('rejects a bar with fewer than four beamable notes', () => {
    const few = { events: [note('minim'), note('crotchet'), note('quaver'), note('quaver')], beams: [] };
    expect(messages({ passage: passage([few]), barIndex: 0 }).join()).toMatch(/at least four/);
    const rests = { events: [rest('quaver'), note('quaver'), note('quaver'), note('quaver'), note('crotchet'), note('minim')], beams: [] };
    expect(messages({ passage: passage([rests]), barIndex: 0 }).join()).toMatch(/at least four/);
  });

  it('rejects written beams on any other bar', () => {
    const other = { events: quavers(8), beams: [[0, 1, 2, 3, 4, 5, 6, 7]] };
    expect(messages({ passage: passage([other, wrong]), barIndex: 1 }).join()).toMatch(/Bar 1: only the bar at `barIndex`/);
  });

  it('rejects beam groups that break the written-beam rules', () => {
    expect(messages({ passage: passage([{ events: quavers(8), beams: [[0, 2]] }]), barIndex: 0 }).join()).toMatch(/consecutive/);
    expect(messages({ passage: passage([{ events: [note('crotchet'), ...quavers(6), note('crotchet')].slice(0, 7).concat([note('quaver')]), beams: [[0, 1]] }]), barIndex: 0 }).join()).toMatch(/not a note of quaver/);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ ...spec, extra: 1 }).success).toBe(false);
  });
});
