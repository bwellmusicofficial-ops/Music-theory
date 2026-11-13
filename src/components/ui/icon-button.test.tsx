import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './icon-button';

describe('IconButton', () => {
  it('is named by aria-label and hides the icon from assistive tech', () => {
    render(<IconButton aria-label="Play" icon={<svg data-testid="i" />} />);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button.querySelector('[aria-hidden="true"]')).toContainElement(screen.getByTestId('i'));
  });

  it('fires onClick from mouse and keyboard', async () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Play" icon={<svg />} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('requires aria-label at the type level', () => {
    // @ts-expect-error aria-label is required
    render(<IconButton icon={<svg />} />);
  });
});
