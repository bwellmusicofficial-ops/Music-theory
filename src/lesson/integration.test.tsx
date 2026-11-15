/**
 * Integration: the real LessonPlayer with the real question-type and generator
 * registries and the real exemplar lesson, hook to recap, answering correctly.
 *
 * Only '@/audio' is mocked (with a clock the test controls) and the stave runs
 * on the jsdom stubs. Each question type is driven the way a learner would:
 *  - multiple-choice, by-ear: tap the correct option (by-ear after playing the clip)
 *  - complete-bar: tap palette symbols, then Check
 *  - spot-mistake: tap a note in the faulty bar, then Check
 *  - tap-rhythm: real-time tapping on the real rhythm pad, with the test moving
 *    the mocked audio clock to each expected onset (the real pad and `mark` do the rest)
 *  - note-on-stave, play-keyboard, ordering, match-up are not in this lesson; they
 *    have their own component tests, and the registry test below checks they are wired.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useEffect, type ComponentType } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { installStaveStubs } from '@/components/stave/test-utils';
import { rhythm } from '@/engine/rhythm';
import type { Glyph } from '@/lesson/questions/shared';
import { DEFAULT_SETTINGS, type LearnerSettings, type QuestionProps, type QuestionTypeRegistry } from './contracts';
import { generators } from './generators';
import { LessonPlayer } from './player';
import { passageExhibitRenderer } from './questions/notation';
import { createLocalProgressSink } from './progress';
import { questionTypes } from './questions';
import { glossaryEntrySchema, lessonSchema, QUESTION_TYPES, type QuestionTypeId } from './schema';
import './setup';

const audio = vi.hoisted(() => ({
  clock: 0,
  playUi: vi.fn(),
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  setMuted: vi.fn(),
  isUnlocked: vi.fn(() => true),
  stop: vi.fn(),
  playPassage: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve() })),
}));
vi.mock('@/audio', () => ({
  getAudioEngine: () => ({
    ...audio,
    now: () => audio.clock,
    startMetronome: () => ({ stop: audio.stop, startTime: audio.clock + 0.1 }),
  }),
}));

const root = join(__dirname, '../..');
const lesson = lessonSchema.parse(
  JSON.parse(readFileSync(join(root, 'content/lessons/1/rhythm-1/g1-rhythm-01-crotchets-and-minims.json'), 'utf8')),
);
const glossary = z.array(glossaryEntrySchema).parse(JSON.parse(readFileSync(join(root, 'content/glossary/1.json'), 'utf8')));

// --- recording the payloads the player hands to each component --------------------------

const seen: Record<string, unknown[]> = {};
function recording(registry: QuestionTypeRegistry): QuestionTypeRegistry {
  const out: QuestionTypeRegistry = {};
  for (const type of QUESTION_TYPES) {
    const mod = registry[type];
    if (!mod) continue;
    const Inner = mod.Component as ComponentType<QuestionProps<unknown, unknown>>;
    const Recorder = (props: QuestionProps<unknown, unknown>) => {
      useEffect(() => {
        (seen[type] ??= []).push(props.payload);
      }, [props.payload]);
      return <Inner {...props} />;
    };
    out[type] = { ...mod, Component: Recorder };
  }
  return out;
}
const lastPayload = <T,>(type: QuestionTypeId) => (seen[type] ?? []).at(-1) as T;

// --- helpers -------------------------------------------------------------------------------

const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const click = (name: string | RegExp) => fireEvent.click(btn(name));
const banner = () => document.querySelector('[role="status"][data-kind]') as HTMLElement | null;
const settle = () => act(async () => {});

beforeAll(() => installStaveStubs());
beforeEach(() => {
  localStorage.clear();
  audio.clock = 0;
  for (const key of Object.keys(seen)) delete seen[key];
  vi.clearAllMocks();
});
afterEach(cleanup);

async function mount(settings: Partial<LearnerSettings> = {}) {
  const progress = createLocalProgressSink();
  const onComplete = vi.fn();
  const onExit = vi.fn();
  render(
    <LessonPlayer
      lesson={lesson}
      glossary={glossary}
      settings={{ ...DEFAULT_SETTINGS, ...settings }}
      questionTypes={recording(questionTypes)}
      generators={generators}
      progress={progress}
      exhibitRenderers={{ passage: passageExhibitRenderer }}
      onExit={onExit}
      onComplete={onComplete}
    />,
  );
  await screen.findByRole('heading', { level: 1 });
  return { progress, onComplete, onExit };
}

// --- one driver per question type ---------------------------------------------------------------

/** Taps the rhythm on the real pad, exactly on every onset of the payload, then lets the pad finish. */
async function driveTapRhythm() {
  const payload = lastPayload<{
    time: { beats: number; beatUnit: 1 | 2 | 4 | 8 | 16 };
    bars: Parameters<typeof rhythm.onsetTimes>[0];
    bpm: number;
    countInBars?: number;
    listenFirst: boolean;
  }>('tap-rhythm');
  if (payload.listenFirst) {
    await act(async () => {
      click('Listen');
    });
    await screen.findByRole('button', { name: 'Start' });
  }
  await act(async () => {
    click('Start');
  });
  const start = audio.clock + 0.1;
  const perBar = rhythm.beatsPerBar(payload.time);
  const countIn = (payload.countInBars ?? 1) * perBar * (60 / payload.bpm);
  const onsets = rhythm.onsetTimes(payload.bars, payload.time, payload.bpm);
  const target = screen.getByTestId('tap-target');
  for (const onset of onsets) {
    audio.clock = start + countIn + onset;
    fireEvent.pointerDown(target);
  }
  // Past the end of the bars: the pad's own timer notices and reports the result.
  audio.clock = start + countIn + perBar * payload.bars.length * (60 / payload.bpm) + 2;
  await waitFor(() => expect(banner()).not.toBeNull(), { timeout: 3000 });
}

