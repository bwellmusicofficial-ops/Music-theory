import { expect, type Locator } from '@playwright/test';

/**
 * Asserts that notation has actually been drawn inside `scope`, not just that a box exists.
 *
 * `scope` is a stave container (.mtn-stave) or anything that contains one: an exhibit, an answer
 * button, a whole screen. Every stave inside must have finished loading (no aria-busy), hold an
 * SVG with a size, staff lines (five per bar), and at least one glyph (clef, time signature, note
 * head or rest: a SMuFL character in the SVG). At least `min` staves must be found (default 1).
 *
 * This is the check that would have caught multiple-choice questions that showed an empty box.
 */
export async function expectNotationDrawn(scope: Locator, min = 1): Promise<void> {
  const staves = scope.locator('.mtn-stave');
  await expect.poll(() => staves.count(), { message: 'expected a stave container (.mtn-stave) to be on the page' }).toBeGreaterThanOrEqual(min);
  const count = await staves.count();
  for (let i = 0; i < count; i++) {
    const stave = staves.nth(i);
    await expect(stave, `stave ${i} is still loading`).not.toHaveAttribute('aria-busy', 'true');
    const svg = stave.locator('.mtn-stave__notation > svg');
    await expect(svg, `stave ${i} has no notation SVG`).toHaveCount(1);
    // Staff lines are paths in .vf-stave groups.
    await expect.poll(() => svg.locator('.vf-stave path').count(), { message: `stave ${i} has an SVG but no staff lines in it` }).toBeGreaterThanOrEqual(5);
    const info = await svg.evaluate((el) => {
      const box = el.getBoundingClientRect();
      // SMuFL symbols live in the Unicode private-use area and are drawn as <text>.
      const glyphs = [...el.querySelectorAll('text')].filter((t) => [...(t.textContent ?? '')].some((c) => (c.codePointAt(0) ?? 0) >= 0xe000 && (c.codePointAt(0) ?? 0) <= 0xf8ff)).length;
      return { w: box.width, h: box.height, glyphs, lines: el.querySelectorAll('.vf-stave path').length };
    });
    expect(info.lines % 5, `stave ${i} has ${info.lines} staff line paths`).toBe(0);
    expect(info.w, `stave ${i} SVG has no width`).toBeGreaterThan(20);
    expect(info.h, `stave ${i} SVG has no height`).toBeGreaterThan(20);
    expect(info.glyphs, `stave ${i} has staff lines but no clef, note or rest glyphs`).toBeGreaterThan(0);
  }
}

/** A single note or rest symbol (GlyphView): an SVG with a SMuFL character in it, faded in once the font is ready. */
export async function expectGlyphDrawn(glyph: Locator): Promise<void> {
  const svg = glyph.locator('svg[data-glyph]').first();
  await expect(svg, 'glyph SVG missing').toBeVisible();
  await expect.poll(() => svg.evaluate((el) => getComputedStyle(el).opacity), { message: 'glyph never faded in (font not ready)' }).toBe('1');
  const drawn = await svg.evaluate((el) => [...el.querySelectorAll('text')].some((t) => [...(t.textContent ?? '')].some((c) => (c.codePointAt(0) ?? 0) >= 0xe000 && (c.codePointAt(0) ?? 0) <= 0xf8ff)));
  expect(drawn, 'glyph SVG has no symbol in it').toBe(true);
}

/** A keyboard exhibit or instrument: real keys, white and black. */
export async function expectKeyboardDrawn(scope: Locator): Promise<void> {
  const keys = scope.locator('button[data-midi]');
  await expect.poll(() => keys.count(), { message: 'keyboard has no keys' }).toBeGreaterThanOrEqual(8);
  const box = await keys.first().boundingBox();
  expect(box && box.width > 4 && box.height > 20, 'keyboard keys have no size').toBe(true);
}
