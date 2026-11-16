import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from '../helpers/app';
import { allLessons } from '../helpers/content';
import { ANSWERABLE, answerAndExpect, expectQuestionRendered } from '../helpers/questions';
import { SKIPPED } from './skip-list';

/**
 * The exhaustive per-question sweep: every practice and challenge question of every lesson, rendered
 * by the dev harness (/dev/question). Generated questions are drawn with seeds 1, 2 and 3.
 */
const SEEDS = [1, 2, 3];

test.describe.configure({ mode: 'parallel' });

for (const lesson of allLessons()) {
  const questions = [...lesson.steps.practice.questions.map((q) => ({ q, step: 'practice' })), ...lesson.steps.challenge.questions.map((q) => ({ q, step: 'challenge' }))];
  for (const { q, step } of questions) {
    for (const seed of q.source === 'generated' ? SEEDS : [1]) {
      const key = `${lesson.id}/${q.id}`;
      const title = `${key} (${step}, ${q.type}${q.source === 'generated' ? `, seed ${seed}` : ''})`;
      test(title, async ({ page }) => {
        const skip = SKIPPED[`${key}#${seed}`] ?? SKIPPED[key];
        test.skip(skip !== undefined, skip);
        await seedSettings(page, {});
        const problems = watchProblems(page);
        await page.goto(`/dev/question?lesson=${lesson.id}&q=${q.id}&seed=${seed}`);
        await waitReady(page);
        const root = page.getByTestId('question-harness');
        await expect(root).toBeVisible();
        const info = JSON.parse((await root.getAttribute('data-question-json')) ?? 'null') as { type: string; payload: unknown; prompt: string; error: string | null };
        expect(info.error, 'the question could not be built').toBeNull();
        expect(info.type).toBe(q.type);

        await expectQuestionRendered(root, info.type, info.payload, info.prompt);

        if (ANSWERABLE.has(info.type)) {
          const right = await answerAndExpect(page, root, info.type, info.payload, 'correct');
          if (right === 'done') {
            await page.getByTestId('harness-reset').click();
            await expect(root.locator('[role="status"][data-kind]')).toHaveCount(0);
          }
          await answerAndExpect(page, root, info.type, info.payload, 'wrong');
        } else {
          await expectInteractive(page, root, info.type, info.payload as Record<string, unknown>);
          if (info.type === 'complete-bar') {
            // The bar can really be filled from the palette, and the filled bar is accepted.
            await page.getByTestId('harness-reset').click();
            expect(await answerAndExpect(page, root, info.type, info.payload, 'correct'), 'no combination of the palette symbols fills the bar').toBe('done');
          }
        }
        expectNoProblems(problems);
      });
    }
  }
}

/** Types that cannot be answered from the payload: the instrument is there and responds. */
async function expectInteractive(page: import('@playwright/test').Page, root: import('@playwright/test').Locator, type: string, payload: Record<string, unknown>) {
  if (type === 'tap-rhythm') {
    if (payload.listenFirst) {
      const listen = root.getByRole('button', { name: /^Listen/ });
      await expect(listen).toBeEnabled();
      await expect(root.getByTestId('tap-target')).toHaveCount(0);
      return;
    }
    const pad = root.getByTestId('tap-target');
    await expect(pad).toBeVisible();
    await expect(pad).toHaveAttribute('aria-disabled', 'true');
    await root.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(pad).toHaveAttribute('aria-disabled', 'false');
    // A pointer-down on the pad is read as a tap: the pad pulses for a moment.
    await pad.evaluate((el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true })));
    await expect(pad, 'the tap pad did not react to a tap').toHaveAttribute('data-pulsing', 'true', { timeout: 1000 });
    return;
  }
  if (type === 'complete-bar') {
    const palette = root.locator('.mtn-stave__palette button, [role="toolbar"] button').first();
    await expect(palette, 'the palette has no buttons').toBeVisible();
    const check = root.getByRole('button', { name: 'Check', exact: true });
    await expect(check).toBeDisabled();
    // A palette of rests only needs the Rest tool chosen first.
    if ((payload.palette as { kind: string }[]).every((g) => g.kind === 'rest')) await root.getByRole('button', { name: 'Rest', exact: true }).click();
    await tapStave(root);
    await expect(check, 'tapping the stave did not place a note').toBeEnabled();
    return;
  }
  if (type === 'note-on-stave') {
    const check = root.getByRole('button', { name: 'Check', exact: true });
    await expect(check).toBeDisabled();
    await tapStave(root);
    await expect(check, 'tapping the stave did not place a note').toBeEnabled();
    return;
  }
  if (type === 'by-ear') {
    await expect(root.locator('ul[aria-label="Clips to listen to"] button').first()).toBeEnabled();
    await expect(root.locator('ul[aria-label="Answer options"] button').first()).toBeDisabled();
    return;
  }
  void page;
}

/** Taps the editable zone of the stave near its right-hand end (past any notes that are given), at the middle line's height. */
async function tapStave(root: import('@playwright/test').Locator) {
  const zone = root.locator('.mtn-stave__zone').last();
  await expect(zone, 'the editable zone of the stave is missing').toBeVisible();
  const z = (await zone.boundingBox())!;
  const surface = (await root.getByTestId('stave-surface').boundingBox())!;
  await root.getByTestId('stave-surface').click({ position: { x: z.x - surface.x + z.width - 12, y: z.y - surface.y + z.height / 2 } });
}
