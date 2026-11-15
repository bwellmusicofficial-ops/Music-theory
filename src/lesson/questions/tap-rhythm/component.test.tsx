import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verdictOf, type TapResult } from '@/components/rhythm-pad';
import type { MarkResult } from '@/lesson/contracts';
import { DEFAULT_SETTINGS } from '@/lesson/contracts';
import { LessonContextProvider } from '@/lesson/player';
import { mark } from './mark';
import { TapRhythm, describeRhythm, setTapRhythmNotationRenderer, toPassage, type TapRhythmNotationLive } from './component';
import { bar, note, payloadOf, rest } from './test-helpers';
import { matchWindowMs, type TapRhythmPayload } from './types';

const fake = vi.hoisted(() => ({
  clock: 0,
  getAudioEngine: vi.fn(),
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  stop: vi.fn(),
  startMetronome: vi.fn(),
  playUi: vi.fn(),
  playPassage: vi.fn(),
  resolveDone: null as null | (() => void),
  rejectPlay: false,
}));

vi.mock('@/audio', () => ({
  getAudioEngine: (...args: unknown[]) => {
    fake.getAudioEngine(...args);
    return {
      now: () => fake.clock,
      unlock: fake.unlock,
      load: fake.load,
      startMetronome: fake.startMetronome,
      playUi: fake.playUi,
      playPassage: fake.playPassage,
    };
  },
}));

// 4/4 at 120 bpm: 0.5 s a beat. One-bar count-in. Metronome starts at 0.1 s.
const START = 0.1;
const SPB = 0.5;
const ONSET = (beat: number) => START + 4 * SPB + beat * SPB;
const rhythm = payloadOf([bar(note('crotchet'), note('crotchet'), note('minim'))], { bpm: 120 });

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

beforeEach(() => {
  vi.useFakeTimers();
  fake.clock = 0;
  fake.rejectPlay = false;
  fake.resolveDone = null;
  for (const mock of [fake.getAudioEngine, fake.unlock, fake.load, fake.stop, fake.playUi, fake.playPassage]) mock.mockClear();
  fake.startMetronome.mockReset().mockImplementation(() => ({ stop: fake.stop, startTime: fake.clock + 0.1 }));
  fake.playPassage.mockReset().mockImplementation(() => {
    const done = new Promise<void>((resolve) => {
      fake.resolveDone = resolve;
    });
    return { stop: fake.stop, done };
  });
});
afterEach(() => {
  vi.useRealTimers();
  setTapRhythmNotationRenderer(null);
});

function setup(payload: TapRhythmPayload, options: { locked?: boolean; result?: MarkResult | null } = {}) {
  const onAnswer = vi.fn<(r: TapResult) => void>();
  const ui = (locked: boolean, result: MarkResult | null) => (
    <TapRhythm payload={payload} terminology="uk" locked={locked} result={result} onAnswer={onAnswer} />
  );
  const view = render(ui(options.locked ?? false, options.result ?? null));
  return { onAnswer, unmount: view.unmount, rerenderWith: (l: boolean, r: MarkResult | null) => view.rerender(ui(l, r)) };
}

