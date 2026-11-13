import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeedbackBanner } from './feedback-banner';

describe('FeedbackBanner', () => {
  it('shows correct feedback with icon, heading and reason', () => {
    render(<FeedbackBanner kind="correct" reason="A crotchet is one beat." />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('data-kind', 'correct');
    expect(banner).toHaveTextContent('Correct');
    expect(banner).toHaveTextContent('A crotchet is one beat.');
    expect(screen.getByTestId('feedback-icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows wrong feedback with different text and icon, not colour alone', () => {
    const { container, rerender } = render(<FeedbackBanner kind="correct" reason="r" />);
    const correctIcon = container.querySelector('svg')?.innerHTML;
    rerender(<FeedbackBanner kind="wrong" reason="The note is a third higher." />);
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByRole('status')).toHaveTextContent('The note is a third higher.');
    expect(container.querySelector('svg')?.innerHTML).not.toBe(correctIcon);
  });

  it('allows a custom title', () => {
    render(<FeedbackBanner kind="correct" title="Spot on" reason="r" />);
    expect(screen.getByText('Spot on')).toBeInTheDocument();
  });
});
