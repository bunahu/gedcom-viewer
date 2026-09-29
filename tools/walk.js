#!/usr/bin/env node
// gedview — the page, walked: BUILD-BRIEF section 15's read-only walk, and the rest of the page.
//
// Headless Chrome opens the page at its own address (file://), and each file goes in through the
// page's file input, as a person choosing it would. What the page shows is checked against what
// core.js reads from the same file; tools/check-real.js holds core.js to section 3, so the two
// together are the walk's "reads as section 3".
//
//     node tools/walk.js FILE [FILE ...] [--shots DIR]
//
// Every FILE gets the read-only walk, and one edit made in the page only — never saved — timed
// against section 16's 0.3 s and undone. For a real file only counts, tags, ids, line numbers,
// lengths and timings are printed — never a value — and no picture of it is ever taken. Then the
// rest of the page (Records, Search, the keys, a dropped file, a file too long to show) and its
// editing (the facts line, blocks shut and opened, an edit, undo and redo, a line added, a record
// deleted with its pointers) are walked on a fictional file written to the system's temp folder
// and removed after; and, in a browser with its file pickers taken away, Save a copy downloads the
// copy and its log. --shots DIR saves pictures of the fictional files, and of nothing else. Exit
// 0 when every step passes.
//
// Save in place is not walked here: its folder picker and its permission prompts need a person's
// click. tests/save.test.js walks every other step of section 15's editing walk, over in-memory
// files.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../core.js');
const { launch, sleep } = require('./chrome.js');

const ROOT = path.resolve(__dirname, '..');
const BUDGET_MS = 2000;                                              // "it opens in under 2 seconds"
const EDIT_BUDGET_MS = 300;                                          // section 16: one re-check per edit
const fmt = (n) => n.toLocaleString('en-US');

