import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MarkResult } from '@/lesson/contracts';
import { MatchUp } from './component';
import type { MatchUpAnswer, MatchUpPayload } from './types';

const payload: MatchUpPayload = {
  left: [
    { id: 'crotchet', face: { kind: 'text', text: 'Crotchet' }, match: 'one', reason: 'Crotchets last 1 beat.' },
    { id: 'minim', face: { kind: 'text', text: 'Minim' }, match: 'two', reason: 'Minims last 2 beats.' },
    { id: 'semibreve', face: { kind: 'text', text: 'Semibreve' }, match: 'four', reason: 'Semibreves last 4 beats.' },
  ],
  right: [
    { id: 'four', face: { kind: 'text', text: 'Four beats' } },
    { id: 'one', face: { kind: 'text', text: 'One beat' } },
    { id: 'two', face: { kind: 'text', text: 'Two beats' } },
  ],
};

function renderQuestion(options: { locked?: boolean; result?: MarkResult | null } = {}) {
  const onAnswer = vi.fn<(answer: MatchUpAnswer) => void>();
  const ui = (locked: boolean, result: MarkResult | null) => (
    <MatchUp payload={payload} terminology="uk" locked={locked} result={result} onAnswer={onAnswer} />
  );
  const view = render(ui(options.locked ?? false, options.result ?? null));
  return { onAnswer, rerenderWith: (locked: boolean, result: MarkResult | null) => view.rerender(ui(locked, result)) };
}

const itemButton = (name: RegExp) => screen.getByRole('button', { name });

describe('MatchUp component', () => {
  it('pairs a left item with a right item when tapped in that order', async () => {
    const user = userEvent.setup();
    renderQuestion();
    await user.click(itemButton(/Crotchet/));
    await user.click(itemButton(/One beat/));
    expect(itemButton(/Crotchet/)).toHaveTextContent('Paired with B');
    expect(itemButton(/One beat/)).toHaveTextContent('Paired with 1');
  });

  it('keeps Check disabled until every left item is paired, then commits all pairs', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion();
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();

    await user.click(itemButton(/Crotchet/));
    await user.click(itemButton(/One beat/));
    await user.click(itemButton(/Minim/));
    await user.click(itemButton(/Two beats/));
    await user.click(itemButton(/Semibreve/));
    await user.click(itemButton(/Four beats/));
    expect(check).toBeEnabled();

    await user.click(check);
    expect(onAnswer).toHaveBeenCalledWith({ pairs: { crotchet: 'one', minim: 'two', semibreve: 'four' } });
  });

  it('unpairs a left item when it is tapped again, and a right item when it is tapped again', async () => {
    const user = userEvent.setup();
    renderQuestion();
    await user.click(itemButton(/Crotchet/));
    await user.click(itemButton(/One beat/));
    await user.click(itemButton(/Crotchet/));
    expect(itemButton(/Crotchet/)).toHaveTextContent('Not paired');

    await user.click(itemButton(/Crotchet/));
    await user.click(itemButton(/One beat/));
    await user.click(itemButton(/One beat/));
    expect(itemButton(/Crotchet/)).toHaveTextContent('Not paired');
    expect(itemButton(/One beat/)).toHaveTextContent('Not paired');
  });

  it('moves a right item to a new left item when it is already used', async () => {
    const user = userEvent.setup();
    renderQuestion();
    await user.click(itemButton(/Crotchet/));
    await user.click(itemButton(/One beat/));
    await user.click(itemButton(/Minim/));
    await user.click(itemButton(/One beat/));
    expect(itemButton(/Crotchet/)).toHaveTextContent('Not paired');
    expect(itemButton(/Minim/)).toHaveTextContent('Paired with B');
  });

  it('disables every control and Check when locked', () => {
    renderQuestion({ locked: true });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });

  it('marks each left item right or wrong in text and says where a wrong one should go', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderQuestion();
    await user.click(itemButton(/Crotchet/));
    await user.click(itemButton(/One beat/));
    await user.click(itemButton(/Minim/));
    await user.click(itemButton(/Four beats/));
    await user.click(itemButton(/Semibreve/));
    await user.click(itemButton(/Two beats/));
    rerenderWith(true, { correct: false, score: 1 / 3, reason: '1 of 3 pairs are right.' });

    expect(within(itemButton(/Crotchet/)).getByText('Right pair')).toBeInTheDocument();
    const minim = itemButton(/Minim/);
    expect(within(minim).getByText('Wrong pair')).toBeInTheDocument();
    expect(minim).toHaveTextContent('Should be paired with C');
    expect(within(itemButton(/Semibreve/)).getByText('Wrong pair')).toBeInTheDocument();
  });

  it('works from the keyboard: Tab to a left item, Enter, then Tab to a right item and Enter', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion();
    await user.tab();
    expect(itemButton(/Crotchet/)).toHaveFocus();
    await user.keyboard('{Enter}');
    // Focus order: the other three left items, then the first right item, then "One beat".
    for (let step = 0; step < 4; step += 1) await user.tab();
    expect(itemButton(/One beat/)).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(itemButton(/One beat/)).toBeInTheDocument();
    expect(itemButton(/Crotchet/)).toHaveTextContent('Paired with B');
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
