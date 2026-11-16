import { expect, seedSettings, test, waitReady, STATIC_ROUTES } from './helpers/app';
import { LESSON_STEPS, oneQuestionPerType, openLessonAt, THEMES } from './helpers/a11y';
import { expectNoAxeViolations } from './helpers/axe';
import { playKeyHunt, playNoteRush, playTapIt, playTermBlitz } from './helpers/games';
import { screen } from './helpers/lesson';

/**
 * Item 9: axe-core (WCAG 2.0/2.1/2.2 A and AA plus best practice) on every route, every lesson step, one
 * question of each type, the mock test and the games, in dark and light. Serious and critical findings
 * fail the run; so do moderate ones unless listed in helpers/axe.ts with a reason.
 */
test.describe.configure({ mode: 'parallel' });

for (const theme of THEMES) {
  test.describe(`axe, ${theme}`, () => {
    for (const route of STATIC_ROUTES) {
      test(`route ${route}`, async ({ page }) => {
        await seedSettings(page, { theme });
        await page.goto(route);
        await waitReady(page);
        await expectNoAxeViolations(page, `${route} (${theme})`);
      });
    }

    test('a lesson page and a unit page at the lesson list', async ({ page }) => {
      await seedSettings(page, { theme });
      await page.goto('/lessons');
      await waitReady(page);
      await expectNoAxeViolations(page, `/lessons (${theme})`);
    });

    for (const step of LESSON_STEPS) {
      test(`lesson step: ${step}`, async ({ page }) => {
        await openLessonAt(page, step, theme);
        await waitReady(page);
        await expectNoAxeViolations(page, `lesson ${step} (${theme})`);
      });
    }

    test('lesson: challenge question and practice feedback', async ({ page }) => {
      await openLessonAt(page, 'challenge', theme);
      await screen(page).getByRole('button', { name: /^Start/ }).click();
      await expect(page.getByTestId('eyebrow')).toContainText('Challenge 1 of');
      await expectNoAxeViolations(page, `lesson challenge question (${theme})`);
    });

    for (const { lesson, question, type } of oneQuestionPerType()) {
      test(`question type: ${type}`, async ({ page }) => {
        await seedSettings(page, { theme });
        await page.goto(`/dev/question?lesson=${lesson}&q=${question.id}&seed=1`);
        await waitReady(page);
        await expect(page.getByTestId('question-harness')).toBeVisible();
        await expectNoAxeViolations(page, `question ${type} ${lesson}/${question.id} (${theme})`, { exclude: ['[data-testid="harness-reset"]'] });
      });
    }

    test('mock test: start, question, navigator, results', async ({ page }) => {
      await seedSettings(page, { theme });
      await page.goto('/mock/grade-1');
      await waitReady(page);
      await expectNoAxeViolations(page, `mock start (${theme})`);
      await page.getByRole('button', { name: 'Start the test' }).click();
      await expect(page.getByTestId('position')).toContainText('Question 1 of');
      await expectNoAxeViolations(page, `mock question (${theme})`);
      await page.getByRole('button', { name: /^Question list/ }).click();
      await expect(page.getByTestId('navigator')).toBeVisible();
      await expectNoAxeViolations(page, `mock navigator (${theme})`);
      await page.getByRole('button', { name: 'Finish test', exact: true }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoAxeViolations(page, `mock finish dialog (${theme})`);
      await page.getByRole('dialog').getByRole('button', { name: 'Finish test', exact: true }).click();
      await expect(page.getByTestId('mock-results')).toBeVisible();
      await expectNoAxeViolations(page, `mock results (${theme})`);
    });

    for (const game of [
      { name: 'Note Rush', path: '/games/note-rush', play: playNoteRush, results: 'nr-final-score', untimed: true },
      { name: 'Key Hunt', path: '/games/key-hunt', play: playKeyHunt, results: 'kh-final-score', untimed: true },
      { name: 'Term Blitz', path: '/games/term-blitz', play: playTermBlitz, results: 'tb-final-score', untimed: true },
      { name: 'Tap It', path: '/games/tap-it?e2eSeconds=8', play: playTapIt, results: 'ti-final-score', untimed: false },
    ]) {
      test(`game ${game.name}: start, play, results`, async ({ page }) => {
        test.setTimeout(120_000);
        await seedSettings(page, { theme, untimed: game.untimed });
        await page.goto(game.path);
        await waitReady(page);
        await expectNoAxeViolations(page, `${game.name} start (${theme})`);
        await page.getByRole('button', { name: 'Start', exact: true }).click();
        await page.waitForTimeout(400);
        await expectNoAxeViolations(page, `${game.name} play (${theme})`);
        await game.play(page);
        await expect(page.getByTestId(game.results)).toBeVisible();
        await expectNoAxeViolations(page, `${game.name} results (${theme})`);
      });
    }
  });
}
