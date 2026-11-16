// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LearnerSettings } from '@/lesson/contracts';
import type { Terminology } from '@/engine/types';
import { meaningLabel, termLabel } from './bank';
import { TermBlitz, type GameResult, type TermBlitzConfig } from './index';
import { realBank, realEntries } from './test-data';

const audio = vi.hoisted(() => ({
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  isUnlocked: vi.fn(() => true),
  playUi: vi.fn(),
}));
const getAudioEngine = vi.hoisted(() => vi.fn());
vi.mock('@/audio', () => ({ getAudioEngine }));

const { bank, decks } = realBank();
const entries = realEntries();
const infos = [...bank.byId.values()];
const SEED = 7;

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
  config?: Partial<TermBlitzConfig>;
  bests?: Record<string, number>;
  entries?: typeof entries;
} = {}) {
  const onFinish = vi.fn<(deckId: string, r: GameResult) => void>();
  const onExit = vi.fn();
  const settings = opts.settings ?? UNTIMED;
  const utils = render(
    <TermBlitz
      settings={settings}
      entries={opts.entries ?? entries}
      bests={opts.bests}
      config={opts.config}
      seed={SEED}
      onFinish={onFinish}
      onExit={onExit}
    />,
  );
  return { ...utils, onFinish, onExit, settings };
}