/** The answer option buttons, in order. */
function optionButtons(): HTMLButtonElement[] {
  const list = screen.getAllByRole('list').find((l) => l.querySelector('[data-state]'))!;
  return within(list)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('button') as HTMLButtonElement);
}

async function driveChoice(type: 'multiple-choice' | 'by-ear') {
  const payload = lastPayload<{ options: { id: string }[]; correct: string }>(type);
  if (type === 'by-ear') {
    // Every clip must be heard before the options unlock.
    const plays = screen.getAllByRole('button', { name: /^Play (the clip|clip [A-C])$/ });
    for (const play of plays) {
      await act(async () => {
        fireEvent.click(play);
      });
    }
    await waitFor(() => expect(optionButtons()[0]).toBeEnabled());
  }
  const buttons = optionButtons();
  const index = payload.options.findIndex((o) => o.id === payload.correct);
  fireEvent.click(buttons[index]!);
}

async function driveCompleteBar() {
  const payload = lastPayload<{
    palette: Glyph[];
    count?: number;
  }>('complete-bar');
  await waitFor(() => expect(document.querySelector('.vf-stavenote')).toBeTruthy());
  // Find which palette symbols fill the bar by asking the real `mark`, so the test does not re-implement the rules.
  const mod = questionTypes['complete-bar']!;
  const count = payload.count ?? 1;
  const choices = payload.palette.map((glyph, index) => ({ glyph, index }));
  const search = (added: typeof choices): typeof choices | null => {
    if (added.length === count) {
      return mod.mark(lastPayload('complete-bar'), { added: added.map((a) => a.glyph) }).correct ? added : null;
    }
    for (const choice of choices) {
      const found = search([...added, choice]);
      if (found) return found;
    }
    return null;
  };
  const answer = search([]);
  expect(answer, 'a palette combination completes the bar').not.toBeNull();
  for (const { glyph } of answer!) {
    const name = rhythm.noteValueName(glyph.duration, 'uk');
    // Arm the symbol in the palette, then add it with the stave's "Add note" button (the keyboard-friendly route).
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }));
    const before = document.querySelectorAll('.vf-stavenote').length;
    fireEvent.click(btn('Add note'));
    await waitFor(() => expect(document.querySelectorAll('.vf-stavenote').length).toBe(before + 1));
  }
  click('Check');
}

