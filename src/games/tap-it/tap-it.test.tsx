// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { rhythm } from '@/engine/rhythm';
import { createRng } from '@/engine/rng';
import { DEFAULT_SETTINGS, type LearnerSettings } from '@/lesson/contracts';
import { createGame, resolveConfig, TapIt, type GameResult, type TapItConfig } from './index';

const fake = vi.hoisted(() => ({
  clock: 0,
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  stop: vi.fn(),
  startMetronome: vi.fn(),
  playUi: vi.fn(),
  setMuted: vi.fn(),
}));
const getAudioEngine = vi.hoisted(() => vi.fn());
vi.mock('@/audio', () => ({ getAudioEngine }));

const SEED = 42;

beforeAll(() => installStaveStubs());
beforeEach(() => {
  vi.useFakeTimers();
  fake.clock = 0;
  for (const f of [fake.unlock, fake.load, fake.stop, fake.playUi, fake.setMuted]) f.mockClear();
  fake.startMetronome.mockReset().mockImplementation(() => ({ stop: fake.stop, startTime: fake.clock + 0.1 }));
  getAudioEngine.mockReset();
  getAudioEngine.mockImplementation(() => ({
    now: () => fake.clock,
    unlock: fake.unlock,
    load: fake.load,
    startMetronome: fake.startMetronome,
    playUi: fake.playUi,
    setMuted: fake.setMuted,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

/** Advances the audio clock and the timers together, in small steps, as the rhythm pad's own tests do. */
function advanceTo(seconds: number) {
  while (fake.clock < seconds - 1e-9) {
    const step = Math.min(0.02, seconds - fake.clock);
    fake.clock += step;
    act(() => {
      vi.advanceTimersByTime(step * 1000);
    });
  }
}
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
const pointerTap = () => fireEvent.pointerDown(screen.getByTestId('tap-target'));
const spaceTap = () => fireEvent.keyDown(document.body, { key: ' ' });

const TIMED: LearnerSettings = { ...DEFAULT_SETTINGS };
const UNTIMED: LearnerSettings = { ...DEFAULT_SETTINGS, untimed: true };

function setup(opts: { settings?: LearnerSettings; config?: Partial<TapItConfig>; bests?: Record<string, number> } = {}) {
  const onFinish = vi.fn<(r: GameResult, variant: string) => void>();
  const onExit = vi.fn();
  const settings = opts.settings ?? TIMED;
  const utils = render(<TapIt settings={settings} config={opts.config} bests={opts.bests} seed={SEED} onFinish={onFinish} onExit={onExit} />);
  return { ...utils, onFinish, onExit };
}

/** The shadow of what the component plays first: same config, same seed. */
function shadow(config: Partial<TapItConfig>, practice = false) {
  return createGame(resolveConfig({ ...config, startLevel: 1, practice }), createRng(SEED)).current;
}

/** Times, on the fake audio clock, of the first run's onsets, once the pad has started. */
function timesOf(r: ReturnType<typeof shadow>) {
  const call = fake.startMetronome.mock.calls.length - 1;
  const start = (fake.startMetronome.mock.results[call]!.value as { startTime: number }).startTime;
  const spb = 60 / r.bpm;
  const perBar = r.time.beats;
  const first = start + perBar * spb;
  return {
    start,
    spb,
    onsets: rhythm.onsetTimes(r.bars, r.time, r.bpm).map((t) => first + t),
    end: start + (perBar + r.bars.length * perBar + 1) * spb,
  };
}

async function pressStart(name = 'Start') {
  fireEvent.click(screen.getByRole('button', { name }));
  await flush();
}

describe('start screen', () => {
  it('shows the title, three starting levels, two round lengths, Start and Exit', () => {
    setup({ bests: { '60': 125 } });
    expect(screen.getByRole('heading', { name: 'Tap It' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /New to this/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Getting there/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Bring it on/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '60 seconds' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '120 seconds' })).not.toBeChecked();
    expect(screen.getByText(/Best score \(60 seconds\): 125/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '120 seconds' }));
    expect(screen.queryByText(/Best score/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });
  it('links to the calibration in Settings with a sentence on when to use it', () => {
    setup();
    const link = screen.getByRole('link', { name: /tap calibration in Settings/i });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link.closest('p')).toHaveTextContent(/always seem a little early or late/i);
  });
  it('touches no audio before Start, and unlocks it from the Start press', async () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Bring it on/ }));
    fireEvent.click(screen.getByRole('radio', { name: '120 seconds' }));
    expect(getAudioEngine).not.toHaveBeenCalled();
    await pressStart();
    expect(fake.unlock).toHaveBeenCalled();
    expect(fake.load).toHaveBeenCalled();
  });
  it('calls onExit', () => {
    const { onExit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
  it('starts at the level the learner picked', async () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Bring it on/ }));
    await pressStart();
    expect(screen.getByTestId('ti-level')).toHaveTextContent('5');
    // Level 5 plays at 82 bpm.
    expect(fake.startMetronome).toHaveBeenCalledWith(expect.anything(), 82);
  });
});

