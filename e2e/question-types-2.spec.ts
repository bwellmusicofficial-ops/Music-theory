import { expect, type Locator, type Page } from '@playwright/test';
import { expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { THEMES } from './helpers/a11y';
import { expectNoAxeViolations } from './helpers/axe';
import { expectNotationDrawn } from './helpers/notation';

/**
 * The stave support for the new question types (/dev/question-types-2, docs/question-types-2.md section 1):
 * written beams, gap toggles and the key-signature edit stave, drawn by the real stave at 390x844 (phone project)
 * and 1280x800 (desktop project), in dark and light. Notation is drawn, beams are as written, gaps toggle by
 * pointer and keyboard with a visible marker and focus ring, key-signature signs land on the tapped line.
 */
async function open(page: Page, theme: 'dark' | 'light') {
  await seedSettings(page, { theme });
  await page.goto('/dev/question-types-2');
  await waitReady(page);
  await expect(page.getByTestId('qt2-harness')).toBeVisible();
  await expectNotationDrawn(page.getByTestId('qt2-harness'), 4);
}

/** Where a stave position is on screen: x inside the stave, y of the position, from the drawn stave lines. */
async function positionPoint(stave: Locator, position: number, xFraction = 0.55): Promise<{ x: number; y: number }> {
  const lines = stave.locator('.mtn-stave__notation .vf-stave path');
  const ys = await lines.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2));
  const bottom = Math.max(...ys);
  const top = Math.min(...ys);
  const box = (await stave.locator('.mtn-stave__notation svg').boundingBox())!;
  return { x: box.x + box.width * xFraction, y: bottom - (position * (bottom - top)) / 8 };
}

/** Positions of the drawn key-signature signs, in the drawing's own units: (bottom line - sign baseline) / 5. */
function drawnPositions(stave: Locator): Promise<number[]> {
  return stave.locator('.mtn-stave__notation').evaluate((host) => {
    const svg = host.querySelector('svg')!;
    const ys = [...svg.querySelectorAll('.vf-stave path')].map((p) => Number(/M[-\d.]+ ([-\d.]+)/.exec(p.getAttribute('d') ?? '')?.[1]));
    const bottom = Math.max(...ys) - 0.5;
    return [...svg.querySelectorAll('.vf-keysignature text')].map((t) => Math.round((bottom - Number(t.getAttribute('y'))) / 5));
  });
}

