import { describe, expect, it } from 'vitest';
import { rhythm } from '@/engine/rhythm';
import type { Bar, NoteValue, ScoreEvent, TimeSignature } from '@/engine/types';
import { onsetAtBeat, onsetKey, onsetRefs } from './onset-map';

const note = (value: NoteValue, tie = false, dots: 0 | 1 = 0): ScoreEvent => ({
  kind: 'note',
  pitches: [{ letter: 'B', accidental: 0, octave: 4 }],
  duration: { value, dots },
  ...(tie ? { tieToNext: true } : {}),
});
const rest = (value: NoteValue): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });
const T44: TimeSignature = { beats: 4, beatUnit: 4 };

const fixtures: { name: string; time: TimeSignature; bars: Bar[]; keys: string[] }[] = [
  {
    name: 'notes only',
    time: T44,
    bars: [bar(note('crotchet'), note('crotchet'), note('minim'))],
    keys: ['0:0', '0:1', '0:2'],
  },
  {
    name: 'rests have no onset',
    time: T44,
    bars: [bar(rest('crotchet'), note('crotchet'), rest('minim'))],
    keys: ['0:1'],
  },
  {
    name: 'a tied continuation is not a separate onset',
    time: T44,
    bars: [bar(note('minim', true), note('minim')), bar(note('semibreve'))],
    keys: ['0:0', '1:0'],
  },
  {
    name: 'a tie across the barline',
    time: T44,
    bars: [bar(note('minim'), note('minim', true)), bar(note('minim'), note('minim'))],
    keys: ['0:0', '0:1', '1:1'],
  },
  {
    name: 'a three-note tie chain',
    time: T44,
    bars: [bar(note('crotchet', true), note('crotchet', true), note('minim'))],
    keys: ['0:0'],
  },
  {
    name: 'a tie into a rest is not continued after it',
    time: T44,
    bars: [bar(note('minim', true), rest('minim')), bar(note('minim'), note('minim'))],
    keys: ['0:0', '1:0', '1:1'],
  },
  {
    name: 'a whole-bar rest bar between notes',
    time: T44,
    bars: [bar(note('semibreve')), bar(rest('semibreve')), bar(note('semibreve'))],
    keys: ['0:0', '2:0'],
  },
  {
    name: 'quavers in 6/8 (compound, dotted-crotchet beat)',
    time: { beats: 6, beatUnit: 8 },
    bars: [bar(note('quaver'), note('quaver'), note('quaver'), note('crotchet', false, 1))],
    keys: ['0:0', '0:1', '0:2', '0:3'],
  },
];

describe('onsetRefs', () => {
  it.each(fixtures)('$name: same onsets as rhythm.onsetTimes', ({ time, bars, keys }) => {
    const refs = onsetRefs(bars, time);
    expect(refs.map(onsetKey)).toEqual(keys);
    const times = rhythm.onsetTimes(bars, time, 60);
    expect(refs).toHaveLength(times.length);
    refs.forEach((r, i) => expect(r.beat).toBeCloseTo(times[i], 9));
  });

  it('measures a note, its tied continuations included, in felt beats', () => {
    const refs = onsetRefs([bar(note('minim', true), note('crotchet'), note('crotchet'))], T44);
    expect(refs.map((r) => r.length)).toEqual([3, 1]);
    const compound = onsetRefs(
      [bar(note('quaver'), note('quaver'), note('quaver'), note('crotchet', false, 1))],
      { beats: 6, beatUnit: 8 },
    );
    expect(compound.map((r) => r.length)).toEqual([1 / 3, 1 / 3, 1 / 3, 1]);
  });
});

describe('onsetAtBeat', () => {
  const refs = onsetRefs([bar(note('crotchet'), rest('crotchet'), note('minim'))], T44); // onsets at beats 0 and 2
  it('picks the note that starts on the beat', () => {
    expect(onsetAtBeat(refs, 0)).toBe(0);
    expect(onsetAtBeat(refs, 2)).toBe(1);
  });
  it('keeps a held note lit through its later beats, but not through a rest', () => {
    expect(onsetAtBeat(refs, 1)).toBeNull();
    expect(onsetAtBeat(refs, 3)).toBe(1);
  });
  it('is null past the end', () => {
    expect(onsetAtBeat(refs, 4)).toBeNull();
  });
});
