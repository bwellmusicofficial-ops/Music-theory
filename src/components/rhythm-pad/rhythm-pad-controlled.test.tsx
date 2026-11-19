import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import { createPadClock } from './pad-clock';
import { RhythmPad } from './rhythm-pad';
import type { RhythmPadHandle, TapResult } from './types';

const fake = vi.hoisted(() => ({
  clock: 0,
  unlock: vi.fn(),
  load: vi.fn(async () => {}),
  stop: vi.fn(),
  stopAt: vi.fn(),
  startMetronome: vi.fn(),
  playUi: vi.fn(),
}));
vi.mock('@/audio', () => ({
  getAudioEngine: () => ({
    now: () => fake.clock,
    unlock: fake.unlock,
    load: fake.load,
    startMetronome: fake.startMetronome,
    playUi: fake.playUi,
  }),
}));

const note = (value: NoteValue): ScoreEvent => ({
  kind: 'note',
  pitches: [{ letter: 'C', accidental: 0, octave: 4 }],
  duration: { value, dots: 0 },
});
const crotchets = (n: number): Bar => ({ events: Array.from({ length: n }, () => note('crotchet')) });
const T44 = { beats: 4, beatUnit: 4 as const };
const T34 = { beats: 3, beatUnit: 4 as const };
const bars44: Bar[] = [crotchets(4)];

function advanceTo(seconds: number) {
  while (fake.clock < seconds - 1e-9) {
    const step = Math.min(0.02, seconds - fake.clock);
    fake.clock += step;
    act(() => {
      vi.advanceTimersByTime(step * 1000);
    });
  }
}
const tapAt = (seconds: number) => {
  advanceTo(seconds);
  fireEvent.pointerDown(screen.getByTestId('tap-target'));
};
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  vi.useFakeTimers();
  fake.clock = 0;
  fake.unlock.mockReset().mockResolvedValue(undefined);
  fake.load.mockClear();
  fake.stop.mockClear();
  fake.stopAt.mockClear();
  fake.playUi.mockClear();
  fake.startMetronome.mockReset().mockImplementation((_t: unknown, _b: unknown, _cb: unknown, o?: { startAt?: number }) => ({
    stop: fake.stop,
    stopAt: fake.stopAt,
    startTime: o?.startAt ?? fake.clock + 0.1,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a parent starting the pad', () => {
  it('start() through a ref begins the count-in exactly as the Start button does', async () => {
    const ref = createRef<RhythmPadHandle>();
    render(<RhythmPad ref={ref} chrome="minimal" bars={bars44} time={T44} bpm={120} onComplete={vi.fn()} />);
    expect(fake.startMetronome).not.toHaveBeenCalled();
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'idle');
    await act(async () => {
      await ref.current!.start();
    });
    expect(fake.unlock).toHaveBeenCalledOnce();
    expect(fake.load).toHaveBeenCalledOnce();
    expect(fake.startMetronome).toHaveBeenCalledWith(T44, 120);
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'count-in');
    // A second start() while running does nothing.
    await act(async () => {
      await ref.current!.start();
    });
    expect(fake.startMetronome).toHaveBeenCalledOnce();
  });

  it('autoStart begins on mount, once, even under StrictMode, and not before the pad exists', async () => {
    render(
      <StrictMode>
        <RhythmPad autoStart chrome="minimal" bars={bars44} time={T44} bpm={120} onComplete={vi.fn()} />
      </StrictMode>,
    );
    await flush();
    expect(fake.startMetronome).toHaveBeenCalledOnce();
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'count-in');
  });

  it('a device that cannot start sound shows the error and starts no click', async () => {
    fake.unlock.mockRejectedValue(new Error('blocked'));
    render(<RhythmPad autoStart chrome="minimal" bars={bars44} time={T44} bpm={120} onComplete={vi.fn()} />);
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Sound could not be started');
    expect(fake.startMetronome).not.toHaveBeenCalled();
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'idle');
  });

  it('stop() ends a performance early, silently: no onComplete, and the pad can be started again', async () => {
    const ref = createRef<RhythmPadHandle>();
    const onComplete = vi.fn<(r: TapResult) => void>();
    render(<RhythmPad ref={ref} chrome="minimal" bars={bars44} time={T44} bpm={120} onComplete={onComplete} />);
    await act(async () => {
      await ref.current!.start();
    });
    advanceTo(1);
    act(() => ref.current!.stop());
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'idle');
    expect(fake.stop).toHaveBeenCalled();
    advanceTo(10);
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => {
      await ref.current!.start();
    });
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'count-in');
    // stop() when idle or done is harmless.
    act(() => ref.current!.stop());
    act(() => ref.current!.stop());
  });
});

