import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './card';

describe('Card', () => {
  it('renders children in a div by default', () => {
    render(<Card data-testid="c">Hello</Card>);
    expect(screen.getByTestId('c').tagName).toBe('DIV');
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('can render as a landmark-friendly element', () => {
    render(
      <Card as="section" aria-label="Lesson">
        x
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Lesson' })).toBeInTheDocument();
  });

  it('adds hover lift only when raised', () => {
    const { rerender } = render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).not.toContain('hover:');
    rerender(
      <Card data-testid="c" raised>
        x
      </Card>,
    );
    expect(screen.getByTestId('c').className).toContain('hover:');
  });
});
