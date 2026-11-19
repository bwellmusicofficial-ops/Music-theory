import { beforeEach, describe, expect, it, vi } from 'vitest';
import { barLineAtOrAfter, CLOCK_CLAIM_LEAD_S, CLOCK_HANDOVER_LEAD_S, createPadClock } from './pad-clock';

const fake = vi.hoisted(() => ({
  clock: 0,
  startMetronome: vi.fn(),
  stops: [] as { stop: ReturnType<typeof vi.fn>; stopAt: ReturnType<typeof vi.fn> }[],
}));
vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ now: () => fake.clock, startMetronome: fake.startMetronome }),
}));

const T44 = { beats: 4, beatUnit: 4 as const };
const T34 = { beats: 3, beatUnit: 4 as const };

beforeEach(() => {
  fake.clock = 0;
  fake.stops = [];
  fake.startMetronome.mockReset().mockImplementation((_t: unknown, _b: unknown, _cb: unknown, o?: { startAt?: number }) => {
    const handle = { stop: vi.fn(), stopAt: vi.fn(), startTime: o?.startAt ?? fake.clock + 0.1 };
    fake.stops.push(handle);
    return handle;
  });
});

describe('barLineAtOrAfter', () => {
  it('returns the first bar line at or after a time, and a time exactly on a bar line is that bar line', () => {
    // Bar lines at 0.1, 2.1, 4.1 ... (two-second bars).
    expect(barLineAtOrAfter(0.1, 2, 0)).toBe(0.1);
    expect(barLineAtOrAfter(0.1, 2, 0.1)).toBe(0.1);
    expect(barLineAtOrAfter(0.1, 2, 0.1000001)).toBeCloseTo(2.1, 9);
    expect(barLineAtOrAfter(0.1, 2, 2.1)).toBeCloseTo(2.1, 9);
    expect(barLineAtOrAfter(0.1, 2, 5)).toBeCloseTo(6.1, 9);
  });
});

describe('createPadClock', () => {
  it('the first claim starts the click and the performance starts on its first click', () => {
    const c = createPadClock();
    expect(c.nextBarLine(0)).toBeNull();
    expect(c.claimBarLine(T44, 120)).toBeCloseTo(0.1, 9);
    expect(fake.startMetronome).toHaveBeenCalledTimes(1);
    expect(fake.startMetronome).toHaveBeenCalledWith(T44, 120, undefined, undefined);
  });

  it('later claims at the same tempo start no new click and land on bar lines of the first one', () => {
    const c = createPadClock();
    const start = c.claimBarLine(T44, 120);
    for (const now of [2.0, 3.3, 3.95, 4.0, 9.77]) {
      fake.clock = now;
      const line = c.claimBarLine(T44, 120);
      const bars = (line - start) / 2;
      expect(Number.isInteger(Math.round(bars * 1e6) / 1e6)).toBe(true);
      expect(line).toBeGreaterThanOrEqual(now + CLOCK_CLAIM_LEAD_S - 1e-9);
      // The first bar line that late, not a later one.
      expect(line - 2).toBeLessThan(now + CLOCK_CLAIM_LEAD_S);
    }
    expect(fake.startMetronome).toHaveBeenCalledTimes(1);
    expect(fake.stops[0]!.stop).not.toHaveBeenCalled();
    expect(fake.stops[0]!.stopAt).not.toHaveBeenCalled();
  });

  it('a new tempo hands over on a bar line of the old click: old click told to stop there, new one starts there', () => {
    const c = createPadClock();
    const start = c.claimBarLine(T44, 120); // 0.1, two-second bars
    fake.clock = 3.3;
    const at = c.claimBarLine(T44, 60);
    // First old bar line at least 0.4 s ahead: 4.1.
    expect(at).toBeCloseTo(4.1, 9);
    expect((at - start) / 2).toBeCloseTo(2, 9);
    expect(at).toBeGreaterThanOrEqual(fake.clock + CLOCK_HANDOVER_LEAD_S);
    expect(fake.stops[0]!.stopAt).toHaveBeenCalledWith(at);
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
    expect(fake.startMetronome).toHaveBeenLastCalledWith(T44, 60, undefined, { startAt: at });
    // And now the click is the new one, with four-second bars from there.
    fake.clock = 5;
    expect(c.nextBarLine(5)).toBeCloseTo(at + 4, 9);
    expect(c.claimBarLine(T44, 60)).toBeCloseTo(at + 4, 9);
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
  });

  it('a hand-over close to a bar line takes the next one, so the old click can still be stopped in time', () => {
    const c = createPadClock();
    c.claimBarLine(T44, 120); // bar lines 0.1, 2.1, ...
    fake.clock = 1.8; // 2.1 is only 0.3 s away: too late to stop the old click before it
    expect(c.claimBarLine(T34, 120)).toBeCloseTo(4.1, 9);
  });

  it('a new time signature at the same tempo is a hand-over too (bars have a new length)', () => {
    const c = createPadClock();
    c.claimBarLine(T44, 120);
    fake.clock = 0.5;
    const at = c.claimBarLine(T34, 120);
    expect(at).toBeCloseTo(2.1, 9);
    expect(c.nextBarLine(2.2)).toBeCloseTo(2.1 + 1.5, 9);
  });

  it('stop stops the click, forgets it, and the next claim starts afresh', () => {
    const c = createPadClock();
    c.claimBarLine(T44, 120);
    c.stop();
    c.stop();
    expect(fake.stops[0]!.stop).toHaveBeenCalledTimes(1);
    expect(c.nextBarLine(0)).toBeNull();
    fake.clock = 7;
    expect(c.claimBarLine(T44, 120)).toBeCloseTo(7.1, 9);
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
  });
});
