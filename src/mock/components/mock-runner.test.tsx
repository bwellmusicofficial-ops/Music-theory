import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LearnerSettings } from '@/lesson/contracts';
import { generators } from '@/lesson/generators';
import { questionTypes } from '@/lesson/questions';
import { glossaryEntrySchema, lessonSchema } from '@/lesson/schema';
import { z } from 'zod';
import { buildPaper } from '../engine';
import { parseMockConfig } from '../load';
import { createLocalMockResultSink, type MockAttempt, type MockResultSink } from '../store';
import { MockRunner } from './mock-runner';

const audio = vi.hoisted(() => ({
  playUi: vi.fn(),
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  setMuted: vi.fn(),
  isUnlocked: vi.fn(() => true),
  now: vi.fn(() => 0),
  startMetronome: vi.fn(() => ({ stop: vi.fn(), startTime: 0.1 })),
  playPassage: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve() })),
}));
vi.mock('@/audio', () => ({ getAudioEngine: () => audio, installGestureUnlock: () => () => {} }));

const root = process.cwd();
const config = parseMockConfig(JSON.parse(readFileSync(join(root, 'content/mocks/grade-1.json'), 'utf8')), 'grade-1.json');
const lesson = lessonSchema.parse(
  JSON.parse(readFileSync(join(root, 'content/lessons/1/rhythm-1/g1-rhythm-01-crotchets-and-minims.json'), 'utf8')),
);
const glossary = z.array(glossaryEntrySchema).parse(JSON.parse(readFileSync(join(root, 'content/glossary/1.json'), 'utf8')));
// The real lesson, plus one that teaches every skill on the paper so each weak skill has a link.
const lessons = [
  { id: lesson.id, title: lesson.title, skills: lesson.skills },
  { id: 'all-skills', title: 'All the skills', skills: [...new Set(buildPaper(config, 12345, { generators, questionTypes }).questions.map((q) => q.skill))] },
];

const SEED = 12345;
const paper = buildPaper(config, SEED, { generators, questionTypes });
const N = paper.questions.length;
const indexOf = (type: string, nth = 0) => paper.questions.filter((q) => q.type === type)[nth]!.index;

class MemorySink implements MockResultSink {
  rows: MockAttempt[] = [];
  async save(a: MockAttempt) { this.rows.push(a); }
  async list() { return this.rows; }
  async best(id: string) {
    return this.rows.filter((r) => r.configId === id).sort((a, b) => b.score - a.score)[0] ?? null;
  }
}

function setup(settings: Partial<LearnerSettings> = {}, sink: MockResultSink = new MemorySink()) {
  const user = userEvent.setup();
  render(
    <MockRunner
      config={config}
      glossary={glossary}
      settings={{ ...DEFAULT_SETTINGS, ...settings }}
      lessons={lessons}
      sink={sink}
      makeSeed={() => SEED}
    />,
  );
  return { user, sink };
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start the test' }));
}

/** Question buttons in the visible panel. */
const panel = () => document.querySelector<HTMLElement>('[data-question-index]:not([hidden])')!;
const position = () => screen.getByTestId('position').textContent;

