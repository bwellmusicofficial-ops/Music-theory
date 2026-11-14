import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LearnerSettings, type LessonProgress } from '../contracts';
import type { GlossaryEntry, Lesson } from '../schema';
import { createLocalProgressSink } from '../progress/local';
import { LessonPlayer } from './lesson-player';
import {
  MemorySink,
  MemoryStorage,
  authored,
  buildLesson,
  fixtureGenerators,
  fixtureModule,
  fixtureRegistry,
  generated,
  type BuildOptions,
} from './test-fixtures';

const audio = vi.hoisted(() => ({
  playUi: vi.fn(),
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  setMuted: vi.fn(),
  isUnlocked: vi.fn(() => true),
  now: vi.fn(() => 0),
  startMetronome: vi.fn(() => ({ stop: vi.fn() })),
  playPassage: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve() })),
}));
vi.mock('@/audio', () => ({ getAudioEngine: () => audio }));

const GLOSSARY: GlossaryEntry[] = [
  { id: 'crotchet', term: 'crotchet', us: 'quarter note', language: 'en', definition: 'A note worth 1 beat.', grade: '1', strand: 'rhythm' },
  { id: 'bar', term: 'bar', us: 'measure', language: 'en', definition: 'A box of beats.', grade: '1', strand: 'rhythm' },
];

interface Setup {
  lesson?: Lesson;
  build?: BuildOptions;
  settings?: Partial<LearnerSettings>;
  registry?: ReturnType<typeof fixtureRegistry>;
  sink?: MemorySink;
  saved?: LessonProgress;
  exhibitRenderers?: React.ComponentProps<typeof LessonPlayer>['exhibitRenderers'];
}

