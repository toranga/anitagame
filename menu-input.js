/* One menu reader for the picker, DON'T DIE, and SPOOKY FOREST.
   Native buttons, the Gamepad API, and keyboard/remote keys share a
   short debounce so one physical press is counted once. */
(function (global) {
  var WAIT = 60;
  var last = {};
  var queue = [];
  var latch = { x: 0, y: 0 };
  var held = {};

  function allow(name, source) {
    var now = (global.performance && performance.now) ? performance.now() : Date.now();
    var prev = last[name];
    if (prev && now - prev.t < WAIT && prev.source !== source) return false;
    last[name] = { t: now, source: source };
    return true;
  }
  function press(name, source) {
    if (!name || !allow(name, source || "key")) return;
    queue.push(name);
  }
  global.__menuPress = function (name) { press(name, "native"); };

  function num(v) {
    var n = +v;
    return n === n ? n : 0;
  }
  function readPad() {
    if (global.__nativePad) {
      return {
        path: "native",
        axes: [num(global.__nativeAxis), num(global.__nativeAxisY), num(global.__nativeRightX), num(global.__nativeRightY)],
        buttons: global.__nativeButtons || [],
        hatX: num(global.__nativeHatX),
        hatY: num(global.__nativeHatY)
      };
    }
    var list = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].connected) {
        return { path: "gamepad", axes: list[i].axes || [], buttons: list[i].buttons || [], hatX: 0, hatY: 0 };
      }
    }
    return null;
  }
  function btn(pad, i) {
    var b = pad && pad.buttons && pad.buttons[i];
    return !!(b && (b.pressed || b.value > 0.5));
  }
  function onKeyDown(e) {
    var code = e.code || "";
    var kc = e.keyCode || e.which || 0;
    var name = null;
    if (code === "ArrowUp" || kc === 19) name = "up";
    else if (code === "ArrowDown" || kc === 20) name = "down";
    else if (code === "ArrowLeft" || kc === 21) name = "left";
    else if (code === "ArrowRight" || kc === 22) name = "right";
    else if (code === "Enter" || code === "NumpadEnter" || code === "Space" || kc === 23 || kc === 66 || kc === 62) name = "confirm";
    else if (code === "KeyP") name = "start";
    if (!name) return false;
    if (e.cancelable) e.preventDefault();
    press(name, "key");
    return true;
  }
  global.addEventListener("keydown", onKeyDown);

  function poll() {
    var out = { up: 0, down: 0, left: 0, right: 0, confirm: 0, cancel: 0, start: 0, pad: null };
    while (queue.length) {
      var n = queue.shift();
      if (out.hasOwnProperty(n)) out[n] = 1;
    }
    var pad = readPad();
    out.pad = pad;
    if (!pad) return out;
    var ax = pad.axes[0] || 0;
    var ay = pad.axes[1] || 0;
    var sx = 0;
    var sy = 0;
    if (ay < -0.45 || pad.hatY < -0.5 || btn(pad, 12)) sy = -1;
    else if (ay > 0.45 || pad.hatY > 0.5 || btn(pad, 13)) sy = 1;
    if (ax < -0.45 || pad.hatX < -0.5 || btn(pad, 14)) sx = -1;
    else if (ax > 0.45 || pad.hatX > 0.5 || btn(pad, 15)) sx = 1;
    if (sx !== latch.x) {
      latch.x = sx;
      if (sx < 0) press("left", "pad");
      if (sx > 0) press("right", "pad");
    }
    if (sy !== latch.y) {
      latch.y = sy;
      if (sy < 0) press("up", "pad");
      if (sy > 0) press("down", "pad");
    }
    function rise(name, down) {
      var was = !!held[name];
      held[name] = !!down;
      if (down && !was) press(name, "pad");
    }
    rise("confirm", btn(pad, 0) || !!global.__nativeCenter);
    rise("start", btn(pad, 9));
    rise("cancel", btn(pad, 1));
    while (queue.length) {
      var q = queue.shift();
      if (out.hasOwnProperty(q)) out[q] = 1;
    }
    return out;
  }

  function usingController() {
    if (global.__nativePad) return true;
    var ua = navigator.userAgent || "";
    return /AFT|Shield|BRAVIA|Android TV|TV Safari|Leanback/i.test(ua);
  }

  global.MenuInput = { poll: poll, press: press, readPad: readPad, usingController: usingController };
})(window);
