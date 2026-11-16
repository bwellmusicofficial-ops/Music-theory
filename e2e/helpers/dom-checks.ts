import { expect, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';

/** Minimum target sizes (CSS px): WCAG 2.2 SC 2.5.8 (24) and our own bar for primary actions and answers (44). */
export const MIN_TARGET = 24;
export const MIN_PRIMARY = 44;

export interface TargetProblem {
  el: string;
  w: number;
  h: number;
  need: number;
}

/**
 * Measures every button, link and form control on the page. Inline links inside a sentence are exempt
 * (SC 2.5.8 "inline" exception). A control hidden with sr-only (a styled radio) is measured through the
 * label it sits in. Primary actions, answer buttons, tap pads and tab-bar links must reach 44.
 */
export async function targetProblems(page: Page): Promise<TargetProblem[]> {
  return page.evaluate(
    ({ min, primary }) => {
      const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=switch], [role=checkbox], [role=radio], [role=menuitem], [tabindex="0"]';
      const primarySel = [
        'div.sticky.bottom-0 button',
        'div.sticky.bottom-0 a',
        'ul[aria-label="Answer options"] button',
        '[data-testid="tap-target"]',
        'nav[aria-label="Main tabs"] a',
        '[data-testid="kh-options"] button',
        '.tb-opt',
        '[role="group"][aria-label="Note names"] button',
      ].join(',');
      const describe = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]` : ''} "${(e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
      const out: { el: string; w: number; h: number; need: number }[] = [];
      for (const e of document.querySelectorAll(sel)) {
        if (e.closest('[aria-hidden="true"], [hidden], [inert]')) continue;
        let box = e.getBoundingClientRect();
        let node: Element = e;
        if (e instanceof HTMLInputElement && (box.width <= 2 || box.height <= 2)) {
          const label = e.closest('label') ?? (e.id ? document.querySelector(`label[for="${e.id}"]`) : null);
          if (!label) continue;
          node = label;
          box = label.getBoundingClientRect();
        }
        if (box.width === 0 || box.height === 0) continue;
        const cs = getComputedStyle(node);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        // Elements with tabindex only (focus targets such as the main landmark or a scroll box) are not controls.
        if (e.matches('[tabindex]') && !e.matches('button, a[href], input, select, textarea, summary, [role]')) continue;
        // Inline text links and term buttons inside a sentence.
        const inline = (cs.display === 'inline' || cs.display === 'inline-block') && (e.parentElement?.textContent ?? '').trim().length > (e.textContent ?? '').trim().length;
        if (inline) continue;
        const isPrimary = e.matches(primarySel);
        const need = isPrimary ? primary : min;
        if (box.width + 0.5 < need || box.height + 0.5 < need) out.push({ el: describe(e), w: Math.round(box.width), h: Math.round(box.height), need });
      }
      return out;
    },
    { min: MIN_TARGET, primary: MIN_PRIMARY },
  );
}

/** Headings that are exposed to assistive technology, in document order, as [level, text]. */
export async function headingOutline(page: Page): Promise<[number, string][]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]')]
      .filter((h) => !h.closest('[aria-hidden="true"]') && (h as HTMLElement).offsetParent !== null)
      .map((h) => [Number(h.getAttribute('aria-level') ?? h.tagName[1]), (h.textContent ?? '').trim().slice(0, 40)] as [number, string]),
  );
}

/** Text clipped by an overflow:hidden box, and anything that makes the page scroll sideways. */
export async function reflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) out.push(`page scrolls sideways: ${doc.scrollWidth}px in ${doc.clientWidth}px`);
    for (const e of document.querySelectorAll('body *')) {
      if (e.closest('svg, .mtn-stave, [aria-hidden="true"], .sr-only, .mtn-stave__sr')) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const hidden = ['hidden', 'clip'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY);
      if (!hidden) continue;
      const el = e as HTMLElement;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;
      // Only visible, non-decorative content counts (a blurred blob that is meant to be cut off does not).
      const box = el.getBoundingClientRect();
      const spills = [...el.querySelectorAll('*')].some((c) => {
        if (c.closest('[aria-hidden="true"], svg, .sr-only')) return false;
        const r = c.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1) && (c.textContent ?? '').trim().length > 0;
      });
      if (!spills) continue;
      if (cs.textOverflow === 'ellipsis') continue; // a deliberate, announced truncation
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} clips "${text.slice(0, 30)}"`);
    }
    return out.slice(0, 10);
  });
}

/** Fails with each distinct undersized control listed once. TARGET_REPORT=<file> also appends them as JSON lines. */
export async function expectTargets(page: Page, where: string, ignore: string[] = []): Promise<void> {
  const found = (await targetProblems(page)).filter((p) => !ignore.some((i) => p.el.includes(i)));
  const unique = [...new Map(found.map((p) => [`${p.el}|${p.w}x${p.h}`, p])).values()];
  if (process.env.TARGET_REPORT) appendFileSync(process.env.TARGET_REPORT, unique.map((p) => JSON.stringify({ where, ...p })).join('\n') + (unique.length ? '\n' : ''));
  if (process.env.AXE_REPORT_ONLY === '1') return;
  expect(unique, `controls smaller than ${MIN_TARGET}px (or ${MIN_PRIMARY}px for primary actions) on ${where}`).toEqual([]);
}
