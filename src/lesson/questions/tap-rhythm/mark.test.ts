import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { mark } from './mark';
import { bar, note, payloadOf, rest } from './test-helpers';

const cc_m = payloadOf([bar(note('crotchet'), note('crotchet'), note('minim'))]); // 3 onsets
const eight = payloadOf([
  bar(note('crotchet'), note('crotchet'), note('crotchet'), note('crotchet')),
  bar(note('crotchet'), note('crotchet'), note('crotchet'), note('crotchet')),
]);
const ans = (errorsMs: (number | null)[], extraTaps = 0) => ({ errorsMs, extraTaps, accuracy: 0.5 });

describe('tap-rhythm mark: score and correct', () => {
  it('is correct and scores 1 when every note is hit', () => {
    expect(mark(cc_m, ans([0, 10, -20]))).toEqual({ correct: true, score: 1 });
  });

  it('passes at 0.8 and fails below it', () => {
    const one = mark(eight, ans([0, 0, 0, 0, 0, 0, 0, null]));
    expect(one).toEqual({ correct: true, score: 0.875 });
    const two = mark(eight, ans([0, 0, 0, 0, 0, 0, null, null]));
    expect(two.correct).toBe(false);
    expect(two.score).toBe(0.75);
  });

  it('exactly 0.8 is correct (8 of 10 with no extras)', () => {
    const ten = payloadOf([
      bar(note('crotchet'), note('crotchet'), note('crotchet'), note('crotchet')),
      bar(note('crotchet'), note('crotchet'), note('crotchet'), note('crotchet')),
      bar(note('minim'), note('minim')),
    ]); // 10 onsets
    const r = mark(ten, ans([0, 0, 0, 0, 0, 0, 0, 0, null, null]));
    expect(r.score).toBe(0.8);
    expect(r.correct).toBe(true);
  });

  it('subtracts extra taps and clamps to 0..1', () => {
    expect(mark(eight, ans([0, 0, 0, 0, 0, 0, 0, 0], 1))).toEqual({ correct: true, score: 0.875 });
    expect(mark(eight, ans([0, 0, 0, 0, 0, 0, 0, 0], 2)).correct).toBe(false);
    expect(mark(cc_m, ans([0, null, null], 5)).score).toBe(0);
  });

  it('counts a tap exactly at the tolerance as a hit, and beyond it as mistimed', () => {
    expect(mark(cc_m, ans([150, -150, 0])).score).toBe(1);
    expect(mark(cc_m, ans([151, 0, 0])).score).toBeCloseTo(2 / 3);
  });

  it('uses 150 ms when toleranceMs is absent, and the payload value when given', () => {
    const rest = { ...cc_m };
    delete rest.toleranceMs;
    expect(mark(rest, ans([140, 0, 0])).score).toBe(1);
    expect(mark(rest, ans([160, 0, 0])).score).toBeCloseTo(2 / 3);
    expect(mark({ ...cc_m, toleranceMs: 200 }, ans([160, 0, 0])).score).toBe(1);
    expect(mark({ ...cc_m, toleranceMs: 60 }, ans([70, 0, 0])).score).toBeCloseTo(2 / 3);
  });

  it('does not use answer.accuracy', () => {
    expect(mark(cc_m, { errorsMs: [0, 0, 0], extraTaps: 0, accuracy: 0 }).correct).toBe(true);
    expect(mark(cc_m, { errorsMs: [null, null, null], extraTaps: 0, accuracy: 1 }).correct).toBe(false);
  });

  it('reads a missing entry as null and ignores entries beyond N', () => {
    expect(mark(cc_m, ans([0, 0])).reason).toBe('You missed 1 of the 3 notes. Tap once for every note, long ones included.');
    expect(mark(cc_m, ans([])).reason).toBe(
      'No taps came through. Tap the pad once for every note, starting straight after the count-in.',
    );
    expect(mark(cc_m, ans([0, 0, 0, 999, null])).score).toBe(1);
  });
});

