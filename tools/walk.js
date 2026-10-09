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
// and removed after; Save, with the computer's Open and Save dialogs stood in for, writes a dated
// copy and refuses the original; and, in a browser with its file pickers taken away, Save is
// Download a copy. The third round (0.5) is walked on a fictional file of its own: the frames
// hidden and shown across a reload, the lines scrolled sideways, the copy buttons, a _META drawn
// as it reads, blocks and sections dragged, Collapse all, a check's meaning, Back over the lines,
// Bold surnames, a link selected whole, a clipped row's count, and E. Release 0.5.4 is walked in the
// third round (the tab's title and its setting), in the rest of the page (the spell check and
// translation attributes), and in a part of its own, scroll (a line opened for typing leaves the
// grid where it was). Release 0.5.5 is walked in the rest of the page (the theme's first choice), in
// the third round (Settings' controls), and in a part of its own, look (System, Dusk, the text size,
// less motion, forced colors, and the policy with a _META that does not parse). --shots DIR saves
// pictures of the fictional files, and of nothing else.
// --only PART walks one part alone, or several named with commas: read-only, rest, editing, edges,
// third, scroll, drags, save, copy, look. Exit 0 when every step passes.
//
// The computer's Save dialog itself is not walked here: a person picks the name and the place in
// it. The walk stands in for it as Chromium's behaves, the file picked created, or emptied when it
// is there, before the page gets it (release 0.5.6, the part named save). tests/save.test.js walks
// the saving steps of the phase-5 walk over in-memory files.
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

// A control that lives in Settings (0.5.1): the menu opened under its button, the control
// clicked, the menu closed again.
async function setting(page, id) {
  await page.click("document.getElementById('settings')");
  await page.waitFor("document.getElementById('settings-menu').matches(':popover-open')");
  await page.click(`document.getElementById('${id}')`);
  await page.ev("document.getElementById('settings-menu').hidePopover(); true");
}

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
    await setting(page, 'indent');
    const on = await pad();
    await setting(page, 'indent');
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

  // 0.5.4: the boxes that take the file's words turn spell check and the grammar helpers off; what
  // shows the file's words is marked not to be translated
  const helpers = await page.ev(`['search-box', 'records-filter', 'goto'].filter((id) => { const b = document.getElementById(id);
    return b.spellcheck !== false || b.getAttribute('data-gramm') !== 'false'; })`);
  const translated = await page.ev(`['grid', 'detail', 'records-list', 'panel-checks', 'panel-changes', 'panel-search', 'panel-tags']
    .filter((id) => document.getElementById(id).translate !== false)`);
  check(helpers.length === 0 && translated.length === 0,
    `spell check and Grammarly are off in the Search box, the Records filter and Go to Line; the lines, the right frame, the records list and four panels are marked not to translate${helpers.length || translated.length ? `, but ${helpers.concat(translated).join(', ')}` : ''}`);

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
    await setting(page, 'indent');
    await shot('n1-indent');
    await setting(page, 'indent');
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
  // 0.5.5: with no choice made, the theme is System, which draws Light when the computer is light (the
  // Chrome of the walk is told it is, whatever the computer it runs on is set to)
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await page.waitFor("!document.documentElement.classList.contains('dark')");
  const startsOn = await page.ev("(document.documentElement.className || 'light') + '/' + document.getElementById('theme-system').getAttribute('aria-pressed') + '/' + localStorage.getItem('gedview.theme')");
  check(startsOn === 'light/true/null', `with no theme chosen, System is pressed and draws Light, and nothing is stored: ${startsOn}`);
  for (const [k, name] of ['dusk', 'dark', 'light'].entries()) {
    await setting(page, `theme-${name}`);
    themes.push(await page.ev("(document.documentElement.className || 'light') + ' ' + getComputedStyle(document.body).backgroundColor"));
    if (k < 2) await shot(themes[k].split(' ')[0]);
  }
  const names = themes.map((t) => t.split(' ')[0]);
  const colours = new Set(themes.map((t) => t.slice(t.indexOf(' ') + 1)));
  check(JSON.stringify(names) === '["dusk","dark","light"]' && colours.size === 3, `the three themes, chosen in Settings, each its own background: ${themes.join(' → ')}`);

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
    open: !document.getElementById('open'), empty: document.getElementById('open-empty').textContent,
    facts: document.getElementById('facts').hidden, name: document.getElementById('file-name').textContent })`);
  check(bar.title === 'GEDCOM Viewer' && bar.window === 'GEDCOM Viewer',
    `the name: "${bar.title}" in the top bar, "${bar.window}" in the window's title, with a file open and no file name in it`);
  check(bar.open && bar.empty === 'Open GEDCOM', `the top bar has no Open; the empty frame's button reads "${bar.empty}"`);
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

