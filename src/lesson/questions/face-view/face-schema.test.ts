import { describe, expect, it } from 'vitest';
import type { Bar, ScoreEvent } from '@/engine/types';
import { faceSchema, glyphSchema, passageSchema } from './face-schema';

const pitch = (letter: 'B' | 'G' = 'B') => ({ letter, accidental: 0 as const, octave: 4 });
const note = (value: 'crotchet' | 'minim' | 'quaver' = 'crotchet', extra: object = {}): ScoreEvent => ({
  kind: 'note',
  pitches: [pitch()],
  duration: { value, dots: 0 },
  ...extra,
});
const rest = (value: 'crotchet' | 'minim' = 'crotchet'): ScoreEvent => ({
  kind: 'rest',
  duration: { value, dots: 0 },
});
const passage = (bars: Bar[], time = { beats: 4, beatUnit: 4 }) => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time,
  bars,
});
const fourCrotchets: Bar = { events: [note(), note(), note(), note()] };

describe('faceSchema: text', () => {
  it('accepts text of 1 to 60 words', () => {
    expect(faceSchema.safeParse({ kind: 'text', text: 'Crotchet' }).success).toBe(true);
  });

  it('rejects empty text and text over 60 words', () => {
    expect(faceSchema.safeParse({ kind: 'text', text: '' }).success).toBe(false);
    const long = Array.from({ length: 61 }, () => 'word').join(' ');
    expect(faceSchema.safeParse({ kind: 'text', text: long }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(faceSchema.safeParse({ kind: 'text', text: 'A', extra: true }).success).toBe(false);
  });
});

describe('glyphSchema', () => {
  it('accepts a note or rest glyph', () => {
    expect(glyphSchema.safeParse({ kind: 'note', duration: { value: 'minim', dots: 1 } }).success).toBe(true);
    expect(glyphSchema.safeParse({ kind: 'rest', duration: { value: 'crotchet', dots: 0 } }).success).toBe(true);
  });

  it('rejects a tuplet on a glyph', () => {
    const glyph = { kind: 'note', duration: { value: 'crotchet', dots: 0, tuplet: { actual: 3, normal: 2 } } };
    expect(glyphSchema.safeParse(glyph).success).toBe(false);
  });

  it('rejects more than two dots and unknown note values', () => {
    expect(glyphSchema.safeParse({ kind: 'note', duration: { value: 'minim', dots: 3 } }).success).toBe(false);
    expect(glyphSchema.safeParse({ kind: 'note', duration: { value: 'hemiquaver', dots: 0 } }).success).toBe(false);
  });
});

describe('passageSchema', () => {
  it('accepts a bar that is exactly full', () => {
    expect(passageSchema.safeParse(passage([fourCrotchets])).success).toBe(true);
  });

  it('accepts a passage whose bars mix durations', () => {
    const bar: Bar = { events: [{ kind: 'note', pitches: [pitch()], duration: { value: 'minim', dots: 0 } }, note(), note()] };
    expect(passageSchema.safeParse(passage([bar])).success).toBe(true);
  });

  it('rejects a short bar and a long bar', () => {
    expect(passageSchema.safeParse(passage([{ events: [note(), note()] }])).success).toBe(false);
    expect(passageSchema.safeParse(passage([{ events: [note(), note(), note(), note(), note()] }])).success).toBe(false);
  });

  it('rejects a passage with no bars and a bar with no events', () => {
    expect(passageSchema.safeParse(passage([])).success).toBe(false);
    expect(passageSchema.safeParse(passage([{ events: [] }])).success).toBe(false);
  });

  it('accepts a tied note followed by a note with the same pitches', () => {
    const bar: Bar = { events: [note('minim', { tieToNext: true }), note('minim')] };
    expect(passageSchema.safeParse(passage([bar])).success).toBe(true);
  });

  it('rejects a tie to a different pitch, to a rest or with nothing after it', () => {
    const different: Bar = {
      events: [{ kind: 'note', pitches: [pitch()], duration: { value: 'minim', dots: 0 }, tieToNext: true }, { kind: 'note', pitches: [pitch('G')], duration: { value: 'minim', dots: 0 } }],
    };
    const toRest: Bar = { events: [note('minim', { tieToNext: true }), rest('minim')] };
    const atEnd: Bar = { events: [rest('minim'), note('minim', { tieToNext: true })] };
    expect(passageSchema.safeParse(passage([different])).success).toBe(false);
    expect(passageSchema.safeParse(passage([toRest])).success).toBe(false);
    expect(passageSchema.safeParse(passage([atEnd])).success).toBe(false);
  });

  it('accepts consecutive tuplet notes with one ratio and rejects a mixed ratio', () => {
    const triplet = { actual: 3, normal: 2 };
    const duplet = { actual: 2, normal: 3 };
    const tripletNote = (tuplet: { actual: number; normal: number }): ScoreEvent => ({
      kind: 'note',
      pitches: [pitch()],
      duration: { value: 'quaver', dots: 0, tuplet },
    });
    // Three triplet quavers fill one beat; three crotchets fill the other three.
    const three = { events: [tripletNote(triplet), tripletNote(triplet), tripletNote(triplet), note(), note(), note()] };
    const mixed = { events: [tripletNote(triplet), tripletNote(duplet), tripletNote(triplet), note(), note(), note()] };
    expect(passageSchema.safeParse(passage([three])).success).toBe(true);
    const result = passageSchema.safeParse(passage([mixed]));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'Consecutive tuplet notes in one bar must share one tuplet ratio',
    );
  });

  it('rejects unknown keys and a bad clef', () => {
    expect(passageSchema.safeParse({ ...passage([fourCrotchets]), clef: 'soprano' }).success).toBe(false);
    expect(passageSchema.safeParse({ ...passage([fourCrotchets]), extra: 1 }).success).toBe(false);
  });
});

describe('faceSchema: passage', () => {
  it('validates the passage through the face schema', () => {
    expect(faceSchema.safeParse({ kind: 'passage', passage: passage([fourCrotchets]) }).success).toBe(true);
    expect(faceSchema.safeParse({ kind: 'passage', passage: passage([{ events: [note()] }]) }).success).toBe(false);
  });
});

describe('faceSchema: passage display options', () => {
  const p = passage([fourCrotchets]);
  it('accepts hideClef and hideTime, and keeps today\'s faces valid without them', () => {
    expect(faceSchema.safeParse({ kind: 'passage', passage: p }).success).toBe(true);
    const both = faceSchema.safeParse({ kind: 'passage', passage: p, hideClef: true, hideTime: true });
    expect(both.success).toBe(true);
    expect(both.success && both.data).toMatchObject({ hideClef: true, hideTime: true });
  });
  it('rejects non-boolean values and unknown keys', () => {
    expect(faceSchema.safeParse({ kind: 'passage', passage: p, hideClef: 'yes' }).success).toBe(false);
    expect(faceSchema.safeParse({ kind: 'passage', passage: p, hideKey: true }).success).toBe(false);
  });
});
