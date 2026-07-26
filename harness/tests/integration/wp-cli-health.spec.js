const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');

test('wp-cli reports the expected site URL for the local environment', async () => {
  test.skip(process.env.HARNESS_ENV !== 'local', 'WP-CLI integration checks only run against the local Docker stack');

  const output = execSync('docker compose exec -T wpcli wp option get siteurl', {
    cwd: process.env.HARNESS_REPO_ROOT || process.cwd(),
  }).toString().trim();

  expect(output).toBe('http://localhost:8090');
});
