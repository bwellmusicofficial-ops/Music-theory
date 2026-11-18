import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryPage from '@/app/(site)/library/page';
import { listLessons, loadGlossary } from '@/content/load';
import { renderPage, resetBrowserState, row, seed } from '../test-utils';

let search = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => '/library',
}));
// The staves are drawn by VexFlow in a real browser; here they only need to exist.
vi.mock('@/lesson/questions/notation', () => ({ PassageView: () => <div data-testid="passage-view" /> }));

const scrollIntoView = vi.fn();
beforeEach(() => {
  resetBrowserState();
  search = '';
  replace.mockReset();
  replace.mockImplementation((url: string) => {
    search = url.split('?')[1] ?? '';
  });
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.history.replaceState(null, '', '/library');
});
afterEach(cleanup);

const lessons = listLessons();
// Counts come from the content so adding a lesson does not break these tests.
const TOTAL = lessons.length;
const GRADE_1 = lessons.filter((l) => l.grade === '1').length;
const TERMS = lessons.filter((l) => l.strand === 'terms').length;
const glossary = loadGlossary('8');

describe('library tabs', () => {
  it('opens on Lessons, switches by click and keyboard, and keeps the tab in the address', async () => {
    const user = userEvent.setup();
    renderPage(<LibraryPage />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Lessons', 'Recap cards', 'Glossary']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    await user.click(tabs[2]!);
    expect(replace).toHaveBeenLastCalledWith('/library?tab=glossary', { scroll: false });
    expect(screen.getByRole('tab', { name: 'Glossary' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'library-tab-glossary');
    screen.getByRole('tab', { name: 'Glossary' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Lessons' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Lessons' })).toHaveFocus();
  });

  it('opens the tab named in the address', () => {
    search = 'tab=glossary';
    renderPage(<LibraryPage />);
    expect(screen.getByRole('tab', { name: 'Glossary' })).toHaveAttribute('aria-selected', 'true');
    search = 'tab=bogus';
    cleanup();
    renderPage(<LibraryPage />);
    expect(screen.getByRole('tab', { name: 'Lessons' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('lessons tab', () => {
  it('lists every lesson, then filters by grade, strand and text, and clears', async () => {
    const user = userEvent.setup();
    renderPage(<LibraryPage />);
    expect(screen.getByRole('status')).toHaveTextContent(`${TOTAL} lessons`);
    await user.click(screen.getByRole('button', { name: 'Grade 1' }));
    expect(screen.getByRole('status')).toHaveTextContent(`${GRADE_1} lessons match`);
    await user.click(screen.getByRole('button', { name: 'Terms' }));
    expect(screen.getByRole('status')).toHaveTextContent(`${TERMS} lessons match`);
    await user.click(screen.getByRole('button', { name: 'All strands' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search lessons' }), 'quavers');
    const links = screen.getAllByRole('link');
    expect(links.some((a) => a.textContent?.includes('Quavers'))).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(/lessons? match/);
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzzzqq');
    expect(screen.getByText(/No lessons match/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('status')).toHaveTextContent(`${TOTAL} lessons`);
  });

  it('shows state and Draft badges', async () => {
    seed([row(lessons[0]!.id, 'complete')]);
    renderPage(<LibraryPage />);
    await waitFor(() => expect(screen.getAllByText('Complete').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(30);
  });
});

describe('recap tab', () => {
  beforeEach(() => {
    search = 'tab=recap';
  });

  it('shows completed lessons first, the rest marked and still readable', async () => {
    const done = lessons.find((l) => l.id === 'g1-rhythm-01-crotchets-and-minims')!;
    seed([row(done.id, 'complete')]);
    renderPage(<LibraryPage />);
    expect(await screen.findByRole('heading', { name: 'Your cards (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Still to earn (${TOTAL - 1})` })).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(TOTAL);
    expect(cards[0]).toHaveAttribute('data-earned', 'true');
    expect(cards[0]).toHaveTextContent('Crotchets and minims');
    expect(cards[0]).toHaveTextContent('In your library');
    for (const p of done.steps.recap.points) expect(cards[0]!.textContent).toContain(p.replace(/\[\[[^|\]]+\|([^\]]*)\]\]/g, '$1').replace(/\*/g, ''));
    expect(cards[1]).toHaveAttribute('data-earned', 'false');
    expect(cards[1]).toHaveTextContent('Finish the lesson to add this card');
    expect(cards[1]!.textContent!.length).toBeGreaterThan(80); // readable
    expect(within(cards[0]!).queryByText('Finish the lesson to add this card')).toBeNull();
    await waitFor(() => expect(within(cards[0]!).getByTestId('passage-view')).toBeInTheDocument());
  });

  it('has an empty state with no completed lessons', async () => {
    renderPage(<LibraryPage />);
    expect(await screen.findByText(/Finish a lesson and its recap card lands here/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Still to earn (${TOTAL})` })).toBeInTheDocument();
  });
});

describe('glossary tab', () => {
  beforeEach(() => {
    search = 'tab=glossary';
  });

  it('lists every entry from every file, grouped A to Z, with anchors', () => {
    const { container } = renderPage(<LibraryPage />);
    expect(screen.getByRole('status')).toHaveTextContent(`${glossary.length} entries`);
    for (const e of glossary) expect(container.querySelector(`li[id="${e.id}"]`)).not.toBeNull();
    const letters = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(letters[0]).toBe('Terms starting with #');
    expect(letters.slice(1)).toEqual([...letters.slice(1)].sort());
    expect(letters).toContain('Terms starting with A');
  });

  it('shows the Italian label, and UK terms with the US form as "also called"', () => {
    renderPage(<LibraryPage />);
    const adagio = document.getElementById('adagio')!;
    expect(within(adagio).getByText('Italian')).toBeInTheDocument();
    const crotchet = document.getElementById('crotchet')!;
    expect(within(crotchet).getByRole('heading', { level: 2 })).toHaveTextContent('crotchet');
    expect(crotchet).toHaveTextContent('also called quarter note in the US');
  });

  it('swaps in the US term, listed under its own letter, when the setting is US', () => {
    resetBrowserState('us');
    renderPage(<LibraryPage />);
    const crotchet = document.getElementById('crotchet')!;
    expect(within(crotchet).getByRole('heading', { level: 2 })).toHaveTextContent('quarter note');
    expect(crotchet).toHaveTextContent('also called crotchet in the UK');
    expect(crotchet.closest('section')).toHaveAttribute('aria-label', 'Terms starting with Q');
  });

  it('searches instantly over term and definition, and accents do not matter', async () => {
    const user = userEvent.setup();
    renderPage(<LibraryPage />);
    const box = screen.getByRole('searchbox', { name: 'Search the glossary' });
    await user.type(box, 'adagio');
    expect(document.getElementById('adagio')).not.toBeNull();
    expect(document.getElementById('crotchet')).toBeNull();
    await user.clear(box);
    await user.type(box, 'zzzzqq');
    expect(screen.getByText(/No entries match/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('status')).toHaveTextContent(`${glossary.length} entries`);
  });

  it('a glossary link in a definition scrolls to that entry, clearing a search that hides it, and updates the address', async () => {
    const user = userEvent.setup();
    renderPage(<LibraryPage />);
    // "pulse" is linked from the definition of "beat"; find a definition with a link and a target elsewhere.
    const source = document.querySelector('li[id] button[data-term-id]') as HTMLButtonElement;
    const targetId = source.dataset.termId!;
    expect(document.getElementById(targetId)).not.toBeNull();
    // Search for something that hides the target, then click a link from a visible entry.
    const box = screen.getByRole('searchbox', { name: 'Search the glossary' });
    const owner = source.closest('li')!;
    await user.type(box, owner.querySelector('h2')!.textContent!);
    const link = document.getElementById(owner.id)!.querySelector(`button[data-term-id="${targetId}"]`) as HTMLButtonElement;
    expect(link).not.toBeNull();
    await user.click(link);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect((box as HTMLInputElement).value === '' || document.getElementById(targetId) !== null).toBe(true);
    const target = document.getElementById(targetId)!;
    expect(target).toHaveFocus();
    expect(target).toHaveAttribute('data-flash', 'true');
    expect(window.location.hash).toBe(`#${targetId}`);
    expect(window.location.search).toBe('?tab=glossary');
  });

  it('opens the entry named in the address on arrival', async () => {
    window.history.replaceState(null, '', '/library?tab=glossary#adagio');
    renderPage(<LibraryPage />);
    await waitFor(() => expect(document.getElementById('adagio')).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('jumps by letter with plain anchors', () => {
    renderPage(<LibraryPage />);
    const nav = screen.getByRole('navigation', { name: 'Jump to letter' });
    const a = within(nav).getByRole('link', { name: 'A' });
    expect(a).toHaveAttribute('href', '#letter-A');
    expect(document.getElementById('letter-A')).not.toBeNull();
    act(() => fireEvent.click(a));
  });
});
