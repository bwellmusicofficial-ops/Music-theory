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

describe('passageSchema: expression (docs/expression.md)', () => {
  const messages = (value: unknown) => {
    const result = passageSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const bars = (): Bar[] => [
    { events: [note(), note(), note(), note()] },
    { events: [note(), note(), note(), note()] },
  ];
  const ref = (bar: number, event: number) => ({ bar, event });

  it('accepts every new field', () => {
    const full = {
      ...passage([
        { events: [note('crotchet', { articulations: ['staccato', 'accent'], fermata: false }), note(), note(), note()], repeatStart: true },
        { events: [note(), note(), note(), note('crotchet', { fermata: true })], endBarline: 'repeat-end' },
      ]),
      expression: {
        dynamics: [{ at: ref(0, 0), level: 'p' }, { at: ref(1, 0), level: 'f' }],
        hairpins: [{ kind: 'cresc', from: ref(0, 0), to: ref(0, 3) }],
        slurs: [{ from: ref(1, 0), to: ref(1, 2) }],
        tempo: { text: 'Andante', bpm: 80, beat: { value: 'crotchet', dots: 0 } },
        tempoChanges: [{ kind: 'rit', from: ref(1, 2), to: ref(1, 3), toBpm: 60 }],
        words: [{ at: ref(0, 0), text: 'dolce', place: 'below', lang: 'it' }],
      },
    };
    expect(messages(full)).toEqual([]);
  });

  it('accepts a rest with a fermata, a bar marker and the end barlines', () => {
    const p = passage([
      { events: [note(), note(), note(), note()], marker: 'segno' },
      { events: [note(), note(), note(), { kind: 'rest', duration: { value: 'crotchet', dots: 0 }, fermata: true }], endBarline: 'double', marker: 'fine' },
      { events: [note(), note(), note(), note()], endBarline: 'final', marker: 'ds-al-fine' },
    ]);
    expect(messages(p)).toEqual([]);
  });

  it('rejects unknown articulations, bar markers, levels and keys', () => {
    expect(messages(passage([{ events: [note('crotchet', { articulations: ['marcato'] }), note(), note(), note()] }]))).not.toEqual([]);
    expect(messages(passage([{ ...fourCrotchets, marker: 'coda' } as unknown as Bar]))).not.toEqual([]);
    expect(messages({ ...passage(bars()), expression: { dynamics: [{ at: ref(0, 0), level: 'fff' }] } })).not.toEqual([]);
    expect(messages({ ...passage(bars()), expression: { trills: [] } })).not.toEqual([]);
  });

  it('reports a broken marking with the bar and event in plain English', () => {
    const p = { ...passage(bars()), expression: { slurs: [{ from: ref(0, 0), to: ref(0, 9) }] } };
    expect(messages(p)).toEqual(['Bar 1, event 10: this slur points at an event that does not exist (bar 1 has 4)']);
  });

  it('runs the repeat rules too', () => {
    const p = passage([{ ...fourCrotchets, marker: 'ds' }]);
    expect(messages(p)).toEqual(['Bar 1: D.S. needs a segno marked in the passage']);
  });

  it('rejects an articulation on a tied continuation', () => {
    const p = passage([{ events: [note('crotchet', { tieToNext: true }), note('crotchet', { articulations: ['tenuto'] }), note(), note()] }]);
    expect(messages(p)).toEqual([
      'Bar 1, note 2: this note continues a tie, so it cannot have its own articulation or pause; put it on the first note of the tie',
    ]);
  });
});

describe('passageSchema: written beams (Bar.beams)', () => {
  const q = (n = 4) => Array.from({ length: n }, () => note('quaver'));
  const withBeams = (beams: number[][], events: ScoreEvent[] = [...q(4), note('minim')]) => passage([{ events, beams }]);
  const issues = (p: unknown) => {
    const r = passageSchema.safeParse(p);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('accepts bars with no beams field (existing lessons are unchanged)', () => {
    expect(passageSchema.safeParse(passage([{ events: [...q(4), note('minim')] }])).success).toBe(true);
  });
  it('accepts [] (no beams) and groups of consecutive quavers', () => {
    expect(passageSchema.safeParse(withBeams([])).success).toBe(true);
    expect(passageSchema.safeParse(withBeams([[0, 1, 2, 3]])).success).toBe(true);
    expect(passageSchema.safeParse(withBeams([[0, 1], [2, 3]])).success).toBe(true);
    expect(passageSchema.safeParse(withBeams([[1, 2]])).success).toBe(true);
  });
  it('accepts semiquavers and a mixed quaver and semiquaver group', () => {
    const semi = (): ScoreEvent => ({ kind: 'note', pitches: [pitch()], duration: { value: 'semiquaver', dots: 0 } });
    // 1/8 + 1/16 + 1/16 + 1/4 + 1/2 = 1
    const events: ScoreEvent[] = [note('quaver'), semi(), semi(), note('crotchet'), note('minim')];
    expect(passageSchema.safeParse(withBeams([[0, 1, 2]], events)).success).toBe(true);
  });
  it('rejects a group of fewer than two', () => {
    expect(issues(withBeams([[0]])).join()).toMatch(/at least two/);
    expect(issues(withBeams([[]])).join()).toMatch(/at least two/);
  });
  it('rejects groups that are not consecutive and ascending', () => {
    expect(issues(withBeams([[0, 2]])).join()).toMatch(/consecutive ascending/);
    expect(issues(withBeams([[1, 0]])).join()).toMatch(/consecutive ascending/);
    expect(issues(withBeams([[0, 0]])).join()).toMatch(/consecutive ascending|two beam groups/);
  });
  it('rejects an index in two groups', () => {
    expect(issues(withBeams([[0, 1], [1, 2]])).join()).toMatch(/in two beam groups/);
  });
  it('rejects an index that is not an event, a rest, or a note longer than a quaver', () => {
    expect(issues(withBeams([[3, 4]])).join()).toMatch(/not a note of quaver or shorter/); // 4 is the minim
    expect(issues(withBeams([[3, 9]])).join()).toMatch(/does not exist|consecutive/);
    const withRest: ScoreEvent[] = [note('quaver'), { kind: 'rest', duration: { value: 'quaver', dots: 0 } }, note('quaver'), note('quaver'), note('minim')];
    expect(issues(withBeams([[0, 1]], withRest)).join()).toMatch(/not a note of quaver or shorter/);
    expect(issues(withBeams([[0, 1, 2, 3, 4]])).join()).toMatch(/not a note of quaver or shorter/);
  });
  it('rejects negative and fractional indexes', () => {
    expect(passageSchema.safeParse(withBeams([[-1, 0]])).success).toBe(false);
    expect(passageSchema.safeParse(withBeams([[0.5, 1.5]])).success).toBe(false);
  });
});
