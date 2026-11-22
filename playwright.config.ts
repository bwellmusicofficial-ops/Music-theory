import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3217);
const chromePath = process.env.PW_CHROME_PATH;

/** Use the system Chrome when PW_CHROME_PATH is set (offline sandboxes); Playwright's Chromium otherwise (CI). */
const launchOptions = chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    {
      name: 'phone',
      testIgnore: /sweep\/|\.desktop\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        launchOptions,
      },
    },
    {
      name: 'desktop',
      testIgnore: /sweep\/|\.phone\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      name: 'sweep',
      testMatch: /sweep\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: 'dark', launchOptions },
    },
  ],
  webServer: {
    // CI builds in its own step (E2E_SKIP_BUILD=1); locally the server is built here so a run never tests a stale build.
    command: process.env.E2E_SKIP_BUILD ? `npm start -- -p ${PORT}` : `npm run build && npm start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // Accounts (P1-02) are switched on, with the in-memory backend, for the test server ONLY.
    // The memory backend is refused unless NEXT_PUBLIC_ENABLE_DEV_ROUTES=1 (see src/accounts/backend/index.ts).
    env: { NEXT_PUBLIC_ENABLE_DEV_ROUTES: '1', NEXT_PUBLIC_ACCOUNTS_ENABLED: '1', ACCOUNTS_FAKE_BACKEND: '1' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
