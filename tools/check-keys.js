#!/usr/bin/env node
// GEDCOM Viewer, the driver's keys read back: what a page receives from `key` and `press` in tools/chrome.js.
//
//     node tools/check-keys.js
//
// Headless Chrome opens a page that writes down every key event it gets (type, key, code and keyCode,
// with ⌘ and ⇧) and every text input, and the keys go in through the driver's own helpers, as the walk
// sends them: letters with their character, Enter, Escape, Backspace, Delete, the arrows, Home, End,
// Page Down and the ⌘ chords the page uses. Each case runs in a Chrome of its own, and its log is read
// after a pause long enough for a key that Chrome sends on again to show itself. The log must hold the
// events a keyboard gives and no more, and the next page must load.
//
// What it caught, in Chrome 154 on macOS, when the driver sent the Windows key code (83 for S, 27 for
// Escape) as nativeVirtualKeyCode: Chrome reads that field as a Mac key code (83 is keypad 1, 27 is
// the minus key), builds a key event of the operating system from it, and gives a key the page does not
// take back to the page again and again, thousands a second, as the key that code names. Sending the
// right Mac code does not stop it; sending no native code does (see `press` in tools/chrome.js).
// Exit 0 when every case passes.
'use strict';
const { launch, sleep } = require('./chrome.js');

const PAUSE_MS = 600;                                                // a key sent on again shows itself in far less
const NEXT = 'data:text/html;charset=utf-8,<title>next</title>';
const PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>keys</title>
<input id="box"><textarea id="area">abc</textarea><button id="btn">button</button>
<script>
  let total = 0;
  const log = [];
  window.takes = () => false;                                        // a page that takes a key stops its default, as the viewer's does
  window.read = () => ({ total, log, box: document.getElementById('box').value, area: document.getElementById('area').value });
  const mods = (e) => (e.metaKey ? ' meta' : '') + (e.shiftKey ? ' shift' : '') + (e.ctrlKey ? ' ctrl' : '') + (e.altKey ? ' alt' : '');
  const note = (e) => {
    total += 1;
    if (log.length < 100) log.push(e instanceof KeyboardEvent ? e.type + ' ' + e.key + ' ' + e.code + ' ' + e.keyCode + mods(e)
      : e.type + ' ' + e.inputType + ' ' + JSON.stringify(e.data));
    if (e.type === 'keydown' && window.takes(e)) e.preventDefault();
  };
  for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input']) window.addEventListener(type, note, true);
</script>`)}`;

// The events of a letter typed with its character, as a keyboard gives them.
const typed = (ch) => {
  const up = ch.toUpperCase();
  return [`keydown ${ch} Key${up} ${up.charCodeAt(0)}`, `keypress ${ch} Key${up} ${ch.charCodeAt(0)}`, `beforeinput insertText "${ch}"`,
    `input insertText "${ch}"`, `keyup ${ch} Key${up} ${up.charCodeAt(0)}`];
};
// A key sent with `key`: its key-down and its key-up.
const sent = (key, code, keyCode, mods = '') => [`keydown ${key} ${code} ${keyCode}${mods}`, `keyup ${key} ${code} ${keyCode}${mods}`];
const deleting = (kind) => [`beforeinput ${kind} null`, `input ${kind} null`];

