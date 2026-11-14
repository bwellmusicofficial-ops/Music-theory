import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import { RhythmPad } from './rhythm-pad';
import type { TapResult } from './types';

const fake = vi.hoisted(() => ({
  clock: 0,
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  stop: vi.fn(),
  startMetronome: vi.fn(),
  playUi: vi.fn(),
  loadFails: false,
}));

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({
    now: () => fake.clock,
    unlock: fake.unlock,
    load: () => (fake.loadFails ? Promise.reject(new Error('x')) : fake.load()),
    startMetronome: fake.startMetronome,
    playUi: fake.playUi,
  }),
}));

const note = (value: NoteValue): ScoreEvent => ({
  kind: 'note',
  pitches: [{ letter: 'C', accidental: 0, octave: 4 }],
  duration: { value, dots: 0 },
});
// 4/4, 120 bpm -> 0.5 s per beat. Four crotchets: onsets at beats 0..3.
const bars: Bar[] = [{ events: [note('crotchet'), note('crotchet'), note('crotchet'), note('crotchet')] }];
const TIME = { beats: 4, beatUnit: 4 as const };
const SPB = 0.5;
const START = 0.1; // metronome start = now (0) + engine lead
const ONSET = (i: number) => START + 4 * SPB + i * SPB; // after a one-bar count-in

/** Advances the audio clock and the interval timers together, in small steps. */
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
async function clickStart(name = 'Start') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fake.clock = 0;
  fake.loadFails = false;
  fake.stop.mockClear();
  fake.unlock.mockClear();
  fake.playUi.mockClear();
  fake.startMetronome.mockReset().mockImplementation(() => ({ stop: fake.stop }));
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(props: Partial<React.ComponentProps<typeof RhythmPad>> = {}) {
  const onComplete = vi.fn<(r: TapResult) => void>();
  render(<RhythmPad bars={bars} time={TIME} bpm={120} onComplete={onComplete} {...props} />);
  return onComplete;
}

