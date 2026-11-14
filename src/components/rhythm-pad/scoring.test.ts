import { describe, expect, it } from 'vitest';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import {
  accuracy,
  applyLatency,
  calibrationOffset,
  expectedOnsets,
  judge,
  matchTaps,
  median,
  scoreTaps,
} from './scoring';

const close = (a: number | null, b: number) => expect(a).toBeCloseTo(b, 6);

describe('expectedOnsets', () => {
  const note = (value: NoteValue): ScoreEvent => ({
    kind: 'note',
    pitches: [{ letter: 'C', accidental: 0, octave: 4 }],
    duration: { value, dots: 0 },
  });
  const crotchet = note('crotchet');
  const quaver = note('quaver');
  const quaverRest: ScoreEvent = { kind: 'rest', duration: { value: 'quaver', dots: 0 } };
  const bars: Bar[] = [{ events: [crotchet, quaverRest, quaver, crotchet] }];

  it('offsets engine onsets by count-in and start', () => {
    // 4/4 at 120 bpm (0.5 s per beat): onsets at beats 0, 1.5 and 2.
    const out = expectedOnsets(bars, { beats: 4, beatUnit: 4 }, 120, 2, 10);
    expect(out).toHaveLength(3);
    close(out[0], 12);
    close(out[1], 12 + 0.75);
    close(out[2], 12 + 1);
  });
});

describe('matchTaps', () => {
  const expected = [1, 2, 3, 4];
  const table: { name: string; taps: number[]; errors: (number | null)[]; extra: number }[] = [
    { name: 'perfect', taps: [1, 2, 3, 4], errors: [0, 0, 0, 0], extra: 0 },
    { name: 'early and late are signed', taps: [0.95, 2.1, 3, 4], errors: [-50, 100, 0, 0], extra: 0 },
    { name: 'missed onsets are null', taps: [1, 3], errors: [0, null, 0, null], extra: 0 },
    { name: 'no taps', taps: [], errors: [null, null, null, null], extra: 0 },
    { name: 'extra tap far from any onset', taps: [1, 1.5, 2, 3, 4], errors: [0, 0, 0, 0], extra: 1 },
    { name: 'double tap uses one and counts one extra', taps: [1, 1.05, 2, 3, 4], errors: [0, 0, 0, 0], extra: 1 },
    { name: 'unsorted taps are sorted', taps: [4, 3, 2, 1], errors: [0, 0, 0, 0], extra: 0 },
    { name: 'exactly at tolerance matches (early)', taps: [0.82], errors: [-180, null, null, null], extra: 0 },
    { name: 'exactly at tolerance matches (late)', taps: [1.18], errors: [180, null, null, null], extra: 0 },
    { name: 'just beyond tolerance is extra', taps: [1.19], errors: [null, null, null, null], extra: 1 },
  ];
  it.each(table)('$name', ({ taps, errors, extra }) => {
    const r = matchTaps(expected, taps, 180);
    expect(r.errorsMs).toHaveLength(errors.length);
    r.errorsMs.forEach((e, i) => (errors[i] === null ? expect(e).toBeNull() : close(e, errors[i] as number)));
    expect(r.extraTaps).toBe(extra);
  });

  it('uses each tap once: a tap between two close onsets goes to the earlier onset', () => {
    const r = matchTaps([1, 1.2], [1.1], 180);
    close(r.errorsMs[0], 100);
    expect(r.errorsMs[1]).toBeNull();
    expect(r.extraTaps).toBe(0);
  });

  it('chooses the nearest of several taps within tolerance', () => {
    const r = matchTaps([1], [0.9, 1.02, 1.1], 180);
    close(r.errorsMs[0], 20);
    expect(r.extraTaps).toBe(2);
  });

  it('handles empty expected', () => {
    expect(matchTaps([], [1, 2], 180)).toEqual({ errorsMs: [], extraTaps: 2 });
  });
});

describe('accuracy', () => {
  const table: { name: string; errors: (number | null)[]; extra: number; want: number }[] = [
    { name: 'all perfect', errors: [0, 10, -60, 60], extra: 0, want: 1 },
    { name: 'at tolerance scores 0', errors: [180, -180], extra: 0, want: 0 },
    { name: 'halfway between windows scores 0.5', errors: [120], extra: 0, want: 0.5 },
    { name: 'missed scores 0', errors: [0, null], extra: 0, want: 0.5 },
    { name: 'extra tap penalty 0.5 of one onset', errors: [0, 0], extra: 1, want: 0.75 },
    { name: 'clamped at 0', errors: [null, 0], extra: 10, want: 0 },
    { name: 'clamped at 1 cannot exceed', errors: [0], extra: 0, want: 1 },
    { name: 'no onsets, no taps', errors: [], extra: 0, want: 1 },
    { name: 'no onsets, taps', errors: [], extra: 2, want: 0 },
  ];
  it.each(table)('$name', ({ errors, extra, want }) => {
    close(accuracy(errors, extra), want);
  });

  it('accepts custom windows and penalty', () => {
    close(accuracy([50], 0, { perfectMs: 20, toleranceMs: 80 }), 0.5);
    close(accuracy([0, 0], 2, { extraPenalty: 0.25 }), 0.75);
  });
});

describe('scoreTaps and latency', () => {
  it('scores a mixed performance end to end', () => {
    const r = scoreTaps([1, 2, 3], [1.03, 2.12, 5]);
    close(r.errorsMs[0], 30);
    close(r.errorsMs[1], 120);
    expect(r.errorsMs[2]).toBeNull();
    expect(r.extraTaps).toBe(1);
    close(r.accuracy, (1 + 0.5 - 0.5) / 3);
  });

  it('latency offset is subtracted from tap times', () => {
    const raw = [1.15, 2.15];
    const without = scoreTaps([1, 2], raw);
    const withOffset = scoreTaps([1, 2], applyLatency(raw, 150));
    expect(without.accuracy).toBeLessThan(0.3);
    close(withOffset.errorsMs[0], 0);
    close(withOffset.accuracy, 1);
  });
});

describe('judge', () => {
  it.each([
    [null, 'missed'],
    [0, 'on-time'],
    [60, 'on-time'],
    [-60, 'on-time'],
    [61, 'late'],
    [-61, 'early'],
  ] as const)('%s -> %s', (e, want) => expect(judge(e)).toBe(want));
});

describe('calibration', () => {
  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('uses the last 6 errors only', () => {
    expect(calibrationOffset([900, -900, 100, 110, 120, 130, 140, 150])).toBe(125);
  });

  it('is robust to an outlier', () => {
    expect(calibrationOffset([null, null, 100, 100, 100, 100, 100, 250])).toBe(100);
  });

  it('clamps to -50..300', () => {
    expect(calibrationOffset([400, 400, 400, 400, 400, 400])).toBe(300);
    expect(calibrationOffset([-200, -200, -200, -200, -200, -200])).toBe(-50);
  });

  it('returns null when too few clicks were hit', () => {
    expect(calibrationOffset([100, 100, 100, 100, null, null, null, null])).toBeNull();
  });
});