const CASES = [
  {
    name: 'letters typed with press()',
    focus: 'box',
    run: async (page) => { for (const ch of 'ase') await page.press(ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0), ch); },
    want: [...typed('a'), ...typed('s'), ...typed('e')],
    state: { box: 'ase' },
  },
  {
    name: 'Enter, Backspace, Delete, the arrows, Home, End, Page Down, Escape with key(), in a box holding abc',
    focus: 'area',
    run: async (page) => {
      await page.key('Enter', 'Enter', 13);
      await page.key('Backspace', 'Backspace', 8);
      await page.key('ArrowLeft', 'ArrowLeft', 37);
      await page.key('Delete', 'Delete', 46);
      await page.key('ArrowRight', 'ArrowRight', 39);
      await page.key('ArrowUp', 'ArrowUp', 38);
      await page.key('ArrowDown', 'ArrowDown', 40);
      await page.key('Home', 'Home', 36);
      await page.key('End', 'End', 35);
      await page.key('PageDown', 'PageDown', 34);
      await page.key('Escape', 'Escape', 27);
    },
    want: [...sent('Enter', 'Enter', 13),
      'keydown Backspace Backspace 8', ...deleting('deleteContentBackward'), 'keyup Backspace Backspace 8',
      ...sent('ArrowLeft', 'ArrowLeft', 37),
      'keydown Delete Delete 46', ...deleting('deleteContentForward'), 'keyup Delete Delete 46',
      ...sent('ArrowRight', 'ArrowRight', 39), ...sent('ArrowUp', 'ArrowUp', 38), ...sent('ArrowDown', 'ArrowDown', 40),
      ...sent('Home', 'Home', 36), ...sent('End', 'End', 35), ...sent('PageDown', 'PageDown', 34), ...sent('Escape', 'Escape', 27)],
    state: { area: 'a' },                                            // abc, Backspace, left, Delete: the one letter left
  },
  {
    name: 'chords the page takes, with key(): ⌘L, ⌘Z, ⇧⌘Z, ⌘F, ⌘O, ⌘S, ⇧⌘S, ⌘E',
    takes: '(e) => e.metaKey',
    run: async (page) => {
      await page.key('l', 'KeyL', 76, 4);
      await page.key('z', 'KeyZ', 90, 4);
      await page.key('Z', 'KeyZ', 90, 12);
      await page.key('f', 'KeyF', 70, 4);
      await page.key('o', 'KeyO', 79, 4);
      await page.key('s', 'KeyS', 83, 4);
      await page.key('S', 'KeyS', 83, 12);
      await page.key('e', 'KeyE', 69, 4);
    },
    want: [...sent('l', 'KeyL', 76, ' meta'), ...sent('z', 'KeyZ', 90, ' meta'), ...sent('Z', 'KeyZ', 90, ' meta shift'), ...sent('f', 'KeyF', 70, ' meta'),
      ...sent('o', 'KeyO', 79, ' meta'), ...sent('s', 'KeyS', 83, ' meta'), ...sent('S', 'KeyS', 83, ' meta shift'), ...sent('e', 'KeyE', 69, ' meta')],
  },
  {
    name: 'a chord the page does not take (⌘S): its two events, nothing sent on again',
    run: async (page) => { await page.key('s', 'KeyS', 83, 4); },
    want: sent('s', 'KeyS', 83, ' meta'),
  },
  {
    name: 'Escape, down and up, after typing in a box; the next page loads',
    focus: 'box',
    run: async (page) => { await page.press('a', 'KeyA', 65, 'a'); await page.key('Escape', 'Escape', 27); },
    want: [...typed('a'), ...sent('Escape', 'Escape', 27)],
    loads: true,
  },
  {
    name: 'a letter with no character (raw key-down) in a box; the next page loads',
    focus: 'box',
    run: async (page) => { await page.key('e', 'KeyE', 69); },
    want: sent('e', 'KeyE', 69),
    state: { box: '' },                                           // a key with no character types none
    loads: true,
  },
];

const count = (n) => n.toLocaleString('en-US');
// The log's neighbours that are alike, as "event x N".
function runs(list) {
  const out = [];
  for (const item of list) {
    if (out.length && out[out.length - 1][0] === item) out[out.length - 1][1] += 1;
    else out.push([item, 1]);
  }
  return out.map(([item, n]) => (n > 1 ? `"${item}" x${count(n)}` : `"${item}"`)).join(', ');
}
const within = (promise, ms, text) => Promise.race([promise, sleep(ms).then(() => { throw new Error(text); })]);

let failures = 0;
function check(ok, text) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${text}`);
}

// One case in a Chrome of its own: what the page logged, and whether the next page loaded.
async function walk(c) {
  const { page, close } = await launch();
  try {
    await page.goto(PAGE);
    if (c.takes) await page.ev(`window.takes = ${c.takes}; true`);
    if (c.focus) await page.ev(`(() => { const e = document.getElementById('${c.focus}'); e.focus(); e.setSelectionRange(e.value.length, e.value.length); })()`);
    await c.run(page);
    await sleep(PAUSE_MS);
    const got = await page.ev('window.read()');
    let loads = null;
    if (c.loads) loads = await within(page.goto(NEXT).then(() => true), 10000, 'the next page did not load in 10 s').catch((e) => e.message);
    return { got, loads };
  } catch (e) {
    return { error: e.message };
  } finally {
    await close();
  }
}

(async () => {
  console.log('== the keys of tools/chrome.js, read back by a page');
  for (const c of CASES) {
    const r = await walk(c);
    if (r.error) { check(false, `${c.name}: ${r.error}`); continue; }
    const { got } = r;
    let at = 0;
    while (at < c.want.length && at < got.log.length && c.want[at] === got.log[at]) at += 1;
    const same = got.total === c.want.length && at === c.want.length;
    const state = Object.entries(c.state || {}).filter(([id, value]) => got[id] !== value).map(([id, value]) => `the ${id} reads "${got[id]}", not "${value}"`);
    const keydowns = got.log.filter((x) => x.startsWith('keydown')).map((x) => x.slice(8)).join(' | ');
    if (same && !state.length && (!c.loads || r.loads === true)) {
      check(true, `${c.name}: ${got.total} events, as a keyboard gives them; keydowns read back: ${keydowns}`);
      continue;
    }
    const wrong = same ? '' : `the page logged ${count(got.total)} events where ${c.want.length} are right; the first wrong is no. ${at + 1}: wanted ${c.want[at] ? `"${c.want[at]}"` : 'nothing'}, got ${got.log[at] ? `"${got.log[at]}"` : 'nothing'}`
      + `${got.total > c.want.length ? `; the log runs on: ${runs(got.log.slice(at, at + 40))}${got.total > got.log.length ? ' (and more, past the first 100)' : ''}` : ''}`;
    const rest = [wrong, ...state, c.loads && r.loads !== true ? `the next page did not load (${r.loads})` : ''].filter(Boolean).join('; ');
    check(false, `${c.name}: ${rest}`);
  }
  console.log(failures ? `\n${failures} FAILED` : '\nevery case passes');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(`the check stopped: ${e.message}`);
  process.exit(1);
});
