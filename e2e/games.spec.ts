import type { Page } from '@playwright/test';
import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { playKeyHunt, playNoteRush, playTapIt, playTermBlitz } from './helpers/games';

/**
 * Item 6: each of the four games is started, played through a short round answering from what is on
 * screen, taken to the results, and the personal best is checked in storage, on /games and on the
 * dashboard. Untimed mode keeps the three question games short and independent of the clock; Tap It
 * has no scored untimed mode, so it runs a timed round shortened by ?e2eSeconds (dev routes only).
 */
test.describe.configure({ mode: 'serial' });

async function expectBestEverywhere(page: Page, game: string, score: number) {
  await page.goto('/games');
  await waitReady(page);
  const card = page.getByRole('link', { name: new RegExp(game) });
  await expect(card).toContainText('Personal best');
  await expect(card).toContainText(score.toLocaleString('en-GB'));
  await page.goto('/');
  await waitReady(page);
  await expect(page.getByText(new RegExp(`${game}: best`))).toContainText(score.toLocaleString('en-GB'));
}

function scoreOf(text: string | null): number {
  return Number((text ?? '').replace(/[^\d]/g, ''));
}

test('Note Rush: untimed round, read each note from the announcement, personal best is kept', async ({ page }) => {
  await seedSettings(page, { untimed: true });
  const problems = watchProblems(page);
  await page.goto('/games/note-rush');
  await waitReady(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const results = page.getByTestId('nr-final-score');
  await playNoteRush(page);
  await expect(results).toBeVisible();
  const score = scoreOf(await results.textContent());
  expect(score).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('mtn:v1:note-rush-best'))).toBe(String(score));
  await expectBestEverywhere(page, 'Note Rush', score);
  expectNoProblems(problems);
});

test('Key Hunt: untimed round answered from the data attributes, personal best is kept', async ({ page }) => {
  await seedSettings(page, { untimed: true });
  const problems = watchProblems(page);
  await page.goto('/games/key-hunt');
  await waitReady(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const results = page.getByTestId('kh-final-score');
  await playKeyHunt(page);
  const score = scoreOf(await results.textContent());
  expect(score).toBeGreaterThan(0);
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('mtn:v1:key-hunt-best'))) ?? '{}') as Record<string, number>;
  expect(Math.max(...Object.values(stored))).toBe(score);
  await expectBestEverywhere(page, 'Key Hunt', score);
  expectNoProblems(problems);
});

test('Term Blitz: untimed round answered from the data attributes, personal best is kept', async ({ page }) => {
  await seedSettings(page, { untimed: true });
  const problems = watchProblems(page);
  await page.goto('/games/term-blitz');
  await waitReady(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const results = page.getByTestId('tb-final-score');
  await playTermBlitz(page);
  const score = scoreOf(await results.textContent());
  expect(score).toBeGreaterThan(0);
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('mtn:v1:term-blitz-best'))) ?? '{}') as Record<string, number>;
  expect(Math.max(...Object.values(stored))).toBe(score);
  await expectBestEverywhere(page, 'Term Blitz', score);
  expectNoProblems(problems);
});

test('Tap It: a short timed round tapped on time reaches the results and keeps the personal best', async ({ page }) => {
  await seedSettings(page, {});
  const problems = watchProblems(page);
  await page.goto('/games/tap-it?e2eSeconds=8');
  await waitReady(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const results = page.getByTestId('ti-final-score');
  await playTapIt(page);
  const score = scoreOf(await results.textContent());
  expect(score, 'tapping on time scores').toBeGreaterThan(0);
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('mtn:v1:tap-it-best'))) ?? '{}') as Record<string, number>;
  expect(Math.max(...Object.values(stored))).toBe(score);
  await expectBestEverywhere(page, 'Tap It', score);
  expectNoProblems(problems);
});
