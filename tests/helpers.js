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


// A small reader of markup into the plain nodes core.js draws a _META from (3.3): elements with
// their attributes, text with the common entities, comments; a void element (br, hr, img) and a
// self-closing tag close themselves. For the tests only — the page reads with DOMParser, in an
// inert document — so the written files keep to well-formed markup.
function parseMarkup(text) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input']);
  const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10));
    return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
  });
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '<') {
      const j = text.indexOf('<', i);
      const end = j < 0 ? text.length : j;
      top().children.push({ text: decode(text.slice(i, end)) });
      i = end;
      continue;
    }
    if (text.startsWith('<!--', i)) {
      const j = text.indexOf('-->', i);
      top().children.push({ comment: true });
      i = j < 0 ? text.length : j + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const j = text.indexOf(']]>', i);
      top().children.push({ text: text.slice(i + 9, j < 0 ? text.length : j) });
      i = j < 0 ? text.length : j + 3;
      continue;
    }
    if (text.startsWith('<?', i) || text.startsWith('<!', i)) {
      const j = text.indexOf('>', i);
      i = j < 0 ? text.length : j + 1;
      continue;
    }
    const m = /^<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/.exec(text.slice(i));
    if (!m) { top().children.push({ text: '<' }); i += 1; continue; }
    if (m[1]) {
      let k = stack.length - 1;
      while (k > 0 && stack[k].name.toLowerCase() !== m[2].toLowerCase()) k -= 1;
      if (k > 0) stack.length = k;
    } else {
      const attrs = {};
      for (const a of m[3].matchAll(/([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
        attrs[a[1]] = decode(a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '');
      }
      const e = { name: m[2], attrs, children: [] };
      top().children.push(e);
      if (!m[4] && !VOID.has(m[2].toLowerCase())) stack.push(e);
    }
    i += m[0].length;
  }
  return root;
}

// The _META parts of a value, read as the page reads them but with parseMarkup in DOMParser's
// place: the XML's root element, and the story's HTML.
function metaOf(value) {
  const root = parseMarkup(value).children.find((c) => c.name !== undefined);
  return core.metaParts(root || null, (html) => parseMarkup(html));
}

module.exports = {
  ROOT, SYNTHETIC, CORPORA, NO_CORPORA,
  gedFiles, corpusByName, sha256, bytesOfFile, readFile, readText, utf16, findingsOf, parseMarkup, metaOf,
};
