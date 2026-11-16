import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { listLessons } from '@/content/load';
import { SiteHeader } from '@/components/site/site-header';
import HomePage from '../page';
import LessonsPage from './page';

afterEach(cleanup);

describe('lessons index page', () => {
  it('explains drafts at the top and lists every lesson once, in teaching order', () => {
    render(<LessonsPage />);
    const note = screen.getByTestId('draft-note');
    expect(note).toHaveTextContent('Draft');
    expect(note).toHaveTextContent('not yet been checked by a music specialist');
    const lessons = listLessons();
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/lessons/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(lessons.map((l) => `/lessons/${l.id}`));
  });

  it('groups by grade and unit, with Start here first', () => {
    render(<LessonsPage />);
    const grades = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(grades).toEqual(expect.arrayContaining(['Start here', 'Grade 1']));
    expect(grades.indexOf('Start here')).toBeLessThan(grades.indexOf('Grade 1'));
    const units = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(units.indexOf('Pulse 1')).toBeLessThan(units.indexOf('High low 1'));
    expect(units.indexOf('High low 1')).toBeLessThan(units.indexOf('Keyboard 1'));
    expect(units.indexOf('Keyboard 1')).toBeLessThan(units.indexOf('Stave 1'));
  });

  it('shows title, summary, strand and a Draft badge only on drafts', () => {
    render(<LessonsPage />);
    const reviewed = listLessons().find((l) => l.status === 'reviewed')!;
    const row = screen.getByText(reviewed.title).closest('li')!;
    expect(within(row).getByText(reviewed.summary)).toBeInTheDocument();
    expect(within(row).queryByText('Draft')).toBeNull();
    expect(row.querySelector('[data-strand]')).not.toBeNull();
    const draft = listLessons().find((l) => l.status === 'draft')!;
    const draftRow = screen.getAllByText(draft.title)[0]!.closest('li')!;
    expect(within(draftRow).getByText('Draft')).toBeInTheDocument();
  });
});

describe('home page and header', () => {
  it('starts at the first reviewed lesson, links to all lessons, and has a Mock tests card', () => {
    render(<HomePage />);
    const first = listLessons().find((l) => l.status === 'reviewed')!;
    expect(screen.getByRole('link', { name: /Start the first lesson/ })).toHaveAttribute('href', `/lessons/${first.id}`);
    expect(screen.getByRole('link', { name: 'All lessons (including drafts awaiting review)' })).toHaveAttribute('href', '/lessons');
    expect(screen.getByRole('link', { name: /Mock tests/ })).toHaveAttribute('href', '/mock');
  });

  it('the header links to the mock tests and the settings', () => {
    render(<SiteHeader />);
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(within(nav).getByRole('link', { name: 'Mock tests' })).toHaveAttribute('href', '/mock');
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });
});
