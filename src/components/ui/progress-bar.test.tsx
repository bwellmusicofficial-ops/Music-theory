import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('exposes progressbar semantics', () => {
    render(<ProgressBar value={0.4} aria-label="Lesson progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Lesson progress' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuetext', '40%');
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '40%' });
  });

  it('clamps out-of-range and non-finite values', () => {
    const { rerender } = render(<ProgressBar value={2} aria-label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<ProgressBar value={-1} aria-label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    rerender(<ProgressBar value={Number.NaN} aria-label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('uses the strand colour when given, else the accent', () => {
    const { rerender } = render(<ProgressBar value={0.5} aria-label="p" />);
    expect(screen.getByTestId('progress-fill').className).toContain('bg-accent');
    rerender(<ProgressBar value={0.5} strand="rhythm" aria-label="p" />);
    expect(screen.getByTestId('progress-fill').className).toContain('bg-strand-rhythm');
  });
});
