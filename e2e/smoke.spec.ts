import { expect, expectNoProblems, seedSettings, STATIC_ROUTES, test, waitReady, watchProblems } from './helpers/app';

for (const route of STATIC_ROUTES) {
  test(`smoke: ${route} loads cleanly`, async ({ page }, info) => {
    await seedSettings(page, {});
    const problems = watchProblems(page);
    const response = await page.goto(route);
    expect(response?.status(), 'HTTP status').toBe(200);
    await waitReady(page);
    await expect(page.locator('main').first()).toBeVisible();
    // Let late requests and hydration errors surface.
    await page.waitForTimeout(500);
    expectNoProblems(problems);
    // No horizontal scrollbar at phone width.
    if (info.project.name === 'phone') {
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll, `page is ${overflow.scroll}px wide in a ${overflow.client}px viewport`).toBeLessThanOrEqual(overflow.client);
    }
  });
}

test('smoke: unknown lesson shows the not-found page, not a crash', async ({ page }) => {
  const response = await page.goto('/lessons/does-not-exist');
  expect(response?.status()).toBe(404);
});
