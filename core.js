/* gedview — core.js
 *
 * The reading half: bytes → encoding → lines → shape → records and pointers → checks → counts →
 * labels. (The editing half — the document, the edits, undo, the stamps — is phase 3.)
 *
 * It never touches the page. The same file runs as a classic script in the page, where it sets
 * window.GedCore, and under Node, where tests and tools require it; so what the tests prove is
 * what the page runs. BUILD-BRIEF sections 6–8 are the specification. tools/baseline_probe.py
 * reads by the same rules in Python, and tools/compare.js holds the two to each other.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GedCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LF = 0x0a;
  const CR = 0x0d;

  // A line ends at CR LF, LF CR, LF or CR, and at nothing else (I2). A terminator's code, its
  // name, and its length in units (a unit is a byte, or 16 bits in a UTF-16 file).
  const TERM = { NONE: 0, LF: 1, CR: 2, CRLF: 3, LFCR: 4 };
  const TERM_NAMES = ['none', 'LF', 'CR', 'CRLF', 'LFCR'];
  const TERM_UNITS = [0, 1, 1, 2, 2];

  // What each line turned out to be.
  const KIND = { OK: 0, BLANK: 1, NO_LEVEL: 2, BAD_SHAPE: 3 };

  // 6.3 — level, [id,] tag, [value], with ONE space between the parts. Everything after the space
  // that follows the tag is the value as written: leading spaces, trailing spaces and tabs
  // included. The `s` flag makes `.` match every character; without it JavaScript would stop at
  // U+2028 and U+2029, and nothing ends a line inside a line.
  const SHAPE = /^(0|[1-9][0-9]*) (?:(@[^@ ]+@) )?([A-Za-z0-9_]+)(?: (.*))?$/s;
  // 6.4 — a pointer is a whole value of the form @…@, no space and no inner @.
  const POINTER = /^@[^@ ]+@$/;
  // Every character N1 or N2 is about. A line holding none of them is not walked character by
  // character, which is most lines. (Escapes in this file are written \u{…}: a raw U+2028 or
  // U+2029 ends a regular expression in JavaScript source.)
  const SPECIAL = /[\x00-\x08\x0b-\x1f\x7f\x85\u{2028}\u{2029}]/u;
  // The records the standard gives a change date (CHAN), 5.5.5 and 7.0 together.
  const CHANGE_DATE_RECORDS = new Set(['FAM', 'INDI', 'OBJE', 'NOTE', 'SNOTE', 'REPO', 'SOUR', 'SUBM']);

  // Section 7, as the screen names them, errors first.
  const CHECKS = [
    { code: 'E1', kind: 'error', name: 'No level number' },
    { code: 'E2', kind: 'error', name: 'Not level · tag · value' },
    { code: 'E3', kind: 'error', name: 'Level jumps' },
    { code: 'E4', kind: 'error', name: 'No HEAD first / TRLR last' },
    { code: 'E5', kind: 'error', name: 'Blank line' },
    { code: 'E6', kind: 'error', name: 'Id defined twice' },
    { code: 'E7', kind: 'error', name: 'Points at nothing' },
    { code: 'E8', kind: 'error', name: 'Unreadable bytes' },
    { code: 'E9', kind: 'error', name: 'Header and bytes disagree' },
    { code: 'N1', kind: 'note', name: 'Line break inside the value' },
    { code: 'N2', kind: 'note', name: 'Control character' },
    { code: 'N3', kind: 'note', name: 'Nothing points at it' },
    { code: 'N4', kind: 'note', name: 'Over 255 characters' },
    { code: 'N5', kind: 'note', name: 'Leading whitespace' },
    { code: 'N6', kind: 'note', name: 'Encoding shown as it can be' },
    { code: 'N7', kind: 'note', name: 'Mixed line endings' },
  ];
  const CHECK_ORDER = Object.fromEntries(CHECKS.map((c, i) => [c.code, i]));

  // The probe's names for the same counts. N7 is not one of them: the probe reports the
  // terminators themselves, and N7 is read off those.
  const PROBE_CHECK_NAMES = [
    ['E1', 'E1 no level number'],
    ['E2', 'E2 wrong line shape'],
    ['E3', 'E3 level jumps by more than one'],
    ['E4', 'E4 file frame'],
    ['E5', 'E5 blank line'],
    ['E6', 'E6 id defined twice'],
    ['E7', 'E7 pointer to nothing'],
    ['E8', "E8 bytes not valid in the file's encoding"],
    ['E9', 'E9 encoding contradiction'],
    ['N1', 'N1 lines holding a line-break character'],
    ['N2', 'N2 other control character'],
    ['N3', 'N3 record nothing points at'],
    ['N4', 'N4 line over 255 characters'],
    ['N5', 'N5 leading whitespace'],
    ['N6', 'N6 encoding shown as it can be'],
  ];

  const CODEC_LABEL = { 'utf-8': 'UTF-8', 'utf-16-le': 'UTF-16 LE', 'utf-16-be': 'UTF-16 BE', ascii: 'ASCII' };

  // Python's str.strip() and str.rstrip() with no argument, which the probe uses on the header's
  // CHAR and VERS values. JavaScript's trim() is a different set (it strips U+FEFF and keeps
  // U+001C–U+001F and U+0085), so the header is read by Python's set, for the two to agree.
  const PY_SPACE = new Set(
    '\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}' +
    '\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}');
  function pyRstrip(s) {
    let b = s.length;
    while (b > 0 && PY_SPACE.has(s[b - 1])) b -= 1;
    return s.slice(0, b);
  }
  function pyStrip(s) {
    let a = 0;
    while (a < s.length && PY_SPACE.has(s[a])) a += 1;
    return pyRstrip(s.slice(a));
  }

  // Characters as the standard counts them: code points, not JavaScript's 16-bit units. A
  // character outside the Basic Multilingual Plane is two units and one character.
  function codePoints(s) {
    let n = s.length;
    for (let k = 0; k < s.length - 1; k += 1) {
      const c = s.charCodeAt(k);
      if (c >= 0xd800 && c <= 0xdbff) {
        const d = s.charCodeAt(k + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { n -= 1; k += 1; }
      }
    }
    return n;
  }

  // ---------------------------------------------------------------------------------------------
  // 6.1 Encoding — the bytes first, the header last
  // ---------------------------------------------------------------------------------------------

  // A byte-order mark, then the pattern of UTF-16 with no mark, and only then the header, which
  // can be read one byte per character only in a file that is one byte per character. In UTF-16
  // every ASCII character of `0 HEAD` is a text byte and a zero: zero second is little-endian,
  // zero first is big-endian. The sibling project's reader learned this order the hard way (its issue 752).
  function detect(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { codec: 'utf-8', unit: 1, prefix: 3, how: 'byte-order mark' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { codec: 'utf-16-le', unit: 2, prefix: 2, how: 'byte-order mark' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { codec: 'utf-16-be', unit: 2, prefix: 2, how: 'byte-order mark' };
    }
    const n = Math.min(8, bytes.length) & ~1;
    if (n >= 4) {
      let firstAll = true; let firstAny = false; let secondAll = true; let secondAny = false;
      for (let i = 0; i < n; i += 2) {
        if (bytes[i] === 0) firstAll = false; else firstAny = true;
        if (bytes[i + 1] === 0) secondAll = false; else secondAny = true;
      }
      if (firstAll && !secondAny) return { codec: 'utf-16-le', unit: 2, prefix: 0, how: 'byte pattern' };
      if (secondAll && !firstAny) return { codec: 'utf-16-be', unit: 2, prefix: 0, how: 'byte pattern' };
    }
    return { codec: null, unit: 1, prefix: 0, how: 'header' };
  }

  // The header's own statement: `1 CHAR`, and `1 GEDC` → `2 VERS`, from the header's lines, read
  // in the encoding the bytes gave (or one byte per character when they gave none).
  function readHeader(bytes, idx, peekCodec) {
    const peek = lineDecoder(bytes, peekCodec);
    let declared = null; let version = null; let underGedc = false; let charLine = -1;
    const upTo = Math.min(80, idx.n);
    for (let i = 0; i < upTo; i += 1) {
      const text = peek.decode(idx.start[i], idx.end[i]);
      const t = text.replace(/^[ \t]+/, '');
      if (t.startsWith('0 ') && !t.startsWith('0 HEAD')) break;      // the header is over
      if (t.startsWith('1 ')) underGedc = pyRstrip(t) === '1 GEDC' || t.startsWith('1 GEDC ');
      if (t.startsWith('1 CHAR ')) { declared = pyStrip(t.slice(7)); charLine = i; }
      else if (t.startsWith('2 VERS ') && underGedc && version === null) version = pyStrip(t.slice(7));
    }
    return { declared, version, charLine };
  }

  // The table of 6.1. `flags` are E9 (the header and the bytes disagree; the bytes win); `notes`
  // are N6 (an encoding shown only as it can be). The words match the probe's, so the two can be
  // compared, and they are the words the screen shows.
  function decideEncoding(enc, declared, version) {
    const flags = [];
    const notes = [];
    const norm = pyStrip(declared || '').toUpperCase();
    const major7 = (version || '').startsWith('7');
    let codec = enc.codec;
    if (codec === null) {
      if (norm === 'UTF-8' || norm === 'UTF8') codec = 'utf-8';
      else if (norm === '' && major7) codec = 'utf-8';               // version 7 is UTF-8 and has no CHAR
      else if (norm === '') { codec = 'utf-8'; flags.push('no CHAR line; read as UTF-8'); }
      else if (norm === 'ASCII') codec = 'ascii';
      else if (norm === 'UNICODE' || norm === 'UTF-16') {
        codec = 'utf-8';
        flags.push(`header says ${declared} but the bytes are one per character; read as UTF-8`);
      } else {
        codec = 'one-byte';
        notes.push(`header says ${declared}; shown one byte per character, bytes kept as they are`);
      }
    } else if (enc.unit === 2 && !(norm === 'UNICODE' || norm === 'UTF-16' || norm === '')) {
      flags.push(`header says ${declared} but the bytes are UTF-16`);
    } else if (codec === 'utf-8' && !(norm === 'UTF-8' || norm === 'UTF8' || norm === '')) {
      flags.push(`header says ${declared} but the file opens with a UTF-8 byte-order mark`);
    }
    return { codec, flags, notes };
  }

  // One line's bytes → its text, and whether the bytes were valid in the file's encoding (E8).
  // UTF-8 and UTF-16 go through the platform's decoder, which puts U+FFFD where bytes are bad;
  // only a line that shows U+FFFD is decoded a second time, strictly, to tell a bad byte from a
  // U+FFFD that was written. `ignoreBOM` keeps a U+FEFF inside the file as the character it is.
  // Any other encoding is one byte = one character of the same number — not the browser's latin1,
  // which is Windows-1252 and would show bytes 0x80–0x9F as other characters.
  function lineDecoder(bytes, codec) {
    let clean = true;
    let decode;
    if (codec === 'utf-8' || codec === 'utf-16-le' || codec === 'utf-16-be') {
      const label = codec === 'utf-8' ? 'utf-8' : codec === 'utf-16-le' ? 'utf-16le' : 'utf-16be';
      const loose = new TextDecoder(label, { ignoreBOM: true });
      const strict = new TextDecoder(label, { ignoreBOM: true, fatal: true });
      decode = (s, e) => {
        const view = bytes.subarray(s, e);
        const text = loose.decode(view);
        clean = true;
        if (text.indexOf('\u{FFFD}') !== -1) {
          try { strict.decode(view); } catch (err) { clean = false; }
        }
        return text;
      };
    } else {
      const ascii = codec === 'ascii';
      decode = (s, e) => {
        clean = true;
        let text = '';
        for (let p = s; p < e; p += 8192) {
          const chunk = bytes.subarray(p, Math.min(e, p + 8192));
          text += String.fromCharCode.apply(null, chunk);
          if (ascii && clean) {
            for (let k = 0; k < chunk.length; k += 1) if (chunk[k] >= 0x80) { clean = false; break; }
          }
        }
        return text;
      };
    }
    return { decode, isClean: () => clean };
  }

  // ---------------------------------------------------------------------------------------------
  // 6.2 Lines
  // ---------------------------------------------------------------------------------------------

  // One pass over the units. Every line keeps three numbers: the byte where it starts, the byte
  // where its content ends, and which terminator follows. Byte offsets, in UTF-16 too, so that a
  // save can take any run of untouched lines as one slice of the original bytes (I1).
  //
  // LF then CR is ONE terminator only in a file whose first line ends that way; anywhere else it
  // is an LF ending one line and a CR ending an empty one. A UTF-16 file of odd length keeps its
  // last byte in its last line, where it cannot be read (E8) and is written back as it was.
  function indexLines(bytes, prefix, unit, bigEndian) {
    const len = bytes.length;
    let cap = Math.max(1024, len >> 5);
    let start = new Uint32Array(cap);
    let end = new Uint32Array(cap);
    let term = new Uint8Array(cap);
    let n = 0;
    const push = (s, e, t) => {
      if (n === cap) {
        cap *= 2;
        const s2 = new Uint32Array(cap); s2.set(start); start = s2;
        const e2 = new Uint32Array(cap); e2.set(end); end = e2;
        const t2 = new Uint8Array(cap); t2.set(term); term = t2;
      }
      start[n] = s; end[n] = e; term[n] = t; n += 1;
    };

    if (unit === 1) {
      let first = prefix;
      while (first < len && bytes[first] !== LF && bytes[first] !== CR) first += 1;
      const lfcrFile = first + 1 < len && bytes[first] === LF && bytes[first + 1] === CR;
      let pos = prefix;
      let lineStart = prefix;
      while (pos < len) {
        const b = bytes[pos];
        if (b > CR) { pos += 1; continue; }                          // every byte above CR is content
        if (b === CR) {
          if (pos + 1 < len && bytes[pos + 1] === LF) { push(lineStart, pos, TERM.CRLF); pos += 2; }
          else { push(lineStart, pos, TERM.CR); pos += 1; }
          lineStart = pos;
        } else if (b === LF) {
          if (lfcrFile && pos + 1 < len && bytes[pos + 1] === CR) { push(lineStart, pos, TERM.LFCR); pos += 2; }
          else { push(lineStart, pos, TERM.LF); pos += 1; }
          lineStart = pos;
        } else pos += 1;
      }
      if (lineStart < len) push(lineStart, len, TERM.NONE);
    } else {
      const whole = prefix + ((len - prefix) & ~1);                  // the last whole unit's end
      const at = bigEndian
        ? (p) => (bytes[p] << 8) | bytes[p + 1]
        : (p) => bytes[p] | (bytes[p + 1] << 8);
      let first = prefix;
      while (first < whole) { const u = at(first); if (u === LF || u === CR) break; first += 2; }
      const lfcrFile = first + 2 < whole && at(first) === LF && at(first + 2) === CR;
      let pos = prefix;
      let lineStart = prefix;
      while (pos < whole) {
        const u = at(pos);
        if (u === CR) {
          if (pos + 2 < whole && at(pos + 2) === LF) { push(lineStart, pos, TERM.CRLF); pos += 4; }
          else { push(lineStart, pos, TERM.CR); pos += 2; }
          lineStart = pos;
        } else if (u === LF) {
          if (lfcrFile && pos + 2 < whole && at(pos + 2) === CR) { push(lineStart, pos, TERM.LFCR); pos += 4; }
          else { push(lineStart, pos, TERM.LF); pos += 2; }
          lineStart = pos;
        } else pos += 2;
      }
      if (lineStart < len) push(lineStart, len, TERM.NONE);          // takes an odd last byte too
    }
    return { n, start: start.subarray(0, n), end: end.subarray(0, n), term: term.subarray(0, n) };
  }

  // ---------------------------------------------------------------------------------------------
  // read: 6.3 shape, 6.4 records and pointers, section 7 checks, section 8 counts and labels
  // ---------------------------------------------------------------------------------------------

  const now = typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now();

  function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }
  function listIn(map, key) {
    let list = map.get(key);
    if (!list) { list = []; map.set(key, list); }
    return list;
  }

  // The whole file, read. Every check is run over every line; the brief measured a full pass at
  // about a fifth of a second on the largest file, so nothing here is incremental.
  function read(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const t0 = now();

    const enc = detect(bytes);
    const idx = indexLines(bytes, enc.prefix, enc.unit, enc.codec === 'utf-16-be');
    const n = idx.n;
    const t1 = now();

    const head = readHeader(bytes, idx, enc.codec || 'one-byte');
    const decided = decideEncoding(enc, head.declared, head.version);
    const codec = decided.codec;
    const v7 = (head.version || '').startsWith('7');
    const dec = lineDecoder(bytes, codec);

    const texts = new Array(n);
    const kind = new Uint8Array(n);
    const level = new Float64Array(n).fill(-1);                      // -1: the line did not parse
    const lead = new Uint32Array(n);                                 // spaces and tabs before the level
    const tag = new Array(n).fill(null);
    const xref = new Array(n).fill(null);
    const valAt = new Int32Array(n).fill(-1);                        // where the value starts in the text

    const levelCounts = new Map();
    const tagCounts = new Map();
    const topCounts = new Map();
    const records = [];                                              // the line of each record, in file order
    const definedAt = new Map();                                     // id → the lines that define it
    const pointedBy = new Map();                                     // id → the lines that point at it
    const found = Object.fromEntries(CHECKS.map((c) => [c.code, []]));
    const add = (code, line, detail) => { found[code].push(detail === undefined ? { line } : { line, detail }); };

    let longest = 0;
    let n1Chars = 0;
    let prev = -1;

    // Per line, in the probe's order: bytes (E8), length, blank (E5), leading space (N5), over
    // 255 (N4), line-break and control characters (N1, N2), and only then the shape (E1, E2).
    for (let i = 0; i < n; i += 1) {
      const text = dec.decode(idx.start[i], idx.end[i]);
      texts[i] = text;
      if (!dec.isClean()) add('E8', i);
      if (text.length > longest) { const cp = codePoints(text); if (cp > longest) longest = cp; }

      let ws = 0;
      while (ws < text.length) {
        const c = text.charCodeAt(ws);
        if (c !== 0x20 && c !== 0x09) break;
        ws += 1;
      }
      if (ws === text.length) { kind[i] = KIND.BLANK; add('E5', i); continue; }
      lead[i] = ws;
      if (ws > 0) add('N5', i);
      if (!v7 && text.length > 255 && codePoints(text) > 255) add('N4', i);
      if (SPECIAL.test(text)) {
        let breaks = 0;
        let control = false;
        for (let k = 0; k < text.length; k += 1) {
          const c = text.charCodeAt(k);
          if (c === 0x0b || c === 0x0c || (c >= 0x1c && c <= 0x1e) || c === 0x85 || c === 0x2028 || c === 0x2029) breaks += 1;
          else if ((c < 0x20 && c !== 0x09) || c === 0x7f) control = true;
        }
        if (breaks) { add('N1', i); n1Chars += breaks; }
        if (control) add('N2', i);
      }

      const c0 = text.charCodeAt(ws);
      if (c0 < 0x30 || c0 > 0x39) { kind[i] = KIND.NO_LEVEL; add('E1', i); continue; }
      const m = SHAPE.exec(ws ? text.slice(ws) : text);
      if (!m) { kind[i] = KIND.BAD_SHAPE; add('E2', i); continue; }

      const lv = Number(m[1]);
      level[i] = lv;
      tag[i] = m[3];
      if (m[2] !== undefined) xref[i] = m[2];
      if (m[4] !== undefined) valAt[i] = text.length - m[4].length;
      bump(levelCounts, m[1]);
      bump(tagCounts, m[3]);
      if (lv > prev + 1) add('E3', i);                               // the first line must be level 0
      prev = lv;
      if (lv === 0) {
        records.push(i);
        bump(topCounts, m[3]);
        if (m[2] !== undefined) listIn(definedAt, m[2]).push(i);
      } else if (m[4] !== undefined && m[4] !== '@VOID@' && POINTER.test(m[4])) {
        listIn(pointedBy, m[4]).push(i);
      }
    }
    const t2 = now();

    // E4 — the frame: HEAD first, TRLR last, one of each.
    if (records.length === 0) {
      add('E4', -1, 'no 0 HEAD');
      add('E4', -1, 'no 0 TRLR');
    } else {
      const first = records[0];
      const last = records[records.length - 1];
      if (!(tag[first] === 'HEAD' && xref[first] === null)) add('E4', first, 'the first record is not 0 HEAD');
      let heads = 0; let trlrs = 0;
      for (const r of records) {
        if (tag[r] === 'HEAD' && ++heads > 1) add('E4', r, 'a second HEAD');
        if (tag[r] === 'TRLR' && ++trlrs > 1) add('E4', r, 'a second TRLR');
      }
      if (!(tag[last] === 'TRLR' && xref[last] === null)) add('E4', last, 'the last record is not 0 TRLR');
    }
    // E6 — each definition of an id after its first. N3 — a record with an id no pointer names
    // (one finding per id, on its first definition). E7 — a pointer to an id no record defines.
    for (const [id, lines] of definedAt) {
      for (let k = 1; k < lines.length; k += 1) add('E6', lines[k], id);
      if (!pointedBy.has(id)) add('N3', lines[0], id);
    }
    for (const [id, lines] of pointedBy) {
      if (!definedAt.has(id)) for (const line of lines) add('E7', line, id);
    }
    // E9 and N6 — one finding for the file, shown on its CHAR line when it has one.
    for (const flag of decided.flags) add('E9', head.charLine, flag);
    for (const note of decided.notes) add('N6', head.charLine, note);
    // N7 — more than one kind of terminator. A last line with none is not a kind.
    const termCounts = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i += 1) termCounts[idx.term[i]] += 1;
    const kinds = [TERM.CRLF, TERM.LFCR, TERM.LF, TERM.CR].filter((t) => termCounts[t] > 0);
    if (kinds.length > 1) {
      add('N7', -1, kinds.map((t) => `${TERM_NAMES[t]} ${termCounts[t].toLocaleString('en-US')}`).join(' · '));
    }

    const model = {
      bytes, size: bytes.length, prefix: enc.prefix, unit: enc.unit,
      codec, how: enc.how, declared: head.declared, version: head.version, v7,
      encodingLabel: CODEC_LABEL[codec] || head.declared || 'one byte per character',
      encodingFlags: decided.flags, encodingNotes: decided.notes,
      n, start: idx.start, end: idx.end, term: idx.term, termCounts,
      texts, kind, level, lead, tag, xref, valAt,
      levelCounts, tagCounts, topCounts, records, definedAt, pointedBy,
      longest, n1Chars,
      findings: null, recOf: null, labels: null, facts: null, timings: null,
    };
    model.findings = gatherFindings(found, n);
    model.recOf = recordIndex(records, n);
    model.facts = headerFacts(model);
    const t3 = now();
    model.labels = recordLabels(model);
    const t4 = now();
    model.timings = { lines: t1 - t0, checks: t2 - t1, gather: t3 - t2, labels: t4 - t3, total: t4 - t0 };
    return model;
  }

  // The findings three ways: by check (the Checks panel and the counts), in file order (step
  // through them), and by line (a row's mark; the right pane).
  function gatherFindings(found, n) {
    const byCode = found;
    const list = [];
    for (const c of CHECKS) for (const f of byCode[c.code]) list.push({ code: c.code, line: f.line, detail: f.detail });
    list.sort((a, b) => (a.line - b.line) || (CHECK_ORDER[a.code] - CHECK_ORDER[b.code]));
    const atLine = new Map();
    const marks = new Uint8Array(n);                                 // 1 error, 2 note, 3 both
    let errors = 0; let notes = 0;
    for (const f of list) {
      const isError = f.code[0] === 'E';
      if (isError) errors += 1; else notes += 1;
      if (f.line < 0) continue;
      listIn(atLine, f.line).push(f);
      marks[f.line] |= isError ? 1 : 2;
    }
    return { byCode, list, atLine, marks, errors, notes, fileLevel: list.filter((f) => f.line < 0) };
  }

  // The record each line sits in (-1 before the first record). A line that did not parse, or is
  // blank, belongs to the record it sits in; it ends nothing (6.4).
  function recordIndex(records, n) {
    const recOf = new Int32Array(n).fill(-1);
    for (let r = 0; r < records.length; r += 1) {
      const to = r + 1 < records.length ? records[r + 1] : n;
      recOf.fill(r, records[r], to);
    }
    return recOf;
  }

  function recordEnd(m, r) { return r + 1 < m.records.length ? m.records[r + 1] : m.n; }

  // The subtree of a line: the lines after it with a greater level, up to the first line whose
  // level is not greater. Lines that did not parse are inside whatever they sit in.
  function subtreeEnd(m, i) {
    const lv = m.level[i];
    if (lv < 0) return i + 1;
    let j = i + 1;
    while (j < m.n && (m.level[j] < 0 || m.level[j] > lv)) j += 1;
    return j;
  }

  function valueOf(m, i) { return m.valAt[i] < 0 ? '' : m.texts[i].slice(m.valAt[i]); }

  function isPointerLine(m, i) {
    if (!(m.level[i] > 0) || m.valAt[i] < 0) return false;
    const v = valueOf(m, i);
    return v !== '@VOID@' && POINTER.test(v);
  }

  // The first line of the record (from line `from` to line `to`) at `lv` with `tg`, or -1.
  function firstChild(m, from, to, lv, tg) {
    for (let i = from; i < to; i += 1) if (m.level[i] === lv && m.tag[i] === tg) return i;
    return -1;
  }

  // The file's facts from its header: the exporting system and its version (HEAD.SOUR, .VERS),
  // and the header's date. As written.
  function headerFacts(m) {
    const facts = { source: null, sourceVersion: null, date: null };
    if (!m.records.length || m.tag[m.records[0]] !== 'HEAD') return facts;
    const from = m.records[0] + 1;
    const to = recordEnd(m, 0);
    const sour = firstChild(m, from, to, 1, 'SOUR');
    if (sour >= 0) {
      facts.source = valueOf(m, sour);
      const vers = firstChild(m, sour + 1, subtreeEnd(m, sour), 2, 'VERS');
      if (vers >= 0) facts.sourceVersion = valueOf(m, vers);
    }
    const date = firstChild(m, from, to, 1, 'DATE');
    if (date >= 0) facts.date = valueOf(m, date);
    return facts;
  }

  const YEAR = /(?:^|[^0-9])([0-9]{3,4})(?![0-9])/;

  // A record's label, for the screen only; never written (8). An INDI is its first NAME as written
  // and the years of its first BIRT and DEAT dates; a FAM, the labels of its HUSB and WIFE; and
  // so on down the table. Anything with nothing to show is its record line as written.
  function recordLabels(m) {
    const labels = new Array(m.records.length);
    const lineAsWritten = (i) => m.texts[i].slice(m.lead[i]);
    const yearIn = (from, to, event) => {
      const at = firstChild(m, from, to, 1, event);
      if (at < 0) return '';
      const date = firstChild(m, at + 1, subtreeEnd(m, at), 2, 'DATE');
      if (date < 0) return '';
      const y = YEAR.exec(valueOf(m, date));
      return y ? y[1] : '';
    };
    const family = [];
    for (let r = 0; r < m.records.length; r += 1) {
      const line = m.records[r];
      const from = line + 1;
      const to = recordEnd(m, r);
      const t = m.tag[line];
      let label = '';
      if (t === 'INDI') {
        const name = firstChild(m, from, to, 1, 'NAME');
        if (name >= 0) {
          label = valueOf(m, name);
          const b = yearIn(from, to, 'BIRT');
          const d = yearIn(from, to, 'DEAT');
          if (b || d) label += ` (${b}–${d})`;
        }
      } else if (t === 'FAM') {
        family.push(r);
        continue;                                                    // after every INDI has its label
      } else if (t === 'SOUR') {
        const titl = firstChild(m, from, to, 1, 'TITL');
        if (titl >= 0) label = valueOf(m, titl);
      } else if (t === 'OBJE') {
        const titl = firstChild(m, from, to, 1, 'TITL');
        if (titl >= 0) label = valueOf(m, titl);
        else {
          const file = firstChild(m, from, to, 1, 'FILE');
          if (file >= 0) {
            const ft = firstChild(m, file + 1, subtreeEnd(m, file), 2, 'TITL');
            label = ft >= 0 ? valueOf(m, ft) : valueOf(m, file);
          }
        }
      } else if (t === 'REPO' || t === 'SUBM') {
        const name = firstChild(m, from, to, 1, 'NAME');
        if (name >= 0) label = valueOf(m, name);
      } else if (t === 'NOTE' || t === 'SNOTE') {
        label = valueOf(m, line).slice(0, 120);
      }
      labels[r] = label || lineAsWritten(line);
    }
    for (const r of family) {
      const line = m.records[r];
      const from = line + 1;
      const to = recordEnd(m, r);
      const parts = [];
      for (const role of ['HUSB', 'WIFE']) {
        const at = firstChild(m, from, to, 1, role);
        if (at < 0) continue;
        const def = m.definedAt.get(valueOf(m, at));
        if (def) parts.push(labels[m.recOf[def[0]]]);
      }
      labels[r] = parts.length ? parts.join(' & ') : lineAsWritten(line);
    }
    return labels;
  }

  // ---------------------------------------------------------------------------------------------
  // Reading helpers the page uses
  // ---------------------------------------------------------------------------------------------

  // The value of a CONC/CONT run, joined, when line i is part of one: the line above the run, then
  // each CONC appended as it is and each CONT after a line break. For reading only; the file keeps
  // its lines as they are (I3). Null when line i is in no run.
  function joinedValue(m, i) {
    if (m.level[i] < 0) return null;
    let headLine = i;
    if (m.tag[i] === 'CONC' || m.tag[i] === 'CONT') {
      const lv = m.level[i];
      let j = i - 1;
      while (j >= 0 && m.level[j] === lv && (m.tag[j] === 'CONC' || m.tag[j] === 'CONT')) j -= 1;
      if (j < 0 || m.level[j] !== lv - 1) return null;
      headLine = j;
    }
    const lv = m.level[headLine] + 1;
    let text = valueOf(m, headLine);
    let j = headLine + 1;
    while (j < m.n && m.level[j] === lv && (m.tag[j] === 'CONC' || m.tag[j] === 'CONT')) {
      text += (m.tag[j] === 'CONT' ? '\n' : '') + valueOf(m, j);
      j += 1;
    }
    if (j === headLine + 1) return null;
    return { from: headLine, to: j, text };
  }

  // The lines holding `query` in the line as written, case not minded, in file order.
  function search(m, query) {
    const out = [];
    if (!query) return out;
    const q = query.toLowerCase();
    for (let i = 0; i < m.n; i += 1) if (m.texts[i].toLowerCase().indexOf(q) !== -1) out.push(i);
    return out;
  }

  // The lines whose tag is `tg`, in file order.
  function searchTag(m, tg) {
    const out = [];
    for (let i = 0; i < m.n; i += 1) if (m.tag[i] === tg) out.push(i);
    return out;
  }

  // Level-0 tags with their counts, largest first, HEAD and TRLR left out (8).
  function recordCounts(m) {
    return [...m.topCounts.entries()]
      .filter(([t]) => t !== 'HEAD' && t !== 'TRLR')
      .sort((a, b) => b[1] - a[1]);
  }

  // Every original line from its own bytes, in `order` (all of them, when no order is given): a
  // run of consecutive lines is one slice of the original bytes, from the first line's start to
  // the last line's terminator, and the file's prefix comes first. With no edit this is the file
  // itself, byte for byte (I1). Phase 3 adds the lines typed in a session.
  function bytesOf(m, order) {
    const seq = order || null;
    const count = seq ? seq.length : m.n;
    const at = seq ? (k) => seq[k] : (k) => k;
    const slices = [m.bytes.subarray(0, m.prefix)];
    let total = m.prefix;
    let k = 0;
    while (k < count) {
      const a = at(k);
      let b = a;
      k += 1;
      while (k < count && at(k) === b + 1) { b += 1; k += 1; }
      const s = m.start[a];
      const e = m.end[b] + TERM_UNITS[m.term[b]] * m.unit;
      slices.push(m.bytes.subarray(s, e));
      total += e - s;
    }
    const out = new Uint8Array(total);
    let p = 0;
    for (const sl of slices) { out.set(sl, p); p += sl.length; }
    return out;
  }

  // The counts, in the shape tools/baseline_probe.py prints them, key for key, so the two can be
  // compared. `name` and `sha256` come from the caller: core.js reads no files and hashes nothing
  // (the page hashes with crypto.subtle, Node with node:crypto).
  function summary(m, name, sha256) {
    const checks = {};
    for (const [code, label] of PROBE_CHECK_NAMES) checks[label] = m.findings.byCode[code].length;
    const levels = {};
    for (const key of [...m.levelCounts.keys()].sort((a, b) => Number(a) - Number(b))) levels[key] = m.levelCounts.get(key);
    const records = {};
    for (const [t, c] of [...m.topCounts.entries()].sort((a, b) => b[1] - a[1])) records[t] = c;
    let canCarry = 0;
    for (const [t, c] of m.topCounts) if (CHANGE_DATE_RECORDS.has(t)) canCarry += c;
    const tc = m.termCounts;
    return {
      file: name,
      bytes: m.size,
      sha256,
      encoding: m.codec, told_by: m.how, byte_order_mark: m.prefix,
      header_says: m.declared, version: m.version,
      encoding_flags: m.encodingFlags.slice(), encoding_notes: m.encodingNotes.slice(),
      lines: m.n,
      terminators: { CRLF: tc[TERM.CRLF], LFCR: tc[TERM.LFCR], LF: tc[TERM.LF], CR: tc[TERM.CR], none: tc[TERM.NONE] },
      longest_line: m.longest,
      levels,
      records,
      records_that_can_carry_a_change_date: canCarry,
      distinct_tags: m.tagCounts.size,
      CONC: m.tagCounts.get('CONC') || 0, CONT: m.tagCounts.get('CONT') || 0, CHAN: m.tagCounts.get('CHAN') || 0,
      ids_defined: m.definedAt.size,
      checks,
      N1_characters: m.n1Chars,
    };
  }

  return {
    TERM, TERM_NAMES, KIND, CHECKS,
    read, detect, bytesOf, summary,
    recordEnd, subtreeEnd, valueOf, isPointerLine, joinedValue,
    search, searchTag, recordCounts, codePoints,
  };
});
