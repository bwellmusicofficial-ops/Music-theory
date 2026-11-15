import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import { RhythmPad } from './rhythm-pad';
import { verdictOf } from './scoring';
import type { OnsetJudgement, PadPhase, TapResult } from './types';

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
  fake.startMetronome.mockReset().mockImplementation(() => ({ stop: fake.stop, startTime: fake.clock + 0.1 }));
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

  it('showRetry={false} hides the pad\'s own Try again but still shows the result', async () => {
    render(<RhythmPad bars={bars} time={TIME} bpm={120} onComplete={vi.fn()} showRetry={false} />);
    await clickStart();
    advanceTo(ONSET(0) + 3);
    expect(screen.getByTestId('result')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
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

describe('RhythmPad live events (perform)', () => {
  function live() {
    const judged: OnsetJudgement[] = [];
    const extra = vi.fn();
    const due: number[] = [];
    const beats: [number, number][] = [];
    const phases: PadPhase[] = [];
    const onComplete = vi.fn<(r: TapResult) => void>();
    const props = {
      onOnsetJudged: (j: OnsetJudgement) => judged.push(j),
      onExtraTap: extra,
      onOnsetDue: (i: number) => due.push(i),
      onBeat: (b: number, bar: number) => beats.push([b, bar]),
      onPhase: (p: PadPhase) => phases.push(p),
    };
    render(<RhythmPad bars={bars} time={TIME} bpm={120} onComplete={onComplete} {...props} />);
    return { judged, extra, due, beats, phases, onComplete };
  }

  it('emits one verdict per onset as taps arrive, with signed errors', async () => {
    const { judged } = live();
    await clickStart();
    tapAt(ONSET(0)); // perfect
    expect(judged).toEqual([{ index: 0, verdict: 'perfect', errorMs: expect.closeTo(0, 3) }]);
    tapAt(ONSET(1) + 0.1); // close, late
    expect(judged[1]).toMatchObject({ index: 1, verdict: 'close' });
    expect(judged[1].errorMs).toBeCloseTo(100, 3);
    tapAt(ONSET(2) - 0.05); // perfect (within 60 ms), early
    expect(judged[2]).toMatchObject({ index: 2, verdict: 'perfect' });
    expect(judged[2].errorMs).toBeCloseTo(-50, 3);
  });

  it('emits a miss as soon as an untouched onset window has passed, not at the end', async () => {
    const { judged, onComplete } = live();
    await clickStart();
    tapAt(ONSET(0));
    advanceTo(ONSET(1) + 0.17);
    expect(judged.map((j) => j.index)).toEqual([0]);
    advanceTo(ONSET(1) + 0.2); // default window 180 ms has passed
    expect(judged.map((j) => [j.index, j.verdict, j.errorMs])).toEqual([
      [0, 'perfect', expect.closeTo(0, 3)],
      [1, 'miss', null],
    ]);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports a tap that matches nothing as extra, and not as a verdict', async () => {
    const { judged, extra } = live();
    await clickStart();
    tapAt(ONSET(0));
    tapAt(ONSET(0) + 0.3);
    expect(extra).toHaveBeenCalledTimes(1);
    expect(judged).toHaveLength(1);
  });

  it('judges the latency-corrected tap, like the final result', async () => {
    const judged: OnsetJudgement[] = [];
    render(
      <RhythmPad bars={bars} time={TIME} bpm={120} latencyOffsetMs={100} onComplete={() => {}} onOnsetJudged={(j) => judged.push(j)} />,
    );
    await clickStart();
    tapAt(ONSET(0) + 0.1); // reported 100 ms late by the device
    expect(judged[0].verdict).toBe('perfect');
    // The window of onset 1 is extended by the offset: not yet a miss at +190 ms.
    advanceTo(ONSET(1) + 0.2);
    expect(judged).toHaveLength(1);
    advanceTo(ONSET(1) + 0.3);
    expect(judged[1]).toMatchObject({ index: 1, verdict: 'miss' });
  });

  it('live verdicts always equal the final per-onset verdicts', async () => {
    const tables: { name: string; taps: number[] }[] = [
      { name: 'perfect', taps: [0, 1, 2, 3] },
      { name: 'late and early', taps: [0.1, 1 - 0.15, 2 + 0.17, 3] },
      { name: 'misses and extras', taps: [0, 0.04, 2.3, 3.4] },
      { name: 'nothing', taps: [] },
    ];
    for (const { taps } of tables) {
      fake.clock = 0;
      const { judged, onComplete } = live();
      await clickStart();
      for (const t of taps) tapAt(ONSET(0) + t * SPB);
      advanceTo(ONSET(0) + 4 * SPB + SPB + 0.1);
      const r = onComplete.mock.calls[0][0];
      expect(judged).toHaveLength(4);
      for (const j of judged) {
        expect(j.verdict).toBe(verdictOf(r.errorsMs[j.index]));
        expect(j.errorMs).toBe(r.errorsMs[j.index]);
      }
      document.body.innerHTML = '';
      cleanup();
    }
  });

  it('reports the phases: idle, count-in, playing, done', async () => {
    const { phases } = live();
    await clickStart();
    advanceTo(ONSET(0) + 4 * SPB + SPB + 0.1);
    expect(phases).toEqual(['idle', 'count-in', 'playing', 'done']);
  });

  it('reports each felt beat, negative bars during the count-in', async () => {
    const { beats } = live();
    await clickStart();
    advanceTo(START + 4 * SPB + 4 * SPB + 0.05);
    expect(beats.slice(0, 4)).toEqual([[0, -1], [1, -1], [2, -1], [3, -1]]);
    expect(beats.slice(4, 8)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it('reports each onset when it comes due, never in the count-in', async () => {
    const { due } = live();
    await clickStart();
    advanceTo(ONSET(0) - 0.05);
    expect(due).toEqual([]);
    advanceTo(ONSET(0) + 0.03);
    expect(due).toEqual([0]);
    advanceTo(ONSET(2) + 0.03);
    expect(due).toEqual([0, 1, 2]);
  });
});

describe('RhythmPad game feedback (perform)', () => {
  it('shows a running tally and a verdict word with a shape, and flashes the pad', async () => {
    setup();
    await clickStart();
    expect(screen.getByTestId('tally')).toHaveTextContent('0 of 4 hit');
    tapAt(ONSET(0));
    expect(screen.getByTestId('tally')).toHaveTextContent('1 of 4 hit');
    expect(screen.getByTestId('verdict-chip')).toHaveTextContent('Perfect');
    expect(screen.getByTestId('verdict-chip').querySelector('[data-verdict-icon="perfect"]')).toBeInTheDocument();
    expect(screen.getByTestId('tap-target')).toHaveAttribute('data-flash', 'perfect');
    tapAt(ONSET(1) + 0.1);
    expect(screen.getByTestId('verdict-chip')).toHaveTextContent('Close');
    expect(screen.getByTestId('tap-target')).toHaveAttribute('data-flash', 'close');
    expect(screen.getByTestId('tally')).toHaveTextContent('2 of 4 hit');
    tapAt(ONSET(1) + 0.25);
    expect(screen.getByTestId('verdict-chip')).toHaveTextContent('Extra tap');
    advanceTo(ONSET(1) + 0.25 + 0.5);
    expect(screen.getByTestId('tap-target')).not.toHaveAttribute('data-flash');
    // Once the round is over the tally and word go; the results row takes over.
    advanceTo(ONSET(0) + 4 * SPB + SPB + 0.1);
    expect(screen.queryByTestId('verdict-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tally')).not.toBeInTheDocument();
  });

  it('says Missed when a window passes with no tap, without flashing the pad', async () => {
    setup();
    await clickStart();
    advanceTo(ONSET(0) + 0.25);
    expect(screen.getByTestId('verdict-chip')).toHaveTextContent('Missed');
    expect(screen.getByTestId('tap-target')).not.toHaveAttribute('data-flash');
    expect(screen.getByTestId('tally')).toHaveTextContent('0 of 4 hit');
  });

  it('does not announce every tap: at most one running verdict every few seconds, then the summary', async () => {
    setup();
    await clickStart();
    const region = screen.getByTestId('live-region');
    tapAt(ONSET(0));
    expect(region).toHaveTextContent('Perfect. 1 of 4 hit.');
    tapAt(ONSET(1));
    tapAt(ONSET(2) + 0.1);
    // Within three seconds of the first announcement: still the first.
    expect(region).toHaveTextContent('Perfect. 1 of 4 hit.');
    advanceTo(ONSET(0) + 4 * SPB + SPB + 0.1);
    expect(region).toHaveTextContent('Finished. Accuracy');
    expect(region).toHaveTextContent('3 of 4 hit, 1 missed');
  });

  it('respects reduced motion: no pulse or beat ring, but the verdict colour and icon show and stay', async () => {
    setup({ reducedMotion: true });
    await clickStart();
    advanceTo(ONSET(0) - 0.01);
    expect(screen.getByTestId('tap-target')).toHaveAttribute('data-beat', 'false');
    tapAt(ONSET(0));
    const pad = screen.getByTestId('tap-target');
    expect(pad).toHaveAttribute('data-pulsing', 'false');
    expect(pad).toHaveAttribute('data-flash', 'perfect');
    expect(pad.querySelector('[data-verdict-icon="perfect"]')).toBeInTheDocument();
    advanceTo(ONSET(0) + 0.3);
    expect(pad).toHaveAttribute('data-flash', 'perfect');
  });

  it('pulses the pad on each click', async () => {
    setup();
    await clickStart();
    advanceTo(START + 0.03);
    expect(screen.getByTestId('tap-target')).toHaveAttribute('data-beat', 'true');
    advanceTo(START + 0.3);
    expect(screen.getByTestId('tap-target')).toHaveAttribute('data-beat', 'false');
  });

  it('resets the tally and verdict on Try again', async () => {
    setup();
    await clickStart();
    tapAt(ONSET(0));
    advanceTo(ONSET(0) + 4 * SPB + SPB + 0.1);
    await clickStart('Try again');
    expect(screen.getByTestId('tally')).toHaveTextContent('0 of 4 hit');
  });
});

describe('RhythmPad live events (free)', () => {
  it('reports phases and beats that wrap with the passage, and no verdicts', async () => {
    const phases: PadPhase[] = [];
    const beats: [number, number][] = [];
    const onOnsetJudged = vi.fn();
    render(
      <RhythmPad
        bars={[...bars, ...bars]}
        time={TIME}
        bpm={120}
        mode="free"
        onComplete={() => {}}
        onOnsetJudged={onOnsetJudged}
        onPhase={(p) => phases.push(p)}
        onBeat={(b, bar) => beats.push([b, bar])}
      />,
    );
    await clickStart();
    advanceTo(START + 17 * SPB + 0.03);
    expect(phases).toEqual(['idle', 'playing']);
    expect(beats.slice(0, 5)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]]);
    // Two bars, then back to bar 0.
    expect(beats[8]).toEqual([0, 0]);
    tapAt(START + 18 * SPB);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(phases).toEqual(['idle', 'playing', 'idle']);
    expect(onOnsetJudged).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tally')).not.toBeInTheDocument();
  });
});
