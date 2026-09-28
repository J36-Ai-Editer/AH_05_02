// Read-only deployment-route QA: verifies retro auth CTAs reach real auth forms.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8022';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#sidebar-login').click();
    await page.locator('#login-form').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#login-email').isVisible());
    assert.ok(await page.locator('#login-password').isVisible());
    console.log('PASS retro login CTA opens the login form');

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#sidebar-signup').click();
    await page.locator('#signup-form').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#email').isVisible());
    assert.ok(await page.locator('#password').isVisible());
    console.log('PASS retro signup CTA opens the signup form');

    await page.goto(`${base}/?intro=original&auth=login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-form').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#login-email').isVisible());
    console.log('PASS original intro auth=login opens the login form on load');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