async function clickButton(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('TapRhythm: audio only after a gesture', () => {
  it('makes no audio call when it renders, with or without listenFirst', () => {
    setup(rhythm);
    setup({ ...rhythm, listenFirst: true });
    expect(fake.getAudioEngine).not.toHaveBeenCalled();
    expect(fake.unlock).not.toHaveBeenCalled();
    expect(fake.playPassage).not.toHaveBeenCalled();
  });

  it('the pad starts the click only when Start is pressed', async () => {
    setup(rhythm);
    expect(fake.startMetronome).not.toHaveBeenCalled();
    await clickButton('Start');
    expect(fake.unlock).toHaveBeenCalledOnce();
    expect(fake.startMetronome).toHaveBeenCalledOnce();
  });
});

describe('TapRhythm: notation', () => {
  it('describes the rhythm in words when no renderer is set', () => {
    setup(payloadOf([bar(note('crotchet'), note('crotchet'), note('minim')), bar(note('minim'), note('crotchet'), rest('crotchet'))]));
    const lines = screen.getByRole('list', { name: 'The rhythm in words' });
    expect(lines).toHaveTextContent('Bar 1: crotchet, crotchet, minim');
    expect(lines).toHaveTextContent('Bar 2: minim, crotchet, crotchet rest');
  });

  it('follows the terminology prop', () => {
    const onAnswer = vi.fn();
    render(
      <TapRhythm payload={rhythm} terminology="us" locked={false} result={null} onAnswer={onAnswer} />,
    );
    expect(screen.getByRole('list', { name: 'The rhythm in words' })).toHaveTextContent(
      'Measure 1: quarter note, quarter note, half note',
    );
  });

  it('uses the injected renderer, giving it a passage in treble clef and C major', () => {
    const renderer = vi.fn(() => <p>STAVE</p>);
    setTapRhythmNotationRenderer(renderer);
    setup(rhythm);
    expect(screen.getByTestId('notation')).toHaveTextContent('STAVE');
    expect(renderer).toHaveBeenCalledWith(toPassage(rhythm));
    expect(toPassage(rhythm)).toMatchObject({ clef: 'treble', time: rhythm.time, key: { mode: 'major' } });
  });

  it('shows no notation when showNotation is false', () => {
    setup({ ...rhythm, showNotation: false, listenFirst: true });
    expect(screen.queryByTestId('notation')).toBeNull();
  });

  it('describeRhythm marks tied notes', () => {
    expect(describeRhythm(payloadOf([bar(note('minim', 0, true), note('minim'))]), 'uk')).toEqual(['minim (tied), minim']);
  });
});

describe('TapRhythm: listenFirst', () => {
  const listening = { ...rhythm, listenFirst: true };

  it('hides the pad until the learner has listened', () => {
    setup(listening);
    expect(screen.getByRole('button', { name: 'Listen' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('plays the passage from the Listen click, then shows the pad', async () => {
    setup(listening);
    await clickButton('Listen');
    expect(fake.unlock).toHaveBeenCalledOnce();
    expect(fake.playPassage).toHaveBeenCalledWith(toPassage(listening), { bpm: 120 });
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    await act(async () => {
      fake.resolveDone?.();
    });
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listen again' })).toBeEnabled();
  });

  it('disables Listen while the rhythm plays', async () => {
    setup(listening);
    await clickButton('Listen');
    expect(screen.getByRole('button', { name: /Listen/ })).toBeDisabled();
  });

  it('does not block the question when sound fails', async () => {
    fake.unlock.mockRejectedValueOnce(new Error('no audio'));
    setup(listening);
    await clickButton('Listen');
    expect(screen.getByRole('alert')).toHaveTextContent('Sound could not be played on this device.');
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('stops playback on unmount', async () => {
    const { unmount } = setup(listening);
    await clickButton('Listen');
    expect(fake.stop).not.toHaveBeenCalled();
    unmount();
    expect(fake.stop).toHaveBeenCalledOnce();
  });
});

describe('TapRhythm: answering', () => {
  it('passes the pad result to onAnswer unchanged, once', async () => {
    const { onAnswer } = setup(rhythm);
    await clickButton('Start');
    tapAt(ONSET(0));
    tapAt(ONSET(1));
    tapAt(ONSET(2));
    advanceTo(START + (4 + 4 + 1) * SPB + 0.1);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const result = onAnswer.mock.calls[0]?.[0] as TapResult;
    expect(result.errorsMs).toHaveLength(3);
    result.errorsMs.forEach((e) => expect(Math.abs(e as number)).toBeLessThan(40));
    expect(result.extraTaps).toBe(0);
    expect(result.accuracy).toBeGreaterThan(0.9);
  });

  it('reports missed notes as null and extra taps', async () => {
    const { onAnswer } = setup(rhythm);
    await clickButton('Start');
    tapAt(ONSET(0));
    tapAt(ONSET(0) + 0.1); // extra: the nearest unmatched onset is 400 ms away, outside the window
    advanceTo(START + (4 + 4 + 1) * SPB + 0.1);
    const result = onAnswer.mock.calls[0]?.[0] as TapResult;
    expect(result.errorsMs[1]).toBeNull();
    expect(result.errorsMs[2]).toBeNull();
    expect(result.extraTaps).toBe(1);
  });

  it('gives the pad a window of 2.5 times the payload tolerance, capped at 450 ms', async () => {
    const wide = setup({ ...rhythm, toleranceMs: 100 });
    await clickButton('Start');
    tapAt(ONSET(0) - 0.24); // 240 ms early: inside 250
    advanceTo(START + (4 + 4 + 1) * SPB + 0.1);
    expect((wide.onAnswer.mock.calls[0]?.[0] as TapResult).errorsMs[0]).toBeCloseTo(-240, -1);
  });

  it('a tap outside the window is not matched', async () => {
    const tight = setup({ ...rhythm, toleranceMs: 100 });
    await clickButton('Start');
    tapAt(ONSET(0) + 0.27); // 270 ms late: outside 250
    advanceTo(START + (4 + 4 + 1) * SPB + 0.1);
    expect((tight.onAnswer.mock.calls[0]?.[0] as TapResult).errorsMs[0]).toBeNull();
  });

  it('matchWindowMs scales the tolerance and caps at 450 ms', () => {
    expect(matchWindowMs(100)).toBe(250);
    expect(matchWindowMs(150)).toBe(375);
    expect(matchWindowMs(250)).toBe(450);
  });

  it('an early tap outside the tolerance but inside the window gives the early reason from mark', async () => {
    const { onAnswer } = setup(rhythm); // tolerance 150, window 375
    await clickButton('Start');
    tapAt(ONSET(0));
    tapAt(ONSET(1) - 0.25); // 250 ms early: outside 150, inside 375
    tapAt(ONSET(2));
    advanceTo(START + (4 + 4 + 1) * SPB + 0.1);
    const answer = onAnswer.mock.calls[0]?.[0] as TapResult;
    expect(answer.errorsMs[1]).toBeLessThan(-150);
    const marked = mark(rhythm, answer);
    expect(marked.correct).toBe(false);
    expect(marked.reason).toContain('Tap 2 came too early');
  });

  it('applies the learner latency offset from the lesson settings before scoring', async () => {
    const onAnswer = vi.fn<(r: TapResult) => void>();
    render(
      <LessonContextProvider settings={{ ...DEFAULT_SETTINGS, latencyOffsetMs: 100 }} glossary={[]}>
        <TapRhythm payload={rhythm} terminology="uk" locked={false} result={null} onAnswer={onAnswer} />
      </LessonContextProvider>,
    );
    await clickButton('Start');
    tapAt(ONSET(0) + 0.1); // the device reported this tap 100 ms late
    advanceTo(START + (4 + 4 + 1) * SPB + 0.1);
    expect(Math.abs((onAnswer.mock.calls[0]?.[0] as TapResult).errorsMs[0] as number)).toBeLessThan(10);
  });

  it('after listening, the performance also reports its answer', async () => {
    const { onAnswer } = setup({ ...rhythm, listenFirst: true });
    await clickButton('Listen');
    await act(async () => {
      fake.resolveDone?.();
    });
    await clickButton('Start');
    tapAt(ONSET(0));
    advanceTo(START + (4 + 4 + 1) * SPB + 0.1);
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
});

describe('TapRhythm: locked and result', () => {
  it('makes the pad inert and disables Listen when locked', () => {
    setup({ ...rhythm, listenFirst: true }, { locked: true });
    expect(screen.getByTestId('pad-wrapper')).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: /Listen/ })).toBeDisabled();
  });

  it('shows the pad and a text result when locked, even without listening', () => {
    setup({ ...rhythm, listenFirst: true }, { locked: true, result: { correct: true, score: 1 } });
    expect(screen.getByTestId('pad-wrapper')).toBeInTheDocument();
    expect(screen.getByText('Rhythm correct, 100%')).toBeInTheDocument();
  });

  it('says in words when the rhythm was not accurate enough', () => {
    setup(rhythm, { locked: true, result: { correct: false, score: 0.5, reason: 'x' } });
    expect(screen.getByText('Not accurate enough, 50%')).toBeInTheDocument();
  });

  it('is not inert while answering', () => {
    setup(rhythm);
    expect(screen.getByTestId('pad-wrapper')).not.toHaveAttribute('inert');
  });
});

describe('TapRhythm: live notation feedback', () => {
  const END = START + (4 + 4 + 1) * SPB + 0.1; // the pad completes one beat after the last bar
  const MARK_OF = { perfect: 'correct', close: 'near', miss: 'wrong' } as const;

  function withRenderer(payload: TapRhythmPayload) {
    const calls: { live?: TapRhythmNotationLive }[] = [];
    setTapRhythmNotationRenderer((_passage, live) => {
      calls.push({ live });
      return <p data-testid="stave-stub">STAVE</p>;
    });
    const view = setup(payload);
    return { ...view, last: () => calls.at(-1)?.live, calls };
  }

  it('gives the renderer no live feedback until something happens', () => {
    const { last } = withRenderer(rhythm);
    expect(last()).toBeUndefined();
  });

  it('lights the note due now, and nothing during the count-in', async () => {
    const { last } = withRenderer(rhythm);
    await clickButton('Start');
    advanceTo(START + 2 * SPB);
    expect(last()?.cursor ?? null).toBeNull();
    advanceTo(ONSET(0) + 0.03);
    expect(last()?.cursor).toEqual({ bar: 0, event: 0 });
    advanceTo(ONSET(1) + 0.03);
    expect(last()?.cursor).toEqual({ bar: 0, event: 1 });
  });

  it('changes the marks as taps arrive and ends up agreeing with the final result', async () => {
    const { last, onAnswer } = withRenderer(rhythm);
    await clickButton('Start');
    tapAt(ONSET(0)); // perfect
    expect(last()?.marks).toEqual({ '0:0': 'correct' });
    tapAt(ONSET(1) + 0.12); // close (late)
    expect(last()?.marks).toEqual({ '0:0': 'correct', '0:1': 'near' });
    // The third note is never tapped: it turns to a miss as soon as its window has passed.
    advanceTo(ONSET(2) + 0.4);
    expect(last()?.marks).toEqual({ '0:0': 'correct', '0:1': 'near', '0:2': 'wrong' });
    expect(onAnswer).not.toHaveBeenCalled();

    advanceTo(END);
    const answer = onAnswer.mock.calls[0]?.[0] as TapResult;
    const tolerance = matchWindowMs(150);
    answer.errorsMs.forEach((e, i) => {
      expect(last()?.marks?.[`0:${i}`]).toBe(MARK_OF[verdictOf(e, { toleranceMs: tolerance })]);
    });
    // After the round ends the marks stay and the cursor is gone.
    expect(last()?.marks).toEqual({ '0:0': 'correct', '0:1': 'near', '0:2': 'wrong' });
    expect(last()?.cursor ?? null).toBeNull();
  });

  it('skips rests and tied continuations when mapping onsets to notes', async () => {
    const tied = payloadOf([bar(rest('crotchet'), note('crotchet', 0, true), note('crotchet'), note('crotchet'))], { bpm: 120 });
    const { last } = withRenderer(tied);
    await clickButton('Start');
    tapAt(ONSET(1)); // the first onset: the note after the rest
    tapAt(ONSET(3)); // the second onset: the last note (the one at 0:2 is the tie)
    expect(last()?.marks).toEqual({ '0:1': 'correct', '0:3': 'correct' });
  });

  it('shows the count-in as large beats over the notation, then Tap!', async () => {
    withRenderer(rhythm);
    await clickButton('Start');
    const cue = () => screen.queryByTestId('count-in-cue')?.textContent ?? null;
    advanceTo(START + 0.03);
    expect(cue()).toBe('4');
    advanceTo(START + SPB + 0.03);
    expect(cue()).toBe('3');
    advanceTo(START + 3 * SPB + 0.03);
    expect(cue()).toBe('1');
    expect(screen.getByTestId('notation')).toContainElement(screen.getByTestId('count-in-cue'));
    advanceTo(ONSET(0) + 0.03);
    expect(cue()).toBe('Tap!');
    advanceTo(ONSET(1) + 0.03);
    expect(cue()).toBeNull();
  });

  it('counts the real number of beats for the time signature', async () => {
    withRenderer(payloadOf([bar(note('crotchet'), note('crotchet'), note('crotchet'))], { time: { beats: 3, beatUnit: 4 }, bpm: 120 }));
    await clickButton('Start');
    advanceTo(START + 0.03);
    expect(screen.getByTestId('count-in-cue')).toHaveTextContent('3');
  });

  it('works with a renderer that takes only the passage', async () => {
    setTapRhythmNotationRenderer(() => <p>PLAIN</p>);
    setup(rhythm);
    await clickButton('Start');
    tapAt(ONSET(0));
    expect(screen.getByTestId('notation')).toHaveTextContent('PLAIN');
  });
});
