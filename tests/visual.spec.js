const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ARTIFACTS = '/opt/cursor/artifacts';
fs.mkdirSync(ARTIFACTS, { recursive: true });

function track(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function boot(browser, gfx) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript((tier) => {
    const next = localStorage.getItem('spooky-gfx-next');
    localStorage.setItem('spooky-gfx', next || tier);
    localStorage.setItem('spooky-start', 'day');
  }, gfx);
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title' && window.__game.texturesReady && window.__game.modelsReady, null, { timeout: 70000 });
  return { context, page, errors };
}

test('realistic forest renders and holds frame rate on each graphics tier', async ({ browser }) => {
  test.setTimeout(180000);
  const { context, page, errors } = await boot(browser, 'high');
  expect(await page.evaluate(() => window.__game.gfxTier)).toBe('high');
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-title-real.png') });

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.evaluate(() => {
    window.__game.setPhase('day');
    window.__game.player.x = 0;
    window.__game.player.z = 18;
    window.__game.cameraYaw = 0.4;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-day-real.png') });

  await page.evaluate(() => {
    window.__game.player.x = -1.2;
    window.__game.player.z = 8;
    window.__game.cameraYaw = Math.PI;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-hero-close.png') });

  await page.evaluate(() => {
    window.__game.setPhase('day');
    window.__game.monster.x = window.__game.player.x + 2.4;
    window.__game.monster.z = window.__game.player.z;
    window.__game.monster.yaw = Math.PI;
    window.__game.monster.mode = 'wander';
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-monster-day.png') });

  await page.evaluate(() => {
    window.__game.setPhase('night');
    window.__game.player.x = 0;
    window.__game.player.z = 20;
    window.__game.cameraYaw = 0;
    window.__game.monster.x = 0.2;
    window.__game.monster.z = 23.5;
    window.__game.monster.yaw = Math.PI;
    window.__game.monster.mode = 'wander';
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-night-mist.png') });
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-monster-night.png') });

  await page.evaluate(() => window.__game.forceSurprise());
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-jumpscare-real.png') });
  await page.waitForFunction(() => window.__game.state === 'play');

  await page.evaluate(() => {
    window.__game.setPhase('day');
    const l = window.__game.lanterns[0];
    window.__game.player.x = l.x;
    window.__game.player.z = l.z + 1.2;
    l.got = false;
    l.mesh.visible = true;
  });
  await page.keyboard.press('f');
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-lasso-real.png') });

  const fps = {};
  for (const tier of ['low', 'med', 'high']) {
    await page.evaluate((name) => localStorage.setItem('spooky-gfx-next', name), tier);
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.texturesReady && window.__game.state === 'title');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.state === 'play');
    await page.waitForTimeout(2500);
    fps[tier] = await page.evaluate(() => window.__game.fps);
    expect(await page.evaluate(() => window.__game.gfxTier)).toBe(tier);
  }
  fs.writeFileSync('/tmp/forest-fps.json', JSON.stringify(fps));
  expect(fps.low).toBeGreaterThan(20);
  expect(fps.med).toBeGreaterThan(20);
  expect(fps.high).toBeGreaterThan(20);
  expect(errors).toEqual([]);
  await context.close();
});
