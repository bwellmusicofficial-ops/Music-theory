import { fireEvent, render, screen, within } from '@testing-library/react';
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
const currentOrder = () =>
  screen
    .getAllByRole('listitem')
    .map((row) => row.querySelector('[data-face]')?.textContent);

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
    expect(within(first as HTMLElement).getByRole('button', { name: /^Move .* up$/ })).toBeDisabled();
    expect(within(last as HTMLElement).getByRole('button', { name: /^Move .* down$/ })).toBeDisabled();

    await user.click(within(first as HTMLElement).getByRole('button', { name: /^Move .* down$/ }));
    expect(currentOrder()).toEqual(['Semibreve', 'Minim', 'Crotchet']);

    await user.click(within(screen.getAllByRole('listitem')[1] as HTMLElement).getByRole('button', { name: /^Move .* up$/ }));
    expect(currentOrder()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
  });

  it('commits the learner order when Check is pressed', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion();
    await user.click(within(screen.getAllByRole('listitem')[2] as HTMLElement).getByRole('button', { name: /^Move .* up$/ }));
    await user.click(within(screen.getAllByRole('listitem')[1] as HTMLElement).getByRole('button', { name: /^Move .* up$/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ order: ['crotchet', 'minim', 'semibreve'] });
  });

  it('commits the starting order from "This order is correct" without any move', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion();
    await user.click(screen.getByRole('button', { name: 'This order is correct' }));
    expect(onAnswer).toHaveBeenCalledWith({ order: ['minim', 'semibreve', 'crotchet'] });
    expect(screen.queryByRole('button', { name: 'This order is correct' })).toBeNull();
  });

  it('with the Check button hidden, "This order is correct" reports the order as the answer', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const onAnswerChange = vi.fn();
    render(
      <Ordering payload={payload} terminology="uk" locked={false} result={null} onAnswer={onAnswer} onAnswerChange={onAnswerChange} hideCheck />,
    );
    await user.click(screen.getByRole('button', { name: 'This order is correct' }));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ order: ['minim', 'semibreve', 'crotchet'] });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('does not offer "This order is correct" once a result is shown', () => {
    renderQuestion({ locked: true, result: { correct: false, score: 0, reason: 'x' } });
    expect(screen.queryByRole('button', { name: 'This order is correct' })).toBeNull();
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
    await user.click(within(screen.getAllByRole('listitem')[0] as HTMLElement).getByRole('button', { name: /^Move .* down$/ }));
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
    await user.tab(); // the first row
    await user.tab(); // its Move up button (disabled, skipped) then Move down
    expect(screen.getAllByRole('button', { name: /^Move .* down$/ })[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(currentOrder()).toEqual(['Semibreve', 'Minim', 'Crotchet']);
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: /^Move .* down$/ })[1]);
    expect(document.activeElement?.closest('li')).toHaveTextContent('Minim');
  });
});

describe('Ordering component: accessible names', () => {
  it('gives every Move button a unique name that includes the item text', () => {
    renderQuestion();
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual([
      'Move Minim up',
      'Move Minim down',
      'Move Semibreve up',
      'Move Semibreve down',
      'Move Crotchet up',
      'Move Crotchet down',
      'This order is correct',
      'Check',
    ]);
    expect(new Set(names).size).toBe(names.length);
    expect(screen.getByRole('button', { name: 'Move Minim up' })).toBeInTheDocument();
  });

  it('keeps the names right after items move', async () => {
    const user = userEvent.setup();
    renderQuestion();
    await user.click(screen.getByRole('button', { name: 'Move Minim down' }));
    expect(screen.getByRole('button', { name: 'Move Minim up' })).toBeEnabled();
    expect(within(screen.getAllByRole('listitem')[1] as HTMLElement).getByRole('button', { name: 'Move Minim up' })).toBeInTheDocument();
  });

  it('names glyph and notation items, and tells apart items with the same text', () => {
    const onAnswer = vi.fn();
    const glyphs: OrderingPayload = {
      items: [
        { id: 'a', face: { kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 0 } } } },
        { id: 'b', face: { kind: 'glyph', glyph: { kind: 'rest', duration: { value: 'crotchet', dots: 0 } } } },
        { id: 'c', face: { kind: 'text', text: 'Same' } },
        { id: 'd', face: { kind: 'text', text: 'Same' } },
      ],
      correctOrder: ['d', 'c', 'b', 'a'],
      ends: { first: 'first', last: 'last' },
      reason: 'x',
    };
    render(<Ordering payload={glyphs} terminology="us" locked={false} result={null} onAnswer={onAnswer} />);
    expect(screen.getByRole('button', { name: 'Move half note up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move quarter rest down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Same (item 3) up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Same (item 4) up' })).toBeInTheDocument();
  });

  it('numbers notation items by their starting position', () => {
    const passage = {
      clef: 'treble' as const,
      key: { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const },
      time: { beats: 4, beatUnit: 4 as const },
      bars: [],
    };
    const onAnswer = vi.fn();
    render(
      <Ordering
        payload={{
          items: [
            { id: 'a', face: { kind: 'passage', passage } },
            { id: 'b', face: { kind: 'passage', passage } },
            { id: 'c', face: { kind: 'passage', passage } },
          ],
          correctOrder: ['c', 'b', 'a'],
          ends: { first: 'f', last: 'l' },
          reason: 'x',
        }}
        terminology="uk"
        locked={false}
        result={null}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByRole('button', { name: 'Move notation 2 down' })).toBeInTheDocument();
  });
});

