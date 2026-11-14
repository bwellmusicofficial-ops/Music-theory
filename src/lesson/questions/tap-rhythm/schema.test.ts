import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';
import { bar, note, rest } from './test-helpers';

const B4 = { letter: 'B', accidental: 0, octave: 4 };
const crotchet = { kind: 'note', pitches: [B4], duration: { value: 'crotchet', dots: 0 } };
const minim = { kind: 'note', pitches: [B4], duration: { value: 'minim', dots: 0 } };
const specExample = {
  time: { beats: 4, beatUnit: 4 },
  bars: [{ events: [crotchet, crotchet, minim] }],
  bpm: 80,
  countInBars: 1,
  showNotation: true,
  listenFirst: false,
};
const base = { ...specExample, bars: [bar(note('crotchet'), note('crotchet'), note('minim'))] };
const issues = (value: unknown) => {
  const result = payloadSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('tap-rhythm payloadSchema', () => {
  it('accepts the spec example and applies the defaults', () => {
    const without: Record<string, unknown> = { ...specExample };
    delete without.countInBars;
    const parsed = payloadSchema.parse(without);
    expect(parsed.countInBars).toBe(1);
    expect(parsed.toleranceMs).toBe(150);
    expect(payloadSchema.safeParse(specExample).success).toBe(true);
  });

  it('accepts two bars, two count-in bars, a custom tolerance, rests and ties', () => {
    expect(
      issues({
        ...base,
        countInBars: 2,
        toleranceMs: 60,
        bars: [bar(note('crotchet'), rest('crotchet'), note('minim', 0, true)), bar(note('minim'), note('minim'))],
      }),
    ).toEqual([]);
    expect(issues({ ...base, toleranceMs: 250 })).toEqual([]);
  });

  it('rejects unknown keys', () => {
    expect(issues({ ...base, extra: true }).length).toBeGreaterThan(0);
    expect(issues({ ...base, bars: [{ events: [crotchet], extra: 1 }] }).length).toBeGreaterThan(0);
  });

  it('rejects zero bars and more than four', () => {
    expect(issues({ ...base, bars: [] }).length).toBeGreaterThan(0);
    const full = bar(note('semibreve'));
    expect(issues({ ...base, bars: [full, full, full, full] })).toEqual([]);
    expect(issues({ ...base, bars: [full, full, full, full, full] }).length).toBeGreaterThan(0);
  });

  it('rejects a bar that is short or long', () => {
    expect(issues({ ...base, bars: [bar(note('crotchet'), note('crotchet'))] })).toContain(
      'bars.0: Bar 1 is short: every bar must be exactly full',
    );
    expect(issues({ ...base, bars: [bar(note('semibreve'), note('crotchet'))] })).toContain(
      'bars.0: Bar 1 is long: every bar must be exactly full',
    );
  });

  it('rejects a bar with no events', () => {
    expect(issues({ ...base, bars: [{ events: [] }] }).length).toBeGreaterThan(0);
  });

  it('rejects a rhythm with no note', () => {
    expect(issues({ ...base, bars: [bar(rest('semibreve'))] })).toContain('bars: The rhythm needs at least one note to tap');
  });

  it('rejects tuplets', () => {
    const triplet = (kind: 'note' | 'rest') => ({
      ...(kind === 'note' ? { kind, pitches: [B4] } : { kind }),
      duration: { value: 'quaver', dots: 0, tuplet: { actual: 3, normal: 2 } },
    });
    const events = [crotchet, crotchet, crotchet, triplet('note'), triplet('note'), triplet('note')];
    expect(issues({ ...base, bars: [{ events }] }).length).toBeGreaterThan(0);
  });

  it('rejects bpm outside 50 to 120 or not an integer', () => {
    expect(issues({ ...base, bpm: 49 }).length).toBeGreaterThan(0);
    expect(issues({ ...base, bpm: 121 }).length).toBeGreaterThan(0);
    expect(issues({ ...base, bpm: 80.5 }).length).toBeGreaterThan(0);
    expect(issues({ ...base, bpm: 50 })).toEqual([]);
    expect(issues({ ...base, bpm: 120 })).toEqual([]);
  });

  it('rejects toleranceMs outside 60 to 250', () => {
    expect(issues({ ...base, toleranceMs: 59 }).length).toBeGreaterThan(0);
    expect(issues({ ...base, toleranceMs: 251 }).length).toBeGreaterThan(0);
  });

  it('rejects countInBars other than 1 or 2', () => {
    expect(issues({ ...base, countInBars: 3 }).length).toBeGreaterThan(0);
    expect(issues({ ...base, countInBars: 0 }).length).toBeGreaterThan(0);
  });

  it('needs at least one of showNotation and listenFirst', () => {
    expect(issues({ ...base, showNotation: false, listenFirst: false })).toContain(
      'showNotation: At least one of `showNotation` and `listenFirst` must be true',
    );
    expect(issues({ ...base, showNotation: false, listenFirst: true })).toEqual([]);
    expect(issues({ ...base, showNotation: true, listenFirst: false })).toEqual([]);
  });

  it('requires both flags to be given', () => {
    const noShow: Record<string, unknown> = { ...base };
    delete noShow.showNotation;
    expect(issues(noShow).length).toBeGreaterThan(0);
    const noListen: Record<string, unknown> = { ...base };
    delete noListen.listenFirst;
    expect(issues(noListen).length).toBeGreaterThan(0);
  });

  it('checks ties and pitches (passage rules)', () => {
    expect(issues({ ...base, bars: [bar(note('minim', 0, true), note('minim'))] })).toEqual([]);
    expect(issues({ ...base, bars: [bar(note('minim'), note('minim', 0, true))] }).length).toBeGreaterThan(0);
    expect(issues({ ...base, bars: [bar(note('minim', 0, true), rest('minim'))] }).length).toBeGreaterThan(0);
    const noPitch = { kind: 'note', pitches: [], duration: { value: 'semibreve', dots: 0 } };
    expect(issues({ ...base, bars: [{ events: [noPitch] }] }).length).toBeGreaterThan(0);
  });

  it('rejects more than two dots and unknown time signatures', () => {
    const triple = { kind: 'note', pitches: [B4], duration: { value: 'minim', dots: 3 } };
    expect(issues({ ...base, bars: [{ events: [triple] }] }).length).toBeGreaterThan(0);
    expect(issues({ ...base, time: { beats: 4, beatUnit: 3 } }).length).toBeGreaterThan(0);
  });

  it('accepts other simple times', () => {
    expect(
      issues({ ...base, time: { beats: 3, beatUnit: 4 }, bars: [bar(note('minim', 1))] }),
    ).toEqual([]);
  });
});
