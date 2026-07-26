const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const HARNESS_DIR = path.join(__dirname, '..');

// Walks Playwright's JSON reporter output and tallies final test statuses
// (last result per test, so retries don't get double-counted).
function parsePlaywrightReport(jsonPath) {
  if (!fs.existsSync(jsonPath)) return null;

  let report;
  try {
    report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    return null;
  }

  const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };

  function walkSuite(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const last = test.results?.[test.results.length - 1];
        const status = last?.status;
        counts.total += 1;
        if (status === 'passed') counts.passed += 1;
        else if (status === 'skipped') counts.skipped += 1;
        else counts.failed += 1;
      }
    }
    for (const child of suite.suites || []) walkSuite(child);
  }

  for (const suite of report.suites || []) walkSuite(suite);
  return counts;
}

// Spawns `playwright test` for the given suite/environment, streams output
// through the logger, and returns { exitCode, result }.
function runSuite({ session, suiteDir, baseUrl, logger }) {
  return new Promise((resolve, reject) => {
    const reportJsonPath = path.join(session.artifactsDir, 'playwright-report.json');
    const env = {
      ...process.env,
      HARNESS_ENV: session.environment,
      HARNESS_BASE_URL: baseUrl,
      HARNESS_SESSION_DIR: session.dir,
      HARNESS_ARTIFACTS_DIR: session.artifactsDir,
      HARNESS_REPORT_JSON: reportJsonPath,
      HARNESS_REPO_ROOT: path.join(HARNESS_DIR, '..'),
    };

    const command = `npx playwright test ${suiteDir} --config=playwright.config.js`;
    const child = spawn(command, { cwd: HARNESS_DIR, env, shell: true });

    child.stdout.on('data', (chunk) => logger.append(chunk.toString()));
    child.stderr.on('data', (chunk) => logger.append(chunk.toString()));

    child.on('error', reject);
    child.on('close', (exitCode) => {
      const result = parsePlaywrightReport(reportJsonPath) || {
        total: null,
        passed: null,
        failed: null,
        skipped: null,
      };
      resolve({ exitCode, result });
    });
  });
}

module.exports = { runSuite, parsePlaywrightReport };
