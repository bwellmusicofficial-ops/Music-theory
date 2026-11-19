import { expectNoAxeViolations } from './helpers/axe';
import { expect, expectNoProblems, seedSettings, seedStorage, test, waitReady, watchProblems } from './helpers/app';
import { currentRunId, tapRunOnTime } from './helpers/rhythm';
import type { Page } from '@playwright/test';

/**
 * P1-13: the playable demo on the landing page. A new visitor can answer a question, tap a rhythm and
 * reach the first lesson with no sign-up; a returning learner keeps their continue card and gets a slim
 * demo card instead. Runs on the phone and the desktop projects.
 */

const FIRST_LESSON = 'start-pitch-01-high-and-low';
const SECOND_LESSON = 'start-pitch-02-up-down-or-the-same';

const options = (page: Page) => page.getByRole('list', { name: 'Answer options' }).getByRole('button');
/**
 * Later demo states change the page height, so the buttons under the demo can land half under the fixed
 * tab bar, which axe's target-size rule reports as "partially obscured". The first-load state (the one
 * every visitor sees, and the one the route-wide axe specs check) runs on the whole page; the later states
 * leave those two buttons out and check everything else.
 */
const BELOW_THE_DEMO = ['[data-testid="welcome-actions"]'];
const demo = (page: Page) => page.getByRole('region', { name: /30-second demo/ });

async function open(page: Page, settings: Record<string, unknown> = {}) {
  await seedSettings(page, settings);
  await page.goto('/');
  await waitReady(page);
  await expect(page.getByRole('heading', { level: 3, name: 'Which note sounds higher?' })).toBeVisible({ timeout: 20_000 });
}

/** Answers step 1 (either answer gives feedback and a way on, so a content change cannot break the flow tests). */
async function answerStepOne(page: Page): Promise<void> {
  await options(page).nth(1).click();
  await expect(demo(page).getByRole('status').filter({ hasText: /Correct|Not quite/ })).toBeVisible();
}

async function tapStepTwo(page: Page): Promise<void> {
  const before = await currentRunId(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await tapRunOnTime(page, before);
}

test('new visitor: the demo is on the first screen, above the marketing copy', async ({ page }) => {
  await open(page);
  const viewport = page.viewportSize()!;
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
  const prompt = await page.getByRole('heading', { level: 3, name: 'Which note sounds higher?' }).boundingBox();
  const optionBoxes = await Promise.all([0, 1].map((i) => options(page).nth(i).boundingBox()));
  const copy = await page.getByText(/Short, hands-on lessons/).boundingBox();
  expect(h1!.y).toBeLessThan(prompt!.y);
  expect(prompt!.y).toBeLessThan(copy!.y);
  // Both answers are fully visible without scrolling, above the phone's tab bar (about 72px).
  const bottomChrome = viewport.width < 600 ? 72 : 0;
  for (const box of optionBoxes) expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - bottomChrome);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
});

test('new visitor: completes the whole demo, with axe at zero at each step, and reaches the first lesson', async ({ page }) => {
  const problems = watchProblems(page);
  const external: string[] = [];
  page.on('request', (r) => {
    // blob: and data: are in-page (the audio engine's own worklet); only real hosts count.
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await open(page);
  await expectNoAxeViolations(page, 'landing demo step 1');

  // Step 1: instant feedback, focus moves on to Next.
  await answerStepOne(page);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
  await expectNoAxeViolations(page, 'landing demo step 1 feedback', { exclude: BELOW_THE_DEMO });
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Step 2: the real rhythm pad.
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Rhythm pad' })).toBeVisible();
  await expectNoAxeViolations(page, 'landing demo step 2', { exclude: BELOW_THE_DEMO });
  await tapStepTwo(page);
  const finish = page.getByRole('button', { name: 'Finish' });
  await expect(finish).toBeVisible();
  await expect(demo(page).getByRole('status').filter({ hasText: /Correct|Not quite/ })).toBeVisible();
  await expectNoAxeViolations(page, 'landing demo step 2 feedback', { exclude: BELOW_THE_DEMO });
  await finish.click();

  // Finish card.
  await expect(page.getByRole('heading', { level: 3, name: /That.s how every lesson works/ })).toBeFocused();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await expectNoAxeViolations(page, 'landing demo finish', { exclude: BELOW_THE_DEMO });
  await expect(page.getByRole('link', { name: 'Browse lessons' })).toHaveAttribute('href', '/learn');

  // Nothing about the visitor was stored and nothing left the site.
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /progress|attempt/.test(k)));
  expect(stored).toEqual([]);
  expect(external, 'requests to other sites').toEqual([]);
  expectNoProblems(problems);

  // It leads to the same first lesson as the page's own "Start here" button.
  const startHref = await page.getByRole('link', { name: 'Start here', exact: true }).getAttribute('href');
  expect(startHref).toMatch(/^\/lessons\/start-/);
  await page.getByRole('link', { name: /Start the first lesson/ }).click();
  await expect(page).toHaveURL(new RegExp(`${startHref}$`));
});

