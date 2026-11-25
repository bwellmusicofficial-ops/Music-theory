import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SiteLayout from './(site)/layout';
import LessonsLayout from './lessons/layout';

// The header's links warm routes through the router, which only exists inside the running app.
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }) }));

describe('layouts', () => {
  it('site pages get the site header', () => {
    render(<SiteLayout><p>page</p></SiteLayout>);
    expect(screen.getByRole('navigation', { name: 'Site' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('page');
  });
  it('lessons do not: the player draws its own header', () => {
    render(<LessonsLayout><p>lesson</p></LessonsLayout>);
    expect(screen.queryByRole('navigation', { name: 'Site' })).toBeNull();
    expect(screen.queryByText('Music Theory Now')).toBeNull();
    expect(screen.getByRole('main')).toHaveTextContent('lesson');
  });
});
