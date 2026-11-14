import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MarkResult } from '@/lesson/contracts';
import { Ordering } from './component';
import type { OrderingAnswer, OrderingPayload } from './types';

const payload: OrderingPayload = {
  items: [
    { id: 'minim', face: { kind: 'text', text: 'Minim' } },
    { id: 'semibreve', face: { kind: 'text', text: 'Semibreve' } },
    { id: 'crotchet', face: { kind: 'text', text: 'Crotchet' } },
  ],
  correctOrder: ['crotchet', 'minim', 'semibreve'],
  ends: { first: 'shortest', last: 'longest' },
  reason: 'Shortest to longest.',
};

function renderQuestion(options: { locked?: boolean; result?: MarkResult | null } = {}) {
  const onAnswer = vi.fn<(answer: OrderingAnswer) => void>();
  const ui = (locked: boolean, result: MarkResult | null) => (
    <Ordering payload={payload} terminology="uk" locked={locked} result={result} onAnswer={onAnswer} />
  );
  const view = render(ui(options.locked ?? false, options.result ?? null));
  return { onAnswer, rerenderWith: (locked: boolean, result: MarkResult | null) => view.rerender(ui(locked, result)) };
}

/** The item texts in their current on-screen order. */
const currentOrder = () => screen.getAllByRole('listitem').map((row) => row.textContent?.replace(/Move (up|down)/g, '').replace(/^\d+/, '').replace(/In the right place|Out of place/, '').trim());

describe('Ordering component', () => {
  it('shows the items in array order with the end labels', () => {
    renderQuestion();
    expect(currentOrder()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
    expect(screen.getByText('shortest')).toBeInTheDocument();
    expect(screen.getByText('longest')).toBeInTheDocument();
  });

  it('moves an item down and up with its buttons and disables the buttons at the ends', async () => {
    const user = userEvent.setup();
    renderQuestion();
    const [first, , last] = screen.getAllByRole('listitem');
    expect(within(first as HTMLElement).getByRole('button', { name: 'Move up' })).toBeDisabled();
    expect(within(last as HTMLElement).getByRole('button', { name: 'Move down' })).toBeDisabled();

    await user.click(within(first as HTMLElement).getByRole('button', { name: 'Move down' }));
    expect(currentOrder()).toEqual(['Semibreve', 'Minim', 'Crotchet']);

    await user.click(within(screen.getAllByRole('listitem')[1] as HTMLElement).getByRole('button', { name: 'Move up' }));
    expect(currentOrder()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
  });

  it('commits the learner order when Check is pressed', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion();
    await user.click(within(screen.getAllByRole('listitem')[2] as HTMLElement).getByRole('button', { name: 'Move up' }));
    await user.click(within(screen.getAllByRole('listitem')[1] as HTMLElement).getByRole('button', { name: 'Move up' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ order: ['crotchet', 'minim', 'semibreve'] });
  });

  it('disables moves and Check when locked', () => {
    renderQuestion({ locked: true });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });

  it('shows whether each position is right or wrong in text', () => {
    renderQuestion({ locked: true, result: { correct: false, score: 1 / 3, reason: 'x' } });
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0] as HTMLElement).getByText('Out of place')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Out of place')).toBeInTheDocument();
  });

  it('marks a row in the right place as right', async () => {
    const user = userEvent.setup();
    const { rerenderWith, onAnswer } = renderQuestion();
    await user.click(within(screen.getAllByRole('listitem')[0] as HTMLElement).getByRole('button', { name: 'Move down' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ order: ['semibreve', 'minim', 'crotchet'] });
    rerenderWith(true, { correct: false, score: 0, reason: 'x' });
    const rows = screen.getAllByRole('listitem');
    // Position 2 holds minim, which belongs there. Positions 1 and 3 do not.
    expect(rows[1]).toHaveTextContent('In the right place');
    expect(rows[0]).toHaveTextContent('Out of place');
    expect(rows[2]).toHaveTextContent('Out of place');
  });

  it('can be reordered from the keyboard, and focus follows the moved item', async () => {
    const user = userEvent.setup();
    renderQuestion();
    await user.tab();
    expect(screen.getAllByRole('button', { name: 'Move down' })[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(currentOrder()).toEqual(['Semibreve', 'Minim', 'Crotchet']);
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: 'Move down' })[1]);
    expect(document.activeElement?.closest('li')).toHaveTextContent('Minim');
  });
});
