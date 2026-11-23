/* eslint-disable @typescript-eslint/no-explicit-any -- these tests read untyped JSON and wrap untyped Supabase clients */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { expectNoAxeViolations as axe } from './helpers/axe';
import { playExemplarToEnd } from './helpers/play-lesson';

/**
 * P1-16: download my data, delete my account. Phone and desktop, in a real browser, against the in-memory backend
 * (the Playwright server runs with the accounts switch on and ACCOUNTS_FAKE_BACKEND=1). The real Supabase is for the
 * owner's Preview test.
 */
test.describe.configure({ mode: 'parallel' });

/**
 * On a long page the sticky tab bar covers the footer and the three links at the foot of Settings at 390 px, wherever
 * the page happens to be scrolled; axe reports that as a target-size problem on those links, not on anything built
 * here (see e2e/accounts.spec.ts, which excludes the footer for the same reason). The tests below scroll them clear
 * separately.
 */
const expectNoAxeViolations = (page: Page, where: string) =>
  axe(page, where, { exclude: ['footer', 'a[href="/accessibility"]', 'a[href="/privacy"]', 'a[href="/terms"]'] });

const PASSWORD = 'purple elephants';
const LESSON_ID = 'g1-rhythm-01-crotchets-and-minims';
const DONE_LESSON = /Crotchets and minims.*complete/i;

let counter = 0;
const uniqueName = (stem = 'Privacy') => `${stem}${(++counter).toString(36)}${randomBytes(2).toString('hex')}`.slice(0, 20);
async function ownIp(page: Page) {
  const b = randomBytes(3);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `10.${b[0]}.${b[1]}.${b[2]}` });
}

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

const card = (page: Page) => page.getByTestId('account-settings');
async function openSettings(page: Page) {
  await page.goto('/settings');
  await waitReady(page);
  await expect(card(page).getByTestId('account-code-name')).toBeVisible();
}
const typeBox = (page: Page) => page.getByLabel('Type your code name to confirm');

