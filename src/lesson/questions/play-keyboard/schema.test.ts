import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { payloadSchema } from './schema';

const p = (s: string) => pitch.parsePitch(s);
const base = {
  low: p('C4'),
  high: p('C5'),
  showLabels: false,
  targets: [p('C4'), p('D4'), p('E4')],
  mode: 'sequence',
  octave: 'exact',
};
const issues = (value: unknown) => {
  const result = payloadSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('play-keyboard payloadSchema', () => {
  it('accepts the spec example', () => {
    const example = {
      low: { letter: 'C', accidental: 0, octave: 4 },
      high: { letter: 'C', accidental: 0, octave: 5 },
      showLabels: false,
      targets: [
        { letter: 'C', accidental: 0, octave: 4 },
        { letter: 'D', accidental: 0, octave: 4 },
        { letter: 'E', accidental: 0, octave: 4 },
      ],
      mode: 'sequence',
      octave: 'exact',
    };
    expect(payloadSchema.safeParse(example).success).toBe(true);
  });

  it('applies the nameNotes default of true and accepts false', () => {
    const { showLabels: _unused, ...rest } = base;
    void _unused;
    const parsed = payloadSchema.parse(rest);
    expect(parsed.nameNotes).toBe(true);
    expect(payloadSchema.parse({ ...rest, nameNotes: false }).nameNotes).toBe(false);
    expect(issues({ ...rest, nameNotes: 'no' }).length).toBeGreaterThan(0);
  });

  it('applies the showLabels default of false', () => {
    const rest: Record<string, unknown> = { ...base };
    delete rest.showLabels;
    const parsed = payloadSchema.parse(rest);
    expect(parsed.showLabels).toBe(false);
  });

  it('accepts a chord with a black-key target, and a passage', () => {
    const chord = {
      ...base,
      targets: [p('C4'), p('E4'), p('G4')],
      mode: 'together',
      passage: {
        clef: 'treble',
        key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
        time: { beats: 4, beatUnit: 4 },
        bars: [{ events: [{ kind: 'note', pitches: [p('C4'), p('E4'), p('G4')], duration: { value: 'semibreve', dots: 0 } }] }],
      },
    };
    expect(issues(chord)).toEqual([]);
    expect(issues({ ...base, targets: [p('F#4')] })).toEqual([]);
  });

  it('rejects unknown keys', () => {
    expect(issues({ ...base, extra: 1 }).length).toBeGreaterThan(0);
  });

  it('rejects a black key as low or high', () => {
    expect(issues({ ...base, low: p('C#4') })).toContain('low: `low` must be a natural (a white key)');
    expect(issues({ ...base, high: p('D#5') })).toContain('high: `high` must be a natural (a white key)');
  });

  it('rejects low that is not below high', () => {
    expect(issues({ ...base, low: p('C5'), high: p('C4') })).toContain('low: `low` must be below `high`');
    expect(issues({ ...base, low: p('C4'), high: p('C4') })).toContain('low: `low` must be below `high`');
  });

  it('rejects targets outside the range, none, and more than eight', () => {
    expect(issues({ ...base, targets: [p('C4'), p('D5')] })).toContain(
      'targets.1: Every target must be within the keyboard range',
    );
    expect(issues({ ...base, targets: [p('B3')] }).length).toBeGreaterThan(0);
    expect(issues({ ...base, targets: [] }).length).toBeGreaterThan(0);
    const nine = Array.from({ length: 9 }, () => p('C4'));
    expect(issues({ ...base, targets: nine }).length).toBeGreaterThan(0);
    const eight = [p('C4'), p('D4'), p('E4'), p('F4'), p('G4'), p('A4'), p('B4'), p('C5')];
    expect(issues({ ...base, targets: eight })).toEqual([]);
  });

  it('needs at least two distinct targets in together mode', () => {
    expect(issues({ ...base, mode: 'together', targets: [p('C4')] })).toContain(
      'targets: A chord (`together`) needs at least two targets',
    );
    expect(issues({ ...base, mode: 'together', targets: [p('C4'), p('C4')] })).toContain(
      'targets: No two targets may sound the same',
    );
    // Enharmonic spellings sound the same.
    expect(issues({ ...base, mode: 'together', targets: [p('F#4'), p('Gb4')] })).toContain(
      'targets: No two targets may sound the same',
    );
  });

  it('in together mode with any octave also rejects two targets with one note name', () => {
    expect(issues({ ...base, mode: 'together', octave: 'any', targets: [p('C4'), p('C5')] })).toContain(
      'targets: No two targets may sound the same',
    );
    expect(issues({ ...base, mode: 'together', octave: 'exact', targets: [p('C4'), p('C5')] })).toEqual([]);
  });

  it('rejects a passage with a short bar (passage rules)', () => {
    const passage = {
      clef: 'treble',
      key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
      time: { beats: 4, beatUnit: 4 },
      bars: [{ events: [{ kind: 'note', pitches: [p('C4')], duration: { value: 'crotchet', dots: 0 } }] }],
    };
    expect(issues({ ...base, passage }).length).toBeGreaterThan(0);
  });
});
