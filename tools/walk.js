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
// Every FILE gets the read-only walk. For a real file only counts, tags, ids, line numbers,
// lengths and timings are printed — never a value — and no picture of it is ever taken. Then the
// rest of the page (Records, Search, the keys, a dropped file, a file too long to show) is walked
// on a fictional file written to the system's temp folder and removed after. --shots DIR saves
// pictures of that fictional file, and of nothing else. Exit 0 when every step passes.
//
// Section 15's editing walk (phase 4) is not here yet: its folder picker and its permission
// prompts need a person's click.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../core.js');
const { launch, sleep } = require('./chrome.js');

const ROOT = path.resolve(__dirname, '..');
const BUDGET_MS = 2000;                                              // "it opens in under 2 seconds"
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
    const pad = () => page.ev("getComputedStyle(document.querySelector('#grid .row.is-sel .tx')).paddingLeft");
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
    console.log('\n== the whole walk');
    check(page.log.errors.length === 0, `no error in the console${page.log.errors.length ? `: ${page.log.errors.join(' | ')}` : ''}`);
    const off = page.log.requests.filter((u) => !u.startsWith('file://'));
    check(off.length === 0, `nothing left the machine: ${page.log.requests.length} requests, every one file://${off.length ? ` — but ${off.join(' ')}` : ''}`);
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