describe('tap-rhythm mark: reasons 1 to 3', () => {
  it('1: no taps came through', () => {
    const r = mark(cc_m, ans([null, null, null]));
    expect(r).toEqual({
      correct: false,
      score: 0,
      reason: 'No taps came through. Tap the pad once for every note, starting straight after the count-in.',
    });
  });

  it('1 wins over 2 when all are missed even with extra taps', () => {
    expect(mark(cc_m, ans([null, null, null], 4)).reason).toMatch(/^No taps came through/);
  });

  it('2: extra taps, plural and singular', () => {
    expect(mark(cc_m, ans([0, 0, 0], 2)).reason).toBe(
      'You tapped 2 more times than there are notes. Every note gets one tap, however long it lasts: tap, then wait.',
    );
    expect(mark(cc_m, ans([0, 0, null], 3)).reason).toMatch(/^You tapped 3 more times/);
    const singular = mark(cc_m, ans([0, null, null], 2));
    expect(singular.reason).toMatch(/^You tapped 2 more times/);
    expect(mark(payloadOf([bar(note('semibreve'))]), ans([0], 1)).reason).toBe(
      'You tapped 1 more time than there are notes. Every note gets one tap, however long it lasts: tap, then wait.',
    );
  });

  it('2 applies when extra taps equal missed plus mistimed', () => {
    expect(mark(cc_m, ans([0, 300, null], 2)).reason).toMatch(/^You tapped 2 more times/);
    expect(mark(cc_m, ans([0, 300, null], 1)).reason).toMatch(/^You missed 1 of the 3 notes/);
  });

  it('3: missed notes', () => {
    expect(mark(cc_m, ans([0, null, null])).reason).toBe(
      'You missed 2 of the 3 notes. Tap once for every note, long ones included.',
    );
  });

  it('3 wins over 4 when missed is at least mistimed', () => {
    expect(mark(cc_m, ans([300, null, 0])).reason).toMatch(/^You missed 1 of the 3 notes/);
    expect(mark(cc_m, ans([300, 300, null])).reason).toMatch(/^Tap 1 came|^You came in/);
  });
});

