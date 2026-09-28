// Spike: the byte-slice line model, in plain JavaScript, measured on a real file.
//
// Claim under test: a GEDCOM can be held as (the original bytes) + (one [start, end, terminator]
// triple per line), so that a save writes every untouched line from the ORIGINAL BYTES and only
// encodes the lines that were edited. Then "open + save with no edit" is byte-identical by
// construction, whatever the line endings, trailing spaces or odd characters.
//
// Falsifiers: the claim is wrong if (1) the line count differs from an independent count,
// (2) the re-assembled bytes do not hash to the file's recorded sha256, or (3) the whole scan
// takes long enough to be felt (budget: 2 s for 8 MB).
//
// Prints counts, timings and hashes only - never a value.  Usage: node line_model_spike.js <file.ged>
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const LF = 0x0a;
const CR = 0x0d;
const SP = 0x20;
const AT = 0x40;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// One pass over the bytes. A line ends at CR LF, LF or a bare CR - and at nothing else.
// (U+0085, U+2028 and the rest are ordinary characters inside a value.)
function indexLines(bytes) {
  let cap = 1 << 16;
  let start = new Uint32Array(cap);   // offset of the line's first byte
  let end = new Uint32Array(cap);     // offset just past its last content byte
  let term = new Uint8Array(cap);     // 0 (last line, no terminator), 1 (LF or CR), 2 (CR LF)
  let n = 0;
  let pos = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const prefix = pos;                 // a byte-order mark belongs to the file, not to line 1
  const len = bytes.length;
  const push = (s, e, t) => {
    if (n === cap) {
      cap *= 2;
      const s2 = new Uint32Array(cap); s2.set(start); start = s2;
      const e2 = new Uint32Array(cap); e2.set(end); end = e2;
      const t2 = new Uint8Array(cap); t2.set(term); term = t2;
    }
    start[n] = s; end[n] = e; term[n] = t; n += 1;
  };
  let lineStart = pos;
  while (pos < len) {
    const b = bytes[pos];
    if (b === LF) { push(lineStart, pos, 1); pos += 1; lineStart = pos; }
    else if (b === CR) {
      if (pos + 1 < len && bytes[pos + 1] === LF) { push(lineStart, pos, 2); pos += 2; }
      else { push(lineStart, pos, 1); pos += 1; }
      lineStart = pos;
    } else pos += 1;
  }
  if (lineStart < len) push(lineStart, len, 0);   // a last line with no terminator
  return { n, start: start.subarray(0, n), end: end.subarray(0, n), term: term.subarray(0, n), prefix };
}

