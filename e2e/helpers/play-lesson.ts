import type { Page } from '@playwright/test';
import { expect, waitReady } from './app';
import { EXEMPLAR, lesson } from './content';
import { screen, walkToFirstQuestion } from './lesson';
import { actionBarButton, answerCorrectly, readQuestion } from './play';

/** The first practice question's answer-and-continue loop, shared by the "play it all" helper below. */
async function answerPractice(page: Page, count: number) {
  const stage = page.getByTestId('question-stage');
  for (let i = 0; i < count; i++) {
    await expect(page.getByTestId('eyebrow')).toContainText(`Practice ${i + 1} of ${count}`);
    const info = await readQuestion(stage);
    expect(await answerCorrectly(page, stage, info), `scripted answer for ${info.type}`).toBe(true);
    await expect(page.locator('[role="status"][data-kind]')).toBeVisible();
    await actionBarButton(page).click();
  }
}

/** Opens the exemplar lesson and plays it to the end, answering every question from its payload. Lands on `/`. */
export async function playExemplarToEnd(page: Page): Promise<void> {
  const def = lesson(EXEMPLAR);
  await page.goto(`/lessons/${EXEMPLAR}`);
  await waitReady(page);
  await walkToFirstQuestion(page, def);
  const stage = page.getByTestId('question-stage');
  const main = screen(page);
  await answerPractice(page, def.steps.practice.questions.length);

  await expect(page.getByTestId('eyebrow')).toHaveText('Challenge');
  await main.getByRole('button', { name: /^Start/ }).click();
  const total = def.steps.challenge.count ?? 8;
  for (let i = 0; i < total; i++) {
    await expect(page.getByTestId('eyebrow')).toContainText(`Challenge ${i + 1} of ${total}`);
    await answerCorrectly(page, stage, await readQuestion(stage));
    await expect(page.locator('[role="status"][data-kind]')).toBeVisible();
    await actionBarButton(page).click();
  }
  await main.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.getByTestId('eyebrow')).toHaveText('Recap');
  await main.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page).toHaveURL('/');
}

/** Opens the exemplar lesson and goes as far as its first question: a few saves of progress, no more. */
export async function startExemplar(page: Page): Promise<void> {
  await page.goto(`/lessons/${EXEMPLAR}`);
  await waitReady(page);
  await walkToFirstQuestion(page, lesson(EXEMPLAR));
}
