import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { EXEMPLAR, lesson } from './helpers/content';
import { screen, walkToFirstQuestion } from './helpers/lesson';
import { actionBarButton, answerCorrectly, readQuestion } from './helpers/play';

/**
 * Item 4: the reviewed exemplar played to the end on the phone project. Tap-rhythm questions are
 * tapped on time from the count-in (the app publishes the onset times in dev-routes builds), the
 * clips are listened to, every other question is answered from its payload. Then the lesson must show
 * as complete on /learn and on the dashboard, and still after a reload.
 */
test('the exemplar lesson is played to the end and shows as complete everywhere', async ({ page }) => {
  test.setTimeout(240_000);
  const def = lesson(EXEMPLAR);
  await seedSettings(page, {});
  const problems = watchProblems(page);
  await page.goto(`/lessons/${EXEMPLAR}`);
  await waitReady(page);
  await walkToFirstQuestion(page, def);

  const stage = page.getByTestId('question-stage');
  const main = screen(page);

  // Practice: four questions. A wrong first try earns a hint and one more go.
  for (let i = 0; i < def.steps.practice.questions.length; i++) {
    await expect(page.getByTestId('eyebrow')).toContainText(`Practice ${i + 1} of ${def.steps.practice.questions.length}`);
    const info = await readQuestion(stage);
    const answered = await answerCorrectly(page, stage, info);
    expect(answered, `scripted answer for ${info.type}`).toBe(true);
    await expect(page.locator('[role="status"][data-kind]')).toBeVisible();
    await actionBarButton(page).click();
  }

  // Challenge
  await expect(page.getByTestId('eyebrow')).toHaveText('Challenge');
  await expect(page.getByTestId('challenge-rules')).toBeVisible();
  await main.getByRole('button', { name: /^Start/ }).click();
  const total = def.steps.challenge.count ?? 8; // the schema default
  for (let i = 0; i < total; i++) {
    await expect(page.getByTestId('eyebrow')).toContainText(`Challenge ${i + 1} of ${total}`);
    const info = await readQuestion(stage);
    await answerCorrectly(page, stage, info);
    await expect(page.locator('[role="status"][data-kind]')).toBeVisible();
    await actionBarButton(page).click();
  }
  await expect(page.getByTestId('verdict')).toHaveText(/passed|complete/i);
  await expect(page.getByTestId('score')).toBeVisible();
  await main.getByRole('button', { name: /^Continue/ }).click();

  // Recap and Finish
  await expect(page.getByTestId('eyebrow')).toHaveText('Recap');
  await expect(page.getByTestId('recap-points').locator('li').first()).toBeVisible();
  await main.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page).toHaveURL('/');

  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await page.goto('/learn');
    await waitReady(page);
    await expect(page.getByRole('link', { name: /Crotchets and minims.*complete/i }).first()).toBeVisible();
    await page.goto('/');
    await waitReady(page);
    await expect(page.getByText(/Crotchets and minims/).first()).toBeVisible();
    await expect(page.getByRole('main')).toContainText(/Crotchets and minims\s*Complete/);
  }
  expectNoProblems(problems);
});
