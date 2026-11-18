import { expect, type Page, test as base } from '@playwright/test';

/** The one request that is allowed to fail: the optional piano sample manifest. */
const ALLOWED_404 = /\/audio\/piano\/manifest\.json/;

export interface Problems {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

/** Collects console errors, uncaught exceptions and failed requests on a page. */
export function watchProblems(page: Page): Problems {
  const problems: Problems = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location().url;
    // The browser logs "Failed to load resource" for the allowed 404 too.
    if (ALLOWED_404.test(loc)) return;
    problems.consoleErrors.push(`${m.text()} (${loc})`);
  });
  page.on('pageerror', (e) => problems.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => {
    if (r.failure()?.errorText === 'net::ERR_ABORTED') return; // navigations away cancel prefetches
    problems.failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !ALLOWED_404.test(r.url())) problems.failedRequests.push(`${r.status()} ${r.url()}`);
  });
  return problems;
}

export function expectNoProblems(p: Problems): void {
  expect(p.pageErrors, 'uncaught exceptions').toEqual([]);
  expect(p.consoleErrors, 'console errors').toEqual([]);
  expect(p.failedRequests, 'failed requests').toEqual([]);
}

/** Seeds localStorage before the app loads (settings, progress, bests). */
export async function seedStorage(page: Page, entries: Record<string, unknown>): Promise<void> {
  await page.addInitScript((data) => {
    // Only the first load of a test: later loads must keep what the app wrote.
    for (const [k, v] of Object.entries(data)) {
      if (sessionStorage.getItem(`__seeded:${k}`)) continue;
      sessionStorage.setItem(`__seeded:${k}`, '1');
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, entries);
}

export const SETTINGS_KEY = 'mtn:v1:settings';

export async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await seedStorage(page, { [SETTINGS_KEY]: { terminology: 'uk', soundOn: false, reducedMotion: false, untimed: false, theme: 'dark', latencyOffsetMs: 0, ...settings } });
}

/** Waits until the client has hydrated and any "Loading" status has gone. */
export async function waitReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0);
}

export const test = base;
export { expect };

export const STATIC_ROUTES = [
  '/',
  '/learn',
  '/learn/start/pulse-1',
  '/learn/1/rhythm-1',
  '/lessons',
  '/library',
  '/library?tab=recap',
  '/library?tab=glossary',
  '/games',
  '/games/note-rush',
  '/games/term-blitz',
  '/games/tap-it',
  '/games/key-hunt',
  '/mock',
  '/mock/grade-1',
  '/settings',
  '/accessibility',
  '/privacy',
  '/terms',
];
