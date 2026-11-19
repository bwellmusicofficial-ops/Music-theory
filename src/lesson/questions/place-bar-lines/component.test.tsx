import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { Bar, NoteValue, ScoreEvent } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { drawn } from '@/lesson/questions/notation/stave-test-helpers';
import { PlaceBarLines } from './component';
import { mark } from './mark';
import { rebar } from './bars';
import type { PlaceBarLinesAnswer, PlaceBarLinesPayload } from './types';

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ noteOn: vi.fn(), noteOff: vi.fn(), isUnlocked: () => true, unlock: async () => {}, load: async () => {} }),
}));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const B4 = pitch.parsePitch('B4');
const note = (value: NoteValue): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots: 0 } });
const rest = (value: NoteValue): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });

/** 2/4: two crotchets; a crotchet and a rest; two quavers and a crotchet. Events 1 to 7. */
const payload: PlaceBarLinesPayload = {
  passage: {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time: { beats: 2, beatUnit: 4 },
    bars: [bar(note('crotchet'), note('crotchet')), bar(note('crotchet'), rest('crotchet')), bar(note('quaver'), note('quaver'), note('crotchet'))],
  },
};

function renderQuestion(over: Partial<{ locked: boolean; result: MarkResult | null; initialAnswer: PlaceBarLinesAnswer; hideCheck: boolean; onAnswerChange: (a: PlaceBarLinesAnswer | null) => void }> = {}) {
  const onAnswer = vi.fn<(answer: PlaceBarLinesAnswer) => void>();
  const props = { payload, terminology: 'uk' as const, locked: false, result: null, onAnswer, ...over };
  const view = render(<PlaceBarLines {...props} />);
  return { ...view, onAnswer, update: (next: Partial<typeof props>) => view.rerender(<PlaceBarLines {...props} {...next} />) };
}

const gaps = () => screen.findAllByRole('button').then((all) => all.filter((b) => b.hasAttribute('aria-pressed')));
const check = () => screen.getByRole('button', { name: 'Check' });
const staves = (container: HTMLElement) => container.querySelectorAll('.vf-stave').length;

describe('place-bar-lines component', () => {
  it('offers a gap after every note and rest but the last, named by its number', async () => {
    const { container } = renderQuestion();
    await drawn(container);
    const buttons = await gaps();
    expect(buttons).toHaveLength(6);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Bar line after note 1',
      'Bar line after note 2',
      'Bar line after note 3',
      'Bar line after rest 4',
      'Bar line after note 5',
      'Bar line after note 6',
    ]);
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.getByRole('group', { name: /Notes without bar lines/ })).toBeInTheDocument();
  });

  it('shows the passage as one long bar to start with, and Check is disabled', async () => {
    const { container } = renderQuestion();
    await drawn(container);
    expect(staves(container)).toBe(1);
    expect(check()).toBeDisabled();
    expect(screen.getByText('No bar lines placed yet')).toBeInTheDocument();
  });

  it('a tap puts a bar line there: aria-pressed, a new bar is drawn, Check is enabled', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    await user.click((await gaps())[1]!);
    await waitFor(() => expect(staves(container)).toBe(2));
    const buttons = await gaps();
    // The passage is drawn again, so the buttons are new ones: the same gap, still pressed.
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(check()).toBeEnabled();
    expect(screen.getByText('1 bar line placed')).toBeInTheDocument();
  });

  it('maps each gap back to the right note after the bars are cut again', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion();
    await drawn(container);
    await user.click((await gaps())[3]!);
    await waitFor(() => expect(staves(container)).toBe(2));
    // Now the gap after note 2 is in the first of two learner bars.
    await user.click((await gaps())[1]!);
    await waitFor(() => expect(staves(container)).toBe(3));
    const pressed = (await gaps()).map((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toEqual([false, true, false, true, false, false]);
    await user.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ after: [1, 3] });
  });

  it('tapping a bar line again takes it off, and Check is disabled once there are none', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    await user.click((await gaps())[1]!);
    await waitFor(() => expect(staves(container)).toBe(2));
    await user.click((await gaps())[1]!);
    await waitFor(() => expect(staves(container)).toBe(1));
    expect(check()).toBeDisabled();
  });

  it('commits the bar lines sorted ascending, and the answer marks right', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion();
    await drawn(container);
    await user.click((await gaps())[3]!);
    await waitFor(() => expect(staves(container)).toBe(2));
    await user.click((await gaps())[1]!);
    await waitFor(() => expect(staves(container)).toBe(3));
    await user.click(check());
    const answer = onAnswer.mock.calls[0]![0];
    expect(answer.after).toEqual([1, 3]);
    expect(mark(payload, answer).correct).toBe(true);
  });

  it('keyboard: one tab stop, Enter toggles, and focus stays on the gap after the bars are cut again', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    const first = await gaps();
    expect(first.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    await user.tab();
    expect(first[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}{Enter}');
    await waitFor(() => expect(staves(container)).toBe(2));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', 'Bar line after note 2'));
    expect(document.activeElement).toHaveAttribute('aria-pressed', 'true');
    // The same key carries on from there.
    await user.keyboard('{ArrowRight}{ }');
    await waitFor(() => expect(staves(container)).toBe(3));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', 'Bar line after note 3'));
  });

  it('restores an earlier answer as the bar lines, without marking, and reports later changes', async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn<(a: PlaceBarLinesAnswer | null) => void>();
    const { container } = renderQuestion({ initialAnswer: { after: [3, 1] }, onAnswerChange });
    await drawn(container);
    await waitFor(() => expect(staves(container)).toBe(3));
    expect((await gaps()).map((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([false, true, false, true, false, false]);
    expect(onAnswerChange).not.toHaveBeenCalled();
    await user.click((await gaps())[5]!);
    expect(onAnswerChange).toHaveBeenLastCalledWith({ after: [1, 3, 5] });
    await user.click((await gaps())[5]!);
    await user.click((await gaps())[3]!);
    await user.click((await gaps())[1]!);
    expect(onAnswerChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores an answer that does not fit the passage', async () => {
    const { container } = renderQuestion({ initialAnswer: { after: [2, 99] } });
    await drawn(container);
    expect(staves(container)).toBe(1);
    expect(check()).toBeDisabled();
  });

  it('leaves out Check when the host saves answers as they change', async () => {
    const { container } = renderQuestion({ hideCheck: true });
    await drawn(container);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });

  it('after an answer the gaps no longer change the bar lines', async () => {
    const user = userEvent.setup();
    const result: MarkResult = mark(payload, { after: [1] });
    const { container } = renderQuestion({ initialAnswer: { after: [1] }, result });
    await drawn(container);
    await user.click((await gaps())[3]!);
    expect(staves(container)).toBe(2);
    expect(check()).toBeDisabled();
  });

  it('rebar keeps the standard beams of the correct bars, cut where a bar line falls', () => {
    const quavers: PlaceBarLinesPayload = {
      passage: { ...payload.passage, bars: [bar(note('quaver'), note('quaver'), note('crotchet')), bar(note('crotchet'), note('quaver'), note('quaver'))] },
    };
    expect(rebar(quavers.passage, [2]).bars.map((b) => b.beams)).toEqual([[[0, 1]], [[1, 2]]]);
    // A bar line between the two quavers of the first pair: no beam is left there.
    expect(rebar(quavers.passage, [0, 2]).bars.map((b) => b.beams)).toEqual([[], [], [[1, 2]]]);
  });
});
