#!/usr/bin/env node
// gedview — the second opinion, number for number.
//
// Reads the same files with core.js and with tools/baseline_probe.py (Python, written to the same
// rules, BUILD-BRIEF sections 6 and 7) and reports every number that differs. Where they differ,
// one of them has a rule wrong: read the rule and fix the one that departs from it.
//
//     node tools/compare.js [FILE | FOLDER ...]        default: fixtures/
//
// A folder is searched through for .ged files, any case. Prints counts, tags, ids and hashes only
// — never a value — so it is safe over a file that holds living people. Exit 0 when nothing
// differs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const core = require('../core.js');

const ROOT = path.resolve(__dirname, '..');

function gedFiles(p, out) {
  if (fs.statSync(p).isDirectory()) {
    for (const name of fs.readdirSync(p).sort()) gedFiles(path.join(p, name), out);
  } else if (/\.ged$/i.test(p)) out.push(p);
  return out;
}

// Every leaf of an object, as path → value, so two objects compare leaf by leaf.
function flatten(v, at, out) {
  if (Array.isArray(v)) {
    out[`${at}.length`] = v.length;
    v.forEach((x, i) => flatten(x, `${at}[${i}]`, out));
  } else if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) out[at] = '{}';
    for (const k of keys) flatten(v[k], at ? `${at}.${k}` : k, out);
  } else out[at] = v;
  return out;
}

const targets = process.argv.slice(2);
const files = (targets.length ? targets : [path.join(ROOT, 'fixtures')])
  .flatMap((t) => gedFiles(path.resolve(t), []));
if (!files.length) {
  console.error('no .ged files found');
  process.exit(2);
}

const probeOut = execFileSync('python3', [path.join(ROOT, 'tools', 'baseline_probe.py'), '--json', ...files],
  { maxBuffer: 1 << 28 }).toString('utf8').trim().split('\n');
if (probeOut.length !== files.length) {
  console.error(`the probe answered for ${probeOut.length} files of ${files.length}`);
  process.exit(2);
}

let differ = 0;
let filesDiffering = 0;
files.forEach((file, k) => {
  const bytes = fs.readFileSync(file);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const js = flatten(core.summary(core.read(new Uint8Array(bytes)), path.basename(file), sha), '', {});
  const py = flatten(JSON.parse(probeOut[k]), '', {});
  const keys = [...new Set([...Object.keys(js), ...Object.keys(py)])].sort();
  const diffs = keys.filter((key) => js[key] !== py[key]);
  const where = path.relative(ROOT, file);
  if (!diffs.length) {
    console.log(`same     ${where}`);
    return;
  }
  filesDiffering += 1;
  differ += diffs.length;
  console.log(`DIFFERS  ${where}`);
  for (const key of diffs) {
    const show = (x) => (x === undefined ? '(absent)' : JSON.stringify(x));
    console.log(`    ${key}: core.js ${show(js[key])} · probe ${show(py[key])}`);
  }
});
console.log(`\n${files.length} files · ${filesDiffering} differ · ${differ} numbers differ`);
process.exit(differ ? 1 : 0);
