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
    window.__game.player.z = 5;
    window.__game.monster.x = 1.5;
    window.__game.monster.z = 7.6;
    window.__game.monster.mode = 'wander';
  });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__game.talkT > 0);
  await page.waitForTimeout(250);
  const bubble = await page.locator('#speech').boundingBox();
  expect(bubble).toBeTruthy();
  expect(bubble.x).toBeGreaterThanOrEqual(0);
  expect(bubble.y).toBeGreaterThanOrEqual(0);
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(1280);
  expect(bubble.y + bubble.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-day.png') });

  await page.evaluate(() => window.__game.setPhase('dusk'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-dusk.png') });

  await page.evaluate(() => {
    window.__game.setPhase('night');
    window.__game.cameraYaw = 0;
    window.__game.player.x = 0;
    window.__game.player.z = 6;
    window.__game.monster.x = -4.5;
    window.__game.monster.z = 9.5;
    window.__game.monster.mode = 'chase';
  });
  await page.waitForFunction(() => window.__game.expression === 'scared' || window.__game.expression === 'terrified');
  await page.waitForTimeout(350);
  const chase = await page.evaluate(() => ({
    face: window.__game.monsterFace,
    parts: window.__game.heroParts(),
  }));
  expect(chase.face).toBe('night');
  expect(Math.abs(chase.parts.rx)).toBeLessThan(0.08);
  expect(Math.abs(chase.parts.rz)).toBeLessThan(0.08);
  expect(Math.hypot(chase.parts.hx - chase.parts.px, chase.parts.hz - chase.parts.pz)).toBeLessThan(0.4);
  expect(Math.abs((chase.parts.hy - chase.parts.py) - 1.62)).toBeLessThan(0.2);
  expect(chase.parts.ty).toBeGreaterThan(chase.parts.py + 1.5);
  expect(chase.parts.ty).toBeLessThan(chase.parts.hy + 0.45);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-chase.png') });

  await page.evaluate(() => {
    window.__game.player.x = 0;
    window.__game.player.z = 50;
    window.__game.monster.x = 0.2;
    window.__game.monster.z = 50.3;
    window.__game.monster.mode = 'chase';
  });
  await page.waitForFunction(() => window.__game.state === 'scare');
  await page.waitForFunction(() => window.__game.scareT > 0.45 && window.__game.scareHeadOn);
  const flashOp = await page.locator('#flash').evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(flashOp).toBeLessThan(0.05);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-jumpscare.png') });
  await page.waitForFunction(() => window.__game.state === 'play');
  expect(await page.evaluate(() => window.__game.lives)).toBe(2);

  const tree = await page.evaluate(() => {
    const c = window.__game.canopies[0];
    window.__game.setPhase('day');
    window.__game.monster.x = 80;
    window.__game.monster.z = 80;
    window.__game.monster.mode = 'wander';
    window.__game.player.x = c.x;
    window.__game.player.z = c.z + 1.3;
    window.__game.cameraYaw = 0;
    return { x: c.x, z: c.z };
  });
  await page.waitForTimeout(250);
  const cam = await page.evaluate(() => {
    const p = window.__game.cameraPos();
    return { cam: p, pz: window.__game.player.z };
  });
  expect(cam.cam.z).toBeGreaterThan(tree.z - 0.15);
  expect(Math.hypot(cam.cam.x - tree.x, cam.cam.z - cam.pz)).toBeLessThan(4.2);

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
  await page.evaluate(() => window.__pad.axis(0, 0));
  const z1 = await page.evaluate(() => window.__game.player.z);
  await page.evaluate(() => window.__pad.set(12, true));
  await page.waitForFunction((z) => window.__game.player.z > z + 0.3, z1);
  await page.evaluate(() => window.__pad.set(12, false));
  expect(errors).toEqual([]);
  await context.close();
});

test('lasso swing and right-stick camera orbit', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript(() => {
    const blank = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const state = { buttons: blank(), axes: [0, 0, 0, 0] };
    window.__pad = {
      set(i, down) { state.buttons[i].pressed = !!down; state.buttons[i].value = down ? 1 : 0; },
      axis(x, y) { state.axes[0] = x; state.axes[1] = y; },
      look(x, y) { state.axes[2] = x; state.axes[3] = y; },
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
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  const before = await page.evaluate(() => {
    window.__game.setPhase('day');
    window.__game.cameraYaw = 0;
    window.__game.player.x = 0;
    window.__game.player.z = 4;
    const l = window.__game.lanterns[0];
    l.x = 0;
    l.z = 8;
    l.got = false;
    l.mesh.visible = true;
    l.mesh.position.set(0, 1.4, 8);
    return window.__game.collected;
  });
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__game.lassoT > 0);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-lasso.png') });
  await page.waitForFunction((n) => window.__game.collected > n, before);

  const yaw0 = await page.evaluate(() => window.__game.cameraYaw);
  await page.evaluate(() => window.__pad.look(0.95, -0.8));
  await page.waitForFunction((y) => window.__game.cameraYaw < y - 0.35, yaw0);
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-camera.png') });
  const held = await page.evaluate(() => window.__game.cameraYaw);
  await page.evaluate(() => window.__pad.look(0, 0));
  await page.waitForTimeout(700);
  const stayed = await page.evaluate(() => window.__game.cameraYaw);
  expect(Math.abs(stayed - held)).toBeLessThan(0.08);
  expect(errors).toEqual([]);
  await context.close();
});

test('stick up walks forward, stick right walks right, and a small push is slow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript(() => {
    const blank = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const state = { buttons: blank(), axes: [0, 0, 0, 0] };
    window.__pad = {
      axis(x, y) { state.axes[0] = x; state.axes[1] = y; },
      native(x, y) {
        window.__nativePad = true;
        window.__nativeAxis = x;
        window.__nativeAxisY = y;
        window.__nativeRightX = 0;
        window.__nativeRightY = 0;
        window.__nativeButtons = blank();
      },
    };
    navigator.getGamepads = () => [{
      id: 'Mock Pad', index: 0, connected: true, mapping: 'standard',
      axes: state.axes.slice(),
      buttons: state.buttons.map((b) => ({ pressed: b.pressed, value: b.value, touched: false })),
      timestamp: Date.now(),
    }];
  });
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');

  async function drift(axisX, axisY, ms) {
    const start = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
    await page.evaluate(([x, y]) => window.__pad.axis(x, y), [axisX, axisY]);
    await page.waitForTimeout(ms);
    await page.evaluate(() => window.__pad.axis(0, 0));
    await page.waitForTimeout(250);
    const end = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
    return { dx: end.x - start.x, dz: end.z - start.z };
  }

  await page.evaluate(() => { window.__game.cameraYaw = 0; window.__game.player.x = 0; window.__game.player.z = 20; });
  const forward = await drift(0, -0.95, 600);
  expect(forward.dz).toBeGreaterThan(1);
  expect(Math.abs(forward.dx)).toBeLessThan(Math.abs(forward.dz) * 0.45);

  await page.evaluate(() => { window.__game.cameraYaw = 0; window.__game.player.x = 0; window.__game.player.z = 20; });
  const right = await drift(0.95, 0, 600);
  expect(right.dx).toBeLessThan(-1);
  expect(Math.abs(right.dz)).toBeLessThan(Math.abs(right.dx) * 0.45);

  await page.evaluate(() => { window.__game.cameraYaw = 0; window.__game.player.x = 0; window.__game.player.z = 30; });
  const tiny = await drift(0, -0.32, 500);
  const full = await drift(0, -0.95, 500);
  expect(full.dz).toBeGreaterThan(0.8);
  expect(tiny.dz).toBeGreaterThan(0);
  expect(tiny.dz).toBeLessThan(full.dz * 0.35);

  await page.evaluate(() => { window.__game.cameraYaw = 0; window.__game.player.x = 0; window.__game.player.z = 40; });
  const start = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  await page.evaluate(() => window.__pad.native(0, -0.95));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__pad.native(0, 0));
  await page.waitForTimeout(200);
  const end = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  expect(end.z - start.z).toBeGreaterThan(1);
  expect(Math.abs(end.x - start.x)).toBeLessThan(Math.abs(end.z - start.z) * 0.45);

  await page.evaluate(() => window.__game.togglePadDebug());
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-pad-debug.png') });
  expect(await page.evaluate(() => window.__game.padDebugOn)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test('pause menu can resume and lists quit only inside the app', async ({ browser }) => {
  const { context, page, errors } = await openForest(browser);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__game.state === 'pause');
  let labels = await page.locator('#opts button').allTextContents();
  expect(labels).toEqual(['Resume', 'Restart', 'Options', 'Back to game menu']);
  await page.locator('#opts button', { hasText: 'Resume' }).click();
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.evaluate(() => { window.AnitaApp = { quit() { window.__quit = 1; } }; });
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__game.state === 'pause');
  labels = await page.locator('#opts button').allTextContents();
  expect(labels[labels.length - 1]).toBe('Quit app');
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-pause-menu.png') });
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('#opts .focus').textContent.includes('Restart'));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('#opts .focus').textContent === 'Options');
  await page.keyboard.press('Enter');
  await expect(page.locator('#opts button').first()).toHaveText(/Stick sensitivity/);
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-pause-options.png') });
  expect(errors).toEqual([]);
  await context.close();
});

