import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { Bar, Passage, ScoreEvent } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { drawn } from '@/lesson/questions/notation/stave-test-helpers';
import { SpotMistake } from './component';
import { mark } from './mark';
import type { SpotMistakeAnswer, SpotMistakePayload } from './types';

const audio = vi.hoisted(() => {
  const state = { resolve: () => {} };
  return {
    state,
    stop: vi.fn(),
    playPassage: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    isUnlocked: () => true,
    unlock: async () => {},
    load: async () => {},
  };
});
vi.mock('@/audio', () => ({ getAudioEngine: () => audio }));

beforeAll(() => installStaveStubs());
beforeEach(() => {
  audio.stop.mockClear();
  audio.playPassage.mockReset();
  audio.playPassage.mockImplementation(() => ({
    stop: audio.stop,
    done: new Promise<void>((resolve) => {
      audio.state.resolve = resolve;
    }),
  }));
});
afterEach(cleanup);

const B4 = pitch.parsePitch('B4');
const note = (value: 'minim' | 'crotchet'): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots: 0 } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });
const passage = (...bars: Bar[]): Passage => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars,
});

const barQuestion: SpotMistakePayload = {
  passage: passage(bar(note('minim'), note('minim')), bar(note('minim'), note('crotchet'), note('minim')), bar(note('minim'), note('minim'))),
  select: 'bar',
  mistake: { bar: 1 },
  explanation: 'Bar 2 has 5 beats.',
};
const eventQuestion: SpotMistakePayload = {
  passage: passage(bar(note('minim'), note('minim')), bar(note('crotchet'), note('crotchet'), note('minim'))),
  select: 'event',
  mistake: { bar: 1, event: 2 },
  explanation: 'The third note in bar 2 is wrong.',
};

function renderQuestion(payload: SpotMistakePayload, over: Partial<{ locked: boolean; result: MarkResult | null }> = {}) {
  const onAnswer = vi.fn<(answer: SpotMistakeAnswer) => void>();
  const props = { payload, terminology: 'uk' as const, locked: false, result: null, onAnswer, ...over };
  const view = render(<SpotMistake {...props} />);
  return { ...view, onAnswer, update: (next: Partial<typeof props>) => view.rerender(<SpotMistake {...props} {...next} />) };
}

const eventButtons = () => screen.getAllByRole('button').filter((b) => /^Bar \d+, note/.test(b.getAttribute('aria-label') ?? ''));
const check = () => screen.getByRole('button', { name: 'Check' });

