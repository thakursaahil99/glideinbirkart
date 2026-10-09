import { defineConfig, devices } from '@playwright/test';

/**
 * Browser e2e. By default it targets an already-running stack (pnpm dev) at E2E_BASE_URL.
 * In CI set E2E_START_SERVERS=1 to build + start the API and the web app first.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const startServers = process.env.E2E_START_SERVERS === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: startServers
    ? [
        {
          command: 'pnpm --filter @gk/api start',
          url: 'http://localhost:4000/api/v1/health',
          reuseExistingServer: true,
          timeout: 120_000,
          cwd: '../..',
        },
        {
          command: 'pnpm --filter @gk/web start',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          cwd: '../..',
        },
      ]
    : undefined,
});
