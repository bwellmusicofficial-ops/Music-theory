import { expect, type Locator, type Page } from '@playwright/test';
import { seedSettings, test, waitReady } from './helpers/app';
import { THEMES } from './helpers/a11y';
import { expectNoAxeViolations } from './helpers/axe';
import { expectNotationDrawn } from './helpers/notation';


/**
 * The expression harness (/dev/expression): every marking of docs/expression.md section 4 drawn by the
 * real stave, at 390x844 (phone project) and 1280x800 (desktop project), in dark and light. Each passage
 * must draw its notation, show each expected marking class (visible, and inside the SVG so nothing is
 * clipped), and the page must pass axe with no violations.
 */
const EXPECTED: Record<string, Record<string, number>> = {
  staccato: { 'mtn-artic': 4 },
  accent: { 'mtn-artic': 4 },
  tenuto: { 'mtn-artic': 4 },
  fermata: { 'mtn-fermata': 2 },
  dynamics: { 'mtn-dyn': 6 },
  hairpins: { 'mtn-hairpin': 2, 'mtn-dyn': 3 },
  'hairpin-break': { 'mtn-hairpin': 3, 'mtn-dyn': 2 },
  slurs: { 'mtn-slur': 2 },
  'slur-barline': { 'mtn-slur': 2 },
  'slur-break': { 'mtn-slur': 3 },
  tempo: { 'mtn-tempo': 1 },
  'tempo-compound': { 'mtn-tempo': 1 },
  words: { 'mtn-words': 4 },
  'repeat-bars': { 'mtn-repeat': 4 },
  dc: { 'mtn-repeat': 1 },
  'dc-al-fine': { 'mtn-repeat': 2 },
  ds: { 'mtn-repeat': 2 },
  'ds-al-fine': { 'mtn-repeat': 3 },
  realistic: { 'mtn-tempo': 1, 'mtn-dyn': 3, 'mtn-hairpin': 1, 'mtn-slur': 2, 'mtn-artic': 3, 'mtn-fermata': 1, 'mtn-repeat': 4 },
};

interface Covered {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  vbW: number;
  vbH: number;
}

/** What each mark covers, in the drawing's own units. Text boxes include the music font's huge empty ascent and descent, so text is measured by baseline and advance width instead. */
function measure(marks: Locator): Promise<Covered[]> {
  return marks.evaluateAll((els) =>
    els.map((el) => {
      const vb = (el.closest('svg') as SVGSVGElement).viewBox.baseVal;
      const text = el.querySelector('text');
      if (text) {
        const x = Number(text.getAttribute('x'));
        const y = Number(text.getAttribute('y'));
        const dyn = el.classList.contains('mtn-dyn');
        // Ink above the baseline: music-font signs are small marks sitting on the baseline; words are about as tall as 3/4 of their size.
        const asc = dyn ? 21 : el.classList.contains('mtn-artic') ? 4 : el.classList.contains('mtn-fermata') ? 12 : parseFloat(getComputedStyle(text).fontSize) * 0.75;
        return { x0: x, x1: x + text.getComputedTextLength(), y0: y - asc, y1: y + (dyn ? 9 : 4), vbW: vb.width, vbH: vb.height };
      }
      const b = (el as unknown as SVGGraphicsElement).getBBox();
      return { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height, vbW: vb.width, vbH: vb.height };
    }),
  );
}

async function expectMarkVisible(section: Locator, cls: string, min: number, id: string) {
  const marks = section.locator(`.mtn-stave__notation .${cls}`);
  await expect.poll(() => marks.count(), { message: `${id}: expected at least ${min} .${cls}` }).toBeGreaterThanOrEqual(min);
  const shown = await marks.evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, visible: cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' };
    }),
  );
  shown.forEach((m, i) => {
    expect(m.visible, `${id}: .${cls} #${i} hidden`).toBe(true);
    expect(m.w * m.h, `${id}: .${cls} #${i} has no size`).toBeGreaterThan(0);
  });
  // Nothing is clipped by the edge of the drawing.
  (await measure(marks)).forEach((m, i) => {
    const inside = m.x0 >= -1 && m.x1 <= m.vbW + 1 && m.y0 >= -1 && m.y1 <= m.vbH + 1;
    expect(inside, `${id}: .${cls} #${i} is clipped by the edge of the drawing (${JSON.stringify(m)})`).toBe(true);
  });
  await expect(marks.first(), `${id}: .${cls} not visible`).toBeVisible();
  // Drawn in the stave's colour for the theme, not left black on a dark page.
  const colours = await marks.first().evaluate((el) => {
    const own = getComputedStyle(el.querySelector('text, path') ?? el);
    return { ink: getComputedStyle(el.closest('.mtn-stave')!).color, fill: own.fill, stroke: own.stroke };
  });
  expect([colours.fill, colours.stroke].includes(colours.ink), `${id}: .${cls} is not drawn in the stave colour (${JSON.stringify(colours)})`).toBe(true);
}

async function open(page: Page, theme: 'dark' | 'light') {
  await seedSettings(page, { theme });
  await page.goto('/dev/expression');
  await waitReady(page);
  await expect(page.getByTestId('expression-gallery')).toBeVisible();
}

for (const theme of THEMES) {
  test.describe(`expression harness, ${theme}`, () => {
    test('every passage draws its notation and its markings', async ({ page }) => {
      await open(page, theme);
      await expectNotationDrawn(page.getByTestId('expression-gallery'), Object.keys(EXPECTED).length);
      for (const [id, classes] of Object.entries(EXPECTED)) {
        const section = page.getByTestId(`expr-${id}`);
        await section.scrollIntoViewIfNeeded();
        await expectNotationDrawn(section, 1);
        for (const [cls, min] of Object.entries(classes)) await expectMarkVisible(section, cls, min, id);
      }
    });

    test('Italian words carry lang, dynamics are music-font glyphs, and the page does not scroll sideways', async ({ page }) => {
      await open(page, theme);
      const words = page.getByTestId('expr-words').locator('.mtn-words text');
      await expect(words.first()).toHaveAttribute('lang', 'it');
      const glyphs = await page.getByTestId('expr-dynamics').locator('.mtn-dyn text').evaluateAll((els) => els.map((e) => [...(e.textContent ?? '')].every((c) => (c.codePointAt(0) ?? 0) >= 0xe000)));
      expect(glyphs.every(Boolean) && glyphs.length >= 6).toBe(true);
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    });

    test('axe finds nothing', async ({ page }) => {
      await open(page, theme);
      await expectNotationDrawn(page.getByTestId('expression-gallery'), Object.keys(EXPECTED).length);
      await expectNoAxeViolations(page, `/dev/expression (${theme})`);
    });

    test('dynamics and hairpins never overlap', async ({ page }) => {
      await open(page, theme);
      for (const id of ['dynamics', 'hairpins', 'hairpin-break', 'realistic']) {
        const section = page.getByTestId(`expr-${id}`);
        await section.scrollIntoViewIfNeeded();
        await expectNotationDrawn(section, 1);
        const marks = section.locator('.mtn-stave__notation .mtn-dyn, .mtn-stave__notation .mtn-hairpin');
        const boxes = await measure(marks);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            const overlap = a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
            expect(overlap, `${id}: marks ${i} and ${j} overlap (${JSON.stringify([a, b])})`).toBe(false);
          }
        }
      }
    });
  });
}
