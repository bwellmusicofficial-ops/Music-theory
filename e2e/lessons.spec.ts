import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { allLessons, SAMPLE_LESSON_IDS } from './helpers/content';
import { expectNoErrorCard, expectStep, walkToFirstQuestion } from './helpers/lesson';

/**
 * Every lesson, generated from the content folder so a new lesson is covered the day it is added.
 * Everyday run: all lessons open on the Hook with their exhibit drawn, and a sample of six is walked
 * to the first practice question. E2E_FULL=1 (npm run e2e:sweep) walks all of them.
 */
const FULL = process.env.E2E_FULL === '1';

for (const lesson of allLessons()) {
  test(`lesson opens: ${lesson.id}`, async ({ page }) => {
    await seedSettings(page, {});
    const problems = watchProblems(page);
    await page.goto(`/lessons/${lesson.id}`);
    await waitReady(page);
    await expectStep(page, 'Hook');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson.title);
    await expectNoErrorCard(page);
    const { expectExhibitsDrawn, screen } = await import('./helpers/lesson');
    await expectExhibitsDrawn(screen(page), [lesson.steps.hook.exhibit]);
    expectNoProblems(problems);
  });

  if (FULL || SAMPLE_LESSON_IDS.includes(lesson.id)) {
    test(`lesson walk: ${lesson.id}`, async ({ page }) => {
      await seedSettings(page, {});
      const problems = watchProblems(page);
      await page.goto(`/lessons/${lesson.id}`);
      await waitReady(page);
      await walkToFirstQuestion(page, lesson);
      expectNoProblems(problems);
    });
  }
}
