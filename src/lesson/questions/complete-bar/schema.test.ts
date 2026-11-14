import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const B4 = { letter: 'B', accidental: 0, octave: 4 };
const note = (value: string, dots = 0) => ({ kind: 'note', pitches: [B4], duration: { value, dots } });
const rest = (value: string, dots = 0) => ({ kind: 'rest', duration: { value, dots } });
const glyph = (kind: string, value: string, dots = 0) => ({ kind, duration: { value, dots } });
const bar = (...events: object[]) => ({ events });
const passage = (...bars: object[]) => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars,
});

/** The spec example (docs/question-payloads.md 2.8). */
const specExample = {
  passage: passage(bar(note('crotchet'), note('crotchet'))),
  barIndex: 0,
  palette: [glyph('note', 'crotchet'), glyph('note', 'minim')],
  fillPitch: B4,
  count: 1,
};

const change = (over: object) => ({ ...specExample, ...over });
const messages = (input: unknown) => {
  const result = payloadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('complete-bar payloadSchema', () => {
  it('accepts the spec example and applies the default for checkGrouping', () => {
    const result = payloadSchema.safeParse(specExample);
    expect(result.success).toBe(true);
    expect(result.success && result.data.checkGrouping).toBe(false);
  });

  it('keeps checkGrouping when given', () => {
    const result = payloadSchema.safeParse(change({ checkGrouping: true }));
    expect(result.success && result.data.checkGrouping).toBe(true);
  });

  it('accepts a short bar after full bars, with rests in the palette and no count', () => {
    const input = change({
      passage: passage(bar(note('semibreve')), bar(note('minim'))),
      barIndex: 1,
      palette: [glyph('note', 'crotchet'), glyph('rest', 'crotchet'), glyph('note', 'minim')],
      count: undefined,
    });
    expect(payloadSchema.safeParse(input).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ ...specExample, extra: true }).success).toBe(false);
  });

  it('rejects a barIndex that points at no bar', () => {
    expect(messages(change({ barIndex: 1 }))).toEqual(['barIndex: `barIndex` must point at a bar of the passage']);
    expect(payloadSchema.safeParse(change({ barIndex: -1 })).success).toBe(false);
    expect(payloadSchema.safeParse(change({ barIndex: 0.5 })).success).toBe(false);
  });

  it('rejects a bar at barIndex that is already full or too long', () => {
    expect(messages(change({ passage: passage(bar(note('semibreve'))) }))).toContain(
      'passage.bars.0: The bar at `barIndex` must be short, but it is complete',
    );
    expect(messages(change({ passage: passage(bar(note('semibreve'), note('crotchet'))) }))).toContain(
      'passage.bars.0: The bar at `barIndex` must be short, but it is long',
    );
  });

  it('rejects another bar that is not full', () => {
    expect(
      messages(change({ passage: passage(bar(note('crotchet'), note('crotchet')), bar(note('minim'))) })),
    ).toEqual(['passage.bars.1: Bar 2 is short: every bar must be exactly full']);
    expect(
      messages(change({ passage: passage(bar(note('semibreve'), note('crotchet')), bar(note('crotchet'))), barIndex: 1, count: undefined })),
    ).toEqual(['passage.bars.0: Bar 1 is long: every bar must be exactly full']);
  });

  it('needs 2 to 6 palette symbols', () => {
    expect(payloadSchema.safeParse(change({ palette: [glyph('note', 'crotchet')] })).success).toBe(false);
    const seven = ['semibreve', 'minim', 'crotchet', 'quaver', 'semiquaver', 'demisemiquaver', 'breve'].map((v) => glyph('note', v));
    expect(payloadSchema.safeParse(change({ palette: seven, count: undefined })).success).toBe(false);
    expect(payloadSchema.safeParse(change({ palette: seven.slice(0, 6), count: undefined })).success).toBe(true);
  });

  it('needs different palette symbols', () => {
    expect(messages(change({ palette: [glyph('note', 'minim'), glyph('note', 'minim')] }))).toEqual([
      'palette: The palette symbols must all be different',
    ]);
    // A note and a rest of one value are different symbols.
    expect(
      payloadSchema.safeParse(change({ palette: [glyph('note', 'minim'), glyph('rest', 'minim')] })).success,
    ).toBe(true);
  });

  it('rejects a tuplet in the palette', () => {
    const tuplet = { kind: 'note', duration: { value: 'quaver', dots: 0, tuplet: { actual: 3, normal: 2 } } };
    expect(payloadSchema.safeParse(change({ palette: [tuplet, glyph('note', 'minim')] })).success).toBe(false);
  });

  it('needs some palette sequence that fills the bar', () => {
    // Gap is 2 beats; only crotchets and breves... a breve is too long, crotchets fill it.
    expect(payloadSchema.safeParse(change({ palette: [glyph('note', 'breve'), glyph('note', 'crotchet')], count: undefined })).success).toBe(true);
    // Gap is 2 beats; semibreve and dotted minim cannot make it.
    expect(
      messages(change({ palette: [glyph('note', 'semibreve'), glyph('note', 'minim', 1)], count: undefined })),
    ).toEqual(['palette: No sequence of at most 12 palette symbols fills the bar exactly']);
  });

  it('needs a sequence of exactly `count` symbols when count is given', () => {
    // count 1: the minim does it.
    expect(payloadSchema.safeParse(change({ count: 1 })).success).toBe(true);
    // count 2: two crotchets do it.
    expect(payloadSchema.safeParse(change({ count: 2 })).success).toBe(true);
    // count 3: crotchets and minims cannot make 2 beats in three symbols.
    expect(messages(change({ count: 3 }))).toEqual(['palette: No sequence of exactly 3 palette symbols fills the bar exactly']);
  });

  it('limits count to 1 to 8', () => {
    expect(payloadSchema.safeParse(change({ count: 0 })).success).toBe(false);
    expect(payloadSchema.safeParse(change({ count: 9 })).success).toBe(false);
    const quavers = { passage: passage(bar(note('quaver'))), palette: [glyph('note', 'quaver'), glyph('note', 'minim')] };
    expect(payloadSchema.safeParse(change({ ...quavers, count: 8 })).success).toBe(false); // 3.5 beats of quavers needs 7
    expect(payloadSchema.safeParse(change({ ...quavers, count: 7 })).success).toBe(true);
  });

  it('rejects a gap that needs more than 12 symbols', () => {
    const input = change({
      passage: passage(bar(note('quaver'))),
      palette: [glyph('note', 'semiquaver'), glyph('note', 'demisemiquaver')],
      count: undefined,
    });
    expect(payloadSchema.safeParse(input).success).toBe(false);
  });

  it('reports a broken passage without throwing', () => {
    expect(payloadSchema.safeParse(change({ passage: { clef: 'treble' } })).success).toBe(false);
    expect(payloadSchema.safeParse(change({ passage: passage(bar()) })).success).toBe(false);
  });

  it('applies the tie rule of 1.3', () => {
    const tied = passage(bar({ ...note('crotchet'), tieToNext: true }, note('crotchet')));
    expect(payloadSchema.safeParse(change({ passage: tied })).success).toBe(true);
    const badTie = passage(bar({ ...note('crotchet'), tieToNext: true }, rest('crotchet')));
    expect(payloadSchema.safeParse(change({ passage: badTie })).success).toBe(false);
  });
});
