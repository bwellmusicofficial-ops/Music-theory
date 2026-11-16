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
    command: `npm run build && npm start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { NEXT_PUBLIC_ENABLE_DEV_ROUTES: '1' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
