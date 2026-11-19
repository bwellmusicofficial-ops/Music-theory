import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { NoteValue, ScoreEvent } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { drawn } from '@/lesson/questions/notation/stave-test-helpers';
import { FixBeaming } from './component';
import { mark } from './mark';
import type { FixBeamingAnswer, FixBeamingPayload } from './types';

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ noteOn: vi.fn(), noteOff: vi.fn(), isUnlocked: () => true, unlock: async () => {}, load: async () => {} }),
}));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const B4 = pitch.parsePitch('B4');
const note = (value: NoteValue): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots: 0 } });
const q = () => note('quaver');

/** Bar 1 is normal (two minims). Bar 2: eight quavers, all in one beam (should be two). */
const payload: FixBeamingPayload = {
  passage: {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time: { beats: 4, beatUnit: 4 },
    bars: [{ events: [note('minim'), note('minim')] }, { events: Array.from({ length: 8 }, q), beams: [[0, 1, 2, 3, 4, 5, 6, 7]] }],
  },
  barIndex: 1,
};
/** A bar with a crotchet in it: offered gaps are only between neighbouring quavers. */
const mixed: FixBeamingPayload = {
  passage: {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time: { beats: 4, beatUnit: 4 },
    bars: [{ events: [note('crotchet'), q(), q(), q(), q(), note('crotchet')], beams: [[1, 2, 3, 4]] }],
  },
  barIndex: 0,
};

function renderQuestion(over: Partial<{ payload: FixBeamingPayload; locked: boolean; result: MarkResult | null; initialAnswer: FixBeamingAnswer; hideCheck: boolean; onAnswerChange: (a: FixBeamingAnswer | null) => void }> = {}) {
  const onAnswer = vi.fn<(answer: FixBeamingAnswer) => void>();
  const props = { payload, terminology: 'uk' as const, locked: false, result: null, onAnswer, ...over };
  const view = render(<FixBeaming {...props} />);
  return { ...view, onAnswer };
}

const gaps = () => screen.findAllByRole('button').then((all) => all.filter((b) => b.hasAttribute('aria-pressed')));
const beams = (container: HTMLElement) => container.querySelectorAll('.vf-beam').length;
const reset = () => screen.getByRole('button', { name: 'Reset' });
const check = () => screen.getByRole('button', { name: 'Check' });

describe('fix-beaming component', () => {
  it('offers a join gap between each pair of neighbouring quavers of the wrong bar, all on to start with', async () => {
    const { container } = renderQuestion();
    await drawn(container);
    const buttons = await gaps();
    expect(buttons).toHaveLength(7);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `Join note ${n} and note ${n + 1}`));
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true);
    // Bar 1 has two minims and one bar, bar 2 has one beam over all eight quavers.
    expect(beams(container)).toBe(1);
  });

  it('offers no gap next to a note that cannot be beamed', async () => {
    const { container } = renderQuestion({ payload: mixed });
    await drawn(container);
    const buttons = await gaps();
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Join note 2 and note 3', 'Join note 3 and note 4', 'Join note 4 and note 5']);
  });

  it('a tap splits the beam there and a second tap joins it again, redrawing the bar', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    await user.click((await gaps())[3]!);
    await waitFor(() => expect(beams(container)).toBe(2));
    expect((await gaps())[3]).toHaveAttribute('aria-pressed', 'false');
    await user.click((await gaps())[3]!);
    await waitFor(() => expect(beams(container)).toBe(1));
    expect((await gaps())[3]).toHaveAttribute('aria-pressed', 'true');
  });

  it('Check commits the groups as joined, and the standard beaming marks right', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion();
    await drawn(container);
    await user.click((await gaps())[3]!);
    await user.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ beams: [[0, 1, 2, 3], [4, 5, 6, 7]] });
    expect(mark(payload, onAnswer.mock.calls[0]![0]).correct).toBe(true);
  });

  it('Check is available at once: leaving the beams as given is an answer (and marks wrong)', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion();
    await drawn(container);
    expect(check()).toBeEnabled();
    await user.click(check());
    expect(mark(payload, onAnswer.mock.calls[0]![0]).correct).toBe(false);
  });

  it('Reset is disabled until something changes, then puts the beams back as given', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    expect(reset()).toBeDisabled();
    await user.click((await gaps())[3]!);
    expect(reset()).toBeEnabled();
    await user.click(reset());
    await waitFor(() => expect(beams(container)).toBe(1));
    expect((await gaps()).every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(reset()).toBeDisabled();
  });

  it('keyboard: arrows move between gaps, Enter toggles, focus stays put', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await drawn(container);
    const buttons = await gaps();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{Enter}');
    await waitFor(() => expect(beams(container)).toBe(2));
    expect(document.activeElement).toHaveAttribute('aria-label', 'Join note 4 and note 5');
    expect(document.activeElement).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores an earlier answer and reports changes (never on mount)', async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn<(a: FixBeamingAnswer | null) => void>();
    const { container } = renderQuestion({ initialAnswer: { beams: [[0, 1], [2, 3], [4, 5, 6, 7]] }, onAnswerChange });
    await drawn(container);
    await waitFor(() => expect(beams(container)).toBe(3));
    expect((await gaps()).map((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([true, false, true, false, true, true, true]);
    expect(onAnswerChange).not.toHaveBeenCalled();
    await user.click((await gaps())[1]!);
    expect(onAnswerChange).toHaveBeenLastCalledWith({ beams: [[0, 1, 2, 3], [4, 5, 6, 7]] });
  });

  it('ignores an answer that does not fit the bar', async () => {
    const { container } = renderQuestion({ payload: mixed, initialAnswer: { beams: [[0, 1]] } });
    await drawn(container);
    expect((await gaps()).every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('Check is left out for a host that saves answers, but Reset stays', async () => {
    const { container } = renderQuestion({ hideCheck: true });
    await drawn(container);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(reset()).toBeInTheDocument();
  });

  it('after an answer the beams cannot be changed', async () => {
    const user = userEvent.setup();
    const result = mark(payload, { beams: [[0, 1, 2, 3, 4, 5, 6, 7]] });
    const { container } = renderQuestion({ result });
    await drawn(container);
    await user.click((await gaps())[3]!);
    expect(beams(container)).toBe(1);
    expect(check()).toBeDisabled();
    expect(reset()).toBeDisabled();
  });
});