async function driveSpotMistake() {
  const payload = lastPayload<{ select: 'bar' | 'event'; mistake: { bar: number; event?: number } }>('spot-mistake');
  await waitFor(() => expect(document.querySelector('.vf-stavenote')).toBeTruthy());
  const label = payload.select === 'event' ? `Bar ${payload.mistake.bar + 1}, note ${(payload.mistake.event ?? 0) + 1}` : `Bar ${payload.mistake.bar + 1}, note 1`;
  const target = screen.getAllByRole('button').find((b) => (b.getAttribute('aria-label') ?? '').startsWith(label));
  expect(target, `a stave button starting "${label}"`).toBeDefined();
  fireEvent.click(target!);
  click('Check');
}

const DRIVERS: Partial<Record<QuestionTypeId, () => Promise<void>>> = {
  'tap-rhythm': driveTapRhythm,
  'multiple-choice': () => driveChoice('multiple-choice'),
  'by-ear': () => driveChoice('by-ear'),
  'complete-bar': driveCompleteBar,
  'spot-mistake': driveSpotMistake,
};

async function answerCurrentQuestion(type: QuestionTypeId) {
  const driver = DRIVERS[type];
  if (!driver) throw new Error(`No driver for question type ${type}`);
  await driver();
  await waitFor(() => expect(banner()).not.toBeNull());
  expect(banner()).toHaveAttribute('data-kind', 'correct');
}

// --- the walk ---------------------------------------------------------------------------------------

