const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ARTIFACTS = '/opt/cursor/artifacts';

function padMock(connected) {
  return `(() => {
    const blank = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const state = { connected: ${connected ? 'true' : 'false'}, buttons: blank(), axis: 0 };
    window.__pad = {
      set(i, down) { state.buttons[i].pressed = !!down; state.buttons[i].value = down ? 1 : 0; },
      axis(v) { state.axis = v; },
      connect(v) { state.connected = !!v; if (!v) { state.buttons = blank(); state.axis = 0; } },
      reset() { state.buttons = blank(); state.axis = 0; }
    };
    navigator.getGamepads = () => {
      if (!state.connected) return [null, null, null, null];
      const axes = [state.axis, 0, 0, 0];
      return [{
        id: 'Mock Shield Controller (STANDARD GAMEPAD)',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes,
        buttons: state.buttons.map(b => ({ pressed: b.pressed, value: b.value, touched: b.pressed })),
        timestamp: Date.now()
      }, null, null, null];
    };
  })();`;
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function openGame(browser, { touch = false, pad = false, stored = null } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    hasTouch: touch,
    baseURL: 'http://127.0.0.1:4173',
  });
  if (touch) {
    await context.addInitScript(() => {
      window.ontouchstart = null;
      try { Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get() { return 5; } }); } catch (e) {}
    });
  }
  await context.addInitScript((value) => {
    try {
      localStorage.removeItem('dontdie-hide-buttons');
      if (value) localStorage.setItem('dontdie-hide-buttons', value);
    } catch (e) {}
  }, stored);
  await context.addInitScript(padMock(pad));
  const page = await context.newPage();
  const errors = trackErrors(page);
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');
  return { context, page, errors };
}

async function shotWhenPromptVisible(page, file) {
  await page.waitForFunction(() => {
    const t = window.__game.t;
    return t > 0.08 && Math.floor(t * 2) % 2 === 0;
  });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACTS, file) });
}

test('title screen shows controller prompt and hides buttons when a pad is connected', async ({ browser }) => {
  const { context, page, errors } = await openGame(browser, { pad: true });
  await expect.poll(() => page.evaluate(() => window.__game.padConnected)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__game.buttonsHidden)).toBe(true);
  await expect(page.locator('#hide-buttons')).toHaveText('Show buttons');
  await expect(page.locator('#game [data-k="jump"]')).toBeHidden();
  await shotWhenPromptVisible(page, 'title-controller.png');
  expect(errors).toEqual([]);
  await context.close();
});

test('gamepad plays the game and one-shot buttons do not repeat', async ({ browser }) => {
  const { context, page, errors } = await openGame(browser, { pad: true });

  const x0 = await page.evaluate(() => window.__game.player.x);
  await page.evaluate(() => window.__pad.axis(0.2));
  await page.waitForTimeout(280);
  const xDead = await page.evaluate(() => window.__game.player.x);
  expect(Math.abs(xDead - x0)).toBeLessThan(12);
  await page.evaluate(() => window.__pad.axis(0));

  await page.evaluate(() => window.__pad.set(9, true));
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game.paused)).toBe(false);
  await page.evaluate(() => window.__pad.set(9, false));

  await page.evaluate(() => window.__pad.axis(0.85));
  await page.waitForFunction((start) => window.__game.player.x > start + 40, x0);
  await page.evaluate(() => window.__pad.axis(0));
  await page.evaluate(() => window.__pad.set(14, true));
  const xRight = await page.evaluate(() => window.__game.player.x);
  await page.waitForFunction((start) => window.__game.player.x < start - 20, xRight);
  await page.evaluate(() => window.__pad.set(14, false));

  await page.waitForFunction(() => window.__game.player.onGround);
  const y0 = await page.evaluate(() => window.__game.player.y);
  await page.evaluate(() => window.__pad.set(0, true));
  await page.waitForFunction((y) => window.__game.player.y < y - 30, y0);
  await page.evaluate(() => window.__pad.set(0, false));
  await page.waitForFunction(() => window.__game.player.onGround);

  const y1 = await page.evaluate(() => window.__game.player.y);
  await page.evaluate(() => window.__pad.set(12, true));
  await page.waitForFunction((y) => window.__game.player.y < y - 30, y1);
  await page.evaluate(() => window.__pad.set(12, false));
  await page.waitForFunction(() => window.__game.player.onGround);

  await page.evaluate(() => window.__pad.set(1, true));
  await page.waitForFunction(() => window.__game.lasers.length > 0);
  await page.evaluate(() => window.__pad.set(1, false));
  await page.waitForFunction(() => window.__game.player.cool <= 0);
  await page.evaluate(() => window.__pad.set(3, true));
  await page.waitForFunction(() => window.__game.lasers.length > 0);
  await page.evaluate(() => window.__pad.set(3, false));

  await page.evaluate(() => window.__pad.set(2, true));
  await page.waitForFunction(() => window.__game.bubbles.length > 0);
  await page.waitForFunction(() => window.__game.bubbles[0].life < 1.55);
  const life = await page.evaluate(() => window.__game.bubbles[0].life);
  await page.waitForTimeout(180);
  const lifeLater = await page.evaluate(() => window.__game.bubbles[0].life);
  expect(lifeLater).toBeLessThan(life);
  await page.evaluate(() => window.__pad.set(2, false));

  await page.evaluate(() => window.__pad.set(5, true));
  await page.waitForFunction(() => window.__game.player.flying && window.__game.player.fuel < 0.98);
  await page.evaluate(() => window.__pad.set(5, false));
  await page.waitForFunction(() => !window.__game.player.flying);
  await page.evaluate(() => window.__pad.set(7, true));
  await page.waitForFunction(() => window.__game.player.flying);
  await page.evaluate(() => window.__pad.set(7, false));

  await page.evaluate(() => window.__pad.set(9, true));
  await page.waitForFunction(() => window.__game.paused);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__game.paused)).toBe(true);
  await page.evaluate(() => window.__pad.set(9, false));
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__pad.set(9, true));
  await page.waitForFunction(() => !window.__game.paused);
  await page.evaluate(() => window.__pad.set(9, false));

  expect(await page.evaluate(() => window.__game.buttonsHidden)).toBe(true);
  await page.evaluate(() => window.__pad.set(8, true));
  await page.waitForFunction(() => !window.__game.buttonsHidden);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__game.buttonsHidden)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('dontdie-hide-buttons'))).toBe('shown');
  await page.evaluate(() => window.__pad.set(8, false));

  const xKey = await page.evaluate(() => window.__game.player.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction((start) => window.__game.player.x > start + 25, xKey);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('a');
  const xKey2 = await page.evaluate(() => window.__game.player.x);
  await page.waitForFunction((start) => window.__game.player.x < start - 15, xKey2);
  await page.keyboard.up('a');
  await page.waitForFunction(() => window.__game.player.onGround);
  const yKey = await page.evaluate(() => window.__game.player.y);
  await page.keyboard.press(' ');
  await page.waitForFunction((y) => window.__game.player.y < y - 20, yKey);
  await page.waitForFunction(() => window.__game.player.cool <= 0);
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__game.lasers.length > 0 || window.__game.player.cool > 0);
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__game.bubbles.some(b => b.life > 1.6));
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.__game.player.flying);
  await page.keyboard.up('f');
  const muted = await page.evaluate(() => window.__game.muted);
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.__game.muted)).toBe(!muted);

  expect(errors).toEqual([]);
  await context.close();
});