describe('chrome', () => {
  it('minimal shows no Start button, no Try again and no result block, but keeps the tap surface, the tally and the announcements', async () => {
    const ref = createRef<RhythmPadHandle>();
    const onComplete = vi.fn<(r: TapResult) => void>();
    render(<RhythmPad ref={ref} chrome="minimal" tapSize="large" bars={bars44} time={T44} bpm={120} onComplete={onComplete} />);
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    await act(async () => {
      await ref.current!.start();
    });
    expect(screen.getByTestId('tap-target')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) tapAt(0.1 + 4 * 0.5 + i * 0.5);
    expect(screen.getByTestId('tally')).toHaveTextContent('4 of 4 hit');
    advanceTo(0.1 + 4 * 0.5 + 2 + 0.5 + 0.05);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'done');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('result')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual(['tap-target']);
    expect(screen.getByTestId('live-region')).toHaveTextContent('Accuracy 100 percent');
    // The parent can still run it again.
    await act(async () => {
      await ref.current!.start();
    });
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'count-in');
  });

  it('full (the default) is unchanged: Start, Try again and the result are the pad\'s own', async () => {
    render(<RhythmPad bars={bars44} time={T44} bpm={120} onComplete={vi.fn()} />);
    expect(screen.getByRole('region')).toHaveAttribute('data-chrome', 'full');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    advanceTo(0.1 + 4 * 0.5 + 2 + 0.5 + 0.05);
    expect(screen.getByTestId('result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('a shared clock across consecutive rhythms', () => {
  /** One pad run to the end on `clock`, tapping at `onsetsFrom(lineOfCountIn)`. Returns its result and count-in line. */
  async function perform(opts: {
    clock: ReturnType<typeof createPadClock>;
    bars: Bar[];
    time: typeof T44;
    bpm: number;
    key: string;
  }) {
    const onComplete = vi.fn<(r: TapResult) => void>();
    const view = render(
      <RhythmPad key={opts.key} autoStart chrome="minimal" clock={opts.clock} bars={opts.bars} time={opts.time} bpm={opts.bpm} onComplete={onComplete} />,
    );
    await flush();
    return { onComplete, view };
  }
  const barsLength = (bars: Bar[]) => bars.length;

  it('two rhythms in a row: one click, and the second one\'s onsets are exact positions on the first one\'s bar grid', async () => {
    const clock = createPadClock();
    const spb = 0.5;
    const bar = 4 * spb;

    const first = await perform({ clock, bars: bars44, time: T44, bpm: 120, key: 'a' });
    expect(fake.startMetronome).toHaveBeenCalledTimes(1);
    const grid = fake.clock + 0.1; // the first click: bar line 0
    // The count-in starts on that click; the onsets follow one bar later.
    for (let i = 0; i < 4; i++) tapAt(grid + bar + i * spb);
    advanceTo(grid + bar + 2 + spb + 0.05);
    expect(first.onComplete).toHaveBeenCalledOnce();
    first.onComplete.mock.calls[0]![0].errorsMs.forEach((e) => expect(Math.abs(e as number)).toBeLessThan(1e-6));
    // The pad did not stop the click that the parent owns.
    expect(fake.stop).not.toHaveBeenCalled();
    first.view.unmount();
    expect(fake.stop).not.toHaveBeenCalled();

    // Time passes (feedback), then the next rhythm is mounted at an awkward moment.
    advanceTo(grid + 3 * bar + 0.37);
    const mountedAt = fake.clock;
    const second = await perform({ clock, bars: bars44, time: T44, bpm: 120, key: 'b' });
    expect(fake.startMetronome).toHaveBeenCalledTimes(1); // still one click
    // Its count-in is the first bar line at least 0.15 s after it was mounted: grid + 4 bars.
    const countIn = grid + 4 * bar;
    expect(countIn).toBeGreaterThanOrEqual(mountedAt + 0.15);
    expect(countIn - bar).toBeLessThan(mountedAt + 0.15);
    // Not early: a tap at the count-in line's own onset positions is far from any onset (count-in taps are ignored).
    // On time: onsets are one bar after the count-in line, on beats of the same grid.
    for (let i = 0; i < 4; i++) tapAt(countIn + bar + i * spb);
    expect(screen.getByTestId('tally')).toHaveTextContent('4 of 4 hit');
    advanceTo(countIn + bar + 2 + spb + 0.05);
    const res = second.onComplete.mock.calls[0]![0];
    res.errorsMs.forEach((e) => expect(Math.abs(e as number)).toBeLessThan(1e-6));
    expect(res.accuracy).toBeCloseTo(1, 6);
    expect(barsLength(bars44)).toBe(1);
    // Every onset (grid-relative) is a whole number of beats, and the count-in a whole number of bars.
    expect((countIn - grid) / bar).toBeCloseTo(Math.round((countIn - grid) / bar), 9);
  });

  it('a tempo and metre change between rhythms hands over on a bar line: old click stops there, new one starts there, onsets are exact', async () => {
    const clock = createPadClock();
    const bar = 2; // 4/4 at 120
    const first = await perform({ clock, bars: bars44, time: T44, bpm: 120, key: 'a' });
    const grid = fake.clock + 0.1;
    for (let i = 0; i < 4; i++) tapAt(grid + bar + i * 0.5);
    advanceTo(grid + bar + 2.5 + 0.05);
    expect(first.onComplete).toHaveBeenCalledOnce();
    first.view.unmount();

    advanceTo(grid + 3 * bar + 0.8);
    const now = fake.clock;
    // Next: 3/4 at 90 bpm (2/3 s a beat).
    const bars34: Bar[] = [crotchets(3)];
    const second = await perform({ clock, bars: bars34, time: T34, bpm: 90, key: 'b' });
    // The hand-over bar line: first old bar line at least 0.4 s after now.
    const handover = grid + Math.ceil((now + 0.4 - grid) / bar - 1e-9) * bar;
    expect(fake.stopAt).toHaveBeenCalledOnce();
    expect(fake.stopAt.mock.calls[0]![0]).toBeCloseTo(handover, 9);
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
    expect(fake.startMetronome.mock.calls[1]).toEqual([T34, 90, undefined, { startAt: expect.closeTo(handover, 9) }]);
    expect((handover - grid) / bar).toBeCloseTo(Math.round((handover - grid) / bar), 9);
    // Count-in is one 3/4 bar from the hand-over; onsets follow on the new beat length.
    const spb = 60 / 90;
    for (let i = 0; i < 3; i++) tapAt(handover + 3 * spb + i * spb);
    advanceTo(handover + 3 * spb + 3 * spb + spb + 0.05);
    const res = second.onComplete.mock.calls[0]![0];
    expect(res.errorsMs).toHaveLength(3);
    res.errorsMs.forEach((e) => expect(Math.abs(e as number)).toBeLessThan(1e-6));
  });

  it('the pad ignores `metronome={false}` under a clock (the parent decides when the click stops)', async () => {
    const clock = createPadClock();
    render(<RhythmPad autoStart chrome="minimal" clock={clock} metronome={false} bars={bars44} time={T44} bpm={120} onComplete={vi.fn()} />);
    await flush();
    advanceTo(0.1 + 4 * 0.5 + 1);
    expect(fake.stop).not.toHaveBeenCalled();
  });
});
