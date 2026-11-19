import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

export interface Found {
  where: string;
  rule: string;
  impact: string;
  help: string;
  nodes: string[];
}

/**
 * Moderate and minor findings that are knowingly left (see docs/accessibility.md, "Known issues").
 * Serious and critical findings are never allowed here.
 */
const ACCEPTED: Record<string, string> = {};

/** Runs axe on the current page state. Fails on serious and critical findings and on unaccepted moderate ones. */
export async function expectNoAxeViolations(page: Page, where: string, opts: { exclude?: string[] } = {}): Promise<void> {
  // Measure the page at rest: a banner fading in has text at part opacity, which axe
  // reports as low contrast even though the settled colours pass. Finite animations only.
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
      undefined,
      { timeout: 3000 },
    )
    .catch(() => undefined);
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const results = await builder.analyze();
  const found: Found[] = results.violations.map((v) => ({
    where,
    rule: v.id,
    impact: v.impact ?? 'unknown',
    help: v.help,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary ?? '').split('\n').slice(1, 2).join(' ').trim()}`),
  }));
  if (process.env.AXE_REPORT) appendFileSync(process.env.AXE_REPORT, found.map((f) => JSON.stringify(f)).join('\n') + (found.length ? '\n' : ''));
  if (process.env.AXE_REPORT_ONLY === '1') return;
  const blocking = found.filter((f) => f.impact === 'serious' || f.impact === 'critical' || (f.impact === 'moderate' && !(f.rule in ACCEPTED)));
  expect(blocking, `axe violations on ${where}:\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}