let failures = 0;
function check(ok, text) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${text}`);
}
const skip = (text) => console.log(`  --    ${text}`);

// What the selected row shows, as far as it may be printed: its line number, level, id and tag.
const SELECTED = `(() => { const r = document.querySelector('#grid .row.is-sel'); if (!r) return null;
  const q = (s) => { const e = r.querySelector(s); return e ? e.textContent : null; };
  return { ln: Number(q('.ln').replace(/,/g, '')), lv: q('.lv'), id: q('.id'), tag: q('.tg') }; })()`;
const VISIBLE = (list) => `[...document.querySelectorAll('#${list} .v-inner > div')].filter((r) => r.style.display !== 'none')`;
// A list shown a moment ago is laid out at the next frame; until then it holds one row.
const LAID_OUT = (list) => `(() => { const l = document.getElementById('${list}'); const v = l.querySelector('.v-rows');
  return l.clientHeight > 0 && v.style.height === l.clientHeight + 'px'; })()`;

async function gotoLine(page, n) {
  await page.key('l', 'KeyL', 76, 4);                                // ⌘L
  await page.type(String(n));
  await page.key('Enter', 'Enter', 13);
  await page.waitFor(`(document.querySelector('#grid .row.is-sel .ln') || {}).textContent === ${JSON.stringify(fmt(n))}`);
}

const GRID_TOP = "document.getElementById('grid').scrollTop";

// Press on the scrollbar's thumb at the top, and make sure it is held: a 4-pixel move must scroll
// the grid. A press that misses the thumb starts a text selection instead, which scrolls nothing;
// a hover first, and a longer one each try, is what a hand gives it.
async function grabThumb(page, x, top) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.mouse('mouseMoved', x, top);
    await sleep(300 * attempt);
    await page.mouse('mousePressed', x, top);
    await page.mouse('mouseMoved', x, top + 4, { button: 'left', buttons: 1 });
    if ((await page.ev(GRID_TOP)) > 0) return true;
    await page.mouse('mouseReleased', x, top + 4);
    await page.key('Home', 'Home', 36);
    await page.waitFor(`${GRID_TOP} === 0`);
  }
  return false;
}

// Drag the grid's scrollbar from the top to the end and back, measuring the ink in the grid after
// every step: an empty grid has none.
async function dragScrollbar(page, shoot) {
  const max = await page.ev("(() => { const g = document.getElementById('grid'); return g.scrollHeight - g.clientHeight; })()");
  if (max <= 0) return { max };
  await page.click("document.getElementById('grid')", 200);
  await page.key('Home', 'Home', 36);
  await page.waitFor(`${GRID_TOP} === 0`);
  const r = await page.ev(`(() => { const b = document.getElementById('grid').getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
  const x = r.x + r.width - 7;
  const top = r.y + 8;
  const bottom = r.y + r.height - 8;
  const steps = 10;
  const down = [...Array(steps + 1).keys()].map((k) => top + ((bottom - top) * k) / steps);
  const route = [...down, ...down.slice(0, -1).reverse()];
  if (!(await grabThumb(page, x, top))) return { max, held: false };
  const inks = [];
  const tops = [];
  for (let k = 0; k < route.length; k += 1) {
    await page.mouse('mouseMoved', x, route[k], { button: 'left', buttons: 1 });
    inks.push(await page.ink(r));
    tops.push(await page.ev("document.getElementById('grid').scrollTop"));
    if (shoot) await shoot(k, steps);
  }
  await page.mouse('mouseReleased', x, route[route.length - 1]);
  return { max, held: true, reached: Math.max(...tops), end: tops[tops.length - 1], least: Math.min(...inks), steps: route.length };
}

// A text as the page shows it: ui.js shows a control or line-break character inside a value as a
// short mark — NEL, LS, PS, or the character's control picture.
function shown(text) {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c === 0x85) out += 'NEL';
    else if (c === 0x2028) out += 'LS';
    else if (c === 0x2029) out += 'PS';
    else if (c === 0x7f) out += String.fromCharCode(0x2421);
    else if (c < 0x20 && c !== 0x09 && c !== 0x0a) out += String.fromCharCode(0x2400 + c);
    else out += ch;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Section 15's read-only walk, on one file
// ---------------------------------------------------------------------------------------------

async function readOnlyWalk(page, file) {
  const m = core.read(new Uint8Array(fs.readFileSync(file)));
  console.log(`\n== ${path.basename(file)} — ${fmt(m.n)} lines (counts, tags, ids and line numbers only)`);

  const ms = await page.openFile(file);
  check(ms < BUDGET_MS, `it opens in under 2 seconds: ${fmt(ms)} ms`);

  // the counts bar
  const bar = await page.ev("[...document.querySelectorAll('#counts .count-item')].map((b) => [b.title, b.querySelector('.count-figure').textContent])");
  const expected = core.recordCounts(m).map(([t, n]) => [t, fmt(n)]);
  check(JSON.stringify(bar) === JSON.stringify(expected), `the counts bar reads as the file holds: ${bar.map((c) => c.join(' ')).join(' · ')}`);

  // Checks: the sum, every heading, and a click on a finding
  const fnd = m.findings;
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  await page.click("document.querySelector('.tab[data-panel=checks]')");
  const sum = await page.ev("document.getElementById('checks-sum').textContent");
  check(sum === `${plural(fnd.errors, 'error', 'errors')} · ${plural(fnd.notes, 'note', 'notes')}`, `Checks shows ${sum}`);
  const codes = core.CHECKS.map((c) => c.code).filter((code) => fnd.byCode[code].length);
  if (codes.length) {
    await page.waitFor(LAID_OUT('checks-list'));
    for (let guard = 0; guard < 40; guard += 1) {                    // fold every group, so every heading is in view
      const open = await page.ev(`(() => { const rows = ${VISIBLE('checks-list')};
        return rows.findIndex((r, k) => r.classList.contains('is-head') && rows[k + 1] && !rows[k + 1].classList.contains('is-head')); })()`);
      if (open < 0) break;
      await page.click(`${VISIBLE('checks-list')}[${open}]`);
    }
    const heads = await page.ev(`${VISIBLE('checks-list')}.map((r) => r.firstChild.textContent + ' ' + r.lastChild.textContent)`);
    check(JSON.stringify(heads) === JSON.stringify(codes.map((c) => `${c} ${fmt(fnd.byCode[c].length)}`)), `its headings: ${heads.join(' · ')}`);

    // N1 first, as section 15 has it; else the first check whose first finding is on a line
    const code = ['N1', ...codes].find((c) => fnd.byCode[c].length && fnd.byCode[c][0].line >= 0);
    if (code) {
      const target = fnd.byCode[code][0].line;
      await page.click(`${VISIBLE('checks-list')}.find((r) => r.classList.contains('is-head') && r.firstChild.textContent === '${code}')`);
      await page.click(`(() => { const rows = ${VISIBLE('checks-list')}; return rows[rows.findIndex((r) => r.classList.contains('is-head') && r.firstChild.textContent === '${code}') + 1]; })()`);
      const s = await page.ev(SELECTED);
      check(s.ln === target + 1, `a click on the first ${code} lands on its line: line ${fmt(s.ln)}, level ${s.lv}, tag ${s.tag}`);
    } else skip('every finding is for the whole file; none to click to');
  } else skip('no findings');

  // Indent, on a line with a level above 0
  let sel = await page.ev(SELECTED);
  if (!(Number(sel.lv) > 0)) {
    const deep = m.level.findIndex((lv) => lv > 0);
    if (deep >= 0) await gotoLine(page, deep + 1);
    sel = await page.ev(SELECTED);
  }
  if (Number(sel.lv) > 0) {
    const pad = () => page.ev("getComputedStyle(document.querySelector('#grid .row.is-sel .fd')).paddingLeft");
    const before = await pad();
    await page.click("document.getElementById('indent')");
    const on = await pad();
    await page.click("document.getElementById('indent')");
    const off = await pad();
    check(before === '0px' && parseFloat(on) > 0 && off === '0px', `Indent on and off: a level-${sel.lv} row is set in ${before} → ${on} → ${off}`);
  } else skip('no line above level 0 to set in');

  // the scrollbar, to the end and back
  const d = await dragScrollbar(page);
  if (d.max <= 0) skip('the file fits the view; there is nothing to drag');
  else if (!d.held) check(false, 'the scrollbar: its thumb could not be taken hold of in three tries');
  else {
    check(d.reached >= 0.99 * d.max && d.end === 0, `the scrollbar dragged from 0 to ${fmt(d.reached)} of ${fmt(d.max)} and back to ${d.end}`);
    check(d.least > 0.01, `without a blank screen: the least ink in any of ${d.steps} steps is ${(100 * d.least).toFixed(1)}%`);
  }

  // a pointer followed, and Back
  let from = -1;
  for (let i = 0; i < m.n && from < 0; i += 1) {
    if (core.isPointerLine(m, i) && m.definedAt.has(core.valueOf(m, i))) from = i;
  }
  if (from >= 0) {
    const to = m.definedAt.get(core.valueOf(m, from))[0];
    await gotoLine(page, from + 1);
    await page.click("document.querySelector('#grid .row.is-sel .ptr')");
    await page.waitFor(`(document.querySelector('#grid .row.is-sel .ln') || {}).textContent === ${JSON.stringify(fmt(to + 1))}`);
    const s = await page.ev(SELECTED);
    check(s.id === core.valueOf(m, from) && s.lv === '0', `a pointer followed: line ${fmt(from + 1)} (${m.tag[from]}) → line ${fmt(s.ln)}, ${s.id} ${s.tag}`);
    await page.click("document.getElementById('back')");
    const back = await page.ev(SELECTED);
    check(back.ln === from + 1, `Back returns to line ${fmt(back.ln)} (${back.tag})`);
  } else skip('no pointer to follow');

  // a search for a tag steps through its lines
  const byCount = [...m.tagCounts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  const tag = m.tagCounts.get('CONC') ? 'CONC' : byCount[0][0];
  const total = m.tagCounts.get(tag);
  await page.click("document.querySelector('.tab[data-panel=tags]')");
  await page.waitFor(LAID_OUT('tags-list'));
  // scroll the tag to the top of the list, and let the list redraw before looking for its row
  await page.ev(`(() => { const l = document.getElementById('tags-list');
    l.scrollTop = ${byCount.findIndex(([t]) => t === tag)} * parseFloat(getComputedStyle(l).getPropertyValue('--row-height')); })()`);
  await page.ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
  await page.waitFor(`${VISIBLE('tags-list')}.some((r) => r.firstChild.textContent === '${tag}')`);
  await page.click(`${VISIBLE('tags-list')}.find((r) => r.firstChild.textContent === '${tag}')`);
  const seen = [];
  for (let k = 0; k < Math.min(3, total); k += 1) {
    const s = await page.ev(SELECTED);
    seen.push({ ...s, count: await page.ev("document.getElementById('search-count').textContent") });
    await page.click("document.getElementById('search-next')");
  }
  const stepped = seen.every((s, k) => s.tag === tag && s.count.endsWith(` of ${fmt(total)}`) && (k === 0 || s.ln > seen[k - 1].ln));
  check(stepped, `a search for ${tag} steps through its lines: ${seen.map((s) => `${fmt(s.ln)} (${s.count})`).join(' → ')}`);

  // Go to the last line
  await gotoLine(page, m.n);
  const lastText = await page.ev("document.querySelector('#grid .row.is-sel .tx').textContent");
  const lastSel = await page.ev(SELECTED);
  check(lastText === shown(m.texts[m.n - 1].slice(0, 2000)), `Go to line ${fmt(m.n)} lands on it: ${lastSel.lv === null ? 'a line that did not parse' : `level ${lastSel.lv}, ${lastSel.tag}`}`);

  // the longest line: clipped in the grid, whole in the right pane
  let long = 0;
  for (let i = 1; i < m.n; i += 1) if (m.texts[i].length > m.texts[long].length) long = i;
  await gotoLine(page, long + 1);
  const onScreen = await page.ev(`(() => { const tx = document.querySelector('#grid .row.is-sel .tx'); const v = document.querySelector('#detail .detail-value');
    return { clipped: tx.scrollWidth > tx.clientWidth, row: tx.textContent.length, pane: v ? v.textContent.length : -1 }; })()`);
  const whole = m.valAt[long] >= 0 ? core.valueOf(m, long) : m.texts[long];
  check(onScreen.clipped && onScreen.row <= shown(m.texts[long].slice(0, 2000)).length,
    `the longest line, line ${fmt(long + 1)} (${fmt(core.codePoints(m.texts[long]))} characters), is clipped in the grid: ${fmt(onScreen.row)} shown, cut at the edge`);
  check(onScreen.pane === shown(whole).length, `…and whole in the right pane: ${fmt(onScreen.pane)} characters`);

  await timedEdit(page, m);
}

// One edit, in the page only — never saved: the line halfway down (or the first below it above
// level 0) typed over, timed from Enter until its row shows it changed, the whole file checked
// again in between (section 16: the budget is 0.3 s); then undone. Line numbers and times only.
async function timedEdit(page, m) {
  let at = Math.floor(m.n / 2);
  while (at < m.n - 1 && !(m.level[at] > 0)) at += 1;
  await gotoLine(page, at + 1);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  await page.type(' x');
  const t0 = Date.now();
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  const ms = Date.now() - t0;
  check(ms < EDIT_BUDGET_MS, `an edit on line ${fmt(at + 1)}, in the page only: checked again whole and shown changed in ${fmt(ms)} ms (budget ${EDIT_BUDGET_MS} ms)`);
  await page.key('z', 'KeyZ', 90, 4);                                // ⌘Z
  await page.waitFor("!document.querySelector('#grid .row.is-changed') && document.getElementById('dirty').hidden");
  check(true, '…and undone: nothing is changed, nothing was written');
}

// ---------------------------------------------------------------------------------------------
// The rest of the page, on a fictional file
// ---------------------------------------------------------------------------------------------

// About 313,000 lines of made-up people (PersonN /FixtureM/), with one note of 83,790
// characters and one CONC line holding U+0085.
function fiction() {
  const L = ['0 HEAD', '1 SOUR gedview-walk', '2 VERS 1.0', '1 DATE 28 SEP 2026', '1 GEDC', '2 VERS 5.5.1',
    '1 CHAR UTF-8', '1 SUBM @U1@', '0 @U1@ SUBM', '1 NAME Walk /Fixture/'];
  for (let k = 1; k <= 24000; k += 1) {
    L.push(`0 @I${k}@ INDI`, `1 NAME Person${k} /Fixture${k % 97}/`, `2 GIVN Person${k}`, `2 SURN Fixture${k % 97}`,
      `1 SEX ${k % 2 ? 'F' : 'M'}`, '1 BIRT', `2 DATE ${1 + (k % 28)} JAN ${1800 + (k % 150)}`, '2 PLAC Fixtureville',
      `2 SOUR @S${1 + (k % 500)}@`, `3 PAGE p. ${k}`, k % 3 === 0 ? `1 FAMS @F${Math.ceil(k / 3)}@` : `1 FAMC @F${Math.ceil(k / 3)}@`);
  }
  for (let f = 1; f <= 8000; f += 1) {
    L.push(`0 @F${f}@ FAM`, `1 HUSB @I${3 * f}@`, `1 CHIL @I${3 * f - 2}@`, `1 CHIL @I${3 * f - 1}@`, '1 MARR', `2 DATE ${1820 + (f % 150)}`);
  }
  for (let s = 1; s <= 500; s += 1) {
    L.push(`0 @S${s}@ SOUR`, `1 TITL Fixture Register, volume ${s}`);
    if (s === 7) L.push(`1 NOTE ${'A long fictional note. '.repeat(3643).slice(0, 83790)}`);
    if (s === 9) L.push('1 NOTE the first part of a long value, ', '2 CONC the second part\x85and what came after it', '2 CONC , then the end');
  }
  L.push('0 TRLR');
  return `${L.join('\n')}\n`;
}

async function restOfThePage(page, dir, shots) {
  const file = path.join(dir, 'fiction.ged');
  fs.writeFileSync(file, fiction());
  const m = core.read(new Uint8Array(fs.readFileSync(file)));
  const shot = (name) => (shots ? page.screenshot(path.join(shots, `fiction-${name}.png`)) : null);
  console.log(`\n== the rest of the page, on a fictional file of ${fmt(m.n)} lines`);

  const ms = await page.openFile(file);
  check(ms < BUDGET_MS, `it opens in ${fmt(ms)} ms`);
  await shot('top');

  // Records: the filter box, a figure of the counts bar, a click on a record
  await page.click("document.querySelector('.tab[data-panel=records]')");
  await page.waitFor(LAID_OUT('records-list'));
  await page.click("document.getElementById('records-filter')");
  await page.type('person12345');
  await page.waitFor(`${VISIBLE('records-list')}.length === 2`);
  const found = await page.ev(`${VISIBLE('records-list')}.map((r) => r.firstChild.textContent)`);
  check(JSON.stringify(found) === '["@I12345@","@F4115@"]', `the filter box finds a person, and the family labelled by them: ${found.join(', ')}`);
  await page.click("[...document.querySelectorAll('#counts .count-item')].find((b) => b.title === 'FAM')");
  await page.click("document.getElementById('records-filter')");
  await page.clearBox();
  await page.waitFor(`${VISIBLE('records-list')}.length > 5`);
  const chip = await page.ev("document.getElementById('records-type').hidden ? null : document.getElementById('records-type').textContent");
  const tags = await page.ev(`${VISIBLE('records-list')}.map((r) => r.lastChild.textContent)`);
  check(chip === 'Families ×' && tags.every((t) => t === 'FAM'), `a click on Families shows families only (${chip}; ${tags.length} in view)`);
  await page.click("document.getElementById('records-type')");
  check((await page.ev(`${VISIBLE('records-list')}[0].lastChild.textContent`)) === 'HEAD', 'the chip clears it');
  await page.click(`${VISIBLE('records-list')}.find((r) => r.firstChild.textContent === '@I3@')`);
  let s = await page.ev(SELECTED);
  check(s.id === '@I3@' && s.ln === m.definedAt.get('@I3@')[0] + 1, `a click on a record jumps to it: line ${fmt(s.ln)}, ${s.id}`);

  // ⌘F, a search by text, an id typed whole, Esc
  await page.key('f', 'KeyF', 70, 4);
  check(await page.ev("document.activeElement === document.getElementById('search-box') && !document.getElementById('panel-search').hidden"), '⌘F opens Search, the box ready');
  await page.type('fixtureville');
  await page.key('Enter', 'Enter', 13);
  const count = await page.ev("document.getElementById('search-count').textContent");
  const marks = await page.ev("document.querySelectorAll('#grid mark').length");
  check(count.endsWith(' of 24,000') && marks > 0, `a search by text, case not minded: ${count}, ${marks} found in view`);
  await page.click("document.getElementById('search-box')");
  await page.clearBox();
  await page.type('@I42@');
  await page.key('Enter', 'Enter', 13);
  s = await page.ev(SELECTED);
  check(s.id === '@I42@' && s.lv === '0', `an id typed whole goes to its record first: line ${fmt(s.ln)}`);
  await page.key('Enter', 'Enter', 13);
  s = await page.ev(SELECTED);
  check(s.tag === 'HUSB', `…then Enter steps to the lines that hold it: line ${fmt(s.ln)}, ${s.tag} (${await page.ev("document.getElementById('search-count').textContent")})`);
  await page.key('Escape', 'Escape', 27);
  check(await page.ev("document.activeElement === document.getElementById('grid')"), 'Esc leaves the box for the lines');

  // the keys
  await page.key('End', 'End', 35);
  check((await page.ev(SELECTED)).ln === m.n, 'End goes to the last line');
  await page.key('Home', 'Home', 36);
  await page.key('ArrowDown', 'ArrowDown', 40);
  await page.key('ArrowDown', 'ArrowDown', 40);
  check((await page.ev(SELECTED)).ln === 3, 'Home, then ↓ twice, is line 3');
  await page.key('PageDown', 'PageDown', 34);
  check((await page.ev(SELECTED)).ln > 30, `Page Down moves a page: line ${fmt((await page.ev(SELECTED)).ln)}`);

  // pictures, and the drag, of the fictional file only
  if (shots) {
    await gotoLine(page, m.findings.byCode.N1[0].line + 1);
    await page.click("document.getElementById('indent')");
    await shot('n1-indent');
    await page.click("document.getElementById('indent')");
    let long = 0;
    for (let i = 1; i < m.n; i += 1) if (m.texts[i].length > m.texts[long].length) long = i;
    await gotoLine(page, long + 1);
    await shot('longest');
  }
  const d = await dragScrollbar(page, shots ? async (k, steps) => {
    if (k === Math.floor(steps / 2)) await shot('drag-middle');
    if (k === steps) await shot('drag-end');
  } : null);
  check(d.held && d.reached >= 0.99 * d.max && d.end === 0 && d.least > 0.01, d.held
    ? `the scrollbar dragged from 0 to ${fmt(d.reached)} of ${fmt(d.max)} and back, the least ink ${(100 * d.least).toFixed(1)}%`
    : 'the scrollbar: its thumb could not be taken hold of in three tries');
  const themes = [];
  for (let k = 0; k < 3; k += 1) {
    await page.click("document.getElementById('theme')");
    themes.push(await page.ev("(document.documentElement.className || 'light') + ' ' + getComputedStyle(document.body).backgroundColor"));
    if (k < 2) await shot(themes[k].split(' ')[0]);
  }
  const names = themes.map((t) => t.split(' ')[0]);
  const colours = new Set(themes.map((t) => t.slice(t.indexOf(' ') + 1)));
  check(JSON.stringify(names) === '["sunset","dark","light"]' && colours.size === 3, `the three themes, each its own background: ${themes.join(' → ')}`);

  // a file dropped on the page
  await page.ev(`(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['0 HEAD\\n1 CHAR UTF-8\\n0 @I1@ INDI\\n1 NAME Dropped /Fixture/\\n0 TRLR\\n'], 'dropped.ged'));
    document.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  })()`);
  await page.waitFor("document.getElementById('file-name').textContent === 'dropped.ged'");
  const dropped = await page.ev(`({ markGone: document.getElementById('drop').hidden, rows: ${VISIBLE('grid')}.length })`);
  check(dropped.markGone && dropped.rows === 5, `a dropped file opens (${dropped.rows} lines shown), and the drop mark goes away`);

  // a file of more lines than a page can be tall
  const tooLong = path.join(dir, 'too-long.ged');
  fs.writeFileSync(tooLong, `0 HEAD\n1 CHAR UTF-8\n${'1 NOTE x\n'.repeat(1600000)}0 TRLR\n`);
  await page.openFile(tooLong).catch(() => null);                    // refused: no line is ever selected
  await page.waitFor("!document.getElementById('message').hidden", 30000);
  const message = await page.ev("document.getElementById('message').textContent");
  check(message.includes('1,600,003 lines'), `a file of 1,600,003 lines is refused, plainly: "${message}"`);
}

// ---------------------------------------------------------------------------------------------
// Editing on the page, on the fictional file
// ---------------------------------------------------------------------------------------------

// How many rows the grid has: its whole height in rows.
const ROWS = "(() => { const g = document.getElementById('grid'); return Math.round(g.scrollHeight / parseFloat(getComputedStyle(g).getPropertyValue('--row-height'))); })()";
const ROW_AFTER_SELECTED = "(() => { const r = document.querySelector('#grid .row.is-sel'); const n = r && r.nextElementSibling; return n ? n.querySelector('.ln').textContent : null; })()";
const BUTTON = (where, label) => `[...document.querySelectorAll('${where} button')].find((b) => b.textContent === ${JSON.stringify(label)})`;
const ACTION = (label) => BUTTON('#detail .detail-actions', label);

async function editingOnThePage(page, dir, shots) {
  const file = path.join(dir, 'fiction.ged');
  const bytes = fs.readFileSync(file);
  const m = core.read(new Uint8Array(bytes));
  const shot = (name) => (shots ? page.screenshot(path.join(shots, `fiction-${name}.png`)) : null);
  console.log(`\n== editing on the page, on the fictional file of ${fmt(m.n)} lines`);
  await page.openFile(file);

  // the bar and the facts line
  const opens = await page.ev(`[document.getElementById('open').textContent, document.getElementById('open-empty').textContent]`);
  check(opens.every((o) => o === 'Open GEDCOM'), `the Open buttons read "${opens[0]}"`);
  const facts = await page.ev("document.getElementById('facts').textContent");
  const size = `${(bytes.length / 1e6).toFixed(1)} MB`;
  check(facts === `GEDCOM 5.5.1 · UTF-8 · exported 28 SEP 2026 by gedview-walk 1.0 · ${size} · ${fmt(m.n)} lines · sha256`,
    `the facts line, in the owner's order: ${facts}`);
  const told = await page.ev("document.querySelector('#facts .sha').title");
  check(/fingerprint of the file's exact bytes/.test(told), 'the sha256 says on hover what it is');
  await page.click("document.querySelector('#facts .sha')");
  await page.waitFor("document.querySelector('#facts .hash')");
  const hex = await page.ev("document.querySelector('#facts .hash').textContent");
  check(hex === crypto.createHash('sha256').update(bytes).digest('hex'), `…and, clicked, shows it: ${hex.slice(0, 12)}…, as shasum gives it`);

  // blocks: one shut and opened, every record shut and opened, a hidden line revealed
  const i3 = m.definedAt.get('@I3@')[0];
  await gotoLine(page, i3 + 1);
  await page.click("document.querySelector('#grid .row.is-sel .fold')");
  const shut = { next: await page.ev(ROW_AFTER_SELECTED), hidden: await page.ev("document.querySelector('#grid .row.is-sel .hc').textContent") };
  const end3 = core.subtreeEnd(m, i3);
  check(shut.next === fmt(end3 + 1) && shut.hidden === `${end3 - i3 - 1} lines`,
    `▾ shuts @I3@: the row below it is line ${shut.next}, and it says it holds ${shut.hidden}`);
  await page.key('ArrowRight', 'ArrowRight', 39);
  check((await page.ev(ROW_AFTER_SELECTED)) === fmt(i3 + 2), '→ opens it again');
  const t0 = Date.now();
  await page.click("document.querySelector('#grid .row.is-sel .fold')", undefined, 1);    // ⌥-click
  await page.waitFor(`${ROWS} === ${m.records.length}`);
  check(true, `⌥-click shuts every block at level 0: ${fmt(m.records.length)} rows, one per record, in ${fmt(Date.now() - t0)} ms`);
  await shot('shut');
  const hidden = m.definedAt.get('@I42@')[0] + 9;                   // 3 PAGE, inside @I42@
  await gotoLine(page, hidden + 1);
  const opened = await page.ev(ROWS);
  check(opened === m.records.length + core.subtreeEnd(m, hidden - 9) - (hidden - 9) - 1,
    `Go to line ${fmt(hidden + 1)}, hidden in a shut block, opens the block around it (${fmt(opened)} rows)`);
  await gotoLine(page, i3 + 1);
  await page.click("document.querySelector('#grid .row.is-sel .fold')", undefined, 1);
  await page.waitFor(`${ROWS} === ${m.n}`);
  check(true, `⌥-click on a shut one opens every block again: ${fmt(m.n)} rows`);

  // an edit: Enter, typed, Enter; marked in its row, in Changes and in the right pane
  const name = m.definedAt.get('@I42@')[0] + 1;
  await gotoLine(page, name + 1);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  const inBox = await page.ev("document.querySelector('#grid .row.is-sel input.edit').value");
  check(inBox === m.texts[name], `Enter opens the line for typing, whole: "${inBox}"`);
  await page.type(' Jr');
  let t1 = Date.now();
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  const ms = Date.now() - t1;
  const marked = await page.ev(`({ count: document.getElementById('changes-count').textContent,
    was: (document.querySelector('#detail .detail-was .detail-value') || {}).textContent,
    dirty: !document.getElementById('dirty').hidden, save: !document.getElementById('save').disabled,
    text: document.querySelector('#grid .row.is-sel .tx').textContent })`);
  check(marked.text === `${m.texts[name]} Jr` && ms < EDIT_BUDGET_MS, `Enter keeps it: "${marked.text}", the ${fmt(m.n)} lines checked again in ${fmt(ms)} ms`);
  check(marked.count === '1' && marked.was === m.texts[name] && marked.dirty && marked.save,
    `it shows: its row marked, Changes ${marked.count}, the right pane's Was "${marked.was}", ● by the name, Save on`);
  await shot('edited');
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("!document.querySelector('#grid .row.is-changed')");
  check(await page.ev("document.getElementById('changes-count').textContent === '' && document.getElementById('dirty').hidden"), '⌘Z undoes it: no mark, no ●');
  await page.key('Z', 'KeyZ', 90, 12);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  check(true, '⇧⌘Z redoes it');
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  await page.type(' and more');
  await page.key('Escape', 'Escape', 27);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  check((await page.ev("document.querySelector('#grid .row.is-sel .tx').textContent")) === `${m.texts[name]} Jr`, 'Esc drops what was typed');

  // a line added under the name
  await page.click(ACTION('Add child'));
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  const offered = await page.ev("document.querySelector('#grid input.edit').value");
  await page.type('NOTE added by the walk');
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  const added = await page.ev(`(() => { const r = [...document.querySelectorAll('#grid .row')].find((x) => x.querySelector('.ln') && x.querySelector('.ln').textContent === ${JSON.stringify(fmt(name + 2))});
    return r ? { added: r.classList.contains('is-added'), text: r.querySelector('.tx').textContent } : null; })()`);
  check(offered === '2 ' && added && added.added && added.text === '2 NOTE added by the walk',
    `Add child offers "${offered}" one level deeper; the new line ${fmt(name + 2)} is marked added`);

  // a record deleted with the line that points at it, previewed, then undone
  const record = m.definedAt.get('@I42@')[0];
  await gotoLine(page, record + 1);
  await page.click(ACTION('Delete record'));
  await page.waitFor("document.getElementById('dialog').open");
  const preview = await page.ev(`({ title: document.querySelector('#dialog .dialog-title').textContent,
    ticked: [...document.querySelectorAll('#dialog input[type=checkbox]')].map((b) => b.checked),
    pointers: [...document.querySelectorAll('#dialog .dialog-check .mono')].map((x) => x.textContent) })`);
  check(preview.title === 'Delete @I42@ INDI?' && JSON.stringify(preview.ticked) === '[true]' && preview.pointers[0] === '1 HUSB @I42@',
    `Delete record shows what goes: ${preview.title} — its lines, and ${preview.pointers.join(', ')}, ticked`);
  await shot('delete-record');
  const before = await page.ev(ROWS);
  await page.click(BUTTON('#dialog', 'Delete'));
  await page.waitFor(`${ROWS} === ${before - 13}`);
  const after = await page.ev("document.getElementById('checks-sum').textContent");
  check(after.startsWith('0 errors'), `deleted — 12 lines and the pointer — one step: ${after}, no pointer left pointing at nothing`);
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor(`${ROWS} === ${before}`);
  check(true, '⌘Z brings all of it back');

  // a line with lines under it asks first; Cancel leaves it
  const birt = m.definedAt.get('@I42@')[0] + 5;
  await gotoLine(page, birt + 2);                                    // one line lower: the added line is above it
  await page.key('Backspace', 'Backspace', 8);
  await page.waitFor("document.getElementById('dialog').open");
  const asked = await page.ev("document.querySelector('#dialog .dialog-title').textContent");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(asked === `Delete line ${fmt(birt + 2)}, and the 4 lines under it?` && (await page.ev(ROWS)) === before,
    `⌫ on a line with lines under it asks first — "${asked}" — and Cancel leaves it`);

  // everything undone: the file as it was, nothing to save
  for (let guard = 0; guard < 20 && !(await page.ev("document.getElementById('undo').disabled")); guard += 1) {
    await page.click("document.getElementById('undo')");
  }
  const clean = await page.ev("({ dirty: !document.getElementById('dirty').hidden, count: document.getElementById('changes-count').textContent })");
  check(!clean.dirty && clean.count === '', 'Undo to the start: nothing is changed');
}

// The edges of typing a line, on two of the written files (fictional people): a click elsewhere
// keeps what was typed and still lands where it was pressed; an add left as it was offered adds
// nothing; ← and → go up and down the blocks; a paste holding a line break is refused; a line
// whose bytes could not be read is not opened for typing; Open GEDCOM with changes asks first.
async function editingEdges(page) {
  console.log('\n== the edges of typing a line, on written files');
  const family = path.join(ROOT, 'fixtures', 'synthetic', 'family.ged');
  const m = core.read(new Uint8Array(fs.readFileSync(family)));
  const row = (n) => `[...document.querySelectorAll('#grid .row')].find((r) => r.querySelector('.ln') && r.querySelector('.ln').textContent === '${n}')`;
  const text = (n) => page.ev(`(${row(n)} || {}).textContent`);
  await page.openFile(family);

  await gotoLine(page, 17);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  await page.type('X');
  await page.click(row(20), 60);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  let s = await page.ev(SELECTED);
  check((await page.ev(`${row(17)}.querySelector('.tx').textContent`)) === `${m.texts[16]}X` && s.ln === 20,
    `a click on line 20 while line 17 is typed in keeps what was typed, and lands: line ${s.ln} is selected`);

  await gotoLine(page, 7);
  await page.click(ACTION('Add child'));
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  await page.type('NOTE added');
  await page.click(row(20), 60);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  s = await page.ev(SELECTED);
  check((await page.ev(`${row(8)}.querySelector('.tx').textContent`)) === '2 NOTE added' && s.ln === 21 && s.tag === m.tag[19],
    `…and after an Add child: the new line is 8, and the line clicked, now line ${s.ln} (${s.tag}), is selected`);

  await page.click("document.querySelector('.tab[data-panel=records]')");
  await page.waitFor(LAID_OUT('records-list'));
  await page.click(ACTION('Add sibling'));
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  const rowsBefore = await page.ev(`${VISIBLE('grid')}.length`);
  await page.click(`${VISIBLE('records-list')}.find((r) => r.firstChild.textContent === '@F2@')`);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  s = await page.ev(SELECTED);
  check(s.id === '@F2@' && (await page.ev(`${VISIBLE('grid')}.length`)) === rowsBefore - 1,
    `an add left as it was offered adds nothing, and a click on a record in Records still lands: ${s.id} ${s.tag}`);

  await gotoLine(page, 21);                                          // 2 DATE, under 1 BIRT
  await page.key('ArrowLeft', 'ArrowLeft', 37);
  const up = (await page.ev(SELECTED)).ln;
  await page.key('ArrowLeft', 'ArrowLeft', 37);
  const shut = await page.ev("!!document.querySelector('#grid .row.is-sel .fold.is-shut')");
  await page.key('ArrowRight', 'ArrowRight', 39);
  await page.key('ArrowRight', 'ArrowRight', 39);
  const down = (await page.ev(SELECTED)).ln;
  check(up === 20 && shut && down === 21, `← from line 21 goes up to line ${up}, ← again shuts it; → opens it, → again goes down to line ${down}`);

  await gotoLine(page, 18);
  const shown18 = await page.ev("document.querySelector('#grid .row.is-sel .tx').textContent");
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  await page.ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'two\\nlines');
    document.querySelector('#grid input.edit').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
  const pasted = await page.ev("({ value: document.querySelector('#grid input.edit').value, said: document.getElementById('notice').textContent })");
  check(pasted.value === shown18 && /cannot hold a line break/.test(pasted.said), `a paste holding a line break is refused, and said: "${pasted.said}"`);
  await page.key('Escape', 'Escape', 27);

  await page.click("document.getElementById('open')");
  await page.waitFor("document.getElementById('dialog').open");
  const asked = await page.ev("document.querySelector('#dialog .dialog-title').textContent");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(asked === 'family.ged has changes that are not saved' && !(await page.ev("document.getElementById('dirty').hidden")),
    `Open GEDCOM with changes not saved asks first — "${asked}" — and Cancel keeps them`);
  for (let guard = 0; guard < 10 && !(await page.ev("document.getElementById('undo').disabled")); guard += 1) {
    await page.click("document.getElementById('undo')");
  }

  await page.openFile(path.join(ROOT, 'fixtures', 'synthetic', 'e8-bad-bytes.ged'));
  await gotoLine(page, 8);
  await page.key('Enter', 'Enter', 13);
  const e8 = await page.ev(`({ box: !!document.querySelector('#grid input.edit'), said: document.getElementById('notice').textContent,
    off: ${ACTION('Edit')}.disabled })`);
  check(!e8.box && e8.off && /\(E8\)/.test(e8.said), `a line whose bytes could not be read is not opened for typing, and Edit is off: "${e8.said}"`);
}

// Save in place through the page (10.2), with the folder picker stood in for by a folder held in
// the page's memory: the picker and its permission prompt are a person's clicks, and they are the
// owner's in phase 5; every step after them is walked here. Then the file is changed from outside,
// and Save refuses.
const STAND_IN_FOLDER = `(() => {
  const fail = (name, message) => Object.assign(new Error(message), { name });
  class F {
    constructor(name, bytes) { this.kind = 'file'; this.name = name; this.bytes = bytes || new Uint8Array(0); }
    async getFile() { return new File([this.bytes.slice()], this.name); }
    async createWritable(o = {}) {
      const f = this; let data = o.keepExistingData ? f.bytes.slice() : new Uint8Array(0); let pos = 0;
      return {
        async seek(p) { pos = p; },
        async write(c) {
          const b = typeof c === 'string' ? new TextEncoder().encode(c) : new Uint8Array(c.buffer ? c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) : c);
          if (pos + b.length > data.length) { const d = new Uint8Array(pos + b.length); d.set(data); data = d; }
          data.set(b, pos); pos += b.length;
        },
        async close() { f.bytes = data; },
      };
    }
  }
  class D {
    constructor(name) { this.kind = 'directory'; this.name = name; this.entries = new Map(); }
    async getFileHandle(n, o = {}) {
      const e = this.entries.get(n);
      if (e) { if (e.kind !== 'file') throw fail('TypeMismatchError', n); return e; }
      if (!o.create) throw fail('NotFoundError', n);
      const f = new F(n); this.entries.set(n, f); return f;
    }
    async getDirectoryHandle(n, o = {}) {
      const e = this.entries.get(n);
      if (e) { if (e.kind !== 'directory') throw fail('TypeMismatchError', n); return e; }
      if (!o.create) throw fail('NotFoundError', n);
      const d = new D(n); this.entries.set(n, d); return d;
    }
    async resolve(h) { for (const [n, e] of this.entries) if (e === h) return [n]; return null; }
  }
  window.__folder = new D('folder');
  window.__File = F;
  window.showDirectoryPicker = async () => window.__folder;
  return true;
})()`;
const IN_FOLDER = (p) => `(() => { let e = window.__folder; for (const n of ${JSON.stringify(p)}.split('/')) e = e && e.entries.get(n);
  return e && e.kind === 'file' ? btoa(Array.from(e.bytes, (b) => String.fromCharCode(b)).join('')) : null; })()`;

async function saveInPlace(page, dir) {
  console.log('\n== Save, in place, the folder picker stood in for');
  const file = path.join(dir, 'small.ged');
  const text = '0 HEAD\n1 SOUR gedview-walk\n2 VERS 1.0\n1 DATE 28 SEP 2026\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n' +
    '0 @I1@ INDI\n1 NAME Jane /Fixture/\n1 SEX F\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n';
  fs.writeFileSync(file, text);
  await page.openFile(file);
  await page.ev(STAND_IN_FOLDER);
  await page.ev(`window.__folder.entries.set('small.ged', new window.__File('small.ged', Uint8Array.from(atob(${JSON.stringify(Buffer.from(text).toString('base64'))}), (c) => c.charCodeAt(0))))`);
  await gotoLine(page, 12);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  await page.clearBox();
  await page.type('1 NAME Joe /Fixtures/');
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  await page.click("document.getElementById('save')");
  await page.waitFor("document.getElementById('dialog').open");
  const title = await page.ev("document.querySelector('#dialog .dialog-title').textContent");
  await page.ev("document.querySelector('#dialog .dialog-note input').value = 'Walked.'");
  await page.click(BUTTON('#dialog', 'Save'));
  await page.waitFor("!document.getElementById('notice').hidden && document.getElementById('dirty').hidden");
  const said = await page.ev("document.getElementById('notice').textContent");
  const saved = Buffer.from(await page.ev(IN_FOLDER('small.ged')), 'base64').toString('utf8');
  const backupPath = (said.match(/in (gedview-history\/\S+\.bak)\./) || [])[1];
  const backup = backupPath ? Buffer.from(await page.ev(IN_FOLDER(backupPath)), 'base64').toString('utf8') : null;
  const log = (Buffer.from(await page.ev(IN_FOLDER('small.ged.edits.log')) || '', 'base64').toString('utf8')).split('\n');
  const lines = saved.split('\n');
  check(title === 'Save small.ged' && said.startsWith('Saved.'), `Save: the folder granted, the dialog, then "${said}"`);
  check(backup === text, `the backup, ${backupPath}, is the file as it was`);
  check(lines.slice(10, 16).join(' | ').startsWith('0 @I2@ INDI | 1 NAME Joe /Fixtures/ | 1 CHAN | 2 DATE ') && lines[15] === '2 NOTE Walked.' && lines[16] === '0 TRLR',
    `the file: the edit, and @I2@'s change stamp with the note typed: ${lines.slice(12, 16).join(' · ')}`);
  check(/^=== \S+  save  small\.ged$/.test(log[0]) && log[1] === 'note     Walked.' && log.includes(`backup   ${backupPath}`),
    `the log beside it: "${log[0]}", then its note and its backup`);
  const facts = await page.ev("document.getElementById('facts').textContent");
  check(facts.includes(`${Buffer.byteLength(saved)} B · 17 lines`), `the facts line is the file as saved: ${facts}`);

  await gotoLine(page, 9);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  await page.type(' x');
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("!document.getElementById('dirty').hidden");
  await page.ev(`window.__folder.entries.get('small.ged').bytes = new Uint8Array([...window.__folder.entries.get('small.ged').bytes, ...new TextEncoder().encode('0 @N1@ NOTE from elsewhere\\n')])`);
  await page.click("document.getElementById('save')");
  await page.waitFor("document.getElementById('dialog').open");
  const refused = await page.ev("document.querySelector('#dialog .dialog-title').textContent");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  const after = Buffer.from(await page.ev(IN_FOLDER('small.ged')), 'base64').toString('utf8');
  check(refused === 'small.ged changed on disk since it was opened' && after.endsWith('0 @N1@ NOTE from elsewhere\n'),
    `the file changed from outside: Save refuses — "${refused}" — and writes nothing`);
  await page.click("document.getElementById('undo')");
  await page.waitFor("document.getElementById('dirty').hidden");
}

// Save a copy in a browser with no file pickers (10.3): it downloads the copy under its dated
// name, and then its log block; Save itself is off. The page is loaded again with the pickers
// taken away, on a small fictional file.
async function copyWithoutPickers(page, dir, shots) {
  console.log('\n== Save a copy, in a browser with no file pickers');
  const file = path.join(dir, 'small.ged');
  const text = '0 HEAD\n1 SOUR gedview-walk\n2 VERS 1.0\n1 DATE 28 SEP 2026\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n' +
    '0 @I1@ INDI\n1 NAME Jane /Fixture/\n1 SEX F\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n';
  fs.writeFileSync(file, text);
  const downloads = path.join(dir, 'downloads');
  fs.mkdirSync(downloads);
  await page.browser('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  await page.addScript("for (const k of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) { delete Window.prototype[k]; delete window[k]; }");
  await page.goto(`file://${path.join(ROOT, 'index.html')}`);
  check(await page.ev("!('showSaveFilePicker' in window) && !('showDirectoryPicker' in window)"), 'the page, loaded again with no pickers');
  await page.openFile(file);
  await gotoLine(page, 9);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  await page.clearBox();
  await page.type('1 NAME Jane /Fixtures/');
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  check(await page.ev("document.getElementById('save').disabled && !document.getElementById('save-copy').disabled"),
    'Save is off — this browser cannot write in place — and Save a copy is on');

  await page.click("document.getElementById('save-copy')");
  await page.waitFor("document.getElementById('dialog').open");
  const dialogShows = await page.ev(`({ lines: [...document.querySelectorAll('#dialog .chg-line')].map((l) => l.textContent),
    stamps: [...document.querySelectorAll('#dialog .dialog-stamps > div')].map((d) => d.textContent),
    ticked: document.querySelector('#dialog input[type=checkbox]').checked })`);
  check(JSON.stringify(dialogShows.lines) === JSON.stringify(['−1 NAME Jane /Fixture/', '+1 NAME Jane /Fixtures/']),
    `the Save dialog lists the change: ${dialogShows.lines.join(' / ')}`);
  check(dialogShows.ticked && dialogShows.stamps.length === 1 && dialogShows.stamps[0].startsWith('@I1@ INDI'),
    `…and, ticked, the stamp it will add: ${dialogShows.stamps.join('; ')}`);
  if (shots) await page.screenshot(path.join(shots, 'small-save-dialog.png'));
  await page.click("document.querySelector('#dialog input[type=checkbox]')");         // unticked, for bytes that can be foretold
  await page.click(BUTTON('#dialog', 'Save a copy'));
  const copy = await waitForFile(downloads, /^small\.\d{4}-\d\d-\d\dT\d{6}\.ged$/);
  const doc = core.openDocument(new Uint8Array(Buffer.from(text)));
  core.editLine(doc, 8, '1 NAME Jane /Fixtures/');
  check(copy && Buffer.compare(fs.readFileSync(path.join(downloads, copy)), Buffer.from(core.saveBytes(doc))) === 0,
    `Save a copy downloads ${copy}: the file with its one edit, byte for byte`);
  await page.waitFor("document.getElementById('dialog').open");
  await page.click(BUTTON('#dialog', 'Download its log block'));
  const logName = await waitForFile(downloads, /^small\.ged\.\d{4}-\d\d-\d\dT\d{6}\.edits\.log$/);
  const log = logName ? fs.readFileSync(path.join(downloads, logName), 'utf8').split('\n') : [];
  check(new RegExp(`^=== \\S+  copy  small\\.ged -> ${copy.replace(/\./g, '\\.')}$`).test(log[0] || '') && log.includes('  + 1 NAME Jane /Fixtures/'),
    `…then its log block, as ${logName}: "${log[0]}"`);
  check(await page.ev("!document.getElementById('dirty').hidden"), 'the file itself is untouched, so its changes are still unsaved');
  await page.click("document.getElementById('undo')");
  await page.waitFor("document.getElementById('dirty').hidden");
}

async function waitForFile(dir, pattern, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const hit = fs.readdirSync(dir).find((n) => pattern.test(n));
    if (hit) return hit;
    await sleep(50);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------

(async () => {
  const args = process.argv.slice(2);
  const at = args.indexOf('--shots');
  const shots = at >= 0 ? path.resolve(args.splice(at, 2)[1] || '') : null;
  const files = args;
  if (!files.length) {
    console.error('usage: node tools/walk.js FILE [FILE ...] [--shots DIR]');
    process.exit(2);
  }
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedview-walk-'));
  const { page, close } = await launch();
  try {
    await page.goto(`file://${path.join(ROOT, 'index.html')}`);
    for (const file of files) await readOnlyWalk(page, file);
    await restOfThePage(page, dir, shots);
    await editingOnThePage(page, dir, shots);
    await editingEdges(page);
    await saveInPlace(page, dir);
    await copyWithoutPickers(page, dir, shots);
    console.log('\n== the whole walk');
    check(page.log.errors.length === 0, `no error in the console${page.log.errors.length ? `: ${page.log.errors.join(' | ')}` : ''}`);
    // file:// is the page and its files; blob: is a download the page made of its own bytes
    const off = page.log.requests.filter((u) => !u.startsWith('file://') && !u.startsWith('blob:file://'));
    check(off.length === 0, `nothing left the machine: ${page.log.requests.length} requests, each file:// or a download of the page's own bytes${off.length ? ` — but ${off.join(' ')}` : ''}`);
  } finally {
    await close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (shots) console.log(`\npictures of the fictional file: ${shots}`);
  console.log(failures ? `\n${failures} FAILED` : '\nevery step passes');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(`the walk stopped: ${e.message}`);
  process.exit(1);
});
