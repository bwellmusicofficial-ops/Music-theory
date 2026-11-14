import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { Bar, ScoreEvent } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { drawn, editSurface } from '@/lesson/questions/notation/stave-test-helpers';
import type { Glyph } from '@/lesson/questions/shared';
import { CompleteBar } from './component';
import { mark } from './mark';
import type { CompleteBarAnswer, CompleteBarPayload } from './types';

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ noteOn: vi.fn(), noteOff: vi.fn(), isUnlocked: () => true, unlock: async () => {}, load: async () => {} }),
}));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const B4 = pitch.parsePitch('B4');
const note = (value: Glyph['duration']['value']): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots: 0 } });
const g = (kind: Glyph['kind'], value: Glyph['duration']['value']): Glyph => ({ kind, duration: { value, dots: 0 } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });

const base: CompleteBarPayload = {
  passage: {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time: { beats: 4, beatUnit: 4 },
    bars: [bar(note('crotchet'), note('crotchet'))],
  },
  barIndex: 0,
  palette: [g('note', 'crotchet'), g('note', 'minim')],
  fillPitch: B4,
  count: 1,
};

function renderQuestion(payload = base, over: Partial<{ locked: boolean; result: MarkResult | null }> = {}) {
  const onAnswer = vi.fn<(answer: CompleteBarAnswer) => void>();
  const props = { payload, terminology: 'uk' as const, locked: false, result: null, onAnswer, ...over };
  const view = render(<CompleteBar {...props} />);
  return { ...view, onAnswer, update: (next: Partial<typeof props>) => view.rerender(<CompleteBar {...props} {...next} />) };
}

const notes = (container: HTMLElement) => container.querySelectorAll('.vf-stavenote').length;
const check = () => screen.getByRole('button', { name: 'Check' });
const reset = () => screen.getByRole('button', { name: 'Reset' });