test('Pixel 7 shows touch controls', async ({ browser }) => {
  const { context, page, errors } = await openForest(browser, { touch: true });
  await expect(page.locator('#joy')).toBeVisible();
  await expect(page.locator('#btn-sprint')).toBeVisible();
  await expect(page.locator('#btn-hide')).toBeVisible();
  await expect(page.locator('#btn-lasso')).toBeVisible();
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

test('title focus follows the remote, and both look paths turn the same way', async ({ browser }) => {
  const { context, page, errors } = await openForest(browser, { query: '?native=1' });
  expect(await page.locator('#prompt').innerText()).toBe('Press A to start');
  expect(await page.locator('#opts .focus').innerText()).toBe('START GAME');
  await page.screenshot({ path: path.join(ARTIFACTS, 'forest-title-focus.png') });

  await page.evaluate(() => window.__menuPress('down'));
  await page.waitForFunction(() => document.querySelector('#opts .focus').textContent === 'Options');
  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[12] = { pressed: true, value: 1 };
    window.__nativeButtons = buttons;
  });
  await page.waitForFunction(() => document.querySelector('#opts .focus').textContent === 'START GAME');
  await page.evaluate(() => {
    window.__nativeButtons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    window.__nativeCenter = true;
  });
  await page.waitForFunction(() => window.__game.state === 'play');

  const yaw0 = await page.evaluate(() => {
    window.__game.cameraYaw = 0;
    window.__nativeRightX = 0.95;
    window.__nativeRightY = 0;
    return window.__game.cameraYaw;
  });
  await page.waitForFunction((y) => window.__game.cameraYaw < y - 0.35, yaw0);
  const pitch0 = await page.evaluate(() => {
    window.__nativeRightX = 0;
    window.__nativeRightY = -0.95;
    return window.__game.cameraPitch;
  });
  await page.waitForFunction((p) => window.__game.cameraPitch > p + 0.2, pitch0);
  await page.evaluate(() => { window.__nativeRightX = 0; window.__nativeRightY = 0; });

  await page.evaluate(() => window.__game.forcePause());
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('#opts .focus').textContent === 'Options');
  await page.keyboard.press('Enter');
  await expect(page.locator('#opts button').nth(1)).toHaveText(/Invert camera Y: OFF/);
  await expect(page.locator('#opts button').nth(2)).toHaveText(/Invert camera X: OFF/);
  expect(errors).toEqual([]);
  await context.close();

  const gamepad = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await gamepad.addInitScript(() => {
    const state = { axes: [0, 0, 0, 0] };
    window.__pad = { look(x, y) { state.axes[2] = x; state.axes[3] = y; } };
    navigator.getGamepads = () => [{
      id: 'Mock Pad', index: 0, connected: true, mapping: 'standard',
      axes: state.axes.slice(),
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
      timestamp: Date.now(),
    }];
  });
  const padPage = await gamepad.newPage();
  const padErrors = track(padPage);
  await padPage.goto('/forest/index.html');
  await padPage.waitForFunction(() => window.__game && window.__game.state === 'title');
  await padPage.keyboard.press('Enter');
  await padPage.waitForFunction(() => window.__game.state === 'play');
  const gy = await padPage.evaluate(() => {
    window.__game.cameraYaw = 0;
    window.__pad.look(0.95, 0);
    return window.__game.cameraYaw;
  });
  await padPage.waitForFunction((y) => window.__game.cameraYaw < y - 0.35, gy);
  const gp = await padPage.evaluate(() => {
    window.__pad.look(0, -0.95);
    return window.__game.cameraPitch;
  });
  await padPage.waitForFunction((p) => window.__game.cameraPitch > p + 0.2, gp);
  expect(padErrors).toEqual([]);
  await gamepad.close();
});

