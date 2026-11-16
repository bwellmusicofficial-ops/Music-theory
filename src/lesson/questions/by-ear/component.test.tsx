import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import type { MarkResult } from '@/lesson/contracts';
import { ByEar, setByEarNotationRenderer } from './component';
import { passageOf, specExample } from './test-helpers';
import type { ByEarAnswer, ByEarPayload } from './types';

const audio = vi.hoisted(() => {
  const plays: { passage: unknown; options: unknown; finish: () => void; stop: ReturnType<typeof vi.fn> }[] = [];
  return {
    plays,
    unlock: vi.fn(() => Promise.resolve()),
    load: vi.fn(() => Promise.resolve()),
    getAudioEngine: vi.fn(),
  };
});
vi.mock('@/audio', () => ({
  getAudioEngine: (...a: unknown[]) => {
    audio.getAudioEngine(...a);
    return {
      unlock: audio.unlock,
      load: audio.load,
      playPassage: (passage: unknown, options: unknown) => {
        let finish = () => {};
        const done = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const stop = vi.fn(() => finish());
        audio.plays.push({ passage, options, finish, stop });
        return { stop, done };
      },
    };
  },
}));

const oneClip: ByEarPayload = {
  clips: [specExample.clips[0]!],
  options: [
    { id: 'short', face: { kind: 'text', text: 'Short notes' } , reason: 'Those are short.' },
    { id: 'long', face: { kind: 'text', text: 'Long notes' } },
  ],
  correct: 'long',
};

beforeEach(() => {
  audio.plays.length = 0;
  audio.getAudioEngine.mockClear();
  audio.unlock.mockClear();
  audio.load.mockClear();
});
afterEach(() => setByEarNotationRenderer(null));

beforeAll(() => installStaveStubs());

function setup(
  payload: ByEarPayload,
  options: { locked?: boolean; result?: MarkResult | null; initialAnswer?: ByEarAnswer; onAnswerChange?: (a: ByEarAnswer | null) => void } = {},
) {
  const onAnswer = vi.fn<(a: ByEarAnswer) => void>();
  const ui = (locked: boolean, result: MarkResult | null) => (
    <ByEar
      payload={payload}
      terminology="uk"
      locked={locked}
      result={result}
      onAnswer={onAnswer}
      initialAnswer={options.initialAnswer}
      onAnswerChange={options.onAnswerChange}
    />
  );
  const view = render(ui(options.locked ?? false, options.result ?? null));
  return { onAnswer, unmount: view.unmount, rerenderWith: (l: boolean, r: MarkResult | null) => view.rerender(ui(l, r)) };
}

const option = (name: string | RegExp) => screen.getByRole('button', { name });
/** Presses a play button and lets the clip run to its end. */
async function playToEnd(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: label }));
  await act(async () => {
    audio.plays.at(-1)?.finish();
  });
}

describe('ByEar: audio only after a gesture', () => {
  it('makes no audio call on render', () => {
    setup(specExample);
    expect(audio.getAudioEngine).not.toHaveBeenCalled();
    expect(audio.unlock).not.toHaveBeenCalled();
    expect(audio.plays).toHaveLength(0);
  });

  it('plays a clip with its own passage and bpm when its button is pressed', async () => {
    const user = userEvent.setup();
    setup(specExample);
    await user.click(screen.getByRole('button', { name: 'Play clip B' }));
    expect(audio.unlock).toHaveBeenCalledOnce();
    expect(audio.plays).toHaveLength(1);
    expect(audio.plays[0]?.passage).toEqual(specExample.clips[1]?.passage);
    expect(audio.plays[0]?.options).toEqual({ bpm: 90 });
  });
});