describe('complete-bar component', () => {
  it('shows the stave in fill-the-gap mode with only the payload palette, and Check and Reset disabled', async () => {
    const { container } = renderQuestion();
    await drawn(container);
    expect(screen.getByRole('application', { name: 'Complete the bar' })).toBeInTheDocument();
    expect(notes(container)).toBe(2);
    expect(screen.getByRole('button', { name: /^crotchet$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^minim$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^semibreve$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^rest$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^dot$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /sharp|flat/i })).toBeNull();
    expect(check()).toBeDisabled();
    expect(reset()).toBeDisabled();
  });

  it('offers rests and dots only when the palette has them', async () => {
    const withRest: CompleteBarPayload = {
      ...base,
      count: undefined,
      palette: [g('note', 'crotchet'), g('rest', 'crotchet')],
    };
    const { container } = renderQuestion(withRest);
    await drawn(container);
    expect(screen.getByRole('button', { name: /^rest$/i })).toBeInTheDocument();
    cleanup();
    const dotted: CompleteBarPayload = { ...base, palette: [g('note', 'crotchet'), { kind: 'note', duration: { value: 'minim', dots: 1 } }] };
    const second = renderQuestion(dotted);
    await drawn(second.container);
    expect(screen.getByRole('button', { name: /^dot$/i })).toBeInTheDocument();
  });

  it('adds the armed symbol by pointer, at the fill pitch, and Check commits the added symbols', async () => {
    const { container, onAnswer } = renderQuestion();
    await drawn(container);
    await userEvent.click(screen.getByRole('button', { name: /^minim$/i }));
    // Tapping high above the middle line still places the note on the fill pitch.
    editSurface(container).tapSlot(0, 2, 9);
    await waitFor(() => expect(notes(container)).toBe(3));
    expect(screen.getByTestId('stave-live')).toHaveTextContent(/^B4, minim/);
    expect(check()).toBeEnabled();
    await userEvent.click(check());
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ added: [g('note', 'minim')] });
    expect(mark(base, onAnswer.mock.calls[0]![0])).toEqual({ correct: true, score: 1 });
  });

  it('can be answered from the keyboard: Enter adds the armed symbol, then Check', async () => {
    const { container, onAnswer } = renderQuestion({ ...base, count: 2 });
    await drawn(container);
    const user = userEvent.setup();
    screen.getByTestId('stave-surface').focus();
    await user.keyboard('{Enter}{Enter}');
    await waitFor(() => expect(notes(container)).toBe(4));
    check().focus();
    await user.keyboard('{Enter}');
    expect(onAnswer).toHaveBeenCalledWith({ added: [g('note', 'crotchet'), g('note', 'crotchet')] });
  });

  it('the given notes cannot be changed', async () => {
    const { container } = renderQuestion();
    await drawn(container);
    const user = userEvent.setup();
    const surface = screen.getByTestId('stave-surface');
    surface.focus();
    await user.keyboard('{Backspace}');
    expect(notes(container)).toBe(2);
    expect(screen.getByTestId('stave-live')).toHaveTextContent('That note is fixed.');
  });

  it('Reset restores the starting passage', async () => {
    const { container } = renderQuestion();
    await drawn(container);
    const user = userEvent.setup();
    screen.getByTestId('stave-surface').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(notes(container)).toBe(3));
    await user.click(reset());
    await waitFor(() => expect(notes(container)).toBe(2));
    expect(check()).toBeDisabled();
    expect(reset()).toBeDisabled();
  });

  it('refuses a symbol that is not in the payload palette, with a message', async () => {
    const rests: CompleteBarPayload = { ...base, count: undefined, palette: [g('note', 'crotchet'), g('rest', 'minim')] };
    const { container } = renderQuestion(rests);
    await drawn(container);
    const user = userEvent.setup();
    const surface = screen.getByTestId('stave-surface');
    surface.focus();
    // '6' arms a minim; as a note that is not in the palette (only a minim rest is).
    await user.keyboard('6{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('That symbol is not one of the choices for this question.');
    await drawn(container);
    expect(notes(container)).toBe(2);
    expect(check()).toBeDisabled();
  });

  it('refuses more than 12 added symbols', async () => {
    const tiny: CompleteBarPayload = {
      ...base,
      count: undefined,
      passage: { ...base.passage, bars: [bar(note('crotchet'))] },
      palette: [g('note', 'demisemiquaver'), g('note', 'crotchet')],
    };
    const { container } = renderQuestion(tiny);
    await drawn(container);
    const user = userEvent.setup();
    screen.getByTestId('stave-surface').focus();
    await user.keyboard('2');
    for (let i = 0; i < 12; i++) await user.keyboard('{Enter}');
    await waitFor(() => expect(notes(container)).toBe(13));
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('You can add up to 12 symbols.');
    await waitFor(() => expect(notes(container)).toBe(13));
  });

  it('when locked, shows the bar read-only and disables Check and Reset', async () => {
    const view = renderQuestion();
    await drawn(view.container);
    const user = userEvent.setup();
    screen.getByTestId('stave-surface').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(notes(view.container)).toBe(3));
    view.update({ locked: true });
    await waitFor(() => expect(screen.queryByTestId('stave-surface')).toBeNull());
    expect(screen.getByRole('img', { name: 'The bar with your notes added' })).toBeInTheDocument();
    expect(notes(view.container)).toBe(3);
    expect(check()).toBeDisabled();
    expect(reset()).toBeDisabled();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('with a result, marks the bar correct or wrong with a bracket and badge', async () => {
    const view = renderQuestion();
    await drawn(view.container);
    const user = userEvent.setup();
    screen.getByTestId('stave-surface').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(notes(view.container)).toBe(3));
    view.update({ locked: true, result: mark(base, { added: [g('note', 'crotchet')] }) });
    await waitFor(() => expect(screen.getByTestId('bracket-wrong')).toBeInTheDocument());
    expect(screen.queryByTestId('bracket-correct')).toBeNull();
    view.update({ locked: true, result: { correct: true, score: 1 } });
    await waitFor(() => expect(screen.getByTestId('bracket-correct')).toBeInTheDocument());
  });
});
