import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { pitch } from '@/engine/pitch';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import { mark } from './mark';
import type { FixBeamingPayload } from './types';

const B4 = pitch.parsePitch('B4');
const note = (value: NoteValue, dots: 0 | 1 = 0): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots } });
const rest = (value: NoteValue): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const q = () => note('quaver');
const c = () => note('crotchet');
const payloadFor = (time: { beats: number; beatUnit: 4 | 8 }, ...events: ScoreEvent[]): FixBeamingPayload => {
  const bar: Bar = { events, beams: [] };
  return {
    passage: { clef: 'treble', key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' }, time, bars: [bar] },
    barIndex: 0,
  };
};

const T44 = { beats: 4, beatUnit: 4 as const };
const T34 = { beats: 3, beatUnit: 4 as const };
const T24 = { beats: 2, beatUnit: 4 as const };
const T68 = { beats: 6, beatUnit: 8 as const };

const eight = payloadFor(T44, ...Array.from({ length: 8 }, q));
const QUAVERS = '[[quaver|quavers]]';

describe('fix-beaming mark: the correct case', () => {
  it('is right when the groups are the standard ones', () => {
    expect(mark(eight, { beams: [[0, 1, 2, 3], [4, 5, 6, 7]] })).toEqual({ correct: true, score: 1 });
  });

  it('does not mind the order the groups are listed in', () => {
    expect(mark(eight, { beams: [[4, 5, 6, 7], [0, 1, 2, 3]] }).correct).toBe(true);
  });

  it('is right for a bar whose standard beaming is per beat (a crotchet stops the halves joining)', () => {
    const p = payloadFor(T44, c(), q(), q(), c(), q(), q(), c());
    expect(mark(p, { beams: [[1, 2], [4, 5]] }).correct).toBe(true);
  });

  it('is right for 6/8 in two groups of three and for 3/4 as one group of six', () => {
    expect(mark(payloadFor(T68, ...Array.from({ length: 6 }, q)), { beams: [[0, 1, 2], [3, 4, 5]] }).correct).toBe(true);
    expect(mark(payloadFor(T34, ...Array.from({ length: 6 }, q)), { beams: [[0, 1, 2, 3, 4, 5]] }).correct).toBe(true);
  });
});

describe('fix-beaming mark: a beam crosses a beat it should show', () => {
  it('names the two notes and the two beats', () => {
    const p = payloadFor(T34, c(), q(), q(), q(), q());
    expect(mark(p, { beams: [[1, 2, 3, 4]] })).toEqual({
      correct: false,
      score: 0,
      reason: `Notes 3 and 4 are joined, but a beam should not cross from beat 2 into beat 3. Beam each beat's ${QUAVERS} together.`,
    });
  });

  it('numbers notes by event, counting rests', () => {
    // 3/4: quaver rest, quaver, crotchet, quaver, quaver. Per beat the standard joins only 4 and 5 (events 3, 4).
    const p = payloadFor(T34, rest('quaver'), q(), c(), q(), q());
    expect(mark(p, { beams: [[3, 4]] }).correct).toBe(true);
    expect(mark(p, { beams: [] }).reason).toBe('Notes 4 and 5 are in the same beat, so they are beamed together.');
  });

  it('uses the first difference from the left', () => {
    // 3/4: quaver, quaver, crotchet, quaver, quaver. Joining 2 and 3 is impossible (a crotchet); the learner joins
    // everything the bar allows but the last pair, so the first difference is the missing pair at the end.
    const p = payloadFor(T34, q(), q(), c(), q(), q());
    expect(mark(p, { beams: [[0, 1]] }).reason).toBe('Notes 4 and 5 are in the same beat, so they are beamed together.');
    expect(mark(p, { beams: [[3, 4]] }).reason).toBe('Notes 1 and 2 are in the same beat, so they are beamed together.');
  });
});

describe('fix-beaming mark: 4/4 across the middle', () => {
  it('says a beam should not cross the middle of the bar', () => {
    expect(mark(eight, { beams: [[0, 1, 2, 3, 4, 5, 6, 7]] })).toEqual({
      correct: false,
      score: 0,
      reason: 'A beam should not cross the middle of a 4/4 [[bar|bar]], between beats 2 and 3.',
    });
  });

  it('applies when only the pair at the middle is joined across it', () => {
    const p = payloadFor(T44, c(), q(), q(), q(), q(), c());
    expect(mark(p, { beams: [[1, 2], [3, 4]] }).correct).toBe(true);
    expect(mark(p, { beams: [[1, 2, 3, 4]] }).reason).toBe('A beam should not cross the middle of a 4/4 [[bar|bar]], between beats 2 and 3.');
  });

  it('the middle rule is only for 4/4: a beam across the middle of 2/4 is a beat crossing', () => {
    const p = payloadFor(T24, q(), q(), q(), q());
    expect(mark(p, { beams: [[0, 1, 2, 3]] }).correct).toBe(true);
  });
});

describe('fix-beaming mark: notes in one beat not joined', () => {
  it('says they are in the same beat', () => {
    const p = payloadFor(T44, c(), q(), q(), note('minim'));
    expect(mark(p, { beams: [] })).toEqual({
      correct: false,
      score: 0,
      reason: 'Notes 2 and 3 are in the same beat, so they are beamed together.',
    });
  });

  it('finds the first unjoined pair from the left', () => {
    const p = payloadFor(T44, q(), q(), c(), q(), q(), c());
    expect(mark(p, { beams: [[3, 4]] }).reason).toBe('Notes 1 and 2 are in the same beat, so they are beamed together.');
    expect(mark(p, { beams: [[0, 1]] }).reason).toBe('Notes 4 and 5 are in the same beat, so they are beamed together.');
  });
});

describe('fix-beaming mark: quavers that the standard beams across beats', () => {
  it('2/4: the whole bar of quavers is one group', () => {
    const p = payloadFor(T24, q(), q(), q(), q());
    expect(mark(p, { beams: [[0, 1], [2, 3]] }).reason).toBe(`Beats 1 and 2 hold only ${QUAVERS}, so they are beamed together. Join notes 2 and 3.`);
  });

  it('3/4: three beats of quavers are one group', () => {
    const p = payloadFor(T34, ...Array.from({ length: 6 }, q));
    expect(mark(p, { beams: [[0, 1], [2, 3], [4, 5]] }).reason).toBe(`Beats 1 to 3 hold only ${QUAVERS}, so they are beamed together. Join notes 2 and 3.`);
  });

  it('4/4: each half of the bar of quavers is one group', () => {
    expect(mark(eight, { beams: [[0, 1], [2, 3], [4, 5], [6, 7]] }).reason).toBe(`Beats 1 and 2 hold only ${QUAVERS}, so they are beamed together. Join notes 2 and 3.`);
    expect(mark(eight, { beams: [[0, 1, 2, 3], [4, 5], [6, 7]] }).reason).toBe(`Beats 3 and 4 hold only ${QUAVERS}, so they are beamed together. Join notes 6 and 7.`);
  });
});

describe('fix-beaming mark: compound time', () => {
  const six = payloadFor(T68, ...Array.from({ length: 6 }, q));
  const reason = `In 6/8 the ${QUAVERS} are grouped in threes, one group for each dotted [[crotchet|crotchet]] beat.`;

  it('names the grouping, whether the learner joined too much or too little', () => {
    expect(mark(six, { beams: [[0, 1], [2, 3], [4, 5]] }).reason).toBe(reason);
    expect(mark(six, { beams: [[0, 1, 2, 3, 4, 5]] }).reason).toBe(reason);
    expect(mark(six, { beams: [] }).reason).toBe(reason);
  });
});

describe('fix-beaming mark: input checks and wording', () => {
  it('throws for answers the component could never produce', () => {
    const p = payloadFor(T44, c(), q(), q(), c(), q(), q());
    expect(() => mark(p, { beams: [[0, 1]] })).toThrow(TheoryError); // a crotchet
    expect(() => mark(p, { beams: [[1]] })).toThrow(TheoryError);
    expect(() => mark(p, { beams: [[1, 3]] })).toThrow(TheoryError);
    expect(() => mark(p, { beams: [[1, 2], [2, 3]] })).toThrow(TheoryError);
    expect(() => mark(p, { beams: [[4, 5], [1, 99]] })).toThrow(TheoryError);
    expect(() => mark(p, {} as never)).toThrow(TheoryError);
    expect(() => mark({ ...p, barIndex: 3 }, { beams: [] })).toThrow(TheoryError);
  });

  it('every reason is within 40 words and never blames', () => {
    const cases: [FixBeamingPayload, number[][]][] = [
      [eight, [[0, 1, 2, 3, 4, 5, 6, 7]]],
      [eight, [[0, 1], [2, 3], [4, 5], [6, 7]]],
      [payloadFor(T68, ...Array.from({ length: 6 }, q)), []],
      [payloadFor(T34, c(), q(), q(), q(), q()), [[1, 2, 3, 4]]],
    ];
    for (const [p, beams] of cases) {
      const reason = mark(p, { beams }).reason!;
      expect(reason.replace(/\[\[[^|\]]+\|([^\]]*)\]\]/g, '$1').split(/\s+/).length).toBeLessThanOrEqual(40);
      expect(reason).not.toMatch(/!|you /i);
    }
  });
});