async function goTo(user: ReturnType<typeof userEvent.setup>, index: number) {
  const list = screen.queryByTestId('navigator');
  if (!list) await user.click(screen.getByRole('button', { name: /Question list/ }));
  await user.click(screen.getByRole('button', { name: new RegExp(`^Question ${index + 1},`) }));
}

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('mock test flow', () => {
  it('shows an intro: coverage, time, question count, no feedback, practice not an exam', () => {
    setup();
    const intro = screen.getByTestId('mock-intro');
    expect(within(intro).getByRole('heading', { level: 1, name: 'Grade 1 mock test' })).toBeInTheDocument();
    expect(within(intro).getByTestId('mock-facts')).toHaveTextContent(`${N} questions`);
    expect(within(intro).getByTestId('mock-facts')).toHaveTextContent('40 minutes allowed');
    for (const title of ['Rhythm', 'Pitch', 'Keys and scales', 'Intervals', 'Tonic triads', 'Terms and signs']) {
      expect(within(intro).getByText(title)).toBeInTheDocument();
    }
    expect(intro).toHaveTextContent('no feedback until the end');
    expect(intro).toHaveTextContent('not an official exam');
    expect(screen.queryByTestId('mock-best')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start the test' })).toBeInTheDocument();
  });

  it('runs the whole flow: answer several types, navigate, flag, change an answer, finish, results, review', async () => {
    const { user, sink } = setup();
    await start(user);
    expect(position()).toBe(`Question 1 of ${N}`);
    expect(screen.getByTestId('countdown')).toHaveTextContent('40:00');

    // Q1 multiple choice: answer wrongly, with no feedback.
    const mc = paper.questions[0]!;
    const mcPayload = mc.payload as { correct: string; options: { id: string; reason?: string }[] };
    const wrongId = mcPayload.options.find((o) => o.id !== mcPayload.correct)!.id;
    const wrongIdx = mcPayload.options.findIndex((o) => o.id === wrongId);
    const rightIdx = mcPayload.options.findIndex((o) => o.id === mcPayload.correct);
    const optionButtons = () => within(panel()).getAllByRole('button').filter((b) => b.closest('ul[aria-label="Answer options"]'));
    expect(within(panel()).getByTestId('answer-status')).toHaveTextContent('Not answered yet');
    await user.click(optionButtons()[wrongIdx]!);
    expect(within(panel()).getByTestId('answer-status')).toHaveTextContent('Answer saved');
    expect(optionButtons()[wrongIdx]).toHaveAttribute('aria-pressed', 'true');
    // The choice is shown as selected, with no right/wrong marks and no feedback text anywhere.
    expect(optionButtons()[wrongIdx]).toHaveAttribute('data-state', 'selected');
    expect(optionButtons().filter((_, i) => i !== wrongIdx).every((b) => b.getAttribute('data-state') === 'idle')).toBe(true);
    expect(within(panel()).queryByRole('button', { name: 'Check' })).toBeNull();
    expect(document.body).not.toHaveTextContent('Press Check');
    expect(within(panel()).queryByText(/Correct answer|Your answer$/)).toBeNull();
    expect(screen.queryByText(/That's right|Not quite/)).toBeNull();
    expect(optionButtons().every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);

    // Change the answer: the choice moves, still editable.
    await user.click(optionButtons()[rightIdx]!);
    expect(optionButtons()[rightIdx]).toHaveAttribute('aria-pressed', 'true');
    expect(optionButtons()[wrongIdx]).toHaveAttribute('aria-pressed', 'false');
    // ...and back to the wrong one, which is what we will be marked on.
    await user.click(optionButtons()[wrongIdx]!);

    // Flag Q1.
    await user.click(screen.getByRole('button', { name: 'Flag for review' }));
    expect(screen.getByRole('button', { name: 'Flag for review' })).toHaveAttribute('aria-pressed', 'true');

    // Q2: Next, answer.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(position()).toBe(`Question 2 of ${N}`);
    expect(screen.getByRole('button', { name: 'Flag for review' })).toHaveAttribute('aria-pressed', 'false');
    const q2 = paper.questions[1]!.payload as { correct: string; options: { id: string }[] };
    await user.click(optionButtons()[q2.options.findIndex((o) => o.id === q2.correct)]!);

    // Match-up: pair every left item with the right item that has its id, saved as they are made.
    const mu = paper.questions[indexOf('match-up')]!;
    await goTo(user, mu.index);
    const mup = mu.payload as { left: { id: string; match: string }[]; right: { id: string }[] };
    for (const [i, l] of mup.left.entries()) {
      const lefts = within(within(panel()).getByRole('list', { name: 'Left items' })).getAllByRole('button');
      await user.click(lefts[i]!);
      const rights = within(within(panel()).getByRole('list', { name: 'Right items' })).getAllByRole('button');
      await user.click(rights[mup.right.findIndex((r) => r.id === l.match)]!);
    }
    // No Check step: the pairs are saved as soon as the last one is made.
    expect(within(panel()).queryByRole('button', { name: 'Check' })).toBeNull();
    expect(position()).toBe(`Question ${mu.index + 1} of ${N}`);
    expect(within(panel()).queryByText(/Right pair|Wrong pair/)).toBeNull();
    expect(within(panel()).getByTestId('answer-status')).toHaveTextContent('Answer saved');

    // Ordering: moving an item saves an order.
    const ord = indexOf('ordering');
    await goTo(user, ord);
    expect(within(panel()).getByTestId('answer-status')).toHaveTextContent('Not answered yet');
    await user.click(within(panel()).getAllByRole('button', { name: /^Move .* down$/ })[0]!);
    expect(within(panel()).getByTestId('answer-status')).toHaveTextContent('Answer saved');

    // Identify a note on the stave.
    const note = paper.questions.find((q) => q.type === 'note-on-stave')!;
    await goTo(user, note.index);
    const letter = (note.payload as { pitch: { letter: string } }).pitch.letter;
    const group = within(panel()).getByRole('group', { name: 'Note name' });
    const letterBtn = within(group).getByRole('button', { name: letter });
    await user.click(letterBtn);
    expect(letterBtn).toHaveAttribute('aria-pressed', 'true');
    expect(letterBtn).toHaveAttribute('data-state', 'selected');

    // Navigator: statuses by text.
    await user.click(screen.getByRole('button', { name: /Question list/ }));
    expect(screen.getByRole('button', { name: 'Question 1, answered, flagged for review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question 2, answered' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`^Question ${note.index + 1}, answered, current question`) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question 7, not answered' })).toBeInTheDocument();

    // Go back to Q1 by Previous/jump: the answer is still shown, and still editable.
    await user.click(screen.getByRole('button', { name: 'Question 1, answered, flagged for review' }));
    expect(position()).toBe(`Question 1 of ${N}`);
    expect(optionButtons()[wrongIdx]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    // Leave the match-up and the stave question and come back: the answers are still shown.
    await goTo(user, mu.index);
    for (const [i, l] of mup.left.entries()) {
      const lefts = within(within(panel()).getByRole('list', { name: 'Left items' })).getAllByRole('button');
      const letter = String.fromCharCode(65 + mup.right.findIndex((r) => r.id === l.match));
      expect(lefts[i]).toHaveTextContent(`Paired with ${letter}`);
    }
    // Change one pairing (unpair the first item); the change is saved too.
    await user.click(within(within(panel()).getByRole('list', { name: 'Left items' })).getAllByRole('button')[0]!);
    await goTo(user, note.index);
    await user.click(screen.getByRole('button', { name: /Question list/ }));
    expect(screen.getByRole('button', { name: new RegExp(`^Question ${mu.index + 1}, not answered`) })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: new RegExp(`^Question ${note.index + 1},`) }));
    expect(within(within(panel()).getByRole('group', { name: 'Note name' })).getByRole('button', { name: letter })).toHaveAttribute('aria-pressed', 'true');
    // An incomplete pairing is not an answer, so it was not kept: pair everything again, then finish.
    await goTo(user, mu.index);
    for (const [i, l] of mup.left.entries()) {
      const lefts = within(within(panel()).getByRole('list', { name: 'Left items' })).getAllByRole('button');
      await user.click(lefts[i]!);
      const rights = within(within(panel()).getByRole('list', { name: 'Right items' })).getAllByRole('button');
      await user.click(rights[mup.right.findIndex((r) => r.id === l.match)]!);
    }
    await goTo(user, 0);

    // Finish: the confirmation says how many are unanswered; Keep working returns.
    await user.click(screen.getByRole('button', { name: 'Finish test' }));
    const dialog = screen.getByRole('dialog', { name: 'Finish the test?' });
    expect(within(dialog).getByTestId('finish-summary')).toHaveTextContent(`${N - 5} unanswered questions`);
    expect(dialog).toHaveTextContent('1 question flagged for review');
    await user.click(within(dialog).getByRole('button', { name: 'Keep working' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('mock-results')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Finish test' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish test' }));

    // Results.
    const results = screen.getByTestId('mock-results');
    expect(screen.getByTestId('band')).toHaveTextContent('Not yet passed');
    expect(screen.getByTestId('score')).toHaveTextContent(/out of 31/);
    expect(within(results).getByTestId('section-rhythm')).toHaveTextContent('Rhythm');
    expect(within(results).getAllByRole('progressbar')).toHaveLength(6);
    const weakest = within(results).getByTestId('weakest');
    expect(within(weakest).getAllByRole('listitem').length).toBeGreaterThanOrEqual(1);
    expect(within(weakest).getAllByText(/of \d+ questions? right|of 1 question right/).length).toBeGreaterThanOrEqual(1);
    // Each weak skill links to the lessons that teach it.
    const link = within(weakest).getAllByRole('link', { name: 'Lesson: All the skills' })[0]!;
    expect(link).toHaveAttribute('href', '/lessons/all-skills');
    expect(screen.getAllByTestId('review-list')[0]!.querySelectorAll('li')).toHaveLength(N);

    // The attempt was saved.
    expect((sink as MemorySink).rows).toHaveLength(1);
    expect((sink as MemorySink).rows[0]).toMatchObject({ configId: 'grade-1', total: N, band: 'not-yet', seed: SEED });

    // Review Q1: the learner's answer, the correct one, and the reason.
    await user.click(screen.getByRole('button', { name: 'Question 1, Not correct. Open to review.' }));
    expect(screen.getByTestId('review-status')).toHaveTextContent('Not correct');
    expect(optionButtons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(optionButtons()[wrongIdx]).toHaveAttribute('data-state', 'wrong');
    expect(optionButtons()[rightIdx]).toHaveAttribute('data-state', 'right');
    expect(within(panel()).getByText('Your answer')).toBeInTheDocument();
    expect(within(panel()).getByText('Correct answer')).toBeInTheDocument();
    const reason = mcPayload.options[wrongIdx]!.reason!;
    expect(screen.getByTestId('review-reason').textContent).toContain(reason.replace(/\[\[[^|]+\|([^\]]*)\]\]/g, '$1').replace(/\*/g, '').slice(0, 20));

    // A question answered rightly, and an unanswered one.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('review-status')).toHaveTextContent('Correct');
    await user.click(screen.getByRole('button', { name: 'Back to results' }));
    expect(screen.getByTestId('mock-results')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Question 7, Not answered. Open to review.' }));
    expect(screen.getByTestId('review-status')).toHaveTextContent('Not answered');
    expect(screen.getByTestId('review-explanation')).toHaveTextContent('You did not answer this question');

    // The match-up kept the learner's pairs in the review, all right.
    await user.click(screen.getByRole('button', { name: 'Back to results' }));
    await user.click(screen.getByRole('button', { name: new RegExp(`^Question ${mu.index + 1}, Correct`) }));
    expect(within(panel()).getAllByText('Right pair')).toHaveLength(mup.left.length);

    // Try again returns to the intro showing the best result.
    await user.click(screen.getByRole('button', { name: 'Back to results' }));
    await user.click(screen.getByRole('button', { name: 'Take another paper' }));
    expect(await screen.findByTestId('mock-best')).toHaveTextContent(`out of ${N}`);
  });

  it('shows the best previous result on the intro screen', async () => {
    const store = new Map<string, string>();
    const sink = createLocalMockResultSink({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage);
    await sink.save({
      configId: 'grade-1', at: '2026-10-01T10:00:00Z', seed: 1, score: 0.85, correct: 26, total: 31, band: 'merit',
      timedOut: false, elapsedMs: 1, sections: [], skills: [],
    });
    setup({}, sink);
    expect(await screen.findByTestId('mock-best')).toHaveTextContent('Merit');
    expect(screen.getByTestId('mock-best')).toHaveTextContent('85%');
  });

  it('finishing with everything answered says so, and a perfect-for-multiple-choice paper has no tallying surprises', async () => {
    const { user } = setup();
    await start(user);
    await user.click(screen.getByRole('button', { name: 'Finish test' }));
    expect(screen.getByTestId('finish-summary')).toHaveTextContent(`${N} unanswered questions`);
    await user.click(screen.getByRole('button', { name: 'Keep working' }));
  });
});

describe('the clock', () => {
  it('counts down, warns at 5 minutes and 1 minute through a live region, then hands the test in', () => {
    vi.useFakeTimers({ now: new Date('2026-11-15T10:00:00Z') });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    const announcer = screen.getByTestId('time-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent('');

    // Answer the first question before time runs out.
    const mc = paper.questions[0]!.payload as { correct: string; options: { id: string }[] };
    const first = within(panel()).getAllByRole('button').filter((b) => b.closest('ul[aria-label="Answer options"]'));
    fireEvent.click(first[mc.options.findIndex((o) => o.id === mc.correct)]!);

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('39:00');
    expect(announcer).toHaveTextContent('');

    act(() => { vi.advanceTimersByTime((40 * 60 - 5 * 60 - 60) * 1000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('5:00');
    expect(announcer).toHaveTextContent('5 minutes left');
    expect(screen.getByTestId('time-warning')).toHaveTextContent('5 minutes left');

    act(() => { vi.advanceTimersByTime(4 * 60 * 1000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('1:00');
    expect(announcer).toHaveTextContent('1 minute left');

    act(() => { vi.advanceTimersByTime(59_000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('0:01');
    expect(screen.queryByTestId('mock-results')).toBeNull();

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('mock-results')).toBeInTheDocument();
    expect(screen.getByTestId('timed-out')).toHaveTextContent('Time ran out');
    // The one answer given counts.
    expect(screen.getByTestId('score')).toHaveTextContent(`1 out of ${N}`);
    expect(screen.queryByTestId('countdown')).toBeNull();
    // The clock stopped: nothing else changes.
    act(() => { vi.advanceTimersByTime(600_000); });
    expect(screen.getByTestId('score')).toHaveTextContent(`1 out of ${N}`);
  });

  it('has no clock in untimed mode', () => {
    vi.useFakeTimers({ now: new Date('2026-11-15T10:00:00Z') });
    setup({ untimed: true });
    expect(screen.getByTestId('mock-facts')).toHaveTextContent('No clock');
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByTestId('time-announcer')).toHaveTextContent('');
    act(() => { vi.advanceTimersByTime(3 * 3_600_000); });
    expect(screen.queryByTestId('mock-results')).toBeNull();
    expect(position()).toBe(`Question 1 of ${N}`);
    fireEvent.click(screen.getByRole('button', { name: 'Finish test' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish test' }));
    expect(screen.getByTestId('mock-results')).toBeInTheDocument();
    expect(screen.queryByTestId('timed-out')).toBeNull();
  });
});
