// Browser tests: the real screens, clicked as the parent, the admin and the teacher would, against the
// project in .env (a throw-away nursery is created and deleted by each run). Uses the Chrome already
// installed on the machine, so no browser download is needed.
// Run: npm run test:e2e
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: 'http://localhost:5179',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1366, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Africa/Cairo',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
