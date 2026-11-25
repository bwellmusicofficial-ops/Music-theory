import type { Page } from '@playwright/test';
import { expect, seedSettings, test, waitReady } from './helpers/app';

/**
 * Backlog item 25: the "Correct answer" and "Your answer" chips of a multiple-choice question whose options are
 * passages sit under the stave, never over the notation. Measured in a real browser at 320, 390 and 430 px, in
 * both themes. /dev/question draws a lesson question exactly as the player does.
 */
const LESSON = 'g1-pitch-05-tones-and-semitones';
const QUESTION = 'p5-which-pair';

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** For every result chip: its box, the option's button box, and every drawn part of the notation in that option. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element): Box => {
      const r = e.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    return [...document.querySelectorAll('ul[aria-label="Answer options"] [data-tone]')].map((chip) => {
      const li = chip.closest('li')!;
      const button = li.querySelector('button')!;
      const parts = [...li.querySelectorAll('.mtn-stave__notation svg :is(path, line, rect, ellipse, circle, polygon, polyline)')]
        .map(box)
        .filter((x) => x.r - x.l > 0 && x.b - x.t > 0);
      const stave = box(li.querySelector('.mtn-stave__canvas')!);
      return { text: chip.textContent ?? '', chip: box(chip), button: box(button), stave, parts };
    });
  });
}

const overlaps = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 430]) {
    test(`passage options: the answer chips never cover the notation (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await seedSettings(page, { theme });
      await page.goto(`/dev/question?lesson=${LESSON}&q=${QUESTION}&seed=1`);
      await waitReady(page);
      const list = page.getByRole('list', { name: 'Answer options' });
      await expect(list).toBeVisible();
      await expect(page.locator('.mtn-stave .vf-stave')).toHaveCount(3, { timeout: 20_000 });

      // Pick a wrong option, so both a "Your answer" and a "Correct answer" chip are on screen.
      const { payload } = JSON.parse((await page.getByTestId('question-harness').getAttribute('data-question-json'))!);
      const wrong = payload.options.findIndex((o: { id: string }) => o.id !== payload.correct);
      await list.getByRole('button').nth(wrong).click();
      await expect(list.locator('[data-tone="right"]')).toBeVisible();
      await expect(list.locator('[data-tone="wrong"]')).toBeVisible();

      const chips = await measure(page);
      expect(chips.map((c) => c.text).sort()).toEqual(['Correct answer', 'Your answer']);
      for (const c of chips) {
        expect(c.parts.length, `${c.text}: notation was drawn`).toBeGreaterThanOrEqual(3);
        for (const part of c.parts) expect(overlaps(c.chip, part), `${c.text} covers notation`).toBe(false);
        // The chip is also clear of the stave's whole area, and sits inside its option, fully visible.
        expect(overlaps(c.chip, c.stave), `${c.text} overlaps the stave area`).toBe(false);
        expect(c.chip.l).toBeGreaterThanOrEqual(c.button.l);
        expect(c.chip.r).toBeLessThanOrEqual(c.button.r);
        expect(c.chip.b).toBeLessThanOrEqual(c.button.b);
        expect(c.chip.r).toBeLessThanOrEqual(width);
      }
    });
  }
}

/** Backlog item 26: joined beam gaps draw no marker over the beam, but are still buttons that say "pressed". */
for (const theme of ['light', 'dark'] as const) {
  test(`fix-beaming: joined gaps are quiet, stay pressed, and show a thin line only on focus (${theme}, 390px)`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { theme });
    await page.goto('/dev/question?lesson=g1-rhythm-10-grouping-notes&q=p4-fix-the-beams&seed=1');
    await waitReady(page);
    const gaps = page.getByRole('group').getByRole('button', { name: /^Join note/ });
    await expect(gaps.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.mtn-stave .vf-beam').first()).toBeAttached({ timeout: 20_000 });
    const n = await gaps.count();
    expect(n).toBeGreaterThan(2);
    const pressed = await gaps.evaluateAll((els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').length);
    expect(pressed).toBeGreaterThan(0);
    // No line-and-diamond marker over any beam.
    await expect(page.getByTestId('gap-marker')).toHaveCount(0);
    await expect(page.getByTestId('gap-guide')).toHaveCount(0);
    // Keyboard focus shows one thin guide for that gap, and it goes when focus leaves.
    await gaps.first().focus();
    await expect(page.getByTestId('gap-guide')).toHaveCount(1);
    await gaps.first().blur();
    await expect(page.getByTestId('gap-guide')).toHaveCount(0);
    // Splitting a join still works: the gap turns off and the beam splits.
    const beams = page.locator('.vf-beam');
    const before = await beams.count();
    await gaps.nth(1).click();
    await expect(gaps.nth(1)).toHaveAttribute('aria-pressed', 'false');
    expect(await beams.count()).not.toBe(before);
  });
}
