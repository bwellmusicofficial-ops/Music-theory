import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { expectNoAxeViolations } from './helpers/axe';
import { playExemplarToEnd, startExemplar } from './helpers/play-lesson';

/**
 * P1-03: progress follows a signed-in learner. Phone and desktop, against the in-memory backend (the Playwright
 * server sets ACCOUNTS_FAKE_BACKEND=1 with the accounts switch on). Real Supabase is for the owner's Preview test.
 */
test.describe.configure({ mode: 'parallel' });

const PASSWORD = 'purple elephants';
const PROGRESS_KEY = 'mtn:v1:progress';
const OUTBOX_KEY = 'mtn:v1:outbox';
const SETTINGS = 'mtn:v1:settings';
const DONE_LESSON = /Crotchets and minims.*complete/i;
const SEEDED_DONE = {
  'g1-rhythm-01-crotchets-and-minims': {
    lessonId: 'g1-rhythm-01-crotchets-and-minims', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1, updatedAt: '2026-06-01T10:00:00.000Z',
  },
};

let counter = 0;
const uniqueName = (stem = 'Quaver') => `${stem}${(++counter).toString(36)}${randomBytes(2).toString('hex')}`.slice(0, 20);
async function ownIp(target: Page | BrowserContext) {
  const ctx = 'context' in target && typeof target.context === 'function' ? target.context() : (target as BrowserContext);
  const b = randomBytes(3);
  await ctx.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${b[0]}.${b[1]}.${b[2]}` });
}

/** From the home page: makes an account and gets past the recovery-code screen. */
async function signUp(page: Page, name: string) {
  await page.goto('/account/sign-up');
  await waitReady(page);
  await page.getByRole('radio', { name: /^No, I'm under 18/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Code name').fill(name);
  await expect(page.getByRole('status').filter({ hasText: `${name} is free.` })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Make my account' }).click();
  await expect(page.getByTestId('recovery-code')).toBeVisible();
  await page.getByRole('checkbox', { name: "I've written it down" }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/');
}

async function signIn(page: Page, name: string) {
  await page.goto('/account/sign-in');
  await waitReady(page);
  await page.getByLabel('Code name').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
}

async function signOutInSettings(page: Page) {
  await page.goto('/settings');
  await waitReady(page);
  await page.getByTestId('account-settings').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByTestId('account-settings').getByRole('link', { name: 'Make an account' })).toBeVisible();
}

const syncLine = (page: Page) => page.getByTestId('sync-status');
const prompt = (page: Page) => page.getByRole('dialog', { name: "Add this device's progress to your account?" });

async function expectLessonComplete(page: Page) {
  await page.goto('/learn');
  await waitReady(page);
  await expect(page.getByRole('link', { name: DONE_LESSON }).first()).toBeVisible();
}
async function expectNoLessonComplete(page: Page) {
  await page.goto('/learn');
  await waitReady(page);
  await expect(page.getByRole('link', { name: DONE_LESSON })).toHaveCount(0);
}
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** A second, separate browser: its own storage and cookies, same size screen and theme. */
async function secondBrowser(browser: Browser, page: Page, baseURL: string | undefined): Promise<{ ctx: BrowserContext; other: Page }> {
  const ctx = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined, hasTouch: test.info().project.name === 'phone' });
  await ownIp(ctx);
  const other = await ctx.newPage();
  await seedSettings(other, {});
  return { ctx, other };
}

test('finish a lesson signed out, sign up, add it to the account; sign out clears the device; sign in brings it back; a second browser sees it too', async ({ page, browser, baseURL }) => {
  test.setTimeout(420_000);
  await ownIp(page);
  const problems = watchProblems(page);
  const progressCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/account/progress')) progressCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  const name = uniqueName();
  await seedSettings(page, {});

  // 1. A guest finishes a lesson. Nothing goes anywhere.
  await playExemplarToEnd(page);
  await expectLessonComplete(page);
  expect(progressCalls, 'a guest sends nothing to the account').toEqual([]);

  // 2. Sign up. The recovery code comes first; then, on the home page, the question. Nothing is merged yet.
  await signUp(page, name);
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page).getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await expect(prompt(page).getByRole('button', { name: 'Not now', exact: true })).toBeVisible();
  await expectNoAxeViolations(page, 'merge prompt');
  expect(progressCalls.filter((c) => c.includes('merge') || c.includes('sync')), 'nothing merged before the answer').toEqual([]);

  // 3. Add. The prompt goes, the progress stays, and Settings says it is saved.
  await prompt(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(prompt(page)).toHaveCount(0);
  await expect.poll(() => progressCalls.filter((c) => c.includes('/merge')).length).toBe(1);
  await expectLessonComplete(page);
  await page.goto('/settings');
  await waitReady(page);
  await expect(syncLine(page)).toHaveText('Saved to your account');
  await expect(syncLine(page)).toHaveAttribute('data-state', 'saved');
  await expectNoAxeViolations(page, '/settings: saved');
  await page.reload();
  await waitReady(page);
  await expect(prompt(page)).toHaveCount(0); // asked once

  // 4. A second browser signs in to the same account and sees the same progress.
  const { ctx, other } = await secondBrowser(browser, page, baseURL);
  await signIn(other, name);
  await expect(prompt(other)).toHaveCount(0); // nothing on that device to add
  await expectLessonComplete(other);
  await other.goto('/settings');
  await waitReady(other);
  await expect(syncLine(other)).toHaveText('Saved to your account');
  await ctx.close();

  // 5. Sign out on the first: the progress is gone from the device, the settings are not.
  await seedSettings(page, { theme: 'light' }); // (a no-op after the first load: the app's own value stays)
  const settingsBefore = await stored(page, SETTINGS);
  await signOutInSettings(page);
  expect(await stored(page, PROGRESS_KEY)).toBeNull();
  expect(await stored(page, OUTBOX_KEY)).toBeNull();
  expect(await stored(page, SETTINGS)).toBe(settingsBefore);
  await expectNoLessonComplete(page);

  // 6. Sign in again: it comes back from the account.
  await signIn(page, name);
  await expect(prompt(page)).toHaveCount(0);
  await expectLessonComplete(page);
  expectNoProblems(problems);
});

test('Not now keeps the earlier progress on this device only, and signing out gives it back', async ({ page }) => {
  await ownIp(page);
  const problems = watchProblems(page);
  const name = uniqueName('Notnow');
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('mtn:v1:progress', JSON.stringify(data));
  }, SEEDED_DONE);
  await seedSettings(page, {});
  await signUp(page, name);
  await expect(prompt(page)).toBeVisible();
  await prompt(page).getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(prompt(page)).toHaveCount(0);

  // The account is empty, so the lesson is not shown as complete while signed in...
  await expectNoLessonComplete(page);
  // ...and Settings offers to add it later.
  await page.goto('/settings');
  await waitReady(page);
  await expect(page.getByText('Progress from before you signed in is still on this device only.')).toBeVisible();
  await expectNoAxeViolations(page, '/settings: progress set aside');

  // Signing out puts the device back as it was.
  await page.getByTestId('account-settings').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByTestId('account-settings').getByRole('link', { name: 'Make an account' })).toBeVisible();
  await expectLessonComplete(page);
  expectNoProblems(problems);
});

test('offline or failing sends: nothing is lost across a reload, Settings says it is waiting, and it saves once the network is back', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  await ownIp(page);
  const name = uniqueName('Offline');
  await seedSettings(page, {});
  await signUp(page, name);

  // Every send fails, as if the network were down.
  await page.route('**/api/account/progress/sync', (route) => route.abort('internetdisconnected'));
  await startExemplar(page); // saves progress as the learner moves through the lesson
  await expect.poll(() => stored(page, OUTBOX_KEY)).not.toBeNull();
  const lessonOnDevice = JSON.parse((await stored(page, PROGRESS_KEY)) ?? '{}');
  expect(Object.keys(lessonOnDevice)).toHaveLength(1);

  // A refresh loses nothing: the outbox is still there, and Settings says so in words.
  await page.goto('/settings');
  await waitReady(page);
  await expect(syncLine(page)).toHaveText('Waiting to save, will retry');
  await expect(syncLine(page)).toHaveAttribute('data-state', 'waiting');
  await expectNoAxeViolations(page, '/settings: waiting to save');
  expect(await stored(page, OUTBOX_KEY)).not.toBeNull();

  // Network back: it retries on its own.
  await page.unroute('**/api/account/progress/sync');
  await expect(syncLine(page)).toHaveText('Saved to your account', { timeout: 30_000 });
  expect(await stored(page, OUTBOX_KEY)).toBeNull();

  // And a second browser sees the progress made while it was failing.
  const { ctx, other } = await secondBrowser(browser, page, baseURL);
  await signIn(other, name);
  await expect.poll(async () => Object.keys(JSON.parse((await stored(other, PROGRESS_KEY)) ?? '{}')).length).toBe(1);
  await ctx.close();
});
