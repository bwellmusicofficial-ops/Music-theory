import { mkdirSync } from 'node:fs';
import { allGlossary } from './helpers/content';
import { expect, seedSettings, seedStorage, STATIC_ROUTES, test, waitReady } from './helpers/app';
import { openLessonAt, LESSON_STEPS, oneQuestionPerType } from './helpers/a11y';
import { expectTargets, headingOutline, reflowProblems } from './helpers/dom-checks';
import { screen } from './helpers/lesson';

/**
 * Items 11 to 13: touch targets, reduced motion, 200% zoom and text size, and page names and structure
 * (headings, landmarks, titles, language, live regions). Screenshots go to /tmp/p1-a11y-shots/.
 */
const SHOTS = '/tmp/p1-a11y-shots';
mkdirSync(SHOTS, { recursive: true });

test.describe.configure({ mode: 'parallel' });

const SITE_ROUTES = STATIC_ROUTES;
const titles = new Map<string, string>();

// --- structure -------------------------------------------------------------------------------

test.describe('structure', () => {
  for (const route of SITE_ROUTES) {
    test(`route ${route}: h1, headings, landmarks, title, lang`, async ({ page }) => {
      await seedSettings(page, {});
      await page.goto(route);
      await waitReady(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      const h = await headingOutline(page);
      expect(h.filter(([l]) => l === 1), `h1 count on ${route}: ${JSON.stringify(h)}`).toHaveLength(1);
      let prev = 0;
      for (const [level, text] of h) {
        expect(level, `heading "${text}" (h${level}) follows h${prev} on ${route}`).toBeLessThanOrEqual(prev + 1);
        prev = level;
      }
      await expect(page.getByRole('banner'), 'banner landmark').toHaveCount(1);
      await expect(page.getByRole('main'), 'main landmark').toHaveCount(1);
      // Full-screen game rounds and mock papers deliberately drop the tab bar; every other page has a navigation landmark.
      if (!/^\/(games|mock)\/[^/]+/.test(route)) await expect(page.getByRole('navigation').first(), 'navigation landmark').toBeAttached();
      const title = await page.title();
      expect(title.length).toBeGreaterThan(3);
      // The library tabs and the unit pages share a template but must not share a title with another route.
      const path = route.split('?')[0];
      if (new URL(page.url()).pathname !== path) return; // a redirect (/lessons goes to /learn) shares its target's title
      const known = titles.get(title);
      if (known && known !== path) throw new Error(`"${title}" is the title of both ${known} and ${path}`);
      titles.set(title, path);
    });
  }

  for (const step of LESSON_STEPS) {
    test(`lesson ${step}: one h1, lang, landmarks`, async ({ page }) => {
      await openLessonAt(page, step, 'dark');
      await waitReady(page);
      const h = await headingOutline(page);
      expect(h.filter(([l]) => l === 1), JSON.stringify(h)).toHaveLength(1);
      let prev = 0;
      for (const [level, text] of h) {
        expect(level, `heading "${text}" follows h${prev}`).toBeLessThanOrEqual(prev + 1);
        prev = level;
      }
      await expect(page.getByRole('main')).toHaveCount(1);
      expect(await page.title()).toMatch(/\|/);
    });
  }

  test('titles differ between lessons and units', async ({ page }) => {
    const seen = new Set<string>();
    for (const url of ['/lessons/g1-rhythm-01-crotchets-and-minims', '/lessons/g1-pitch-01-treble-clef-notes', '/learn/1/rhythm-1', '/learn/start/pulse-1']) {
      await page.goto(url);
      const t = await page.title();
      expect(seen.has(t), `duplicate title ${t}`).toBe(false);
      seen.add(t);
    }
  });

  test('skip link is the first focusable element and moves focus into main', async ({ page }) => {
    for (const url of ['/', '/learn', '/library', '/games', '/games/note-rush', '/mock/grade-1', '/settings', '/accessibility', '/privacy', '/terms', '/lessons/g1-rhythm-01-crotchets-and-minims']) {
      await seedSettings(page, {});
      await page.goto(url);
      await waitReady(page);
      // First in tab order is the first focusable element in the document (the lesson player moves focus to its heading on load).
      const firstText = await page.evaluate(() => {
        const f = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].find((e) => e.tabIndex >= 0 && !e.hasAttribute('disabled'));
        return f?.textContent?.trim();
      });
      expect(firstText, `first focusable element on ${url}`).toBe('Skip to content');
      await page.locator('a[href="#main-content"]').focus();
      await expect(page.locator(':focus')).toBeInViewport();
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => document.activeElement?.id), { message: `focus after skip on ${url}` }).toBe('main-content');
    }
  });

  test('every form control has a name, every icon-only button has a name', async ({ page }) => {
    for (const url of ['/settings', '/library', '/library?tab=glossary', '/games/key-hunt', '/mock/grade-1']) {
      await seedSettings(page, {});
      await page.goto(url);
      await waitReady(page);
      const unnamed = await page.evaluate(() => {
        const out: string[] = [];
        for (const e of document.querySelectorAll('button, input:not([type=hidden]), select, textarea, a[href], [role=button], [role=tab], [role=switch]')) {
          if (e.closest('[aria-hidden="true"]')) continue;
          const el = e as HTMLElement;
          const name = (el.getAttribute('aria-label') ?? '').trim() || (el.getAttribute('aria-labelledby') ? document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent?.trim() : '') || ((el as HTMLInputElement).labels?.[0]?.textContent ?? '').trim() || (el.textContent ?? '').trim() || (el.getAttribute('title') ?? '').trim();
          if (!name) out.push(`${el.tagName} ${el.className.toString().slice(0, 40)}`);
        }
        return out;
      });
      expect(unnamed, `unnamed controls on ${url}`).toEqual([]);
    }
  });

  test('live regions are polite and not duplicated', async ({ page }) => {
    for (const url of ['/', '/settings', '/library', '/games/note-rush', '/mock/grade-1', '/lessons/g1-rhythm-01-crotchets-and-minims']) {
      await seedSettings(page, {});
      await page.goto(url);
      await waitReady(page);
      const regions = await page.evaluate(() =>
        [...document.querySelectorAll('[aria-live], [role=status], [role=alert]')].map((e) => ({
          live: e.getAttribute('aria-live') ?? (e.getAttribute('role') === 'alert' ? 'assertive' : 'polite'),
          text: (e.textContent ?? '').trim(),
        })),
      );
      for (const r of regions) expect(r.live, `${url}: a live region is ${r.live}: "${r.text.slice(0, 40)}"`).not.toBe('assertive');
      const texts = regions.map((r) => r.text).filter((t) => t.length > 3);
      expect(new Set(texts).size, `${url}: duplicated live region text ${JSON.stringify(texts)}`).toBe(texts.length);
    }
  });

  test('Italian terms carry lang="it" in the glossary', async ({ page }) => {
    const italian = allGlossary().filter((g) => g.language === 'it');
    expect(italian.length).toBeGreaterThan(5);
    await page.goto('/library?tab=glossary');
    await waitReady(page);
    // Wait for the glossary list to render (counting at once raced the render under load).
    await expect(page.locator('main li h2[lang="it"]'), 'Italian glossary headings with lang="it"').toHaveCount(italian.length);
    const wrong = await page.locator('main li h2[lang]:not([lang="it"]):not([lang="fr"]):not([lang="de"])').count();
    expect(wrong).toBe(0);
  });

  test('Italian terms carry lang="it" in Term Blitz', async ({ page }) => {
    await seedSettings(page, { untimed: true });
    await page.goto('/games/term-blitz');
    await waitReady(page);
    await page.getByRole('radio', { name: /Italian/ }).check({ force: true });
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.locator('.tb-prompt-term, .tb-prompt-abbr, .tb-opt-text').first()).toBeVisible();
    // Every card kind marks its Italian text: the term prompt, the options of a meaning card, or the abbreviation.
    await expect(
      page.locator('.tb-prompt-term[lang="it"], .tb-opt-text[lang="it"], .tb-prompt-abbr [lang="it"]').first(),
    ).toBeVisible();
  });
});