test('finish a lesson, download the data and read it, delete the account, and the name is free again', async ({ page }) => {
  test.setTimeout(420_000);
  await ownIp(page);
  const problems = watchProblems(page);
  const name = uniqueName();
  await seedSettings(page, {});
  await signUp(page, name);
  await playExemplarToEnd(page);
  await openSettings(page);
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to your account');

  // Download: the file is named by the day and holds the lesson.
  await expect(card(page)).toContainText("Settings on this device, like the theme and sound, belong to the device, not your account");
  const [download] = await Promise.all([page.waitForEvent('download'), card(page).getByRole('button', { name: 'Download my data' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^music-theory-now-data-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await download.path())!, 'utf8');
  const file = JSON.parse(text) as Record<string, any>;
  expect(Object.keys(file)[0]).toBe('README');
  expect(file.README.what_is_this).toMatch(/everything Music Theory Now keeps/);
  expect(file.profile.code_name).toBe(name);
  expect(file.lesson_progress.map((l: { lesson_id: string }) => l.lesson_id)).toContain(LESSON_ID);
  expect(file.lesson_progress.find((l: { lesson_id: string }) => l.lesson_id === LESSON_ID).state).toBe('complete');
  expect(file.attempts.length).toBeGreaterThan(0);
  expect(text).not.toMatch(/accounts\.invalid|\$2[aby]\$/);
  await expect(page.getByTestId('download-done')).toContainText(download.suggestedFilename());
  await expectNoAxeViolations(page, '/settings: signed in');

  // Delete, step 1. Opening it deletes nothing.
  const settingsBefore = await page.evaluate(() => localStorage.getItem('mtn:v1:settings'));
  await card(page).getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('group', { name: /Step 1 of 2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'No, keep my account' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Delete everything' })).toHaveCount(0);
  await expectNoAxeViolations(page, '/settings: delete step 1');

  // Step 2: the destructive button stays off until the name matches.
  await page.getByRole('button', { name: 'Carry on' }).click();
  await expect(typeBox(page)).toBeFocused();
  const destroy = page.getByRole('button', { name: 'Delete everything' });
  await expect(destroy).toBeDisabled();
  await typeBox(page).fill('not-my-name');
  await expect(destroy).toBeDisabled();
  await expectNoAxeViolations(page, '/settings: delete step 2');
  await typeBox(page).fill(name.toLowerCase());
  await expect(destroy).toBeEnabled();
  expect((await destroy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await destroy.click();

  // Deleted: the words, signed out, the device cleaned, the settings kept.
  const done = page.getByTestId('account-deleted');
  await expect(done).toContainText('Your account and everything in it has been deleted.');
  await expect(done.getByRole('heading', { name: 'Account deleted' })).toBeFocused();
  await expectNoAxeViolations(page, '/settings: deleted');
  await expect(page.getByTestId('account-status').getByRole('link', { name: 'Sign in' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mtn:v1:progress'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('mtn:v1:outbox'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('mtn:v1:sync-owner'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('mtn:v1:settings'))).toBe(settingsBefore);
  await page.goto('/learn');
  await waitReady(page);
  await expect(page.getByRole('link', { name: DONE_LESSON })).toHaveCount(0);

  // Still signed out after a reload, and no export is possible any more.
  await page.goto('/settings');
  await waitReady(page);
  await expect(card(page).getByRole('link', { name: 'Make an account' })).toBeVisible();
  const afterExport = await page.request.post('/api/account/export', { data: {} });
  expect(afterExport.status()).toBe(401);

  expectNoProblems(problems); // (before the deliberate failed sign-in below)

  // The name cannot sign in...
  await page.goto('/account/sign-in');
  await waitReady(page);
  await page.getByLabel('Code name').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('form-error')).toContainText("don't match");

  // ...and is free to use again (docs/accounts-and-data.md: deleting the auth user cascades; the unique name goes with it).
  await page.goto('/account/sign-up');
  await waitReady(page);
  await page.getByRole('radio', { name: /^No, I'm under 18/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Code name').fill(name);
  await expect(page.getByRole('status').filter({ hasText: `${name} is free.` })).toBeVisible();
});

test('keyboard only: Enter opens the steps, focus lands on the safe choice and returns when closed', async ({ page }) => {
  await ownIp(page);
  await seedSettings(page, {});
  await signUp(page, uniqueName('Keys'));
  await openSettings(page);
  const entry = card(page).getByRole('button', { name: 'Delete my account' });
  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'No, keep my account' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Carry on' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(typeBox(page)).toBeFocused();
  await page.keyboard.press('Tab');
  // Off, so Tab skips it and goes to the safe button (focus is visible: see the screenshot check).
  await expect(page.getByRole('button', { name: 'No, keep my account' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card(page).getByRole('button', { name: 'Delete my account' })).toBeFocused();
  // Nothing was deleted.
  await expect(card(page).getByTestId('account-code-name')).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test(`the account card, both delete steps and the deleted screen pass axe in the ${theme} theme`, async ({ page }) => {
    await ownIp(page);
    await seedSettings(page, { theme });
    const name = uniqueName('Axe');
    await signUp(page, name);
    await openSettings(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectNoAxeViolations(page, `/settings account (${theme})`);
    await card(page).getByRole('button', { name: 'Delete my account' }).click();
    await expectNoAxeViolations(page, `delete step 1 (${theme})`);
    await page.getByRole('button', { name: 'Carry on' }).click();
    await typeBox(page).fill(name);
    await expectNoAxeViolations(page, `delete step 2 (${theme})`);
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByTestId('account-deleted')).toBeVisible();
    await expectNoAxeViolations(page, `deleted (${theme})`);
  });
}

test('the routes refuse cross-site posts and signed-out callers', async ({ request }) => {
  for (const path of ['/api/account/export', '/api/account/delete']) {
    const evil = await request.post(path, { data: { confirmCodeName: 'x' }, headers: { origin: 'https://evil.example' } });
    expect(evil.status(), path).toBe(403);
    const out = await request.post(path, { data: { confirmCodeName: 'x' } });
    expect(out.status(), path).toBe(401);
    expect((await request.get(path)).status(), `GET ${path}`).toBe(405);
  }
});