// The line shape, read from the BYTES (ASCII up to the value): level [@xref@] TAG [value]
// Returns the level (or -1), and the offsets of tag and value; no strings are made here.
function shapeOf(bytes, s, e) {
  let p = s;
  let level = 0;
  let digits = 0;
  while (p < e && bytes[p] >= 0x30 && bytes[p] <= 0x39) { level = level * 10 + (bytes[p] - 0x30); p += 1; digits += 1; }
  if (digits === 0 || p >= e || bytes[p] !== SP) return null;       // no level number
  if (digits > 1 && bytes[s] === 0x30) return null;                  // a leading zero
  p += 1;
  let xs = -1; let xe = -1;
  if (p < e && bytes[p] === AT) {
    xs = p; p += 1;
    while (p < e && bytes[p] !== AT && bytes[p] !== SP) p += 1;
    if (p >= e || bytes[p] !== AT) return null;                      // an id with no closing @
    p += 1; xe = p;
    if (p >= e || bytes[p] !== SP) return null;                      // an id and nothing after it
    p += 1;
  }
  const ts = p;
  while (p < e && bytes[p] !== SP) {
    const c = bytes[p];
    const ok = (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x5f;
    if (!ok) return null;                                            // a tag with an odd character
    p += 1;
  }
  if (p === ts) return null;                                         // no tag
  const te = p;
  const vs = p < e ? p + 1 : e;                                      // one space, then the value as written
  return { level, xs, xe, ts, te, vs, ve: e };
}

const file = process.argv[2];
const t0 = performance.now();
const bytes = new Uint8Array(fs.readFileSync(file));
const tRead = performance.now();
const idx = indexLines(bytes);
const tIndex = performance.now();

// shape + counts + structure, straight off the bytes
const dec = new TextDecoder('utf-8');
const ascii = (s, e) => String.fromCharCode.apply(null, bytes.subarray(s, e));
const top = new Map();
const tagCount = new Map();
const defined = new Map();
const pointed = new Map();
let bad = 0; let jump = 0; let blank = 0; let over255 = 0; let lineBreakChars = 0; let prev = -1;
for (let i = 0; i < idx.n; i += 1) {
  const s = idx.start[i]; const e = idx.end[i];
  if (s === e) { blank += 1; continue; }
  const sh = shapeOf(bytes, s, e);
  if (!sh) { bad += 1; continue; }
  if (sh.level > prev + 1) jump += 1;
  prev = sh.level;
  const tag = ascii(sh.ts, sh.te);
  tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
  if (sh.level === 0) {
    top.set(tag, (top.get(tag) || 0) + 1);
    if (sh.xs >= 0) { const x = ascii(sh.xs, sh.xe); defined.set(x, (defined.get(x) || 0) + 1); }
  } else if (sh.ve > sh.vs && bytes[sh.vs] === AT && bytes[sh.ve - 1] === AT) {
    let inner = true;
    for (let p = sh.vs + 1; p < sh.ve - 1; p += 1) if (bytes[p] === AT || bytes[p] === SP) { inner = false; break; }
    if (inner) { const x = ascii(sh.vs, sh.ve); pointed.set(x, (pointed.get(x) || 0) + 1); }
  }
}
const tShape = performance.now();

// text for every line (what the screen would need if it decoded everything up front)
let chars = 0;
for (let i = 0; i < idx.n; i += 1) {
  const text = dec.decode(bytes.subarray(idx.start[i], idx.end[i]));
  chars += text.length;
  if (text.length > 255) over255 += 1;
  for (let k = 0; k < text.length; k += 1) {
    const c = text.charCodeAt(k);
    if (c === 0x85 || c === 0x2028 || c === 0x2029 || c === 0x0b || c === 0x0c || (c >= 0x1c && c <= 0x1e)) lineBreakChars += 1;
  }
}
const tDecode = performance.now();

// save with no edit: every line from its own bytes
const whole = Buffer.concat([
  bytes.subarray(0, idx.prefix),
  ...Array.from({ length: idx.n }, (_, i) => bytes.subarray(idx.start[i], idx.end[i] + idx.term[i])),
]);
const tJoin = performance.now();
const hashIn = sha256(bytes);
const hashOut = sha256(whole);

// save with ONE edit: line k's content replaced; everything else in two untouched runs
const k = Math.floor(idx.n / 2);
const replacement = new TextEncoder().encode('1 NOTE gedview spike');
const edited = Buffer.concat([
  bytes.subarray(0, idx.start[k]),
  replacement,
  bytes.subarray(idx.end[k]),          // from line k's own terminator to the end of the file
]);
const expectLen = bytes.length - (idx.end[k] - idx.start[k]) + replacement.length;
const back = indexLines(new Uint8Array(edited));
const tEdit = performance.now();

const ms = (a, b) => `${(b - a).toFixed(0)} ms`;
const sorted = (m) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
let dup = 0; for (const v of defined.values()) if (v > 1) dup += 1;
let dangling = 0; for (const x of pointed.keys()) if (!defined.has(x)) dangling += 1;
let unpointed = 0; for (const x of defined.keys()) if (!pointed.has(x)) unpointed += 1;
let t1 = 0; let t2 = 0; let t0n = 0;
for (let i = 0; i < idx.n; i += 1) { if (idx.term[i] === 2) t2 += 1; else if (idx.term[i] === 1) t1 += 1; else t0n += 1; }

console.log(`file bytes            ${bytes.length.toLocaleString()}`);
console.log(`lines                 ${idx.n.toLocaleString()}   (CR LF ${t2.toLocaleString()} · LF or CR ${t1.toLocaleString()} · none ${t0n})`);
console.log(`characters            ${chars.toLocaleString()}`);
console.log(`level-0 records       ${JSON.stringify(sorted(top))}`);
console.log(`distinct tags         ${tagCount.size}   CONC ${tagCount.get('CONC') || 0} · CONT ${tagCount.get('CONT') || 0}`);
console.log(`wrong shape           ${bad}   blank ${blank}   level jumps ${jump}`);
console.log(`ids defined           ${defined.size.toLocaleString()}   defined twice ${dup}   pointers to nothing ${dangling}   never pointed at ${unpointed}`);
console.log(`lines over 255 chars  ${over255}   line-break characters inside values ${lineBreakChars}`);
console.log(`timings               read ${ms(t0, tRead)} · index ${ms(tRead, tIndex)} · shape+counts ${ms(tIndex, tShape)} · decode all ${ms(tShape, tDecode)} · join ${ms(tDecode, tJoin)}`);
console.log(`sha256 in             ${hashIn}`);
console.log(`sha256 out (no edit)  ${hashOut}   identical: ${hashIn === hashOut}`);
console.log(`one edit              length ${edited.length.toLocaleString()} (expected ${expectLen.toLocaleString()}: ${edited.length === expectLen}) · lines after ${back.n.toLocaleString()} (same count: ${back.n === idx.n}) · ${ms(tJoin, tEdit)}`);
