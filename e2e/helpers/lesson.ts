import { expect, type Locator, type Page } from '@playwright/test';
import type { Exhibit, LessonJson } from './content';
import { expectKeyboardDrawn, expectNotationDrawn } from './notation';
import { expectQuestionRendered } from './questions';

/** The screen must not be the developer error card, and must not be empty. */
export async function expectNoErrorCard(page: Page): Promise<void> {
  await expect(page.getByTestId('question-error'), 'the developer error card is showing').toHaveCount(0);
  await expect(page.getByText('Developer error')).toHaveCount(0);
  await expect(page.getByText('This example is not a valid passage')).toHaveCount(0);
  await expect(page.getByText('Notation preview unavailable')).toHaveCount(0);
}

export function screen(page: Page): Locator {
  return page.getByTestId('lesson-player');
}

export async function expectStep(page: Page, label: string | RegExp): Promise<void> {
  await expect(page.getByTestId('eyebrow')).toContainText(label);
  await expectNoErrorCard(page);
}

/** Every exhibit the content puts on this screen has been drawn: passages as notation, keyboards with keys. */
export async function expectExhibitsDrawn(scope: Locator, exhibits: (Exhibit | undefined)[]): Promise<void> {
  const real = exhibits.filter((e): e is Exhibit => e !== undefined);
  const passages = real.filter((e) => e.kind === 'passage').length;
  const keyboards = real.filter((e) => e.kind === 'keyboard').length;
  const clips = real.filter((e) => e.kind === 'audioClip').length;
  if (passages > 0) {
    const boxes = scope.locator('[data-exhibit="passage"]');
    await expect(boxes, 'passage exhibits on screen').toHaveCount(passages);
    await expectNotationDrawn(scope, passages);
    for (let i = 0; i < passages; i++) await expectNotationDrawn(boxes.nth(i));
  }
  if (keyboards > 0) {
    const boxes = scope.locator('[data-exhibit="keyboard"]');
    await expect(boxes, 'keyboard exhibits on screen').toHaveCount(keyboards);
    for (let i = 0; i < keyboards; i++) await expectKeyboardDrawn(boxes.nth(i));
  }
  if (clips > 0) await expect(scope.locator('[data-exhibit="audioClip"]')).toHaveCount(clips);
}

/** Does what the explore step asks, so Continue unlocks. */
export async function exploreInteract(page: Page, lesson: LessonJson): Promise<void> {
  const step = lesson.steps.explore;
  const main = screen(page);
  const keyboardExhibit = step.exhibit?.kind === 'keyboard';
  if (step.instrument === 'keyboard') {
    const keys = main.getByRole('group', { name: 'Piano keyboard to explore' });
    await expectKeyboardDrawn(keys);
    await keys.locator('button[data-midi]').nth(2).click();
  } else if (step.instrument === 'rhythm-pad') {
    const pad = main.getByTestId('tap-target');
    await expect(pad).toBeVisible();
    await main.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(pad).toHaveAttribute('aria-disabled', 'false');
    await pad.click();
  } else if (step.exhibit && !keyboardExhibit) {
    await main.getByRole('button', { name: /^Play/ }).first().click();
  } else if (keyboardExhibit) {
    await main.locator('[data-exhibit="keyboard"] button[data-midi]').nth(2).click();
  }
}

/** What the explore step should have drawn, as a list of exhibits. */
export function exploreExhibits(lesson: LessonJson): (Exhibit | undefined)[] {
  const step = lesson.steps.explore;
  // A keyboard instrument draws its keyboard itself (not as an exhibit box); a pulse-dots pad draws no stave.
  if (step.instrument === 'keyboard') return step.exhibit && step.exhibit.kind !== 'keyboard' ? [step.exhibit] : [];
  if (step.instrument === 'rhythm-pad' && step.showNotation === false) return [];
  return [step.exhibit];
}

/** Hook, explore, name (all cards and the other explanation), then the first practice question. */
export async function walkToFirstQuestion(page: Page, lesson: LessonJson): Promise<void> {
  const main = screen(page);
  await expect(page.getByTestId('player-loading')).toHaveCount(0);

  // Hook
  await expectStep(page, 'Hook');
  await expectExhibitsDrawn(main, [lesson.steps.hook.exhibit]);
  await main.getByRole('button', { name: 'Continue', exact: true }).click();

  // Explore
  await expectStep(page, 'Explore');
  const next = main.getByRole('button', { name: 'Continue', exact: true });
  await expect(next, 'Continue should wait for the explore goal').toBeDisabled();
  await expectExhibitsDrawn(main, exploreExhibits(lesson));
  if (lesson.steps.explore.instrument === 'keyboard') await expectKeyboardDrawn(main.getByRole('group', { name: 'Piano keyboard to explore' }));
  await exploreInteract(page, lesson);
  await expect(next, 'Continue never became available after the explore interaction').toBeEnabled();
  await next.click();

  // Name it: every card, then the other explanation on the first card
  const cards = lesson.steps.name.cards;
  for (let i = 0; i < cards.length; i++) {
    await expectStep(page, `Name it ${i + 1} of ${cards.length}`);
    await expect(main.getByTestId('name-card')).toBeVisible();
    await expectExhibitsDrawn(main, [cards[i].exhibit]);
    if (i === 0) {
      await main.getByRole('button', { name: 'Explain it another way' }).click();
      await expect(main.getByTestId('name-alternative')).toBeVisible();
      await expectExhibitsDrawn(main, [cards[i].exhibit, lesson.steps.name.alternative.exhibit]);
    }
    await main.getByRole('button', { name: 'Continue', exact: true }).click();
  }

  // First practice question
  await expectStep(page, /^Practice 1 of /);
  const stage = page.getByTestId('question-stage');
  await expect(stage).toBeVisible();
  const info = JSON.parse((await stage.getAttribute('data-question-json')) ?? 'null') as { type: string; payload: Record<string, unknown>; prompt: string };
  await expectQuestionRendered(stage, info.type, info.payload, info.prompt);
}
