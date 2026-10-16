import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { include: ['tests/billing-local/**/*.spec.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000, reporters: ['default', ['json', { outputFile: 'test-results/billing-local-results.json' }]] } });