describe('Ordering component: arrow keys', () => {
  const rowOf = (text: string) => screen.getAllByRole('listitem').find((row) => row.textContent?.includes(text)) as HTMLElement;

  it('makes each item focusable and describes the keys', () => {
    renderQuestion();
    const rows = screen.getAllByRole('listitem');
    rows.forEach((row) => expect(row).toHaveAttribute('tabindex', '0'));
    expect(rows[0]).toHaveAccessibleDescription('Focus an item, then press the up or down arrow key to move it.');
  });

  it('ArrowDown moves the focused item down, and focus follows it', async () => {
    const user = userEvent.setup();
    renderQuestion();
    rowOf('Minim').focus();
    await user.keyboard('{ArrowDown}');
    expect(currentOrder()).toEqual(['Semibreve', 'Minim', 'Crotchet']);
    expect(document.activeElement).toBe(rowOf('Minim'));
    await user.keyboard('{ArrowDown}');
    expect(currentOrder()).toEqual(['Semibreve', 'Crotchet', 'Minim']);
    expect(document.activeElement).toBe(rowOf('Minim'));
  });

  it('ArrowUp moves the focused item up, and focus follows it', async () => {
    const user = userEvent.setup();
    renderQuestion();
    rowOf('Crotchet').focus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(currentOrder()).toEqual(['Crotchet', 'Minim', 'Semibreve']);
    expect(document.activeElement).toBe(rowOf('Crotchet'));
  });

  it('stops at the ends without moving, and says so', async () => {
    const user = userEvent.setup();
    renderQuestion();
    rowOf('Minim').focus();
    await user.keyboard('{ArrowUp}');
    expect(currentOrder()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
    expect(screen.getByTestId('ordering-announcement')).toHaveTextContent('Minim is already first.');
    rowOf('Crotchet').focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('ordering-announcement')).toHaveTextContent('Crotchet is already last.');
    expect(document.activeElement).toBe(rowOf('Crotchet'));
  });

  it('announces the new position in a polite live region', async () => {
    const user = userEvent.setup();
    renderQuestion();
    const live = screen.getByTestId('ordering-announcement');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('role', 'status');
    rowOf('Minim').focus();
    await user.keyboard('{ArrowDown}');
    expect(live).toHaveTextContent('Minim moved to position 2 of 3.');
    await user.keyboard('{ArrowDown}');
    expect(live).toHaveTextContent('Minim moved to position 3 of 3.');
    await user.keyboard('{ArrowUp}');
    expect(live).toHaveTextContent('Minim moved to position 2 of 3.');
  });

  it('announces button moves too', async () => {
    const user = userEvent.setup();
    renderQuestion();
    await user.click(screen.getByRole('button', { name: 'Move Crotchet up' }));
    expect(screen.getByTestId('ordering-announcement')).toHaveTextContent('Crotchet moved to position 2 of 3.');
  });

  it('a keyboard-only sort ends with the right answer on Check', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion();
    rowOf('Crotchet').focus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ order: ['crotchet', 'minim', 'semibreve'] });
  });

  it('ignores other keys and modified arrows', async () => {
    const user = userEvent.setup();
    renderQuestion();
    rowOf('Minim').focus();
    await user.keyboard('{ArrowRight}{ArrowLeft}a{Enter}');
    await user.keyboard('{Control>}{ArrowDown}{/Control}');
    expect(currentOrder()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
  });

  it('does nothing when locked, and rows leave the tab order', async () => {
    const user = userEvent.setup();
    renderQuestion({ locked: true });
    const row = rowOf('Minim');
    expect(row).not.toHaveAttribute('tabindex');
    row.focus();
    fireEvent.keyDown(row, { key: 'ArrowDown' });
    await user.keyboard('{ArrowDown}');
    expect(currentOrder()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
  });

  it('arrow keys pressed on a Move button do not also move the row', async () => {
    const user = userEvent.setup();
    renderQuestion();
    screen.getByRole('button', { name: 'Move Minim down' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(currentOrder()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
  });
});
