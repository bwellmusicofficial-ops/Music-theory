import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its text', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it.each(['neutral', 'accent', 'success', 'danger', 'warning'] as const)('supports the %s tone', (tone) => {
    render(<Badge tone={tone}>x</Badge>);
    expect(screen.getByText('x')).toHaveAttribute('data-tone', tone);
  });
});
