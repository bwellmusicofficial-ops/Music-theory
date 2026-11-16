// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { createRng } from '@/engine/rng';
import { DEFAULT_SETTINGS, type LearnerSettings } from '@/lesson/contracts';
import { answer, createGame, KeyHunt, next, resolveConfig, tick, variantOf, type GameResult, type GameState, type KeyHuntConfig } from './index';

const audio = vi.hoisted(() => ({
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  isUnlocked: vi.fn(() => true),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  playUi: vi.fn(),
  setMuted: vi.fn(),
}));
const getAudioEngine = vi.hoisted(() => vi.fn());
vi.mock('@/audio', () => ({ getAudioEngine }));

const SEED = 7;

beforeAll(() => installStaveStubs());
beforeEach(() => {
  for (const f of Object.values(audio)) f.mockClear();
  getAudioEngine.mockReset();
  getAudioEngine.mockImplementation(() => audio);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

const UNTIMED: LearnerSettings = { ...DEFAULT_SETTINGS, untimed: true };
const TIMED: LearnerSettings = { ...DEFAULT_SETTINGS };

function setup(opts: { settings?: LearnerSettings; config?: Partial<KeyHuntConfig>; bests?: Record<string, number> } = {}) {
  const onFinish = vi.fn<(r: GameResult, variant: string) => void>();
  const onExit = vi.fn();
  const settings = opts.settings ?? UNTIMED;
  const utils = render(<KeyHunt settings={settings} config={opts.config} bests={opts.bests} seed={SEED} onFinish={onFinish} onExit={onExit} />);
  return { ...utils, onFinish, onExit, settings };
}
const start = () => fireEvent.click(screen.getByRole('button', { name: 'Start' }));
const announce = () => screen.getByTestId('kh-announce');

/** A copy of the game the component is running (same config, same seed, same answers). */
function shadowOf(config: Partial<KeyHuntConfig>, settings: LearnerSettings = UNTIMED): GameState {
  return createGame(resolveConfig({ ...config, untimed: settings.untimed }), createRng(SEED));
}
const wrongIndexOf = (g: GameState) => (g.question.correct === 0 ? 1 : 0);
const optionButton = (label: string) => within(screen.getByTestId('kh-options')).getByRole('button', { name: label });

describe('start screen', () => {
  it('shows the title, both modes, Grade 1 selected and the later grades locked', () => {
    setup({ settings: TIMED });
    expect(screen.getByRole('heading', { name: 'Key Hunt' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Signature to key/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Key to signature/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Grade 1/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Grade 1/ })).toBeEnabled();
    expect(screen.getByText('C, G, D and F major')).toBeInTheDocument();
    for (const g of ['Grade 2', 'Grade 3']) {
      const radio = screen.getByRole('radio', { name: new RegExp(g) });
      expect(radio).toBeDisabled();
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByText('Coming with Grade 2 lessons')).toBeInTheDocument();
    expect(screen.getByText(/8 seconds at first, down to 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });
  it('a locked grade cannot be chosen', () => {
    setup({ settings: TIMED });
    fireEvent.click(screen.getByRole('radio', { name: /Grade 2/ }));
    expect(screen.getByRole('radio', { name: /Grade 1/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Grade 2/ })).not.toBeChecked();
  });
  it('shows the best for the chosen mode', () => {
    setup({ settings: TIMED, bests: { [variantOf('grade-1', 'key-to-sig', false)]: 230 } });
    expect(screen.queryByText(/Best score/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Key to signature/ }));
    expect(screen.getByText('Best score: 230')).toBeInTheDocument();
  });
  it('says there is no clock in untimed mode', () => {
    setup();
    expect(screen.getByText(/no clock, 15 questions/)).toBeInTheDocument();
  });
  it('touches no audio before Start, and unlocks it from the Start press', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Key to signature/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Signature to key/ }));
    expect(getAudioEngine).not.toHaveBeenCalled();
    start();
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    expect(audio.load).toHaveBeenCalledTimes(1);
  });
  it('never touches audio when sound is off', () => {
    setup({ settings: { ...UNTIMED, soundOn: false } });
    start();
    fireEvent.click(optionButton(shadowOf({}).question.options[shadowOf({}).question.correct]!.label));
    for (const fn of Object.values(audio)) expect(fn).not.toHaveBeenCalled();
  });
  it('calls onExit', () => {
    const { onExit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('signature to key, untimed: start -> play -> results', () => {
  it('plays a whole round by pointer and keyboard, right and wrong', () => {
    const config = { untimedQuestions: 3 };
    const { onFinish, onExit } = setup({ config, bests: { [variantOf('grade-1', 'sig-to-key', true)]: 5 } });
    let shadow = shadowOf(config);
    start();

    // Play screen: no time bar, a stave with the signature, the options as big buttons numbered 1..n.
    expect(screen.queryByTestId('kh-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kh-time')).not.toBeInTheDocument();
    expect(screen.getByTestId('kh-progress')).toHaveTextContent('1/3');
    expect(screen.getByTestId('kh-prompt')).toHaveTextContent('Which major key has this signature?');
    expect(screen.getByTestId('kh-exhibit').querySelector('.mtn-stave')).not.toBeNull();
    const q1 = shadow.question;
    expect(announce()).toHaveTextContent(/^Question 1\. (Treble|Bass) clef with (no|one|two) (sharps?|flats?|sharps or flats)?/);
    expect(within(screen.getByTestId('kh-options')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(q1.options.map((o) => o.label));
    expect(q1.options).toHaveLength(3);

    // 1. Correct by pointer: 10 points, no speed bonus untimed, moves straight on.
    fireEvent.click(optionButton(q1.options[q1.correct]!.label));
    shadow = answer(shadow, q1.correct).state;
    expect(screen.getByTestId('kh-score')).toHaveTextContent('10');
    expect(screen.getByTestId('kh-toast')).toHaveTextContent('✓ +10');
    expect(announce()).toHaveTextContent(/Correct\. 10 points\. Question 2\./);
    expect(screen.getByTestId('kh-progress')).toHaveTextContent('2/3');

    // 2. Wrong: the answer and a one-line reason from the engine; waits for Next.
    const q2 = shadow.question;
    const wrong = wrongIndexOf(shadow);
    fireEvent.click(optionButton(q2.options[wrong]!.label));
    shadow = answer(shadow, wrong).state;
    expect(screen.getByTestId('kh-reveal')).toBeInTheDocument();
    expect(screen.getByTestId('kh-reason')).toHaveTextContent(q2.reason);
    expect(q2.reason).toMatch(/^(No sharps or flats|One|Two)[^:]*: that is [A-G]/);
    expect(announce()).toHaveTextContent(`Not quite. ${q2.reason}.`);
    expect(screen.getByTestId('kh-score')).toHaveTextContent('10');
    // The right option is marked in words and symbol, the learner's pick likewise: never colour alone.
    expect(optionButton(q2.options[q2.correct]!.label)).toHaveAttribute('data-state', 'correct');
    expect(optionButton(q2.options[q2.correct]!.label)).toHaveTextContent('✓ Right');
    expect(optionButton(q2.options[wrong]!.label)).toHaveAttribute('data-state', 'wrong');
    expect(optionButton(q2.options[wrong]!.label)).toHaveTextContent('✗ Yours');
    // Buttons are locked during the reveal; Next has focus.
    for (const b of within(screen.getByTestId('kh-options')).getAllByRole('button')) expect(b).toBeDisabled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('kh-multiplier')).toHaveTextContent('x1');

    // Next by the keyboard (Enter from the page).
    fireEvent.keyDown(window, { key: 'Enter' });
    shadow = next(shadow).state;
    expect(screen.queryByTestId('kh-reveal')).not.toBeInTheDocument();
    expect(screen.getByTestId('kh-progress')).toHaveTextContent('3/3');

    // 3. Correct by number key; this was the last question, so the round ends.
    const q3 = shadow.question;
    fireEvent.keyDown(window, { key: String(q3.correct + 1) });
    shadow = answer(shadow, q3.correct).state;
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [result, variant] = onFinish.mock.calls[0]!;
    expect(variant).toBe('grade-1:sig-to-key:untimed');
    expect(result).toEqual(shadow.result);
    expect(result).toMatchObject({ correct: 2, wrong: 1, timedOut: 0, score: 20, bestStreak: 1, untimed: true });

    // Results: score, accuracy, best streak, keys missed with their signature drawn, personal best.
    expect(screen.queryByTestId('kh-options')).not.toBeInTheDocument();
    expect(screen.getByTestId('kh-final-score')).toHaveTextContent('20');
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('Best streak')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Keys to practise' })).toBeInTheDocument();
    const missed = within(screen.getByTestId('kh-mistakes')).getAllByRole('listitem');
    expect(missed).toHaveLength(1);
    expect(missed[0]).toHaveTextContent(result.mistakes[0]!.name);
    expect(missed[0]).toHaveTextContent('wrong 1');
    expect(missed[0]!.querySelector('.mtn-stave')).not.toBeNull();
    expect(screen.getByTestId('kh-pb')).toHaveTextContent('New personal best!');

    // Sounds: correct twice, wrong once, complete once.
    const sounds = audio.playUi.mock.calls.map((c) => c[0]);
    expect(sounds.filter((s) => s === 'correct')).toHaveLength(2);
    expect(sounds.filter((s) => s === 'wrong')).toHaveLength(1);
    expect(sounds.filter((s) => s === 'complete')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('praises a personal best only when the score beats the previous best', () => {
    const run = (best?: number) => {
      const config = { untimedQuestions: 1 };
      const bests = best === undefined ? undefined : { [variantOf('grade-1', 'sig-to-key', true)]: best };
      const { unmount } = setup({ config, bests });
      const q = shadowOf(config).question;
      start();
      fireEvent.click(optionButton(q.options[q.correct]!.label));
      const shown = screen.queryByTestId('kh-pb') !== null;
      unmount();
      return shown;
    };
    expect(run(9)).toBe(true);
    expect(run(10)).toBe(false);
    expect(run(250)).toBe(false);
    expect(run(undefined)).toBe(false);
  });

  it('shows "No slips" for a perfect round, then Play again starts fresh', () => {
    const config = { untimedQuestions: 1 };
    setup({ config });
    const q = shadowOf(config).question;
    start();
    fireEvent.click(optionButton(q.options[q.correct]!.label));
    expect(screen.getByRole('heading', { name: 'No slips' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByTestId('kh-options')).toBeInTheDocument();
    expect(screen.getByTestId('kh-score')).toHaveTextContent('0');
  });

  it('keys 1 to 3 pick the matching option, other keys and modifiers do nothing', () => {
    const config = { untimedQuestions: 5 };
    setup({ config });
    const shadow = shadowOf(config);
    start();
    fireEvent.keyDown(window, { key: '9' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(screen.getByTestId('kh-progress')).toHaveTextContent('1/5');
    const wrong = wrongIndexOf(shadow);
    fireEvent.keyDown(window, { key: String(wrong + 1) });
    expect(screen.getByTestId('kh-reveal')).toBeInTheDocument();
    // Number keys are ignored during the reveal.
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('kh-progress')).toHaveTextContent('1/5');
  });
});

describe('key to signature', () => {
  it('shows the key name and staves as the options', () => {
    const config = { mode: 'key-to-sig' as const, untimedQuestions: 2 };
    const { onFinish } = setup({ config });
    let shadow = shadowOf(config);
    start();
    const q = shadow.question;
    expect(q.kind).toBe('key-to-sig');
    expect(screen.getByTestId('kh-prompt')).toHaveTextContent('Which signature belongs to this key?');
    expect(screen.getByTestId('kh-exhibit')).toHaveTextContent(q.exhibit.type === 'key-name' ? q.exhibit.text : '');
    const buttons = within(screen.getByTestId('kh-options')).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b.querySelector('.mtn-stave')).not.toBeNull();
    // Each button's accessible name says what the signature is, in words.
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(q.options.map((o) => o.label));
    expect(q.options.map((o) => o.label).every((l) => /^(No sharps or flats|One|Two|Three)/.test(l))).toBe(true);

    fireEvent.click(buttons[q.correct]!);
    shadow = answer(shadow, q.correct).state;
    const q2 = shadow.question;
    expect(screen.getByTestId('kh-score')).toHaveTextContent('10');
    // Wrong on the last one: reason in words, then Next says "See results".
    fireEvent.click(within(screen.getByTestId('kh-options')).getAllByRole('button')[wrongIndexOf(shadow)]!);
    expect(screen.getByTestId('kh-reason')).toHaveTextContent(q2.reason);
    expect(q2.reason).toMatch(/ has (no sharps or flats|one|two)/);
    fireEvent.click(screen.getByRole('button', { name: 'See results' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]![1]).toBe('grade-1:key-to-sig:untimed');
    expect(onFinish.mock.calls[0]![0]).toMatchObject({ correct: 1, wrong: 1, score: 10 });
  });
});

describe('level 2 questions', () => {
  it('asks which note is sharp and how many sharps or flats, alongside the main kind', () => {
    const config = { startLevel: 2, untimedQuestions: 40 };
    setup({ config });
    let shadow = shadowOf(config);
    start();
    const seen = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const q = shadow.question;
      seen.add(q.kind);
      expect(screen.getByTestId('kh-prompt')).toHaveTextContent(q.prompt);
      if (q.kind === 'which-accidental') {
        expect(q.prompt).toMatch(/^Which of these notes is (sharp|flat) in [A-G]/);
        expect(screen.getByTestId('kh-exhibit')).toHaveTextContent(/[A-G]( major)/);
      }
      if (q.kind === 'count') expect(within(screen.getByTestId('kh-options')).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
      fireEvent.click(optionButton(q.options[q.correct]!.label));
      shadow = answer(shadow, q.correct).state;
      if (shadow.phase === 'finished') break;
    }
    expect(seen.has('which-accidental')).toBe(true);
    expect(seen.has('count')).toBe(true);
    expect(seen.has('sig-to-key')).toBe(true);
  });
});

describe('timed round with a stubbed animation frame', () => {
  function stubFrames() {
    let queue: { id: number; cb: FrameRequestCallback }[] = [];
    let nextId = 1;
    let now = 1000;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queue.push({ id: nextId, cb });
      return nextId++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      queue = queue.filter((q) => q.id !== id);
    });
    return {
      advance(ms: number, frameMs = 50) {
        for (let t = 0; t < ms; t += frameMs) {
          const due = queue;
          queue = [];
          now += frameMs;
          act(() => {
            for (const q of due) q.cb(now);
          });
        }
      },
    };
  }

  it('shows the time bar, scores a speed bonus, and a timeout reveals the answer and carries on', () => {
    vi.useFakeTimers();
    const frames = stubFrames();
    const config = { roundSeconds: 20 };
    setup({ settings: TIMED, config });
    let shadow = shadowOf(config, TIMED);
    start();
    expect(screen.getByTestId('kh-bar')).toBeInTheDocument();
    expect(screen.getByTestId('kh-time')).toHaveTextContent('0:20');
    expect(screen.getByTestId('kh-qsecs')).toHaveTextContent('8s');

    // Frames run; the bar shrinks. After 4 s of an 8 s bar, a right answer earns 10 + 5.
    frames.advance(4000);
    const bar = screen.getByTestId('kh-bar').firstElementChild as HTMLElement;
    expect(Number(bar.style.transform.match(/scaleX\(([\d.]+)\)/)![1])).toBeCloseTo(0.5, 1);
    shadow = tick(shadow, 4000).state;
    const q1 = shadow.question;
    fireEvent.click(optionButton(q1.options[q1.correct]!.label));
    const expected = answer(shadow, q1.correct);
    shadow = expected.state;
    expect(screen.getByTestId('kh-score')).toHaveTextContent(String(shadow.score));
    expect(shadow.score).toBe(15);

    // Let the next question run out: a timeout, with the reason, never the end of the game.
    const q2 = shadow.question;
    frames.advance(8000);
    shadow = tick(shadow, 8000).state;
    expect(shadow.phase).toBe('reveal');
    expect(screen.getByTestId('kh-reveal')).toHaveTextContent('Time is up');
    expect(screen.getByTestId('kh-reason')).toHaveTextContent(q2.reason);
    expect(screen.getByTestId('kh-multiplier')).toHaveTextContent('x1');
    expect(audio.playUi).toHaveBeenCalledWith('wrong');

    // The reveal moves on by itself after a moment.
    frames.advance(2500);
    expect(screen.queryByTestId('kh-reveal')).not.toBeInTheDocument();
    expect(screen.getByTestId('kh-options')).toBeInTheDocument();
  });

  it('ends when the round clock runs out, with results', () => {
    vi.useFakeTimers();
    const frames = stubFrames();
    const { onFinish } = setup({ settings: TIMED, config: { roundSeconds: 3 } });
    start();
    frames.advance(3300);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]![0]).toMatchObject({ score: 0, correct: 0, untimed: false });
    expect(onFinish.mock.calls[0]![1]).toBe('grade-1:sig-to-key:timed');
    expect(screen.getByTestId('kh-final-score')).toHaveTextContent('0');
    expect(audio.playUi).toHaveBeenCalledWith('complete');
  });

  it('pauses when the tab is hidden, hides the question, resumes with 3-2-1 and keeps the clock still meanwhile', () => {
    vi.useFakeTimers();
    const frames = stubFrames();
    setup({ settings: TIMED, config: { roundSeconds: 30 } });
    start();
    frames.advance(1000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
    // Nothing to study while paused.
    expect(screen.queryByTestId('kh-options')).not.toBeInTheDocument();
    const left = screen.getByTestId('kh-time').textContent;
    frames.advance(5000);
    expect(screen.getByTestId('kh-time')).toHaveTextContent(left!);

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('kh-countdown')).toHaveTextContent('3');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('kh-countdown')).toHaveTextContent('2');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('kh-countdown')).toHaveTextContent('1');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByTestId('kh-countdown')).not.toBeInTheDocument();
    expect(screen.getByTestId('kh-options')).toBeInTheDocument();
    const before = screen.getByTestId('kh-qsecs').textContent;
    frames.advance(2000);
    expect(screen.getByTestId('kh-qsecs').textContent).not.toBe(before);
  });

  it('the Pause button pauses too', () => {
    vi.useFakeTimers();
    stubFrames();
    setup({ settings: TIMED });
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('passes reduced motion to the root', () => {
    setup({ settings: { ...UNTIMED, reducedMotion: true } });
    expect(screen.getByRole('region', { name: 'Key Hunt' })).toHaveAttribute('data-reduced', 'true');
  });
});