for (const theme of THEMES) {
  test.describe(`question types 2 harness, ${theme}`, () => {
    test('every stave draws its notation and the page has no errors', async ({ page }) => {
      const problems = watchProblems(page);
      await open(page, theme);
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
      expectNoProblems(problems);
    });

    test('written beams are drawn as written, not by the standard rule', async ({ page }) => {
      await open(page, theme);
      const section = page.getByTestId('qt2-beams');
      await section.scrollIntoViewIfNeeded();
      await expectNotationDrawn(section, 1);
      const beams = section.locator('.vf-beam');
      // Bar 1: one beam over all eight quavers (standard would be two). Bar 2: none. Bar 3: one beam over two notes.
      await expect(beams).toHaveCount(2);
      const stems = await beams.evaluateAll((els) => els.map((el) => el.querySelectorAll('.vf-stem').length));
      expect(stems).toEqual([8, 2]);
      // Bar 2 has flags instead of a beam: four quavers, no beam.
      await expect(section.locator('.vf-flag')).toHaveCount(4 + 2);
    });

    test('gaps: the right buttons, sizes, markers; click and keyboard toggle; focus ring is visible', async ({ page }) => {
      await open(page, theme);
      const section = page.getByTestId('qt2-gaps');
      await section.scrollIntoViewIfNeeded();
      const buttons = section.getByRole('button');
      await expect(buttons).toHaveCount(7);
      await expect(buttons.nth(0)).toHaveAccessibleName('Bar line after note 1');
      await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('qt2-gaps-readout')).toHaveText('Gaps on: 2, 4');
      await expect(section.getByTestId('gap-marker')).toHaveCount(2);

      // Sizes: full stave height, at least 24 px wide, up to 44 px where there is room; none overlap.
      const boxes = await buttons.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, w: r.width, h: r.height })));
      for (const b of boxes) {
        expect(b.w).toBeGreaterThanOrEqual(23.5);
        expect(b.w).toBeLessThanOrEqual(44.5);
        expect(b.h).toBeGreaterThanOrEqual(44);
      }
      boxes.sort((a, b) => a.l - b.l);
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].l).toBeGreaterThanOrEqual(boxes[i - 1].l + boxes[i - 1].w - 0.6);

      // Click toggles on and off.
      await buttons.nth(2).click();
      await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('qt2-gaps-readout')).toHaveText('Gaps on: 2, 3, 4');
      await expect(section.getByTestId('gap-marker')).toHaveCount(3);
      await buttons.nth(2).click();
      await expect(page.getByTestId('qt2-gaps-readout')).toHaveText('Gaps on: 2, 4');

      // Keyboard: one tab stop, arrows move, Space and Enter toggle, focus ring drawn.
      await buttons.nth(0).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(buttons.nth(3)).toBeFocused();
      const ring = await buttons.nth(3).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), tab: el.tabIndex };
      });
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThanOrEqual(2);
      expect(ring.tab).toBe(0);
      await expect(section.getByTestId('gap-marker')).toHaveCount(2);
      await page.keyboard.press('Enter');
      await expect(buttons.nth(3)).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Space');
      await expect(buttons.nth(3)).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('End');
      await expect(buttons.nth(6)).toBeFocused();
      await page.keyboard.press('Home');
      await expect(buttons.nth(0)).toBeFocused();
      // An off gap that is focused shows a guide line.
      await expect(section.getByTestId('gap-guide')).toHaveCount(1);
    });

    for (const [clef, start, startLetters] of [
      ['treble', 2, '♯F ♯C'],
      ['bass', -1, '♭B'],
    ] as const) {
      test(`key signature, ${clef}: signs are drawn on the lines they stand for; tap, keyboard and buttons place more`, async ({ page }) => {
        await open(page, theme);
        const section = page.getByTestId(`qt2-ks-${clef}`);
        await section.scrollIntoViewIfNeeded();
        const stave = section.locator('.mtn-stave');
        const readout = page.getByTestId(`qt2-ks-${clef}-readout`);
        await expect(readout).toContainText(`Signs: ${startLetters} (`);
        // No notes; the seeded signs sit at the engine's positions.
        await expect(stave.locator('.vf-stavenote')).toHaveCount(0);
        const seeded = Math.abs(start);
        expect(await drawnPositions(stave)).toHaveLength(seeded);

        // Tap the line at position 3 (second space): a sharp (or flat for the bass) lands there.
        const surface = stave.getByTestId('stave-surface');
        const p3 = await positionPoint(stave, 3);
        await page.mouse.click(p3.x, p3.y);
        const after = await drawnPositions(stave);
        expect(after).toHaveLength(seeded + 1);
        expect(after[after.length - 1]).toBe(3);

        // Keyboard: the top line (position 8) is four presses up from the middle line.
        await surface.focus();
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
        await expect(stave.getByTestId('stave-live')).toHaveText('Top line, ' + (clef === 'treble' ? 'F' : 'A') + '.');
        await expect(stave.locator('.mtn-ghost')).toHaveAttribute('visibility', 'visible');
        await page.keyboard.press('Enter');
        const afterKey = await drawnPositions(stave);
        expect(afterKey).toHaveLength(seeded + 2);
        expect(afterKey[afterKey.length - 1]).toBe(8);

        // Buttons: down twice from the keyboard position (8 -> 6), then place.
        await stave.getByRole('button', { name: 'Move sign down' }).click();
        await stave.getByRole('button', { name: 'Move sign down' }).click();
        await stave.getByRole('button', { name: 'Place sign here' }).click();
        const afterButton = await drawnPositions(stave);
        expect(afterButton[afterButton.length - 1]).toBe(6);

        // The sharp / flat palette decides which glyph lands.
        await page.getByTestId(`qt2-ks-${clef}-flat`).click();
        const p1 = await positionPoint(stave, 1, 0.5);
        await page.mouse.click(p1.x, p1.y);
        const last = await stave.locator('.vf-keysignature text').last().textContent();
        expect(last?.codePointAt(0)).toBe(0xe260);

        // Undo and Clear.
        await page.getByTestId(`qt2-ks-${clef}-undo`).click();
        expect(await drawnPositions(stave)).toHaveLength(seeded + 3);
        await page.getByTestId(`qt2-ks-${clef}-clear`).click();
        expect(await drawnPositions(stave)).toHaveLength(0);
        await expect(readout).toContainText('Signs: none');
      });
    }

    test('key signature: positions -1 and 9 are reachable by tap; a tap is mapped to the nearest position', async ({ page }) => {
      await open(page, theme);
      const section = page.getByTestId('qt2-ks-treble');
      await section.scrollIntoViewIfNeeded();
      const stave = section.locator('.mtn-stave');
      await page.getByTestId('qt2-ks-treble-clear').click();
      const want: number[] = [];
      for (const p of [-1, 9, 0, 8]) {
        const pt = await positionPoint(stave, p);
        await page.mouse.click(pt.x, pt.y);
        want.push(p);
        expect(await drawnPositions(stave)).toEqual(want);
      }
    });

    test('axe finds nothing', async ({ page }) => {
      await open(page, theme);
      await expectNoAxeViolations(page, `/dev/question-types-2 (${theme})`);
    });
  });
}
