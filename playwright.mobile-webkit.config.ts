import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['**/mobile-first.spec.ts', '**/mobile-viewport.spec.ts', '**/speaker-portraits.spec.ts', '**/event-brand.spec.ts', '**/operator-console.spec.ts'],
  outputDir: 'test-results/webkit',
  reporter: [['list'], ['json', { outputFile: 'test-results/webkit-results.json' }]],
  projects: [{ name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }],
});
