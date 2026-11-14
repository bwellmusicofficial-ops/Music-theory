import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LatencyCalibration } from './latency-calibration';

const fake = vi.hoisted(() => ({
  clock: 0,
  stop: vi.fn(),
  startMetronome: vi.fn(),
}));

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({
    now: () => fake.clock,
    unlock: async () => {},
    load: async () => {},
    startMetronome: fake.startMetronome,
    playUi: vi.fn(),
  }),
}));

const SPB = 60 / 80;
const START = 0.1;
const click = (i: number) => START + i * SPB;

function advanceTo(seconds: number) {
  while (fake.clock < seconds - 1e-9) {
    const step = Math.min(0.02, seconds - fake.clock);
    fake.clock += step;
    act(() => {
      vi.advanceTimersByTime(step * 1000);
    });
  }
}
const tapAt = (s: number) => {
  advanceTo(s);
  fireEvent.pointerDown(screen.getByTestId('tap-target'));
};

beforeEach(() => {
  vi.useFakeTimers();
  fake.clock = 0;
  fake.stop.mockClear();
  fake.startMetronome.mockReset().mockImplementation(() => ({ stop: fake.stop }));
});
afterEach(() => vi.useRealTimers());

async function begin(onCalibrated = vi.fn()) {
  render(<LatencyCalibration onCalibrated={onCalibrated} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start calibration' }));
  });
  return onCalibrated;
}

describe('LatencyCalibration', () => {
  it('reports the median error of the last 6 taps', async () => {
    const onCalibrated = await begin();
    // Errors in ms for clicks 0..7; the first two are wild and must be ignored.
    const errors = [-250, 250, 100, 110, 120, 130, 140, 150];
    errors.forEach((e, i) => tapAt(click(i) + e / 1000));
    advanceTo(click(7) + SPB + 0.05);
    expect(onCalibrated).toHaveBeenCalledOnce();
    expect(onCalibrated).toHaveBeenCalledWith(125);
    expect(screen.getByTestId('calibration-result')).toHaveTextContent('125 ms');
  });

  it('ends one beat after the eighth click and stops the metronome', async () => {
    const onCalibrated = await begin();
    for (let i = 0; i < 8; i++) tapAt(click(i) + 0.05);
    advanceTo(click(7) + SPB - 0.1);
    expect(onCalibrated).not.toHaveBeenCalled();
    advanceTo(click(7) + SPB + 0.05);
    expect(onCalibrated).toHaveBeenCalledWith(50);
    expect(fake.stop).toHaveBeenCalled();
  });

  it('clamps to the maximum of 300 ms', async () => {
    const onCalibrated = await begin();
    for (let i = 0; i < 8; i++) tapAt(click(i) + 0.35);
    advanceTo(click(7) + SPB + 0.05);
    expect(onCalibrated).toHaveBeenCalledWith(300);
  });

  it('clamps to the minimum of -50 ms', async () => {
    const onCalibrated = await begin();
    for (let i = 0; i < 8; i++) tapAt(click(i) - 0.2);
    advanceTo(click(7) + SPB + 0.05);
    expect(onCalibrated).toHaveBeenCalledWith(-50);
  });

  it('asks to try again, without calling back, when too few taps were heard', async () => {
    const onCalibrated = await begin();
    tapAt(click(6));
    advanceTo(click(7) + SPB + 0.05);
    expect(onCalibrated).not.toHaveBeenCalled();
    expect(screen.getByTestId('calibration-failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keyboard taps work and auto-repeat is ignored', async () => {
    const onCalibrated = await begin();
    const target = screen.getByTestId('tap-target');
    for (let i = 0; i < 8; i++) {
      advanceTo(click(i) + 0.08);
      fireEvent.keyDown(target, { key: ' ' });
      fireEvent.keyDown(target, { key: ' ', repeat: true });
    }
    advanceTo(click(7) + SPB + 0.05);
    expect(onCalibrated).toHaveBeenCalledWith(80);
  });
});
