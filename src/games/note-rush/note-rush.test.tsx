// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { createRng } from '@/engine/rng';
import type { Letter } from '@/engine/types';
import { DEFAULT_SETTINGS, type LearnerSettings } from '@/lesson/contracts';
import { NoteRush } from './index';
import {
  answer,
  createGame,
  leadingNote,
  resolveConfig,
  tick,
  type GameResult,
  type GameState,
  type NoteRushConfig,
} from './index';

const audio = vi.hoisted(() => ({
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  isUnlocked: vi.fn(() => true),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  playUi: vi.fn(),
}));
const getAudioEngine = vi.hoisted(() => vi.fn());
vi.mock('@/audio', () => ({ getAudioEngine }));

const SEED = 42;

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
});

const UNTIMED: LearnerSettings = { ...DEFAULT_SETTINGS, untimed: true };

function setup(opts: {
  settings?: LearnerSettings;
  config?: Partial<NoteRushConfig>;
  bestScore?: number;
} = {}) {
  const onFinish = vi.fn<(r: GameResult) => void>();
  const onExit = vi.fn();
  const settings = opts.settings ?? UNTIMED;
  const utils = render(
    <NoteRush
      settings={settings}
      config={opts.config}
      bestScore={opts.bestScore}
      seed={SEED}
      onFinish={onFinish}
      onExit={onExit}
    />,
  );
  return { ...utils, onFinish, onExit, settings };
}

const start = () => fireEvent.click(screen.getByRole('button', { name: 'Start' }));
const status = () => screen.getByRole('status');

/** A copy of the game the component is running (same config, same seed, same answers). */
function shadowOf(config: Partial<NoteRushConfig>, settings: LearnerSettings = UNTIMED): GameState {
  return createGame(resolveConfig({ ...config, untimed: settings.untimed }), createRng(SEED));
}
const wrongFor = (l: Letter): Letter => (l === 'C' ? 'D' : 'C');

