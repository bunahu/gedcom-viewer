// Shared by the tests: where the fixtures are, and how a model's findings are written down.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../core.js');

const ROOT = path.resolve(__dirname, '..');
const SYNTHETIC = path.join(ROOT, 'fixtures', 'synthetic');
const CORPORA = path.join(ROOT, 'fixtures', 'corpora');

// The public test files are git-ignored for their licences, so a clone may not have them. A test
// that needs them skips, and says why.
const NO_CORPORA = fs.existsSync(path.join(CORPORA, 'gedcom7'))
  ? false
  : 'the public test files are not in fixtures/corpora/ (git-ignored for their licences; see fixtures/corpora/fetch_corpora.sh)';

function gedFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) gedFiles(p, out);
    else if (/\.ged$/i.test(name)) out.push(p);
  }
  return out;
}

// Every corpus file by its name (the names are unique across the five folders and sibling-own/).
function corpusByName() {
  const map = new Map();
  for (const p of gedFiles(CORPORA)) map.set(path.basename(p), p);
  return map;
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const bytesOfFile = (p) => new Uint8Array(fs.readFileSync(p));
const readFile = (p) => core.read(bytesOfFile(p));
const readText = (text, encoding = 'utf8') => core.read(new Uint8Array(Buffer.from(text, encoding)));

// UTF-16 bytes for a text, little- or big-endian, with or without a byte-order mark.
function utf16(text, { bigEndian = false, mark = false } = {}) {
  const body = Buffer.from(text, 'utf16le');
  if (bigEndian) body.swap16();
  const bom = mark ? Buffer.from(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]) : Buffer.alloc(0);
  return new Uint8Array(Buffer.concat([bom, body]));
}

// A model's findings as { code: [the line number on screen, or 'file'] }; a code with none is left
// out, so a test that names its expectation this way names EVERY finding the file gives.
function findingsOf(m) {
  const out = {};
  for (const f of m.findings.list) (out[f.code] ||= []).push(f.line < 0 ? 'file' : f.line + 1);
  return out;
}

module.exports = {
  ROOT, SYNTHETIC, CORPORA, NO_CORPORA,
  gedFiles, corpusByName, sha256, bytesOfFile, readFile, readText, utf16, findingsOf,
};
