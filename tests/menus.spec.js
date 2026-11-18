const { test, expect } = require('@playwright/test');
const path = require('path');

const ARTIFACTS = '/opt/cursor/artifacts';

test("DON'T DIE pause menu resumes with B and hides Quit on the web", async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__game.paused);
  expect(await page.evaluate(() => window.__game.pauseLabels())).toEqual([
    'Resume', 'Restart', 'Back to game menu',
  ]);
  await page.screenshot({ path: path.join(ARTIFACTS, 'dontdie-pause-menu.png') });
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__game.paused === false && window.__game.state === 'play');
  await page.evaluate(() => { window.AnitaApp = { quit() { window.__quit = true; } }; });
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__game.paused);
  const labels = await page.evaluate(() => window.__game.pauseLabels());
  expect(labels[labels.length - 1]).toBe('Quit app');
  expect(errors).toEqual([]);
});

test('game picker lists Quit', async ({ page }) => {
  await page.goto('/android/app/src/main/assets/launcher.html');
  await expect(page.locator('button', { hasText: 'Quit' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Check for updates' })).toBeVisible();
});
