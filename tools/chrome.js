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
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--use-mock-keychain', '--password-store=basic',
    `--window-size=${width},${height}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const close = async () => {
    proc.kill('SIGTERM');
    await new Promise((r) => { proc.once('exit', r); setTimeout(r, 3000); });
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
    const log = { errors: [], requests: [] };
    cdp.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params || {};
      if (msg.method === 'Runtime.exceptionThrown') log.errors.push(`exception: ${(p.exceptionDetails.exception || {}).description || p.exceptionDetails.text}`);
      if (msg.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) log.errors.push(`console.${p.type}: ${p.args.map((a) => a.value || a.description).join(' ')}`);
      if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') log.errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
      if (msg.method === 'Network.requestWillBeSent') log.requests.push(p.request.url);
    });
    for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await S(`${domain}.enable`);
    await S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    const page = {
      log,
      // A command to the browser itself, not the tab (downloads, for one).
      browser: (method, params) => cdp.send(method, params),
      // A script run before the page's own, at every load from now on.
      addScript: (source) => S('Page.addScriptToEvaluateOnNewDocument', { source }),
      async ev(expression) {
        const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
      async goto(url) {
        await S('Page.navigate', { url });
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
        await S('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left',
          buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, ...extra });
      },
      // `modifiers` as DevTools counts them: 1 ⌥, 2 ⌃, 4 ⌘, 8 ⇧.
      async clickAt(x, y, modifiers = 0) {
        await page.mouse('mouseMoved', x, y, { modifiers });
        await page.mouse('mousePressed', x, y, { modifiers });
        await page.mouse('mouseReleased', x, y, { modifiers });
      },
      // Click what `expr` names in the page: at its middle, or `dx` pixels in from its left.
      async click(expr, dx, modifiers = 0) {
        const at = await page.ev(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: 'nearest' });
          const b = e.getBoundingClientRect(); return { x: b.left + (${dx === undefined ? 'b.width / 2' : dx}), y: b.top + b.height / 2 }; })()`);
        if (!at) throw new Error(`nothing to click: ${expr}`);
        await page.clickAt(at.x, at.y, modifiers);
      },
      async key(key, code, vk, modifiers = 0) {
        const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
        await S('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
        await S('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      },
      async type(text) { await S('Input.insertText', { text }); },
      // Empty the focused box. (On macOS a synthetic ⌘A is not an edit; it goes as the command.)
      async clearBox() {
        await S('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4, commands: ['selectAll'] });
        await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 });
        await S('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, commands: ['deleteBackward'] });
        await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
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
