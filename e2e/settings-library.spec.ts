import { allGlossary } from './helpers/content';
import { expect, expectNoProblems, seedSettings, seedStorage, test, waitReady, watchProblems } from './helpers/app';

/** Items 7 and 8: settings take effect and persist; the library finds things and its links work. */

test('theme: the toggle changes data-theme and survives a reload', async ({ page }) => {
  await seedSettings(page, { theme: 'dark' });
  await page.goto('/settings');
  await waitReady(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('US terminology: "crotchet" becomes "quarter note" in a lesson and in the glossary', async ({ page }) => {
  await seedSettings(page, { terminology: 'uk' });
  // Resume the exemplar at the Name step so the card that introduces the crotchet is one click away.
  await seedStorage(page, {
    'mtn:v1:progress': { 'g1-rhythm-01-crotchets-and-minims': { lessonId: 'g1-rhythm-01-crotchets-and-minims', state: 'in-progress', step: 'name', questionIndex: 0, bestScore: null, updatedAt: new Date().toISOString() } },
  });
  await page.goto('/settings');
  await waitReady(page);
  await page.getByRole('group', { name: 'Terminology' }).getByRole('button', { name: 'US' }).click();
  await page.goto('/lessons/g1-rhythm-01-crotchets-and-minims');
  await waitReady(page);
  await expect(page.getByTestId('eyebrow')).toContainText('Name it 1 of');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const card = page.getByTestId('name-card');
  await expect(card).toContainText('quarter note');
  await expect(card).not.toContainText('crotchet');
  await expect(card).toContainText('half note');

  await page.goto('/library?tab=glossary');
  await waitReady(page);
  await page.getByRole('searchbox', { name: 'Search the glossary' }).fill('quarter note');
  await expect(page.getByRole('heading', { name: 'quarter note', level: 2 }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'crotchet', level: 2 })).toHaveCount(0);

  // And back to UK, persisted over a reload.
  await page.goto('/settings');
  await page.getByRole('group', { name: 'Terminology' }).getByRole('button', { name: 'UK' }).click();
  await page.reload();
  await page.goto('/library?tab=glossary');
  await page.getByRole('searchbox', { name: 'Search the glossary' }).fill('crotchet');
  await expect(page.getByRole('heading', { name: 'crotchet', level: 2 }).first()).toBeVisible();
});

test('reduced motion: the setting sets data-reduced-motion and persists', async ({ page }) => {
  await seedSettings(page, { reducedMotion: false });
  await page.goto('/settings');
  await waitReady(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-reduced-motion', 'false');
  await page.getByRole('group', { name: 'Reduced motion' }).getByRole('button', { name: 'On' }).click();
  await expect(html).toHaveAttribute('data-reduced-motion', 'true');
  await page.reload();
  await expect(html).toHaveAttribute('data-reduced-motion', 'true');
});

test('reduced motion follows the device setting when nothing is stored', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await context.close();
});

test('untimed: the challenge clock is hidden', async ({ page }) => {
  const id = 'g1-terms-01-loud-and-soft';
  await seedSettings(page, { untimed: false });
  // Saved progress resumes at the challenge intro, so the lesson does not have to be played first.
  await seedStorage(page, { 'mtn:v1:progress': { [id]: { lessonId: id, state: 'in-progress', step: 'challenge', questionIndex: 0, bestScore: null, updatedAt: new Date().toISOString() } } });
  const problems = watchProblems(page);

  // Timed: the clock shows once the challenge starts.
  await page.goto(`/lessons/${id}`);
  await waitReady(page);
  await expect(page.getByTestId('challenge-rules')).toBeVisible();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByTestId('countdown')).toBeVisible();

  // Untimed: no clock at all.
  await page.goto('/settings');
  await page.getByRole('group', { name: 'Untimed challenges' }).getByRole('button', { name: 'On' }).click();
  await page.goto(`/lessons/${id}`);
  await waitReady(page);
  await expect(page.getByTestId('challenge-rules')).toBeVisible();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByTestId('eyebrow')).toContainText('Challenge 1 of');
  await expect(page.getByTestId('countdown')).toHaveCount(0);
  await expect(page.getByRole('timer')).toHaveCount(0);
  expectNoProblems(problems);
});

test('library: search finds a lesson and a glossary term', async ({ page }) => {
  await seedSettings(page, {});
  const problems = watchProblems(page);
  await page.goto('/library');
  await waitReady(page);
  await expect(page.getByRole('tab', { name: 'Lessons' })).toHaveAttribute('aria-selected', 'true');
  const search = page.getByRole('searchbox', { name: 'Search lessons' });
  await search.fill('quavers');
  await expect(page.getByRole('status').filter({ hasText: /lessons? match/ })).toBeVisible();
  const lessonLink = page.getByRole('link', { name: /Quavers/ }).first();
  await expect(lessonLink).toBeVisible();
  expect(await lessonLink.getAttribute('href')).toContain('/lessons/g1-rhythm-04-quavers');
  await search.fill('zzzz-no-such-lesson');
  await expect(page.getByText(/no lessons match|0 lessons/i).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Glossary' }).click();
  await expect(page).toHaveURL(/tab=glossary/);
  const term = allGlossary().find((g) => g.id === 'crotchet')!;
  const gsearch = page.getByRole('searchbox', { name: 'Search the glossary' });
  await gsearch.fill(term.term);
  await expect(page.getByRole('heading', { name: term.term, level: 2 }).first()).toBeVisible();
  expectNoProblems(problems);
});

test('library: a glossary link inside a definition goes to that entry', async ({ page }) => {
  await seedSettings(page, {});
  await page.goto('/library?tab=glossary');
  await waitReady(page);
  // "minim" is defined in terms of the crotchet: its definition links to it.
  const minim = page.locator('li#minim');
  await expect(minim).toBeVisible();
  await minim.getByRole('button', { name: 'crotchet' }).click();
  const target = page.locator('li#crotchet');
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute('data-flash', 'true');
  await expect(page).toHaveURL(/#crotchet$/);
});
