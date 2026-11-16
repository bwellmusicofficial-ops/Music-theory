import { expect, type Locator, type Page } from '@playwright/test';

/** Records every element that receives focus, and the way it was marked. Install once per page load. */
export async function trackFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __focused?: Set<Element>; __focusLog?: string[] };
    if (w.__focused) return;
    w.__focused = new Set();
    w.__focusLog = [];
    document.addEventListener('focusin', (e) => {
      w.__focused!.add(e.target as Element);
      w.__focusLog!.push((e.target as Element).tagName);
    });
  });
}

/** Is the focus indicator visible on the focused element (outline, ring or shadow), or on the control a hidden input stands for? */
export async function focusIndicatorVisible(page: Page): Promise<{ ok: boolean; what: string }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: true, what: 'body' };
    const shows = (e: Element) => {
      const cs = getComputedStyle(e);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor !== 'rgba(0, 0, 0, 0)';
      const shadow = cs.boxShadow !== 'none' && /\d/.test(cs.boxShadow);
      return outline || shadow;
    };
    const desc = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}]`;
    if (shows(el)) return { ok: true, what: desc };
    // A visually hidden radio: the label's next element is drawn instead.
    const stand = el.nextElementSibling ?? el.closest('label');
    if (el.matches('input') && stand && shows(stand)) return { ok: true, what: desc };
    // A skip link or main landmark is allowed to show nothing while focused programmatically.
    if (el.id === 'main-content') return { ok: true, what: desc };
    return { ok: false, what: desc };
  });
}

/** Presses Tab until `target` has focus (at most `max` presses). Fails if it cannot be reached. Checks the ring on every stop. */
export async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    const there = await target.evaluate((el) => el === document.activeElement).catch(() => false);
    if (there) return;
    await page.keyboard.press('Tab');
    const ring = await focusIndicatorVisible(page);
    expect(ring.ok, `no visible focus indicator on ${ring.what}`).toBe(true);
  }
  throw new Error(`could not reach ${target} with the Tab key in ${max} presses (focus trap or unreachable control)`);
}

/**
 * Tabs through the page and asserts every control in `scope` that is visible and enabled gets focus
 * (nothing unreachable, no trap), and that each stop shows a focus indicator.
 */
export async function expectAllReachable(page: Page, scopeSelector: string, extra = 14): Promise<void> {
  await trackFocus(page);
  const controls = await page.evaluate((scopeSel) => {
    const scope = document.querySelector(scopeSel);
    if (!scope) return [];
    return [...scope.querySelectorAll<HTMLElement>('button, a[href], input:not([type=hidden]), select, textarea, [tabindex="0"], [role=application]')]
      // tabindex="-1" marks a roving-tabindex group (piano keys, note buttons, toolbars): one Tab stop, arrow keys inside.
      .filter((e) => e.getAttribute('tabindex') !== '-1')
      // A native radio group is one Tab stop (arrow keys move inside it): only its checked, or first, radio counts.
      .filter((e, _i, all) => {
        if (!(e instanceof HTMLInputElement) || e.type !== 'radio') return true;
        const group = all.filter((o) => o instanceof HTMLInputElement && o.type === 'radio' && o.name === e.name) as HTMLInputElement[];
        return (group.find((r) => r.checked) ?? group[0]) === e;
      })
      .filter((e) => !e.hasAttribute('disabled') && e.getAttribute('aria-disabled') !== 'true' && !e.closest('[aria-hidden="true"], [hidden], [inert]') && e.getClientRects().length > 0)
      .map((e, i) => {
        e.setAttribute('data-kbd-id', String(i));
        return `${e.tagName.toLowerCase()}[${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)}]`;
      });
  }, scopeSelector);
  expect(controls.length, `no controls found in ${scopeSelector}`).toBeGreaterThan(0);
  const bad: string[] = [];
  for (let i = 0; i < controls.length + extra; i++) {
    await page.keyboard.press('Tab');
    const ring = await focusIndicatorVisible(page);
    if (!ring.ok) bad.push(ring.what);
  }
  const missed = await page.evaluate(() => {
    const w = window as unknown as { __focused: Set<Element> };
    return [...document.querySelectorAll('[data-kbd-id]')].filter((e) => !w.__focused.has(e)).map((e) => `${e.tagName.toLowerCase()}[${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)}]`);
  });
  expect(missed, `controls the Tab key never reached (of ${controls.length})`).toEqual([]);
  expect([...new Set(bad)], 'focused elements with no visible focus indicator').toEqual([]);
}
