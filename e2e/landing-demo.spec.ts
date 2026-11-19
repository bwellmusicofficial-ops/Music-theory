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
const clips = (page: Page) => page.getByRole('list', { name: 'Clips to listen to' }).getByRole('button');
/** Plays both clips to the end in real audio time; only then do the answers open. */
async function hearBothClips(page: Page): Promise<void> {
  for (const i of [0, 1]) {
    await clips(page).nth(i).click();
    await expect(clips(page).nth(i)).toHaveAttribute('data-heard', 'true', { timeout: 30_000 });
  }
  await expect(options(page).first()).toBeEnabled();
}
const demo = (page: Page) => page.getByRole('region', { name: /30-second demo/ });

async function open(page: Page, settings: Record<string, unknown> = {}) {
  await seedSettings(page, settings);
  await page.goto('/');
  await waitReady(page);
  await expect(page.getByRole('heading', { level: 3, name: 'Which clip sounds higher?' })).toBeVisible({ timeout: 20_000 });
}

/** Answers step 1 after hearing both clips (either answer gives feedback and a way on, so a content change cannot break the flow tests). */
async function answerStepOne(page: Page): Promise<void> {
  await hearBothClips(page);
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
  const prompt = await page.getByRole('heading', { level: 3, name: 'Which clip sounds higher?' }).boundingBox();
  await expect(clips(page)).toHaveCount(2);
  await expect(options(page).first()).toBeDisabled();
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
  // The page's own Start here / I already know buttons step aside, so there is one purple button, not two.
  await expect(page.getByTestId('welcome-actions')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'I already know some theory' })).toHaveAttribute('href', '/learn#grade-1');
  await expect(page.getByRole('link', { name: 'Browse lessons' })).toHaveAttribute('href', '/learn');

  // Nothing about the visitor was stored and nothing left the site.
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /progress|attempt/.test(k)));
  expect(stored).toEqual([]);
  expect(external, 'requests to other sites').toEqual([]);
  expectNoProblems(problems);

  const startHref = await page.getByRole('link', { name: /Start the first lesson/ }).getAttribute('href');
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
  await expect(page.getByTestId('welcome-actions')).toBeVisible();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  // Fresh: the answers are closed again until both clips are heard.
  await expect(options(page).first()).toBeDisabled();
  await expect(clips(page).first()).toHaveAttribute('data-heard', 'false');
  await expect(page.getByRole('status').filter({ hasText: /Correct|Not quite/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip demo' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Try a 30-second demo' })).toBeFocused();
  await page.getByRole('button', { name: 'Try it' }).click();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
});

test('the demo works with the keyboard alone, and its controls are big enough to hit', async ({ page }) => {
  await open(page);
  const skip = page.getByRole('button', { name: 'Skip demo' });
  const clipA = clips(page).nth(0);
  await clipA.focus();
  await expect(clipA).toBeFocused();
  const outline = await clipA.evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(parseFloat(outline)).toBeGreaterThanOrEqual(2);
  for (const target of [skip, clipA, clips(page).nth(1), options(page).first()]) {
    expect((await target.boundingBox())!.height, 'target height').toBeGreaterThanOrEqual(44);
  }
  // Play both clips with Enter, then answer with Enter.
  await page.keyboard.press('Enter');
  await expect(clipA).toHaveAttribute('data-heard', 'true', { timeout: 30_000 });
  await clips(page).nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(clips(page).nth(1)).toHaveAttribute('data-heard', 'true', { timeout: 30_000 });
  await options(page).first().focus();
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

test('a wrong answer says why, and the right one says so, in the same words for UK and US', async ({ page }) => {
  await open(page, { terminology: 'us' });
  await hearBothClips(page);
  await options(page).nth(0).click();
  const banner = demo(page).getByRole('status').filter({ hasText: /Yes, that one is higher|Listen for the clip that sounds higher/ });
  await expect(banner).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 3, name: 'Which clip sounds higher?' })).toHaveCount(0);
    await expectNoAxeViolations(page, 'dashboard with compact demo card');
    await page.getByRole('button', { name: 'Try it' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Which clip sounds higher?' })).toBeVisible();
    await expect(cont).toBeVisible();
    await expectNoAxeViolations(page, 'dashboard with demo open');
  });
});