// 0.5.4: a line opened for typing leaves the grid where it was. The box's focus and its caret each
// scrolled the grid sideways to follow them, which took the level and tag columns off the screen
// and left the grid there after the edit. A box is left by Escape only when nothing was typed in
// it, and by Enter after typing (tools/chrome.js, `press`).
async function editorScroll(page, dir) {
  const file = path.join(dir, 'scroll.ged');
  fs.writeFileSync(file, thirdFiction());
  const m = core.read(new Uint8Array(fs.readFileSync(file)));
  console.log(`\n== a line opened for typing leaves the grid where it was, on a fictional file of ${fmt(m.n)} lines`);
  await page.openFile(file);
  await page.click("document.getElementById('edit')");
  const nameLine = m.texts.indexOf('1 NAME Jane /Fixture/') + 1;
  const longLine = m.texts.findIndex((t) => t.length > 2000) + 1;
  // where the grid is, and whether the level and tag columns of a row not being typed in sit clear of the number column
  const WHERE = `(() => { const g = document.getElementById('grid');
    const row = [...g.querySelectorAll('.row')].find((r) => r.querySelector('.lv') && r.querySelector('.tg') && r.querySelector('.fx'));
    const edge = row.querySelector('.fx').getBoundingClientRect().right - 1;
    const box = g.querySelector('input.edit');
    return { at: g.scrollLeft, columns: row.querySelector('.lv').getBoundingClientRect().left >= edge && row.querySelector('.tg').getBoundingClientRect().left >= edge,
      box: box ? box.getBoundingClientRect().left >= edge : null }; })()`;
  const opened = async (n) => {
    await gotoLine(page, n);
    await page.key('Enter', 'Enter', 13);
    await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
    await sleep(80);
    return page.ev(WHERE);
  };

  // a short line: opened, and let go of with Escape
  let w = await opened(nameLine);
  check(w.at === 0 && w.columns && w.box, `line ${fmt(nameLine)} opened for typing: the grid has not moved (${w.at} px), the level and tag columns are in view, and the box starts at the number column`);
  await page.key('Escape', 'Escape', 27);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  await sleep(80);
  w = await page.ev(WHERE);
  check(w.at === 0 && w.columns, `Escape: the grid sits where it was (${w.at} px), the columns in view`);

  // the grid already scrolled sideways: it stays where it was, opened and after Escape
  await gotoLine(page, nameLine);
  await page.ev("document.getElementById('grid').scrollLeft = 300");
  await sleep(80);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  await sleep(80);
  const openedAt = (await page.ev(WHERE)).at;
  await page.key('Escape', 'Escape', 27);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  await sleep(80);
  const escapedAt = (await page.ev(WHERE)).at;
  check(openedAt === 300 && escapedAt === 300, `the grid scrolled to 300 px: opened at ${openedAt} px, and after Escape at ${escapedAt} px`);

  // a line of 2,500 characters: opened, the caret is at its far end and the grid stays at the left;
  // typing follows the caret, as it must; Enter keeps the line, and the grid is back where it was
  w = await opened(longLine);
  check(w.at === 0 && w.columns && w.box, `line ${fmt(longLine)}, 2,500 characters, opened for typing: the grid has not moved (${w.at} px), the columns are in view`);
  await page.type('x');
  await sleep(150);
  const typed = await page.ev(WHERE);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("!document.querySelector('#grid input.edit')");
  await sleep(80);
  const kept = await page.ev(WHERE);
  check(typed.at > 0 && kept.at === 0 && kept.columns,
    `typed at the far end the grid follows the caret (${Math.round(typed.at)} px); Enter keeps the line, and the grid is back at ${kept.at} px, the columns in view`);

  // Add inside: the same
  await gotoLine(page, nameLine);
  await page.click("[...document.querySelectorAll('#detail button')].find((b) => b.textContent.trim() === 'Add inside')");
  await page.waitFor("document.querySelector('#grid input.edit') === document.activeElement");
  await sleep(80);
  w = await page.ev(WHERE);
  check(w.at === 0 && w.columns && w.box, `Add inside: the new line's box opens with the grid at ${w.at} px and the columns in view`);
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
    `Back sits in the strip above the lines, not in the top bar, only while there is somewhere to go: "${backText}", then back on line ${fmt(returned.ln)}, then "${thenText}"`);
  await page.click("document.getElementById('top')");
  const atTop = await page.ev(`({ ln: (${SELECTED}).ln, back: document.getElementById('back').textContent, strip: !!document.querySelector('.middle .strip #top') })`);
  check(atTop.ln === 1 && atTop.back === `← Back to ${fmt(famsLine)}` && atTop.strip, `Top, always in the strip, goes to line 1 as a jump: "${atTop.back}"`);

  // 3.5 — Collapse all, Expand all
  const sectionRows = new Set(m.records.map((i) => m.tag[i])).size - 1;
  const label1 = await page.ev("document.getElementById('fold-all').textContent");
  await page.click("document.getElementById('fold-all')");
  await page.waitFor(`${ROWS} === ${1 + sectionRows}`);                // HEAD shut to its line, every other type to its row
  const label2 = await page.ev("document.getElementById('fold-all').textContent");
  await page.click("document.getElementById('fold-all')");
  await page.waitFor(`${ROWS} === ${m.n + sectionRows}`);
  const label3 = await page.ev("document.getElementById('fold-all').textContent");
  check(label1 === 'Collapse all' && label2 === 'Expand all' && label3 === 'Collapse all',
    `${label1} shuts every record to its first line and every type to its row (${fmt(1 + sectionRows)} rows); ${label2} opens every block and every type (${fmt(m.n + sectionRows)} rows)`);

  // 3.8 — Bold surnames: the labels, not the lines; the filter finds a name either way
  await page.click("document.querySelector('.tab[data-panel=records]')");
  await page.waitFor(LAID_OUT('records-list'));
  await page.click("document.getElementById('records-filter')");
  await page.type('jane fixture');
  await page.waitFor(`${VISIBLE('records-list')}.length === 2`);
  const found = await page.ev(`${VISIBLE('records-list')}.map((r) => r.firstChild.textContent)`);
  await setting(page, 'surnames');
  await gotoLine(page, line('1 NAME Jane /Fixture/'));
  const bold = await page.ev(`({ pressed: document.getElementById('surnames').getAttribute('aria-pressed'),
    list: ${VISIBLE('records-list')}.map((r) => [...r.querySelectorAll('.surname')].map((x) => x.textContent).join('|')),
    listText: ${VISIBLE('records-list')}[0].querySelector('.main').textContent,
    row: document.querySelector('#grid .row.is-sel .tx').textContent,
    detail: (document.querySelector('#detail .surname') || {}).textContent, value: document.querySelector('#detail .detail-value').textContent })`);
  await setting(page, 'surnames');
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
  await sleep(80);
  const scrolled = await page.ev(`(() => { const r = document.querySelector('#grid .row.is-sel'); const g = document.getElementById('grid').getBoundingClientRect();
    return { left: g.left, fx: r.querySelector('.fx').getBoundingClientRect().left, tx: r.querySelector('.tx').getBoundingClientRect().left, at: document.getElementById('grid').scrollLeft, cue: document.getElementById('grid').classList.contains('is-aside') }; })()`);
  await gotoLine(page, longLine - 1);
  await sleep(60);                                                   // the scroll event that clears the cue
  const afterJump = await page.ev("({ at: document.getElementById('grid').scrollLeft, cue: document.getElementById('grid').classList.contains('is-aside') })");
  check(clipped.tail === '… 500 more' && clipped.shown === 2000 && clipped.pane === 2493 && clipped.help,
    `line ${fmt(longLine)}, 2,500 characters: the row shows 2,000 and ends "${clipped.tail}"; the right frame shows the value whole (${fmt(clipped.pane)}); a line selected puts the check's meaning away`);
  check(clipped.wide && scrolled.at === 300 && Math.abs(scrolled.fx - scrolled.left) < 1 && scrolled.tx < scrolled.left && scrolled.cue,
    `the main frame scrolls sideways (${scrolled.at} px): the line number stays at the left edge, the text goes under it, and the number column casts a shade to say so`);
  check(afterJump.at === 0 && !afterJump.cue, 'a jump to a line brings the lines back to their left edge');
  await shot('sideways');

  // 3.1 — the side frames hidden and shown, and remembered across a reload
  await page.click("document.getElementById('hide-left')");
  await page.click("document.getElementById('hide-right')");
  await sleep(350);                                                  // the frames ease shut
  const hidden = await page.ev("({ cls: document.getElementById('work').className, side: getComputedStyle(document.getElementById('side')).visibility, detail: getComputedStyle(document.getElementById('detail')).visibility, width: document.getElementById('side').getBoundingClientRect().width, tab: document.getElementById('hide-left').getAttribute('aria-pressed') + '/' + document.getElementById('hide-left').title + '/' + document.getElementById('hide-right').title })");
  await shot('frames-hidden');
  await page.goto(`file://${path.join(ROOT, 'index.html')}`);
  const remembered = await page.ev("document.getElementById('work').className");
  await page.click("document.getElementById('hide-left')");
  await page.click("document.getElementById('hide-right')");
  await sleep(350);
  const shown = await page.ev("({ cls: document.getElementById('work').className, side: getComputedStyle(document.getElementById('side')).visibility, tab: document.getElementById('hide-left').getAttribute('aria-pressed') + '/' + document.getElementById('hide-left').title })");
  check(hidden.cls === 'work left-hidden right-hidden' && hidden.side === 'hidden' && hidden.detail === 'hidden' && hidden.width === 0 && hidden.tab === 'true/Show left bar/Show right frame',
    `the two icons at the ends of the top bar hide the left bar and the right frame (${hidden.cls}, eased shut), and read "${hidden.tab.split('/')[1]}"`);
  check(remembered === 'work left-hidden right-hidden' && shown.cls === 'work' && shown.side === 'visible' && shown.tab === 'false/Hide left bar',
    `hidden or shown is remembered across a reload (${remembered}); the same icons bring them back (${shown.cls === 'work' ? 'both shown' : shown.cls})`);
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
  const errorsBefore = page.log.errors.length;
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
  check(drawn.titles.slice(0, 6).join('|') === 'content|transcription|personas|cemetery|record_source_gid|Joined',
    `a CONC line of the _META: the right frame draws its parts under the names the file gives them, above Joined (${drawn.titles.join(' · ')})`);
  check(drawn.strong === 'Fixture' && drawn.gone === '' && drawn.colspan === '2' && drawn.red === false && drawn.text.includes('the record (https://example.org/grave/1)') && drawn.text.includes('[image]'),
    `the story keeps its bold, its table (colspan ${drawn.colspan}) and its text; the link is text with its address, the image is [image]; no link, image, script, style, span, font or Word element survives`);
  check(drawn.persons === 2 && drawn.person === 'Jane Fixture · 1 Jan 1900 · Fixtureville · 2 Feb 1950 · Fixture City' && drawn.transcription === 'Line one\nLine two' && drawn.copies >= 6,
    `the persons as a table (${drawn.person}); the transcription with its line break; a copy button on each of the ${drawn.copies} boxes`);
  check(drawn.title === 'GEDCOM Viewer' && storyCopied.includes('She lived there.'), 'the script inside the story never ran, and the story copies as text');
  // 0.5.5: the policy allows no inline style, and the story here holds a span's style and a <style>. The page takes
  // both out of the HTML text before the browser reads it, so the console has nothing to say about them.
  await sleep(100);
  const refusals = page.log.errors.splice(errorsBefore);
  check(refusals.length === 0, `the story's own styles (a span's, a <style>) are stripped before the browser reads them: ${refusals.length} message${refusals.length === 1 ? '' : 's'} of the policy's in the console`);
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

  // the change dot in the mark column, and the right frame following the typing (0.5.1)
  const nameLine = line('1 NAME Jane /Fixture/');
  await page.click("document.getElementById('edit')");
  await gotoLine(page, nameLine);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel input.edit') === document.activeElement");
  await page.ev("(() => { const i = document.querySelector('#grid input.edit'); i.setSelectionRange(i.value.length, i.value.length); })()");
  await page.type(' Jr');
  await sleep(50);
  const following = await page.ev("({ value: document.querySelector('#detail .detail-value').textContent, was: (document.querySelector('#detail .detail-was .detail-value') || {}).textContent })");
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  const dots = await page.ev("({ dot: !!document.querySelector('#grid .row.is-sel .cg.is-changed'), value: document.querySelector('#detail .detail-value').textContent })");
  check(following.value === 'Jane /Fixture/ Jr' && !following.was, `while the line is typed, the right frame already reads its value: "${following.value}"`);
  check(dots.dot && dots.value === 'Jane /Fixture/ Jr', 'kept, the row has a change dot in the mark column, in the changed colour');
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("document.getElementById('changes-count').textContent === ''");
  await page.click("document.getElementById('edit')");

  // 0.5.4: the tab's title never holds the file's name unless File name in the tab is on, and the
  // dot in front shows a change either way; the setting is remembered, and off is its default
  const TITLE = 'document.title';
  const stored = () => page.ev("localStorage.getItem('gedview.tabName')");
  const offByDefault = (await stored()) === null && (await page.ev("document.getElementById('tab-name').getAttribute('aria-pressed')")) === 'false';
  await page.click("document.getElementById('redo')");
  const changedOff = await page.ev(TITLE);
  await page.click("document.getElementById('undo')");
  const savedOff = await page.ev(TITLE);
  await setting(page, 'tab-name');
  const nameOn = await page.ev(TITLE);
  await page.click("document.getElementById('redo')");
  const changedOn = await page.ev(TITLE);
  await page.click("document.getElementById('undo')");
  const pressedOn = await page.ev("document.getElementById('tab-name').getAttribute('aria-pressed')");
  const kept = await stored();
  await setting(page, 'tab-name');
  check(offByDefault && savedOff === 'GEDCOM Viewer' && changedOff === '● GEDCOM Viewer',
    `the tab's title, File name in the tab off (its default): "${savedOff}", and "${changedOff}" with an unsaved change; the file's name is not in it`);
  check(nameOn === 'third.ged - GEDCOM Viewer' && changedOn === '● third.ged - GEDCOM Viewer' && pressedOn === 'true' && kept === 'true',
    `File name in the tab on (and remembered): "${nameOn}", and "${changedOn}" with an unsaved change`);
  check((await page.ev(TITLE)) === 'GEDCOM Viewer' && (await stored()) === 'false', 'turned off again, the title has no file name');

  // Settings holds Theme, Indent and Bold surnames; the Tags list steps through its orders
  await page.click("document.getElementById('settings')");
  await page.waitFor("document.getElementById('settings-menu').matches(':popover-open')");
  const menu = await page.ev("[...document.querySelectorAll('#settings-menu button')].map((b) => b.id).join(',')");
  await page.ev("document.getElementById('settings-menu').hidePopover(); true");
  const inBar = await page.ev("['theme','fold-all','indent','surnames'].map((id) => !!document.querySelector('.bar #' + id)).join(',')");
  check(menu === 'theme-system,theme-light,theme-dusk,theme-dark,text-normal,text-larger,indent,surnames,tab-name,report' && inBar === 'false,false,false,false',
    `Settings opens a menu holding ${menu.split(',').length} controls: the themes (System, Light, Dusk, Dark), the text size (Normal, Larger), Indent, Bold surnames, File name in the tab, Report a problem; none of them in the top bar`);

  // P8 — Report a problem: the report reads as counts and codes and holds no line of the file; cut
  // a line and it no longer reads as built; Copy puts the box as it reads, then What happened, on
  // the clipboard, and nothing else
  await setting(page, 'report');
  await page.waitFor("document.getElementById('report-text') !== null");
  const p8Report = await page.ev("({ title: document.querySelector('#dialog .dialog-title').textContent, text: document.getElementById('report-text').value, state: document.getElementById('report-state').textContent })");
  await shot('report');
  const p8Leaked = [];
  for (let i = 0; i < m.n; i += 1) { const t = m.texts[i].trim(); if (t.length >= 3 && p8Report.text.includes(t)) p8Leaked.push(i + 1); }
  check(p8Report.title === 'Report a problem' && p8Report.text.startsWith('GEDCOM Viewer ') && /\nRecords: INDI \d/.test(p8Report.text) && /\nchecksum: [0-9a-f]{8}$/.test(p8Report.text)
    && !/Fixture/.test(p8Report.text) && p8Leaked.length === 0 && /^As built/.test(p8Report.state),
    `Report a problem: ${p8Report.text.split('\n').length} lines of counts and codes, no line of the file, and it reads as built: "${p8Report.state}"`);
  await page.ev("(() => { const b = document.getElementById('report-text'); b.value = b.value.split('\\n').filter((l) => !l.startsWith('Where:')).join('\\n'); b.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await page.waitFor("/^Changed/.test(document.getElementById('report-state').textContent)");
  await page.ev("document.getElementById('report-what').value = 'The walk cut the Where line.'; true");
  await page.ev("navigator.clipboard.writeText = (t) => { window.__reportCopied = t; return Promise.resolve(); }; true");
  await page.click("document.getElementById('report-copy')");
  await page.waitFor("window.__reportCopied !== undefined");
  const p8Copied = await page.ev("({ text: window.__reportCopied, box: document.getElementById('report-text').value, state: document.getElementById('report-state').textContent })");
  check(p8Copied.text === `${p8Copied.box}\nWhat happened: The walk cut the Where line.\n` && !/Where:/.test(p8Copied.text),
    `the Where line cut: "${p8Copied.state}"; Copy puts the box as it reads, then What happened, on the clipboard, and the original nowhere`);
  await page.click(BUTTON('#dialog', 'Close'));
  await page.waitFor("!document.getElementById('dialog').open");
  await page.click("document.querySelector('.tab[data-panel=tags]')");
  await page.waitFor(LAID_OUT('tags-list'));
  const firstTag = () => page.ev(`${VISIBLE('tags-list')}[0].firstChild.textContent + ' ' + ${VISIBLE('tags-list')}[0].lastChild.textContent`);
  const orders = [await firstTag()];
  for (let k = 0; k < 4; k += 1) {
    await page.click("document.getElementById('tags-order')");
    orders.push(await firstTag());
  }
  const byCount = [...m.tagCounts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  const rising = [...m.tagCounts.entries()].sort((a, b) => (a[1] - b[1]) || (a[0] < b[0] ? -1 : 1));
  const names = [...m.tagCounts.keys()].sort();
  const want = [byCount[0], rising[0], [names[0], m.tagCounts.get(names[0])], [names[names.length - 1], m.tagCounts.get(names[names.length - 1])], byCount[0]].map((x) => `${x[0]} ${fmt(x[1])}`);
  check(JSON.stringify(orders) === JSON.stringify(want), `the Tags list's order button steps through by count, by count rising, A–Z, Z–A and back: ${orders.join(' → ')}`);

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


// 3.4a, dragged: a block among its siblings, a section past another, a record to the top of its
// type, Esc, a release in place. In a Chrome of its own with as little before it as can be: in
// Chrome 154 headless, a few dozen synthetic clicks before a drag let go with Escape leave the
// renderer answering nothing (see `press` in tools/chrome.js); a hand does not do that.
async function fourthDrags(page, dir, shots) {
  const file = path.join(dir, 'third.ged');
  if (!fs.existsSync(file)) fs.writeFileSync(file, thirdFiction());
  const m = core.read(new Uint8Array(fs.readFileSync(file)));
  const shot = (name) => (shots ? page.screenshot(path.join(shots, `third-${name}.png`)) : null);
  console.log(`\n== the third round's drags (0.5), on the fictional file of ${fmt(m.n)} lines`);
  await page.openFile(file);
  const line = (text) => m.texts.indexOf(text) + 1;
  const famsLine = line('1 FAMS @F1@');
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
  await page.key('s', 'KeyS', 83, 4);                                // ⌘S: the Save dialog, to read, then Cancel
  await page.waitFor("document.getElementById('dialog').open");
  const dialogSays = await page.ev("({ lines: [...document.querySelectorAll('#dialog .chg, #dialog .chg-line')].map((x) => x.textContent), stamps: (document.querySelector('#dialog .dialog-check span') || {}).textContent })");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(dialogSays.lines[0].startsWith('moved') && dialogSays.lines[1] === 'NAME · 1 line · among its 2 NAME lines the first is read as preferred' && dialogSays.stamps === 'Change stamps, 1 record',
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
  await page.key('s', 'KeyS', 83, 4);                                // ⌘S: the Save dialog, to read, then Cancel
  await page.waitFor("document.getElementById('dialog').open");
  const secDialog = await page.ev("(document.querySelector('#dialog .dialog-check span') || {}).textContent");
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(secMid.line && secMid.dim >= 1 && JSON.stringify(section.order.slice(0, 4)) === '["SUBM","FAM","INDI","OBJE"]' && section.changes[0] === 'moved: section FAM · 2 records · 6 lines' && secDialog === 'Change stamps, none needed',
    `the FAM row dragged to the INDI row's edge: the 2 families now stand before the people (${section.order.join(' · ')}); Changes reads "${section.changes[0]}"; ${secDialog}`);
  await shot('section-moved');
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("document.getElementById('changes-count').textContent === ''");

  // a record dragged to the top of its type: the gold line under the type's row, not above it
  const i2 = line('0 @I2@ INDI');
  await gotoLine(page, i2);
  await page.ev("document.getElementById('grid').scrollTop = 0; true");   // the rows clear of the frame's edges, where a drag scrolls
  await sleep(60);
  const i2Rect = await page.ev(ROW_RECT(i2));
  const indiHead = await page.ev(SECTION_RECT('INDI'));
  await page.mouse('mouseMoved', i2Rect.x, i2Rect.y);
  await page.mouse('mousePressed', i2Rect.x, i2Rect.y);
  await page.mouse('mouseMoved', i2Rect.x, i2Rect.y + 8, { button: 'left', buttons: 1 });
  await page.mouse('mouseMoved', indiHead.x, indiHead.top + 2, { button: 'left', buttons: 1 });
  await sleep(50);
  const atHead = await page.ev("(() => { const l = document.querySelector('#grid .drop-line'); return { line: !l.hidden, y: l.getBoundingClientRect().top }; })()");
  await page.mouse('mouseMoved', i2Rect.x, i2Rect.y + 6, { button: 'left', buttons: 1 });   // back over its own row: no gold line
  await sleep(50);
  await page.mouse('mouseReleased', i2Rect.x, i2Rect.y + 6);
  check(atHead.line && Math.abs(atHead.y - indiHead.bottom) < 2 && (await page.ev("document.getElementById('changes-count').textContent")) === '',
    'a person dragged to the top of the people: the gold line sits under the INDI row, not above it; released back over its own row, nothing moves');

  // a release over its own place moves nothing; then, last of all — a drag let go with Escape is
  // where this Chrome can stop answering (tools/chrome.js, `press`) — a record dragged beyond its
  // own type, and Esc letting go
  const i1 = line('0 @I1@ INDI');
  await gotoLine(page, i1);                                          // the jump puts the person three rows below the top, and the families further down, in view and clear of the frame's edges
  await sleep(60);
  const i1Rect = await page.ev(ROW_RECT(i1));
  const f2Rect = await page.ev(ROW_RECT(line('0 @F2@ FAM')));
  const own = await dragRow(page, i1Rect, { x: i1Rect.x, y: i1Rect.y + 6 });
  check(!own.line && (await page.ev("document.getElementById('changes-count').textContent")) === '' && (await page.ev(`(${SELECTED}).id`)) === '@I1@',
    'released where it already is — no gold line — it moves nothing');
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
  await page.click("document.getElementById('edit')");

}
// Save (10.2) through the page, with the computer's two dialogs stood in for: Open hands the page
// the file's handle, as Chrome's does, and Save hands it the file the person would pick in it,
// created when it is not there and emptied when it is, before the page sees it, as Chromium does
// (content/browser/file_system_access/file_system_access_manager_impl.cc: "Create file if it
// doesn't yet exist, and truncate file if it does exist"). The picks are a person's clicks in
// phase 5; every step around them is walked here. `__answer` is the name the person keeps or types
// in the Save dialog (unset, the name offered; null, Cancel), and `__failNew` how a file made there fails.
const STAND_IN_DIALOGS = `(() => {
  const fail = (name, message) => Object.assign(new Error(message), { name });
  class F {
    constructor(dir, name, bytes) { this.kind = 'file'; this.dir = dir; this.name = name; this.bytes = bytes || new Uint8Array(0); this.fail = null; }
    async getFile() { return new File([this.bytes.slice()], this.name); }
    async createWritable() {
      const f = this; let data = new Uint8Array(0);
      if (f.fail === 'open') throw fail('NotAllowedError', f.name + ' may not be written');
      return {
        async write(c) {
          const b = c.buffer ? new Uint8Array(c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength)) : new TextEncoder().encode(c);
          const d = new Uint8Array(data.length + b.length); d.set(data); d.set(b, data.length); data = d;
        },
        async close() { f.bytes = f.fail === 'garble' ? data.map((x, k) => (k === 0 ? x ^ 1 : x)) : data; window.__writes.push(f.name); },
      };
    }
    async isSameEntry(other) { return !!other && other.dir === this.dir && other.name === this.name; }
  }
  const folder = { entries: new Map() };
  Object.assign(window, { __folder: folder, __File: F, __writes: [], __asked: [], __answer: undefined, __failNew: null });
  window.showOpenFilePicker = async () => [folder.entries.get(window.__opened)];
  window.showSaveFilePicker = async (opts) => {
    window.__asked.push({ name: opts.suggestedName, atOriginal: opts.startIn === folder.entries.get(window.__opened), types: JSON.stringify(opts.types) });
    if (window.__answer === null) throw fail('AbortError', 'The user aborted a request.');
    const name = window.__answer === undefined ? opts.suggestedName : window.__answer;
    let f = folder.entries.get(name);
    if (f) f.bytes = new Uint8Array(0);
    else { f = new F(folder, name); f.fail = window.__failNew; folder.entries.set(name, f); }
    return f;
  };
  return true;
})()`;
const IN_FOLDER = (name) => `(() => { const e = window.__folder.entries.get(${JSON.stringify(name)});
  return e ? btoa(Array.from(e.bytes, (b) => String.fromCharCode(b)).join('')) : null; })()`;
const FOLDER_NAMES = '[...window.__folder.entries.keys()].sort()';
// Whether leaving the page now would have the browser ask first: the page's own beforeunload, asked.
const LEAVE_ASKS = "(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()";
const SMALL = '0 HEAD\n1 SOUR gedview-walk\n2 VERS 1.0\n1 DATE 28 SEP 2026\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n' +
  '0 @I1@ INDI\n1 NAME Jane /Fixture/\n1 SEX F\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n';

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

// Line n typed over with `text`, and the change shown.
async function retype(page, n, text) {
  await gotoLine(page, n);
  await openEditBox(page);
  await page.clearBox();
  await page.type(text);
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
}

// What the Save dialog shows: its title, the lines of the changes, the change-stamp box and the
// stamps to come, the note box, and its buttons.
const SAVE_DIALOG = `({ title: document.querySelector('#dialog .dialog-title').textContent,
  sum: (document.querySelector('#dialog .dialog-sum') || {}).textContent,
  lines: [...document.querySelectorAll('#dialog .chg-line')].map((l) => l.textContent),
  check: document.querySelector('#dialog .dialog-check span').textContent,
  ticked: document.querySelector('#dialog input[type=checkbox]').checked,
  stamps: [...document.querySelectorAll('#dialog .dialog-stamps > div')].map((d) => d.textContent),
  noteOff: document.querySelector('#dialog .dialog-note input').disabled,
  noteDim: document.querySelector('#dialog .dialog-note').classList.contains('is-off'),
  buttons: [...document.querySelectorAll('#dialog .dialog-buttons button')].map((b) => b.textContent) })`;
const DIALOG_SAYS = "({ title: document.querySelector('#dialog .dialog-title').textContent, text: document.querySelector('#dialog .dialog-body').textContent })";

async function saveWithDialog(page) {
  console.log('\n== Save: a dated copy, never the original, with the computer\'s Open and Save dialogs stood in for');
  const sha = crypto.createHash('sha256').update(SMALL).digest('hex');
  await page.ev(STAND_IN_DIALOGS);
  await page.ev(`window.__opened = 'small.ged'; window.__folder.entries.set('small.ged', new window.__File(window.__folder, 'small.ged',
    Uint8Array.from(atob(${JSON.stringify(Buffer.from(SMALL).toString('base64'))}), (c) => c.charCodeAt(0)))); true`);
  await page.click("document.getElementById('open-empty')");
  await page.waitFor("document.getElementById('file-name').textContent === 'small.ged' && document.querySelector('#grid .row.is-sel')");
  const bar = await page.ev("({ label: document.getElementById('save').textContent, title: document.getElementById('save').title, off: document.getElementById('save').disabled, copy: !!document.getElementById('save-copy') })");
  check(bar.label === 'Save' && bar.off && !bar.copy && bar.title === 'Save a dated copy, where you choose; the original is never written (⌘S)',
    `opened through the Open dialog, with its handle: one button, "${bar.label}", off until a change; no Save a copy`);

  await page.click("document.getElementById('edit')");
  await retype(page, 12, '1 NAME Joe /Fixtures/');
  check(await page.ev(`!document.getElementById('dirty').hidden && !document.getElementById('save').disabled && ${LEAVE_ASKS}`),
    'an edit: ●, Save on, and leaving would ask first');

  // 20: Save; the page's dialog; the stamps unticked turn the note box off; ticked again, a note; Save
  await page.click("document.getElementById('save')");
  await page.waitFor("document.getElementById('dialog').open");
  const shows = await page.ev(SAVE_DIALOG);
  check(shows.title === 'Save a copy of small.ged' && JSON.stringify(shows.lines) === JSON.stringify(['−1 NAME Joe /Fixture/', '+1 NAME Joe /Fixtures/'])
    && shows.check === 'Change stamps, 1 record' && shows.ticked && shows.stamps.length === 1 && shows.stamps[0].startsWith('@I2@ INDI') && !shows.noteOff
    && JSON.stringify(shows.buttons) === JSON.stringify(['Cancel', 'Save']),
  `the Save dialog: "${shows.title}", the change, "${shows.check}" (${shows.stamps[0]}), a note box, Cancel and Save`);
  await page.click("document.querySelector('#dialog input[type=checkbox]')");
  const unticked = await page.ev(SAVE_DIALOG);
  check(unticked.noteOff && unticked.noteDim && !unticked.ticked, 'the change stamps unticked: the note box is off, for there is nowhere for a note to go');
  await page.click("document.querySelector('#dialog input[type=checkbox]')");
  check(!(await page.ev(SAVE_DIALOG)).noteOff, 'ticked again: the note box is on');
  await page.ev("document.querySelector('#dialog .dialog-note input').value = 'Walked.'; true");
  await page.click(BUTTON('#dialog', 'Save'));
  await page.waitFor("!document.getElementById('notice').hidden && document.getElementById('dirty').hidden");
  const asked = await page.ev('window.__asked');
  const copyName = asked[0].name;
  const said = await page.ev("document.getElementById('notice').textContent");
  check(asked.length === 1 && /^small\.\d{4}-\d\d-\d\dT\d{6}\.ged$/.test(copyName) && asked[0].atOriginal && asked[0].types.includes('.ged') && asked[0].types.includes('.gedcom'),
    `the computer's Save dialog, asked once: ${copyName} offered, opening at the original, for .ged and .gedcom`);
  check(said === `Saved as ${copyName}.`, `then "${said}"`);
  const copy = Buffer.from(await page.ev(IN_FOLDER(copyName)), 'base64').toString('utf8').split('\n');
  check(copy.slice(10, 13).join(' | ') === '0 @I2@ INDI | 1 NAME Joe /Fixtures/ | 1 CHAN' && /^2 DATE \d{1,2} [A-Z]{3} \d{4}$/.test(copy[13]) && /^3 TIME \d\d:\d\d:\d\d$/.test(copy[14])
    && copy[15] === '2 NOTE Walked.' && copy[16] === '0 TRLR', `the copy: the edit, and @I2@'s change stamp with the note typed (${copy.slice(12, 16).join(', ')})`);
  check(Buffer.from(await page.ev(IN_FOLDER('small.ged')), 'base64').toString('utf8') === SMALL, 'the original is not written: byte for byte as it was opened');

  // 21: the copy is the last copy; the page stays on the original
  const after = await page.ev(`({ off: document.getElementById('save').disabled, dirty: !document.getElementById('dirty').hidden, title: document.title,
    changes: document.getElementById('changes-count').textContent, facts: document.getElementById('facts').textContent, name: document.getElementById('file-name').textContent, leave: ${LEAVE_ASKS} })`);
  check(!after.dirty && after.off && after.title === 'GEDCOM Viewer' && !after.leave, 'the copy is the last copy: ● gone, Save off, no ● in the tab, and leaving asks nothing');
  if (await page.ev("document.getElementById('facts').hidden")) await page.click("document.getElementById('file-name')");
  await page.click("document.querySelector('#facts .sha')");
  const shown = await page.ev("(document.querySelector('#facts .hash') || {}).textContent");
  check(after.changes === '2' && after.name === 'small.ged' && after.facts.includes(`${Buffer.byteLength(SMALL)} B`) && shown === sha,
    `the page stays on the original: Changes ${after.changes} (the name and the stamp, counted from the original); the facts name small.ged, its size as opened and its sha256 (${shown.slice(0, 12)}…)`);

  // 23: the Changes tab's copy button
  await page.ev("navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; true");
  await page.click("document.querySelector('.tab[data-panel=changes]')");
  await page.click("document.getElementById('changes-copy')");
  await page.waitFor("typeof window.__copied === 'string' && document.getElementById('changes-copy').classList.contains('is-done')");
  const pasted = (await page.ev('window.__copied')).split('\n');
  check(/^GEDCOM Viewer {2}changes to small\.ged {2}as of \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(pasted[0])
    && pasted[1] === `original  sha256 ${sha}  ${Buffer.byteLength(SMALL)} bytes  13 lines`
    && /^changed {2}12 -> 12 +@I2@ INDI$/.test(pasted[2]) && pasted[3] === '  - 1 NAME Joe /Fixture/' && pasted[4] === '  + 1 NAME Joe /Fixtures/'
    && /^added +13-16 {2}@I2@ INDI {2}\(change stamp\)$/.test(pasted[5]) && pasted[9] === '  + 2 NOTE Walked.',
  `the Changes tab's copy button: the original's name and sha256, then the change and the stamp, as text ("${pasted[1].slice(0, 26)}…", "${pasted[2]}", "${pasted[5]}")`);
  await page.click("document.querySelector('.tab[data-panel=records]')");

  // nothing changed since the copy: Save is off, and ⌘S says so; ⇧⌘S is no key of the page's
  await page.key('s', 'KeyS', 83, 4);
  await page.waitFor("!document.getElementById('notice').hidden && document.getElementById('notice').textContent.startsWith('Nothing')");
  check((await page.ev("document.getElementById('notice').textContent")) === 'Nothing has changed since the last copy. Nothing was written.' && !(await page.ev("document.getElementById('dialog').open")),
    '⌘S with nothing changed since the copy: "Nothing has changed since the last copy. Nothing was written."');
  await retype(page, 9, '1 NAME Jane /Fixtures/');
  await page.key('S', 'KeyS', 83, 12);
  await sleep(300);
  check(!(await page.ev("document.getElementById('dialog').open")), '⇧⌘S opens nothing: Save a copy and its key are gone');

  // 33: the original's own name picked: refused in the brief's words; emptied by the browser, put back byte for byte
  await page.ev("window.__answer = 'small.ged'; window.__writes.length = 0; true");
  await page.key('s', 'KeyS', 83, 4);
  await page.waitFor("document.getElementById('dialog').open");
  const second = await page.ev(SAVE_DIALOG);
  check(second.check === 'Change stamps, 1 record' && second.stamps.length === 1 && second.stamps[0].startsWith('@I1@ INDI') && second.stamps[0].includes('gains 1 CHAN'),
    `⌘S: the Save dialog's stamps name @I1@ alone, changed since the copy; @I2@'s stamp from the copy is left as it was ("${second.stamps.join('; ')}")`);
  const before = await page.ev("({ changes: document.getElementById('changes-count').textContent, redo: document.getElementById('redo').disabled, undo: document.getElementById('undo').title })");
  await page.click(BUTTON('#dialog', 'Save'));
  await page.waitFor("document.getElementById('dialog').open && document.querySelector('#dialog .dialog-title').textContent === 'No copy was written'");
  const refused = await page.ev(DIALOG_SAYS);
  await page.click(BUTTON('#dialog', 'Close'));
  await page.waitFor("!document.getElementById('dialog').open");
  const back = await page.ev(`({ original: ${IN_FOLDER('small.ged')}, names: ${FOLDER_NAMES}, writes: window.__writes.slice(), dirty: !document.getElementById('dirty').hidden,
    changes: document.getElementById('changes-count').textContent, redo: document.getElementById('redo').disabled, undo: document.getElementById('undo').title })`);
  check(refused.text === 'That is the original. It is unchanged. Pick another name.',
    `the original picked in the Save dialog: "${refused.title}": "${refused.text}"`);
  check(Buffer.from(back.original, 'base64').toString('utf8') === SMALL && JSON.stringify(back.writes) === JSON.stringify(['small.ged']) && JSON.stringify(back.names) === JSON.stringify([copyName, 'small.ged'].sort()),
    'the original, emptied by the browser as Chromium does, is put back byte for byte, and nothing else is written');
  check(back.dirty && back.changes === before.changes && back.redo === before.redo && back.undo === before.undo,
    `the stamps taken back: Changes ${back.changes} as before, Undo "${back.undo}", Redo as it was, and ● still on`);

  // Cancel in the Save dialog
  await page.ev("window.__answer = null; window.__writes.length = 0; window.__asked.length = 0; true");
  await page.click("document.getElementById('save')");
  await page.waitFor("document.getElementById('dialog').open");
  await page.click(BUTTON('#dialog', 'Save'));
  await page.waitFor("!document.getElementById('notice').hidden && document.getElementById('notice').textContent === 'No copy was written.'");
  check((await page.ev('window.__writes.length')) === 0 && (await page.ev('window.__asked.length')) === 1 && (await page.ev("document.getElementById('changes-count').textContent")) === before.changes,
    'Cancel in the computer\'s Save dialog: "No copy was written."; nothing written, the stamps taken back');

  // 7: a copy that does not read back as written
  await page.ev("window.__answer = 'small.bad.ged'; window.__failNew = 'garble'; window.__writes.length = 0; true");
  await page.click("document.getElementById('save')");
  await page.waitFor("document.getElementById('dialog').open");
  await page.click(BUTTON('#dialog', 'Save'));
  await page.waitFor("document.getElementById('dialog').open && document.querySelector('#dialog .dialog-title').textContent === 'The copy did not finish'");
  const loud = await page.ev(DIALOG_SAYS);
  await page.click(BUTTON('#dialog', 'Close'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(loud.text === 'The copy, small.bad.ged, did not read back as it was written: do not rely on it. The original, small.ged, is as it was.'
    && Buffer.from(await page.ev(IN_FOLDER('small.ged')), 'base64').toString('utf8') === SMALL && (await page.ev("!document.getElementById('dirty').hidden")),
  `a copy that reads back wrong, said loudly: "${loud.text}"`);

  // a second copy: @I1@ stamped with the note typed now; @I2@'s stamp as the first copy wrote it
  await page.ev("window.__answer = undefined; window.__failNew = null; window.__asked.length = 0; true");
  await sleep(1100);                                                 // a second later, so the copy has a name of its own
  await page.click("document.getElementById('save')");
  await page.waitFor("document.getElementById('dialog').open");
  await page.ev("document.querySelector('#dialog .dialog-note input').value = 'Second.'; true");
  await page.click(BUTTON('#dialog', 'Save'));
  await page.waitFor("!document.getElementById('notice').hidden && document.getElementById('dirty').hidden");
  const secondName = (await page.ev('window.__asked'))[0].name;
  const two = Buffer.from(await page.ev(IN_FOLDER(secondName)), 'base64').toString('utf8').split('\n');
  check(two[8] === '1 NAME Jane /Fixtures/' && two[10] === '1 CHAN' && two[13] === '2 NOTE Second.' && two.slice(14, 21).join(' | ') === copy.slice(10, 17).join(' | '),
    `a second copy, ${secondName}: @I1@ stamped with its note, and @I2@'s record, stamp and all, as the first copy wrote it`);
  await retype(page, two.indexOf('0 @I2@ INDI') + 2, '1 NAME Joseph /Fixtures/');
  await page.click("document.getElementById('save')");
  await page.waitFor("document.getElementById('dialog').open");
  const third = await page.ev(SAVE_DIALOG);
  await page.click(BUTTON('#dialog', 'Cancel'));
  await page.waitFor("!document.getElementById('dialog').open");
  check(third.stamps.length === 1 && third.stamps[0].startsWith('@I2@ INDI') && third.stamps[0].endsWith('its stamp from an earlier copy, set anew'),
    `@I2@ changed again: the dialog's stamp is "${third.stamps[0]}"`);
}

// Download a copy, in a browser with no file pickers (10.2): the button says so and ⌘S does the
// same; the copy is downloaded under its dated name; and the download is the last copy, so leaving
// warns only for changes made since. The page is loaded again with the pickers taken away.
async function copyWithoutPickers(page, dir, shots) {
  console.log('\n== Download a copy, in a browser with no file pickers');
  const file = path.join(dir, 'small.ged');
  fs.writeFileSync(file, SMALL);
  const downloads = path.join(dir, 'downloads');
  fs.mkdirSync(downloads);
  await page.browser('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  await page.addScript("for (const k of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) { delete Window.prototype[k]; delete window[k]; }");
  await page.goto(`file://${path.join(ROOT, 'index.html')}`);
  check(await page.ev("!('showSaveFilePicker' in window) && !('showOpenFilePicker' in window)"), 'the page, loaded again with no pickers');
  const empty = await page.ev("({ label: document.getElementById('save').textContent, title: document.getElementById('save').title })");
  check(empty.label === 'Download a copy' && empty.title === 'Download a dated copy; the original is never written (⌘S)', `before a file is open, the button reads "${empty.label}"`);
  await page.openFile(file);
  await page.click("document.getElementById('edit')");
  await retype(page, 9, '1 NAME Jane /Fixtures/');
  check(await page.ev("document.getElementById('save').textContent === 'Download a copy' && !document.getElementById('save').disabled"), 'an edit: Download a copy turns on');

  await page.key('s', 'KeyS', 83, 4);                                // ⌘S does the same
  await page.waitFor("document.getElementById('dialog').open");
  const shows = await page.ev(SAVE_DIALOG);
  check(shows.title === 'Download a copy of small.ged' && JSON.stringify(shows.lines) === JSON.stringify(['−1 NAME Jane /Fixture/', '+1 NAME Jane /Fixtures/'])
    && shows.check === 'Change stamps, 1 record' && shows.stamps[0].startsWith('@I1@ INDI') && JSON.stringify(shows.buttons) === JSON.stringify(['Cancel', 'Download']),
  `⌘S: "${shows.title}", the change, "${shows.check}", Cancel and Download`);
  if (shots) await page.screenshot(path.join(shots, 'small-save-dialog.png'));
  await page.click("document.querySelector('#dialog input[type=checkbox]')");         // unticked, for bytes that can be foretold
  check((await page.ev(SAVE_DIALOG)).noteOff, 'the stamps unticked: the note box is off');
  await page.click(BUTTON('#dialog', 'Download'));
  const copy = await waitForFile(downloads, /^small\.\d{4}-\d\d-\d\dT\d{6}\.ged$/);
  const doc = core.openDocument(new Uint8Array(Buffer.from(SMALL)));
  core.editLine(doc, 8, '1 NAME Jane /Fixtures/');
  check(copy && Buffer.compare(fs.readFileSync(path.join(downloads, copy)), Buffer.from(core.saveBytes(doc))) === 0,
    `downloaded as ${copy}: the file with its one edit, byte for byte`);
  await page.waitFor("!document.getElementById('notice').hidden && document.getElementById('dirty').hidden");
  const said = await page.ev("document.getElementById('notice').textContent");
  check(said === `Downloaded as ${copy}, where your browser keeps downloads.`, `then "${said}"`);
  check(await page.ev(`document.getElementById('save').disabled && !${LEAVE_ASKS}`), 'a download is the last copy: ● gone, the button off, and leaving asks nothing');
  check(fs.readdirSync(downloads).length === 1, 'one file downloaded, the copy: no log');
  await retype(page, 12, '1 NAME Joe /Fixtures/');
  check(await page.ev(`!document.getElementById('dirty').hidden && ${LEAVE_ASKS}`), 'a change made since: ● again, and leaving asks first');
  await page.click("document.getElementById('undo')");
  await page.waitFor("document.getElementById('dirty').hidden");
  check(await page.ev(`!${LEAVE_ASKS} && document.getElementById('changes-count').textContent === '1'`), 'undone: back to the last copy, ● gone; Changes 1, counted from the original');
}

// ---------------------------------------------------------------------------------------------
// 0.5.5: the look
// ---------------------------------------------------------------------------------------------

// Forty people of five lines each, one with a pointer to nothing, a family, and two media records:
// a _META that parses and one that does not.
function lookFiction() {
  const L = ['0 HEAD', '1 SOUR gedview-walk', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8'];
  for (let k = 1; k <= 40; k += 1) L.push(`0 @I${k}@ INDI`, `1 NAME Person${k} /Look/`, `1 SEX ${k % 2 ? 'F' : 'M'}`, '1 BIRT', `2 DATE ${1 + (k % 28)} JAN ${1800 + k}`);
  L.push('1 FAMC @F99@', '0 @F1@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '1 CHIL @I3@',
    '0 @O1@ OBJE', '1 FILE good.jpg', '1 _META <metadataxml><content><line>&lt;p&gt;Good <strong>story</strong>&lt;/p&gt;</line></content><cemetery>Look Cemetery</cemetery></metadataxml>',
    '0 @O2@ OBJE', '1 FILE broken.jpg', '1 _META <metadataxml><content><line>broken</content></metadataxml>', '0 TRLR');
  return `${L.join('\n')}\n`;
}

// What the grid and the lists look like: the pitch of its rows, the first line in view, the fold's box, the type, the lists' row heights.
const LOOK_NOW = `(() => { const g = document.getElementById('grid'); const rows = [...g.querySelectorAll('.v-inner > div')].filter((r) => r.style.display !== 'none');
  const f = g.querySelector('.fold:not(:empty)').getBoundingClientRect();
  return { pitch: rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top, first: rows[0].querySelector('.ln').textContent, fold: [f.width, f.height],
    font: getComputedStyle(g).fontSize, body: getComputedStyle(document.body).fontSize, small: getComputedStyle(document.querySelector('.version')).fontSize,
    lists: ['records-list', 'checks-list', 'changes-list', 'tags-list'].map((id) => getComputedStyle(document.getElementById(id)).getPropertyValue('--row-height')).join(), cls: document.documentElement.className,
    larger: document.getElementById('text-larger').getAttribute('aria-pressed') }; })()`;

async function theLook(page, dir, shots) {
  const file = path.join(dir, 'look.ged');
  fs.writeFileSync(file, lookFiction());
  const m = core.read(new Uint8Array(fs.readFileSync(file)));
  const line = (text) => m.texts.indexOf(text) + 1;
  const shot = (name) => (shots ? page.screenshot(path.join(shots, `look-${name}.png`)) : null);
  const media = (features) => page.send('Emulation.setEmulatedMedia', { features });
  const cls = () => page.ev('document.documentElement.className');
  const pressed = () => page.ev("['system', 'light', 'dusk', 'dark'].filter((n) => document.getElementById('theme-' + n).getAttribute('aria-pressed') === 'true').join()");
  const stored = (key) => page.ev(`localStorage.getItem('gedview.${key}')`);
  const reload = async () => { await page.goto(`file://${path.join(ROOT, 'index.html')}`); };
  console.log(`\n== the look (0.5.5), on a fictional file of ${fmt(m.n)} lines`);

  // System follows the computer while the page is open; a chosen theme does not; a Sunset kept from before reads as Dusk
  await media([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.waitFor("!document.documentElement.classList.contains('dark')");
  const first = `${await cls()}|${await pressed()}`;
  await media([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.waitFor("document.documentElement.classList.contains('dark')");
  const dark = `${await cls()}|${await pressed()}`;
  await media([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.waitFor("!document.documentElement.classList.contains('dark')");
  const light = `${await cls()}|${await pressed()}`;
  check(first === '|system' && dark === 'dark|system' && light === '|system' && (await stored('theme')) === null,
    `System follows the computer, live: Light (${first}), then Dark (${dark}) the moment it changes, then Light again (${light}); nothing is stored`);
  await setting(page, 'theme-dusk');
  await media([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await sleep(100);
  const dusk = `${await cls()}|${await pressed()}|${await stored('theme')}`;
  check(dusk === 'dusk|dusk|"dusk"', `Dusk, chosen, stays Dusk when the computer is dark: ${dusk}`);
  await media([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.ev("localStorage.setItem('gedview.theme', JSON.stringify('sunset')); true");
  await reload();
  const sunset = `${await cls()}|${await pressed()}|${await stored('theme')}`;
  check(sunset === 'dusk|dusk|"sunset"', `a Sunset kept from before reads as Dusk, and is not rewritten: ${sunset}`);
  await page.ev("localStorage.setItem('gedview.theme', JSON.stringify('purple')); true");
  await reload();
  const unknown = `${await cls()}|${await pressed()}`;
  check(unknown === '|system', `a theme the page does not know reads as System: ${unknown}`);
  await page.ev("localStorage.removeItem('gedview.theme'); true");

  // the text size: the rows laid out again at their new height, the same line in view, the fold's box big enough
  await page.openFile(file);
  await gotoLine(page, line('1 FAMC @F99@'));
  await sleep(100);
  const count = await page.ev(ROWS);
  const normal = await page.ev(LOOK_NOW);
  check(normal.pitch === 24 && normal.body === '16px' && normal.font === '15px' && normal.small === '14px' && normal.lists === '26px,26px,26px,26px' && normal.fold[0] >= 24 && normal.fold[1] >= 24 && normal.larger === 'false',
    `Normal, the default: rows ${normal.pitch} px apart, type 16, 15 and 14 px, the lists' rows ${normal.lists.split(',')[0]}, a fold ${normal.fold.map((x) => Math.round(x)).join(' by ')} px`);
  await shot('normal');
  await setting(page, 'text-larger');
  await sleep(100);
  const larger = await page.ev(LOOK_NOW);
  check(larger.pitch === 30 && larger.body === '20px' && larger.font === '19px' && larger.lists === '32px,32px,32px,32px' && larger.fold[1] >= 30 && larger.cls === 'text-larger' && larger.larger === 'true' && (await stored('textSize')) === '"larger"',
    `Larger: rows ${larger.pitch} px apart, type 20 and 19 px, the lists' rows ${larger.lists.split(',')[0]}, and remembered`);
  check(larger.first === normal.first && (await page.ev(ROWS)) === count, `the same line, ${normal.first}, stays at the top of the view, and the grid is as long as before (${fmt(count)} rows)`);
  await shot('larger');
  await reload();
  const kept = await page.ev("document.documentElement.className + '|' + document.getElementById('text-larger').getAttribute('aria-pressed')");
  check(kept === 'text-larger|true', `Larger is remembered across a reload: ${kept}`);

  // a line opened for typing, and a block dragged: the box is a row high, and the gold line sits on a row's edge, at either size
  await page.openFile(file);
  await page.click("document.getElementById('edit')");
  for (const size of ['larger', 'normal']) {
    if (size === 'normal') await setting(page, 'text-normal');
    await sleep(100);
    const nameLine = line('1 NAME Person2 /Look/');
    await gotoLine(page, nameLine);
    await openEditBox(page);
    const box = await page.ev("(() => { const i = document.querySelector('#grid input.edit'); const r = i.closest('.row').getBoundingClientRect(); const b = i.getBoundingClientRect(); return { row: r.height, box: b.height, top: b.top - r.top, ring: getComputedStyle(i).outlineStyle }; })()");
    await page.key('Escape', 'Escape', 27);
    await page.waitFor("!document.querySelector('#grid input.edit')");
    const rec = (k) => line(`0 @I${k}@ INDI`);
    await gotoLine(page, rec(2));
    const from = await page.ev(ROW_RECT(rec(3)));
    const to = await page.ev(ROW_RECT(rec(2)));
    await page.mouse('mouseMoved', from.x, from.y);
    await page.mouse('mousePressed', from.x, from.y);
    await page.mouse('mouseMoved', from.x, from.y - 8, { button: 'left', buttons: 1 });
    await page.mouse('mouseMoved', to.x, to.top + 2, { button: 'left', buttons: 1 });
    await sleep(60);
    const held = await page.ev(`(() => { const d = document.querySelector('#grid .drop-line'); const b = d.getBoundingClientRect(); return { shown: !d.hidden, off: Math.abs(b.top + b.height / 2 - ${to.top}), h: b.height }; })()`);
    await page.mouse('mouseReleased', to.x, to.top + 2);
    await page.waitFor("document.getElementById('changes-count').textContent === '1'");
    await page.key('z', 'KeyZ', 90, 4);
    await page.waitFor("document.getElementById('changes-count').textContent === ''");
    const high = size === 'larger' ? 30 : 24;
    check(box.row === high && box.box === high && box.top === 0 && box.ring === 'solid', `${size}: the box a line is typed in is one row high (${box.box} px) and fills it, with its ring`);
    check(held.shown && held.off < 1.5 && held.h === 2, `${size}: the gold line of a drag shows at the edge of the row it would land before (${held.off.toFixed(1)} px off, ${held.h} px thick)`);
  }
  await page.click("document.getElementById('edit')");

  // a file too long for the taller rows is not laid out wrongly: Larger is refused with a plain notice
  const big = path.join(dir, 'look-big.ged');
  fs.writeFileSync(big, `0 HEAD\n1 CHAR UTF-8\n${'1 NOTE x\n'.repeat(1200000)}0 TRLR\n`);
  await page.openFile(big);
  await setting(page, 'text-larger');
  await sleep(150);
  const refused = await page.ev("({ cls: document.documentElement.className, normal: document.getElementById('text-normal').getAttribute('aria-pressed'), notice: document.getElementById('notice').hidden ? '' : document.getElementById('notice').textContent, stored: localStorage.getItem('gedview.textSize') })");
  check(refused.cls === '' && refused.normal === 'true' && /too many lines/.test(refused.notice) && refused.stored === '"normal"',
    `a file of 1,200,003 lines opens at Normal, and Larger is refused: "${refused.notice}"`);
  await page.click("document.getElementById('notice')");

  // less motion: the side frame hides at once, where it eased before
  await page.openFile(file);
  const frameAfterTwoFrames = () => page.ev(`(async () => { const side = document.getElementById('side'); document.getElementById('hide-left').click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const w = side.getBoundingClientRect().width;
    await new Promise((r) => setTimeout(r, 400)); document.getElementById('hide-left').click(); await new Promise((r) => setTimeout(r, 400)); return w; })()`);
  const eased = await frameAfterTwoFrames();
  await media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const durations = await page.ev("getComputedStyle(document.getElementById('work')).transitionDuration");
  const at_once = await frameAfterTwoFrames();
  await media([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  check(eased > 0 && at_once === 0 && durations === '0s', `less motion: the left frame is gone two frames after its icon is pressed (${at_once} px; it was ${Math.round(eased)} px, easing, without), and its transition lasts ${durations}`);

  // forced colors: what a tint or a shadow showed is drawn in the system's colors
  await media([{ name: 'forced-colors', value: 'active' }]);
  await page.click("document.getElementById('edit')");
  const nameLine = line('1 NAME Person2 /Look/');
  await gotoLine(page, nameLine);
  await openEditBox(page);
  const typing = await page.ev("(() => { const i = document.querySelector('#grid input.edit'); const c = getComputedStyle(i); return { text: c.color, bg: c.backgroundColor }; })()");
  await page.press('x', 'KeyX', 88, 'x');
  await page.key('Enter', 'Enter', 13);
  await page.waitFor("document.querySelector('#grid .row.is-sel.is-changed')");
  const forced = await page.ev(`(() => { const body = getComputedStyle(document.body).backgroundColor; const sel = document.querySelector('#grid .row.is-sel'); const css = (e) => getComputedStyle(e);
    const dot = getComputedStyle(sel.querySelector('.cg'), '::before').backgroundColor; const edit = document.getElementById('edit'); const tab = document.querySelector('.tab[aria-selected="true"]');
    return { body, row: css(sel).backgroundColor, rowAdjust: css(sel).forcedColorAdjust, dot, button: css(edit).backgroundColor, buttonAdjust: css(edit).forcedColorAdjust, tab: css(tab).backgroundColor, tabText: css(tab).color }; })()`);
  const okForced = forced.row !== forced.body && forced.rowAdjust === 'none' && forced.dot !== 'rgba(0, 0, 0, 0)' && forced.button !== forced.body && forced.buttonAdjust === 'none' && forced.tab !== forced.body && forced.tabText !== forced.tab && typing.text !== typing.bg;
  check(okForced, `forced colors: the selected line, the pressed Edit button and the selected tab are drawn in Highlight (not the page's background), the change dot is drawn, and a line being typed in is readable`);
  await shot('forced');
  await page.key('z', 'KeyZ', 90, 4);
  await page.waitFor("document.getElementById('changes-count').textContent === ''");
  await page.click("document.getElementById('edit')");
  await media([{ name: 'forced-colors', value: 'none' }]);

  // the policy allows no inline style; a _META that parses is drawn, one that does not draws nothing and costs the console one line of the page's own
  const policy = await page.ev("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content");
  check(/style-src 'self';/.test(policy) && !/unsafe/.test(policy), `the policy allows styles from the page's own file alone, none inline: ${policy}`);
  const infos = [];
  page.on((msg) => { if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'info') infos.push(msg.params.args.map((a) => a.value || '').join(' ')); });
  const errorsBefore = page.log.errors.length;
  await gotoLine(page, line('1 FILE good.jpg') + 1);
  const goodDrawn = await page.ev("[...document.querySelectorAll('#detail .detail-title')].map((t) => t.textContent).join('|') + ' / ' + ((document.querySelector('#detail .meta-story') || {}).innerText || '')");
  check(goodDrawn.startsWith('content|cemetery') && goodDrawn.includes('Good story') && page.log.errors.length === errorsBefore, `a _META that parses is drawn as it reads (${goodDrawn.split(' / ')[0]}), and the console says nothing`);
  await gotoLine(page, line('1 FILE broken.jpg') + 1);
  await sleep(200);
  const brokenShows = await page.ev("({ titles: [...document.querySelectorAll('#detail .detail-title')].map((t) => t.textContent).join('|'), story: !!document.querySelector('#detail .meta-story'), value: document.querySelector('#detail .detail-value').textContent.slice(0, 22), block: !!document.querySelector('#detail parsererror, body parsererror') })");
  const fresh = page.log.errors.splice(errorsBefore);                 // what Chrome says about its own error block: taken out, so the walk's last step sees only the page's own
  check(!brokenShows.story && !brokenShows.titles.includes('content') && brokenShows.value === '<metadataxml><content>' && !brokenShows.block,
    'a _META that does not parse draws nothing: the right frame shows the line as written, and no error block of Chrome\'s is on the page');
  check(fresh.length > 0 && fresh.every((e) => /Applying inline style violates/.test(e)) && infos.length === 1 && /^GEDCOM Viewer: a _META held XML that does not parse/.test(infos[0]) && /Nothing was sent anywhere\.$/.test(infos[0]),
    `the console holds Chrome's ${fresh.length} refusal${fresh.length === 1 ? '' : 's'} of its own style, and one line of the page's own: "${infos[0]}"`);
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
  async function inChrome(fn, attempt = 1) {
    const { page, close } = await launch();
    const before = failures;
    try {
      await page.goto(`file://${path.join(ROOT, 'index.html')}`);
      await fn(page);
    } catch (e) {
      if (page.log.errors.length) console.error(`the page said: ${page.log.errors.join(' | ')}`);
      // the page stopped answering — Chrome, not the page (tools/chrome.js, `press`): the part is
      // walked once more in a fresh Chrome, and its checks so far are counted again from the start
      if (/did not answer/.test(e.message) && attempt < 3) {
        console.log(`  --    the page stopped answering (${e.message.slice(0, 80)}…): Chrome is restarted and this part walked again`);
        failures = before;
        await close();
        return inChrome(fn, attempt + 1);
      }
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
    if (part('scroll')) await inChrome((page) => editorScroll(page, dir));
    if (part('drags')) await inChrome((page) => fourthDrags(page, dir, shots));
    if (part('save')) await inChrome((page) => saveWithDialog(page));
    if (part('copy')) await inChrome((page) => copyWithoutPickers(page, dir, shots));
    if (part('look')) await inChrome((page) => theLook(page, dir, shots));
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
