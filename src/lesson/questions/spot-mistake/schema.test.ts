import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const B4 = { letter: 'B', accidental: 0, octave: 4 };
const note = (value: string, dots = 0) => ({ kind: 'note', pitches: [B4], duration: { value, dots } });
const bar = (...events: object[]) => ({ events });
const passage = (...bars: object[]) => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars,
});
const full = bar(note('minim'), note('minim'));
const long = bar(note('minim'), note('crotchet'), note('minim'));
const short = bar(note('minim'), note('crotchet'));

/** The spec example (docs/question-payloads.md 2.9). */
const specExample = {
  passage: passage(full, long),
  select: 'bar',
  mistake: { bar: 1 },
  explanation:
    '[[bar|Bar]] 2 has 5 beats: a [[minim|minim]] (2), a [[crotchet|crotchet]] (1) and another [[minim|minim]] (2). That is one beat too many.',
};
const eventExample = {
  passage: passage(full, bar(note('minim'), note('crotchet'), note('crotchet'))),
  select: 'event',
  mistake: { bar: 1, event: 2 },
  explanation: 'The third note in [[bar|bar]] 2 is the wrong length.',
};

const change = (base: object, over: object) => ({ ...base, ...over });
const messages = (input: unknown) => {
  const result = payloadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('spot-mistake payloadSchema', () => {
  it('accepts the spec example', () => {
    expect(payloadSchema.safeParse(specExample).success).toBe(true);
  });

  it('accepts an event question', () => {
    expect(payloadSchema.safeParse(eventExample).success).toBe(true);
  });

  it('accepts a bar question where the mistake bar is short, or full', () => {
    expect(payloadSchema.safeParse(change(specExample, { passage: passage(full, short) })).success).toBe(true);
    expect(payloadSchema.safeParse(change(specExample, { passage: passage(full, full) })).success).toBe(true);
  });

  it('accepts a reference clip', () => {
    const reference = { bpm: 80, passage: passage(full, full) };
    expect(payloadSchema.safeParse(change(eventExample, { reference })).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ ...specExample, extra: 1 }).success).toBe(false);
    expect(payloadSchema.safeParse(change(specExample, { mistake: { bar: 1, nope: 1 } })).success).toBe(false);
  });

  it('needs at least two bars for select "bar"', () => {
    expect(messages(change(specExample, { passage: passage(long), mistake: { bar: 0 } }))).toEqual([
      'passage.bars: With `select: "bar"` the passage needs at least two bars',
    ]);
  });

  it('needs at least three notes and rests for select "event"', () => {
    expect(
      messages(change(eventExample, { passage: passage(bar(note('minim'), note('minim'))), mistake: { bar: 0, event: 1 } })),
    ).toEqual(['passage.bars: With `select: "event"` the passage needs at least three notes and rests']);
  });

  it('requires mistake.event for "event" and forbids it for "bar"', () => {
    expect(messages(change(eventExample, { mistake: { bar: 1 } }))).toEqual([
      'mistake.event: `mistake.event` is required when `select` is "event"',
    ]);
    expect(messages(change(specExample, { mistake: { bar: 1, event: 0 } }))).toEqual([
      'mistake.event: `mistake.event` is not allowed when `select` is "bar"',
    ]);
  });

  it('needs mistake to point at an existing bar and event', () => {
    expect(messages(change(specExample, { mistake: { bar: 2 } }))).toContain(
      'mistake.bar: `mistake.bar` must point at a bar of the passage',
    );
    expect(messages(change(eventExample, { mistake: { bar: 1, event: 3 } }))).toContain(
      'mistake.event: `mistake.event` must point at a note or rest of that bar',
    );
    expect(payloadSchema.safeParse(change(specExample, { mistake: { bar: -1 } })).success).toBe(false);
  });

  it('needs every bar full, except the mistake bar for select "bar"', () => {
    expect(messages(change(specExample, { passage: passage(short, long) }))).toEqual([
      'passage.bars.0: Bar 1 is short: every bar must be exactly full',
    ]);
    expect(messages(change(specExample, { passage: passage(full, long), mistake: { bar: 0 } }))).toEqual([
      'passage.bars.1: Bar 2 is long: every bar must be exactly full',
    ]);
  });

  it('needs every bar full for select "event", including the mistake bar', () => {
    const input = change(eventExample, { passage: passage(full, bar(note('minim'), note('crotchet'), note('minim'))) });
    expect(messages(input)).toEqual(['passage.bars.1: Bar 2 is long: every bar must be exactly full']);
  });

  it('limits the explanation to 40 words', () => {
    const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
    expect(payloadSchema.safeParse(change(specExample, { explanation: words(40) })).success).toBe(true);
    expect(messages(change(specExample, { explanation: words(41) }))).toEqual([
      'explanation: The explanation is limited to 40 words',
    ]);
    expect(payloadSchema.safeParse(change(specExample, { explanation: '' })).success).toBe(false);
  });

  it('checks the reference clip: bpm 40 to 160 and a valid passage', () => {
    const clip = (over: object) => ({ bpm: 80, passage: passage(full, full), ...over });
    const ok = (reference: object) => payloadSchema.safeParse(change(eventExample, { reference })).success;
    expect(ok(clip({ bpm: 40 }))).toBe(true);
    expect(ok(clip({ bpm: 160 }))).toBe(true);
    expect(ok(clip({ bpm: 39 }))).toBe(false);
    expect(ok(clip({ bpm: 161 }))).toBe(false);
    expect(ok(clip({ bpm: 80.5 }))).toBe(false);
    // The clip is a correct version, so every bar must be full.
    expect(ok(clip({ passage: passage(full, short) }))).toBe(false);
  });

  it('reports a broken passage without throwing', () => {
    expect(payloadSchema.safeParse(change(specExample, { passage: null })).success).toBe(false);
    expect(payloadSchema.safeParse(change(specExample, { passage: passage(bar(), full) })).success).toBe(false);
  });
});