describe('a timed round, by pointer', () => {
  it('start -> count-in -> tap -> feedback -> results, with live scoring', async () => {
    const config = { roundSeconds: 5 };
    const r = shadow(config);
    const { onFinish } = setup({ config, bests: { '5': 20 } });
    await pressStart();

    // The notation is up and the count-in has begun: the pad started itself, its own Start is not offered.
    expect(screen.getByTestId('ti-notation')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rhythm pad' })).toHaveAttribute('data-phase', 'count-in');
    expect(fake.startMetronome).toHaveBeenCalledTimes(1);
    expect(fake.startMetronome).toHaveBeenCalledWith(r.time, r.bpm);
    expect(screen.getByTestId('ti-announce')).toHaveTextContent(/Rhythm 1/);
    expect(screen.getByTestId('ti-score')).toHaveTextContent('0');
    expect(screen.getByTestId('ti-level')).toHaveTextContent('1');
    expect(screen.getByTestId('ti-multiplier')).toHaveTextContent('x1');
    expect(screen.getByTestId('ti-time')).toHaveTextContent('0:05');
    // The tap surface has focus, ready for Space.
    expect(document.activeElement).toBe(screen.getByTestId('tap-target'));

    const t = timesOf(r);
    // A tap during the count-in far from the first onset is ignored.
    advanceTo(t.start + 0.2);
    pointerTap();
    expect(screen.getByTestId('ti-score')).toHaveTextContent('0');

    // Perfect taps, each scored 10 at x1 (a rhythm has at most 8 onsets here).
    advanceTo(t.onsets[0]!);
    pointerTap();
    expect(screen.getByTestId('ti-score')).toHaveTextContent('10');
    expect(screen.getByTestId('tally')).toHaveTextContent(`1 of ${r.onsets} hit`);

    // An extra tap, well away from any onset, drops the streak but costs no points.
    const extraAt = t.onsets[0]! + 0.43;
    expect(t.onsets.every((o) => Math.abs(o - extraAt) > 0.4)).toBe(true);
    advanceTo(extraAt);
    pointerTap();
    expect(screen.getByTestId('ti-score')).toHaveTextContent('10');

    for (let i = 1; i < t.onsets.length; i += 1) {
      advanceTo(t.onsets[i]!);
      pointerTap();
    }
    // The extra tap broke the streak after the first note, so the rest start again at x1: 10 each.
    expect(screen.getByTestId('ti-score')).toHaveTextContent(String(10 * r.onsets));

    advanceTo(t.end + 0.05);
    // Feedback: the rhythm's own summary stays up for about a bar while the next is prepared.
    expect(screen.getByTestId('ti-record')).toHaveTextContent(`${r.onsets} perfect, 0 close, 0 missed`);
    expect(screen.getByTestId('ti-announce')).toHaveTextContent(new RegExp(`Rhythm done\\. Every note perfect\\. ${10 * r.onsets + 25} points`));
    expect(screen.getByTestId('ti-feedback')).toHaveTextContent('Perfect rhythm!');
    expect(onFinish).not.toHaveBeenCalled();

    // The 5 s clock ran out during that rhythm, so after the feedback bar the round is over.
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [result, variant] = onFinish.mock.calls[0]!;
    expect(variant).toBe('5');
    expect(result).toMatchObject({
      score: 10 * r.onsets + 25,
      rhythms: 1,
      onsets: r.onsets,
      perfects: r.onsets,
      misses: 0,
      extraTaps: 1,
      accuracy: 1,
      maxLevel: 1,
      practise: null,
      practice: false,
    });
    expect(result.bestStreak).toBe(r.onsets - 1);

    expect(screen.getByTestId('ti-final-score')).toHaveTextContent(String(10 * r.onsets + 25));
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByTestId('ti-pb')).toHaveTextContent('New personal best!');
    expect(screen.getByRole('heading', { name: 'No slips' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
    expect(fake.playUi).toHaveBeenCalledWith('correct');
    expect(fake.playUi).toHaveBeenCalledWith('complete');
  });

  it('a round with misses names the vocabulary to practise and gives no personal best', async () => {
    const config = { roundSeconds: 5 };
    const r = shadow(config);
    const { onFinish } = setup({ config, bests: { '5': 9999 } });
    await pressStart();
    const t = timesOf(r);
    // Tap only the first onset; the rest are missed.
    advanceTo(t.onsets[0]!);
    pointerTap();
    advanceTo(t.end + 0.05);
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]![0]).toMatchObject({ perfects: 1, misses: r.onsets - 1, score: 10, weakLevel: 1 });
    expect(screen.getByRole('heading', { name: 'Next time' })).toBeInTheDocument();
    expect(screen.getByTestId('ti-practise-line')).toHaveTextContent('Practise crotchets and minims in 4/4.');
    expect(screen.queryByTestId('ti-pb')).not.toBeInTheDocument();
    expect(fake.playUi).toHaveBeenCalledWith('wrong');
  });

  it('plays again into a fresh round, and the next rhythm follows the feedback when time remains', async () => {
    const config = { roundSeconds: 60 };
    const r = shadow(config);
    setup({ config });
    await pressStart();
    const t = timesOf(r);
    for (const o of t.onsets) {
      advanceTo(o);
      pointerTap();
    }
    advanceTo(t.end + 0.05);
    expect(screen.getByTestId('ti-feedback')).toHaveTextContent('Perfect rhythm!');
    expect(fake.startMetronome).toHaveBeenCalledTimes(1);
    // About a bar of feedback later the next rhythm is prepared: the pad restarts its click.
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    await flush();
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('ti-announce')).toHaveTextContent(/Rhythm 2, level 1/);
    expect(screen.getByRole('region', { name: 'Rhythm pad' })).toHaveAttribute('data-phase', 'count-in');
    // Score and streak carried over.
    expect(screen.getByTestId('ti-score')).toHaveTextContent(String(10 * r.onsets + 25));
  });

  it('Play again starts a new round', async () => {
    const config = { roundSeconds: 1 };
    const r = shadow(config);
    setup({ config });
    await pressStart();
    const t = timesOf(r);
    advanceTo(t.end + 0.05);
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    await flush();
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('ti-score')).toHaveTextContent('0');
  });
});

