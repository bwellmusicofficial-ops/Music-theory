import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { drawn } from '@/lesson/questions/notation/stave-test-helpers';
import { FindInPassage } from './component';
import { mark } from './mark';
import type { FindInPassageAnswer, FindInPassagePayload } from './types';

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ noteOn: vi.fn(), noteOff: vi.fn(), isUnlocked: () => true, unlock: async () => {}, load: async () => {} }),
}));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const B4 = pitch.parsePitch('B4');
const note = (value: NoteValue, dots: 0 | 1 = 0): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });
const passage = {
  clef: 'treble' as const,
  key: { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const },
  time: { beats: 4, beatUnit: 4 as const },
  bars: [bar(note('minim', 1), note('crotchet')), bar(note('crotchet'), note('crotchet'), note('minim')), bar(note('minim', 1), note('crotchet'))],
};
const events: FindInPassagePayload = { passage, select: 'event', targets: [{ bar: 0, event: 0 }, { bar: 2, event: 0 }], feature: 'dotted notes' };
const bars: FindInPassagePayload = { passage, select: 'bar', targets: [{ bar: 1 }], feature: 'the bar with no dotted note' };

function renderQuestion(over: Partial<{ payload: FindInPassagePayload; locked: boolean; result: MarkResult | null; initialAnswer: FindInPassageAnswer; hideCheck: boolean; onAnswerChange: (a: FindInPassageAnswer | null) => void }> = {}) {
  const onAnswer = vi.fn<(answer: FindInPassageAnswer) => void>();
  const props = { payload: events, terminology: 'uk' as const, locked: false, result: null, onAnswer, ...over };
  const view = render(<FindInPassage {...props} />);
  return { ...view, onAnswer };
}

/** The tap buttons of the stave, one per note and rest. */
const places = () => screen.findAllByRole('button').then((all) => all.filter((b) => b.hasAttribute('aria-pressed')));
const check = () => screen.getByRole('button', { name: 'Check' });
const counter = () => screen.getByTestId('find-counter');

describe('find-in-passage component', () => {
  it('shows a tap button per note and rest, none pressed, "0 of 2 chosen", Check disabled', async () => {
    const { container } = renderQuestion();
    await drawn(container);
    const buttons = await places();
    expect(buttons).toHaveLength(7);
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(counter()).toHaveTextContent('0 of 2 chosen');
    expect(check()).toBeDisabled();
  });

  it('a tap chooses a place: aria-pressed, an outline, the counter moves; a second tap takes it out', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    await user.click((await places())[0]!);
    await waitFor(() => expect((container.querySelectorAll('[data-testid="mark-highlight"]'))).toHaveLength(1));
    expect((await places())[0]).toHaveAttribute('aria-pressed', 'true');
    expect(counter()).toHaveTextContent('1 of 2 chosen');
    await user.click((await places())[0]!);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="mark-highlight"]')).toHaveLength(0));
    expect((await places())[0]).toHaveAttribute('aria-pressed', 'false');
    expect(counter()).toHaveTextContent('0 of 2 chosen');
  });

  it('Check is enabled when as many places are chosen as there are targets, and not before or after', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    await user.click((await places())[0]!);
    expect(check()).toBeDisabled();
    await user.click((await places())[1]!);
    expect(check()).toBeEnabled();
    await user.click((await places())[2]!);
    expect(counter()).toHaveTextContent('3 of 2 chosen');
    expect(check()).toBeDisabled();
  });

  it('commits the chosen places sorted by bar then event', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion();
    await drawn(container);
    const buttons = await places();
    await user.click(buttons[5]!);
    await user.click(buttons[0]!);
    await user.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ chosen: [{ bar: 0, event: 0 }, { bar: 2, event: 0 }] });
    expect(mark(events, onAnswer.mock.calls[0]![0]).correct).toBe(true);
  });

  it('bar questions: a tap on any note of a bar chooses the whole bar', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion({ payload: bars });
    await drawn(container);
    const buttons = await places();
    await user.click(buttons[3]!);
    const after = await places();
    expect(after.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'true', 'true', 'false', 'false']);
    expect(counter()).toHaveTextContent('1 of 1 chosen');
    await user.click(after[2]!);
    expect(counter()).toHaveTextContent('0 of 1 chosen');
    await user.click((await places())[4]!);
    await user.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ chosen: [{ bar: 1 }] });
  });

  it('keyboard: arrows move between notes, Enter and Space choose', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    await places();
    await user.tab();
    await user.keyboard('{Enter}{ArrowRight}{ArrowRight}{ }');
    expect(counter()).toHaveTextContent('2 of 2 chosen');
    expect((await places()).map((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([true, false, true, false, false, false, false]);
  });

  it('restores an earlier answer as the chosen places and reports changes, never on mount', async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn<(a: FindInPassageAnswer | null) => void>();
    const { container } = renderQuestion({ initialAnswer: { chosen: [{ bar: 2, event: 0 }, { bar: 0, event: 0 }] }, onAnswerChange });
    await drawn(container);
    expect(counter()).toHaveTextContent('2 of 2 chosen');
    expect(onAnswerChange).not.toHaveBeenCalled();
    await user.click((await places())[0]!);
    expect(onAnswerChange).toHaveBeenLastCalledWith(null);
    await user.click((await places())[1]!);
    expect(onAnswerChange).toHaveBeenLastCalledWith({ chosen: [{ bar: 0, event: 1 }, { bar: 2, event: 0 }] });
  });

  it('ignores an answer that does not fit', async () => {
    const { container } = renderQuestion({ initialAnswer: { chosen: [{ bar: 9, event: 0 }] } });
    await drawn(container);
    expect(counter()).toHaveTextContent('0 of 2 chosen');
    cleanup();
    const second = renderQuestion({ payload: bars, initialAnswer: { chosen: [{ bar: 1, event: 0 }] } });
    await drawn(second.container);
    expect(counter()).toHaveTextContent('0 of 1 chosen');
  });

  it('Check is left out for a host that saves answers', async () => {
    const { container } = renderQuestion({ hideCheck: true });
    await drawn(container);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });

  it('after an answer the stave is read-only: the choices stay as outlines and cannot change', async () => {
    const answer = { chosen: [{ bar: 0, event: 0 }, { bar: 1, event: 0 }] };
    const result = mark(events, answer);
    const { container } = renderQuestion({ initialAnswer: answer, result });
    await drawn(container);
    await waitFor(() => expect(container.querySelector('[data-testid^="mark-"]')).toBeTruthy());
    expect(screen.queryAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))).toHaveLength(0);
    expect(check()).toBeDisabled();
    expect(counter()).toHaveTextContent('2 of 2 chosen');
  });
});
