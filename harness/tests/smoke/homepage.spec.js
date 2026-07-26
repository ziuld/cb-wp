const { test, expect } = require('@playwright/test');

test('homepage loads without console errors', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const response = await page.goto('/');

  expect(response.status()).toBeLessThan(400);
  expect(consoleErrors).toEqual([]);
});
