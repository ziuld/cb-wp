const path = require('path');
const { defineConfig } = require('@playwright/test');

// When run directly with `npx playwright test` (not via cli.js), fall back
// to an ad-hoc session dir so the config still works standalone.
const adhocDir = path.join(__dirname, 'sessions', '_adhoc');
const artifactsDir = process.env.HARNESS_ARTIFACTS_DIR || path.join(adhocDir, 'artifacts');
const reportJsonPath = process.env.HARNESS_REPORT_JSON || path.join(artifactsDir, 'playwright-report.json');
const baseURL = process.env.HARNESS_BASE_URL || 'http://localhost:8090';

module.exports = defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: path.join(artifactsDir, 'test-results'),
  reporter: [
    ['list'],
    ['json', { outputFile: reportJsonPath }],
    ['html', { outputFolder: path.join(artifactsDir, 'html-report'), open: 'never' }],
  ],
});