describe('ByEar: gating the options', () => {
  it('has one play button per clip, labelled A and B', () => {
    setup(specExample);
    expect(screen.getByRole('button', { name: 'Play clip A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play clip B' })).toBeInTheDocument();
  });

  it('a single clip has one plain Play button', () => {
    setup(oneClip);
    expect(screen.getByRole('button', { name: 'Play the clip' })).toBeInTheDocument();
  });

  it('keeps the options disabled until every clip has been played to the end', async () => {
    const user = userEvent.setup();
    setup(specExample);
    expect(option('Clip A')).toBeDisabled();
    expect(screen.getByText('Play every clip to the end to unlock the answers.')).toBeInTheDocument();
    await playToEnd(user, 'Play clip A');
    expect(option('Clip A')).toBeDisabled();
    await playToEnd(user, 'Play clip B');
    expect(option('Clip A')).toBeEnabled();
    expect(option('Clip B')).toBeEnabled();
    expect(screen.getAllByText('Heard')).toHaveLength(2);
  });

  it('does not count a clip that is still playing', async () => {
    const user = userEvent.setup();
    setup(oneClip);
    await user.click(screen.getByRole('button', { name: 'Play the clip' }));
    expect(option('Short notes')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop the clip' })).toBeInTheDocument();
  });

  it('does not count a clip that was stopped early', async () => {
    const user = userEvent.setup();
    setup(oneClip);
    await user.click(screen.getByRole('button', { name: 'Play the clip' }));
    await user.click(screen.getByRole('button', { name: 'Stop the clip' }));
    expect(audio.plays[0]?.stop).toHaveBeenCalledOnce();
    expect(option('Short notes')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play the clip' })).toBeInTheDocument();
  });

  it('starting another clip stops the first without counting it', async () => {
    const user = userEvent.setup();
    setup(specExample);
    await user.click(screen.getByRole('button', { name: 'Play clip A' }));
    await user.click(screen.getByRole('button', { name: 'Play clip B' }));
    expect(audio.plays[0]?.stop).toHaveBeenCalledOnce();
    await act(async () => {
      audio.plays[1]?.finish();
    });
    expect(option('Clip A')).toBeDisabled();
    await playToEnd(user, 'Play clip A');
    expect(option('Clip A')).toBeEnabled();
  });

  it('allows replaying without limit', async () => {
    const user = userEvent.setup();
    setup(oneClip);
    await playToEnd(user, 'Play the clip');
    await playToEnd(user, 'Play the clip');
    await playToEnd(user, 'Play the clip');
    expect(audio.plays).toHaveLength(3);
    expect(option('Short notes')).toBeEnabled();
  });

  it('stops the clip on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = setup(oneClip);
    await user.click(screen.getByRole('button', { name: 'Play the clip' }));
    unmount();
    expect(audio.plays[0]?.stop).toHaveBeenCalledOnce();
  });

  it('shows a message and keeps the options locked when sound fails', async () => {
    const user = userEvent.setup();
    audio.unlock.mockRejectedValueOnce(new Error('no audio'));
    setup(oneClip);
    await user.click(screen.getByRole('button', { name: 'Play the clip' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sound could not be played on this device.');
    expect(option('Short notes')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play the clip' })).toBeEnabled();
  });
});

describe('ByEar: answering', () => {
  it('commits the option as soon as it is tapped', async () => {
    const user = userEvent.setup();
    const { onAnswer } = setup(oneClip);
    await playToEnd(user, 'Play the clip');
    await user.click(option('Long notes'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ optionId: 'long' });
  });

  it('shows the options in array order with letters', async () => {
    setup(specExample);
    const list = screen.getByRole('list', { name: 'Answer options' });
    expect(list.textContent).toMatch(/A.*Clip A.*B.*Clip B/);
  });

  it('can be answered with the keyboard', async () => {
    const user = userEvent.setup();
    const { onAnswer } = setup(oneClip);
    await user.tab();
    await user.keyboard('{Enter}');
    await act(async () => {
      audio.plays.at(-1)?.finish();
    });
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onAnswer).toHaveBeenCalledWith({ optionId: 'short' });
  });
});

describe('ByEar: locked and result', () => {
  it('disables the options when locked, even after listening', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = setup(oneClip);
    await playToEnd(user, 'Play the clip');
    rerenderWith(true, null);
    expect(option('Short notes')).toBeDisabled();
    expect(option('Long notes')).toBeDisabled();
  });

  it('labels the right answer and the learner\'s wrong answer in words', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = setup(oneClip);
    await playToEnd(user, 'Play the clip');
    await user.click(option('Short notes'));
    rerenderWith(true, { correct: false, score: 0, reason: 'Those are short.' });
    expect(screen.getByText('Your answer')).toBeInTheDocument();
    expect(screen.getByText('Correct answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Short notes/ })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: /Long notes/ })).toHaveAttribute('data-state', 'right');
  });

  it('does not hide the unlock hint behind a locked state, and lets the learner replay', async () => {
    const user = userEvent.setup();
    setup(oneClip, { locked: true, result: { correct: true, score: 1 } });
    expect(screen.queryByText(/to the end to unlock/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Play the clip' }));
    expect(audio.plays).toHaveLength(1);
  });
});

describe('ByEar: notation faces', () => {
  const passageOptions: ByEarPayload = {
    clips: oneClip.clips,
    options: [
      { id: 'a', face: { kind: 'passage', passage: passageOf('crotchet', 'crotchet') }, reason: 'r' },
      { id: 'b', face: { kind: 'passage', passage: passageOf('minim') } },
    ],
    correct: 'b',
  };

  it('draws a passage face as notation without an injected renderer, and never plays it', () => {
    setup(passageOptions);
    expect(document.querySelectorAll('[data-face="passage"] [data-passage-view]')).toHaveLength(2);
    expect(audio.plays).toHaveLength(0);
  });

  it('draws a passage face with the injected renderer', () => {
    setByEarNotationRenderer((passage) => <span>{`bars:${passage.bars.length}`}</span>);
    setup(passageOptions);
    expect(screen.getAllByText('bars:1')).toHaveLength(2);
  });
});

describe('ByEar: restoring and reporting an answer', () => {
  it('shows a restored choice as selected, unmarked, with the options open', () => {
    setup(oneClip, { initialAnswer: { optionId: 'short' } });
    expect(option(/Short notes/)).toHaveAttribute('data-state', 'selected');
    expect(option(/Short notes/)).toHaveAttribute('aria-pressed', 'true');
    expect(option(/Long notes/)).toHaveAttribute('data-state', 'idle');
    expect(option(/Long notes/)).toBeEnabled();
  });

  it('reports each change of choice, and nothing on mount', async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn();
    setup(oneClip, { initialAnswer: { optionId: 'short' }, onAnswerChange });
    expect(onAnswerChange).not.toHaveBeenCalled();
    await user.click(option(/Long notes/));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ optionId: 'long' });
    await user.click(option(/Short notes/));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ optionId: 'short' });
    expect(onAnswerChange).toHaveBeenCalledTimes(2);
  });
});