test('keyboard, remote keys, and the hide toggle still work without a controller', async ({ browser }) => {
  const { context, page, errors } = await openGame(browser, { pad: false });
  expect(await page.evaluate(() => window.__game.padConnected)).toBe(false);
  expect(await page.evaluate(() => window.__game.buttonsHidden)).toBe(true);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  const x0 = await page.evaluate(() => window.__game.player.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction((start) => window.__game.player.x > start + 30, x0);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  const x1 = await page.evaluate(() => window.__game.player.x);
  await page.waitForFunction((start) => window.__game.player.x < start - 15, x1);
  await page.keyboard.up('ArrowLeft');
  await page.waitForFunction(() => window.__game.player.onGround);
  const y0 = await page.evaluate(() => window.__game.player.y);
  await page.keyboard.press('w');
  await page.waitForFunction((y) => window.__game.player.y < y - 20, y0);
  await page.keyboard.press('j');
  await page.waitForFunction(() => window.__game.player.cool > 0 || window.__game.lasers.length > 0);
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__game.paused);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.state)).toBe('play');
  expect(await page.evaluate(() => window.__game.paused)).toBe(true);
  await page.keyboard.press('p');
  await page.waitForFunction(() => !window.__game.paused);

  await page.keyboard.press('h');
  await page.waitForFunction(() => !window.__game.buttonsHidden);
  await expect(page.locator('#hide-buttons')).toHaveText('Hide buttons');
  await expect(page.locator('#game [data-k="jump"]')).toBeVisible();
  await page.locator('#hide-buttons').click();
  await page.waitForFunction(() => window.__game.buttonsHidden);
  await expect(page.locator('#hide-buttons')).toHaveText('Show buttons');
  expect(await page.evaluate(() => localStorage.getItem('dontdie-hide-buttons'))).toBe('hidden');

  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.buttonsHidden && window.__game.state === 'title');
  await expect(page.locator('#hide-buttons')).toHaveText('Show buttons');
  await page.locator('#hide-buttons').click();
  await page.waitForFunction(() => !window.__game.buttonsHidden);
  expect(await page.evaluate(() => localStorage.getItem('dontdie-hide-buttons'))).toBe('shown');

  await page.evaluate(() => {
    const down = new KeyboardEvent('keydown', { key: 'Enter', code: '', bubbles: true, cancelable: true });
    window.dispatchEvent(down);
  });
  await page.waitForFunction(() => window.__game.state === 'play');

  expect(errors).toEqual([]);
  await context.close();
});

