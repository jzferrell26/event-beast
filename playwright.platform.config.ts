import { defineConfig, devices } from '@playwright/test';

// This suite is driven by qualify-platform-local.mjs. It never accepts a hosted
// base URL or persisted production sessions, and does not mock application APIs.
export default defineConfig({
  testDir: './tests/platform-browser',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/platform',
  reporter: [['list'], ['json', { outputFile: 'test-results/platform-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3190',
    actionTimeout: 15_000,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --port 3190 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3190/platform/auth',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
