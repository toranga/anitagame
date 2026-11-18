const { test, expect, devices } = require('@playwright/test');
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

async function openForest(browser, { query = '', touch = false } = {}) {
  const context = await browser.newContext({
    viewport: touch ? { width: 915, height: 412 } : { width: 1280, height: 720 },
    hasTouch: touch,
    isMobile: touch,
    userAgent: touch ? devices['Pixel 7'].userAgent : undefined,
    baseURL: 'http://127.0.0.1:4173',
  });
  await context.addInitScript(() => {
    try {
      localStorage.removeItem('spooky-jumpscares');
      localStorage.removeItem('spooky-start');
      localStorage.removeItem('spooky-hide-buttons');
    } catch (e) {}
  });
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html' + query);
  await page.waitForFunction(() => window.__game && window.__game.ready && window.__game.state === 'title');
  await page.waitForTimeout(400);
  return { context, page, errors };
}

test('title shows the Hero beside the friendly monster', async ({ browser }) => {
  const { context, page, errors } = await openForest(browser);
  expect(await page.evaluate(() => window.__game.TITLE)).toBe('SPOOKY FOREST');
  expect(await page.evaluate(() => window.__game.HERO.name)).toBe('the Hero');
  expect(await page.evaluate(() => Object.keys(window.__game.HERO.textures).sort().join(','))).toBe('happy,peek,scared,terrified');
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-title.png') });
  expect(errors).toEqual([]);
  await context.close();
});

test('play, collect, hide, talk, scare, and win', async ({ browser }) => {
  test.setTimeout(60000);
  const { context, page, errors } = await openForest(browser);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  const z0 = await page.evaluate(() => window.__game.player.z);
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  expect(await page.evaluate((z) => window.__game.player.z > z + 0.4, z0)).toBe(true);

  await page.evaluate(() => window.__game.setPhase('night'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-dark.png') });
  const fpsNight = await page.evaluate(() => window.__game.fps);
  fs.writeFileSync('/tmp/forest-fps.txt', String(fpsNight));

  const spot = await page.evaluate(() => {
    const l = window.__game.lanterns[0];
    window.__game.player.x = l.x;
    window.__game.player.z = l.z;
    return window.__game.collected;
  });
  await page.keyboard.press('e');
  await page.waitForFunction((n) => window.__game.collected > n, spot);

  const bush = await page.evaluate(() => window.__game.bushes[0]);
  await page.evaluate((b) => { window.__game.player.x = b.x; window.__game.player.z = b.z; }, bush);
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => window.__game.hiding)).toBe(true);
  await page.evaluate(() => {
    window.__game.monster.x = window.__game.player.x;
    window.__game.monster.z = window.__game.player.z;
    window.__game.monster.mode = 'chase';
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.state)).toBe('play');
  expect(await page.evaluate(() => window.__game.lives)).toBe(3);
  await page.evaluate(() => {
    window.__game.monster.x = 40;
    window.__game.monster.z = 40;
    window.__game.monster.mode = 'wander';
  });
  await page.keyboard.press('e');

  await page.evaluate(() => {
    window.__game.setPhase('day');
    window.__game.cameraYaw = 0;
    window.__game.player.x = 0;
    window.__game.player.z = 30;
    window.__game.monster.x = 1.4;
    window.__game.monster.z = 32.6;
    window.__game.monster.mode = 'wander';
  });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__game.talkT > 0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-day.png') });

  await page.evaluate(() => window.__game.setPhase('dusk'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-dusk.png') });

  await page.evaluate(() => {
    window.__game.setPhase('night');
    window.__game.cameraYaw = 0;
    window.__game.player.x = 0;
    window.__game.player.z = 40;
    window.__game.monster.x = -2.4;
    window.__game.monster.z = 43.2;
    window.__game.monster.mode = 'chase';
  });
  await page.waitForFunction(() => window.__game.expression === 'scared' || window.__game.expression === 'terrified');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-chase.png') });

  await page.evaluate(() => {
    window.__game.player.x = 0;
    window.__game.player.z = 50;
    window.__game.monster.x = 0.2;
    window.__game.monster.z = 50.3;
    window.__game.monster.mode = 'chase';
  });
  await page.waitForFunction(() => window.__game.state === 'scare');
  await page.waitForFunction(() => window.__game.scareT > 0.45);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-jumpscare.png') });
  await page.waitForFunction(() => window.__game.state === 'play');
  expect(await page.evaluate(() => window.__game.lives)).toBe(2);

  await page.evaluate(() => {
    window.__game.lanterns.forEach((l) => { l.got = true; l.mesh.visible = false; });
    const g = window.__game.gate;
    window.__game.player.x = g.x;
    window.__game.player.z = g.z;
  });
  await page.waitForFunction(() => window.__game.state === 'win');
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-win.png') });
  expect(errors).toEqual([]);
  await context.close();
});

test('mocked gamepad starts and moves', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript(() => {
    const blank = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const state = { buttons: blank(), axes: [0, 0, 0, 0] };
    window.__pad = {
      set(i, down) { state.buttons[i].pressed = !!down; state.buttons[i].value = down ? 1 : 0; },
      axis(x, y) { state.axes[0] = x; state.axes[1] = y; },
      reset() { state.buttons = blank(); state.axes = [0, 0, 0, 0]; },
    };
    navigator.getGamepads = () => [{
      id: 'Mock Pad', index: 0, connected: true, mapping: 'standard',
      axes: state.axes.slice(),
      buttons: state.buttons.map((b) => ({ pressed: b.pressed, value: b.value, touched: b.pressed })),
      timestamp: Date.now(),
    }];
  });
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');
  await page.evaluate(() => window.__pad.set(9, true));
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.evaluate(() => window.__pad.set(9, false));
  const z0 = await page.evaluate(() => window.__game.player.z);
  await page.evaluate(() => window.__pad.axis(0, -0.9));
  await page.waitForFunction((z) => window.__game.player.z > z + 0.5, z0);
  expect(errors).toEqual([]);
  await context.close();
});

test('Pixel 7 shows touch controls', async ({ browser }) => {
  const { context, page, errors } = await openForest(browser, { touch: true });
  await expect(page.locator('#joy')).toBeVisible();
  await expect(page.locator('#btn-sprint')).toBeVisible();
  await expect(page.locator('#btn-hide')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  expect(errors).toEqual([]);
  await context.close();
});

test('native pad flag ignores getGamepads', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript(() => {
    navigator.getGamepads = () => [{
      id: 'Mock', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 9, value: i === 9 ? 1 : 0, touched: i === 9 })),
      timestamp: Date.now(),
    }];
  });
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html?native=1');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.state)).toBe('title');
  await page.evaluate(() => {
    const buttons = [];
    buttons[9] = { pressed: true, value: 1 };
    window.__nativeButtons = buttons;
  });
  await page.waitForFunction(() => window.__game.state === 'play');
  expect(errors).toEqual([]);
  await context.close();
});