describe('a timed round, by keyboard', () => {
  it('Space taps from anywhere on the page', async () => {
    const config = { roundSeconds: 5 };
    const r = shadow(config);
    const { onFinish } = setup({ config });
    await pressStart();
    const t = timesOf(r);
    for (const o of t.onsets) {
      advanceTo(o);
      spaceTap();
    }
    expect(screen.getByTestId('ti-score')).toHaveTextContent(String(10 * r.onsets));
    advanceTo(t.end + 0.05);
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(onFinish.mock.calls[0]![0]).toMatchObject({ perfects: r.onsets, score: 10 * r.onsets + 25 });
  });
  it('Space on a focused button (Pause) does not tap', async () => {
    const config = { roundSeconds: 5 };
    const r = shadow(config);
    setup({ config });
    await pressStart();
    const t = timesOf(r);
    advanceTo(t.onsets[0]!);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pause' }), { key: ' ' });
    expect(screen.getByTestId('ti-score')).toHaveTextContent('0');
  });
  it('the tap surface answers Space and Enter itself', async () => {
    const config = { roundSeconds: 5 };
    const r = shadow(config);
    setup({ config });
    await pressStart();
    const t = timesOf(r);
    advanceTo(t.onsets[0]!);
    fireEvent.keyDown(screen.getByTestId('tap-target'), { key: ' ' });
    expect(screen.getByTestId('ti-score')).toHaveTextContent('10');
    advanceTo(t.onsets[1]!);
    fireEvent.keyDown(screen.getByTestId('tap-target'), { key: 'Enter' });
    expect(screen.getByTestId('ti-score')).toHaveTextContent('20');
  });
});