describe('tap-rhythm mark: timing reasons', () => {
  it('first note, no rest: early and late', () => {
    expect(mark(cc_m, ans([-300, 0, 0])).reason).toBe(
      'You came in early. Let the count-in finish, then tap on the very next click.',
    );
    expect(mark(cc_m, ans([300, 0, 0])).reason).toBe(
      'You came in late. The first note lands on the first click after the count-in.',
    );
  });

  it('first note after a rest: same text for early and late', () => {
    const restFirst = payloadOf([bar(rest('crotchet'), note('crotchet'), note('minim'))]);
    const expected = 'This rhythm starts with a rest. Wait for 1 beat after the count-in before your first tap.';
    expect(mark(restFirst, ans([-300, 0])).reason).toBe(expected);
    expect(mark(restFirst, ans([300, 0])).reason).toBe(expected);
    const longRest = payloadOf([bar(rest('minim', 1), note('crotchet'))]);
    expect(mark(longRest, ans([300])).reason).toBe(
      'This rhythm starts with a rest. Wait for 3 beats after the count-in before your first tap.',
    );
  });

  it('after a note, no rest: names the previous note value and its length', () => {
    expect(mark(cc_m, ans([0, -300, 0])).reason).toBe(
      'Tap 2 came too early. The [[crotchet|crotchet]] before it lasts 1 beat, so count all of it before you tap again.',
    );
    expect(mark(cc_m, ans([0, 300, 0])).reason).toBe(
      'Tap 2 came late. The [[crotchet|crotchet]] before it lasts only 1 beat, so the next note follows sooner.',
    );
    const longFirst = payloadOf([bar(note('minim'), note('crotchet'), note('crotchet'))]);
    expect(mark(longFirst, ans([0, -300, 0])).reason).toBe(
      'Tap 2 came too early. The [[minim|minim]] before it lasts 2 beats, so count all of it before you tap again.',
    );
  });

  it('describes a dotted previous note and its length', () => {
    const dotted = payloadOf([bar(note('minim', 1), note('crotchet'))]);
    expect(mark(dotted, ans([0, -300])).reason).toBe(
      'Tap 2 came too early. The dotted [[minim|minim]] before it lasts 3 beats, so count all of it before you tap again.',
    );
    const halves = payloadOf([bar(note('crotchet', 1), note('quaver'), note('minim'))]);
    expect(mark(halves, ans([0, 300, 0])).reason).toBe(
      'Tap 2 came late. The dotted [[crotchet|crotchet]] before it lasts only 1½ beats, so the next note follows sooner.',
    );
    const quaver = payloadOf([bar(note('quaver'), note('quaver'), note('minim'), note('crotchet'))]);
    expect(mark(quaver, ans([0, 300, 0, 0])).reason).toBe(
      'Tap 2 came late. The [[quaver|quaver]] before it lasts only ½ beat, so the next note follows sooner.',
    );
  });

  it('after a rest: early and late, with the rest length', () => {
    const withRest = payloadOf([bar(note('crotchet'), rest('crotchet'), note('crotchet'), note('crotchet'))]);
    expect(mark(withRest, ans([0, -300, 0])).reason).toBe(
      'Tap 2 came too early. There is a rest before it: stay silent for 1 beat first.',
    );
    expect(mark(withRest, ans([0, 300, 0])).reason).toBe('Tap 2 came late. The rest before it lasts only 1 beat.');
    const longRest = payloadOf([bar(note('minim'), rest('crotchet', 1), note('quaver'))]);
    expect(mark(longRest, ans([0, -300])).reason).toBe(
      'Tap 2 came too early. There is a rest before it: stay silent for 1½ beats first.',
    );
  });

  it('names a tied note without a note value', () => {
    const tied = payloadOf([
      bar(note('crotchet'), note('crotchet'), note('minim', 0, true)),
      bar(note('minim'), note('minim')),
    ]);
    // Onsets: crotchet, crotchet, tied (4 beats), minim.
    expect(mark(tied, ans([0, 0, 0, -300])).reason).toBe(
      'Tap 4 came too early. The tied note before it lasts 4 beats, so count all of it before you tap again.',
    );
    expect(mark(tied, ans([0, 0, 0, 300])).reason).toBe(
      'Tap 4 came late. The tied note before it lasts only 4 beats, so the next note follows sooner.',
    );
  });

  it('uses the first mistimed tap and counts beats by the bottom number of the time', () => {
    const t68 = payloadOf([bar(note('crotchet'), note('crotchet'), note('crotchet'))], { time: { beats: 6, beatUnit: 8 } });
    expect(mark(t68, ans([0, 400, 400])).reason).toBe(
      'Tap 2 came late. The [[crotchet|crotchet]] before it lasts only 2 beats, so the next note follows sooner.',
    );
    expect(mark(cc_m, ans([0, 300, -300])).reason).toMatch(/^Tap 2 came late/);
  });

  it('every reason is 40 words or fewer with no exclamation mark', () => {
    const reasons = [
      mark(cc_m, ans([0, -300, 0])).reason,
      mark(cc_m, ans([0, 0, 0], 2)).reason,
      mark(cc_m, ans([null, null, null])).reason,
    ] as string[];
    for (const reason of reasons) {
      expect(reason.split(/\s+/).length).toBeLessThanOrEqual(40);
      expect(reason).not.toContain('!');
    }
  });
});

describe('tap-rhythm mark: bad answers', () => {
  it('throws TheoryError for something that is not a TapResult', () => {
    // @ts-expect-error deliberately wrong shape
    expect(() => mark(cc_m, undefined)).toThrow(TheoryError);
    // @ts-expect-error deliberately wrong shape
    expect(() => mark(cc_m, { errorsMs: 'x', extraTaps: 0, accuracy: 0 })).toThrow(TheoryError);
    // @ts-expect-error deliberately wrong shape
    expect(() => mark(cc_m, { errorsMs: [], extraTaps: '1', accuracy: 0 })).toThrow(TheoryError);
    expect(() => mark(cc_m, { errorsMs: [], extraTaps: -1, accuracy: 0 })).toThrow(TheoryError);
    expect(() => mark(cc_m, { errorsMs: [Number.NaN], extraTaps: 0, accuracy: 0 })).toThrow(TheoryError);
  });
});
