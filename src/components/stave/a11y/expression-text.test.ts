import { describe, expect, it } from 'vitest';
import type { Passage } from '@/engine/types';
import { bar, engines, note, passage, rest } from '../fixtures';
import { describePassage, describePassageSegments } from './describe';

const uk = { terminology: 'uk', pitchSpeech: 'names' } as const;
const us = { terminology: 'us', pitchSpeech: 'names' } as const;
const r = (b: number, e: number) => ({ bar: b, event: e });

const withX = (p: Passage, expression: Passage['expression']): Passage => ({ ...p, expression });
const two = () => passage([bar(note('C4'), note('D4'), note('E4'), note('F4')), bar(note('G4'), note('A4'), note('B4'), rest())]);

describe('passage description with expression', () => {
  it('is unchanged without expression', () => {
    const p = two();
    expect(describePassage(engines, p, uk)).toBe(describePassage(engines, { ...p, expression: {} }, uk));
    expect(describePassage(engines, p, uk)).toBe(
      'Treble clef. Key signature: none. Time signature: 4 4. Bar 1: C4 crotchet; D4 crotchet; E4 crotchet; F4 crotchet. Bar 2: G4 crotchet; A4 crotchet; B4 crotchet; crotchet rest.',
    );
  });

  it('dynamics are said in words, in the event they belong to', () => {
    const levels = ['pp', 'p', 'mp', 'mf'] as const;
    const p = withX(two(), { dynamics: levels.map((level, i) => ({ at: r(0, i), level })) });
    const d = describePassage(engines, p, uk);
    expect(d).toContain('C4 crotchet, pianissimo; D4 crotchet, piano; E4 crotchet, mezzo piano; F4 crotchet, mezzo forte.');
    const f = withX(two(), { dynamics: [{ at: r(1, 0), level: 'f' }, { at: r(1, 2), level: 'ff' }] });
    expect(describePassage(engines, f, uk)).toContain('G4 crotchet, forte; A4 crotchet; B4 crotchet, fortissimo;');
  });

  it('hairpins say getting louder or quieter from where to where', () => {
    const p = withX(two(), {
      hairpins: [
        { kind: 'cresc', from: r(0, 0), to: r(0, 3) },
        { kind: 'dim', from: r(1, 0), to: r(1, 2) },
      ],
    });
    const d = describePassage(engines, p, uk);
    expect(d).toContain('C4 crotchet, getting louder from note 1 to note 4;');
    expect(d).toContain('G4 crotchet, getting quieter from note 1 to note 3;');
    const across = withX(two(), { hairpins: [{ kind: 'cresc', from: r(0, 2), to: r(1, 1) }] });
    expect(describePassage(engines, across, uk)).toContain('E4 crotchet, getting louder from note 3 to bar 2, note 2;');
    expect(describePassage(engines, across, us)).toContain('E4 quarter note, getting louder from note 3 to measure 2, note 2;');
  });

  it('articulation, pause, slurs and words', () => {
    const p = passage([bar(note('C4', 'crotchet', { articulations: ['staccato'] }), note('D4', 'crotchet', { articulations: ['accent', 'tenuto'] }), note('E4'), note('F4', 'crotchet', { fermata: true }))]);
    const d = describePassage(engines, withX(p, { slurs: [{ from: r(0, 0), to: r(0, 3) }], words: [{ at: r(0, 2), text: 'dolce', lang: 'it' }] }), uk);
    expect(d).toContain('C4 crotchet, staccato, slurred from note 1 to note 4;');
    expect(d).toContain('D4 crotchet, accent, tenuto;');
    expect(d).toContain('E4 crotchet, marked dolce;');
    expect(d).toContain('F4 crotchet, pause.');
  });

  it('a pause on a rest, and tempo changes', () => {
    const p = passage([bar(note('C4'), note('D4'), note('E4'), rest('crotchet'))]);
    const withRest = { ...p, bars: [{ events: [p.bars[0].events[0], p.bars[0].events[1], p.bars[0].events[2], { ...p.bars[0].events[3], fermata: true }] }] } as Passage;
    expect(describePassage(engines, withRest, uk)).toContain('crotchet rest, pause.');
    const q = withX(p, { tempoChanges: [{ kind: 'rit', from: r(0, 1), to: r(0, 3) }, { kind: 'a-tempo', at: r(0, 3) }] });
    const d = describePassage(engines, q, uk);
    expect(d).toContain('getting slower (ritardando) from note 2 to note 4');
    expect(d).toContain('back to the original speed (a tempo)');
  });

  it('tempo word and metronome mark use the right note names in each terminology', () => {
    const p = withX(two(), { tempo: { text: 'Allegro', bpm: 120 } });
    expect(describePassage(engines, p, uk)).toContain('Time signature: 4 4. Tempo: Allegro, 120 crotchets a minute. Bar 1');
    expect(describePassage(engines, p, us)).toContain('Tempo: Allegro, 120 quarter notes a minute.');
    const compound = withX(passage([bar(note('G4', 'quaver'), note('A4', 'quaver'), note('B4', 'quaver'), note('C5', 'crotchet'))], { beats: 6, unit: 8 }), { tempo: { bpm: 60 } });
    expect(describePassage(engines, compound, uk)).toContain('Tempo: 60 dotted crotchets a minute.');
    expect(describePassage(engines, compound, us)).toContain('Tempo: 60 dotted quarter notes a minute.');
    const minim = withX(two(), { tempo: { text: 'Andante', bpm: 50, beat: { value: 'minim', dots: 0 } } });
    expect(describePassage(engines, minim, uk)).toContain('Andante, 50 minims a minute');
    expect(describePassage(engines, minim, us)).toContain('Andante, 50 half notes a minute');
    expect(describePassage(engines, withX(two(), { tempo: { text: 'Moderato' } }), uk)).toContain('Tempo: Moderato. Bar 1');
  });

  it('repeats and navigation signs, in reading order', () => {
    const p = passage([
      { ...bar(note('C4'), note('D4'), note('E4'), note('F4')), repeatStart: true, marker: 'segno' },
      { ...bar(note('G4'), note('A4'), note('B4'), rest()), endBarline: 'repeat-end', marker: 'fine' },
      { ...bar(note('C5', 'semibreve')), endBarline: 'double' },
      { ...bar(note('C4', 'semibreve')), marker: 'ds-al-fine' },
    ]);
    const d = describePassage(engines, p, uk);
    expect(d).toContain('Bar 1: start repeat; segno sign; C4 crotchet;');
    expect(d).toContain('crotchet rest; end repeat: go back to the start repeat; Fine.');
    expect(d).toContain('Bar 3: C5 semibreve; double bar line.');
    expect(d).toContain('Bar 4: C4 semibreve; D.S. al Fine: go back to the segno and stop at Fine.');
    expect(describePassage(engines, p, us)).toContain('Measure 2: G4 quarter note;');
    const noStart = passage([{ ...bar(note('C4', 'semibreve')), endBarline: 'repeat-end' }]);
    expect(describePassage(engines, noStart, uk)).toContain('end repeat: go back to the beginning');
    const dc = passage([{ ...bar(note('C4', 'semibreve')), marker: 'dc-al-fine' }]);
    expect(describePassage(engines, dc, uk)).toContain('D.C. al Fine: go back to the beginning and stop at Fine.');
  });

  it('marks Italian terms with lang it, and the plain text reads the same', () => {
    const p = withX(two(), { tempo: { text: 'Allegro', bpm: 100 }, dynamics: [{ at: r(0, 0), level: 'mf' }], words: [{ at: r(0, 1), text: 'sweetly', lang: 'en' }] });
    const segs = describePassageSegments(engines, p, uk);
    expect(segs.filter((s) => s.lang).map((s) => [s.lang, s.text])).toEqual([['it', 'Allegro'], ['it', 'mezzo forte'], ['en', 'sweetly']]);
    expect(segs.map((s) => s.text).join('')).toBe(describePassage(engines, p, uk));
  });
});
