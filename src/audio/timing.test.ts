import { describe, expect, it } from 'vitest';
import type { Bar, Duration, NoteEvent, NoteValue, Passage, Pitch, RestEvent } from '@/engine/types';
import {
  beatSeconds,
  durationLength,
  feltBeatLength,
  feltBeatsPerBar,
  fraction,
  isCompound,
  schedulePassage,
  secondsPerWholeNote,
} from './timing';

const d = (value: NoteValue, dots: 0 | 1 | 2 = 0, tuplet?: Duration['tuplet']): Duration =>
  tuplet ? { value, dots, tuplet } : { value, dots };
const pc = (letter: Pitch['letter'], octave = 4, accidental: Pitch['accidental'] = 0): Pitch => ({
  letter,
  accidental,
  octave,
});
const note = (pitches: Pitch[], duration: Duration, tieToNext?: boolean): NoteEvent => ({
  kind: 'note',
  pitches,
  duration,
  ...(tieToNext ? { tieToNext } : {}),
});
const rest = (duration: Duration): RestEvent => ({ kind: 'rest', duration });
const passage = (bars: Bar[], beats = 4, beatUnit: 1 | 2 | 4 | 8 | 16 = 4): Passage => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats, beatUnit },
  bars,
});

describe('durationLength', () => {
  it.each([
    [d('breve'), 2, 1],
    [d('semibreve'), 1, 1],
    [d('minim'), 1, 2],
    [d('crotchet'), 1, 4],
    [d('quaver'), 1, 8],
    [d('semiquaver'), 1, 16],
    [d('demisemiquaver'), 1, 32],
    [d('crotchet', 1), 3, 8],
    [d('minim', 1), 3, 4],
    [d('minim', 2), 7, 8],
    [d('crotchet', 2), 7, 16],
    [d('quaver', 0, { actual: 3, normal: 2 }), 1, 12],
    [d('crotchet', 0, { actual: 3, normal: 2 }), 1, 6],
    [d('quaver', 0, { actual: 2, normal: 3 }), 3, 16],
    [d('semiquaver', 0, { actual: 5, normal: 4 }), 1, 20],
    [d('crotchet', 1, { actual: 3, normal: 2 }), 1, 4],
  ])('%j = %i/%i', (duration, n, den) => {
    expect(durationLength(duration)).toEqual(fraction(n, den));
  });

  it('three triplet quavers fill one crotchet beat', () => {
    const t = durationLength(d('quaver', 0, { actual: 3, normal: 2 }));
    expect(t.n * 3 * 4).toBe(t.d); // 3t = 1/4
  });

  it('rejects a bad tuplet', () => {
    expect(() => durationLength(d('quaver', 0, { actual: 0, normal: 2 }))).toThrow();
  });
});

describe('metre', () => {
  it.each([
    [4, 4, false, 4, 1, 4],
    [3, 4, false, 3, 1, 4],
    [2, 2, false, 2, 1, 2],
    [6, 8, true, 2, 3, 8],
    [9, 8, true, 3, 3, 8],
    [12, 8, true, 4, 3, 8],
    [3, 8, false, 3, 1, 8],
    [6, 4, false, 6, 1, 4],
  ] as const)('%i/%i', (beats, unit, compound, felt, ln, ld) => {
    const time = { beats, beatUnit: unit };
    expect(isCompound(time)).toBe(compound);
    expect(feltBeatsPerBar(time)).toBe(felt);
    expect(feltBeatLength(time)).toEqual(fraction(ln, ld));
  });

  it('tempo arithmetic', () => {
    expect(beatSeconds(120)).toBe(0.5);
    expect(secondsPerWholeNote({ beats: 4, beatUnit: 4 }, 120)).toBe(2);
    // 6/8 at 60 felt beats/min: dotted crotchet = 1s, so a whole note = 8/3 s.
    expect(secondsPerWholeNote({ beats: 6, beatUnit: 8 }, 60)).toBeCloseTo(8 / 3, 12);
    expect(() => beatSeconds(0)).toThrow();
    expect(() => beatSeconds(NaN)).toThrow();
  });
});