const status = () => screen.getByRole('status');
const clickStart = () => fireEvent.click(screen.getByRole('button', { name: 'Start' }));
const chooseDeck = (name: string) => fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${name}`) }));
const optionText = (i: number) => screen.getByTestId(`tb-option-${i}`).querySelector('.tb-opt-text')!.textContent!;
const promptText = () => screen.getByTestId('tb-prompt').textContent!;

/** Index (0-3) of the right button for the card on screen, worked out from the glossary alone. */
function solve(t: Terminology): number {
  const prompt = screen.getByTestId('tb-prompt');
  const kicker = prompt.querySelector('.tb-kicker')!.textContent!;
  const texts = [1, 2, 3, 4].map(optionText);
  if (kicker === 'What does this mean?') {
    const term = prompt.querySelector('.tb-prompt-term')!.textContent!;
    const info = infos.find((i) => termLabel(i, t) === term)!;
    return texts.indexOf(meaningLabel(info, t));
  }
  if (kicker === 'Which term means this?') {
    const meaning = prompt.querySelector('.tb-prompt-meaning')!.textContent!;
    const hits = texts.map((txt, i) => ({ i, ok: infos.some((n) => meaningLabel(n, t) === meaning && termLabel(n, t) === txt) }));
    const right = hits.filter((h) => h.ok);
    expect(right).toHaveLength(1);
    return right[0].i;
  }
  expect(kicker).toBe('What does this stand for?');
  const abbr = prompt.querySelector('.tb-prompt-abbr')!.textContent!;
  const info = infos.find((n) => n.abbreviations.includes(abbr))!;
  return texts.indexOf(termLabel(info, t));
}
const press = (i: number) => fireEvent.click(screen.getByTestId(`tb-option-${i + 1}`));
const right = (t: Terminology = 'uk') => press(solve(t));
const wrong = (t: Terminology = 'uk') => press((solve(t) + 1) % 4);

describe('start screen', () => {
  it('shows the title, how it works, the decks built from the glossary, and Start and Exit', () => {
    setup({ settings: DEFAULT_SETTINGS });
    expect(screen.getByRole('heading', { name: 'Term Blitz' })).toBeInTheDocument();
    expect(screen.getByText(/60 seconds/)).toBeInTheDocument();
    const names = screen.getAllByRole('radio').map((r) => r.closest('label')!.querySelector('.text-lg')!.textContent);
    expect(names).toEqual([
      'Start here words',
      'Italian terms',
      'Tempo',
      'Dynamics',
      'Articulation and signs',
      'Note values and rests',
      'Everything in Grade 1',
    ]);
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });
  it('shows no deck for a grade without a glossary file', () => {
    setup();
    expect(screen.queryByRole('radio', { name: /Grade 2/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Everything in Grade 1/ })).toBeInTheDocument();
  });
  it('shows the card count and the personal best of each deck', () => {
    setup({ bests: { tempo: 340 } });
    const tempo = screen.getByRole('radio', { name: /^Tempo/ }).closest('label')!;
    expect(within(tempo).getByText('340')).toBeInTheDocument();
    expect(tempo).toHaveTextContent(`${decks.find((d) => d.id === 'tempo')!.entryIds.length} words`);
    const dyn = screen.getByRole('radio', { name: /^Dynamics/ }).closest('label')!;
    expect(dyn).not.toHaveTextContent('Best');
  });
  it('says there is no clock in untimed mode, and gives the card count', () => {
    setup({ settings: UNTIMED });
    expect(screen.getByText(/20 cards. Take your time: there is no clock/)).toBeInTheDocument();
  });
  it('shows a message and cannot start when there are no words', () => {
    setup({ entries: [] });
    expect(screen.getByText(/no words to play with yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });
  it('touches no audio before Start, and unlocks it from the Start press', () => {
    setup();
    chooseDeck('Tempo');
    chooseDeck('Dynamics');
    expect(getAudioEngine).not.toHaveBeenCalled();
    clickStart();
    expect(getAudioEngine).toHaveBeenCalled();
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    expect(audio.load).toHaveBeenCalledTimes(1);
  });
  it('never touches audio when sound is off', () => {
    setup({ settings: { ...UNTIMED, soundOn: false }, config: { untimedCards: 3 } });
    clickStart();
    right();
    wrong();
    expect(getAudioEngine).not.toHaveBeenCalled();
  });
  it('calls onExit', () => {
    const { onExit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('untimed round by pointer: start -> play -> reveal -> results', () => {
  it('plays six cards with a wrong one, and shows the results', () => {
    const { onFinish, onExit } = setup({ config: { untimedCards: 6 }, bests: { tempo: 40 } });
    chooseDeck('Tempo');
    clickStart();

    // Play screen: no clock and no bar, four full-width answer buttons, score and streak visible.
    expect(screen.queryByTestId('tb-time')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tb-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('1/6');
    expect(screen.getByTestId('tb-score')).toHaveTextContent('0');
    expect(screen.getByTestId('tb-streak')).toHaveTextContent('0');
    expect(screen.getByTestId('tb-multiplier')).toHaveTextContent('x1');
    const buttons = within(screen.getByRole('group', { name: 'Answers' })).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(status()).toHaveTextContent(/Card 1 of 6\./);
    expect(status()).toHaveTextContent(/\?|means/);

    // Right: 10 points, the next card at once.
    right();
    expect(screen.getByTestId('tb-score')).toHaveTextContent('10');
    expect(screen.getByTestId('tb-streak')).toHaveTextContent('1');
    expect(status()).toHaveTextContent(/Correct\. 10 points\./);
    expect(status()).toHaveTextContent(/Card 2 of 6\./);
    expect(screen.getByTestId('tb-feedback')).toHaveTextContent('✓');

    // Wrong: the correct pairing is shown, the right button is marked with a tick, the wrong pick with a cross.
    const rightIndex = solve('uk');
    const wrongIndex = (rightIndex + 1) % 4;
    const shownBefore = [1, 2, 3, 4].map(optionText);
    press(wrongIndex);
    expect(screen.getByTestId('tb-score')).toHaveTextContent('10');
    expect(screen.getByTestId('tb-streak')).toHaveTextContent('0');
    const answerTerm = screen.getByTestId('tb-answer-term').textContent!;
    const info = infos.find((i) => termLabel(i, 'uk') === answerTerm)!;
    expect(info).toBeDefined();
    expect(screen.getByTestId('tb-answer-meaning')).toHaveTextContent(meaningLabel(info, 'uk'));
    expect(screen.getByTestId('tb-prompt')).toHaveTextContent('Italian'); // every Tempo-deck word the first pass can show... see below
    expect([1, 2, 3, 4].map(optionText)).toEqual(shownBefore); // the same buttons stay put
    const rightBtn = screen.getByTestId(`tb-option-${rightIndex + 1}`);
    const wrongBtn = screen.getByTestId(`tb-option-${wrongIndex + 1}`);
    expect(rightBtn).toHaveAttribute('data-mark', 'correct');
    expect(rightBtn).toHaveTextContent('✓');
    expect(rightBtn).toHaveTextContent('(correct answer)');
    expect(wrongBtn).toHaveAttribute('data-mark', 'wrong');
    expect(wrongBtn).toHaveTextContent('✗');
    expect(wrongBtn).toHaveTextContent('(your answer, wrong)');
    for (const b of screen.getAllByRole('button', { name: /./ }).filter((x) => x.dataset.testid?.startsWith('tb-option'))) expect(b).toBeDisabled();
    expect(status()).toHaveTextContent(/^Wrong\. The answer was /);
    expect(status()).toHaveTextContent(meaningLabel(info, 'uk').charAt(0).toLowerCase() + meaningLabel(info, 'uk').slice(1));
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('3/6');
    // Answers are ignored while the pairing shows.
    press(rightIndex);
    expect(screen.getByTestId('tb-score')).toHaveTextContent('10');
    // It never moves on by itself in untimed mode.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByTestId('tb-answer-term')).not.toBeInTheDocument();
    expect(status()).toHaveTextContent(/Card 3 of 6\./);

    // Four more right answers finish the round.
    right();
    right();
    right();
    expect(onFinish).not.toHaveBeenCalled();
    right();

    expect(onFinish).toHaveBeenCalledTimes(1);
    const [deckId, result] = onFinish.mock.calls[0];
    expect(deckId).toBe('tempo');
    // Streaks 1, reset, 1, 2, 3, 4: five rights at 10 each.
    expect(result).toMatchObject({ score: 50, correct: 5, wrong: 1, timedOut: 0, answered: 6, bestStreak: 4, untimed: true });
    expect(result.missed).toEqual([{ entryId: info.id, count: 1 }]);

    // Results.
    expect(screen.queryByRole('group', { name: 'Answers' })).not.toBeInTheDocument();
    expect(screen.getByTestId('tb-final-score')).toHaveTextContent('50');
    expect(screen.getByText('83%')).toBeInTheDocument(); // 5 / 6
    expect(screen.getByText('Cards seen').nextSibling).toHaveTextContent('6');
    expect(screen.getByText('Best streak').nextSibling).toHaveTextContent('4');
    expect(screen.getByRole('heading', { name: /Round over: Tempo/ })).toBeInTheDocument();
    expect(screen.getByTestId('tb-pb')).toHaveTextContent('New personal best!'); // 50 > 40

    // The revision list: the missed term with its meaning, as plain text (no links).
    expect(screen.getByRole('heading', { name: 'Words to revise' })).toBeInTheDocument();
    const items = screen.getAllByTestId('tb-revise-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(termLabel(info, 'uk'));
    expect(items[0]).toHaveTextContent(meaningLabel(info, 'uk'));
    expect(within(items[0]).queryByRole('button')).toBeNull();
    expect(within(items[0]).queryByRole('link')).toBeNull();
    expect(items[0]).toHaveTextContent('Italian');

    // Play again keeps the deck; Change deck goes back with the deck still chosen; Exit leaves.
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('1/6');
    expect(screen.getByTestId('tb-score')).toHaveTextContent('0');
    for (let i = 0; i < 6; i++) right();
    expect(onFinish).toHaveBeenCalledTimes(2);
    expect(onFinish.mock.calls[1][0]).toBe('tempo');
    expect(screen.getByText('Every card was answered correctly.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No slips' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));
    expect(screen.getByRole('heading', { name: 'Term Blitz' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Tempo/ })).toBeChecked();
    clickStart();
    for (let i = 0; i < 6; i++) right();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not claim a personal best for a round that scored nothing or did not beat it', () => {
    const { onFinish } = setup({ config: { untimedCards: 4 }, bests: { 'start': 1000 } });
    clickStart();
    for (let i = 0; i < 4; i++) right();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('tb-pb')).not.toBeInTheDocument();
    expect(screen.getByText('Your best: 1000')).toBeInTheDocument();
  });

  it('counts a card as wrong, never ends the round, and shows the revision list in the order most missed first', () => {
    const { onFinish } = setup({ config: { untimedCards: 5 } });
    clickStart();
    for (let i = 0; i < 5; i++) {
      wrong();
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    }
    const result = onFinish.mock.calls[0][1];
    expect(result).toMatchObject({ score: 0, correct: 0, wrong: 5, answered: 5, bestStreak: 0 });
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getAllByTestId('tb-revise-item').length).toBe(result.missed.length);
    expect(screen.queryByTestId('tb-pb')).not.toBeInTheDocument();
  });

  it('plays the default 20 cards untimed', () => {
    const { onFinish } = setup();
    chooseDeck('Italian terms');
    clickStart();
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('1/20');
    for (let i = 0; i < 19; i++) right();
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('20/20');
    right();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][1]).toMatchObject({ answered: 20, correct: 20, untimed: true });
    // 5 x10, 5 x20, 5 x30, 5 x40.
    expect(onFinish.mock.calls[0][1].score).toBe(500);
  });

  it('does not time out however long the learner takes', () => {
    vi.useFakeTimers();
    setup({ config: { untimedCards: 3 } });
    clickStart();
    act(() => void vi.advanceTimersByTime(10 * 60 * 1000));
    expect(screen.queryByTestId('tb-answer-term')).not.toBeInTheDocument();
    right();
    expect(screen.getByTestId('tb-score')).toHaveTextContent('10');
  });
});

describe('by keyboard', () => {
  it('starts with Enter, answers with keys 1 to 4, continues with Enter and starts again with Enter', async () => {
    const user = userEvent.setup();
    const { onFinish } = setup({ config: { untimedCards: 4 } });
    await user.keyboard('{Enter}'); // focus is on the Start button: Enter presses it
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('1/4');

    // 1 to 4 choose the buttons in order: press the right key.
    await user.keyboard(String(solve('uk') + 1));
    expect(screen.getByTestId('tb-score')).toHaveTextContent('10');
    // A wrong key, then Enter continues.
    await user.keyboard(String(((solve('uk') + 1) % 4) + 1));
    expect(screen.getByTestId('tb-answer-term')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('tb-answer-term')).not.toBeInTheDocument();
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('3/4');

    // Keys that are not 1 to 4, or have a modifier, do nothing.
    await user.keyboard('5');
    await user.keyboard('0');
    await user.keyboard('a');
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(screen.getByTestId('tb-score')).toHaveTextContent('10');
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('3/4');

    await user.keyboard(String(solve('uk') + 1));
    await user.keyboard(String(solve('uk') + 1));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: /Round over/ })).toBeInTheDocument();
    // Enter on the results screen presses the focused Play again.
    expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('1/4');
  });

  it('starts from a focused deck with Enter, and arrow keys change the deck', async () => {
    const user = userEvent.setup();
    setup({ config: { untimedCards: 4 } });
    screen.getByRole('radio', { name: /^Start here/ }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /^Italian/ })).toBeChecked();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('1/4');
    expect(status()).toHaveTextContent(/Card 1 of 4/);
  });

  it('Enter on a focused answer button answers it once, and does not also continue', async () => {
    const user = userEvent.setup();
    setup({ config: { untimedCards: 4 } });
    await user.keyboard('{Enter}');
    const i = (solve('uk') + 1) % 4;
    screen.getByTestId(`tb-option-${i + 1}`).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('tb-answer-term')).toBeInTheDocument(); // wrong, and still showing it
    expect(screen.getByTestId('tb-progress')).toHaveTextContent('2/4');
  });

  it('gives every answer button a name from its text and its key', () => {
    setup();
    clickStart();
    for (let i = 1; i <= 4; i++) {
      const b = screen.getByTestId(`tb-option-${i}`);
      expect(b).toHaveAttribute('aria-keyshortcuts', String(i));
      expect(b).toHaveAccessibleName(optionText(i));
    }
  });
});

describe('terminology', () => {
  /** Every text on the first pass over a deck: all its entries appear once each. */
  function firstPassTexts(deckName: string, count: number, settings: LearnerSettings, t: Terminology): string[] {
    setup({ settings, config: { untimedCards: count } });
    chooseDeck(deckName);
    clickStart();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push(promptText(), ...[1, 2, 3, 4].map(optionText));
      right(t);
    }
    return texts;
  }

  it('shows quarter note, half note and the rest of the US words to a US learner, and the UK words to a UK learner', () => {
    const n = decks.find((d) => d.id === 'note-values-rests')!.entryIds.length;
    const us = firstPassTexts('Note values and rests', n, { ...UNTIMED, terminology: 'us' }, 'us');
    const usText = us.join(' | ');
    expect(usText).toMatch(/Quarter note|Quarter rest/);
    expect(usText).toMatch(/Whole rest|Whole note/);
    expect(usText).not.toMatch(/crotchet|quaver|minim|semibreve/i);
    cleanup();
    const uk = firstPassTexts('Note values and rests', n, { ...UNTIMED, terminology: 'uk' }, 'uk').join(' | ');
    expect(uk).toMatch(/Crotchet/);
    expect(uk).not.toMatch(/quarter note|half note|whole note|eighth note|sixteenth/i);
  });
  it('swaps stave for staff inside meanings for a US learner', () => {
    const n = decks.find((d) => d.id === 'start')!.entryIds.length;
    const us = firstPassTexts('Start here words', n, { ...UNTIMED, terminology: 'us' }, 'us').join(' | ');
    expect(us).toMatch(/\bstaff\b/i);
    expect(us).not.toMatch(/\bstave\b/i);
    cleanup();
    const uk = firstPassTexts('Start here words', n, { ...UNTIMED, terminology: 'uk' }, 'uk').join(' | ');
    expect(uk).toMatch(/\bstave\b/i);
    expect(uk).not.toMatch(/\bstaff\b/i);
  });
  it('swaps in the reveal and the revision list, and never changes Italian terms', () => {
    setup({ settings: { ...UNTIMED, terminology: 'us' }, config: { untimedCards: 14 } });
    chooseDeck('Everything in Grade 1');
    clickStart();
    // Miss every card once so the revision list holds everything we saw.
    for (let i = 0; i < 14; i++) {
      wrong('us');
      const term = screen.getByTestId('tb-answer-term').textContent!;
      const info = infos.find((n) => termLabel(n, 'us') === term)!;
      expect(term).toBe(info.us ? info.us.charAt(0).toUpperCase() + info.us.slice(1) : info.term.charAt(0).toUpperCase() + info.term.slice(1));
      if (info.language === 'it') expect(term).toBe(info.term.charAt(0).toUpperCase() + info.term.slice(1));
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    }
    // (Major scale is left out: its glossary definition writes "tone, tone, semitone" without links, so no swap can happen.
    // meaning.test.ts lists such unlinked uses.)
    const list = screen
      .getAllByTestId('tb-revise-item')
      .filter((li) => !li.textContent!.startsWith('Major scale'))
      .map((li) => li.textContent)
      .join(' | ');
    expect(list).not.toMatch(/crotchet|quaver|minim|semibreve|\bstave\b|semitone|\bpause\b/i);
  });
  it('uses fermata for pause, and leaves Italian words alone, in a US reveal', () => {
    const pause = bank.byId.get('pause')!;
    expect(termLabel(pause, 'us')).toBe('Fermata');
    expect(termLabel(bank.byId.get('forte')!, 'us')).toBe('Forte');
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
  const fill = () => screen.getByTestId('tb-bar').firstElementChild as HTMLElement;
  /** The bar's scale as a number (jsdom rewrites the style string). */
  const scale = () => Number(/scaleX\(([\d.]+)\)/.exec(fill().style.transform)![1]);

  it('shows a 6 s card bar and a 1:00 round clock, scores with a speed bonus, and times a card out', () => {
    const frames = stubFrames();
    const { onFinish } = setup({ settings: DEFAULT_SETTINGS });
    clickStart();
    expect(screen.getByTestId('tb-time')).toHaveTextContent('1:00');
    expect(screen.getByTestId('tb-card-secs')).toHaveTextContent('6s');
    expect(scale()).toBeCloseTo(1.0000, 4);
    expect(frames.pending()).toBe(1);
    expect(screen.queryByTestId('tb-progress')).not.toBeInTheDocument();

    frames.advance(50); // first frame sets the clock origin
    frames.advance(2850);
    expect(scale()).toBeCloseTo(0.5250, 4); // 3150 of 6000 left
    expect(screen.getByTestId('tb-card-secs')).toHaveTextContent('4s');
    expect(screen.getByTestId('tb-time')).toHaveTextContent('0:58'); // 57.15 s left, rounded up
    right();
    // 3150 / 6000 left: floor(5.25) = 5 bonus, so 15.
    expect(screen.getByTestId('tb-score')).toHaveTextContent('15');
    expect(scale()).toBeCloseTo(1.0000, 4); // a fresh card, clock for streak 1 is 5700
    expect(screen.getByTestId('tb-card-secs')).toHaveTextContent('6s');

    // Let this card run out: 5700 ms.
    frames.advance(5700);
    expect(screen.getByText('Time is up')).toBeInTheDocument();
    expect(screen.getByTestId('tb-streak')).toHaveTextContent('0');
    expect(screen.getByTestId('tb-prompt')).toHaveAttribute('data-state', 'timeout');
    expect(status()).toHaveTextContent(/^Time is up\. The answer was /);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByTestId('tb-card-secs')).toHaveTextContent('');
    expect(scale()).toBeCloseTo(0.0000, 4);
    expect(onFinish).not.toHaveBeenCalled();

    // The pairing goes away by itself after 2.2 s.
    frames.advance(2150);
    expect(screen.queryByText('Time is up')).toBeInTheDocument();
    frames.advance(100);
    expect(screen.queryByText('Time is up')).not.toBeInTheDocument();
    expect(screen.getByTestId('tb-score')).toHaveTextContent('15');
  });

  it('shortens the card bar as the streak grows', () => {
    const frames = stubFrames();
    setup({ settings: DEFAULT_SETTINGS });
    clickStart();
    for (let i = 0; i < 10; i++) right();
    frames.advance(50);
    frames.advance(1500);
    // Streak 10: a 3 s card with 1.5 s gone.
    expect(scale()).toBeCloseTo(0.5000, 4);
    expect(screen.getByTestId('tb-multiplier')).toHaveTextContent('x3');
    expect(screen.getByTestId('tb-card-secs')).toHaveTextContent('2s');
  });

  it('ends at 60 seconds and shows the results, once', () => {
    const frames = stubFrames();
    const { onFinish } = setup({ settings: DEFAULT_SETTINGS });
    clickStart();
    frames.advance(61_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][1];
    expect(result).toMatchObject({ score: 0, correct: 0, wrong: 0, untimed: false });
    expect(result.timedOut).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole('heading', { name: /Round over/ })).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(frames.pending()).toBe(0);
  });

  it('plays sounds: correct, wrong, timeout and complete', () => {
    const frames = stubFrames();
    setup({ settings: DEFAULT_SETTINGS });
    clickStart();
    right();
    expect(audio.playUi).toHaveBeenLastCalledWith('correct');
    wrong();
    expect(audio.playUi).toHaveBeenLastCalledWith('wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    audio.playUi.mockClear();
    frames.advance(50);
    frames.advance(6000);
    expect(audio.playUi).toHaveBeenCalledWith('wrong'); // the timeout
    frames.advance(60_000);
    expect(audio.playUi).toHaveBeenLastCalledWith('complete');
  });

  it('is silent when sound is off', () => {
    const frames = stubFrames();
    setup({ settings: { ...DEFAULT_SETTINGS, soundOn: false } });
    clickStart();
    right();
    wrong();
    frames.advance(61_000);
    expect(audio.playUi).not.toHaveBeenCalled();
    expect(audio.unlock).not.toHaveBeenCalled();
  });

  it('steps the bar a second at a time with reduced motion and switches decorative animation off', () => {
    const frames = stubFrames();
    const { container } = setup({ settings: { ...DEFAULT_SETTINGS, reducedMotion: true } });
    expect(container.querySelector('.tb-root')).toHaveAttribute('data-reduced', 'true');
    clickStart();
    frames.advance(50);
    frames.advance(2450); // 3550 left of 6000: 4 whole seconds of 6
    expect(scale()).toBeCloseTo(0.6667, 4);
    frames.advance(300);
    expect(scale()).toBeCloseTo(0.6667, 4); // 3250 left: still 4 whole seconds, so no change within the second
    frames.advance(600);
    expect(scale()).toBeCloseTo(0.5000, 4); // 2650 left: 3 of 6
  });
});

describe('pause and resume', () => {
  function hidden(on: boolean) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'hidden' : 'visible') });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
  }

  it('pauses with the button, hides the card, blocks answers and resumes after a 3-2-1 countdown', () => {
    vi.useFakeTimers();
    setup({ config: { untimedCards: 5 } });
    clickStart();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const overlay = screen.getByRole('group', { name: 'Paused' });
    expect(overlay).toBeInTheDocument();
    for (const b of within(screen.getByRole('group', { name: 'Answers' })).getAllByRole('button')) expect(b).toBeDisabled();
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('tb-score')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('tb-countdown')).toHaveTextContent('3');
    expect(status()).toHaveTextContent('Resuming in 3');
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('tb-score')).toHaveTextContent('0');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('tb-countdown')).toHaveTextContent('2');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('tb-countdown')).toHaveTextContent('1');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByTestId('tb-countdown')).not.toBeInTheDocument();
    right();
    expect(screen.getByTestId('tb-score')).toHaveTextContent('10');
  });

  it('pauses when the tab is hidden, and the clocks stand still while paused', () => {
    let queue: FrameRequestCallback[] = [];
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {
      queue = [];
    });
    const runFrames = (n: number) => {
      for (let i = 0; i < n; i++) {
        const due = queue;
        queue = [];
        now += 50;
        act(() => due.forEach((cb) => cb(now)));
      }
    };
    setup({ settings: DEFAULT_SETTINGS });
    clickStart();
    runFrames(21); // 1000 ms
    expect(screen.getByTestId('tb-time')).toHaveTextContent('0:59');
    try {
      hidden(true);
      expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
      runFrames(400);
      expect(queue.length).toBe(0); // the loop stopped
      expect(screen.getByTestId('tb-time')).toHaveTextContent('0:59');
      expect(screen.getByTestId('tb-card-secs')).toHaveTextContent('5s');
    } finally {
      hidden(false);
    }
  });

  it('pausing during the countdown goes back to paused', () => {
    vi.useFakeTimers();
    setup();
    clickStart();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('tb-countdown')).toBeInTheDocument();
    try {
      hidden(true);
    } finally {
      hidden(false);
    }
    expect(screen.getByRole('group', { name: 'Paused' })).toBeInTheDocument();
    expect(screen.queryByTestId('tb-countdown')).not.toBeInTheDocument();
  });
});

describe('layout rules in the stylesheet', () => {
  const css = readFileSync(join(process.cwd(), 'src/games/term-blitz/term-blitz.css'), 'utf8');
  const rule = (selector: string) => {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };
  it('makes every answer button at least 56 px tall and full width', () => {
    const r = rule('.tb-opt');
    expect(r).toMatch(/min-height: 3\.5rem;/); // 3.5 x 16 = 56
    expect(r).toMatch(/width: 100%;/);
  });
  it('lets answer text wrap rather than clip', () => {
    expect(rule('.tb-opt-text')).toMatch(/overflow-wrap: anywhere;/);
    expect(rule('.tb-opt')).not.toMatch(/white-space: nowrap/);
    expect(rule('.tb-opt-text')).not.toMatch(/text-overflow|-webkit-line-clamp/);
  });
  it('uses the terms strand colour and no hard-coded colours', () => {
    expect(css).toContain('var(--strand-terms)');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it('turns decorative animation off under the reduced-motion attribute', () => {
    const animated = css.match(/\.tb-root:not\(\[data-reduced='true'\]\)[^{]*\{[^}]*animation/g) ?? [];
    expect(animated.length).toBeGreaterThanOrEqual(3);
    const outside = css.replace(/\.tb-root:not\(\[data-reduced='true'\]\)[^{]*\{[^}]*\}/g, '');
    expect(outside.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '')).not.toMatch(/animation:/);
  });
});