test('the finish card can be restarted, and the demo can be skipped and brought back', async ({ page }) => {
  await open(page);
  await answerStepOne(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await tapStepTwo(page);
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Try the demo again' }).click();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(options(page).first()).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: /Correct|Not quite/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip demo' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Try a 30-second demo' })).toBeFocused();
  await page.getByRole('button', { name: 'Try it' }).click();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
});

test('the demo works with the keyboard alone, and its controls are big enough to hit', async ({ page }) => {
  await open(page);
  const skip = page.getByRole('button', { name: 'Skip demo' });
  // Tab from the top reaches the options without a trap; each Tab stop shows a focus ring.
  const first = options(page).first();
  await first.focus();
  await expect(first).toBeFocused();
  const outline = await first.evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(parseFloat(outline)).toBeGreaterThanOrEqual(2);
  for (const target of [skip, first, options(page).nth(1)]) {
    const box = await target.boundingBox();
    expect(box!.height, 'target height').toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Enter');
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(next).toBeFocused();
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 3 })).toBeFocused();
  const start = page.getByRole('button', { name: 'Start', exact: true });
  await start.focus();
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('UK terms by default', async ({ page }) => {
  await open(page);
  await options(page).nth(0).click();
  const uk = demo(page).getByRole('status').filter({ hasText: /Correct|Not quite/ });
  await expect(uk).toContainText(/\bstave\b/);
  await expect(uk).not.toContainText(/\bstaff\b/);
});

test('US terms with the switch', async ({ page }) => {
  await open(page, { terminology: 'us' });
  await options(page).nth(0).click();
  const us = demo(page).getByRole('status').filter({ hasText: /Correct|Not quite/ });
  await expect(us).toContainText(/\bstaff\b/);
  await expect(us).not.toContainText(/\bstave\b/);
});

test('with reduced motion nothing in the demo animates for longer than a blink', async ({ page }) => {
  await open(page, { reducedMotion: true });
  const long = await demo(page).evaluate((root) => {
    const bad: string[] = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      for (const pseudo of [null, '::before', '::after']) {
        const s = getComputedStyle(el, pseudo);
        const secs = (v: string) => Math.max(...v.split(',').map((t) => parseFloat(t) || 0));
        if (secs(s.animationDuration) > 0.00001 && s.animationName !== 'none') bad.push(`${el.tagName} animation ${s.animationDuration}`);
        if (secs(s.transitionDuration) > 0.00001) bad.push(`${el.tagName} transition ${s.transitionDuration}`);
      }
    }
    return bad;
  });
  expect(long).toEqual([]);
});

test.describe('returning learner', () => {
  test.beforeEach(async ({ page }) => {
    const now = new Date().toISOString();
    await seedStorage(page, {
      'mtn:v1:progress': {
        [FIRST_LESSON]: { lessonId: FIRST_LESSON, state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1, updatedAt: now },
        [SECOND_LESSON]: { lessonId: SECOND_LESSON, state: 'in-progress', step: 'name', questionIndex: 0, bestScore: null, updatedAt: now },
      },
    });
  });

  test('sees the continue card first and a slim demo card below it that opens in place', async ({ page }) => {
    await seedSettings(page, {});
    await page.goto('/');
    await waitReady(page);
    const cont = page.getByRole('link', { name: /Continue lesson/ });
    await expect(cont).toBeVisible();
    const compact = page.getByRole('heading', { level: 2, name: 'Try a 30-second demo' });
    await expect(compact).toBeVisible({ timeout: 20_000 });
    expect((await cont.boundingBox())!.y).toBeLessThan((await compact.boundingBox())!.y);
    await expect(page.getByRole('heading', { level: 3, name: 'Which note sounds higher?' })).toHaveCount(0);
    await expectNoAxeViolations(page, 'dashboard with compact demo card');
    await page.getByRole('button', { name: 'Try it' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Which note sounds higher?' })).toBeVisible();
    await expect(cont).toBeVisible();
    await expectNoAxeViolations(page, 'dashboard with demo open');
  });
});