describe('schedulePassage', () => {
  const C = pc('C');
  const E = pc('E');
  const G = pc('G');

  it('times plain crotchets at 120 bpm across bars', () => {
    const t = schedulePassage(
      passage([
        { events: [note([C], d('crotchet')), note([E], d('crotchet')), note([G], d('minim'))] },
        { events: [note([C], d('semibreve'))] },
      ]),
      120,
    );
    expect(t.events.map((e) => [e.bar, e.event, e.start])).toEqual([
      [0, 0, 0],
      [0, 1, 0.5],
      [0, 2, 1],
      [1, 0, 2],
    ]);
    expect(t.totalSeconds).toBe(4);
    expect(t.events[2].attacks[0].sustain).toBe(1);
    expect(t.events[0].attacks[0].frequency).toBeCloseTo(261.6256, 3);
  });

  it('handles rests: no attacks but still timed events', () => {
    const t = schedulePassage(
      passage([{ events: [note([C], d('crotchet')), rest(d('crotchet')), note([E], d('minim'))] }]),
      60,
    );
    expect(t.events[1]).toMatchObject({ kind: 'rest', start: 1, length: 1, attacks: [] });
    expect(t.events[2].start).toBe(2);
  });

  it('handles dotted notes', () => {
    const t = schedulePassage(
      passage([{ events: [note([C], d('minim', 1)), note([E], d('crotchet'))] }]),
      60,
    );
    expect(t.events[0].length).toBe(3);
    expect(t.events[1].start).toBe(3);
    expect(t.totalSeconds).toBe(4);
  });

  it('handles double-dotted notes', () => {
    const t = schedulePassage(
      passage([{ events: [note([C], d('minim', 2)), note([E], d('quaver'))] }]),
      60,
    );
    expect(t.events[0].length).toBeCloseTo(3.5, 12);
    expect(t.events[1].start).toBeCloseTo(3.5, 12);
  });

  it('handles triplets: three in the time of one beat', () => {
    const tq = d('quaver', 0, { actual: 3, normal: 2 });
    const t = schedulePassage(
      passage([
        {
          events: [
            note([C], tq),
            note([E], tq),
            note([G], tq),
            note([C], d('crotchet')),
            note([C], d('minim')),
          ],
        },
      ]),
      60,
    );
    const starts = t.events.map((e) => e.start);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeCloseTo(1 / 3, 12);
    expect(starts[2]).toBeCloseTo(2 / 3, 12);
    expect(starts[3]).toBeCloseTo(1, 12);
    expect(starts[4]).toBeCloseTo(2, 12);
  });

  it('counts felt beats in compound time (6/8)', () => {
    // 6/8 at 60: dotted crotchet = 1 s, quaver = 1/3 s.
    const t = schedulePassage(
      passage(
        [
          {
            events: [
              note([C], d('quaver')),
              note([E], d('quaver')),
              note([G], d('quaver')),
              note([C], d('crotchet', 1)),
            ],
          },
        ],
        6,
        8,
      ),
      60,
    );
    expect(t.events.map((e) => e.start)).toEqual([
      0,
      expect.closeTo(1 / 3, 12),
      expect.closeTo(2 / 3, 12),
      expect.closeTo(1, 12),
    ]);
    expect(t.totalSeconds).toBeCloseTo(2, 12);
  });

  it('ties extend the first attack and do not re-attack', () => {
    const t = schedulePassage(
      passage([
        { events: [note([C], d('minim')), note([E], d('minim'), true)] },
        { events: [note([E], d('minim')), note([G], d('minim'))] },
      ]),
      60,
    );
    const e = t.events;
    expect(e[1].attacks).toHaveLength(1);
    expect(e[1].attacks[0].sustain).toBe(4); // minim + minim at 60 = 2 + 2
    expect(e[2].attacks).toHaveLength(0); // continuation: no attack
    expect(e[2].start).toBe(4);
    expect(e[3].attacks).toHaveLength(1);
    expect(t.totalSeconds).toBe(8);
  });

  it('chains of ties sum up', () => {
    const t = schedulePassage(
      passage([
        {
          events: [
            note([C], d('crotchet'), true),
            note([C], d('crotchet'), true),
            note([C], d('crotchet'), true),
            note([C], d('crotchet')),
          ],
        },
      ]),
      60,
    );
    expect(t.events[0].attacks[0].sustain).toBe(4);
    expect(t.events.slice(1).every((x) => x.attacks.length === 0)).toBe(true);
  });

  it('a tie to a different pitch re-attacks', () => {
    const t = schedulePassage(
      passage([{ events: [note([C], d('crotchet'), true), note([E], d('crotchet'))] }]),
      60,
    );
    expect(t.events[0].attacks[0].sustain).toBe(1);
    expect(t.events[1].attacks).toHaveLength(1);
  });

  it('a tie into a rest is harmless', () => {
    const t = schedulePassage(
      passage([{ events: [note([C], d('crotchet'), true), rest(d('crotchet'))] }]),
      60,
    );
    expect(t.events[0].attacks[0].sustain).toBe(1);
    expect(t.events[1].attacks).toEqual([]);
  });

  it('enharmonic tied pitches continue', () => {
    const t = schedulePassage(
      passage([
        {
          events: [
            note([pc('F', 4, 1)], d('crotchet'), true),
            note([pc('G', 4, -1)], d('crotchet')),
          ],
        },
      ]),
      60,
    );
    expect(t.events[1].attacks).toHaveLength(0);
    expect(t.events[0].attacks[0].sustain).toBe(2);
  });

  it('chords tie pitch by pitch', () => {
    const t = schedulePassage(
      passage([
        {
          events: [
            note([C, E], d('crotchet'), true),
            note([E, G], d('crotchet')),
          ],
        },
      ]),
      60,
    );
    const [first, second] = t.events;
    expect(first.attacks.map((a) => [a.midi, a.sustain])).toEqual([
      [60, 1],
      [64, 2],
    ]);
    expect(second.attacks.map((a) => a.midi)).toEqual([67]);
  });

  it('count-in shifts events and emits accented clicks', () => {
    const t = schedulePassage(
      passage([{ events: [note([C], d('semibreve'))] }]),
      120,
      4,
    );
    expect(t.countInSeconds).toBe(2);
    expect(t.clicks).toEqual([
      { time: 0, accent: true },
      { time: 0.5, accent: false },
      { time: 1, accent: false },
      { time: 1.5, accent: false },
    ]);
    expect(t.events[0].start).toBe(2);
    expect(t.totalSeconds).toBe(4);
  });

  it('count-in accents follow felt beats in 6/8 and 3/4', () => {
    const six = schedulePassage(passage([{ events: [rest(d('semibreve'))] }], 6, 8), 60, 4);
    expect(six.clicks.map((c) => c.accent)).toEqual([true, false, true, false]);
    const three = schedulePassage(passage([{ events: [rest(d('semibreve'))] }], 3, 4), 60, 4);
    expect(three.clicks.map((c) => c.accent)).toEqual([true, false, false, true]);
  });

  it('no count-in by default or for negative values', () => {
    const p = passage([{ events: [note([C], d('semibreve'))] }]);
    expect(schedulePassage(p, 60).clicks).toEqual([]);
    expect(schedulePassage(p, 60, -2).countInSeconds).toBe(0);
  });

  it('empty passage', () => {
    const t = schedulePassage(passage([]), 60, 2);
    expect(t.events).toEqual([]);
    expect(t.totalSeconds).toBe(2);
  });
});
