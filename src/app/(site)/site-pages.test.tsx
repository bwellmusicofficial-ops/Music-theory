import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allLessons, attemptNow, renderPage, resetBrowserState, row, seed } from '@/components/site/test-utils';
import HomePage from './page';
import LearnPage from './learn/page';
import GamesPage from './games/page';
import LessonsPage from './lessons/page';
import UnitPage, { generateStaticParams } from './learn/[grade]/[unit]/page';
import { buildCourse, toLessonMeta } from '@/progress-view';

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return { ...actual, usePathname: () => '/', redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } };
});

beforeEach(() => resetBrowserState());
afterEach(cleanup);

const lessons = allLessons();
const first = lessons.find((l) => l.grade === 'start')!;

describe('home page', () => {
  it('shows a skeleton first, then the welcome for a new visitor', async () => {
    renderPage(<HomePage />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('Loading your progress')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Music theory that clicks/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start here/ })).toHaveAttribute('href', `/lessons/${first.id}`);
    expect(screen.getByRole('link', { name: 'I already know some theory' })).toHaveAttribute('href', '/learn#grade-1');
    expect(screen.getByRole('link', { name: /Games/ })).toHaveAttribute('href', '/games');
    expect(screen.getByRole('link', { name: /Mock tests/ })).toHaveAttribute('href', '/mock');
    expect(screen.queryByText('This week')).toBeNull();
  });

  it('shows the dashboard for a returning learner', async () => {
    const [a, b, c] = lessons;
    seed(
      [row(a!.id, 'complete'), row(b!.id, 'in-progress', { step: 'name' }), row(c!.id, 'complete')],
      [
        ...Array.from({ length: 6 }, () => attemptNow(a!.id, a!.skills[0]!, false, 10)),
        attemptNow(a!.id, a!.skills[0]!, true, 5),
      ],
    );
    renderPage(<HomePage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    const cont = screen.getByRole('region', { name: new RegExp(`^${b!.title}`) });
    expect(within(cont).getByRole('link', { name: /Continue lesson/ })).toHaveAttribute('href', `/lessons/${b!.id}`);
    expect(within(cont).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(within(cont).getByText(/Step 3 of 6: Name it/)).toBeInTheDocument();
    const week = screen.getByRole('region', { name: 'This week' });
    expect(within(week).getByText('session')).toBeInTheDocument();
    expect(within(week).getByText('day streak').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'Your journey' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'By strand' })).toBeInTheDocument();
    const look = screen.getByRole('region', { name: 'Worth another look' });
    expect(within(look).getAllByRole('link').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Recently opened' })).toBeInTheDocument();
  });

  it('shows personal bests where stored', async () => {
    seed([row(first.id, 'in-progress')]);
    localStorage.setItem('mtn:v1:note-rush-best', '1240');
    localStorage.setItem('mtn:v1:term-blitz-best', JSON.stringify({ a: 300, b: 860 }));
    renderPage(<HomePage />);
    expect(await screen.findByText(/Note Rush: best/)).toHaveTextContent('1,240');
    expect(screen.getByText(/Term Blitz: best/)).toHaveTextContent('860');
  });

  it('says every lesson is complete when they all are', async () => {
    seed(lessons.map((l) => row(l.id, 'complete')));
    renderPage(<HomePage />);
    expect(await screen.findByRole('heading', { name: 'Every lesson complete' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try a mock test' })).toBeInTheDocument();
  });

  it('shrugs off corrupt storage', async () => {
    localStorage.setItem('mtn:v1:progress', '{nope');
    localStorage.setItem('mtn:v1:attempts', 'garbage');
    renderPage(<HomePage />);
    expect(await screen.findByRole('heading', { level: 1, name: /Music theory that clicks/ })).toBeInTheDocument();
  });
});

describe('learn page (course map)', () => {
  it('shows every lesson as a link with a full accessible name, grades 2 to 8 as coming soon, and the draft note', async () => {
    renderPage(<LearnPage />);
    await screen.findByText(`Lesson 1 of ${lessons.length}`);
    expect(screen.getByTestId('draft-note')).toHaveTextContent('not yet been checked by a music specialist');
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/lessons/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(lessons.map((l) => `/lessons/${l.id}`));
    const quavers = screen.getByRole('link', { name: /^\d+, Quavers, not started, \d+ min, (draft, )?Grade 1 rhythm/ });
    expect(quavers).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Start here' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Grade 1' })).toBeInTheDocument();
    for (const g of [2, 3, 4, 5, 6, 7, 8]) expect(screen.getByRole('heading', { level: 2, name: `Grade ${g}` })).toBeInTheDocument();
    expect(screen.getByText('Compound time, keys to four sharps and flats, intervals by type.')).toBeInTheDocument();
    expect(screen.getAllByText('Coming soon')).toHaveLength(7);
    // Unit headers open unit pages; drafts (and only drafts) are badged.
    expect(screen.getByRole('link', { name: /Note values and time/ })).toHaveAttribute('href', '/learn/1/rhythm-1');
    // (The draft note at the top also says <strong>Draft</strong>; count only the badges.)
    const badges = screen.queryAllByText('Draft').filter((e) => e.tagName !== 'STRONG');
    expect(badges).toHaveLength(lessons.filter((l) => l.status === 'draft').length);
  });

  it('marks state by name and icon, and the current position', async () => {
    const q = lessons.find((l) => l.title === 'Quavers')!;
    const [a, b] = lessons;
    seed([row(a!.id, 'complete'), row(b!.id, 'mastered'), row(q.id, 'in-progress')]);
    const { container } = renderPage(<LearnPage />);
    await screen.findByText(`Lesson ${lessons.findIndex((l) => l.id === q.id) + 1} of ${lessons.length}`);
    expect(screen.getByRole('link', { name: new RegExp(`^\\d+, ${a!.title}, complete, `) })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(`^\\d+, ${b!.title}, mastered, `) })).toBeInTheDocument();
    const current = screen.getByRole('link', { name: /^\d+, You are here, Quavers, in progress, \d+ min, (draft, )?Grade 1 rhythm$/ });
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(current).toHaveTextContent('You are here');
    for (const s of ['complete', 'mastered', 'in-progress', 'not-started']) expect(container.querySelector(`[data-state="${s}"]`)).not.toBeNull();
    expect(container.querySelector('[data-state="pending"]')).toBeNull();
  });

  it('draws neutral nodes before progress loads', () => {
    const { container } = renderPage(<LearnPage />);
    expect(container.querySelector('[data-state="pending"]')).not.toBeNull();
    expect(container.querySelector('[data-state="complete"]')).toBeNull();
  });

  it('uses US titles when the setting is US', async () => {
    resetBrowserState('us');
    renderPage(<LearnPage />);
    expect(await screen.findByRole('link', { name: /^\d+, Eighth notes, (not started, )?\d+ min, (draft, )?Grade 1 rhythm/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Quavers,/ })).toBeNull();
  });

  it('with everything complete says so and leaves no current marker', async () => {
    seed(lessons.map((l) => row(l.id, 'complete')));
    renderPage(<LearnPage />);
    expect(await screen.findByText('Every lesson complete')).toBeInTheDocument();
    expect(screen.queryByText('You are here')).toBeNull();
  });
});

