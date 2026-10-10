// gedview — headless Chrome, driven over its DevTools protocol, for tools/walk.js.
//
// Chrome runs with a throwaway profile in the system's temp folder (never beside the page) and
// is always stopped at the end. Node 24's own WebSocket talks to it; nothing is installed.
// CHROME=path picks another Chrome.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const handlers = new Set();
    let id = 0;
    ws.onopen = () => resolve({
      send(method, params = {}, sessionId) {
        id += 1;
        ws.send(JSON.stringify({ id, method, params, sessionId }));
        return new Promise((res, rej) => pending.set(id, { res, rej, method }));
      },
      on(fn) { handlers.add(fn); },
      close() { ws.close(); },
    });
    ws.onerror = (e) => reject(new Error(`DevTools connection: ${e.message || e.type}`));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (!p) return;
        if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`));
        else p.res(msg.result);
      } else for (const fn of handlers) fn(msg);
    };
  });
}

// Chrome, one tab, and the helpers a walk needs. Every console error and every request the page
// makes is collected in `page.log`.
async function launch({ width = 1600, height = 1000 } = {}) {
  if (!fs.existsSync(CHROME)) throw new Error(`no Chrome at ${CHROME} (set CHROME=path)`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gedview-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, ...(process.env.CHROME_FLAGS || '').split(' ').filter(Boolean),
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--use-mock-keychain', '--password-store=basic',
    `--window-size=${width},${height}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // Stopped for good before the next one starts: asked to stop, then killed if it lingers, and
  // gone either way, so two walks never share the machine.
  const close = async () => {
    if (proc.exitCode === null && !proc.killed) proc.kill('SIGTERM');
    await new Promise((r) => { if (proc.exitCode !== null) r(); proc.once('exit', r); setTimeout(r, 3000); });
    if (proc.exitCode === null) {
      proc.kill('SIGKILL');
      await new Promise((r) => { proc.once('exit', r); setTimeout(r, 3000); });
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };
  try {
    const wsUrl = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('Chrome gave no DevTools address')), 20000);
      proc.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(t); res(m[1]); }
      });
    });
    const cdp = await connect(wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (method, params) => cdp.send(method, params, sessionId);
    const log = { errors: [], requests: [], events: [] };
    cdp.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params || {};
      if (msg.method && msg.method.startsWith('Page.')) log.events.push(`${Date.now() % 100000} ${msg.method}`);
      if (msg.method === 'Runtime.exceptionThrown') log.errors.push(`exception: ${(p.exceptionDetails.exception || {}).description || p.exceptionDetails.text}`);
      if (msg.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) log.errors.push(`console.${p.type}: ${p.args.map((a) => a.value || a.description).join(' ')}`);
      if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') log.errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
      if (msg.method === 'Network.requestWillBeSent') log.requests.push(p.request.url);
      if (msg.method === 'Page.javascriptDialogOpening') log.errors.push(`dialog (${p.type}): ${p.message}`);
      if (msg.method === 'Inspector.targetCrashed') log.errors.push('crashed: the page\'s renderer crashed');
      if (msg.method === 'Inspector.detached') log.errors.push(`crashed: the inspector detached (${p.reason})`);
    });
    for (const domain of ['Page', 'Runtime', 'Network', 'Log', 'Inspector']) await S(`${domain}.enable`);
    await S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    // Where the page's script is, for a page that no longer answers: the debugger pauses it and
    // reports the top of the stack (function, file, line) a few times over.
    async function whereIsIt() {
      const scripts = new Map();
      const frames = [];
      cdp.on((msg) => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === 'Debugger.scriptParsed') scripts.set(msg.params.scriptId, msg.params.url.split('/').pop());
        if (msg.method === 'Debugger.paused') {
          const f = msg.params.callFrames[0];
          frames.push(`${f.functionName || '(anonymous)'} ${scripts.get(f.location.scriptId) || '?'}:${f.location.lineNumber + 1}`);
        }
      });
      const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => { throw new Error(`no answer in ${ms} ms`); })]);
      try {
        await within(S('Debugger.enable'), 3000);
        for (let k = 0; k < 3; k += 1) {
          const n = frames.length;
          S('Debugger.pause').catch(() => {});
          await new Promise((r) => { const t0 = Date.now(); const poll = () => { if (frames.length > n || Date.now() - t0 > 3000) r(); else setTimeout(poll, 50); }; poll(); });
          S('Debugger.resume').catch(() => {});
          await sleep(200);
        }
      } catch (e) { frames.push(`(the debugger could not reach it: ${e.message})`); }
      const crashed = log.errors.filter((x) => x.startsWith('crashed')).join('; ');
      return `${frames.length ? frames.join(' | ') : 'no script running (a hang outside script)'}${crashed ? `; ${crashed}` : ''}`;
    }

    // A command the page must acknowledge — an evaluate, a key, a mouse event — within 20 s; past
    // that, where the page is.
    async function answered(promise, what) {
      let timer;
      const hung = new Promise((resolve) => { timer = setTimeout(() => resolve('hung'), 20000); });
      const r = await Promise.race([promise, hung]);
      clearTimeout(timer);
      if (r === 'hung') throw new Error(`the page did not answer ${what} in 20 s; it is at: ${await whereIsIt()}`);
      return r;
    }
    const input = (method, params) => answered(S(method, params), `${method} ${params.type || ''}`);

    const page = {
      log,
      // A command to the tab itself, and the tab's events, for a tool that needs more than the helpers below.
      send: S,
      on: (fn) => cdp.on((msg) => { if (msg.sessionId === sessionId) fn(msg); }),
      // A command to the browser itself, not the tab (downloads, for one).
      browser: (method, params) => cdp.send(method, params),
      // A script run before the page's own, at every load from now on.
      addScript: (source) => S('Page.addScriptToEvaluateOnNewDocument', { source }),
      // Evaluate in the page. A page that does not answer within 20 s is paused by the debugger
      // and asked where it is, so a hang reads as a place in the code, not as silence.
      async ev(expression) {
        const r = await answered(S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }), `evaluate ${expression.slice(0, 60)}`);
        if (r.exceptionDetails) throw new Error(`in the page: ${(r.exceptionDetails.exception || {}).description || r.exceptionDetails.text}`);
        return r.result.value;
      },
      async waitFor(expression, timeout = 10000) {
        const t0 = Date.now();
        for (;;) {
          if (await page.ev(`!!(${expression})`)) return Date.now() - t0;
          if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for: ${expression}`);
          await sleep(10);
        }
      },
      // Navigate, and wait for the new document's load event (polling readyState could answer from
      // the old document, or miss the new one while it loads its scripts).
      async goto(url) {
        const loaded = new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`${url}: not loaded in 30 s`)), 30000);
          cdp.on((msg) => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') { clearTimeout(t); resolve(); } });
        });
        await S('Page.navigate', { url });
        await loaded;
        await page.waitFor("document.readyState === 'complete'");
      },
      // A file into the page's own file input, as a person choosing it would. Returns how long
      // until the page shows it: its name in the bar and a selected line.
      async openFile(file) {
        const { result } = await S('Runtime.evaluate', { expression: "document.getElementById('file-input')" });
        const t0 = Date.now();
        await S('DOM.setFileInputFiles', { files: [path.resolve(file)], objectId: result.objectId });
        await page.waitFor(`document.getElementById('file-name').textContent === ${JSON.stringify(path.basename(file))}
          && document.querySelector('#grid .row.is-sel')`, 20000);
        return Date.now() - t0;
      },
      // `buttons` says which buttons are held: 1 from the press to the release.
      async mouse(type, x, y, extra = {}) {
        await input('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left',
          buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, ...extra });
      },
      // `modifiers` as DevTools counts them: 1 ⌥, 2 ⌃, 4 ⌘, 8 ⇧.
      async clickAt(x, y, modifiers = 0) {
        await page.mouse('mouseMoved', x, y, { modifiers });
        await page.mouse('mousePressed', x, y, { modifiers });
        await page.mouse('mouseReleased', x, y, { modifiers });
      },
      // Click what `expr` names in the page: at the middle of the part of it that can be seen —
      // inside its scrolling frame and the window; a row of the grid is as wide as the longest
      // line (0.5), so its own middle may be far off the screen — or `dx` pixels in from its left.
      async click(expr, dx, modifiers = 0) {
        const at = await page.ev(`(async () => { const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // a layout still pending settles first
          let host = e.parentElement;
          while (host && ['visible', 'clip'].includes(getComputedStyle(host).overflowX)) host = host.parentElement;
          const point = () => {
            const b = e.getBoundingClientRect(); const h = host ? host.getBoundingClientRect() : { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
            const left = Math.max(b.left, h.left, 0); const right = Math.min(b.right, h.right, innerWidth);
            const top = Math.max(b.top, h.top, 0); const bottom = Math.min(b.bottom, h.bottom, innerHeight);
            return { x: ${dx === undefined ? '(left + right) / 2' : 'b.left + dx'.replace('dx', String(dx))}, y: (top + bottom) / 2, b, h };
          };
          let p = point();
          const hits = () => { const under = document.elementFromPoint(p.x, p.y); return under && (e.contains(under) || under.contains(e)); };
          if (!hits() && host && host.scrollLeft > 0) {                // under a part that sticks to the left edge: bring it out
            host.scrollLeft = Math.max(0, host.scrollLeft - p.h.width / 2);
            p = point();
          }
          if (!hits()) {                                               // the page moved under the point: measure once more
            await new Promise((r) => setTimeout(r, 50));
            p = point();
          }
          return { x: p.x, y: p.y }; })()`);
        if (!at) throw new Error(`nothing to click: ${expr}`);
        await page.clickAt(at.x, at.y, modifiers);
      },
      // A key, with no character: its key-down, then its key-up, as for a shortcut or a key that moves
      // (Enter, Escape, the arrows). `vk` is the Windows virtual key code (83 for S, 27 for Escape),
      // which the page reads as the event's keyCode; `key` and `code` are the page's own key and code.
      // `modifiers` as for `clickAt`. No native key code goes with it: see `press` below.
      async key(key, code, vk, modifiers = 0) {
        const base = { key, code, windowsVirtualKeyCode: vk, modifiers };
        await input('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
        await input('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      },
      async type(text) { await input('Input.insertText', { text }); },
      // A key pressed with the character it produces, as a real press in a text box does.
      //
      // Neither this nor `key` sends a native key code (`nativeVirtualKeyCode`). Chrome takes that
      // field as the computer's own code, and on macOS that is a Mac key code (S is 1, Escape 53,
      // Return 36), not the Windows one: 83 is keypad 1, 27 the minus key, 13 the W key. And a
      // native code makes Chrome build a key event of the operating system, to hand the key on to
      // the browser when the page does not take it; with none, Chrome hands nothing on (Chromium's
      // DevTools input handler: no native key event, "due to Mac needing the actual os_event"). In
      // Chrome 154, headless, on macOS, that event came back to the page again and again, thousands
      // a second, as the key the native code names: a ⌘S the page did not take came back as 1,
      // Enter as W, Escape as the minus key, a raw `e` as keypad plus; at times the page then
      // answered nothing, not even the debugger, or could not finish its next navigation. A key
      // the page took (its default stopped, or a character typed in a box) was never sent on,
      // which is why only some keys seemed to hang. The right Mac code does not end it (the same
      // key came back, without end); no native code does. The page still gets all it reads:
      // keyCode from `vk`, key and code from `key` and `code`. tools/check-keys.js sends the keys
      // and reads back what a page receives.
      //
      // What goes with that: a key the page does not take goes no further, so no shortcut of
      // Chrome's own is reached by it; and an editing command (⌘A, select all) is not done by the
      // key, since Chrome takes it as a `commands` entry of the event, which is not sent here.
      async press(key, code, vk, text) {
        const base = { key, code, windowsVirtualKeyCode: vk };
        await input('Input.dispatchKeyEvent', { type: 'keyDown', text, unmodifiedText: text, ...base });
        await input('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      },
      // Empty the focused box: its value set to nothing, and the page told as a keystroke would tell
      // it (an input event). A synthetic ⌘A selects nothing here (see `press`), so there is no ⌘A and
      // Backspace.
      async clearBox() {
        await page.ev("(() => { const b = document.activeElement; if (!b || !('value' in b)) return false; b.value = ''; b.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
      },
      async screenshot(file) {
        const r = await S('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      },
      // The share of a region's pixels that are not its commonest colour: "ink". An empty grid has
      // none. The whole view is captured (a capture with a clip or a scale changes the view for a
      // moment, and that ends a scrollbar drag), the region is cut out and measured in memory, and
      // the picture is kept nowhere.
      async ink(clip) {
        const r = await S('Page.captureScreenshot', { format: 'png' });
        return inkOf(Buffer.from(r.data, 'base64'), clip);
      },
    };
    const stop = async () => {
      try { cdp.close(); } catch (e) { /* already gone */ }
      await close();
    };
    return { page, close: stop };
  } catch (e) {
    await close();
    throw e;
  }
}

// A PNG's pixels (8-bit RGB or RGBA, not interlaced, as Chrome writes them), then the ink in
// `clip`, leaving out the scrollbar at its right edge.
function inkOf(png, clip) {
  let pos = 8;
  let w = 0; let h = 0; let color = 0;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('latin1', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); color = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = color === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 0xff;
    }
    line.copy(px, y * stride);
    prev = line;
  }
  const x0 = Math.max(0, Math.round(clip.x));
  const y0 = Math.max(0, Math.round(clip.y));
  const x1 = Math.min(w, Math.round(clip.x + clip.width) - 15);
  const y1 = Math.min(h, Math.round(clip.y + clip.height));
  const counts = new Map();
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * bpp;
      const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  let bg = 0; let most = 0;
  for (const [k, n] of counts) if (n > most) { most = n; bg = k; }
  const [br, bgr, bb] = [bg >> 16, (bg >> 8) & 0xff, bg & 0xff];
  let ink = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * bpp;
      if (Math.max(Math.abs(px[i] - br), Math.abs(px[i + 1] - bgr), Math.abs(px[i + 2] - bb)) > 40) ink += 1;
    }
  }
  return ink / ((x1 - x0) * (y1 - y0));
}

module.exports = { launch, sleep };
