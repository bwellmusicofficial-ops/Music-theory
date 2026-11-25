import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomTabBar, SiteHeader } from './site-header';

let path = '/';
const { prefetch } = vi.hoisted(() => ({ prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => path, useRouter: () => ({ prefetch }) }));
afterEach(cleanup);

describe('bottom tab bar', () => {
  it('has five tabs with icon and label, in order', () => {
    path = '/';
    render(<BottomTabBar />);
    const nav = screen.getByRole('navigation', { name: 'Main tabs' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Learn', 'Library', 'Games', 'Mock tests', 'Settings']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/learn', '/library', '/games', '/mock', '/settings']);
    for (const a of links) expect(a.querySelector('svg')).not.toBeNull();
    expect(links.some((a) => a.hasAttribute('aria-current'))).toBe(false);
  });

  it('marks the current page with aria-current, a bar, a filled pill and a bolder label', () => {
    path = '/library';
    render(<BottomTabBar />);
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    const a = current[0]!;
    expect(a).toHaveTextContent('Library');
    expect(a.className).toContain('font-extrabold');
    expect(a.querySelector('.bg-accent')).not.toBeNull();
    expect(a.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThan(0);
    const other = screen.getByRole('link', { name: 'Games' });
    expect(other.className).not.toContain('font-extrabold');
    expect(other.querySelector('.bg-accent')).toBeNull();
  });

  it('keeps a tab current on pages below it', () => {
    path = '/learn/1/rhythm-1';
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current');
  });

  it('does not treat /lessonsX or /games-x as current, and steps aside on game and mock paper pages', () => {
    path = '/games/note-rush';
    const { container } = render(<BottomTabBar />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    path = '/mock/grade-1';
    expect(render(<BottomTabBar />).container).toBeEmptyDOMElement();
    cleanup();
    path = '/games';
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: 'Games' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('top bar', () => {
  it('has the five links, marks the current one, and the name links home', () => {
    path = '/mock';
    render(<SiteHeader />);
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Learn', 'Library', 'Games', 'Mock tests', 'Settings']);
    expect(within(nav).getByRole('link', { name: 'Mock tests' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Music Theory Now' })).toHaveAttribute('href', '/');
    expect(nav.className).toContain('hidden');
    expect(nav.className).toContain('md:flex');
  });
});

describe('navigation links load on intent, not on sight', () => {
  it('warms a route when a link is touched, hovered or focused', () => {
    path = '/';
    prefetch.mockClear();
    render(<SiteHeader />);
    expect(prefetch).not.toHaveBeenCalled();
    const games = screen.getAllByRole('link', { name: /games/i })[0]!;
    fireEvent.pointerDown(games);
    fireEvent.mouseEnter(games);
    fireEvent.focus(games);
    expect(prefetch).toHaveBeenCalledWith('/games');
  });
});

