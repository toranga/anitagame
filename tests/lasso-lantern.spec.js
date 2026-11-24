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

test('lanterns and the lasso read clearly up close', async ({ browser }) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html?shots=5');
  await page.waitForFunction(() => window.__game && window.__game.modelsReady && !window.__game.modelsFailed && window.__game.state === 'title', null, { timeout: 25000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');

  const place = async (night) => {
    await page.evaluate((isNight) => {
      window.__game.setPhase(isNight ? 'night' : 'day');
      const l = window.__game.lanterns[0];
      l.got = false;
      l.held = false;
      l.mesh.visible = true;
      const y = l.baseY;
      window.__game.setCamera(l.x + 0.55, y + 0.28, l.z + 0.72, l.x, y + 0.18, l.z);
    }, night);
    await page.waitForTimeout(250);
  };
  await place(false);
  await page.screenshot({ path: path.join(ARTIFACTS, 'lantern-day.png') });
  await place(true);
  await page.screenshot({ path: path.join(ARTIFACTS, 'lantern-night.png') });

  await page.evaluate(() => {
    window.__game.setPhase('day');
    window.__game.clearCamera();
    const l = window.__game.lanterns[0];
    l.got = false;
    l.held = false;
    l.mesh.visible = true;
    l.x = 9;
    l.z = 16;
    l.mesh.position.x = 9;
    l.mesh.position.z = 16;
    window.__game.player.x = 11.4;
    window.__game.player.z = 17.6;
    window.__game.face(Math.atan2(9 - 11.4, 16 - 17.6));
    window.__game.cameraYaw = 0;
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__game.lassoPhase === 'spin');
  await page.evaluate(() => {
    const h = window.__game.heroParts();
    window.__game.setCamera(h.px + 1.7, h.py + 1.25, h.pz + 1.5, h.px, h.py + 1.45, h.pz);
  });
  await page.waitForTimeout(420);
  expect(await page.evaluate(() => window.__game.lassoPhase)).toBe('spin');
  await page.screenshot({ path: path.join(ARTIFACTS, 'lasso-spin.png') });

  await page.waitForFunction(() => window.__game.lassoPhase === 'throw');
  await page.evaluate(() => {
    const h = window.__game.heroParts();
    const l = window.__game.lanterns[0];
    const mx = (h.px + l.x) * 0.5;
    const mz = (h.pz + l.z) * 0.5;
    window.__game.setCamera(mx + 2.6, h.py + 1.7, mz + 0.2, mx, h.py + 1.3, mz);
  });
  await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(ARTIFACTS, 'lasso-throw.png') });

  await page.waitForFunction(() => window.__game.lassoPhase === 'catch' || window.__game.lassoPhase === 'pull');
  await page.evaluate(() => {
    const l = window.__game.lanterns[0];
    const y = l.mesh.position.y;
    window.__game.setCamera(l.mesh.position.x + 1.15, y + 0.45, l.mesh.position.z + 1.15, l.mesh.position.x, y, l.mesh.position.z);
  });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(ARTIFACTS, 'lasso-catch.png') });

  await page.waitForFunction(() => window.__game.lassoPhase === 'idle');
  await page.evaluate(() => {
    const h = window.__game.heroParts();
    const c = window.__game.coilWorld();
    window.__game.setCamera(c.x + 0.7, c.y + 0.28, c.z + 0.55, h.px, c.y, h.pz);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(ARTIFACTS, 'lasso-coil.png') });

  expect(errors).toEqual([]);
  await context.close();
});