describe('start screen', () => {
  it('shows the title, a one-line how-to, clef and answer choices, and Start', () => {
    setup({ settings: DEFAULT_SETTINGS });
    expect(screen.getByRole('heading', { name: 'Note Rush' })).toBeInTheDocument();
    expect(screen.getByText(/before it hits the line/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Treble clef' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bass clef' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Letter buttons' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Piano keys' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });
  it('says nothing moves in untimed mode', () => {
    setup({ settings: UNTIMED });
    expect(screen.getByText(/nothing moves until you answer/i)).toBeInTheDocument();
  });
  it('uses the learner terminology: stave (UK) or staff (US)', () => {
    const { unmount } = setup({ settings: { ...DEFAULT_SETTINGS, terminology: 'uk' } });
    expect(screen.getByText(/along the stave/)).toBeInTheDocument();
    unmount();
    setup({ settings: { ...DEFAULT_SETTINGS, terminology: 'us' } });
    expect(screen.getByText(/along the staff/)).toBeInTheDocument();
  });
  it('touches no audio before Start, and unlocks it from the Start press', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Bass clef' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Piano keys' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Letter buttons' }));
    expect(getAudioEngine).not.toHaveBeenCalled();
    start();
    expect(getAudioEngine).toHaveBeenCalled();
    expect(audio.unlock).toHaveBeenCalledTimes(1);
  });
  it('never touches audio when sound is off', () => {
    const { settings } = setup({ settings: { ...UNTIMED, soundOn: false } });
    expect(settings.soundOn).toBe(false);
    start();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    // (The stave package asks for the engine object when it mounts; what matters is that
    // nothing is unlocked, loaded or played.)
    for (const fn of Object.values(audio)) expect(fn).not.toHaveBeenCalled();
  });
  it('calls onExit', () => {
    const { onExit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('untimed round: start -> play -> results', () => {
  it('plays a whole round with buttons and computer keys, right and wrong', () => {
    const config = { untimedNotes: 4 };
    const { onFinish } = setup({ config, bestScore: 5 });
    let shadow = shadowOf(config);
    start();

    // Play screen: no clock, one note, stave drawn, seven big letter buttons.
    expect(screen.queryByTestId('nr-time')).not.toBeInTheDocument();
    expect(screen.getByTestId('nr-progress')).toHaveTextContent('0/4');
    expect(screen.getAllByTestId('nr-note')).toHaveLength(1);
    expect(screen.getByTestId('nr-stage')).toBeInTheDocument();
    const pad = screen.getByRole('group', { name: 'Note names' });
    const buttons = within(pad).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    for (const b of buttons) expect(b.className).toContain('min-h-14'); // 56 px, above the 48 px minimum
    // Describes where the first note is, without naming it.
    expect(status()).toHaveTextContent(/Note 1 of 4, on the (first|second|third|fourth|fifth) (line|space)\./);
    expect(status().textContent).not.toMatch(/\b[A-G]\b/);

    const press = (how: 'button' | 'key', kind: 'c' | 'w') => {
      const lead = leadingNote(shadow)!.letter;
      const letter = kind === 'c' ? lead : wrongFor(lead);
      if (how === 'button') fireEvent.click(screen.getByRole('button', { name: letter }));
      else fireEvent.keyDown(window, { key: kind === 'c' ? letter.toLowerCase() : letter });
      shadow = answer(shadow, letter).state;
      return { lead, letter };
    };

    // Wrong by button: no points, the note stays, name withheld.
    const r = press('button', 'w');
    expect(status()).toHaveTextContent('Not quite. Try again.');
    expect(status().textContent).not.toContain(` ${r.lead}`);
    expect(screen.getByTestId('nr-score')).toHaveTextContent('0');
    expect(screen.getByTestId('nr-progress')).toHaveTextContent('0/4');
    expect(screen.getByTestId('nr-feedback')).toHaveTextContent('✗');
    expect(screen.getByTestId('nr-feedback')).toHaveTextContent(/try again/i);

    // Correct by button.
    press('button', 'c');
    expect(status()).toHaveTextContent(/Correct\. 10 points\./);
    expect(status()).toHaveTextContent(/Note 2 of 4, on the/);
    expect(screen.getByTestId('nr-score')).toHaveTextContent('10');
    expect(screen.getByTestId('nr-feedback')).toHaveTextContent('✓');

    // Wrong by computer key (upper case works too), then correct by key.
    press('key', 'w');
    expect(status()).toHaveTextContent('Not quite. Try again.');
    press('key', 'c');
    expect(screen.getByTestId('nr-score')).toHaveTextContent('20');

    // Keys outside a-g and keys with modifiers do nothing.
    fireEvent.keyDown(window, { key: 'h' });
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    expect(screen.getByTestId('nr-score')).toHaveTextContent('20');
    expect(screen.getByTestId('nr-progress')).toHaveTextContent('2/4');

    press('button', 'c');
    expect(onFinish).not.toHaveBeenCalled();
    press('key', 'c');

    // Results.
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result).toEqual(shadow.result);
    expect(result).toMatchObject({ correct: 4, wrong: 2, missed: 0, score: 40, bestStreak: 3, untimed: true });
    expect(screen.queryByRole('group', { name: 'Note names' })).not.toBeInTheDocument();
    expect(screen.getByTestId('nr-final-score')).toHaveTextContent('40');
    expect(screen.getByText('67%')).toBeInTheDocument(); // 4 / 6
    expect(screen.getByRole('heading', { name: 'Practise these' })).toBeInTheDocument();
    for (const m of result.mistakes) expect(screen.getByText(m.key)).toBeInTheDocument();
    expect(screen.getByTestId('nr-pb')).toHaveTextContent('New personal best!');
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();

    // Sounds: correct and wrong, never anything for a keypress that does nothing.
    const sounds = audio.playUi.mock.calls.map((c) => c[0]);
    expect(sounds.filter((s) => s === 'wrong')).toHaveLength(2);
    expect(sounds.filter((s) => s === 'correct')).toHaveLength(4);
  });

  it('praises a personal best only when the score beats the previous best', () => {
    const run = (bestScore?: number) => {
      const { unmount, onFinish } = setup({ config: { untimedNotes: 1 }, bestScore });
      let shadow = shadowOf({ untimedNotes: 1 });
      start();
      fireEvent.click(screen.getByRole('button', { name: leadingNote(shadow)!.letter }));
      shadow = answer(shadow, leadingNote(shadow)!.letter).state;
      expect(onFinish).toHaveBeenCalledTimes(1);
      const shown = screen.queryByTestId('nr-pb') !== null;
      unmount();
      return shown;
    };
    expect(run(9)).toBe(true); // score 10 > 9
    expect(run(10)).toBe(false); // equal is not a record
    expect(run(250)).toBe(false);
    expect(run(undefined)).toBe(false); // no previous best known: no claim
  });

  it('lists the notes missed most, with their names', () => {
    const config = { untimedNotes: 2 };
    setup({ config });
    let shadow = shadowOf(config);
    start();
    const first = leadingNote(shadow)!;
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: wrongFor(first.letter) }));
    shadow = answer(answer(answer(shadow, wrongFor(first.letter)).state, wrongFor(first.letter)).state, wrongFor(first.letter)).state;
    for (let i = 0; i < 2; i++) {
      const l = leadingNote(shadow)!.letter;
      fireEvent.click(screen.getByRole('button', { name: l }));
      shadow = answer(shadow, l).state;
    }
    const practise = screen.getByRole('heading', { name: 'Practise these' }).parentElement!;
    expect(within(practise).getAllByRole('listitem')[0]).toHaveTextContent(`${first.pitch.letter}${first.pitch.octave}`);
    expect(within(practise).getAllByRole('listitem')[0]).toHaveTextContent('wrong 3');
  });

  it('plays again straight into a fresh round, and exits', () => {
    const { onExit } = setup({ config: { untimedNotes: 1 } });
    start();
    fireEvent.click(screen.getByRole('button', { name: leadingNote(shadowOf({ untimedNotes: 1 }))!.letter }));
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByRole('group', { name: 'Note names' })).toBeInTheDocument();
    expect(screen.getByTestId('nr-score')).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('uses the chosen bass clef and shows a different range', () => {
    setup({ config: { untimedNotes: 1 } });
    fireEvent.click(screen.getByRole('radio', { name: 'Bass clef' }));
    start();
    // First note of the seeded bass round, answered correctly, finishes the round.
    const shadow = createGame(resolveConfig({ untimedNotes: 1, untimed: true, clef: 'bass' }), createRng(SEED));
    fireEvent.click(screen.getByRole('button', { name: leadingNote(shadow)!.letter }));
    expect(screen.getByTestId('nr-final-score')).toHaveTextContent('10');
  });

  it('feedback moves with reduced motion: no shake class, but the cross still shows', () => {
    const wrongOnce = (settings: LearnerSettings) => {
      const { unmount, container } = setup({ settings });
      start();
      const lead = leadingNote(shadowOf({}, settings))!.letter;
      fireEvent.click(screen.getByRole('button', { name: wrongFor(lead) }));
      const shake = container.querySelector('.nr-note--shake') !== null;
      const root = container.querySelector('.nr-root')!.getAttribute('data-reduced');
      const text = screen.getByTestId('nr-feedback').textContent;
      unmount();
      return { shake, root, text };
    };
    const normal = wrongOnce(UNTIMED);
    const reduced = wrongOnce({ ...UNTIMED, reducedMotion: true });
    expect(normal.shake).toBe(true);
    expect(normal.root).toBeNull();
    expect(reduced.shake).toBe(false);
    expect(reduced.root).toBe('true');
    expect(reduced.text).toContain('✗');
  });
});

describe('pause and resume', () => {
  it('pauses with the button, blocks answers, and resumes after a 3-2-1 countdown', () => {
    vi.useFakeTimers();
    setup({ config: { untimedNotes: 5 } });
    const shadow = shadowOf({ untimedNotes: 5 });
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
    for (const b of within(screen.getByRole('group', { name: 'Note names' })).getAllByRole('button')) expect(b).toBeDisabled();
    // Computer keys are ignored while paused.
    fireEvent.keyDown(window, { key: leadingNote(shadow)!.letter.toLowerCase() });
    expect(screen.getByTestId('nr-score')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByRole('group', { name: 'Paused' })).not.toBeInTheDocument();
    expect(screen.getByTestId('nr-countdown')).toHaveTextContent('3');
    expect(status()).toHaveTextContent('Resuming in 3');
    fireEvent.keyDown(window, { key: leadingNote(shadow)!.letter.toLowerCase() });
    expect(screen.getByTestId('nr-score')).toHaveTextContent('0'); // still frozen during the countdown
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('nr-countdown')).toHaveTextContent('2');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('nr-countdown')).toHaveTextContent('1');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByTestId('nr-countdown')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: leadingNote(shadow)!.letter.toLowerCase() });
    expect(screen.getByTestId('nr-score')).toHaveTextContent('10');
  });

  it('pauses when the tab is hidden', () => {
    setup();
    start();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    }
  });

  it('pausing during the countdown goes back to paused', () => {
    vi.useFakeTimers();
    setup();
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('nr-countdown')).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    }
    expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
    expect(screen.queryByTestId('nr-countdown')).not.toBeInTheDocument();
  });
});

