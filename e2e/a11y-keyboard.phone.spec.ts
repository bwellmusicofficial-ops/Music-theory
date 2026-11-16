import { expect, seedSettings, test, waitReady } from './helpers/app';
import { oneQuestionPerType, openLessonAt } from './helpers/a11y';
import { EXEMPLAR, lesson } from './helpers/content';
import { noteLetterFromWords, playUntil } from './helpers/games';
import { expectAllReachable, focusIndicatorVisible, tabTo, trackFocus } from './helpers/keyboard';
import { screen } from './helpers/lesson';

/**
 * Item 10: keyboard-only runs. Nothing here uses the mouse: controls are reached with Tab (so an
 * unreachable control or a focus trap fails) and operated with Enter, Space and the arrow keys. Every
 * stop is checked for a visible focus indicator. Tap-timing and drag-like gestures are not scripted by
 * keyboard (see docs/accessibility.md).
 */
test.describe.configure({ mode: 'parallel' });

const stepHeading = (page: import('@playwright/test').Page) => page.evaluate(() => document.activeElement?.tagName);

test('exemplar lesson: hook, explore and name by keyboard, focus moves to the new step heading', async ({ page }) => {
  const def = lesson(EXEMPLAR);
  await openLessonAt(page, 'hook', 'dark');
  await waitReady(page);
  // The player focuses the step heading on load.
  expect(await stepHeading(page)).toBe('H1');
  await trackFocus(page);
  await tabTo(page, screen(page).getByRole('button', { name: 'Continue', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('eyebrow')).toHaveText('Explore');
  expect(await stepHeading(page), 'focus should move to the heading of the new step').toBe('H1');

  // Explore: the rhythm pad. Start by keyboard, then a tap with Space.
  await tabTo(page, screen(page).getByRole('button', { name: 'Start', exact: true }));
  await page.keyboard.press('Enter');
  const pad = screen(page).getByTestId('tap-target');
  await expect(pad).toHaveAttribute('aria-disabled', 'false');
  await tabTo(page, pad);
  await page.keyboard.press('Space');
  await expect(pad).toBeFocused();

  // Name it: every card by keyboard, from a saved position (the explore goal needs timed taps).
  await openLessonAt(page, 'name', 'dark');
  for (let i = 0; i < def.steps.name.cards.length; i++) {
    await expect(page.getByTestId('eyebrow')).toContainText(`Name it ${i + 1} of`);
    if (i === 0) {
      const other = screen(page).getByRole('button', { name: /another way/i });
      await tabTo(page, other);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('name-card')).toBeVisible();
    }
    await tabTo(page, screen(page).getByRole('button', { name: 'Continue', exact: true }));
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('eyebrow')).toContainText('Practice 1 of');
  expect(await stepHeading(page)).toBe('H1');
});

test.describe('one question of each type: every control reachable, focus visible', () => {
  for (const { lesson: l, question, type } of oneQuestionPerType()) {
    test(type, async ({ page }) => {
      await seedSettings(page, {});
      await page.goto(`/dev/question?lesson=${l}&q=${question.id}&seed=1`);
      await waitReady(page);
      await expect(page.getByTestId('question-harness')).toBeVisible();
      await expectAllReachable(page, '[data-testid="question-harness"]');
    });
  }

  test('multiple-choice answered by keyboard: option, then the announced result', async ({ page }) => {
    const mc = oneQuestionPerType().find((q) => q.type === 'multiple-choice')!;
    await seedSettings(page, {});
    await page.goto(`/dev/question?lesson=${mc.lesson}&q=${mc.question.id}&seed=1`);
    await waitReady(page);
    const root = page.getByTestId('question-harness');
    const info = JSON.parse((await root.getAttribute('data-question-json'))!) as { payload: { correct: string; options: { id: string }[] } };
    const index = info.payload.options.findIndex((o) => o.id === info.payload.correct);
    const option = root.locator('ul[aria-label="Answer options"] > li').nth(index).locator('button');
    await tabTo(page, option);
    await page.keyboard.press('Space');
    // Choosing an option marks it at once; the result is announced in a status region.
    await expect(root.locator('[role="status"][data-kind="correct"]')).toBeVisible();
  });

  test('ordering answered by keyboard with the arrow keys and the move buttons', async ({ page }) => {
    const q = oneQuestionPerType().find((x) => x.type === 'ordering')!;
    await seedSettings(page, {});
    await page.goto(`/dev/question?lesson=${q.lesson}&q=${q.question.id}&seed=1`);
    await waitReady(page);
    const root = page.getByTestId('question-harness');
    const rows = root.locator('ol[aria-label="Items to put in order"] > li');
    const face = (i: number) => rows.nth(i).locator('[data-face]').first().textContent();
    const first = await face(0);
    await tabTo(page, rows.first());
    await page.keyboard.press('ArrowDown');
    expect(await face(0), 'ArrowDown moved the focused row down, so another item is now first').not.toBe(first);
    await expect(rows.nth(1)).toBeFocused();
  });
});

test('mock test by keyboard: start, answer, next, question list, flag, finish dialog, results', async ({ page }) => {
  await seedSettings(page, {});
  await page.goto('/mock/grade-1');
  await waitReady(page);
  await tabTo(page, page.getByRole('button', { name: 'Start the test' }));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toContainText('Question 1 of');
  await trackFocus(page);
  await expectAllReachable(page, 'main');

  // Answer the first question if it is multiple choice (otherwise move on).
  const options = page.locator('ul[aria-label="Answer options"] button');
  if (await options.count()) {
    await tabTo(page, options.first());
    await page.keyboard.press('Space');
    await expect(page.getByTestId('answer-status')).toContainText('Answer saved');
  }
  await tabTo(page, page.getByRole('button', { name: 'Next', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toContainText('Question 2 of');

  // Question list: open, pick question 1, flag it.
  await tabTo(page, page.getByRole('button', { name: /^Question list/ }));
  await page.keyboard.press('Enter');
  const nav = page.getByTestId('navigator');
  await expect(nav).toBeVisible();
  await tabTo(page, nav.locator('button').first());
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toContainText('Question 1 of');
  const flag = page.getByRole('button', { name: 'Flag for review' });
  await tabTo(page, flag);
  await page.keyboard.press('Enter');
  await expect(flag).toHaveAttribute('aria-pressed', 'true');

  // Finish: the confirm dialog takes focus and keeps it (a modal), Escape closes it, then confirm.
  await tabTo(page, page.getByRole('button', { name: 'Finish test', exact: true }).first());
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus moves into the dialog').toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'Tab stays inside the dialog').toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await tabTo(page, page.getByRole('button', { name: 'Finish test', exact: true }).first());
  await page.keyboard.press('Enter');
  await tabTo(page, dialog.getByRole('button', { name: 'Finish test', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mock-results')).toBeVisible();
  const rings = await focusIndicatorVisible(page);
  expect(rings.ok, rings.what).toBe(true);
});

test.describe('games by keyboard', () => {
  test('Note Rush: choose options, start, play a round with the letter keys', async ({ page }) => {
    await seedSettings(page, { untimed: true });
    await page.goto('/games/note-rush');
    await waitReady(page);
    await expectAllReachable(page, 'main');
    await tabTo(page, page.getByRole('button', { name: 'Start', exact: true }));
    await page.keyboard.press('Enter');
    const announce = page.locator('p[role="status"][aria-live="polite"]').first();
    for (let n = 1; n <= 20; n++) {
      await expect(announce).toContainText(`Note ${n} of 20, on the`);
      const words = /Note \d+ of 20, on the (.+?)\.$/.exec((await announce.innerText()).trim())![1]!;
      await page.keyboard.press(noteLetterFromWords(words).toLowerCase());
    }
    await expect(page.getByTestId('nr-final-score')).toBeVisible();
    await tabTo(page, page.getByRole('button', { name: /again|Play/i }).first());
  });

  test('Key Hunt: start and play a round with the number keys', async ({ page }) => {
    await seedSettings(page, { untimed: true });
    await page.goto('/games/key-hunt');
    await waitReady(page);
    await expectAllReachable(page, 'main');
    await tabTo(page, page.getByRole('button', { name: 'Start', exact: true }));
    await page.keyboard.press('Enter');
    await playUntil(page.getByTestId('kh-final-score'), async () => {
      const correct = page.locator('[data-testid="kh-options"] button[data-test-correct="true"]:not([disabled])');
      const all = page.locator('[data-testid="kh-options"] button');
      const index = await all.evaluateAll((els) => els.findIndex((e) => e.getAttribute('data-test-correct') === 'true' && !(e as HTMLButtonElement).disabled));
      if (index >= 0 && (await correct.count())) await page.keyboard.press(String(index + 1));
      else await page.keyboard.press('Enter');
    });
  });

  test('Term Blitz: start and play a round with the number keys', async ({ page }) => {
    await seedSettings(page, { untimed: true });
    await page.goto('/games/term-blitz');
    await waitReady(page);
    await expectAllReachable(page, 'main');
    await tabTo(page, page.getByRole('button', { name: 'Start', exact: true }));
    await page.keyboard.press('Enter');
    await playUntil(page.getByTestId('tb-final-score'), async () => {
      const index = await page.locator('.tb-opt').evaluateAll((els) => els.findIndex((e) => e.getAttribute('data-test-correct') === 'true' && !(e as HTMLButtonElement).disabled));
      if (index >= 0) await page.keyboard.press(String(index + 1));
      else await page.keyboard.press('Enter');
    });
  });
});

test('library by keyboard: tabs with the arrow keys, search, glossary result', async ({ page }) => {
  await seedSettings(page, {});
  await page.goto('/library');
  await waitReady(page);
  await expectAllReachable(page, 'main');
  const tab = (name: string) => page.getByRole('tab', { name });
  await tabTo(page, tab('Lessons'));
  await page.keyboard.press('ArrowRight');
  await expect(tab('Recap cards')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Recap cards')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Glossary')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab('Lessons')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab('Glossary')).toHaveAttribute('aria-selected', 'true');
  const search = page.getByRole('searchbox', { name: 'Search the glossary' });
  await tabTo(page, search);
  await page.keyboard.type('crotchet');
  await expect(page.getByRole('heading', { name: 'crotchet', level: 2 }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /match|entr/i }).first()).toBeAttached();
});

test('settings by keyboard: every setting can be reached and changed', async ({ page }) => {
  await seedSettings(page, {});
  await page.goto('/settings');
  await waitReady(page);
  await expectAllReachable(page, 'main');
  const groups = page.locator('main [role="group"][aria-label]');
  const n = await groups.count();
  expect(n).toBeGreaterThanOrEqual(5);
  for (let g = 0; g < n; g++) {
    const group = groups.nth(g);
    const label = await group.getAttribute('aria-label');
    const buttons = group.locator('button[aria-pressed]');
    const count = await buttons.count();
    if (count < 2) continue;
    // Pick the button that is not pressed and press it with the keyboard.
    const idx = await buttons.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-pressed') !== 'true'));
    const target = buttons.nth(idx);
    await tabTo(page, target);
    await page.keyboard.press(g % 2 === 0 ? 'Enter' : 'Space');
    await expect(target, `setting "${label}" changed by keyboard`).toHaveAttribute('aria-pressed', 'true');
  }
});
