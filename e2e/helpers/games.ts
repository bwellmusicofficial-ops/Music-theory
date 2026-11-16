import { expect, type Locator, type Page } from '@playwright/test';
import { pitch } from '@/engine/pitch';
import { describeStavePosition } from '@/games/note-rush/position-words';
import { waitReady } from './app';
import { tapRunOnTime } from './rhythm';

/** Clicks `step` until `done` shows (cap at `max` steps). */
export async function playUntil(done: Locator, step: () => Promise<void>, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await done.isVisible()) return;
    await step();
    await done.page().waitForTimeout(60);
  }
  await expect(done).toBeVisible();
}

export function noteLetterFromWords(words: string, clef: 'treble' | 'bass' = 'treble'): string {
  for (let pos = -8; pos <= 16; pos++) if (describeStavePosition(pos, 'uk') === words) return pitch.pitchAtStavePosition(pos, clef).letter;
  throw new Error(`cannot read a note position from "${words}"`);
}

/** Untimed Note Rush: names each note from the announcement ("Note 3 of 20, on the second line."). */
export async function playNoteRush(page: Page): Promise<void> {
  const announce = page.locator('p[role="status"][aria-live="polite"]').first();
  for (let n = 1; n <= 20; n++) {
    await expect(announce).toContainText(`Note ${n} of 20, on the`);
    const words = /Note \d+ of 20, on the (.+?)\.$/.exec((await announce.innerText()).trim())?.[1];
    expect(words, 'announcement names the position').toBeTruthy();
    await page.getByRole('group', { name: 'Note names' }).getByRole('button', { name: noteLetterFromWords(words!), exact: true }).click();
  }
}

export async function playKeyHunt(page: Page): Promise<void> {
  await playUntil(page.getByTestId('kh-final-score'), async () => {
    await page.locator('[data-testid="kh-options"] button[data-test-correct="true"]:not([disabled])').click({ timeout: 2000 });
  });
}

export async function playTermBlitz(page: Page): Promise<void> {
  await playUntil(page.getByTestId('tb-final-score'), async () => {
    await page.locator('[data-test-correct="true"]:not([disabled])').click({ timeout: 2000 });
  });
}

export async function playTapIt(page: Page): Promise<void> {
  const results = page.getByTestId('ti-final-score');
  let last = 0;
  for (let i = 0; i < 12 && !(await results.isVisible()); i++) {
    try {
      last = await tapRunOnTime(page, last);
    } catch {
      break;
    }
    await page.waitForTimeout(300);
  }
  await expect(results).toBeVisible({ timeout: 30_000 });
}

export async function openGame(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitReady(page);
}
