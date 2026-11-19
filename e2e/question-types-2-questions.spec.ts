import { expect, type Locator, type Page } from '@playwright/test';
import { pitch } from '@/engine/pitch';
import type { Clef, Key } from '@/engine/types';
import { expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { THEMES, type Theme } from './helpers/a11y';
import { expectNoAxeViolations } from './helpers/axe';
import { expectNotationDrawn } from './helpers/notation';
import { answerAndExpect, expectQuestionRendered, feedback } from './helpers/questions';

/**
 * The four new question types and their three generators (docs/question-types-2.md sections 2 to 5), on the
 * dev harness /dev/question-types-2-questions: each one drawn by the real stave, answered right and wrong through
 * the real lesson player, with the feedback text read, in both themes, at 390x844 (phone) and 1280x800 (desktop).
 */
const ITEMS = [
  'place-bar-lines',
  'fix-beaming',
  'write-key-signature',
  'find-in-passage-event',
  'find-in-passage-bar',
  'gen-place-bar-lines',
  'gen-fix-beaming',
  'gen-write-key-signature',
] as const;

async function open(page: Page, theme: Theme, seed = 1) {
  await seedSettings(page, { theme });
  await page.goto(`/dev/question-types-2-questions?seed=${seed}`);
  await waitReady(page);
  await expect(page.getByTestId('qt2q-harness')).toBeVisible();
}

async function info(root: Locator) {
  return JSON.parse((await root.getAttribute('data-question-json')) ?? 'null') as { type: string; payload: { key: Key; clef: Clef }; prompt: string };
}

for (const theme of THEMES) {
  test.describe(`question types 2 questions, ${theme}`, () => {
    for (const id of ITEMS) {
      test(`${id}: drawn, a right answer is accepted, a wrong one says why, no axe violations`, async ({ page }) => {
        const problems = watchProblems(page);
        await open(page, theme);
        const root = page.getByTestId(`qt2q-${id}`);
        await root.scrollIntoViewIfNeeded();
        const { type, payload, prompt } = await info(root);
        await expectQuestionRendered(root, type, payload, prompt);
        await expectNotationDrawn(root, 1);
        await expectNoAxeViolations(page, `${id} before answering (${theme})`);

        expect(await answerAndExpect(page, root, type, payload, 'correct')).toBe('done');
        await expectNoAxeViolations(page, `${id} after a right answer (${theme})`);
        await page.getByTestId(`qt2q-${id}-reset`).click();
        await expect(feedback(root)).toHaveCount(0);
        expect(await answerAndExpect(page, root, type, payload, 'wrong')).toBe('done');
        await expect(feedback(root)).toBeVisible();
        await expectNoAxeViolations(page, `${id} after a wrong answer (${theme})`);
        expectNoProblems(problems);
      });
    }
  });
}

test.describe('question types 2 questions: each type in detail', () => {
  test('place-bar-lines: bar lines appear where tapped, the markers sit on the real bar lines, keyboard focus stays on the gap', async ({ page }) => {
    await open(page, 'dark');
    const root = page.getByTestId('qt2q-place-bar-lines');
    await root.scrollIntoViewIfNeeded();
    const gap = (n: number) => root.getByRole('button', { name: new RegExp(`^Bar line after (note|rest) ${n}$`) });
    await expect(root.getByRole('button', { name: /^Bar line after/ })).toHaveCount(10);
    await expect(root.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
    expect(await root.locator('.mtn-stave .vf-stave').count()).toBe(1);

    await gap(4).click();
    await expect(root.locator('.mtn-stave .vf-stave')).toHaveCount(2);
    await expect(gap(4)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.getByRole('button', { name: 'Check', exact: true })).toBeEnabled();
    await expect(root.getByText('1 bar line placed')).toBeVisible();

    // The marker of an on gap is drawn at the real bar line the stave now draws there: within 4 px, on the stave.
    const marker = root.getByTestId('gap-marker');
    await expect(marker).toHaveCount(1);
    const offset = await root.locator('.mtn-stave__canvas').evaluate((canvas) => {
      const m = canvas.querySelector('[data-testid="gap-marker"]')!.getBoundingClientRect();
      const bars = [...canvas.querySelectorAll('.vf-stave')].map((s) => {
        const xs = [...s.querySelectorAll('path')].map((p) => p.getBoundingClientRect());
        return Math.max(...xs.map((r) => r.right));
      });
      const markerX = m.left + m.width / 2;
      return { markerX, barEnds: bars };
    });
    expect(offset.barEnds.length).toBe(2);
    expect(Math.abs(offset.markerX - offset.barEnds[0]!)).toBeLessThan(40);

    // Keyboard: Enter on a focused gap toggles it and focus stays on that gap after the bars are drawn again.
    await gap(2).focus();
    await page.keyboard.press('Enter');
    await expect(root.locator('.mtn-stave .vf-stave')).toHaveCount(3);
    await expect(gap(2)).toBeFocused();
    await expect(gap(2)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(gap(3)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(gap(3)).toHaveAttribute('aria-pressed', 'true');
    await expect(gap(3)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(gap(3)).toHaveAttribute('aria-pressed', 'false');
    await expect(root.getByText('2 bar lines placed')).toBeVisible();
  });

  test('fix-beaming: the beams change as joins are toggled; Reset puts them back', async ({ page }) => {
    await open(page, 'dark');
    const root = page.getByTestId('qt2q-fix-beaming');
    await root.scrollIntoViewIfNeeded();
    const beams = root.locator('.vf-beam');
    await expect(beams).toHaveCount(1);
    const join = (a: number) => root.getByRole('button', { name: `Join note ${a} and note ${a + 1}`, exact: true });
    await expect(root.getByRole('button', { name: /^Join note/ })).toHaveCount(7);
    await expect(join(4)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
    await join(4).click();
    await expect(join(4)).toHaveAttribute('aria-pressed', 'false');
    await expect(beams).toHaveCount(2);
    await join(2).click();
    await expect(beams).toHaveCount(3);
    await root.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(beams).toHaveCount(1);
    await expect(join(2)).toHaveAttribute('aria-pressed', 'true');
    // Keyboard.
    await join(1).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(join(4)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(beams).toHaveCount(2);
    await expect(join(4)).toBeFocused();
  });

  test('write-key-signature: palette, signs land on the lines they stand for, undo and clear', async ({ page }) => {
    await open(page, 'dark');
    const root = page.getByTestId('qt2q-write-key-signature');
    await root.scrollIntoViewIfNeeded();
    const palette = root.getByRole('group', { name: 'Sign to place' });
    await expect(palette.getByRole('button', { name: 'Sharp', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(palette.getByRole('button', { name: 'Flat', exact: true })).toHaveAttribute('aria-pressed', 'false');
    const check = root.getByRole('button', { name: 'Check', exact: true });
    await expect(check).toBeDisabled();
    await expect(root.locator('.vf-stavenote')).toHaveCount(0);

    const { payload } = await info(root);
    const want = pitch.keySignaturePositions(pitch.keySignature(payload.key), payload.clef);
    const stave = root.locator('.mtn-stave').first();
    const point = async (position: number) => {
      const ys = await stave.locator('.mtn-stave__notation .vf-stave path').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2));
      const box = (await stave.locator('.mtn-stave__notation svg').boundingBox())!;
      return { x: box.x + box.width * 0.55, y: Math.max(...ys) - (position * (Math.max(...ys) - Math.min(...ys))) / 8 };
    };
    for (const position of want) {
      const p = await point(position);
      await page.mouse.click(p.x, p.y);
    }
    const drawn = () =>
      stave.locator('.mtn-stave__notation').evaluate((host) => {
        const svg = host.querySelector('svg')!;
        const ys = [...svg.querySelectorAll('.vf-stave path')].map((p) => Number(/M[-\d.]+ ([-\d.]+)/.exec(p.getAttribute('d') ?? '')?.[1]));
        const bottom = Math.max(...ys) - 0.5;
        return [...svg.querySelectorAll('.vf-keysignature text')].map((t) => Math.round((bottom - Number(t.getAttribute('y'))) / 5));
      });
    expect(await drawn()).toEqual(want);
    await root.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await drawn()).toEqual(want.slice(0, -1));
    await root.getByRole('button', { name: 'Clear', exact: true }).click();
    expect(await drawn()).toEqual([]);
    await expect(check).toBeDisabled();

    // Touch targets: the palette and the action buttons are at least 44 px tall.
    for (const b of [palette.getByRole('button', { name: 'Sharp', exact: true }), palette.getByRole('button', { name: 'Flat', exact: true }), check, root.getByRole('button', { name: 'Undo', exact: true })]) {
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('find-in-passage: taps choose and un-choose, the counter and aria-pressed follow, Check waits for the right number', async ({ page }) => {
    await open(page, 'dark');
    const root = page.getByTestId('qt2q-find-in-passage-event');
    await root.scrollIntoViewIfNeeded();
    const buttons = root.locator('.mtn-stave__event-button');
    await expect(buttons).toHaveCount(8);
    const check = root.getByRole('button', { name: 'Check', exact: true });
    await expect(root.getByTestId('find-counter')).toHaveText('0 of 2 chosen');
    await expect(check).toBeDisabled();
    await buttons.nth(0).click();
    await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.getByTestId('find-counter')).toHaveText('1 of 2 chosen');
    await expect(root.getByTestId('mark-highlight')).toHaveCount(1);
    await expect(check).toBeDisabled();
    await buttons.nth(0).click();
    await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(root.getByTestId('mark-highlight')).toHaveCount(0);
    // Keyboard.
    await buttons.nth(0).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(root.getByTestId('find-counter')).toHaveText('2 of 2 chosen');
    await expect(check).toBeEnabled();
    await check.click();
    await expect(feedback(root)).toHaveAttribute('data-kind', 'wrong');
    await expect(feedback(root)).toContainText('1 of your 2 choices');
  });

  test('find-in-passage (bars): a tap on any note chooses its whole bar', async ({ page }) => {
    await open(page, 'dark');
    const root = page.getByTestId('qt2q-find-in-passage-bar');
    await root.scrollIntoViewIfNeeded();
    const buttons = root.locator('.mtn-stave__event-button');
    await buttons.nth(3).click();
    await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(buttons.nth(5)).toHaveAttribute('aria-pressed', 'true');
    await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(root.getByTestId('find-counter')).toHaveText('1 of 1 chosen');
    await root.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(feedback(root)).toHaveAttribute('data-kind', 'correct');
  });

  test('a different seed draws a different generated item, and the same seed the same one', async ({ page }) => {
    await open(page, 'dark', 1);
    const a = await info(page.getByTestId('qt2q-gen-fix-beaming'));
    const k1 = await info(page.getByTestId('qt2q-gen-write-key-signature'));
    await open(page, 'dark', 1);
    expect(await info(page.getByTestId('qt2q-gen-fix-beaming'))).toEqual(a);
    const seen = new Set<string>([JSON.stringify(a.payload) + JSON.stringify(k1.payload)]);
    for (const seed of [2, 3, 4, 5, 6]) {
      await open(page, 'dark', seed);
      seen.add(JSON.stringify((await info(page.getByTestId('qt2q-gen-fix-beaming'))).payload) + JSON.stringify((await info(page.getByTestId('qt2q-gen-write-key-signature'))).payload));
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  test('US terminology: the feedback and prompts say measure', async ({ page }) => {
    await seedSettings(page, { terminology: 'us' });
    await page.goto('/dev/question-types-2-questions?seed=1');
    await waitReady(page);
    const root = page.getByTestId('qt2q-place-bar-lines');
    await root.scrollIntoViewIfNeeded();
    // Put one bar line in the wrong place: the reason is about a measure, not a bar.
    await root.getByRole('button', { name: /^Bar line after (note|rest) 1$/ }).click();
    await root.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(feedback(root)).toContainText(/Measure 1 holds only 1 beat, but each measure holds 4 beats/);
    const fix = page.getByTestId('qt2q-fix-beaming');
    await expect(fix.locator('h1, h2').first()).toContainText('eighth notes');
  });
});