describe('pause when the tab is hidden', () => {
  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  };
  it('pauses, takes back the interrupted rhythm, resumes with 3-2-1 and plays the same rhythm again', async () => {
    const config = { roundSeconds: 60 };
    const r = shadow(config);
    setup({ config });
    await pressStart();
    const t = timesOf(r);
    advanceTo(t.onsets[0]!);
    pointerTap();
    expect(screen.getByTestId('ti-score')).toHaveTextContent('10');

    hide();
    expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
    expect(screen.queryByTestId('tap-target')).not.toBeInTheDocument();
    expect(fake.stop).toHaveBeenCalled();
    // The tap that was scored in the abandoned rhythm is taken back.
    expect(screen.getByTestId('ti-score')).toHaveTextContent('0');
    const left = screen.getByTestId('ti-time').textContent;
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByTestId('ti-time')).toHaveTextContent(left!);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('ti-countdown')).toHaveTextContent('3');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('ti-countdown')).toHaveTextContent('2');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('ti-countdown')).toHaveTextContent('1');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await flush();
    expect(screen.queryByTestId('ti-countdown')).not.toBeInTheDocument();
    expect(fake.startMetronome).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Rhythm pad' })).toHaveAttribute('data-phase', 'count-in');
    // The notation is the same rhythm.
    expect(screen.getByTestId('ti-announce')).toHaveTextContent(/Same rhythm again/);
    // And it still scores from nothing.
    const again = timesOf(r);
    advanceTo(again.onsets[0]!);
    pointerTap();
    expect(screen.getByTestId('ti-score')).toHaveTextContent('10');
  });
});

describe('untimed setting: slow practice', () => {
  it('explains that Tap It needs timing and offers slow practice at 50 bpm, no round length', () => {
    setup({ settings: UNTIMED });
    expect(screen.getByText(/Tap It needs timing/)).toBeInTheDocument();
    expect(screen.getByText(/50 beats a minute/)).toBeInTheDocument();
    expect(screen.getByText(/no score/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '60 seconds' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start slow practice' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    // The calibration link is still there.
    expect(screen.getByRole('link', { name: /tap calibration/i })).toHaveAttribute('href', '/settings');
  });

  it('plays a practice rhythm with no score and a wide tolerance, then shows hits and misses only', async () => {
    const config = { practiceRhythms: 1 };
    const r = shadow(config, true);
    const { onFinish } = setup({ settings: UNTIMED, config });
    await pressStart('Start slow practice');
    expect(fake.startMetronome).toHaveBeenCalledWith(r.time, 50);
    expect(r.bpm).toBe(50);
    expect(screen.queryByTestId('ti-score')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ti-time')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ti-multiplier')).not.toBeInTheDocument();
    expect(screen.getByTestId('ti-hits')).toHaveTextContent('Hit 0 · Missed 0');
    expect(screen.getByTestId('ti-progress')).toHaveTextContent('1/1');

    const t = timesOf(r);
    // First tap 0.25 s late: a miss in a round (150 ms), but practice allows 300 ms.
    advanceTo(t.onsets[0]! + 0.25);
    pointerTap();
    expect(screen.getByTestId('ti-hits')).toHaveTextContent('Hit 1 · Missed 0');
    // Skip the second onset entirely; tap the rest on time.
    for (let i = 2; i < t.onsets.length; i += 1) {
      advanceTo(t.onsets[i]!);
      pointerTap();
    }
    advanceTo(t.end + 0.05);
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(screen.getByText(/Practice over/)).toBeInTheDocument();
    expect(screen.getByTestId('ti-practice-summary')).toHaveTextContent(`${r.onsets - 1} of ${r.onsets} notes hit`);
    expect(screen.queryByTestId('ti-final-score')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ti-pb')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ti-practise-line')).not.toBeInTheDocument();
    expect(screen.getByText('Missed').nextSibling).toHaveTextContent('1');
    // Practice rounds are not reported as scores.
    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe('settings', () => {
  it('passes reduced motion on to the game', () => {
    setup({ settings: { ...TIMED, reducedMotion: true } });
    expect(screen.getByRole('region', { name: 'Tap It' })).toHaveAttribute('data-reduced', 'true');
  });
  it('applies the latency offset to every tap (a tap 0.2 s late is on time with a 200 ms offset)', async () => {
    const config = { roundSeconds: 5 };
    const r = shadow(config);
    setup({ settings: { ...TIMED, latencyOffsetMs: 200 }, config });
    await pressStart();
    const t = timesOf(r);
    advanceTo(t.onsets[0]! + 0.2);
    pointerTap();
    expect(screen.getByTestId('ti-score')).toHaveTextContent('10');
    expect(screen.getByTestId('ti-announce')).toBeInTheDocument();
  });
});