describe('unit page', () => {
  const course = buildCourse(lessons.map(toLessonMeta));
  const params = (grade: string, unit: string) => ({ params: Promise.resolve({ grade, unit }) });

  it('is generated for every unit in content', () => {
    const expected = course.flatMap((g) => g.units.map((u) => ({ grade: g.grade, unit: u.id })));
    expect(generateStaticParams()).toEqual(expected);
    expect(expected.length).toBe(10);
  });

  it('answers an unknown unit with notFound()', async () => {
    await expect(UnitPage(params('1', 'nope'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    await expect(UnitPage(params('9', 'rhythm-1'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it('lists lessons with Start unit when nothing is started, and Continue unit after', async () => {
    const unit = course[1]!.units.find((u) => u.id === 'rhythm-1')!;
    renderPage(await UnitPage(params('1', 'rhythm-1')));
    expect(screen.getByRole('heading', { level: 1, name: 'Note values and time' })).toBeInTheDocument();
    expect(screen.getByText(/^Covers: Crotchets and minims/)).toBeInTheDocument();
    const start = await screen.findByRole('link', { name: 'Start unit' });
    expect(start).toHaveAttribute('href', `/lessons/${unit.lessons[0]!.id}`);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(unit.lessons.length);
    expect(items[0]).toHaveTextContent('Crotchets and minims');
    expect(items[0]).toHaveTextContent('Not started');
    expect(items[0]).toHaveTextContent('min');
    // A lesson carries a Draft badge exactly when it is still a draft.
    unit.lessons.forEach((l, i) => {
      const badge = within(items[i]!).queryByText('Draft');
      if (l.status === 'draft') expect(badge).toBeInTheDocument();
      else expect(badge).toBeNull();
    });
    cleanup();

    seed([row(unit.lessons[0]!.id, 'complete', { bestScore: 0.875 }), row(unit.lessons[1]!.id, 'in-progress')]);
    renderPage(await UnitPage(params('1', 'rhythm-1')));
    const cont = await screen.findByRole('link', { name: 'Continue unit' });
    expect(cont).toHaveAttribute('href', `/lessons/${unit.lessons[1]!.id}`);
    expect(screen.getByText('1 of 5 complete')).toBeInTheDocument();
    expect(screen.getByText('Best challenge: 88%')).toBeInTheDocument();
  });

  it('offers Review unit when all is complete', async () => {
    const unit = course[0]!.units[0]!;
    seed(unit.lessons.map((l) => row(l.id, 'mastered')));
    renderPage(await UnitPage(params(unit.grade, unit.id)));
    expect(await screen.findByRole('link', { name: 'Review unit' })).toHaveAttribute('href', `/lessons/${unit.lessons[0]!.id}`);
  });
});

describe('games page and /lessons', () => {
  it('lists Note Rush and Term Blitz with a link each, and personal bests', async () => {
    localStorage.setItem('mtn:v1:note-rush-best', '500');
    renderPage(<GamesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Games' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Note Rush/ })).toHaveAttribute('href', '/games/note-rush');
    const tb = screen.getByRole('link', { name: /Term Blitz/ });
    expect(tb).toHaveAttribute('href', '/games/term-blitz');
    expect(tb).toHaveTextContent('Rapid-fire musical terms and signs');
    await waitFor(() => expect(screen.getByRole('link', { name: /Note Rush/ })).toHaveTextContent('Personal best 500'));
  });

  it('/lessons redirects to /learn', () => {
    expect(() => LessonsPage()).toThrow('REDIRECT:/learn');
  });
});
