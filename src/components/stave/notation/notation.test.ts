import { describe, expect, it } from 'vitest';
import type { Clef, NoteValue } from '@/engine/types';
import { bar, engines, note, passage, rest } from '../fixtures';
import { stemDirections } from './stems';
import { accidentalType, beamIndexGroups, durationCode, keySpec, restKey, timeSpec, vexKey } from './to-vexflow';
import { tupletChunks } from './tuplets';

describe('to-vexflow', () => {
  it('key strings carry no accidental', () => {
    expect(vexKey(engines.pitch.parsePitch('F#4'))).toBe('f/4');
    expect(vexKey(engines.pitch.parsePitch('Bb3'))).toBe('b/3');
  });
  it.each<[NoteValue, string]>([
    ['breve', '1/2'], ['semibreve', 'w'], ['minim', 'h'], ['crotchet', 'q'],
    ['quaver', '8'], ['semiquaver', '16'], ['demisemiquaver', '32'],
  ])('duration code of %s', (v, code) => {
    expect(durationCode(v, false)).toBe(code);
    expect(durationCode(v, true)).toBe(code + 'r');
  });
  it.each<[Clef, string, string]>([
    ['treble', 'b/4', 'd/5'],
    ['bass', 'd/3', 'f/3'],
    ['alto', 'c/4', 'e/4'],
    ['tenor', 'a/3', 'c/4'],
  ])('rest positions in %s clef', (clef, middle, semibreve) => {
    expect(restKey(engines, 'crotchet', clef)).toBe(middle);
    expect(restKey(engines, 'minim', clef)).toBe(middle);
    expect(restKey(engines, 'breve', clef)).toBe(middle);
    expect(restKey(engines, 'semibreve', clef)).toBe(semibreve);
  });
  it('key signature specs for all 15 major signatures, and minors by relative major', () => {
    const want: Record<number, string> = {
      0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
      [-1]: 'F', [-2]: 'Bb', [-3]: 'Eb', [-4]: 'Ab', [-5]: 'Db', [-6]: 'Gb', [-7]: 'Cb',
    };
    for (const [sig, spec] of Object.entries(want)) {
      const key = engines.pitch.keyFromSignature(Number(sig), 'major');
      expect(keySpec(engines, key)).toBe(spec);
    }
    expect(keySpec(engines, { tonic: engines.pitch.parsePitchClass('A'), mode: 'minor' })).toBe('C');
    expect(keySpec(engines, { tonic: engines.pitch.parsePitchClass('F#'), mode: 'minor' })).toBe('A');
  });
  it('time and sign strings', () => {
    expect(timeSpec({ beats: 6, beatUnit: 8 })).toBe('6/8');
    expect([-2, -1, 0, 1, 2].map((s) => accidentalType(s as never))).toEqual(['bb', 'b', 'n', '#', '##']);
  });
  it('beam index groups keep only short notes, at least two', () => {
    const b = bar(note('C5', 'quaver'), note('D5', 'quaver'), rest('quaver'), note('E5', 'crotchet'), note('F5', 'quaver'), note('G5', 'quaver'));
    const p = passage([b]);
    const groups = beamIndexGroups(engines, b, p.time);
    expect(groups.every((g) => g.length >= 2)).toBe(true);
    for (const g of groups) for (const i of g) expect(['quaver', 'semiquaver']).toContain(b.events[i].duration.value);
  });
  it('an engine error means no beams', () => {
    const throwing = { ...engines, rhythm: { ...engines.rhythm, beamGroups: () => { throw new Error('x'); } } };
    expect(beamIndexGroups(throwing as never, bar(note('C5', 'quaver')), { beats: 5, beatUnit: 8 })).toEqual([]);
  });
});

describe('stems (4.4)', () => {
  const clefs: Clef[] = ['treble', 'bass', 'alto', 'tenor'];
  it.each(clefs)('single note rule in %s: below the middle up, middle and above down', (clef) => {
    for (const [pos, want] of [[0, 1], [3, 1], [4, -1], [5, -1], [8, -1], [-3, 1], [12, -1]] as const) {
      const p = engines.pitch.pitchAtStavePosition(pos, clef);
      const b = bar({ kind: 'note', pitches: [p], duration: { value: 'crotchet', dots: 0 } });
      expect(stemDirections(engines, b, [], clef)).toEqual([want]);
    }
  });
  it('chords: larger distance decides, equal goes down', () => {
    const treble = (pos: number[]) => bar({ kind: 'note', pitches: pos.map((q) => engines.pitch.pitchAtStavePosition(q, 'treble')), duration: { value: 'crotchet', dots: 0 } });
    expect(stemDirections(engines, treble([2, 8]), [], 'treble')).toEqual([-1]); // above 4, below 2 -> down
    expect(stemDirections(engines, treble([0, 6]), [], 'treble')).toEqual([1]); // above 2, below 4 -> up
    expect(stemDirections(engines, treble([2, 6]), [], 'treble')).toEqual([-1]); // equal -> down
  });
  it('semibreves and breves are up', () => {
    const p = engines.pitch.pitchAtStavePosition(8, 'treble');
    for (const value of ['semibreve', 'breve'] as const) {
      expect(stemDirections(engines, bar({ kind: 'note', pitches: [p], duration: { value, dots: 0 } }), [], 'treble')).toEqual([1]);
    }
  });
  it('beamed group: the furthest head decides, equal goes down, all share', () => {
    const mk = (pos: number[]) => bar(...pos.map((q) => ({ kind: 'note' as const, pitches: [engines.pitch.pitchAtStavePosition(q, 'treble')], duration: { value: 'quaver' as const, dots: 0 as const } })));
    expect(stemDirections(engines, mk([1, 5]), [[0, 1]], 'treble')).toEqual([1, 1]);   // 1 is 3 away, 5 is 1 away
    expect(stemDirections(engines, mk([3, 9]), [[0, 1]], 'treble')).toEqual([-1, -1]);
    expect(stemDirections(engines, mk([2, 6]), [[0, 1]], 'treble')).toEqual([-1, -1]); // equal
  });
  it('rests get a placeholder', () => {
    expect(stemDirections(engines, bar(rest()), [], 'treble')).toHaveLength(1);
  });
});

describe('tuplet chunks', () => {
  const t = (n: number) => Array.from({ length: n }, () => ({ kind: 'note' as const, pitches: [engines.pitch.parsePitch('C5')], duration: { value: 'quaver' as const, dots: 0 as const, tuplet: { actual: 3, normal: 2 } } }));
  it('chunks into groups of actual', () => {
    expect(tupletChunks(bar(note('C4'), ...t(6)))).toEqual([
      { start: 1, count: 3, actual: 3, normal: 2 },
      { start: 4, count: 3, actual: 3, normal: 2 },
    ]);
  });
  it('a short run is one partial chunk and none for plain bars', () => {
    expect(tupletChunks(bar(...t(2)))).toEqual([{ start: 0, count: 2, actual: 3, normal: 2 }]);
    expect(tupletChunks(bar(note('C4')))).toEqual([]);
  });
});
