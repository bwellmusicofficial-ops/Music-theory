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
        // Repetition signs are moved as a group; the baseline is the attribute plus that move.
        const y = Number(text.getAttribute('y')) + Number(/translate\(\s*[-\d.]+[ ,]+([-\d.]+)/.exec(el.getAttribute('transform') ?? '')?.[1] ?? 0);
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

    test('dynamics are a letter apart from each other and from hairpin ends, each still under its own note', async ({ page }) => {
      await open(page, theme);
      const letter = await page.getByTestId('expr-dynamics').locator('.mtn-dyn[data-level="p"] text').first().evaluate((t) => (t as unknown as SVGTextContentElement).getComputedTextLength());
      expect(letter).toBeGreaterThan(4);
      for (const id of ['dynamics', 'hairpins', 'hairpin-break', 'realistic']) {
        const section = page.getByTestId(`expr-${id}`);
        await section.scrollIntoViewIfNeeded();
        await expectNotationDrawn(section, 1);
        const dyns = await measure(section.locator('.mtn-stave__notation .mtn-dyn'));
        const pins = await measure(section.locator('.mtn-stave__notation .mtn-hairpin'));
        const rowOf = (c: Covered) => Math.round((c.y0 + c.y1) / 2 / 40);
        const marks = [...dyns.map((c) => ({ ...c, kind: 'dyn' })), ...pins.map((c) => ({ ...c, kind: 'pin' }))];
        for (let i = 0; i < marks.length; i++) {
          for (let j = 0; j < marks.length; j++) {
            const a = marks[i];
            const b = marks[j];
            if (i === j || (a.kind === 'pin' && b.kind === 'pin') || rowOf(a) !== rowOf(b) || !(a.y0 < b.y1 && b.y0 < a.y1)) continue;
            // b is to the right of a: the space between them is at least one letter of the dynamic font
            if (b.x0 >= a.x0) expect(b.x0 - a.x1, `${id}: gap between mark ${i} and ${j}`).toBeGreaterThanOrEqual(letter - 1);
          }
        }
        // Each dynamic starts at its own note head (the notes were spread, the dynamics were not moved).
        const where = await section.locator('.mtn-stave__notation .mtn-dyn').evaluateAll((els) =>
          els.map((el) => {
            const note = el.closest('svg')!.querySelector(`[id$="-${el.getAttribute('data-bar')}-${el.getAttribute('data-event')}"] .vf-notehead`) as SVGGraphicsElement | null;
            const text = el.querySelector('text')!;
            return { dx: note ? Number(text.getAttribute('x')) - note.getBBox().x : 999 };
          }),
        );
        where.forEach((w, i) => expect(Math.abs(w.dx), `${id}: dynamic ${i} is under its note`).toBeLessThan(3));
      }
    });

    test('a hairpin over a system break is one wedge: first piece to about 60%, the continuation from there', async ({ page }) => {
      await open(page, theme);
      const section = page.getByTestId('expr-hairpin-break');
      await section.scrollIntoViewIfNeeded();
      await expectNotationDrawn(section, 1);
      const pieces = await section.locator('.mtn-stave__notation .mtn-hairpin[data-part="first"], .mtn-stave__notation .mtn-hairpin[data-part="last"]').evaluateAll((els) =>
        els.map((el) => {
          const n = [...(el.querySelector('path')?.getAttribute('d') ?? '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
          return { part: el.getAttribute('data-part'), start: Math.abs(n[5] - n[1]), end: Math.abs(n[7] - n[3]) };
        }),
      );
      expect(pieces.length).toBe(2);
      const [first, last] = pieces;
      expect(first.start).toBeLessThan(0.5);
      expect(last.end).toBeGreaterThan(8);
      expect(first.end / last.end).toBeGreaterThan(0.5);
      expect(first.end / last.end).toBeLessThan(0.7);
      expect(Math.abs(last.start - first.end)).toBeLessThan(0.5);
    });

    test('the slur over the bar line ends clear of the accent', async ({ page }) => {
      await open(page, theme);
      const section = page.getByTestId('expr-realistic');
      await section.scrollIntoViewIfNeeded();
      await expectNotationDrawn(section, 1);
      const r = await section.locator('.mtn-stave__notation').evaluate((root) => {
        const slur = root.querySelector('.mtn-slur[data-from="1:3"] path') as SVGPathElement;
        const n = [...(slur.getAttribute('d') ?? '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
        const art = root.querySelector('.mtn-artic[data-bar="2"][data-event="0"]') as SVGGElement;
        const dy = Number(/translate\(\s*[-\d.]+[ ,]+([-\d.]+)/.exec(art.getAttribute('transform') ?? '')?.[1] ?? 0);
        return { slurEndY: n[7], accentBaseline: Number(art.querySelector('text')!.getAttribute('y')) + dy };
      });
      // Smaller y is higher on the page. The accent is about 8 units tall, sitting on its baseline.
      expect(r.slurEndY, 'slur end is above the accent with a gap').toBeLessThan(r.accentBaseline - 8 - 2);
    });

    test('metronome mark has no brackets, and D.C., D.S., Fine are bold italic', async ({ page }) => {
      await open(page, theme);
      for (const id of ['tempo', 'tempo-compound', 'realistic']) {
        const section = page.getByTestId(`expr-${id}`);
        await section.scrollIntoViewIfNeeded();
        await expectNotationDrawn(section, 1);
        const text = (await section.locator('.mtn-tempo').first().textContent()) ?? '';
        expect(text, `${id}: tempo text`).not.toMatch(/[()]/);
        expect(text).toContain('=');
      }
      for (const id of ['dc', 'dc-al-fine', 'ds', 'ds-al-fine']) {
        const section = page.getByTestId(`expr-${id}`);
        await section.scrollIntoViewIfNeeded();
        await expectNotationDrawn(section, 1);
        const styles = await section.locator('.mtn-repeat[data-kind="dc"] text, .mtn-repeat[data-kind="dc-al-fine"] text, .mtn-repeat[data-kind="ds"] text, .mtn-repeat[data-kind="ds-al-fine"] text, .mtn-repeat[data-kind="fine"] text').evaluateAll((els) =>
          els.map((e) => ({ style: getComputedStyle(e).fontStyle, weight: Number(getComputedStyle(e).fontWeight) })),
        );
        expect(styles.length).toBeGreaterThan(0);
        styles.forEach((st) => {
          expect(st.style, `${id}: italic`).toBe('italic');
          expect(st.weight, `${id}: bold`).toBeGreaterThanOrEqual(600);
        });
      }
    });
  });
}