describe('piano keys answer mode', () => {
  const key = (name: string) => screen.getByRole('button', { name });
  const tap = (name: string) => {
    const el = key(name);
    fireEvent.pointerDown(el, { pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
  };

  it('shows one octave C4..B4 with sound on, and maps a key to its letter (any octave)', () => {
    const config = { untimedNotes: 2 };
    setup({ config });
    fireEvent.click(screen.getByRole('radio', { name: 'Piano keys' }));
    let shadow = createGame(resolveConfig({ ...config, untimed: true, answerMode: 'keyboard' }), createRng(SEED));
    start();
    expect(screen.queryByRole('group', { name: 'Note names' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Piano keyboard' })).toBeInTheDocument();
    expect(key('C 4')).toBeInTheDocument();
    expect(key('B 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'C 5' })).not.toBeInTheDocument();

    // A black key is never a natural name: wrong.
    tap('C sharp 4');
    expect(status()).toHaveTextContent('Not quite. Try again.');
    // A white key of the wrong letter: wrong.
    const lead = leadingNote(shadow)!.letter;
    tap(`${wrongFor(lead)} 4`);
    expect(status()).toHaveTextContent('Not quite. Try again.');
    // The right letter: correct. The game reads the letter, not the octave the note sits in.
    tap(`${lead} 4`);
    expect(status()).toHaveTextContent(/Correct/);
    expect(screen.getByTestId('nr-score')).toHaveTextContent('10');
    shadow = answer(shadow, lead).state;
    // Keyboard makes its own piano sound.
    expect(audio.noteOn).toHaveBeenCalled();
    tap(`${leadingNote(shadow)!.letter} 4`);
    expect(screen.getByTestId('nr-final-score')).toHaveTextContent('20');
  });

  it('is silent from the keyboard when sound is off', () => {
    setup({ settings: { ...UNTIMED, soundOn: false }, config: { untimedNotes: 3, answerMode: 'keyboard' } });
    start();
    tap('C 4');
    expect(audio.noteOn).not.toHaveBeenCalled();
  });
});

describe('timed round with a stubbed animation frame', () => {
  function stubFrames() {
    let queue: { id: number; cb: FrameRequestCallback }[] = [];
    let next = 1;
    let now = 1000;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queue.push({ id: next, cb });
      return next++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      queue = queue.filter((q) => q.id !== id);
    });
    return {
      pending: () => queue.length,
      /** Runs frames of `frameMs` until `ms` have passed. */
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

  it('moves notes by transform only, spawns, misses, and ends the round on time', () => {
    const frames = stubFrames();
    const { onFinish, container } = setup({ settings: DEFAULT_SETTINGS, config: { roundSeconds: 10 } });
    start();
    expect(screen.getByTestId('nr-time')).toHaveTextContent('0:10');
    expect(frames.pending()).toBe(1);

    frames.advance(100);
    const notes = screen.getAllByTestId('nr-note');
    expect(notes).toHaveLength(1);
    const first = notes[0] as HTMLElement;
    const stage = screen.getByTestId('nr-stage');
    const svgBefore = first.querySelector('svg');
    const t0 = first.style.transform;
    expect(t0).toMatch(/^translate3d\(/);

    frames.advance(1000);
    const again = screen.getAllByTestId('nr-note')[0] as HTMLElement;
    // Same element and same sprite markup: no remount, no re-layout; only the transform moved.
    expect(again).toBe(first);
    expect(again.querySelector('svg')).toBe(svgBefore);
    expect(again.style.transform).not.toBe(t0);
    const x = (el: HTMLElement) => Number(/translate3d\(([-\d.]+)px/.exec(el.style.transform)![1]);
    expect(x(again)).toBeLessThan(x({ style: { transform: t0 } } as HTMLElement));
    expect(again.style.left).toBe('');
    expect(stage.querySelectorAll('.vf-stave').length).toBeLessThanOrEqual(1);

    // Unanswered, the first note reaches the line at 8 s: a miss with its name revealed.
    frames.advance(7500);
    expect(status().textContent).toMatch(/Missed\. It was [A-G]\./);
    expect(screen.getByTestId('nr-feedback')).toHaveTextContent(/Missed: it was [A-G]/);
    expect(screen.getByTestId('nr-feedback')).toHaveTextContent('!');
    expect(onFinish).not.toHaveBeenCalled();

    frames.advance(2500); // past 10 s
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.missed).toBeGreaterThanOrEqual(1);
    expect(result.correct).toBe(0);
    expect(result.untimed).toBe(false);
    expect(screen.getByTestId('nr-final-score')).toHaveTextContent('0');
    expect(screen.queryByTestId('nr-pb')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="nr-time"]')).toBeNull();
    // Missing costs nothing but the streak; the miss sound is the "wrong" one, and the round
    // finishes with the completion sound.
    const sounds = audio.playUi.mock.calls.map((c) => c[0]);
    expect(sounds).toContain('wrong');
    expect(sounds.at(-1)).toBe('complete');
  });

  it('answers the leading note, scores with the speed bonus, and stops the loop while paused', () => {
    const frames = stubFrames();
    setup({ settings: DEFAULT_SETTINGS, config: { roundSeconds: 30 } });
    start();
    // Nothing to answer yet: the first frame has dt 0 and the first note spawns on the next tick.
    // Mirror the component's frames on a twin game: dt 0 first, then 50 ms frames.
    frames.advance(1000, 50);
    let twin = shadowOf({ roundSeconds: 30 }, DEFAULT_SETTINGS);
    for (let i = 0; i < 20; i++) twin = tick(twin, i === 0 ? 0 : 50).state;
    const lead = leadingNote(twin)!;
    expect(lead.x).toBeCloseTo(1 - 950 / 8000, 6);
    fireEvent.click(screen.getByRole('button', { name: lead.letter }));
    // x = 0.88125 -> speed bonus floor(8.8) = 8 -> (10 + 8) x 1.
    expect(screen.getByTestId('nr-score')).toHaveTextContent('18');
    expect(screen.getByTestId('nr-multiplier')).toHaveTextContent('x1');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(frames.pending()).toBe(0); // the loop is cancelled while paused
    const before = screen.getByTestId('nr-time').textContent;
    frames.advance(5000);
    expect(screen.getByTestId('nr-time').textContent).toBe(before); // the clock is frozen
  });
});

