import { describe, expect, it } from 'vitest';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import {
  accuracy,
  applyLatency,
  calibrationOffset,
  createTapMatcher,
  expectedOnsets,
  judge,
  matchTaps,
  median,
  scoreTaps,
  verdictOf,
  resultOf,
  type MatcherOptions,
} from './scoring';
import type { OnsetJudgement } from './types';

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

  it('pairs a tap with the onset at once: the first tap within tolerance wins, later ones are extra', () => {
    // The live pad judges each tap as it happens, and the final result is the same matcher's state.
    const r = matchTaps([1], [0.9, 1.02, 1.1], 180);
    close(r.errorsMs[0], -100);
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

describe('verdictOf', () => {
  const table: [number | null, string][] = [
    [null, 'miss'],
    [0, 'perfect'],
    [-60, 'perfect'],
    [60, 'perfect'],
    [60.5, 'close'],
    [-100, 'close'],
    [180, 'close'],
    [180.5, 'miss'],
    [-250, 'miss'],
  ];
  it.each(table)('%s ms is %s', (e, want) => {
    expect(verdictOf(e, { perfectMs: 60, toleranceMs: 180 })).toBe(want);
  });
  it('uses 60 and 180 by default', () => {
    expect(verdictOf(60)).toBe('perfect');
    expect(verdictOf(61)).toBe('close');
    expect(verdictOf(181)).toBe('miss');
  });
});

describe('createTapMatcher', () => {
  const expected = [1, 2, 3, 4];

  it('judges a tap at once with the nearest unjudged onset, signed', () => {
    const m = createTapMatcher(expected);
    const out = m.tap(2.1);
    expect(out.kind).toBe('matched');
    if (out.kind === 'matched') {
      expect(out.judgement.index).toBe(1);
      expect(out.judgement.verdict).toBe('close');
      close(out.judgement.errorMs, 100);
    }
  });

  it('an onset is judged once: a second tap near it goes to the next onset or is extra', () => {
    const m = createTapMatcher(expected);
    m.tap(1);
    expect(m.tap(1.05)).toEqual({ kind: 'extra' });
    expect(m.snapshot().extraTaps).toBe(1);
  });

  it('an exact tie goes to the earlier onset', () => {
    const m = createTapMatcher([1, 1.2]);
    const out = m.tap(1.1);
    expect(out.kind === 'matched' && out.judgement.index).toBe(0);
  });

  it('advance() misses an onset only once its whole window has passed', () => {
    const m = createTapMatcher(expected, { toleranceMs: 180 });
    expect(m.advance(1.18)).toEqual([]);
    expect(m.advance(1.19)).toEqual([{ index: 0, verdict: 'miss', errorMs: null }]);
    // Already judged: not reported again.
    expect(m.advance(1.5)).toEqual([]);
  });

  it('advance() reports several passed onsets in time order', () => {
    const m = createTapMatcher(expected);
    expect(m.advance(3.5).map((j) => j.index)).toEqual([0, 1, 2]);
  });

  it('a tap for an onset already declared missed cannot revive it', () => {
    const m = createTapMatcher([1, 5]);
    m.advance(1.5);
    expect(m.tap(1.1)).toEqual({ kind: 'extra' });
  });

  it('finish() misses everything left, and the snapshot is the final result', () => {
    const m = createTapMatcher(expected);
    m.tap(1.02);
    m.tap(3.15);
    const rest = m.finish();
    expect(rest.map((j) => j.index)).toEqual([1, 3]);
    const snap = m.snapshot();
    close(snap.errorsMs[0], 20);
    expect(snap.errorsMs[1]).toBeNull();
    expect(snap.errorsMs[2]).toBeCloseTo(150, 6);
    expect(snap.verdicts).toEqual(['perfect', 'miss', 'close', 'miss']);
  });

  it('a tap matched beyond toleranceMs (wider window) is a miss that still has its error', () => {
    const m = createTapMatcher([1], { perfectMs: 60, toleranceMs: 150, windowMs: 375 });
    const out = m.tap(1.25);
    expect(out.kind === 'matched' && out.judgement.verdict).toBe('miss');
    expect(out.kind === 'matched' && out.judgement.errorMs).toBeCloseTo(250, 6);
    expect(m.snapshot().errorsMs[0]).toBeCloseTo(250, 6);
  });

  it('no onsets: every tap is extra', () => {
    const m = createTapMatcher([]);
    m.tap(1);
    expect(m.snapshot()).toEqual({ errorsMs: [], extraTaps: 1, verdicts: [] });
  });

  it('resultOf adds the accuracy of the final errors', () => {
    const m = createTapMatcher([1, 2]);
    m.tap(1);
    m.finish();
    expect(resultOf(m)).toEqual({ errorsMs: [0, null], extraTaps: 0, accuracy: 0.5 });
  });
});

describe('live verdicts equal the final per-onset verdicts', () => {
  // Beat-spaced onsets at 1..6 s plus a quaver pair, so windows overlap in the last two.
  const expectedAll = [1, 2, 3, 4, 5, 5.25];
  const options: MatcherOptions = { perfectMs: 60, toleranceMs: 180 };
  const tables: { name: string; taps: number[] }[] = [
    { name: 'all perfect', taps: [1, 2, 3, 4, 5, 5.25] },
    { name: 'early and late', taps: [0.9, 2.12, 3, 4.17, 5.01, 5.3] },
    { name: 'no taps', taps: [] },
    { name: 'double taps', taps: [1, 1.04, 2, 2.1, 3, 4, 5, 5.25] },
    { name: 'far extras', taps: [0.2, 1, 1.5, 2, 2.6, 3, 4, 5.9, 6.5] },
    { name: 'one tap between the quavers', taps: [1, 2, 3, 4, 5.12] },
    { name: 'a tap late for both quavers', taps: [1, 2, 3, 4, 5.4] },
    { name: 'only the last', taps: [5.25] },
    { name: 'exactly on the tolerance edges', taps: [0.82, 2.18, 3.06, 3.94] },
  ];

  it.each(tables)('$name', ({ taps }) => {
    const m = createTapMatcher(expectedAll, options);
    const live = new Map<number, OnsetJudgement>();
    const note = (j: OnsetJudgement) => {
      expect(live.has(j.index), `onset ${j.index} judged twice`).toBe(false);
      live.set(j.index, j);
    };
    // Interleave ticks and taps in time order, like the pad does.
    const events = [
      ...taps.map((t) => ({ at: t, tap: true })),
      ...Array.from({ length: 80 }, (_, k) => ({ at: k * 0.1, tap: false })),
    ].sort((a, b) => a.at - b.at || (a.tap ? -1 : 1));
    for (const e of events) {
      if (e.tap) {
        const out = m.tap(e.at);
        if (out.kind === 'matched') note(out.judgement);
      } else {
        m.advance(e.at).forEach(note);
      }
    }
    m.finish().forEach(note);

    const result = resultOf(m, options);
    expect(live.size).toBe(expectedAll.length);
    expectedAll.forEach((_, i) => {
      const j = live.get(i)!;
      expect(j.verdict).toBe(verdictOf(result.errorsMs[i], options));
      if (j.errorMs === null) expect(result.errorsMs[i]).toBeNull();
      else close(result.errorsMs[i], j.errorMs);
    });
    // The final result is also exactly what matchTaps / scoreTaps return for the same taps.
    const batch = scoreTaps(expectedAll, taps, options);
    expect(batch.extraTaps).toBe(result.extraTaps);
    batch.errorsMs.forEach((e, i) => (e === null ? expect(result.errorsMs[i]).toBeNull() : close(result.errorsMs[i], e)));
  });
});
