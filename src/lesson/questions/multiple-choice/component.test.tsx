import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MarkResult } from '@/lesson/contracts';
import { MultipleChoice } from './component';
import type { MultipleChoiceAnswer, MultipleChoicePayload } from './types';

const payload: MultipleChoicePayload = {
  options: [
    { id: 'a', face: { kind: 'text', text: 'Minim' }, reason: 'It is hollow, so it is a minim.' },
    { id: 'b', face: { kind: 'text', text: 'Crotchet' } },
    { id: 'c', face: { kind: 'text', text: 'Semibreve' }, reason: 'It has no stem.' },
  ],
  correct: 'b',
};

function renderQuestion(overrides: Partial<{ locked: boolean; result: MarkResult | null }> = {}) {
  const onAnswer = vi.fn<(answer: MultipleChoiceAnswer) => void>();
  const view = render(
    <MultipleChoice
      payload={payload}
      terminology="uk"
      locked={overrides.locked ?? false}
      result={overrides.result ?? null}
      onAnswer={onAnswer}
    />,
  );
  return { onAnswer, ...view };
}

describe('MultipleChoice component', () => {
  it('shows the options as large buttons in array order', () => {
    renderQuestion();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['AMinim', 'BCrotchet', 'CSemibreve']);
    buttons.forEach((button) => expect(button.className).toContain('min-h-14'));
  });

  it('commits the answer as soon as an option is chosen, with no Check button', async () => {
    const { onAnswer } = renderQuestion();
    await userEvent.click(screen.getByRole('button', { name: /Crotchet/ }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ optionId: 'b' });
    expect(screen.queryByRole('button', { name: /check/i })).not.toBeInTheDocument();
  });

  it('disables every option when locked and does not answer', async () => {
    const { onAnswer } = renderQuestion({ locked: true });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: /Minim/ }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('labels the correct option and the chosen wrong option in text, not only colour', async () => {
    const { rerender, onAnswer } = renderQuestion();
    await userEvent.click(screen.getByRole('button', { name: /Minim/ }));
    expect(onAnswer).toHaveBeenCalledWith({ optionId: 'a' });

    rerender(
      <MultipleChoice
        payload={payload}
        terminology="uk"
        locked
        result={{ correct: false, score: 0, reason: 'It is hollow, so it is a minim.' }}
        onAnswer={onAnswer}
      />,
    );
    const minim = screen.getByRole('button', { name: /Minim/ });
    expect(within(minim).getByText('Your answer')).toBeInTheDocument();
    expect(minim.dataset.state).toBe('wrong');
    const crotchet = screen.getByRole('button', { name: /Crotchet/ });
    expect(within(crotchet).getByText('Correct answer')).toBeInTheDocument();
    expect(crotchet.dataset.state).toBe('right');
    expect(screen.queryByText('Semibreve', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Semibreve/ }).dataset.state).toBe('other');
  });

  it('shows a correct answer with its label when the right option was chosen', () => {
    renderQuestion({ locked: true, result: { correct: true, score: 1 } });
    const crotchet = screen.getByRole('button', { name: /Crotchet/ });
    expect(within(crotchet).getByText('Correct answer')).toBeInTheDocument();
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument();
  });

  it('can be used from the keyboard: Tab to an option and press Enter or Space', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion();
    await user.tab();
    expect(screen.getByRole('button', { name: /Minim/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAnswer).toHaveBeenLastCalledWith({ optionId: 'a' });

    await user.tab();
    expect(screen.getByRole('button', { name: /Crotchet/ })).toHaveFocus();
    await user.keyboard(' ');
    expect(onAnswer).toHaveBeenLastCalledWith({ optionId: 'b' });
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('ignores a click that arrives while locked', () => {
    const { onAnswer } = renderQuestion({ locked: true });
    fireEvent.click(screen.getByRole('button', { name: /Semibreve/ }));
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('MultipleChoice exhibit', () => {
  const g4 = { letter: 'G' as const, accidental: 0 as const, octave: 4 };
  const withExhibit: MultipleChoicePayload = {
    ...payload,
    exhibit: {
      kind: 'passage',
      passage: {
        clef: 'treble',
        key: { tonic: { letter: 'G', accidental: 0 }, mode: 'major' },
        time: { beats: 4, beatUnit: 4 },
        bars: [{ events: [{ kind: 'note', pitches: [g4], duration: { value: 'semibreve', dots: 0 } }] }],
      },
    },
  };

  it('draws the music the question asks about above the options', () => {
    const { container } = render(
      <MultipleChoice payload={withExhibit} terminology="uk" locked={false} result={null} onAnswer={() => {}} />,
    );
    const exhibit = container.querySelector('[data-question-exhibit]');
    expect(exhibit).not.toBeNull();
    expect(exhibit?.querySelector('[data-exhibit="passage"]')).not.toBeNull();
    // A reading question: no Play button, and the exhibit comes before the answer buttons.
    expect(within(exhibit as HTMLElement).queryByRole('button', { name: /play/i })).toBeNull();
    const firstOption = screen.getAllByRole('button')[0]!;
    expect(exhibit!.compareDocumentPosition(firstOption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws nothing extra when the question has no exhibit', () => {
    const { container } = render(
      <MultipleChoice payload={payload} terminology="uk" locked={false} result={null} onAnswer={() => {}} />,
    );
    expect(container.querySelector('[data-question-exhibit]')).toBeNull();
  });
});