describe('RhythmPad perform mode', () => {
  it('unlocks and loads audio from the Start gesture, then starts the metronome', async () => {
    setup();
    await clickStart();
    expect(fake.unlock).toHaveBeenCalledOnce();
    expect(fake.load).toHaveBeenCalledOnce();
    expect(fake.startMetronome).toHaveBeenCalledWith(TIME, 120);
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'count-in');
    expect(screen.getByTestId('live-region')).toHaveTextContent('Count-in');
  });

  it('runs start to onComplete with perfect taps, auto-ending one beat after the last bar', async () => {
    const onComplete = setup();
    await clickStart();
    advanceTo(ONSET(0) - 0.3);
    expect(onComplete).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) tapAt(ONSET(i));
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'playing');
    // Last bar ends at ONSET(0) + 2.0; completes one beat later.
    advanceTo(ONSET(0) + 2.0 + SPB - 0.05);
    expect(onComplete).not.toHaveBeenCalled();
    advanceTo(ONSET(0) + 2.0 + SPB + 0.05);
    expect(onComplete).toHaveBeenCalledOnce();
    const r = onComplete.mock.calls[0][0];
    expect(r.errorsMs).toHaveLength(4);
    r.errorsMs.forEach((e) => expect(Math.abs(e as number)).toBeLessThan(1e-6));
    expect(r.extraTaps).toBe(0);
    expect(r.accuracy).toBeCloseTo(1, 6);
    expect(fake.stop).toHaveBeenCalled();
    expect(screen.getByTestId('live-region')).toHaveTextContent('Accuracy 100 percent');
  });

  it('reports early, late, missed and extra taps with text labels', async () => {
    const onComplete = setup();
    await clickStart();
    tapAt(ONSET(0) - 0.1); // early
    tapAt(ONSET(1) + 0.12); // late
    // onset 2 missed
    tapAt(ONSET(3)); // on time
    tapAt(ONSET(3) + 0.4); // extra
    advanceTo(ONSET(0) + 3);
    const r = onComplete.mock.calls[0][0];
    expect(r.errorsMs[0]).toBeCloseTo(-100, 3);
    expect(r.errorsMs[1]).toBeCloseTo(120, 3);
    expect(r.errorsMs[2]).toBeNull();
    expect(r.errorsMs[3]).toBeCloseTo(0, 3);
    expect(r.extraTaps).toBe(1);
    const items = screen.getByTestId('feedback-row').querySelectorAll('li');
    expect([...items].map((li) => li.getAttribute('data-kind'))).toEqual(['early', 'late', 'missed', 'on-time']);
    expect(items[0]).toHaveTextContent('Early');
    expect(items[1]).toHaveTextContent('Late');
    expect(items[2]).toHaveTextContent('Missed');
    expect(items[3]).toHaveTextContent('On time');
    expect(screen.getByText('Extra taps: 1')).toBeInTheDocument();
  });

  it('subtracts latencyOffsetMs before scoring', async () => {
    const onComplete = setup({ latencyOffsetMs: 100 });
    await clickStart();
    for (let i = 0; i < 4; i++) tapAt(ONSET(i) + 0.1);
    advanceTo(ONSET(0) + 3);
    const r = onComplete.mock.calls[0][0];
    r.errorsMs.forEach((e) => expect(Math.abs(e as number)).toBeLessThan(1e-3));
    expect(r.accuracy).toBeCloseTo(1, 6);
  });

  it('ignores taps made well before the first onset (during count-in)', async () => {
    const onComplete = setup();
    await clickStart();
    tapAt(START + 0.5);
    tapAt(START + 1.0);
    for (let i = 0; i < 4; i++) tapAt(ONSET(i));
    advanceTo(ONSET(0) + 3);
    expect(onComplete.mock.calls[0][0].extraTaps).toBe(0);
  });

  it('ignores taps before Start and after completion', async () => {
    setup();
    fireEvent.pointerDown(screen.getByTestId('tap-target'));
    expect(fake.playUi).not.toHaveBeenCalled();
    expect(screen.getByTestId('tap-target')).toHaveAttribute('aria-disabled', 'true');
  });

  it('each tap plays the tap sound and pulses', async () => {
    setup();
    await clickStart();
    tapAt(1);
    expect(fake.playUi).toHaveBeenCalledWith('tap');
    expect(screen.getByTestId('tap-target')).toHaveAttribute('data-pulsing', 'true');
    advanceTo(1.3);
    expect(screen.getByTestId('tap-target')).toHaveAttribute('data-pulsing', 'false');
  });

  it('taps with Space and Enter, and ignores key auto-repeat', async () => {
    const onComplete = setup({ countInBars: 0 });
    await clickStart();
    const target = screen.getByTestId('tap-target');
    const t0 = START;
    advanceTo(t0);
    fireEvent.keyDown(target, { key: ' ' });
    fireEvent.keyDown(target, { key: ' ', repeat: true });
    fireEvent.keyDown(target, { key: ' ', repeat: true });
    expect(fake.playUi).toHaveBeenCalledTimes(1);
    advanceTo(t0 + SPB);
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(fake.playUi).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(target, { key: 'a' });
    expect(fake.playUi).toHaveBeenCalledTimes(2);
    advanceTo(t0 + 4 * SPB + SPB + 0.05);
    const r = onComplete.mock.calls[0][0];
    expect(r.errorsMs[0]).toBeCloseTo(0, 3);
    expect(r.errorsMs[1]).toBeCloseTo(0, 3);
    expect(r.extraTaps).toBe(0);
  });

  it('does not use click for timing', async () => {
    setup();
    await clickStart();
    advanceTo(1);
    fireEvent.click(screen.getByTestId('tap-target'));
    expect(fake.playUi).not.toHaveBeenCalled();
  });

  it('metronome={false} stops the click after the count-in but keeps scoring', async () => {
    const onComplete = setup({ metronome: false });
    await clickStart();
    advanceTo(START + 4 * SPB - 0.35);
    expect(fake.stop).not.toHaveBeenCalled();
    advanceTo(START + 4 * SPB - 0.2);
    expect(fake.stop).toHaveBeenCalledOnce();
    for (let i = 0; i < 4; i++) tapAt(ONSET(i));
    advanceTo(ONSET(0) + 3);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0][0].accuracy).toBeCloseTo(1, 6);
    expect(fake.stop).toHaveBeenCalledOnce();
  });

  it('metronome defaults to continuing through the performance', async () => {
    setup();
    await clickStart();
    advanceTo(ONSET(0) + 1);
    expect(fake.stop).not.toHaveBeenCalled();
  });

  it('shows the beat indicator accenting beat 1 and the count-in label', async () => {
    setup();
    await clickStart();
    const dots = () => [...screen.getByTestId('beat-indicator').querySelectorAll('li')];
    expect(dots().map((d) => d.textContent)).toEqual(['1', '2', '3', '4']);
    expect(dots()[0]).toHaveAttribute('data-accent', 'true');
    advanceTo(START + SPB * 1.2);
    expect(dots()[1]).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('status-text')).toHaveTextContent('Count-in');
  });

  it('offers Try again, which restarts and clears the result', async () => {
    const onComplete = setup();
    await clickStart();
    advanceTo(ONSET(0) + 3);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(screen.getByTestId('result')).toBeInTheDocument();
    await clickStart('Try again');
    expect(screen.queryByTestId('result')).not.toBeInTheDocument();
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region')).toHaveAttribute('data-phase', 'count-in');
  });

  it('renders children above the tap target and stops the metronome on unmount', async () => {
    const onComplete = vi.fn();
    const { unmount } = render(
      <RhythmPad bars={bars} time={TIME} bpm={120} onComplete={onComplete}>
        <div data-testid="notation" />
      </RhythmPad>,
    );
    const notation = screen.getByTestId('notation');
    const target = screen.getByTestId('tap-target');
    expect(notation.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await clickStart();
    unmount();
    expect(fake.stop).toHaveBeenCalled();
    advanceTo(10);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('continues if sample loading fails', async () => {
    fake.loadFails = true;
    setup();
    await clickStart();
    expect(fake.startMetronome).toHaveBeenCalled();
  });

  it('has accessible names and a polite live region', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Tap the rhythm' })).toBeInTheDocument();
    expect(screen.getByTestId('live-region')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('RhythmPad free mode', () => {
  it('runs the metronome, makes sound on taps, reports counts and gives no result', async () => {
    const onComplete = vi.fn();
    const onTap = vi.fn();
    render(<RhythmPad bars={bars} time={TIME} bpm={120} mode="free" onComplete={onComplete} onTap={onTap} />);
    await clickStart();
    expect(fake.startMetronome).toHaveBeenCalledWith(TIME, 120);
    tapAt(1);
    tapAt(1.2);
    tapAt(1.3);
    expect(onTap.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(fake.playUi).toHaveBeenCalledTimes(3);
    advanceTo(60);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('result')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(fake.stop).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
