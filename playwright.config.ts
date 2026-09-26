import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Share one run ID with workers; later runs must not erase earlier evidence.
const runId = process.env.DELAYED_LISTENING_E2E_RUN_ID ??= `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const resultsDir = `test-results/${runId}`;
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: `${resultsDir}/artifacts`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 7000 },
  reporter: [['list'], ['json', { outputFile: `${resultsDir}/results.json` }]],
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 15000 },
});