// --- touch targets ---------------------------------------------------------------------------

test.describe('touch targets', () => {
  for (const route of SITE_ROUTES) {
    test(`route ${route}`, async ({ page }) => {
      await seedSettings(page, {});
      await page.goto(route);
      await waitReady(page);
      await expectTargets(page, route);
    });
  }
  for (const step of LESSON_STEPS) {
    test(`lesson ${step}`, async ({ page }) => {
      await openLessonAt(page, step, 'dark');
      await waitReady(page);
      await expectTargets(page, `lesson ${step}`);
    });
  }
  for (const { lesson, question, type } of oneQuestionPerType()) {
    test(`question type ${type}`, async ({ page }) => {
      await seedSettings(page, {});
      await page.goto(`/dev/question?lesson=${lesson}&q=${question.id}&seed=1`);
      await waitReady(page);
      await expect(page.getByTestId('question-harness')).toBeVisible();
      await expectTargets(page, `question ${type}`, ['Reset question']);
    });
  }
  test('mock test question and navigator', async ({ page }) => {
    await seedSettings(page, {});
    await page.goto('/mock/grade-1');
    await waitReady(page);
    await page.getByRole('button', { name: 'Start the test' }).click();
    await expect(page.getByTestId('position')).toBeVisible();
    await expectTargets(page, 'mock question');
    await page.getByRole('button', { name: /^Question list/ }).click();
    await expectTargets(page, 'mock navigator');
  });
  for (const game of ['note-rush', 'key-hunt', 'term-blitz', 'tap-it']) {
    test(`game ${game} play screen`, async ({ page }) => {
      await seedSettings(page, { untimed: true });
      await page.goto(`/games/${game}`);
      await waitReady(page);
      await page.getByRole('button', { name: /^Start/ }).click();
      await page.waitForTimeout(3800); // past the countdown where there is one
      await expectTargets(page, `${game} play`);
    });
  }
});

