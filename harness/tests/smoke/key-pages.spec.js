const { test, expect } = require('@playwright/test');
const keyPages = require('../../fixtures/key-pages.json');

for (const { path: pagePath, expectedStatus } of keyPages) {
  test(`GET ${pagePath} returns ${expectedStatus}`, async ({ request }) => {
    const response = await request.get(pagePath);
    expect(response.status()).toBe(expectedStatus);
  });
}
