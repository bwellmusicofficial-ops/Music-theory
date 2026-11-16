import { expect, type Locator, type Page } from '@playwright/test';
import { answerAndExpect, feedback } from './questions';
import { currentRunId, tapRunOnTime } from './rhythm';

export interface QuestionInfo {
  type: string;
  payload: Record<string, unknown> & { correct?: string; options?: { id: string }[] };
  prompt: string;
}

export async function readQuestion(stage: Locator): Promise<QuestionInfo> {
  return JSON.parse((await stage.getAttribute('data-question-json')) ?? 'null') as QuestionInfo;
}

/** Plays a tap-rhythm question: listen first if asked, then tap every onset on time. */
export async function tapRhythmCorrectly(page: Page, root: Locator, listenFirst: boolean): Promise<void> {
  if (listenFirst) {
    await root.getByRole('button', { name: /^Listen/ }).click();
    await expect(root.getByTestId('tap-target')).toBeVisible({ timeout: 60_000 });
  }
  const before = await currentRunId(page);
  await root.getByRole('button', { name: 'Start', exact: true }).click();
  await tapRunOnTime(page, before);
}

/** Plays every clip to the end (real audio time), then picks the right option. */
export async function byEarCorrectly(root: Locator, correctIndex: number): Promise<void> {
  const clips = root.locator('ul[aria-label="Clips to listen to"] button');
  const n = await clips.count();
  for (let i = 0; i < n; i++) {
    await clips.nth(i).click();
    await expect(clips.nth(i)).toHaveAttribute('data-heard', 'true', { timeout: 60_000 });
  }
  const option = root.locator('ul[aria-label="Answer options"] > li').nth(correctIndex).locator('button');
  await expect(option).toBeEnabled();
  await option.click();
}

/**
 * Answers one question of any type correctly, the way a learner would. Resolves true when the answer
 * was given; false for a type with no scripted way to a right answer (the question is left open).
 */
export async function answerCorrectly(page: Page, root: Locator, info: QuestionInfo): Promise<boolean> {
  const { type, payload } = info;
  if (type === 'tap-rhythm') {
    await tapRhythmCorrectly(page, root, payload.listenFirst === true);
    return true;
  }
  if (type === 'by-ear') {
    await byEarCorrectly(root, payload.options!.findIndex((o) => o.id === payload.correct));
    return true;
  }
  return (await answerAndExpect(page, root, type, payload, 'correct').catch((e) => {
    throw e;
  })) === 'done';
}

export function actionBarButton(page: Page): Locator {
  return page.getByRole('button', { name: /^(Continue|Next|See result|Try again)/ }).last();
}

export { feedback };
