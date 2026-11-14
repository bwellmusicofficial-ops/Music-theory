import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';
import { passageOf, specExample } from './test-helpers';

const issues = (value: unknown) => {
  const result = payloadSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};
const clip = { bpm: 80, passage: passageOf('minim') };
const text = (id: string, t: string, reason?: string) => ({ id, face: { kind: 'text', text: t }, ...(reason ? { reason } : {}) });

describe('by-ear payloadSchema', () => {
  it('accepts the spec example', () => {
    const example = {
      clips: [
        {
          bpm: 80,
          passage: {
            clef: 'treble',
            key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
            time: { beats: 2, beatUnit: 4 },
            bars: [
              {
                events: [
                  { kind: 'note', pitches: [{ letter: 'G', accidental: 0, octave: 4 }], duration: { value: 'crotchet', dots: 0 } },
                  { kind: 'note', pitches: [{ letter: 'G', accidental: 0, octave: 4 }], duration: { value: 'crotchet', dots: 0 } },
                ],
              },
            ],
          },
        },
        {
          bpm: 80,
          passage: {
            clef: 'treble',
            key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
            time: { beats: 2, beatUnit: 4 },
            bars: [
              { events: [{ kind: 'note', pitches: [{ letter: 'G', accidental: 0, octave: 4 }], duration: { value: 'minim', dots: 0 } }] },
            ],
          },
        },
      ],
      options: [
        {
          id: 'a',
          face: { kind: 'text', text: 'Clip A' },
          reason: 'Clip A has two short notes of 1 beat each. The long 2-beat note is in clip B.',
        },
        { id: 'b', face: { kind: 'text', text: 'Clip B' } },
      ],
      correct: 'b',
    };
    expect(payloadSchema.safeParse(example).success).toBe(true);
    expect(issues(specExample)).toEqual([]);
  });

  it('accepts one clip, three clips and four options', () => {
    const opts = [text('a', 'Short', 'r'), text('b', 'Long'), text('c', 'Same', 'r'), text('d', 'Other', 'r')];
    expect(issues({ clips: [clip], options: opts, correct: 'b' })).toEqual([]);
    expect(issues({ clips: [clip, clip, clip], options: [text('a', 'Clip A', 'r'), text('b', 'Clip C'), text('c', 'Clip B', 'r')], correct: 'b' })).toEqual([]);
  });

  it('rejects unknown keys', () => {
    expect(issues({ ...specExample, extra: 1 }).length).toBeGreaterThan(0);
    expect(issues({ ...specExample, clips: [{ ...clip, extra: 1 }] }).length).toBeGreaterThan(0);
  });

  it('rejects zero clips and more than three', () => {
    expect(issues({ ...specExample, clips: [] }).length).toBeGreaterThan(0);
    expect(issues({ ...specExample, clips: [clip, clip, clip, clip] }).length).toBeGreaterThan(0);
  });

  it('rejects bpm outside 40 to 160 or not an integer', () => {
    for (const bpm of [39, 161, 80.5]) {
      expect(issues({ ...specExample, clips: [{ ...clip, bpm }, clip] }).length).toBeGreaterThan(0);
    }
    expect(issues({ ...specExample, clips: [{ ...clip, bpm: 40 }, clip] })).toEqual([]);
    expect(issues({ ...specExample, clips: [{ ...clip, bpm: 160 }, clip] })).toEqual([]);
  });

  it('rejects a clip passage that breaks the passage rules', () => {
    const short = { ...passageOf('crotchet'), time: { beats: 4, beatUnit: 4 } };
    expect(issues({ ...specExample, clips: [{ bpm: 80, passage: short }] }).length).toBeGreaterThan(0);
  });

  it('rejects fewer than two or more than four options', () => {
    expect(issues({ ...specExample, options: [text('b', 'Long')], correct: 'b' }).length).toBeGreaterThan(0);
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => text(id, `Option ${id}`, 'r'));
    expect(issues({ ...specExample, options: five, correct: 'a' }).length).toBeGreaterThan(0);
  });

  it('rejects duplicate ids and a correct id that is not an option', () => {
    expect(issues({ ...specExample, options: [text('a', 'One', 'r'), text('a', 'Two')], correct: 'a' })).toContain(
      'options: Option ids must be unique',
    );
    expect(issues({ ...specExample, correct: 'zzz' })).toContain('correct: `correct` must be the id of an option');
  });

  it('rejects ids that are not kebab-case', () => {
    expect(issues({ ...specExample, options: [text('A_1', 'One', 'r'), text('b', 'Two')] }).length).toBeGreaterThan(0);
  });

  it('needs a reason on every wrong option and none on the correct one', () => {
    expect(issues({ ...specExample, options: [text('a', 'Clip A'), text('b', 'Clip B')] })).toContain(
      'options.0.reason: Every wrong option needs a reason',
    );
    expect(issues({ ...specExample, options: [text('a', 'Clip A', 'r'), text('b', 'Clip B', 'extra')] })).toContain(
      'options.1.reason: The correct option must not have a reason',
    );
  });

  it('limits a reason to 60 words', () => {
    const long = Array.from({ length: 61 }, () => 'word').join(' ');
    expect(issues({ ...specExample, options: [text('a', 'Clip A', long), text('b', 'Clip B')] }).length).toBeGreaterThan(0);
  });

  it('needs every face to be the same kind', () => {
    const glyph = { id: 'b', face: { kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 0 } } } };
    expect(issues({ ...specExample, options: [text('a', 'Short', 'r'), glyph] })).toContain(
      'options: All options in one question must use the same kind of face',
    );
  });

  it('accepts passage faces (notation options) and rejects an invalid passage face', () => {
    const passageFace = (id: string, reason?: string) => ({ id, face: { kind: 'passage', passage: passageOf('minim') }, ...(reason ? { reason } : {}) });
    expect(issues({ ...specExample, options: [passageFace('a', 'r'), passageFace('b')] })).toEqual([]);
    const bad = { id: 'a', face: { kind: 'passage', passage: { ...passageOf('crotchet'), time: { beats: 4, beatUnit: 4 } } }, reason: 'r' };
    expect(issues({ ...specExample, options: [bad, passageFace('b')] }).length).toBeGreaterThan(0);
  });

  it('requires option text that refers to clips to be exactly Clip A, Clip B or Clip C', () => {
    const bad = (t: string) => issues({ ...specExample, options: [text('a', t, 'r'), text('b', 'Clip B')] });
    expect(bad('clip a').length).toBeGreaterThan(0);
    expect(bad('Clip  A').length).toBeGreaterThan(0);
    expect(bad('The first clip').length).toBeGreaterThan(0);
    expect(bad('Clip C')).toContain(
      'options.0.face.text: An option that refers to a clip must read exactly "Clip A", "Clip B"',
    );
    expect(bad('Clip A')).toEqual([]);
  });

  it('does not let options refer to clips when there is one clip', () => {
    expect(issues({ clips: [clip], options: [text('a', 'Clip A', 'r'), text('b', 'Clip B')], correct: 'b' }).length).toBeGreaterThan(0);
  });
});