test('right moves toward the right of the screen at several camera yaws', async ({ browser }) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript(() => {
    const blank = () => Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const state = { axes: [0, 0, 0, 0] };
    window.__pad = {
      axis(x, y) { state.axes[0] = x; state.axes[1] = y; },
      look(x, y) { state.axes[2] = x; state.axes[3] = y; },
      native(x, y) {
        window.__nativePad = true;
        window.__nativeAxis = x;
        window.__nativeAxisY = y;
        window.__nativeRightX = 0;
        window.__nativeRightY = 0;
        window.__nativeButtons = blank();
      },
      nativeLook(x) { window.__nativeRightX = x; window.__nativeRightY = 0; },
    };
    navigator.getGamepads = () => [{
      id: 'Mock Pad', index: 0, connected: true, mapping: 'standard',
      axes: state.axes.slice(),
      buttons: blank(),
      timestamp: Date.now(),
    }];
  });
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html');
  await page.waitForFunction(() => window.__game && window.__game.state === 'play' || (window.__game && window.__game.state === 'title'));
  await page.waitForFunction(() => window.__game.state === 'title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');

  async function park() {
    await page.evaluate(() => {
      window.__game.setPhase('day');
      window.__game.monster.x = 90;
      window.__game.monster.z = 90;
      window.__game.monster.mode = 'wander';
      window.__game.player.x = 2;
      window.__game.player.z = 28;
    });
    await page.waitForTimeout(350);
  }

  async function sample(apply, release) {
    await park();
    const before = await page.evaluate(() => {
      window.__game.captureView();
      const p = window.__game.player;
      const cam = window.__game.cameraPos();
      const s = window.__game.projectFrozen(p.x, 1.2, p.z);
      const fx = p.x - cam.x;
      const fz = p.z - cam.z;
      const len = Math.hypot(fx, fz) || 1;
      return { x: p.x, z: p.z, sx: s.x, fx: fx / len, fz: fz / len, yaw: window.__game.cameraYaw };
    });
    await apply();
    await page.waitForTimeout(420);
    await release();
    await page.waitForTimeout(280);
    const after = await page.evaluate((shot) => {
      const p = window.__game.player;
      const s = window.__game.projectFrozen(p.x, 1.2, p.z);
      const dx = p.x - shot.x;
      const dz = p.z - shot.z;
      return { sx: s.x, away: dx * shot.fx + dz * shot.fz, side: Math.hypot(dx, dz) };
    }, before);
    return { yaw: before.yaw, dsx: after.sx - before.sx, away: after.away, side: after.side };
  }

  async function orbitPast(limit, native) {
    await page.evaluate((useNative) => {
      if (useNative) window.__pad.nativeLook(-0.95);
      else window.__pad.look(-0.95, 0);
    }, native);
    await page.waitForFunction((y) => window.__game.cameraYaw > y, limit);
    await page.evaluate((useNative) => {
      if (useNative) window.__pad.nativeLook(0);
      else window.__pad.look(0, 0);
    }, native);
    await page.waitForTimeout(200);
  }

  const keyRight = () => sample(() => page.keyboard.down('ArrowRight'), () => page.keyboard.up('ArrowRight'));
  const keyLeft = () => sample(() => page.keyboard.down('ArrowLeft'), () => page.keyboard.up('ArrowLeft'));
  const keyUp = () => sample(() => page.keyboard.down('ArrowUp'), () => page.keyboard.up('ArrowUp'));
  const padRight = () => sample(() => page.evaluate(() => window.__pad.axis(1, 0)), () => page.evaluate(() => window.__pad.axis(0, 0)));
  const padLeft = () => sample(() => page.evaluate(() => window.__pad.axis(-1, 0)), () => page.evaluate(() => window.__pad.axis(0, 0)));
  const padUp = () => sample(() => page.evaluate(() => window.__pad.axis(0, -1)), () => page.evaluate(() => window.__pad.axis(0, 0)));
  const nativeRight = () => sample(() => page.evaluate(() => window.__pad.native(1, 0)), () => page.evaluate(() => window.__pad.native(0, 0)));
  const nativeLeft = () => sample(() => page.evaluate(() => window.__pad.native(-1, 0)), () => page.evaluate(() => window.__pad.native(0, 0)));
  const nativeUp = () => sample(() => page.evaluate(() => window.__pad.native(0, -1)), () => page.evaluate(() => window.__pad.native(0, 0)));

  await page.evaluate(() => { window.__game.cameraYaw = 0; });
  for (const limit of [0, 1.1, 2.4, 3.6]) {
    if (limit > 0) await orbitPast(limit, false);
    const right = await keyRight();
    const left = await keyLeft();
    const up = await keyUp();
    const gRight = await padRight();
    const gLeft = await padLeft();
    const gUp = await padUp();
    expect(right.dsx, 'keyboard right yaw ' + right.yaw).toBeGreaterThan(0.04);
    expect(left.dsx, 'keyboard left yaw ' + left.yaw).toBeLessThan(-0.04);
    expect(up.away, 'keyboard up yaw ' + up.yaw).toBeGreaterThan(0.45);
    expect(Math.abs(up.dsx), 'keyboard up stays centered').toBeLessThan(0.08);
    expect(gRight.dsx, 'gamepad right yaw ' + gRight.yaw).toBeGreaterThan(0.04);
    expect(gLeft.dsx, 'gamepad left yaw ' + gLeft.yaw).toBeLessThan(-0.04);
    expect(gUp.away, 'gamepad up yaw ' + gUp.yaw).toBeGreaterThan(0.45);
  }

  await page.evaluate(() => { window.__pad.native(0, 0); window.__game.cameraYaw = 0; });
  for (const limit of [0, 1.1, 2.4]) {
    if (limit > 0) await orbitPast(limit, true);
    const right = await nativeRight();
    const left = await nativeLeft();
    const up = await nativeUp();
    expect(right.dsx, 'native right yaw ' + right.yaw).toBeGreaterThan(0.04);
    expect(left.dsx, 'native left yaw ' + left.yaw).toBeLessThan(-0.04);
    expect(up.away, 'native up yaw ' + up.yaw).toBeGreaterThan(0.45);
  }

  await page.evaluate(() => window.__game.forcePause());
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('#opts .focus').textContent === 'Options');
  await page.keyboard.press('Enter');
  await expect(page.locator('#opts button', { hasText: 'Invert move X' })).toHaveText(/Invert move X: OFF/);
  expect(errors).toEqual([]);
  await context.close();
});

