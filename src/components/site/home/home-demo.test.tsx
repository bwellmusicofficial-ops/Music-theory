import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLandingDemoContent } from '@/components/site/landing-demo/content';
import { allLessons, renderPage, resetBrowserState, row, seed } from '@/components/site/test-utils';
import { loadGlossary } from '@/content/load';
import { toLessonMeta } from '@/progress-view';
import { HomeView } from './home-view';

const lessons = allLessons();
const demo = buildLandingDemoContent(lessons, loadGlossary('start'));
const view = () => <HomeView lessons={lessons.map(toLessonMeta)} demo={demo} />;

beforeEach(() => resetBrowserState());
afterEach(cleanup);

/** True when `a` comes before `b` in the page. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('home page with the demo', () => {
  it('puts the playable demo straight after the heading and before the marketing copy for a new visitor', async () => {
    renderPage(view());
    const h1 = await screen.findByRole('heading', { level: 1, name: /Music theory that clicks/ });
    const question = await screen.findByRole('heading', { level: 3, name: 'Which note sounds higher?' }, { timeout: 10_000 });
    const pitch = screen.getByText(/Short, hands-on lessons/);
    const startHere = screen.getByRole('link', { name: 'Start here' });
    expect(before(h1, question)).toBe(true);
    expect(before(question, pitch)).toBe(true);
    expect(before(question, startHere)).toBe(true);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('keeps the continue card first for a returning learner and offers only the compact demo card, below it', async () => {
    const [a, b] = lessons;
    seed([row(a!.id, 'complete'), row(b!.id, 'in-progress', { step: 'name' })]);
    renderPage(view());
    const cont = await screen.findByRole('region', { name: new RegExp(`^${b!.title}`) });
    const compact = await screen.findByRole('heading', { level: 2, name: 'Try a 30-second demo' }, { timeout: 10_000 });
    expect(within(cont).getByRole('link', { name: /Continue lesson/ })).toBeInTheDocument();
    expect(before(cont, compact)).toBe(true);
    expect(screen.queryByRole('list', { name: 'Answer options' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try it' })).toBeInTheDocument());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
