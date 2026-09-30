#!/usr/bin/env node
// GEDCOM Viewer — the page, walked: BUILD-BRIEF section 15's read-only walk, and the rest of the page.
//
// Headless Chrome opens the page at its own address (file://), and each file goes in through the
// page's file input, as a person choosing it would. What the page shows is checked against what
// core.js reads from the same file; tools/check-real.js holds core.js to section 3, so the two
// together are the walk's "reads as section 3".
//
//     node tools/walk.js FILE [FILE ...] [--shots DIR] [--only PART]
//
// Every FILE gets the read-only walk, and one edit made in the page only — never saved — timed
// against section 16's 0.3 s and undone. For a real file only counts, tags, ids, line numbers,
// lengths and timings are printed — never a value — and no picture of it is ever taken. Then the
// rest of the page (Records, Search, the keys, a dropped file, a file too long to show) and its
// editing (the facts line, blocks shut and opened, an edit, undo and redo, a line added, a record
// deleted with its pointers) are walked on a fictional file written to the system's temp folder
// and removed after; and, in a browser with its file pickers taken away, Save a copy downloads the
// copy and its log. The third round (0.5) is walked on a fictional file of its own: the frames
// hidden and shown across a reload, the lines scrolled sideways, the copy buttons, a _META drawn
// as it reads, blocks and sections dragged, Collapse all, a check's meaning, Back over the lines,
// Bold surnames, a link selected whole, a clipped row's count, and E. --shots DIR saves pictures
// of the fictional files, and of nothing else. --only PART walks one part alone, or several
// named with commas: read-only, rest, editing, edges, third, save, copy. Exit 0 when every step
// passes.
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
  try {
    await page.waitFor(`(document.querySelector('#grid .row.is-sel .ln') || {}).textContent === ${JSON.stringify(fmt(n))}`);
  } catch (e) {                                                      // what the page is doing instead: no value of a line
    const state = await page.ev("({ active: document.activeElement.id || document.activeElement.tagName, goto: document.getElementById('goto').value, selected: (document.querySelector('#grid .row.is-sel .ln') || {}).textContent, dialog: document.getElementById('dialog').open, box: !!document.querySelector('#grid input.edit'), notice: document.getElementById('notice').hidden ? '' : document.getElementById('notice').textContent })").catch((err) => `no answer: ${err.message}`);
    throw new Error(`Go to Line ${fmt(n)} did not land: ${JSON.stringify(state)}`);
  }
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
    await page.ev("document.getElementById('grid').scrollLeft = 0");
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
  // a press that missed the thumb selected text instead, and the grid, which scrolls sideways
  // since 0.5, may have drifted that way: back to the left edge for the steps after
  await page.ev("document.getElementById('grid').scrollLeft = 0");
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
    // a head row: its ▸ ▾ (0.5) opens and shuts its lines, its code is in its .muted span; only
    // head rows are ever printed — a finding's row holds a line of the file
    const HEAD_CODE = "(r) => r.classList.contains('is-head') ? r.querySelector('.muted').textContent : null";
    for (let guard = 0; guard < 40; guard += 1) {                    // fold every group, so every heading is in view
      const open = await page.ev(`(() => { const rows = ${VISIBLE('checks-list')};
        return rows.findIndex((r, k) => r.classList.contains('is-head') && rows[k + 1] && !rows[k + 1].classList.contains('is-head')); })()`);
      if (open < 0) break;
      await page.click(`${VISIBLE('checks-list')}[${open}].querySelector('.fold')`);
    }
    const heads = await page.ev(`${VISIBLE('checks-list')}.filter((r) => r.classList.contains('is-head')).map((r) => r.querySelector('.muted').textContent + ' ' + r.lastChild.textContent)`);
    const subs = await page.ev(`${VISIBLE('checks-list')}.filter((r) => !r.classList.contains('is-head')).length`);
    check(subs === 0 && JSON.stringify(heads) === JSON.stringify(codes.map((c) => `${c} ${fmt(fnd.byCode[c].length)}`)), `its headings: ${heads.join(' · ')}`);

    // N1 first, as section 15 has it; else the first check whose first finding is on a line
    const code = ['N1', ...codes].find((c) => fnd.byCode[c].length && fnd.byCode[c][0].line >= 0);
    if (code) {
      const target = fnd.byCode[code][0].line;
      await page.click(`${VISIBLE('checks-list')}.find((r) => (${HEAD_CODE})(r) === '${code}').querySelector('.fold')`);
      await page.click(`(() => { const rows = ${VISIBLE('checks-list')}; return rows[rows.findIndex((r) => (${HEAD_CODE})(r) === '${code}') + 1]; })()`);
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
    // an empty grid measures 0; the raw export's sparsest rows measured 0.9% at one step of a fast
    // drag (2026-09-30, the same on 0.4.1 and 0.5), so the floor is half of that
    check(d.least > 0.005, `without a blank screen: the least ink in any of ${d.steps} steps is ${(100 * d.least).toFixed(1)}%`);
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

  // the longest line: the grid scrolls sideways to its end (3.1), shows at most 2,000 characters of
  // it and then how many more (3.10); the right pane shows the value whole
  let long = 0;
  for (let i = 1; i < m.n; i += 1) if (m.texts[i].length > m.texts[long].length) long = i;
  await gotoLine(page, long + 1);
  const onScreen = await page.ev(`(() => { const g = document.getElementById('grid'); const r = document.querySelector('#grid .row.is-sel'); const v = document.querySelector('#detail .detail-value');
    return { wide: g.scrollWidth > g.clientWidth, row: r.querySelector('.tx').textContent.length, more: (r.querySelector('.more') || {}).textContent || '', pane: v ? v.textContent.length : -1 }; })()`);
  const whole = m.valAt[long] >= 0 ? core.valueOf(m, long) : m.texts[long];
  const clip = core.clip(m.texts[long], 2000);
  check(onScreen.wide && onScreen.row === shown(m.texts[long].slice(0, clip.end)).length && onScreen.more === (clip.more ? `… ${fmt(clip.more)} more` : ''),
    `the longest line, line ${fmt(long + 1)} (${fmt(core.codePoints(m.texts[long]))} characters): the grid scrolls sideways to its end, the row showing ${fmt(onScreen.row)}${onScreen.more ? ` and "${onScreen.more}"` : ''}`);
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
  await page.click("document.getElementById('edit')");                // Edit on
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
  await page.click("document.getElementById('edit')");                // Edit off
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
  check(d.held && d.reached >= 0.99 * d.max && d.end === 0 && d.least > 0.005, d.held
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
  const dropped = await page.ev(`({ markGone: document.getElementById('drop').hidden, rows: ${VISIBLE('grid')}.filter((r) => !r.classList.contains('is-section')).length })`);
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

// How many rows the grid has: its whole height in rows, as its last layout measured it (the view
// and the room below it, set together) — or, when they all fit in the view, the rows drawn.
const ROWS = `(() => { const g = document.getElementById('grid'); const h = parseFloat(getComputedStyle(g).getPropertyValue('--row-height'));
  const spare = parseFloat(g.querySelector('.v-spacer').style.height) || 0;
  const view = parseFloat(g.querySelector('.v-rows').style.height) || 0;
  return spare > 0 ? Math.round((spare + view) / h) : [...g.querySelectorAll('.v-inner > div')].filter((r) => r.style.display !== 'none').length; })()`;
const ROW_AFTER_SELECTED = "(() => { const r = document.querySelector('#grid .row.is-sel'); const n = r && r.nextElementSibling; return n ? n.querySelector('.ln').textContent : null; })()";
const BUTTON = (where, label) => `[...document.querySelectorAll('${where} button')].find((b) => b.textContent === ${JSON.stringify(label)})`;
const ACTION = (label) => BUTTON('#detail .detail-actions', label);

async function editingOnThePage(page, dir, shots) {
  const file = path.join(dir, 'fiction.ged');
  if (!fs.existsSync(file)) fs.writeFileSync(file, fiction());       // walked alone, without restOfThePage
  const bytes = fs.readFileSync(file);
  const m = core.read(new Uint8Array(bytes));
  const shot = (name) => (shots ? page.screenshot(path.join(shots, `fiction-${name}.png`)) : null);
  console.log(`\n== editing on the page, on the fictional file of ${fmt(m.n)} lines`);
  await page.openFile(file);

  // the name, the file's name, its facts behind it; Open GEDCOM gone from the top bar
  const bar = await page.ev(`({ title: document.querySelector('.app-title').textContent, window: document.title,
    open: document.getElementById('open').hidden, empty: document.getElementById('open-empty').textContent,
    facts: document.getElementById('facts').hidden, name: document.getElementById('file-name').textContent })`);
  check(bar.title === 'GEDCOM Viewer' && bar.window === 'fiction.ged — GEDCOM Viewer',
    `the name: "${bar.title}" in the top bar, "${bar.window}" in the window's title`);
  check(bar.open && bar.empty === 'Open GEDCOM', 'with a file open, Open GEDCOM is not in the top bar');
  await page.click("document.getElementById('file-name')");
  const facts = await page.ev("[...document.getElementById('facts').children].map((x) => x.textContent)");
  const size = `${(bytes.length / 1e6).toFixed(1)} MB`;
  check(bar.facts && JSON.stringify(facts) === JSON.stringify(['GEDCOM 5.5.1', 'UTF-8', 'exported 28 SEP 2026', 'by gedview-walk 1.0', size,
    `${fmt(m.n)} lines`, 'sha256', 'Open another GEDCOM…']), `the facts, hidden until the name is clicked: ${facts.join(' · ')}`);
  const goes = [];
  for (const [k, text] of [[0, 'GEDCOM 5.5.1'], [1, 'UTF-8'], [2, 'exported'], [3, 'by']]) {
    await page.click(`document.querySelectorAll('#facts .fact.is-link')[${k}]`);
    const s = await page.ev(SELECTED);
    goes.push(`${text} → line ${s.ln} (${s.tag})`);
  }
  check(goes.join(', ') === 'GEDCOM 5.5.1 → line 6 (VERS), UTF-8 → line 7 (CHAR), exported → line 4 (DATE), by → line 2 (SOUR)',
    `each fact goes to the line it came from: ${goes.join(', ')}`);
  const told = await page.ev("document.querySelector('#facts .sha').title");
  check(/fingerprint of the file's exact bytes/.test(told), 'the sha256 says on hover what it is');
  await page.click("document.querySelector('#facts .sha')");
  await page.waitFor("document.querySelector('#facts .hash')");
  const hex = await page.ev("document.querySelector('#facts .hash').textContent");
  check(hex === crypto.createHash('sha256').update(bytes).digest('hex'), `…and, clicked, shows it: ${hex.slice(0, 12)}…, as shasum gives it`);
  await page.click("document.getElementById('file-name')");
  check(await page.ev("document.getElementById('facts').hidden"), 'a second click on the name hides them');

  // sections: a row between record types; one shut; every one shut; opened by a jump
  const types = [];
  for (const line of m.records) if (!types.length || types[types.length - 1].tag !== m.tag[line]) types.push({ tag: m.tag[line], from: line });
  types.forEach((s, k) => { s.to = k + 1 < types.length ? types[k + 1].from : m.n; });
  const sectionRows = types.length - 1;
  check((await page.ev(ROWS)) === m.n + sectionRows && (await page.ev("document.querySelectorAll('#grid .row.is-section').length")) > 0,
    `a row between each two record types: ${sectionRows} of them (${types.map((s) => s.tag).join(' · ')})`);
  const indi = types.find((s) => s.tag === 'INDI');
  await gotoLine(page, indi.from);                                   // the row above the section, so it is in view
  await page.click(`[...document.querySelectorAll('#grid .row.is-section')].find((r) => r.querySelector('.tg').textContent === 'INDI')`);
  const shutIndi = await page.ev(`({ rows: ${ROWS}, text: [...document.querySelectorAll('#grid .row.is-section')].find((r) => r.querySelector('.tg').textContent === 'INDI').textContent })`);
  check(shutIndi.rows === m.n + sectionRows - (indi.to - indi.from),
    `a click on the INDI row shuts every person into it: "${shutIndi.text.trim()}"`);
  await page.click(`[...document.querySelectorAll('#grid .row.is-section')].find((r) => r.querySelector('.tg').textContent === 'INDI')`);
  await page.waitFor(`${ROWS} === ${m.n + sectionRows}`);
  await page.click(`[...document.querySelectorAll('#grid .row.is-section')].find((r) => r.querySelector('.tg').textContent === 'INDI')`, undefined, 1);
  const head = types[0].to - types[0].from;
  await page.waitFor(`${ROWS} === ${head + sectionRows}`);
  check(true, `⌥-click shuts every section: ${head + sectionRows} rows — the header's ${head} lines, and one row per type`);
  await shot('sections');
  await gotoLine(page, indi.from + 3);
  check((await page.ev(`${ROWS} === ${head + sectionRows + indi.to - indi.from}`)) && (await page.ev(SELECTED)).ln === indi.from + 3,
    `Go to line ${fmt(indi.from + 3)} opens the INDI section around it`);
  await page.key('Home', 'Home', 36);                                // the top, where the SUBM row is
  await page.click(`[...document.querySelectorAll('#grid .row.is-section')].find((r) => r.querySelector('.tg').textContent === 'SUBM')`, undefined, 1);
  await page.waitFor(`${ROWS} === ${m.n + sectionRows}`);
  check(true, `⌥-click on a shut one opens every section again: ${fmt(m.n + sectionRows)} rows`);

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
  await page.waitFor(`${ROWS} === ${m.records.length + sectionRows}`);
  check(true, `⌥-click shuts every block at level 0: one row per record, ${fmt(m.records.length)}, in ${fmt(Date.now() - t0)} ms`);
  await shot('shut');
  const hidden = m.definedAt.get('@I42@')[0] + 9;                   // 3 PAGE, inside @I42@
  await gotoLine(page, hidden + 1);
  const opened = await page.ev(ROWS);
  check(opened === m.records.length + sectionRows + core.subtreeEnd(m, hidden - 9) - (hidden - 9) - 1,
    `Go to line ${fmt(hidden + 1)}, hidden in a shut block, opens the block around it (${fmt(opened)} rows)`);
  await gotoLine(page, i3 + 1);
  await page.click("document.querySelector('#grid .row.is-sel .fold')", undefined, 1);
  await page.waitFor(`${ROWS} === ${m.n + sectionRows}`);
  check(true, `⌥-click on a shut one opens every block again: ${fmt(m.n)} lines`);

  // Go to Line…: a range shows those lines alone; × brings them all back
  const placeholder = await page.ev("document.getElementById('goto').placeholder");
  await page.key('l', 'KeyL', 76, 4);
  await page.type('105-117');
  const go = await page.ev("!document.getElementById('goto-go').hidden");
  await page.key('Enter', 'Enter', 13);
  await page.waitFor(`${ROWS} === 13`);
  const shown = await page.ev(`${VISIBLE('grid')}.map((r) => r.querySelector('.ln').textContent)`);
  const clear = await page.ev("!document.getElementById('goto-clear').hidden");
  check(placeholder === 'Go to Line…' && go && clear && shown[0] === '105' && shown[shown.length - 1] === '117',
    `"${placeholder}" — 105-117 (Go shown while typed) shows lines ${shown[0]}–${shown[shown.length - 1]} alone, and ×`);
  await page.click("document.getElementById('goto-clear')");
  await page.waitFor(`${ROWS} === ${m.n + sectionRows}`);
  check(await page.ev("document.getElementById('goto-clear').hidden && document.getElementById('goto').value === ''"), '× shows every line again');

  // Edit off: Enter and a double-click do not edit; the double-click highlights a word, and it holds
  const name = m.definedAt.get('@I42@')[0] + 1;
  await gotoLine(page, name + 1);
  await page.key('Enter', 'Enter', 13);
  const at = await page.ev(`(() => { const t = [...document.querySelectorAll('#grid .row.is-sel .tx .val')][0]; const b = t.getBoundingClientRect(); return { x: b.left + 12, y: b.top + b.height / 2 }; })()`);
  for (const count of [1, 2]) {
    await page.mouse('mousePressed', at.x, at.y, { clickCount: count });
    await page.mouse('mouseReleased', at.x, at.y, { clickCount: count });
  }
  await sleep(100);
  const readOnly = await page.ev("({ box: !!document.querySelector('#grid input.edit'), word: window.getSelection().toString(), actions: !!document.querySelector('#detail .detail-actions') })");
  check(!readOnly.box && readOnly.word === 'Person42' && !readOnly.actions,
    `with Edit off, Enter and a double-click edit nothing; the double-click highlights "${readOnly.word}", and it holds to be copied`);

  // Edit on: a double-click types over the line; kept, it is marked in its row, in Changes and in the right frame
  await page.click("document.getElementById('edit')");
  const labels = await page.ev("[...document.querySelectorAll('#detail .detail-actions button')].map((b) => b.textContent)");
  check(JSON.stringify(labels) === JSON.stringify(['Edit line', 'Add inside', 'Add after', 'Delete line', 'Delete record']),
    `Edit on: the right frame offers ${labels.join(' · ')}`);
  for (const count of [1, 2]) {
    await page.mouse('mousePressed', at.x, at.y, { clickCount: count });
    await page.mouse('mouseReleased', at.x, at.y, { clickCount: count });
  }
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  const inBox = await page.ev("document.querySelector('#grid .row.is-sel input.edit').value");
  check(inBox === m.texts[name], `a double-click opens the line for typing, whole: "${inBox}"`);
  await page.ev("(() => { const i = document.querySelector('#grid input.edit'); i.setSelectionRange(i.value.length, i.value.length); })()");
  await page.type(' Jr');
  const t1 = Date.now();
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  const ms = Date.now() - t1;
  const marked = await page.ev(`({ count: document.getElementById('changes-count').textContent,
    was: (document.querySelector('#detail .detail-was .detail-value') || {}).textContent,
    dirty: !document.getElementById('dirty').hidden, save: !document.getElementById('save').disabled,
    text: document.querySelector('#grid .row.is-sel .tx').textContent })`);
  check(marked.text === `${m.texts[name]} Jr` && ms < EDIT_BUDGET_MS, `Enter keeps it: "${marked.text}", the ${fmt(m.n)} lines checked again in ${fmt(ms)} ms`);
  check(marked.count === '1' && marked.was === m.texts[name] && marked.dirty && marked.save,
    `it shows: its row marked, Changes ${marked.count}, the right frame's Was "${marked.was}", ● by the name, Save on`);
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

  // a line added inside the name's block
  await page.click(ACTION('Add inside'));
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  const offered = await page.ev("document.querySelector('#grid input.edit').value");
  await page.type('NOTE added by the walk');
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  const added = await page.ev(`(() => { const r = [...document.querySelectorAll('#grid .row')].find((x) => x.querySelector('.ln') && x.querySelector('.ln').textContent === ${JSON.stringify(fmt(name + 2))});
    return r ? { added: r.classList.contains('is-added'), text: r.querySelector('.tx').textContent } : null; })()`);
  check(offered === '2 ' && added && added.added && added.text === '2 NOTE added by the walk',
    `Add inside offers "${offered}", one level deeper; the new line ${fmt(name + 2)} is marked added`);

  // a record deleted with the line that points at it, previewed; with Edit on, its lines stay,
  // struck through; one run restored; the rest undone
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
  await page.waitFor("document.querySelector('#grid .row.is-removed')");
  const struck = await page.ev(`({ rows: ${ROWS}, first: (document.querySelector('#grid .row.is-removed') || {}).textContent, errors: document.getElementById('checks-sum').textContent })`);
  check(struck.rows === before - 1 && struck.first === `${fmt(record + 1)}0 @I42@ INDI` && struck.errors.startsWith('0 errors'),
    `deleted — 12 lines and the pointer, one step, ${struck.errors.split(' · ')[0]} — and with Edit on the 11 the file holds, and the pointer, stay where they were, struck through; the line added a moment ago was never in the file, and is simply gone`);
  await shot('removed');
  await page.click("document.getElementById('edit')");
  const readRows = await page.ev(ROWS);
  await page.click("document.getElementById('edit')");
  check(readRows === before - 13, `with Edit off they are gone from the lines (${fmt(before - readRows)} fewer rows), a red rule where they were`);
  await page.click("document.querySelector('#grid .row.is-removed')");
  const offer = await page.ev("[...document.querySelectorAll('#detail .detail-actions button')].map((b) => b.textContent)");
  await page.click(ACTION(offer[0]));
  await page.waitFor("document.getElementById('changes-count').textContent === '1'");
  const back = await page.ev(`(${SELECTED}).id`);
  check(offer[0] === 'Restore 11 lines' && back === '@I42@', `a struck line clicked offers "${offer[0]}"; restored, @I42@ is back in its place`);
  await page.key('z', 'KeyZ', 90, 4);
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("document.getElementById('changes-count').textContent === '2'");
  check(true, '⌘Z takes back the restore, then the delete');

  // a line with lines under it asks first; Cancel leaves it
  const birt = m.definedAt.get('@I42@')[0] + 5;
  await gotoLine(page, birt + 2);                                    // one line lower: the added line is above it
  await page.key('Backspace', 'Backspace', 8);
  await page.waitFor("document.getElementById('dialog').open");
  const asked = await page.ev("document.querySelector('#dialog .dialog-title').textContent");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(asked === `Delete line ${fmt(birt + 2)}, and the 4 lines under it?`, `⌫ on a line with lines under it asks first — "${asked}" — and Cancel leaves it`);

  // everything undone: the file as it was, nothing to save; Edit off
  for (let guard = 0; guard < 20 && !(await page.ev("document.getElementById('undo').disabled")); guard += 1) {
    await page.click("document.getElementById('undo')");
  }
  const clean = await page.ev("({ dirty: !document.getElementById('dirty').hidden, count: document.getElementById('changes-count').textContent })");
  check(!clean.dirty && clean.count === '', 'Undo to the start: nothing is changed');
  await page.click("document.getElementById('edit')");
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
  await page.openFile(family);
  await page.click("document.getElementById('edit')");               // Edit on

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
  await page.click(ACTION('Add inside'));
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  await page.type('NOTE added');
  await page.click(row(20), 60);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  s = await page.ev(SELECTED);
  check((await page.ev(`${row(8)}.querySelector('.tx').textContent`)) === '2 NOTE added' && s.ln === 21 && s.tag === m.tag[19],
    `…and after an Add inside: the new line is 8, and the line clicked, now line ${s.ln} (${s.tag}), is selected`);

  await page.click("document.querySelector('.tab[data-panel=records]')");
  await page.waitFor(LAID_OUT('records-list'));
  await page.click(ACTION('Add after'));
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

  await page.key('o', 'KeyO', 79, 4);                                // ⌘O
  await page.waitFor("document.getElementById('dialog').open");
  const asked = await page.ev("document.querySelector('#dialog .dialog-title').textContent");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(asked === 'family.ged has changes that are not saved' && !(await page.ev("document.getElementById('dirty').hidden")),
    `⌘O, to open another file, with changes not saved asks first — "${asked}" — and Cancel keeps them`);
  for (let guard = 0; guard < 10 && !(await page.ev("document.getElementById('undo').disabled")); guard += 1) {
    await page.click("document.getElementById('undo')");
  }

  await page.openFile(path.join(ROOT, 'fixtures', 'synthetic', 'e8-bad-bytes.ged'));
  await page.click("document.getElementById('edit')");
  await gotoLine(page, 8);
  await page.key('Enter', 'Enter', 13);
  const e8 = await page.ev(`({ box: !!document.querySelector('#grid input.edit'), said: document.getElementById('notice').textContent,
    off: ${ACTION('Edit line')}.disabled })`);
  check(!e8.box && e8.off && /\(E8\)/.test(e8.said), `a line whose bytes could not be read is not opened for typing, and Edit is off: "${e8.said}"`);
}

// ---------------------------------------------------------------------------------------------
// The third round (0.5), on a fictional file of its own
// ---------------------------------------------------------------------------------------------

// The _META of a Find a Grave record, as batch 20's export has them (fictional people): the same
// shapes tests/screen.test.js draws, here through the page's own DOMParser.
const escapeXml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const META_STORY = [
  '<p>Jane <strong>Fixture</strong> was born in <em>Fixtureville</em>.<br>She lived there.</p>',
  '<p><span style="font-size:12pt"><font face="Arial">A span and a font, unwrapped.</font></span></p>',
  '<table border="1"><tr><th colspan="2">Head</th></tr><tr><td>a</td><td bgcolor="red">b</td></tr></table>',
  '<p>A link: <a href="https://example.org/grave/1">the record</a>. An image: <img src="https://example.org/photo.jpg"></p>',
  '<!-- a comment --><style>p { color: red }</style><script>document.title = "loaded"</script><w:WordDocument><w:View>Normal</w:View></w:WordDocument>',
];
const META = `<metadataxml><content>${META_STORY.map((l) => `<line>${escapeXml(l)}</line>`).join('')}</content>` +
  '<transcription>Line one&#10;Line two</transcription>' +               // the line break as a character reference: a GEDCOM line holds none
  '<personas><persona><pname>Jane Fixture</pname><bdate>1 Jan 1900</bdate><bplace>Fixtureville</bplace><ddate>2 Feb 1950</ddate><dplace>Fixture City</dplace></persona>' +
  '<persona><pname>Joe Fixture</pname></persona></personas><cemetery>Fixture Cemetery</cemetery><record_source_gid>12345</record_source_gid></metadataxml>';

// Fictional people, bunched by type; a person with two NAME lines; a note holding a web address
// and a pointer; a line of 2,500 characters; a media record with a _META split over CONC lines.
function thirdFiction() {
  const L = ['0 HEAD', '1 SOUR gedview-walk', '2 VERS 1.0', '1 DATE 30 SEP 2026', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 SUBM @U1@',
    '0 @U1@ SUBM', '1 NAME Walk /Fixture/',
    '0 @I1@ INDI', '1 NAME Jane /Fixture/', '2 GIVN Jane', '1 NAME Janie /Fixture/', '1 SEX F', '1 BIRT', '2 DATE 1 JAN 1900', '2 PLAC Fixtureville',
    '1 NOTE See https://example.org/fixture/jane (the register), then www.example.org.', '1 FAMS @F1@',
    '0 @I2@ INDI', '1 NAME Joe /Fixture/', '1 SEX M', '1 FAMS @F1@',
    '0 @I3@ INDI', '1 NAME Ada /Fixture/', '1 FAMC @F1@', `1 NOTE ${'x'.repeat(2493)}`,
    '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I1@', '1 CHIL @I3@',
    '0 @F2@ FAM', '1 HUSB @I2@',
    '0 @O1@ OBJE', '1 FILE fixture.jpg', '2 TITL A grave'];
  const pieces = META.match(/[\s\S]{1,200}/g);
  L.push(`1 _META ${pieces[0]}`);
  for (const piece of pieces.slice(1)) L.push(`2 CONC ${piece}`);
  L.push('0 TRLR');
  return `${L.join('\n')}\n`;
}

// A press on `from`, a move to `to`, a release: what a hand does to drag a row. `via` is a point
// on the way, so the drag starts before the pointer reaches the edge.
async function dragRow(page, from, to) {
  await page.mouse('mouseMoved', from.x, from.y);
  await page.mouse('mousePressed', from.x, from.y);
  await page.mouse('mouseMoved', from.x, from.y + 8, { button: 'left', buttons: 1 });
  await page.mouse('mouseMoved', to.x, to.y, { button: 'left', buttons: 1 });
  await sleep(50);
  const mid = await page.ev("({ line: !document.querySelector('#grid .drop-line').hidden, dim: document.querySelectorAll('#grid .row.is-dragging').length })");
  await page.mouse('mouseReleased', to.x, to.y);
  return mid;
}

const ROW_RECT = (n) => `(() => { const r = [...document.querySelectorAll('#grid .row')].find((x) => x.querySelector('.ln') && x.querySelector('.ln').textContent === ${JSON.stringify(fmt(n))});
  if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + 160, y: b.top + b.height / 2, top: b.top, bottom: b.bottom }; })()`;
const SECTION_RECT = (tag) => `(() => { const r = [...document.querySelectorAll('#grid .row.is-section')].find((x) => x.querySelector('.tg').textContent === '${tag}');
  if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + 160, y: b.top + b.height / 2, top: b.top, bottom: b.bottom }; })()`;
const CHANGES = "[...document.querySelectorAll('#changes-list .v-inner > div')].filter((r) => r.style.display !== 'none').map((r) => r.querySelector('.main').textContent)";

async function thirdRound(page, dir, shots) {
  const file = path.join(dir, 'third.ged');
  fs.writeFileSync(file, thirdFiction());
  const m = core.read(new Uint8Array(fs.readFileSync(file)));
  const shot = (name) => (shots ? page.screenshot(path.join(shots, `third-${name}.png`)) : null);
  console.log(`\n== the third round (0.5), on a fictional file of ${fmt(m.n)} lines`);
  await page.openFile(file);
  const line = (text) => m.texts.indexOf(text) + 1;

  // 3.7 — Back over the lines, naming the line it returns to; none in the top bar
  const famsLine = line('1 FAMS @F1@');
  const hiddenBefore = await page.ev("document.getElementById('back').hidden && document.getElementById('back').closest('.middle') !== null && !document.querySelector('.bar #back')");
  await gotoLine(page, famsLine);                                    // a jump: Back now has line 1 to go to
  await page.click("document.querySelector('#grid .row.is-sel .ptr')");
  try {
    await page.waitFor("(document.querySelector('#grid .row.is-sel .id') || {}).textContent === '@F1@'");
  } catch (e) {                                                      // the fictional file: its state may be printed
    const why = await page.ev(`(() => { const p = document.querySelector('#grid .row.is-sel .ptr'); const g = document.getElementById('grid'); const b = p ? p.getBoundingClientRect() : null;
      const under = b ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
      return { ptr: b && [b.left, b.top, b.width, b.height].map(Math.round), under: under && (under.className || under.tagName), scroll: [g.scrollLeft, g.scrollTop], grid: g.getBoundingClientRect().toJSON(),
        selected: (document.querySelector('#grid .row.is-sel .ln') || {}).textContent, back: document.getElementById('back').textContent, backHidden: document.getElementById('back').hidden, hasBack: document.querySelector('.middle').className,
        notice: document.getElementById('notice').hidden ? '' : document.getElementById('notice').textContent, active: document.activeElement.id || document.activeElement.className }; })()`).catch((err) => `no answer: ${err.message}`);
    throw new Error(`the pointer click did not jump: ${JSON.stringify(why)}`);
  }
  const backText = await page.ev("document.getElementById('back').hidden ? null : document.getElementById('back').textContent");
  await page.click("document.getElementById('back')");
  const returned = await page.ev(SELECTED);
  const thenText = await page.ev("document.getElementById('back').textContent");
  check(hiddenBefore && backText === `← Back to ${fmt(famsLine)}` && returned.ln === famsLine && thenText === '← Back to 1',
    `Back sits over the lines at the main frame's top left, not in the top bar, only while there is somewhere to go: "${backText}", then back on line ${fmt(returned.ln)}, then "${thenText}"`);

  // 3.5 — Collapse all, Expand all
  const sectionRows = new Set(m.records.map((i) => m.tag[i])).size - 1;
  const label1 = await page.ev("document.getElementById('fold-all').textContent");
  await page.click("document.getElementById('fold-all')");
  await page.waitFor(`${ROWS} === ${m.records.length + sectionRows}`);
  const label2 = await page.ev("document.getElementById('fold-all').textContent");
  await page.click("document.querySelector('#grid .row.is-section')");                 // one type shut by hand
  await page.click("document.getElementById('fold-all')");
  await page.waitFor(`${ROWS} === ${m.n + sectionRows}`);
  const label3 = await page.ev("document.getElementById('fold-all').textContent");
  check(label1 === 'Collapse all' && label2 === 'Expand all' && label3 === 'Collapse all',
    `${label1} shuts every record to its first line (${fmt(m.records.length + sectionRows)} rows); ${label2} opens every block and every type (${fmt(m.n + sectionRows)} rows)`);

  // 3.8 — Bold surnames: the labels, not the lines; the filter finds a name either way
  await page.click("document.querySelector('.tab[data-panel=records]')");
  await page.waitFor(LAID_OUT('records-list'));
  await page.click("document.getElementById('records-filter')");
  await page.type('jane fixture');
  await page.waitFor(`${VISIBLE('records-list')}.length === 2`);
  const found = await page.ev(`${VISIBLE('records-list')}.map((r) => r.firstChild.textContent)`);
  await page.click("document.getElementById('surnames')");
  await gotoLine(page, line('1 NAME Jane /Fixture/'));
  const bold = await page.ev(`({ pressed: document.getElementById('surnames').getAttribute('aria-pressed'),
    list: ${VISIBLE('records-list')}.map((r) => [...r.querySelectorAll('.surname')].map((x) => x.textContent).join('|')),
    listText: ${VISIBLE('records-list')}[0].querySelector('.main').textContent,
    row: document.querySelector('#grid .row.is-sel .tx').textContent,
    detail: (document.querySelector('#detail .surname') || {}).textContent, value: document.querySelector('#detail .detail-value').textContent })`);
  await page.click("document.getElementById('surnames')");
  check(JSON.stringify(found) === '["@I1@","@F1@"]' && bold.pressed === 'true' && bold.list[0] === 'Fixture' && bold.listText.startsWith('Jane Fixture')
    && bold.row === '1 NAME Jane /Fixture/' && bold.detail === 'Fixture' && bold.value === 'Jane /Fixture/',
    `"jane fixture" finds ${found.join(' and ')} with the toggle off; on, Records reads "${bold.listText}" with Fixture in bold, and the line stays "${bold.row}"`);
  await page.click("document.getElementById('records-filter')");
  await page.clearBox();
  await page.key('Escape', 'Escape', 27);

  // 3.6 — a check's title shows what it means; the ▸ ▾ at its left opens and shuts its lines
  await page.click("document.querySelector('.tab[data-panel=checks]')");
  await page.waitFor(LAID_OUT('checks-list'));
  const headN4 = `${VISIBLE('checks-list')}.find((r) => r.classList.contains('is-head') && r.querySelector('.muted').textContent === 'N4')`;
  const rowsBefore = await page.ev(`${VISIBLE('checks-list')}.length`);
  await page.click(`${headN4}.querySelector('.main')`);
  const help = await page.ev("(() => { const h = document.querySelector('#detail .help'); return h ? { code: h.querySelector('.help-code').textContent, text: h.querySelector('.help-text').textContent, rows: " + `${VISIBLE('checks-list')}.length` + " } : null; })()");
  await page.click(`${headN4}.querySelector('.fold')`);
  const rowsAfter = await page.ev(`${VISIBLE('checks-list')}.length`);
  check(help && help.code === 'N4' && help.text.startsWith('GEDCOM 5.5 allows a line of at most 255 characters') && help.rows === rowsBefore && rowsAfter === rowsBefore - 1,
    `a click on "Over 255 characters" shows in the right frame what N4 means ("${help ? help.text.slice(0, 48) : ''}…") and opens nothing; its ▾ shuts its ${rowsBefore - rowsAfter} line`);
  await page.click(`${headN4}.querySelector('.fold')`);

  // 3.10 — a clipped row says how many characters are not shown; 3.1 — the grid scrolls sideways,
  // and the line number stays at the left edge
  const longLine = m.texts.findIndex((t) => t.length > 2000) + 1;
  await gotoLine(page, longLine);
  const clipped = await page.ev(`(() => { const r = document.querySelector('#grid .row.is-sel'); const g = document.getElementById('grid');
    return { tail: (r.querySelector('.more') || {}).textContent, shown: r.querySelector('.tx').textContent.length, pane: document.querySelector('#detail .detail-value').textContent.length,
      wide: g.scrollWidth > g.clientWidth, help: !document.querySelector('#detail .help') }; })()`);
  await page.ev("document.getElementById('grid').scrollLeft = 300");
  await sleep(50);
  const scrolled = await page.ev(`(() => { const r = document.querySelector('#grid .row.is-sel'); const g = document.getElementById('grid').getBoundingClientRect();
    return { left: g.left, fx: r.querySelector('.fx').getBoundingClientRect().left, tx: r.querySelector('.tx').getBoundingClientRect().left, at: document.getElementById('grid').scrollLeft }; })()`);
  await page.ev("document.getElementById('grid').scrollLeft = 0");
  check(clipped.tail === '… 500 more' && clipped.shown === 2000 && clipped.pane === 2493 && clipped.help,
    `line ${fmt(longLine)}, 2,500 characters: the row shows 2,000 and ends "${clipped.tail}"; the right frame shows the value whole (${fmt(clipped.pane)}); a line selected puts the check's meaning away`);
  check(clipped.wide && scrolled.at === 300 && Math.abs(scrolled.fx - scrolled.left) < 1 && scrolled.tx < scrolled.left,
    `the main frame scrolls sideways (${scrolled.at} px): the line number stays at the left edge, the text goes under it`);
  await shot('sideways');

  // 3.1 — the side frames hidden and shown, and remembered across a reload
  await page.click("document.getElementById('hide-left')");
  await page.click("document.getElementById('hide-right')");
  const hidden = await page.ev("({ cls: document.getElementById('work').className, side: getComputedStyle(document.getElementById('side')).display, detail: getComputedStyle(document.getElementById('detail')).display, tab: document.getElementById('hide-left').textContent + document.getElementById('hide-right').textContent })");
  await shot('frames-hidden');
  await page.goto(`file://${path.join(ROOT, 'index.html')}`);
  const remembered = await page.ev("document.getElementById('work').className");
  await page.click("document.getElementById('hide-left')");
  await page.ev("document.getElementById('split-right').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
  const shown = await page.ev("({ cls: document.getElementById('work').className, tab: document.getElementById('hide-left').textContent + document.getElementById('hide-right').textContent })");
  check(hidden.cls === 'work left-hidden right-hidden' && hidden.side === 'none' && hidden.detail === 'none' && hidden.tab === '›‹',
    `‹ and › hide the left bar and the right frame (${hidden.cls}), and flip (${hidden.tab})`);
  check(remembered === 'work left-hidden right-hidden' && shown.cls === 'work' && shown.tab === '‹›',
    `hidden or shown is remembered across a reload (${remembered}); the tab, and a double-click on the bar, bring them back (${shown.cls || 'both shown'})`);
  await page.openFile(file);

  // 3.2 — a copy button on every box of text: the value, Joined, and each part of a _META
  await page.ev("navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }");
  await gotoLine(page, line('1 NAME Jane /Fixture/'));
  await page.click("document.querySelector('#detail .detail-value .copy')");
  await page.waitFor("window.__copied !== undefined");
  const copied = await page.ev("({ text: window.__copied, done: document.querySelector('#detail .detail-value .copy').classList.contains('is-done') })");
  await page.ev("navigator.clipboard.writeText = () => Promise.reject(new Error('refused'))");
  await page.click("document.querySelector('#detail .detail-value .copy')");
  await page.waitFor("!document.getElementById('notice').hidden");
  const refused = await page.ev("({ said: document.getElementById('notice').textContent, selected: window.getSelection().toString() })");
  check(copied.text === 'Jane /Fixture/' && copied.done, `the value's copy button copies "${copied.text}" and shows a check mark`);
  check(/clipboard refused/.test(refused.said) && refused.selected.trim() === 'Jane /Fixture/', `with the clipboard refused, the text is selected and a notice says so: "${refused.said}"`);
  await page.click("document.getElementById('notice')");
  await page.ev("navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }");

  // 3.3 — the _META drawn as it reads, above Joined; nothing loads
  const metaLine = m.texts.findIndex((t) => t.startsWith('1 _META')) + 1;
  await gotoLine(page, metaLine + 2);                                // one of its CONC lines
  const drawn = await page.ev(`(() => { const d = document.getElementById('detail');
    const titles = [...d.querySelectorAll('.detail-title')].map((t) => t.textContent);
    const story = d.querySelector('.meta-story');
    return { titles, strong: story && story.querySelector('strong') ? story.querySelector('strong').textContent : null,
      gone: story ? [...story.querySelectorAll('*')].map((e) => e.nodeName.toLowerCase()).filter((n) => n.includes(':') || ['a', 'img', 'script', 'style', 'span', 'font'].includes(n)).join(',') : 'no story',
      colspan: story ? (story.querySelector('th') || {}).getAttribute('colspan') : null, red: story ? story.innerHTML.includes('red') : null,
      text: story ? story.innerText : '', persons: d.querySelectorAll('.persons tr').length - 1,
      person: d.querySelector('.persons tr:nth-child(2)') ? [...d.querySelectorAll('.persons tr:nth-child(2) td')].map((x) => x.textContent).join(' · ') : '',
      transcription: (d.querySelector('.meta-text') || {}).textContent, copies: d.querySelectorAll('.copy').length, title: document.title }; })()`);
  await page.click("document.querySelector('#detail .meta-story .copy')");
  await page.waitFor("typeof window.__copied === 'string' && window.__copied.includes('Fixtureville')");
  const storyCopied = await page.ev('window.__copied');
  check(JSON.stringify(drawn.titles) === JSON.stringify(['Story', 'Transcription', 'Persons', 'Cemetery', 'Record id', 'Joined', 'Pointed at by 0'].slice(0, 6)) || drawn.titles.slice(0, 6).join('|') === 'Story|Transcription|Persons|Cemetery|Record id|Joined',
    `a CONC line of the _META: the right frame draws Story · Transcription · Persons · Cemetery · Record id above Joined (${drawn.titles.join(' · ')})`);
  check(drawn.strong === 'Fixture' && drawn.gone === '' && drawn.colspan === '2' && drawn.red === false && drawn.text.includes('the record (https://example.org/grave/1)') && drawn.text.includes('[image]'),
    `the story keeps its bold, its table (colspan ${drawn.colspan}) and its text; the link is text with its address, the image is [image]; no link, image, script, style, span, font or Word element survives`);
  check(drawn.persons === 2 && drawn.person === 'Jane Fixture · 1 Jan 1900 · Fixtureville · 2 Feb 1950 · Fixture City' && drawn.transcription === 'Line one\nLine two' && drawn.copies >= 6,
    `the persons as a table (${drawn.person}); the transcription with its line break; a copy button on each of the ${drawn.copies} boxes`);
  check(drawn.title === 'third.ged — GEDCOM Viewer' && storyCopied.includes('She lived there.'), 'the script inside the story never ran, and the story copies as text');
  await shot('meta');

  // 3.9 — a double-click selects a web address whole; with ⌥, a pointer whole, and nothing jumps
  const noteLine = line('1 NOTE See https://example.org/fixture/jane (the register), then www.example.org.');
  await gotoLine(page, noteLine);
  const urlAt = await page.ev(`(() => { const v = document.querySelector('#grid .row.is-sel .val'); const t = v.firstChild; const r = document.createRange();
    r.setStart(t, 10); r.setEnd(t, 11); const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 }; })()`);
  for (const count of [1, 2]) {
    await page.mouse('mousePressed', urlAt.x, urlAt.y, { clickCount: count });
    await page.mouse('mouseReleased', urlAt.x, urlAt.y, { clickCount: count });
  }
  await sleep(60);
  const url = await page.ev('window.getSelection().toString()');
  await gotoLine(page, famsLine);
  const ptrAt = await page.ev("(() => { const b = document.querySelector('#grid .row.is-sel .ptr').getBoundingClientRect(); return { x: b.left + 8, y: b.top + b.height / 2 }; })()");
  for (const count of [1, 2]) {
    await page.mouse('mousePressed', ptrAt.x, ptrAt.y, { clickCount: count, modifiers: 1 });
    await page.mouse('mouseReleased', ptrAt.x, ptrAt.y, { clickCount: count, modifiers: 1 });
  }
  await sleep(60);
  const ptr = await page.ev(`({ text: window.getSelection().toString(), line: (${SELECTED}).ln })`);
  check(url === 'https://example.org/fixture/jane', `a double-click on an address selects it whole: "${url}"`);
  check(ptr.text === '@F1@' && ptr.line === famsLine, `⌥ and a double-click on a pointer select it whole ("${ptr.text}"), and nothing jumps (still line ${fmt(ptr.line)})`);

  // 3.4a — a block dragged among its siblings; a section dragged past another; Esc; own place
  await page.click("document.getElementById('edit')");
  const birt = line('1 BIRT');
  const nameLine = line('1 NAME Jane /Fixture/');
  await gotoLine(page, nameLine);
  const fromRect = await page.ev(ROW_RECT(birt));
  const toRect = await page.ev(ROW_RECT(nameLine));
  const mid = await dragRow(page, fromRect, { x: toRect.x, y: toRect.top + 2 });
  await page.waitFor("document.getElementById('changes-count').textContent === '1'");
  const moved = await page.ev(`({ rows: [...document.querySelectorAll('#grid .row')].filter((r) => r.querySelector('.ln') && ['${fmt(nameLine)}', '${fmt(nameLine + 1)}', '${fmt(nameLine + 2)}'].includes(r.querySelector('.ln').textContent)).map((r) => r.querySelector('.tx').textContent + (r.classList.contains('is-moved') ? ' [moved]' : '')),
    changes: ${CHANGES}, detail: (document.querySelector('#detail .detail-moved') || {}).textContent, sum: document.getElementById('changes-sum').textContent,
    rule: document.querySelectorAll('#grid .row.is-moved-above').length, dirty: !document.getElementById('dirty').hidden })`);
  check(mid.line && mid.dim === 3, `a press on 1 BIRT moved a few pixels takes hold of its block: its 3 lines dim and a gold line shows at the NAME's edge`);
  check(JSON.stringify(moved.rows) === JSON.stringify(['1 BIRT [moved]', '2 DATE 1 JAN 1900 [moved]', '2 PLAC Fixtureville [moved]']) && moved.changes[0] === 'moved: BIRT · 3 lines' && moved.detail === `Moved · line ${fmt(birt)} as saved` && moved.rule === 1 && moved.dirty,
    `released, the block stands before the NAME, marked moved; Changes reads "${moved.changes[0]}" (${moved.sum}); the right frame says "${moved.detail}"; a rule marks where it was taken from`);
  await shot('moved');
  await page.key('Z', 'KeyZ', 90, 12);                               // ⇧⌘Z: nothing to redo yet — a no-op
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("document.getElementById('changes-count').textContent === ''");
  check(true, '⌘Z undoes the move in one step');

  // two NAME lines: the second dragged first; the Save dialog says the first is read as preferred
  const name2 = line('1 NAME Janie /Fixture/');
  await gotoLine(page, name2);
  const r2 = await page.ev(ROW_RECT(name2));
  const r1 = await page.ev(ROW_RECT(nameLine));
  await dragRow(page, r2, { x: r1.x, y: r1.top + 2 });
  await page.waitFor("document.getElementById('changes-count').textContent === '1'");
  await page.key('S', 'KeyS', 83, 12);                               // ⇧⌘S: the Save a copy dialog, to read, then Cancel
  await page.waitFor("document.getElementById('dialog').open");
  const dialogSays = await page.ev("({ lines: [...document.querySelectorAll('#dialog .chg, #dialog .chg-line')].map((x) => x.textContent), stamps: (document.querySelector('#dialog .dialog-check span') || {}).textContent })");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(dialogSays.lines[0].startsWith('moved') && dialogSays.lines[1] === 'NAME · 1 line · among its 2 NAME lines the first is read as preferred' && dialogSays.stamps === 'Change stamps · 1 record',
    `the second NAME dragged first: the Save dialog says "${dialogSays.lines[1]}", and the record is stamped (${dialogSays.stamps})`);
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("document.getElementById('changes-count').textContent === ''");

  // a section dragged: FAM before INDI, by its type row; no stamp
  await page.key('Home', 'Home', 36);
  const famRow = await page.ev(SECTION_RECT('FAM'));
  const indiRow = await page.ev(SECTION_RECT('INDI'));
  const secMid = await dragRow(page, famRow, { x: indiRow.x, y: indiRow.top + 2 });
  await page.waitFor("document.getElementById('changes-count').textContent === '1'");
  const section = await page.ev(`({ order: [...document.querySelectorAll('#grid .row.is-section')].map((r) => r.querySelector('.tg').textContent), changes: ${CHANGES}, first: (${SELECTED}).id })`);
  await page.key('S', 'KeyS', 83, 12);
  await page.waitFor("document.getElementById('dialog').open");
  const secDialog = await page.ev("(document.querySelector('#dialog .dialog-check span') || {}).textContent");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(secMid.line && secMid.dim >= 1 && JSON.stringify(section.order.slice(0, 4)) === '["SUBM","FAM","INDI","OBJE"]' && section.changes[0] === 'moved: section FAM · 2 records · 6 lines' && secDialog === 'Change stamps · none needed',
    `the FAM row dragged to the INDI row's edge: the 2 families now stand before the people (${section.order.join(' · ')}); Changes reads "${section.changes[0]}"; ${secDialog}`);
  await shot('section-moved');
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("document.getElementById('changes-count').textContent === ''");

  // a record lands only among its own type; Esc lets go; a release over its own place moves nothing
  const i1 = line('0 @I1@ INDI');
  await gotoLine(page, i1);
  const i1Rect = await page.ev(ROW_RECT(i1));
  const f2Rect = await page.ev(ROW_RECT(line('0 @F2@ FAM')));
  await page.mouse('mouseMoved', i1Rect.x, i1Rect.y);
  await page.mouse('mousePressed', i1Rect.x, i1Rect.y);
  await page.mouse('mouseMoved', i1Rect.x, i1Rect.y + 8, { button: 'left', buttons: 1 });
  await page.mouse('mouseMoved', f2Rect.x, f2Rect.y, { button: 'left', buttons: 1 });
  await sleep(50);
  const overFam = await page.ev("(() => { const l = document.querySelector('#grid .drop-line'); const b = l.getBoundingClientRect(); return { line: !l.hidden, y: b.top }; })()");
  await page.key('Escape', 'Escape', 27);
  await page.mouse('mouseReleased', f2Rect.x, f2Rect.y);
  const afterEsc = await page.ev(`({ changes: document.getElementById('changes-count').textContent, dim: document.querySelectorAll('#grid .row.is-dragging').length, order: [...document.querySelectorAll('#grid .row.is-section')].map((r) => r.querySelector('.tg').textContent).join(',') })`);
  const famTop = await page.ev(SECTION_RECT('FAM'));
  check(overFam.line && Math.abs(overFam.y - famTop.top) < 2, `a person dragged down to the families: the gold line stays at the last edge among the people (the FAM row's top), never inside another type`);
  check(afterEsc.changes === '' && afterEsc.dim === 0, 'Esc lets go: nothing moves, nothing dims');
  const own = await dragRow(page, i1Rect, { x: i1Rect.x, y: i1Rect.y + 6 });
  check(!own.line && (await page.ev("document.getElementById('changes-count').textContent")) === '' && (await page.ev(`(${SELECTED}).id`)) === '@I1@',
    'released where it already is — no gold line — it moves nothing');
  await page.click("document.getElementById('edit')");

  // 3.11 — E turns Edit on and off; not while a box is typed in. Last, and the box left by a
  // click: see `press` in tools/chrome.js for what a synthetic key can do to headless Chrome.
  await page.press('e', 'KeyE', 69, 'e');                            // a real press: the key with its character
  const on = await page.ev("document.getElementById('edit').getAttribute('aria-pressed')");
  await page.press('e', 'KeyE', 69, 'e');
  const off = await page.ev("document.getElementById('edit').getAttribute('aria-pressed')");
  await page.click("document.getElementById('goto')");
  await page.clearBox();
  await page.press('e', 'KeyE', 69, 'e');
  const inBox = await page.ev("({ pressed: document.getElementById('edit').getAttribute('aria-pressed'), typed: document.getElementById('goto').value })");
  await page.clearBox();
  await page.click("document.querySelector('#grid .row')");
  check(on === 'true' && off === 'false' && inBox.pressed === 'false' && inBox.typed === 'e',
    `E turns Edit on (${on}), E again off (${off}); in a box it types (Edit ${inBox.pressed}, the box holds "${inBox.typed}"); ⌘E is not taken`);
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

// Enter on the selected line, and the box to type it in: what the page is doing instead, if not.
async function openEditBox(page) {
  await page.key('Enter', 'Enter', 13);
  try {
    await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  } catch (e) {
    const why = await page.ev("({ active: document.activeElement.id || document.activeElement.className || document.activeElement.tagName, box: !!document.querySelector('#grid input.edit'), editing: document.getElementById('edit').getAttribute('aria-pressed'), selected: (document.querySelector('#grid .row.is-sel .ln') || {}).textContent, notice: document.getElementById('notice').hidden ? '' : document.getElementById('notice').textContent, dialog: document.getElementById('dialog').open, hasFocus: document.hasFocus() })").catch((err) => `no answer: ${err.message}`);
    throw new Error(`Enter did not open the line for typing: ${JSON.stringify(why)}`);
  }
}

async function saveInPlace(page, dir) {
  console.log('\n== Save, in place, the folder picker stood in for');
  const file = path.join(dir, 'small.ged');
  const text = '0 HEAD\n1 SOUR gedview-walk\n2 VERS 1.0\n1 DATE 28 SEP 2026\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n' +
    '0 @I1@ INDI\n1 NAME Jane /Fixture/\n1 SEX F\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n';
  fs.writeFileSync(file, text);
  await page.openFile(file);
  await page.click("document.getElementById('edit')");
  await page.ev(STAND_IN_FOLDER);
  await page.ev(`window.__folder.entries.set('small.ged', new window.__File('small.ged', Uint8Array.from(atob(${JSON.stringify(Buffer.from(text).toString('base64'))}), (c) => c.charCodeAt(0))))`);
  await gotoLine(page, 12);
  await openEditBox(page);
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
  const backupPath = (said.match(/in (gedcom-viewer-history\/\S+\.bak)\./) || [])[1];
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
  await openEditBox(page);
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
  await page.click("document.getElementById('edit')");
  await gotoLine(page, 9);
  await openEditBox(page);
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
  const onlyAt = args.indexOf('--only');
  const only = onlyAt >= 0 ? args.splice(onlyAt, 2)[1].split(',') : null;
  const part = (name) => !only || only.includes(name);
  const files = args;
  if (!files.length && part('read-only')) {
    console.error('usage: node tools/walk.js FILE [FILE ...] [--shots DIR] [--only PART]');
    process.exit(2);
  }
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedview-walk-'));
  // Each part in a Chrome of its own, so that no part inherits another's state — a synthetic key
  // can leave a tab unable to take the next one (see `press` in tools/chrome.js) — and the console
  // and the requests of all of them are read together at the end.
  const log = { errors: [], requests: [] };
  async function inChrome(fn) {
    const { page, close } = await launch();
    try {
      await page.goto(`file://${path.join(ROOT, 'index.html')}`);
      await fn(page);
    } catch (e) {
      if (page.log.errors.length) console.error(`the page said: ${page.log.errors.join(' | ')}`);
      throw e;
    } finally {
      log.errors.push(...page.log.errors);
      log.requests.push(...page.log.requests);
      await close();
    }
  }
  try {
    if (part('read-only')) await inChrome(async (page) => { for (const file of files) await readOnlyWalk(page, file); });
    if (part('rest')) await inChrome((page) => restOfThePage(page, dir, shots));
    if (part('editing')) await inChrome((page) => editingOnThePage(page, dir, shots));
    if (part('edges')) await inChrome((page) => editingEdges(page));
    if (part('third')) await inChrome((page) => thirdRound(page, dir, shots));
    if (part('save')) await inChrome((page) => saveInPlace(page, dir));
    if (part('copy')) await inChrome((page) => copyWithoutPickers(page, dir, shots));
    console.log('\n== the whole walk');
    check(log.errors.length === 0, `no error in the console${log.errors.length ? `: ${log.errors.join(' | ')}` : ''}`);
    // file:// is the page and its files; blob: is a download the page made of its own bytes
    const off = log.requests.filter((u) => !u.startsWith('file://') && !u.startsWith('blob:file://'));
    check(off.length === 0, `nothing left the machine: ${log.requests.length} requests, each file:// or a download of the page's own bytes${off.length ? ` — but ${off.join(' ')}` : ''}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (shots) console.log(`\npictures of the fictional file: ${shots}`);
  console.log(failures ? `\n${failures} FAILED` : '\nevery step passes');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(`the walk stopped: ${e.message}`);
  process.exit(1);
});