test('right stick turns the view right and up looks up', async ({ browser }) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript(() => {
    const blank = () => Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const state = { axes: [0, 0, 0, 0] };
    window.__pad = {
      look(x, y) { state.axes[2] = x; state.axes[3] = y; },
      nativeLook(x, y) {
        window.__nativePad = true;
        window.__nativeAxis = 0;
        window.__nativeAxisY = 0;
        window.__nativeRightX = x;
        window.__nativeRightY = y;
        window.__nativeButtons = blank();
      },
    };
    navigator.getGamepads = () => [{
      id: 'Mock Pad', index: 0, connected: true, mapping: 'standard',
      axes: state.axes.slice(),
      buttons: blank(),
      timestamp: Date.now(),
    }];
  });
  const page = await context.newPage();
  const errors = track(page);
  await page.goto('/forest/index.html');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');

  async function aim(yaw) {
    await page.evaluate((y) => {
      window.__game.setPhase('day');
      window.__game.monster.x = 90;
      window.__game.monster.z = 90;
      window.__game.monster.mode = 'wander';
      window.__game.player.x = 2;
      window.__game.player.z = 28;
      window.__game.cameraYaw = y;
      window.__game.cameraPitch = 0;
    }, yaw);
    await page.waitForTimeout(200);
  }

  async function sweep(yaw, apply, release) {
    await aim(yaw);
    const marker = await page.evaluate(() => {
      const y = window.__game.cameraYaw;
      const p = window.__game.player;
      return { x: p.x + Math.sin(y) * 12, y: 1.4, z: p.z + Math.cos(y) * 12 };
    });
    const before = await page.evaluate((m) => window.__game.project(m.x, m.y, m.z), marker);
    await apply();
    await page.waitForTimeout(380);
    await release();
    await page.waitForTimeout(80);
    const after = await page.evaluate((m) => window.__game.project(m.x, m.y, m.z), marker);
    return { dsx: after.x - before.x, dsy: after.y - before.y };
  }

  const yaws = [0, 1.25, 2.5, -0.9];
  for (const yaw of yaws) {
    const right = await sweep(yaw, () => page.evaluate(() => window.__pad.look(1, 0)), () => page.evaluate(() => window.__pad.look(0, 0)));
    const left = await sweep(yaw, () => page.evaluate(() => window.__pad.look(-1, 0)), () => page.evaluate(() => window.__pad.look(0, 0)));
    const up = await sweep(yaw, () => page.evaluate(() => window.__pad.look(0, -1)), () => page.evaluate(() => window.__pad.look(0, 0)));
    expect(right.dsx, 'gamepad right yaw ' + yaw).toBeLessThan(-30);
    expect(left.dsx, 'gamepad left yaw ' + yaw).toBeGreaterThan(30);
    expect(up.dsy, 'gamepad up yaw ' + yaw).toBeGreaterThan(8);
  }

  await aim(0);
  const mouse = await sweep(0, async () => {
    await page.mouse.move(980, 360);
    await page.mouse.down();
    await page.mouse.move(1180, 360, { steps: 8 });
    await page.mouse.up();
  }, async () => {});
  expect(mouse.dsx, 'mouse right').toBeLessThan(-30);

  await page.evaluate(() => window.__pad.nativeLook(0, 0));
  for (const yaw of yaws) {
    const right = await sweep(yaw, () => page.evaluate(() => window.__pad.nativeLook(1, 0)), () => page.evaluate(() => window.__pad.nativeLook(0, 0)));
    const left = await sweep(yaw, () => page.evaluate(() => window.__pad.nativeLook(-1, 0)), () => page.evaluate(() => window.__pad.nativeLook(0, 0)));
    const up = await sweep(yaw, () => page.evaluate(() => window.__pad.nativeLook(0, -1)), () => page.evaluate(() => window.__pad.nativeLook(0, 0)));
    expect(right.dsx, 'native right yaw ' + yaw).toBeLessThan(-30);
    expect(left.dsx, 'native left yaw ' + yaw).toBeGreaterThan(30);
    expect(up.dsy, 'native up yaw ' + yaw).toBeGreaterThan(8);
  }

  await page.evaluate(() => localStorage.setItem('spooky-invert-x', '1'));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');
  expect(await page.evaluate(() => localStorage.getItem('spooky-invert-x'))).toBe(null);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('#opts .focus').textContent === 'Options');
  await page.keyboard.press('Enter');
  await expect(page.locator('#opts button', { hasText: 'Invert camera X' })).toHaveText(/Invert camera X: OFF/);

  expect(errors).toEqual([]);
  await context.close();
});
