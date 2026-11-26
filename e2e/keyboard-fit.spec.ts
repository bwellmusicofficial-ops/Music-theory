import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { expect, seedSettings, test, waitReady } from './helpers/app';
import { expectNoAxeViolations } from './helpers/axe';

/**
 * The on-screen keyboard fits the width whenever its keys can stay comfortably wide, so a learner is
 * never left wondering whether more keys are hidden; when it cannot fit, the scroll buttons and a hint
 * make that plain. Owner feedback: "Wasn't clear we needed to scroll" (find every C, C4 to C6).
 * Runs in the phone (390x844) and desktop (1280x800) projects; the narrow case sets its own size.
 */
const QUESTION = '/dev/question?lesson=start-pitch-04-finding-c&q=p2-find-every-c&seed=1';
const SHOTS = '/tmp/kb-shots';

async function open(page: Page, theme: 'light' | 'dark' = 'dark') {
  await seedSettings(page, { theme });
  await page.goto(QUESTION);
  await waitReady(page);
  const keyboard = page.getByTestId('keyboard');
  await expect(keyboard).toBeVisible();
  await expect(keyboard.locator('button[data-midi]').first()).toBeVisible();
  await keyboard.scrollIntoViewIfNeeded();
  return keyboard;
}

/** Every key of the keyboard lies fully inside its scrolling box and the viewport. */
async function allKeysVisible(keyboard: Locator): Promise<{ total: number; hidden: number; cs: number; csHidden: number }> {
  return keyboard.evaluate((root) => {
    const box = root.querySelector('[data-overflow]')!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let total = 0;
    let hidden = 0;
    let cs = 0;
    let csHidden = 0;
    for (const k of root.querySelectorAll<HTMLElement>('button[data-midi]')) {
      const r = k.getBoundingClientRect();
      const inside = r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.left >= 0 && r.right <= vw + 0.5;
      const isC = Number(k.dataset.midi) % 12 === 0;
      total++;
      if (!inside) hidden++;
      if (isC) {
        cs++;
        if (!inside) csHidden++;
      }
    }
    return { total, hidden, cs, csHidden };
  });
}

const whiteWidth = (keyboard: Locator) =>
  keyboard.locator('button[data-key="white"]').first().evaluate((el) => el.getBoundingClientRect().width);

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test('find every C: all three Cs are visible with no scrolling, no scroll buttons', async ({ page }, info) => {
  const keyboard = await open(page);
  const seen = await allKeysVisible(keyboard);
  expect(seen.cs, 'a two-octave keyboard from C to C has three Cs').toBe(3);
  expect(seen.csHidden, 'every C is on screen').toBe(0);
  expect(seen.hidden, 'every key is on screen').toBe(0);
  await expect(keyboard).toHaveAttribute('data-fit', 'fit');
  await expect(page.getByRole('button', { name: 'Show higher keys' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show lower keys' })).toHaveCount(0);
  const w = await whiteWidth(keyboard);
  expect(w, 'white keys are at least 21px wide').toBeGreaterThanOrEqual(20.9);
  // The instruction fits a find-every question, not a chord.
  const main = page.getByTestId('question-harness');
  await expect(main).toContainText('Press each key to choose it (press again to undo), then press Check.');
  await expect(main).not.toContainText(/chord/i);
  await expectNoAxeViolations(page, `keyboard fit ${info.project.name}`);
});

for (const theme of ['light', 'dark'] as const) {
  test(`screenshot of the fitted keyboard, ${theme}`, async ({ page }, info) => {
    const keyboard = await open(page, theme);
    await page.getByTestId('question-harness').screenshot({ path: `${SHOTS}/${info.project.name}-${theme}.png` });
    expect((await allKeysVisible(keyboard)).hidden).toBe(0);
  });
}

test.describe('a keyboard too wide for the screen', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('shows the buttons, the fade and the hint; the buttons scroll to both ends', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone project only (touch)');
    const keyboard = await open(page, 'dark');
    await expect(keyboard).toHaveAttribute('data-fit', 'scroll');
    const lower = page.getByRole('button', { name: 'Show lower keys' });
    const higher = page.getByRole('button', { name: 'Show higher keys' });
    await expect(lower).toBeVisible();
    await expect(higher).toBeVisible();
    for (const b of [lower, higher]) {
      const box = (await b.boundingBox())!;
      expect(box.width, 'scroll button is at least 44px wide').toBeGreaterThanOrEqual(43.5);
      expect(box.height, 'scroll button is at least 44px tall').toBeGreaterThanOrEqual(43.5);
    }
    await expect(page.getByTestId('keyboard-scroll-hint')).toContainText('More keys this way');
    expect(await whiteWidth(keyboard), 'keys stop shrinking at the minimum').toBeCloseTo(21, 0);
    const scroller = keyboard.locator('[data-overflow]');
    const left = () => scroller.evaluate((el) => el.scrollLeft);
    await page.screenshot({ path: `${SHOTS}/narrow-320-start.png` });

    // To the far right with the pointer: the C at the far right appears and the button disables itself.
    await higher.click();
    await expect.poll(left).toBeGreaterThan(5);
    await expect(page.getByTestId('keyboard-scroll-hint')).toBeEmpty();
    // Keep going until the end. A press can land while the button is disabling itself, so a missed one is fine.
    for (let i = 0; i < 6 && (await higher.isEnabled()); i++) {
      await higher.click({ timeout: 1500 }).catch(() => undefined);
      await page.waitForTimeout(450);
    }
    await expect(higher).toBeDisabled();
    await expect(lower).toBeEnabled();
    await expect(keyboard.locator('[data-scroll-affordance="right"]')).toHaveCount(0);
    await expect(keyboard.locator('[data-scroll-affordance="left"]')).toHaveCount(1);
    const lastC = keyboard.locator('button[data-midi]').last();
    const r = await lastC.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const box = el.closest('[data-overflow]')!.getBoundingClientRect();
      return b.right <= box.right + 0.5 && b.left >= box.left;
    });
    expect(r, 'the highest key is fully in view at the right end').toBe(true);
    await page.screenshot({ path: `${SHOTS}/narrow-320-end.png` });

    // And back, by keyboard.
    await lower.focus();
    await page.keyboard.press('Enter');
    await expect.poll(left).toBeLessThan(1);
    await expect(lower).toBeDisabled();
    await expectNoAxeViolations(page, 'keyboard overflow 320');
  });

  test('keys still play after scrolling', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone project only (touch)');
    const keyboard = await open(page, 'dark');
    await page.getByRole('button', { name: 'Show higher keys' }).click();
    const keys = keyboard.locator('button[data-key="white"]');
    await keys.nth(7).click();
    await expect(page.getByTestId('played-summary')).not.toContainText('No notes yet');
  });
});