describe('LessonPlayer with the real registries and the real exemplar lesson', () => {
  it('walks hook to recap, answering every question correctly through its real component', async () => {
    const { progress, onComplete } = await mount();

    // hook: the passage exhibit is drawn by the real notation renderer
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Crotchets and minims');
    await waitFor(() => expect(document.querySelector('.vf-stavenote')).toBeTruthy());
    click('Continue');

    // explore: the real rhythm pad in free mode; one tap unlocks Continue
    expect(btn('Continue')).toBeDisabled();
    await act(async () => {
      click('Start');
    });
    fireEvent.pointerDown(screen.getByTestId('tap-target'));
    await waitFor(() => expect(btn('Continue')).toBeEnabled());
    click('Continue');

    // name: cards until the first practice question
    for (let guard = 0; guard < 6 && !screen.queryByTestId('eyebrow')?.textContent?.startsWith('Practice'); guard++) {
      click(/^Continue/);
    }

    // practice
    const practice = lesson.steps.practice.questions;
    for (const [i, question] of practice.entries()) {
      expect(screen.getByTestId('eyebrow')).toHaveTextContent(`Practice ${i + 1} of ${practice.length}`);
      await answerCurrentQuestion(question.type);
      click(/^Continue/);
    }

    // challenge
    const spec = lesson.steps.challenge;
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent(`${spec.count} questions`);
    click('Start');
    for (let i = 0; i < spec.count; i++) {
      expect(screen.getByTestId('eyebrow')).toHaveTextContent(`Challenge ${i + 1} of ${spec.count}`);
      const question = spec.questions[i % spec.questions.length]!;
      await answerCurrentQuestion(question.type);
      click(i + 1 === spec.count ? 'See result' : 'Next');
    }
    expect(screen.getByTestId('score')).toHaveTextContent(`${spec.count} / ${spec.count}`);
    click('Continue');

    // recap, finish
    expect(screen.getByTestId('recap-points').querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
    click('Finish');
    expect(onComplete).toHaveBeenCalledWith({ lessonId: lesson.id, completed: true, bestScore: 1 });

    await settle();
    const attempts = await progress.loadAttempts();
    expect(attempts).toHaveLength(practice.length + spec.count);
    expect(attempts.every((a) => a.correct)).toBe(true);
    expect(await progress.loadLessonProgress(lesson.id)).toMatchObject({ state: 'complete', step: 'recap', bestScore: 1 });
  }, 60_000);

  it('shows rich feedback: a wrong answer gives the reason with glossary links and US terms', async () => {
    await mount({ terminology: 'us' });
    click('Continue');
    await act(async () => {
      click('Start');
    });
    fireEvent.pointerDown(screen.getByTestId('tap-target'));
    await waitFor(() => expect(btn('Continue')).toBeEnabled());
    click('Continue');
    for (let guard = 0; guard < 6 && !screen.queryByTestId('eyebrow')?.textContent?.startsWith('Practice'); guard++) {
      click(/^Continue/);
    }
    // Practice 2 is the by-ear question: choose the wrong clip.
    await answerCurrentQuestion('tap-rhythm');
    click(/^Continue/);
    const chooseClipA = async () => {
      for (const play of screen.getAllByRole('button', { name: /^Play (the clip|clip [A-C])$/ })) {
        await act(async () => {
          fireEvent.click(play);
        });
      }
      const options = optionButtons();
      await waitFor(() => expect(options[0]).toBeEnabled());
      fireEvent.click(options[0]!); // Clip A: wrong
      await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'wrong'));
    };
    // The first wrong answer gives the hint and a retry; the second stands, with the option's reason.
    await chooseClipA();
    expect(banner()).toHaveTextContent('Hint:');
    click('Try again');
    await chooseClipA();
    expect(banner()).toHaveTextContent('Clip A is all short notes');
    expect(within(banner()!).getByRole('button', { name: 'quarter notes' })).toBeInTheDocument();
  }, 30_000);

  it('a tapped rhythm has exactly one retry (the player\'s), which resets the pad; a pass has only Continue', async () => {
    await mount();
    click('Continue');
    await act(async () => {
      click('Start');
    });
    fireEvent.pointerDown(screen.getByTestId('tap-target'));
    await waitFor(() => expect(btn('Continue')).toBeEnabled());
    click('Continue');
    for (let guard = 0; guard < 6 && !screen.queryByTestId('eyebrow')?.textContent?.startsWith('Practice'); guard++) {
      click(/^Continue/);
    }
    const retries = () => screen.queryAllByRole('button', { name: 'Try again' });

    // Attempt 1: no taps at all, so the pad ends and the answer is wrong.
    await act(async () => {
      click('Start');
    });
    const first = lastPayload<{ time: { beats: number; beatUnit: 1 | 2 | 4 | 8 | 16 }; bars: Parameters<typeof rhythm.onsetTimes>[0]; bpm: number; countInBars?: number }>('tap-rhythm');
    const beatSeconds = 60 / first.bpm;
    audio.clock += (first.countInBars ?? 1) * rhythm.beatsPerBar(first.time) * beatSeconds + rhythm.beatsPerBar(first.time) * first.bars.length * beatSeconds + 2;
    await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'wrong'), { timeout: 3000 });
    expect(banner()).toHaveTextContent('Hint:');
    expect(retries()).toHaveLength(1);

    // The player's Try again resets the pad: Start is back, no old result, and a second performance can pass.
    click('Try again');
    expect(retries()).toHaveLength(0);
    expect(screen.queryByTestId('result')).toBeNull();
    expect(btn('Start')).toBeEnabled();
    await driveTapRhythm();
    expect(banner()).toHaveAttribute('data-kind', 'correct');
    expect(retries()).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /^Continue/ })).toHaveLength(1);
  }, 30_000);

  it('registers every question type and generator the schema knows', () => {
    for (const type of QUESTION_TYPES) {
      expect(questionTypes[type], type).toBeDefined();
      expect(questionTypes[type]?.type).toBe(type);
    }
    expect(Object.keys(generators)).toEqual(expect.arrayContaining(['name-note-on-stave', 'tap-note-values']));
  });
});