// --- reduced motion --------------------------------------------------------------------------

async function motionOffenders(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const secs = (v: string) => v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x)));
    const out: string[] = [];
    for (const e of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(e, pseudo);
        const a = secs(cs.animationDuration);
        const t = secs(cs.transitionDuration);
        if (a.some((n) => n > 0.001) || t.some((n) => n > 0.001)) out.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}${pseudo ?? ''} animation ${cs.animationDuration} transition ${cs.transitionDuration}`);
      }
    }
    return out.slice(0, 8);
  });
}

test.describe('reduced motion', () => {
  for (const mode of ['app setting', 'device setting']) {
    test.describe(mode, () => {
      test.use({ reducedMotion: mode === 'device setting' ? 'reduce' : 'no-preference' });
      const set = (page: import('@playwright/test').Page) => seedSettings(page, mode === 'app setting' ? { reducedMotion: true } : {});
      test('dashboard', async ({ page }) => {
        await set(page);
        await seedStorage(page, { 'mtn:v1:progress': { 'g1-rhythm-01-crotchets-and-minims': { lessonId: 'g1-rhythm-01-crotchets-and-minims', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1, updatedAt: new Date().toISOString() } } });
        await page.goto('/');
        await waitReady(page);
        expect(await motionOffenders(page)).toEqual([]);
      });
      test('lesson', async ({ page }) => {
        await set(page);
        await page.goto('/lessons/g1-rhythm-01-crotchets-and-minims');
        await waitReady(page);
        await screen(page).getByRole('button', { name: 'Continue', exact: true }).click();
        expect(await motionOffenders(page)).toEqual([]);
      });
      test('game', async ({ page }) => {
        await set(page);
        await page.goto('/games/note-rush');
        await waitReady(page);
        await page.getByRole('button', { name: 'Start', exact: true }).click();
        await page.waitForTimeout(500);
        expect(await motionOffenders(page)).toEqual([]);
      });
    });
  }
});

// --- 200% zoom and 200% text size ------------------------------------------------------------

const ZOOM_PAGES: { name: string; open: (page: import('@playwright/test').Page) => Promise<void> }[] = [
  { name: 'home', open: async (p) => { await seedSettings(p, {}); await p.goto('/'); await waitReady(p); } },
  { name: 'lesson-notation', open: async (p) => { await openLessonAt(p, 'hook', 'dark'); await waitReady(p); await expect(p.locator('.mtn-stave').first()).toBeVisible(); } },
  {
    name: 'multiple-choice',
    open: async (p) => {
      const mc = oneQuestionPerType().find((q) => q.type === 'multiple-choice')!;
      await seedSettings(p, {});
      await p.goto(`/dev/question?lesson=${mc.lesson}&q=${mc.question.id}&seed=1`);
      await waitReady(p);
      await expect(p.getByTestId('question-harness')).toBeVisible();
    },
  },
  { name: 'mock-question', open: async (p) => { await seedSettings(p, {}); await p.goto('/mock/grade-1'); await waitReady(p); await p.getByRole('button', { name: 'Start the test' }).click(); await expect(p.getByTestId('position')).toBeVisible(); } },
];

test.describe('200% zoom and text size', () => {
  for (const z of ZOOM_PAGES) {
    test(`${z.name} at 200% zoom (195px wide)`, async ({ page }) => {
      await page.setViewportSize({ width: 195, height: 422 });
      await z.open(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/zoom-${z.name}.png`, fullPage: true });
      expect(await reflowProblems(page)).toEqual([]);
      // At 195px five tab-bar links cannot all be 44px wide; the 24px minimum still applies.
      await expectTargets(page, `${z.name} at 200% zoom`, [], true);
    });
    test(`${z.name} at 200% text size`, async ({ page }) => {
      await z.open(page);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/text-${z.name}.png`, fullPage: true });
      expect(await reflowProblems(page)).toEqual([]);
    });
  }
});
