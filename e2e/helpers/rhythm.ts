import { expect, type Page } from '@playwright/test';

/**
 * Taps the rhythm pad on time. The app (in dev-routes builds) publishes the audio-clock time of every
 * expected onset in `window.__rhythmRun` when a performance starts; this waits for a NEW run (after
 * `afterId`), then fires a pointer-down on the pad from inside the page as each onset comes due, so
 * there is no test-runner latency in the timing. Resolves with the run id once the last tap is sent.
 */
export async function tapRunOnTime(page: Page, afterId: number): Promise<number> {
  return page.evaluate(
    (after) =>
      new Promise<number>((resolve, reject) => {
        const w = window as unknown as { __rhythmRun?: { id: number; expected: number[]; now: () => number } };
        const started = performance.now();
        const wait = setInterval(() => {
          const run = w.__rhythmRun;
          if (performance.now() - started > 20_000) {
            clearInterval(wait);
            reject(new Error('the rhythm pad never started a run'));
            return;
          }
          if (!run || run.id <= after) return;
          clearInterval(wait);
          const pad = document.querySelector('[data-testid="tap-target"]');
          if (!pad) {
            reject(new Error('no tap pad'));
            return;
          }
          const sent = new Set<number>();
          const tapper = setInterval(() => {
            const now = run.now();
            run.expected.forEach((at, i) => {
              if (!sent.has(i) && now >= at) {
                sent.add(i);
                pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true }));
              }
            });
            if (sent.size === run.expected.length) {
              clearInterval(tapper);
              resolve(run.id);
            }
          }, 3);
        }, 5);
      }),
    afterId,
  );
}

export async function currentRunId(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __rhythmRun?: { id: number } }).__rhythmRun?.id ?? 0);
}

/** Plays every run of an auto-started pad (Tap It) until `done` is visible. */
export async function expectPadReady(page: Page): Promise<void> {
  await expect(page.getByTestId('tap-target')).toHaveAttribute('aria-disabled', 'false');
}
