const { test, expect } = require('@playwright/test');

// Confirms a specific, identifiable change has actually reached this environment,
// instead of relying on a human eyeballing local vs dev after a deploy.
test('homepage contains the current deploy marker', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText('cb-wp-deploy-check');
});
