import type { Page } from '@playwright/test';
import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { expectQuestionRendered, plan } from './helpers/questions';

/**
 * Item 5: Grade 1 mock test. Run one answers every question it can from the generated paper (read from
 * window.__mockPaper, published only in dev-routes builds), checks each exhibit is drawn, leaves the
 * screen and comes back to see answers restored, flags a question, finishes, and checks the score,
 * band, section breakdown and the review. Run two answers nothing.
 */
interface PaperQuestion {
  index: number;
  id: string;
  sectionId: string;
  type: string;
  payload: Record<string, unknown>;
  prompt: string;
}
interface Paper {
  questions: PaperQuestion[];
  sections: { id: string; title: string; indices: number[] }[];
}

async function start(page: Page): Promise<Paper> {
  await page.goto('/mock/grade-1');
  await waitReady(page);
  await page.getByRole('button', { name: 'Start the test' }).click();
  await expect(page.getByTestId('position')).toContainText('Question 1 of');
  return page.evaluate(() => (window as unknown as { __mockPaper: Paper }).__mockPaper);
}

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Finish test', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finish test', exact: true }).click();
  await expect(page.getByTestId('mock-results')).toBeVisible();
}

test('mock test: answer the paper, restore answers, flag, finish, review', async ({ page }) => {
  test.setTimeout(240_000);
  await seedSettings(page, {});
  const problems = watchProblems(page);
  const paper = await start(page);
  const n = paper.questions.length;
  expect(n).toBeGreaterThan(20);
  const panel = page.getByTestId('question-panels');

  let expected = 0;
  const answered = new Map<number, number>();
  for (const q of paper.questions) {
    await expect(page.getByTestId('position')).toHaveText(`Question ${q.index + 1} of ${n}`);
    await expect(page.locator(`[data-question-index="${q.index}"]`)).toBeVisible();
    await expectQuestionRendered(panel, q.type, q.payload, q.prompt);
    const p = plan(q.type, q.payload, 'correct');
    if (p) {
      await p.perform(page, panel);
      expected += p.mark.score;
      answered.set(q.index, p.mark.score);
      await expect(page.getByTestId('answer-status')).toContainText('Answer saved');
    }
    if (q.index < n - 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  expect(answered.size, 'most of the paper can be answered from its payload').toBeGreaterThan(n * 0.8);

  // Navigate away and back: the navigator knows what is answered, and the question shows the answer.
  await page.getByRole('button', { name: /^Question list/ }).click();
  const nav = page.getByTestId('navigator');
  for (const [index] of answered) await expect(nav.locator('button').nth(index)).toHaveAttribute('data-answered', 'true');
  const mcIndex = paper.questions.find((q) => q.type === 'multiple-choice' && answered.has(q.index))!.index;
  await nav.locator('button').nth(mcIndex).click();
  await expect(page.getByTestId('position')).toHaveText(`Question ${mcIndex + 1} of ${n}`);
  await expect(page.locator('ul[aria-label="Answer options"] button[aria-pressed="true"]'), 'the earlier answer is restored').toHaveCount(1);

  // Flag one.
  const flag = page.getByRole('button', { name: 'Flag for review' });
  await flag.click();
  await expect(flag).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Question list/ }).click();
  await expect(page.getByTestId('navigator').locator('button').nth(mcIndex)).toHaveAttribute('data-flagged', 'true');

  await finish(page);
  const shown = /([\d.]+) out of ([\d.]+)/.exec((await page.getByTestId('score').innerText()) ?? '')!;
  expect(Number(shown[1]), 'score matches the marks of the answers given').toBeCloseTo(expected, 1);
  const fraction = Number(shown[1]) / Number(shown[2]);
  const band = (await page.getByTestId('band').innerText()).toLowerCase();
  const wanted = fraction >= 0.9 ? 'distinction' : fraction >= 0.8 ? 'merit' : fraction >= 0.66 ? 'pass' : 'not';
  expect(band).toContain(wanted);
  for (const s of paper.sections) {
    const row = page.getByTestId(`section-${s.id}`);
    await expect(row).toContainText(s.title);
    const points = s.indices.reduce((sum, i) => sum + (answered.get(i) ?? 0), 0);
    await expect(row).toContainText(`${points} of`);
  }
  const reviewButtons = page.getByTestId('review-list').locator('button');
  await expect(reviewButtons).toHaveCount(n);
  await reviewButtons.nth(mcIndex).click();
  // The review shows the learner's own answer, marked.
  await expect(page.locator('ul[aria-label="Answer options"] button[data-state="right"]')).toHaveCount(1);
  await expect(page.locator('ul[aria-label="Answer options"] button[data-state="right"]')).toContainText('Correct answer');
  await page.getByRole('button', { name: 'Back to results' }).click();
  await expect(page.getByTestId('mock-results')).toBeVisible();
  expectNoProblems(problems);
});

test('mock test: answering nothing scores 0 and points at the weakest skills', async ({ page }) => {
  await seedSettings(page, {});
  const problems = watchProblems(page);
  const paper = await start(page);
  await finish(page);
  await expect(page.getByTestId('score')).toContainText(/^0 out of/);
  await expect(page.getByTestId('percent')).toHaveText('0%');
  await expect(page.getByTestId('band')).toContainText(/not yet/i);
  for (const s of paper.sections) await expect(page.getByTestId(`section-${s.id}`)).toContainText('0 of');
  const weakest = page.getByTestId('weakest');
  await expect(weakest.locator('li').first()).toBeVisible();
  const links = weakest.getByRole('link', { name: /^Lesson:/ });
  expect(await links.count(), 'weakest skills link to lessons').toBeGreaterThan(0);
  const href = await links.first().getAttribute('href');
  expect(href).toMatch(/^\/lessons\//);
  await page.getByTestId('review-list').locator('button').first().click();
  await expect(page.getByText('Not answered').first()).toBeVisible();
  expectNoProblems(problems);
});
