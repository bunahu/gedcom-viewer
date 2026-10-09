#!/usr/bin/env node
// gedview — the real files.
//
// Runs core.js over each file given and prints its counts in the shape tools/baseline_probe.py
// prints them — counts, tags, ids and hashes only, never a value — with its timings and its
// identity.
//
//     node tools/check-real.js FILE [FILE ...]
//
// A file whose sha256 is in local/measured.json (section 3's table, kept beside the real files and
// never in the repo) is held to that table, number for number. Any other file is held to what the
// probe prints for it. And every file must join back
// from its own lines to its own sha256 (I1), and be read, checked and counted in under a second.
// Then, as a document: a line edited and a record deleted with its pointer lines, each with the
// whole file checked again within section 16's 0.3 s, and both undone to the file as it was.
// Exit 0 when all of that holds.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const core = require('../core.js');

const ROOT = path.resolve(__dirname, '..');
const BUDGET_MS = 1000;
const EDIT_BUDGET_MS = 300;                                          // section 16: one re-check per edit

const ALL_ZERO = { E1: 0, E2: 0, E3: 0, E4: 0, E5: 0, E6: 0, E7: 0, E8: 0, E9: 0 };

// The measured table, per file, keyed by sha256: `local/measured.json`, beside the real files and
// outside the repo (the brief, section 3). Without it, every file is held to the probe.
const MEASURED = path.join(ROOT, 'local', 'measured.json');
const TABLE = fs.existsSync(MEASURED) ? JSON.parse(fs.readFileSync(MEASURED, 'utf8')) : {};

const PROBE_CODES = {
  E1: 'E1 no level number', E2: 'E2 wrong line shape', E3: 'E3 level jumps by more than one',
  E4: 'E4 file frame', E5: 'E5 blank line', E6: 'E6 id defined twice', E7: 'E7 pointer to nothing',
  E8: "E8 bytes not valid in the file's encoding", E9: 'E9 encoding contradiction',
  N1: 'N1 lines holding a line-break character', N2: 'N2 other control character',
  N3: 'N3 record nothing points at', N4: 'N4 line over 255 characters', N5: 'N5 leading whitespace',
  N6: 'N6 encoding shown as it can be',
};

function flatten(v, at, out) {
  if (Array.isArray(v)) {
    out[`${at}.length`] = v.length;
    v.forEach((x, i) => flatten(x, `${at}[${i}]`, out));
  } else if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) flatten(v[k], at ? `${at}.${k}` : k, out);
  } else out[at] = v;
  return out;
}

// Two numbers section 3 measured that the probe does not print: lines that end in a space or a
// tab, and tab characters inside values.
function extras(m) {
  let trailing = 0;
  let tabs = 0;
  for (let i = 0; i < m.n; i += 1) {
    const t = m.texts[i];
    const last = t.charCodeAt(t.length - 1);
    if (t.length && (last === 0x20 || last === 0x09)) trailing += 1;
    if (m.valAt[i] >= 0) for (let k = m.valAt[i]; k < t.length; k += 1) if (t.charCodeAt(k) === 0x09) tabs += 1;
  }
  return { trailing_whitespace_lines: trailing, tabs_in_values: tabs };
}

// The table's numbers laid out as the counts are: its check codes turned into the probe's names,
// and N7 read off the findings.
function tableView(expected) {
  const view = { ...expected, checks: {} };
  delete view.what;
  for (const [code, count] of Object.entries(expected.checks)) {
    if (code === 'N7') view.N7 = count;
    else view.checks[PROBE_CODES[code]] = count;
  }
  return view;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/check-real.js FILE [FILE ...]');
  process.exit(2);
}

let failed = 0;
const verdict = (ok, text) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${text}`);
};

for (const file of files) {
  const t0 = performance.now();
  const bytes = new Uint8Array(fs.readFileSync(file));
  const t1 = performance.now();
  const m = core.read(bytes);
  const t2 = performance.now();
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const counts = core.summary(m, path.basename(file), sha);
  const more = extras(m);
  const joined = crypto.createHash('sha256').update(core.bytesOf(m)).digest('hex');

  console.log(`\n=== ${path.basename(file)}`);
  console.log(JSON.stringify({ ...counts, ...more, N7: m.findings.byCode.N7.length }, null, 1));
  const tm = m.timings;
  const readMs = t2 - t0;
  console.log(`timings  file read ${(t1 - t0).toFixed(0)} ms · lines ${tm.lines.toFixed(0)} ms · ` +
    `decode, shape and checks ${tm.checks.toFixed(0)} ms · findings ${tm.gather.toFixed(0)} ms · ` +
    `labels ${tm.labels.toFixed(0)} ms · all ${readMs.toFixed(0)} ms`);

  const expected = TABLE[sha];
  let against;
  let name;
  if (expected) {
    name = `the measured table (${expected.what})`;
    against = tableView(expected);
  } else {
    name = 'the probe (this sha256 is not in the measured table)';
    against = JSON.parse(execFileSync('python3', [path.join(ROOT, 'tools', 'baseline_probe.py'), '--json', file]).toString('utf8'));
    delete against.file;
  }
  const mine = flatten({ ...counts, ...more, N7: m.findings.byCode.N7.length }, '', {});
  const theirs = flatten(against, '', {});
  const differ = Object.keys(theirs).filter((k) => mine[k] !== theirs[k]);
  verdict(differ.length === 0, `every number equals ${name}` +
    (differ.length ? `: ${differ.map((k) => `${k} ${mine[k]} (expected ${theirs[k]})`).join('; ')}` : ''));
  verdict(joined === sha, `identity: the lines joined back from their own bytes hash to ${sha}`);
  verdict(readMs < BUDGET_MS, `read, checked and counted in ${readMs.toFixed(0)} ms (budget ${BUDGET_MS} ms)`);

  // As a document: the line halfway down (or the first below it above level 0) edited, then its
  // record deleted with the lines that point at it. Nothing of either is printed but counts.
  const doc = core.openDocument(bytes);
  let at = Math.floor(doc.view.n / 2);
  while (at < doc.view.n - 1 && !(doc.view.level[at] > 0)) at += 1;
  const e0 = performance.now();
  const edit = core.editLine(doc, at, `${doc.view.texts[at]} x`);
  const e1 = performance.now();
  const plan = core.recordDeletion(doc, at);
  const d0 = performance.now();
  const del = core.deleteRecord(doc, at);
  const d1 = performance.now();
  const u0 = performance.now();
  core.undo(doc);
  core.undo(doc);
  const u1 = performance.now();
  const back = crypto.createHash('sha256').update(core.saveBytes(doc)).digest('hex');
  const slowest = Math.max(e1 - e0, d1 - d0, (u1 - u0) / 2);
  verdict(edit.ok && del.ok && slowest < EDIT_BUDGET_MS,
    `line ${at + 1} edited in ${(e1 - e0).toFixed(0)} ms; its record (${plan.to - plan.from} lines) deleted with ` +
    `${plan.pointers.length} pointer lines in ${(d1 - d0).toFixed(0)} ms; both undone in ${(u1 - u0).toFixed(0)} ms — ` +
    `each with the whole file checked again (budget ${EDIT_BUDGET_MS} ms each)`);
  verdict(back === sha, `both undone, the document saves to ${sha} again`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall pass');
process.exit(failed ? 1 : 0);
