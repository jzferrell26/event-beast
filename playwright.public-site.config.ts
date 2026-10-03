import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
process.env.EVENT_BEAST_PUBLIC_TESTS = 'true';
export default defineConfig({
  ...base, testIgnore: [], testMatch: ['**/public-site.spec.ts', '**/public-offline.spec.ts', '**/operator-console.spec.ts', '**/hub.spec.ts', '**/roster-import.spec.ts', '**/chat-feedback.spec.ts', '**/sonia-polish.spec.ts', '**/social-wall.spec.ts'],
  outputDir: 'test-results/public-site', reporter: [['list'], ['json', { outputFile: 'test-results/public-site-results.json' }]],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'node node_modules/next/dist/bin/next start --port 3180', url: 'http://127.0.0.1:3180', reuseExistingServer: false, timeout: 60000,
    env: { EVENT_BEAST_DEMO_MODE: 'true', EVENT_BEAST_PUBLIC_SITE: 'true', EVENT_BEAST_SITE_URL: 'http://127.0.0.1:3180' },
  },
  use: { ...base.use, baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3180' },
  projects: [
    { name: 'public-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'public-mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'public-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
