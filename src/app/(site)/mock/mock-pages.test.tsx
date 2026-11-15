import { describe, expect, it, vi } from 'vitest';
import MockPage, { generateStaticParams } from './[id]/page';
import MockListPage from './page';

vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

describe('mock pages', () => {
  it('generates a page for each config file', () => {
    expect(generateStaticParams()).toEqual([{ id: 'grade-1' }]);
  });

  it('answers an unknown id with notFound()', async () => {
    await expect(MockPage({ params: Promise.resolve({ id: 'grade-99' }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it('renders the runner for a known id and the list page', async () => {
    const page = await MockPage({ params: Promise.resolve({ id: 'grade-1' }) });
    expect(page).toBeTruthy();
    expect(MockListPage()).toBeTruthy();
  });
});