describe('spot-mistake component', () => {
  it('shows the passage in read + tap mode: one button per note, and a disabled Check', async () => {
    const { container } = renderQuestion(barQuestion);
    await drawn(container);
    expect(screen.getByRole('group', { name: 'Tap the bar with the mistake' })).toBeInTheDocument();
    expect(eventButtons()).toHaveLength(7);
    expect(check()).toBeDisabled();
  });

  it('names the bar as a measure in US terms', async () => {
    const onAnswer = vi.fn();
    render(<SpotMistake payload={barQuestion} terminology="us" locked={false} result={null} onAnswer={onAnswer} />);
    expect(await screen.findByRole('group', { name: 'Tap the measure with the mistake' })).toBeInTheDocument();
  });

  it('select "bar": a tap on any note of a bar selects the whole bar, shown as a highlight; Check commits the bar', async () => {
    const { container, onAnswer } = renderQuestion(barQuestion);
    await drawn(container);
    await userEvent.click(eventButtons()[3]!); // bar 2, event 1
    expect(screen.getByTestId('mark-highlight')).toBeInTheDocument();
    expect(check()).toBeEnabled();
    await userEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ bar: 1 });
    expect(onAnswer.mock.calls[0]![0]).not.toHaveProperty('event');
  });

  it('the selection can be changed before Check', async () => {
    const { container, onAnswer } = renderQuestion(barQuestion);
    await drawn(container);
    await userEvent.click(eventButtons()[0]!);
    await userEvent.click(eventButtons()[6]!);
    expect(screen.getAllByTestId('mark-highlight')).toHaveLength(1);
    await userEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ bar: 2 });
  });

  it('select "event": a tap selects that note, and Check commits bar and event', async () => {
    const { container, onAnswer } = renderQuestion(eventQuestion);
    await drawn(container);
    expect(screen.getByRole('group', { name: 'Tap the note or rest with the mistake' })).toBeInTheDocument();
    await userEvent.click(eventButtons()[4]!); // bar 2, event 2
    await userEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ bar: 1, event: 2 });
  });

  it('can be answered from the keyboard alone', async () => {
    const { container, onAnswer } = renderQuestion(eventQuestion);
    await drawn(container);
    const user = userEvent.setup();
    await user.tab();
    expect(eventButtons()[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(eventButtons()[4]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('mark-highlight')).toBeInTheDocument();
    await user.tab(); // leaves the stave: Check
    expect(check()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAnswer).toHaveBeenCalledWith({ bar: 1, event: 2 });
  });

  it('when locked, taps are ignored and Check is disabled: the stave is display-only', async () => {
    const { container, onAnswer } = renderQuestion(barQuestion, { locked: true });
    await drawn(container);
    expect(screen.queryAllByRole('button').filter((b) => b.className.includes('event-button'))).toHaveLength(0);
    expect(screen.getByRole('img', { name: 'Tap the bar with the mistake' })).toBeInTheDocument();
    expect(check()).toBeDisabled();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('with a wrong result, marks the chosen bar wrong and outlines the real mistake', async () => {
    const view = renderQuestion(barQuestion);
    await drawn(view.container);
    await userEvent.click(eventButtons()[0]!); // bar 1
    await userEvent.click(check());
    view.update({ locked: true, result: mark(barQuestion, { bar: 0 }) });
    await waitFor(() => expect(screen.getByTestId('bracket-wrong')).toBeInTheDocument());
    expect(screen.getByTestId('mark-highlight')).toBeInTheDocument();
    expect(screen.queryByTestId('bracket-correct')).toBeNull();
  });

  it('with a right result, marks the chosen note correct and nothing else', async () => {
    const view = renderQuestion(eventQuestion);
    await drawn(view.container);
    await userEvent.click(eventButtons()[4]!);
    await userEvent.click(check());
    view.update({ locked: true, result: mark(eventQuestion, { bar: 1, event: 2 }) });
    await waitFor(() => expect(screen.getByTestId('badge-correct')).toBeInTheDocument());
    expect(screen.queryByTestId('badge-wrong')).toBeNull();
    expect(screen.queryByTestId('mark-highlight')).toBeNull();
  });

  it('with a wrong event result, marks the tapped note wrong and outlines the real one', async () => {
    const view = renderQuestion(eventQuestion);
    await drawn(view.container);
    await userEvent.click(eventButtons()[0]!);
    await userEvent.click(check());
    view.update({ locked: true, result: mark(eventQuestion, { bar: 0, event: 0 }) });
    await waitFor(() => expect(screen.getByTestId('badge-wrong')).toBeInTheDocument());
    expect(screen.getByTestId('mark-highlight')).toBeInTheDocument();
  });

  describe('reference', () => {
    const withReference: SpotMistakePayload = {
      ...eventQuestion,
      reference: { bpm: 96, passage: passage(bar(note('minim'), note('minim')), bar(note('crotchet'), note('crotchet'), note('minim'))) },
    };

    it('has no play button without a reference', async () => {
      const { container } = renderQuestion(eventQuestion);
      await drawn(container);
      expect(screen.queryByRole('button', { name: /play/i })).toBeNull();
    });

    it('plays the reference at its tempo, can be stopped, and does not show it as notation', async () => {
      const { container } = renderQuestion(withReference);
      await drawn(container);
      expect(container.querySelectorAll('.mtn-stave')).toHaveLength(1);
      const user = userEvent.setup();
      const play = screen.getByRole('button', { name: 'Play the correct version' });
      expect(play).toHaveAttribute('aria-pressed', 'false');
      await user.click(play);
      await waitFor(() => expect(audio.playPassage).toHaveBeenCalledTimes(1));
      expect(audio.playPassage.mock.calls[0]![0]).toBe(withReference.reference!.passage);
      expect(audio.playPassage.mock.calls[0]![1]).toMatchObject({ bpm: 96 });
      const stop = await screen.findByRole('button', { name: 'Stop the correct version' });
      expect(stop).toHaveAttribute('aria-pressed', 'true');
      await user.click(stop);
      expect(audio.stop).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Play the correct version' })).toBeInTheDocument();
    });

    it('returns to Play when the clip ends', async () => {
      const { container } = renderQuestion(withReference);
      await drawn(container);
      await userEvent.click(screen.getByRole('button', { name: 'Play the correct version' }));
      await screen.findByRole('button', { name: 'Stop the correct version' });
      await act(async () => audio.state.resolve());
      expect(await screen.findByRole('button', { name: 'Play the correct version' })).toBeInTheDocument();
    });

    it('stops playing when the question goes away', async () => {
      const { container, unmount } = renderQuestion(withReference);
      await drawn(container);
      await userEvent.click(screen.getByRole('button', { name: 'Play the correct version' }));
      await screen.findByRole('button', { name: 'Stop the correct version' });
      unmount();
      expect(audio.stop).toHaveBeenCalled();
    });
  });
});