test('dpad center key starts the game and back does not navigate away', async ({ browser }) => {
  const { context, page, errors } = await openGame(browser, { pad: false });
  await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'Unidentified', code: '', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { get: () => 23 });
    Object.defineProperty(event, 'which', { get: () => 23 });
    window.dispatchEvent(event);
  });
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.keyboard.press('Escape');
  expect(page.url()).toContain('index.html');
  expect(await page.evaluate(() => window.__game.state)).toBe('play');
  expect(errors).toEqual([]);
  await context.close();
});

test('a saved choice overrides auto-hide, and a touch brings buttons back', async ({ browser }) => {
  const shown = await openGame(browser, { touch: true, pad: true, stored: 'shown' });
  expect(await shown.page.evaluate(() => window.__game.isTouch)).toBe(true);
  await expect.poll(() => shown.page.evaluate(() => window.__game.padConnected)).toBe(true);
  expect(await shown.page.evaluate(() => window.__game.buttonsHidden)).toBe(false);
  await expect(shown.page.locator('#game [data-k="left"]')).toBeVisible();
  expect(shown.errors).toEqual([]);
  await shown.context.close();

  const hidden = await openGame(browser, { touch: true, pad: true });
  await expect.poll(() => hidden.page.evaluate(() => window.__game.buttonsHidden)).toBe(true);
  await expect(hidden.page.locator('#game [data-k="jump"]')).toBeHidden();
  await hidden.page.evaluate(() => window.__pad.set(0, true));
  await hidden.page.waitForFunction(() => window.__game.state === 'play');
  await hidden.page.evaluate(() => window.__pad.set(0, false));
  await shotWhenPromptVisible(hidden.page, 'buttons-hidden.png');
  await hidden.page.evaluate(() => {
    const target = document.querySelector('#game canvas');
    const touch = new Touch({ identifier: 1, target, clientX: 400, clientY: 300, pageX: 400, pageY: 300 });
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch] }));
    target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [touch] }));
  });
  await hidden.page.waitForFunction(() => !window.__game.buttonsHidden);
  await expect(hidden.page.locator('#hide-buttons')).toHaveText('Hide buttons');
  await hidden.page.locator('#hide-buttons').click();
  await hidden.page.waitForFunction(() => window.__game.buttonsHidden);
  await hidden.page.evaluate(() => {
    const target = document.querySelector('#game canvas');
    const touch = new Touch({ identifier: 2, target, clientX: 420, clientY: 280, pageX: 420, pageY: 280 });
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch] }));
  });
  await hidden.page.waitForTimeout(200);
  expect(await hidden.page.evaluate(() => window.__game.buttonsHidden)).toBe(true);
  expect(hidden.errors).toEqual([]);
  await hidden.context.close();
});

test('native=1 ignores getGamepads and plays from the injected controller', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: 'http://127.0.0.1:4173' });
  await context.addInitScript(padMock(true));
  const page = await context.newPage();
  const errors = trackErrors(page);
  await page.goto('/index.html?native=1');
  await page.waitForFunction(() => window.__game && window.__nativePad === true && window.__game.state === 'title');

  await page.evaluate(() => window.__pad.set(9, true));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.state)).toBe('title');
  await page.evaluate(() => window.__pad.reset());

  await page.evaluate(() => {
    const buttons = [];
    buttons[9] = { pressed: true, value: 1 };
    window.__nativeButtons = buttons;
    window.__nativeAxis = 0;
  });
  await page.waitForFunction(() => window.__game.state === 'play');
  expect(await page.evaluate(() => window.__game.paused)).toBe(false);
  await page.evaluate(() => { window.__nativeButtons[9] = { pressed: false, value: 0 }; });
  await page.waitForTimeout(50);

  const x0 = await page.evaluate(() => window.__game.player.x);
  await page.evaluate(() => window.__pad.axis(1));
  await page.waitForTimeout(250);
  expect(Math.abs((await page.evaluate(() => window.__game.player.x)) - x0)).toBeLessThan(12);
  await page.evaluate(() => window.__pad.axis(0));

  await page.evaluate(() => { window.__nativeAxis = 0.9; });
  await page.waitForFunction((start) => window.__game.player.x > start + 30, x0);
  await page.evaluate(() => { window.__nativeAxis = 0; });

  await page.waitForFunction(() => window.__game.player.onGround);
  const y0 = await page.evaluate(() => window.__game.player.y);
  await page.evaluate(() => { window.__nativeButtons[0] = { pressed: true, value: 1 }; });
  await page.waitForFunction((y) => window.__game.player.y < y - 20, y0);
  await page.evaluate(() => { window.__nativeButtons[0] = { pressed: false, value: 0 }; });

  await page.waitForFunction(() => window.__game.player.cool <= 0);
  await page.evaluate(() => { window.__nativeButtons[1] = { pressed: true, value: 1 }; });
  await page.waitForFunction(() => window.__game.lasers.length > 0 || window.__game.player.cool > 0);
  await page.evaluate(() => { window.__nativeButtons[1] = { pressed: false, value: 0 }; });

  await page.evaluate(() => window.__game.forcePause());
  expect(await page.evaluate(() => window.__game.paused)).toBe(true);
  await page.evaluate(() => window.__game.forcePause());
  expect(await page.evaluate(() => window.__game.paused)).toBe(true);

  expect(errors).toEqual([]);
  await context.close();
});