async function setup(o: Setup = {}) {
  const sink = o.sink ?? new MemorySink();
  const lesson = o.lesson ?? buildLesson(o.build);
  if (o.saved) sink.stored.set(lesson.id, o.saved);
  const onExit = vi.fn();
  const onComplete = vi.fn();
  render(
    <LessonPlayer
      lesson={lesson}
      glossary={GLOSSARY}
      settings={{ ...DEFAULT_SETTINGS, ...o.settings }}
      questionTypes={o.registry ?? fixtureRegistry()}
      generators={fixtureGenerators}
      progress={sink}
      exhibitRenderers={o.exhibitRenderers}
      onExit={onExit}
      onComplete={onComplete}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { sink, lesson, onExit, onComplete };
}

const user = () => userEvent.setup();
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const h1 = () => screen.getByRole('heading', { level: 1 });
const right = () => fireEvent.click(btn('Right answer'));
const wrong = () => fireEvent.click(btn('Wrong answer'));
const playKey = (name: string) => fireEvent.pointerDown(btn(name), { pointerId: 1, pointerType: 'touch' });
const next = (name: string | RegExp = 'Continue') => fireEvent.click(btn(name));

/** hook -> explore -> name -> practice question 1. */
function toPractice(cards = 2) {
  next();
  playKey('E 4');
  next();
  for (let i = 0; i < cards; i++) next();
}
function practiceAllRight(n = 4) {
  for (let i = 0; i < n; i++) {
    right();
    next(/^Continue/);
  }
}
function answerChallenge(pattern: boolean[]) {
  pattern.forEach((ok, i) => {
    (ok ? right : wrong)();
    next(i === pattern.length - 1 ? 'See result' : 'Next');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LessonPlayer: the six steps', () => {
  it('shows a loading state, then the hook', async () => {
    await setup();
    expect(h1()).toHaveTextContent('Test lesson');
    expect(screen.getByText(/Hook text about a/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Lesson progress' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('step-label')).toHaveTextContent('Step 1 of 6: Hook');
  });

  it('walks hook to recap with correct answers and reports completion', async () => {
    const { sink, onComplete } = await setup();
    // hook: no Back; the passage falls back to the placeholder
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByText('Notation preview unavailable')).toBeInTheDocument();
    next();

    // explore
    expect(h1()).toHaveTextContent('Try it');
    expect(screen.getByTestId('goal')).toHaveTextContent('Play two keys.');
    expect(btn('Continue')).toBeDisabled();
    expect(screen.getByTestId('explore-status')).toHaveTextContent('Have a go');
    playKey('E 4');
    expect(btn('Continue')).toBeEnabled();
    next();

    // name: two cards
    expect(screen.getByTestId('name-card')).toHaveTextContent('Card 1');
    next();
    expect(screen.getByTestId('name-card')).toHaveTextContent('Card 2');
    next();

    // practice
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByTestId('eyebrow')).toHaveTextContent(`Practice ${i} of 4`);
      right();
      next(i === 4 ? 'Continue to the challenge' : 'Continue');
    }

    // challenge
    expect(h1()).toHaveTextContent('Ready for the challenge?');
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent('5 questions');
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent('60 seconds');
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent('Get 4 right');
    next('Start');
    expect(screen.getByTestId('countdown')).toHaveTextContent('1:00');
    answerChallenge([true, true, true, true, true]);
    expect(h1()).toHaveTextContent('Challenge passed');
    expect(screen.getByTestId('score')).toHaveTextContent('5 / 5');
    expect(screen.getByTestId('verdict')).toHaveTextContent('Passed');
    expect(audio.playUi).toHaveBeenCalledWith('complete');
    next('Continue');

    // recap
    expect(h1()).toHaveTextContent('Recap: Test lesson');
    expect(screen.getByTestId('recap-points').querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByTestId('recap-points').querySelector('strong')).toHaveTextContent('two');
    expect(screen.getByRole('progressbar', { name: 'Lesson progress' })).toHaveAttribute('aria-valuenow', '100');
    next('Finish');
    expect(onComplete).toHaveBeenCalledWith({ lessonId: 'g1-test-lesson', completed: true, bestScore: 1 });

    // Everything reached the sink.
    expect(sink.attempts).toHaveLength(9);
    expect(sink.attempts.filter((a) => a.step === 'practice')).toHaveLength(4);
    expect(sink.attempts.filter((a) => a.step === 'challenge')).toHaveLength(5);
    expect(sink.lastSave).toMatchObject({ lessonId: 'g1-test-lesson', state: 'complete', step: 'recap', bestScore: 1 });
    const steps = sink.saves.map((s) => s.step);
    expect(steps).toEqual(expect.arrayContaining(['explore', 'name', 'practice', 'challenge', 'recap']));
  });

  it('Back goes from explore to the hook and from practice 1 to the last name card', async () => {
    await setup();
    next();
    next('Back');
    expect(h1()).toHaveTextContent('Test lesson');
    toPractice();
    next('Back');
    expect(screen.getByTestId('name-card')).toHaveTextContent('Card 2');
    next('Back');
    expect(screen.getByTestId('name-card')).toHaveTextContent('Card 1');
    next('Back');
    expect(h1()).toHaveTextContent('Try it');
    expect(btn('Continue')).toBeEnabled(); // stays unlocked
  });

  it('exits through the close button', async () => {
    const { onExit } = await setup();
    fireEvent.click(btn('Exit lesson'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('name step: "Explain it another way" reveals the alternative', async () => {
    await setup();
    next();
    playKey('E 4');
    next();
    expect(screen.queryByTestId('name-alternative')).toBeNull();
    fireEvent.click(btn('Explain it another way'));
    expect(screen.getByTestId('name-alternative')).toHaveTextContent('The other way to see it.');
    expect(screen.queryByRole('button', { name: 'Explain it another way' })).toBeNull();
    expect(screen.getByTestId('announcer')).toHaveTextContent('Another explanation shown below');
    next();
    expect(screen.queryByTestId('name-alternative')).toBeNull(); // next card starts fresh
  });

  it('moves focus to the new screen heading on every transition', async () => {
    await setup();
    expect(h1()).toHaveFocus();
    next();
    expect(h1()).toHaveTextContent('Try it');
    expect(h1()).toHaveFocus();
    playKey('E 4');
    next();
    expect(h1()).toHaveFocus();
    next();
    next();
    expect(h1()).toHaveTextContent('Prompt for p1');
    expect(h1()).toHaveFocus();
    right();
    next();
    expect(h1()).toHaveTextContent('Prompt for p2');
    expect(h1()).toHaveFocus();
  });

  it('announces each step in a polite live region', async () => {
    await setup();
    const live = screen.getByTestId('announcer');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Step 1 of 6: Hook');
    next();
    expect(live).toHaveTextContent('Step 2 of 6: Explore');
  });

  it('is keyboard operable: from the heading, Tab reaches Continue and Enter activates it', async () => {
    await setup();
    const u = user();
    expect(h1()).toHaveFocus();
    const order: string[] = [];
    for (let i = 0; i < 5 && document.activeElement !== btn('Continue'); i++) {
      await u.tab();
      order.push(document.activeElement?.textContent ?? '');
    }
    expect(order).toEqual(['crotchet', 'Play', 'Continue']);
    await u.keyboard('{Enter}');
    expect(h1()).toHaveTextContent('Try it');
    expect(h1()).toHaveFocus();
  });

  it('shows US terms in the lesson text and the US title', async () => {
    await setup({ settings: { terminology: 'us' } });
    expect(h1()).toHaveTextContent('Test lesson (US)');
    expect(screen.getByRole('button', { name: 'quarter note' })).toBeInTheDocument();
    next();
    playKey('E 4');
    next();
    expect(screen.getByRole('button', { name: 'measures' })).toBeInTheDocument();
  });

  it('opens a glossary popover from a link in lesson text', async () => {
    await setup();
    fireEvent.click(btn('crotchet'));
    expect(screen.getByRole('dialog')).toHaveTextContent('A note worth 1 beat.');
  });
});

describe('LessonPlayer: practice', () => {
  it('first wrong answer shows the hint, then a second attempt; the second result stands', async () => {
    const { sink } = await setup();
    toPractice();
    wrong();
    const banner = screen.getByText('Not quite').closest('[role="status"]') as HTMLElement;
    expect(banner).toHaveTextContent('Hint: Think about the beats.');
    expect(banner).toHaveAttribute('data-kind', 'wrong');
    expect(screen.getByTestId('fixture-question')).toHaveAttribute('data-locked', 'true');
    expect(audio.playUi).toHaveBeenLastCalledWith('wrong');
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 1 of 4');

    next('Try again');
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 1 of 4');
    expect(screen.getByTestId('hint')).toHaveTextContent('Think about the beats.');
    expect(screen.getByTestId('fixture-question')).toHaveAttribute('data-locked', 'false');
    right();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(audio.playUi).toHaveBeenLastCalledWith('correct');
    expect(screen.getByText(/Right, that is the correct crotchet\./)).toBeInTheDocument();
    next();
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 2 of 4');
    await act(async () => {});
    expect(sink.attempts.map((a) => [a.questionId, a.correct])).toEqual([
      ['p1', false],
      ['p1', true],
    ]);
  });

  it('a second wrong answer stands, shows the reason and moves on', async () => {
    await setup();
    toPractice();
    wrong();
    next('Try again');
    wrong();
    expect(screen.queryByText(/Hint:/)).toBeNull();
    expect(screen.getByText(/That was wrong: a crotchet lasts 1 beat\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    next();
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 2 of 4');
  });

  it('applies the US swap to feedback text', async () => {
    await setup({ settings: { terminology: 'us' } });
    next();
    playKey('E 4');
    next();
    next();
    next();
    right();
    expect(screen.getByText(/Right, that is the correct quarter note\./)).toBeInTheDocument();
  });

  it('plays sounds only when soundOn', async () => {
    await setup({ settings: { soundOn: false } });
    toPractice();
    right();
    next();
    wrong();
    expect(audio.playUi).not.toHaveBeenCalled();
  });

  it('survives the audio engine throwing', async () => {
    audio.playUi.mockImplementationOnce(() => {
      throw new Error('no audio');
    });
    await setup();
    toPractice();
    right();
    expect(screen.getByText('Correct')).toBeInTheDocument();
  });

  it('records msTaken and seeds for generated questions', async () => {
    const { sink } = await setup();
    toPractice();
    practiceAllRight(4);
    await act(async () => {});
    expect(sink.attempts.every((a) => typeof a.msTaken === 'number' && a.msTaken >= 0)).toBe(true);
    const gen = sink.attempts.find((a) => a.questionId === 'p4');
    expect(typeof gen?.seed).toBe('number');
    expect(sink.attempts.find((a) => a.questionId === 'p1')?.seed).toBeUndefined();
    expect(sink.attempts[0]).toMatchObject({ lessonId: 'g1-test-lesson', skill: 'rhythm.pulse.steady', type: 'multiple-choice', step: 'practice' });
  });

  it('shows the generated prompt', async () => {
    await setup();
    toPractice();
    practiceAllRight(3);
    expect(h1()).toHaveTextContent(/^Generated question \d$/);
  });
});

describe('LessonPlayer: developer error cards', () => {
  it('shows an error card for a missing question type and lets the learner skip', async () => {
    const lesson = buildLesson({ practice: [authored('p1'), authored('p2', 'by-ear'), authored('p3')] });
    const { sink } = await setup({ lesson, registry: fixtureRegistry(['by-ear']) });
    next();
    playKey('E 4');
    next();
    next();
    next();
    right();
    next();
    const card = screen.getByTestId('question-error');
    expect(card).toHaveTextContent('No question type "by-ear" is registered');
    expect(card).toHaveTextContent('p2');
    expect(screen.getByRole('alert')).toBe(card);
    fireEvent.click(btn('Skip this question'));
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 3 of 3');
    expect(screen.queryByTestId('question-error')).toBeNull();
    await act(async () => {});
    expect(sink.attempts.map((a) => a.questionId)).toEqual(['p1']);
  });

  it('shows an error card for an invalid payload and lists the problems', async () => {
    const strict = fixtureModule('multiple-choice', z.strictObject({ options: z.array(z.string()).min(2) }) as never);
    const registry = { ...fixtureRegistry(), 'multiple-choice': strict };
    await setup({ registry });
    toPractice();
    const card = screen.getByTestId('question-error');
    expect(card).toHaveTextContent('has an invalid multiple-choice payload');
    expect(card.textContent).toMatch(/options/);
    expect(screen.queryByTestId('fixture-question')).toBeNull();
    fireEvent.click(btn('Skip this question'));
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 2 of 4');
  });

  it('shows an error card when a generator is missing', async () => {
    const sink = new MemorySink();
    const lesson = buildLesson({ practice: [authored('p1'), authored('p2'), { ...generated('p3'), generator: { id: 'nope', params: {} } }] });
    await setup({ lesson, sink });
    toPractice();
    practiceAllRight(2);
    expect(screen.getByTestId('question-error')).toHaveTextContent('No generator is registered with id "nope"');
    fireEvent.click(btn('Skip this question'));
    expect(h1()).toHaveTextContent('Ready for the challenge?');
  });

  it('shows an error card when a question component throws while rendering', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = {
      ...fixtureModule('multiple-choice'),
      Component: () => {
        throw new Error('render exploded');
      },
    };
    await setup({ registry: { ...fixtureRegistry(), 'multiple-choice': boom } });
    toPractice();
    expect(screen.getByTestId('question-error')).toHaveTextContent('render exploded');
    fireEvent.click(btn('Skip this question'));
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 2 of 4');
  });

  it('shows an error card when mark throws', async () => {
    const bad = {
      ...fixtureModule('multiple-choice'),
      mark: () => {
        throw new Error('unknown option id');
      },
    };
    await setup({ registry: { ...fixtureRegistry(), 'multiple-choice': bad } });
    toPractice();
    right();
    expect(screen.getByTestId('question-error')).toHaveTextContent('unknown option id');
  });

  it('skipping in the challenge counts as wrong', async () => {
    const lesson = buildLesson({ challenge: [authored('c1', 'by-ear'), authored('c2'), authored('c3'), authored('c4'), authored('c5')] });
    await setup({ lesson, registry: fixtureRegistry(['by-ear']) });
    toPractice();
    practiceAllRight(4);
    next('Start');
    fireEvent.click(btn('Skip this question'));
    answerChallenge([true, true, true, true]);
    expect(screen.getByTestId('score')).toHaveTextContent('4 / 5');
    expect(screen.getByTestId('verdict')).toHaveTextContent('Passed');
  });
});

describe('LessonPlayer: challenge', () => {
  async function toChallenge(o: Setup = {}) {
    const r = await setup(o);
    toPractice();
    practiceAllRight(4);
    return r;
  }

  it('has no Back during the challenge, and no hints', async () => {
    await toChallenge();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    next('Start');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    wrong();
    expect(screen.getByText(/That was wrong/)).toBeInTheDocument();
    expect(screen.queryByText(/Hint:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Challenge 1 of 5');
    next('Next');
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Challenge 2 of 5');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('fail: shows the score, not passed, and Try again restarts at the intro', async () => {
    const { sink, onComplete } = await toChallenge();
    next('Start');
    answerChallenge([true, false, true, false, true]);
    expect(h1()).toHaveTextContent('Not this time');
    expect(screen.getByTestId('score')).toHaveTextContent('3 / 5');
    expect(screen.getByTestId('verdict')).toHaveTextContent('Not passed');
    expect(screen.getByText(/You needed 4 right/)).toBeInTheDocument();
    expect(audio.playUi).not.toHaveBeenCalledWith('complete');
    await act(async () => {});
    expect(sink.lastSave).toMatchObject({ state: 'in-progress', step: 'challenge', bestScore: 0.6 });

    next('Try again');
    expect(h1()).toHaveTextContent('Ready for the challenge?');
    next('Start');
    answerChallenge([true, true, true, true, false]);
    expect(h1()).toHaveTextContent('Challenge passed');
    expect(screen.getByTestId('score')).toHaveTextContent('4 / 5');
    await act(async () => {});
    expect(sink.lastSave).toMatchObject({ state: 'complete', bestScore: 0.8 });
    next('Continue');
    next('Finish');
    expect(onComplete).toHaveBeenCalledWith({ lessonId: 'g1-test-lesson', completed: true, bestScore: 0.8 });
  });

  it('can continue to the recap after failing; the lesson stays incomplete', async () => {
    const { onComplete, sink } = await toChallenge();
    next('Start');
    answerChallenge([false, false, false, false, false]);
    next('Continue');
    expect(h1()).toHaveTextContent('Recap');
    next('Finish');
    expect(onComplete).toHaveBeenCalledWith({ lessonId: 'g1-test-lesson', completed: false, bestScore: 0 });
    await act(async () => {});
    expect(sink.lastSave).toMatchObject({ state: 'in-progress', step: 'recap', bestScore: 0 });
  });

  it('draws count questions cycling the pool', async () => {
    const lesson = buildLesson({ count: 7, challenge: [authored('c1'), authored('c2'), authored('c3')] });
    const { sink } = await toChallenge({ lesson });
    next('Start');
    answerChallenge(Array(7).fill(true));
    await act(async () => {});
    expect(sink.attempts.filter((a) => a.step === 'challenge').map((a) => a.questionId)).toEqual(['c1', 'c2', 'c3', 'c1', 'c2', 'c3', 'c1']);
  });

  it('counts down, turns urgent and ends the round when time runs out; unanswered count as wrong', async () => {
    vi.useFakeTimers();
    const { sink } = await toChallenge();
    next('Start');
    const clock = screen.getByTestId('countdown');
    expect(clock).toHaveTextContent('1:00');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(clock).toHaveTextContent('0:55');
    right();
    next('Next');
    right();
    next('Next');
    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(clock).toHaveTextContent('0:10');
    expect(clock.className).toMatch(/danger/);
    expect(screen.getByTestId('announcer')).toHaveTextContent('10 seconds or fewer left');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(h1()).toHaveTextContent('Not this time');
    expect(screen.getByTestId('score')).toHaveTextContent('2 / 5');
    expect(screen.getByText(/Time ran out/)).toBeInTheDocument();
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(screen.getByTestId('announcer')).toHaveTextContent('Time is up');
    await act(async () => {});
    expect(sink.attempts.filter((a) => a.step === 'challenge')).toHaveLength(2);
    expect(sink.lastSave).toMatchObject({ state: 'in-progress', bestScore: 0.4 });
  });

  it('time running out can still pass when enough were right', async () => {
    vi.useFakeTimers();
    const lesson = buildLesson({ passMark: 0.5 });
    await toChallenge({ lesson });
    next('Start');
    for (let i = 0; i < 3; i++) {
      right();
      next('Next');
    }
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(h1()).toHaveTextContent('Challenge passed');
    expect(screen.getByTestId('score')).toHaveTextContent('3 / 5');
  });

  it('the clock does not start until Start is pressed', async () => {
    vi.useFakeTimers();
    await toChallenge();
    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(h1()).toHaveTextContent('Ready for the challenge?');
    next('Start');
    expect(screen.getByTestId('countdown')).toHaveTextContent('1:00');
  });

  it('untimed mode: no countdown, no expiry, intro says so', async () => {
    vi.useFakeTimers();
    await toChallenge({ settings: { untimed: true } });
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent('No clock');
    expect(screen.getByTestId('challenge-rules')).not.toHaveTextContent('seconds on the clock');
    next('Start');
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3_600_000);
    });
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Challenge 1 of 5');
    answerChallenge([true, true, true, true, true]);
    expect(h1()).toHaveTextContent('Challenge passed');
    expect(screen.queryByText(/Time ran out/)).toBeNull();
  });

  it('replay: a failed replay of a completed lesson keeps it complete and the best score', async () => {
    const sink = new MemorySink();
    const saved: LessonProgress = {
      lessonId: 'g1-test-lesson',
      state: 'complete',
      step: 'recap',
      questionIndex: 0,
      bestScore: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await setup({ sink, saved });
    expect(h1()).toHaveTextContent('Test lesson'); // restarts at the hook, not the recap
    toPractice();
    practiceAllRight(4);
    next('Start');
    answerChallenge([false, false, false, false, false]);
    expect(screen.getByText(/stays complete/)).toBeInTheDocument();
    await act(async () => {});
    expect(sink.lastSave).toMatchObject({ state: 'complete', bestScore: 1 });
    expect(sink.saves.every((s) => s.state === 'complete' && s.bestScore === 1)).toBe(true);
  });
});

describe('LessonPlayer: resume', () => {
  it('resumes mid-practice from saved progress', async () => {
    const sink = new MemorySink();
    const { lesson } = await setup({
      sink,
      saved: { lessonId: 'g1-test-lesson', state: 'in-progress', step: 'practice', questionIndex: 2, bestScore: null, updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 3 of 4');
    expect(h1()).toHaveTextContent('Prompt for p3');
    expect(lesson.id).toBe('g1-test-lesson');
    // Nothing is written just by resuming.
    await act(async () => {});
    expect(sink.saves).toHaveLength(0);
    right();
    next();
    await act(async () => {});
    expect(sink.lastSave).toMatchObject({ step: 'practice', questionIndex: 3 });
    expect(sink.attempts.map((a) => a.questionId)).toEqual(['p3']);
  });

  it('resumes at the challenge intro', async () => {
    await setup({
      saved: { lessonId: 'g1-test-lesson', state: 'in-progress', step: 'challenge', questionIndex: 0, bestScore: 0.4, updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(h1()).toHaveTextContent('Ready for the challenge?');
  });

  it('starts fresh when the saved progress cannot be loaded', async () => {
    const sink = new MemorySink();
    sink.loadLessonProgress = async () => {
      throw new Error('unavailable');
    };
    await setup({ sink });
    expect(h1()).toHaveTextContent('Test lesson');
  });

  it('works end to end with the localStorage sink: save, remount, resume', async () => {
    const storage = new MemoryStorage();
    const sink = createLocalProgressSink(storage);
    const lesson = buildLesson();
    const common = {
      lesson,
      glossary: GLOSSARY,
      settings: DEFAULT_SETTINGS,
      questionTypes: fixtureRegistry(),
      generators: fixtureGenerators,
      progress: sink,
      onExit: vi.fn(),
      onComplete: vi.fn(),
    };
    const first = render(<LessonPlayer {...common} />);
    await act(async () => {});
    toPractice();
    right();
    next();
    right();
    next();
    await act(async () => {});
    first.unmount();
    expect(await sink.loadLessonProgress(lesson.id)).toMatchObject({ step: 'practice', questionIndex: 2 });
    expect(await sink.loadAttempts()).toHaveLength(2);

    render(<LessonPlayer {...common} progress={createLocalProgressSink(storage)} />);
    await act(async () => {});
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Practice 3 of 4');
  });
});

describe('LessonPlayer: robustness of the sink', () => {
  it('keeps working when the sink rejects writes', async () => {
    const sink = new MemorySink();
    sink.failWrites = true;
    await setup({ sink });
    toPractice();
    right();
    await act(async () => {});
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('LessonPlayer: explore instruments', () => {
  it('stave instrument uses the passage renderer and the Play button unlocks Continue', async () => {
    const passage = buildLesson().steps.hook.exhibit;
    const renderer = vi.fn(({ ariaLabel }: { ariaLabel: string }) => <div data-testid="stave">{ariaLabel}</div>);
    await setup({
      build: { instrument: 'stave', exploreExhibit: passage },
      exhibitRenderers: { passage: renderer },
    });
    next();
    expect(screen.getByTestId('stave')).toBeInTheDocument();
    expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ tempo: 100, ariaLabel: expect.any(String) }));
    expect(btn('Continue')).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Play/ })[0]);
    });
    expect(audio.playPassage).toHaveBeenCalledTimes(1);
    expect(btn('Continue')).toBeEnabled();
  });

  it('a rhythm-pad step without a passage shows an error card and does not trap the learner', async () => {
    await setup({ build: { instrument: 'rhythm-pad', exploreExhibit: { kind: 'keyboard', highlight: [], low: 'C3', high: 'C5' } } });
    next();
    expect(screen.getByTestId('question-error')).toHaveTextContent('passage exhibit');
    expect(btn('Continue')).toBeEnabled();
  });

  it('keyboard instrument defaults to C3..C5 without a keyboard exhibit', async () => {
    const passage = buildLesson().steps.hook.exhibit;
    await setup({ build: { instrument: 'keyboard', exploreExhibit: passage } });
    next();
    expect(btn('C 3')).toBeInTheDocument();
    expect(screen.getByText('Notation preview unavailable')).toBeInTheDocument();
    playKey('C 3');
    expect(btn('Continue')).toBeEnabled();
  });

  it('renders the keyboard from a keyboard exhibit range', async () => {
    await setup();
    next();
    expect(btn('C 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'C 3' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Piano keyboard to explore' })).getAllByRole('button').length).toBeGreaterThan(8);
  });
});
