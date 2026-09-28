/* gedview — core.js
 *
 * The reading half: bytes → encoding → lines → shape → records and pointers → checks → counts →
 * labels. The editing half: the document, the edits, undo, the net change, the change stamps and
 * the bytes of a save (BUILD-BRIEF sections 9 and 10).
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
  // How many lines from the top the header's CHAR and VERS are looked for in.
  const HEADER_LINES = 80;

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
    const upTo = Math.min(HEADER_LINES, idx.n);
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
    const dec = lineDecoder(bytes, decided.codec);
    const texts = new Array(n);
    const bad = new Uint8Array(n);                                   // 1: the line's bytes are not valid (E8)
    for (let i = 0; i < n; i += 1) {
      texts[i] = dec.decode(idx.start[i], idx.end[i]);
      if (!dec.isClean()) bad[i] = 1;
    }
    const t2 = now();

    const model = analyse(texts, bad, idx.term, enc, head, decided);
    model.bytes = bytes;
    model.size = bytes.length;
    model.start = idx.start;
    model.end = idx.end;
    const tm = model.timings;
    model.timings = { lines: t1 - t0, checks: t2 - t1 + tm.checks, gather: tm.gather, labels: tm.labels, total: now() - t0 };
    return model;
  }

  // A file's lines, checked: 6.3 shape, 6.4 records and pointers, section 7's checks, section 8's
  // counts and labels. It works from the texts, not the bytes, so that after every edit the
  // document is checked again by the very code that read it (9.2). `bad` marks the lines whose
  // bytes could not be read (E8); `term` holds the terminators (N7); `enc`, `head` and `decided`
  // are 6.1's findings about the file's encoding. The model's bytes and line table are the
  // caller's to fill in; a document's view has none.
  function analyse(texts, bad, term, enc, head, decided) {
    const n = texts.length;
    const t1 = now();
    const codec = decided.codec;
    const v7 = (head.version || '').startsWith('7');

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
      const text = texts[i];
      if (bad[i]) add('E8', i);
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
    for (let i = 0; i < n; i += 1) termCounts[term[i]] += 1;
    const kinds = [TERM.CRLF, TERM.LFCR, TERM.LF, TERM.CR].filter((t) => termCounts[t] > 0);
    if (kinds.length > 1) {
      add('N7', -1, kinds.map((t) => `${TERM_NAMES[t]} ${termCounts[t].toLocaleString('en-US')}`).join(' · '));
    }

    const model = {
      bytes: null, size: 0, prefix: enc.prefix, unit: enc.unit,
      codec, how: enc.how, declared: head.declared, version: head.version, v7,
      encodingLabel: CODEC_LABEL[codec] || head.declared || 'one byte per character',
      encodingFlags: decided.flags, encodingNotes: decided.notes,
      n, start: null, end: null, term, termCounts,
      texts, bad, kind, level, lead, tag, xref, valAt,
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
    model.timings = { checks: t2 - t1, gather: t3 - t2, labels: t4 - t3 };
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

  // The bytes of a file, line by line (10.2): the file's prefix (a byte-order mark) first; then a
  // run of consecutive original lines n, n+1, n+2 … as one slice of the original bytes, from the
  // first line's start to the last line's terminator; and an added line (a number below 0) as
  // `addedBytes` gives it. With no edit this is the file itself, byte for byte (I1).
  function joinBytes(m, count, at, addedBytes) {
    const slices = [m.bytes.subarray(0, m.prefix)];
    let total = m.prefix;
    let k = 0;
    while (k < count) {
      const a = at(k);
      k += 1;
      if (a < 0) {
        const b = addedBytes(a);
        slices.push(b);
        total += b.length;
        continue;
      }
      let b = a;
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

  // Original lines only, in `order` (all of them, when no order is given).
  function bytesOf(m, order) {
    const seq = order || null;
    return joinBytes(m, seq ? seq.length : m.n, seq ? (k) => seq[k] : (k) => k, null);
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

  // ---------------------------------------------------------------------------------------------
  // 9 The document: the file as read, which never changes, and the lines typed over it
  // ---------------------------------------------------------------------------------------------
  //
  // BUILD-BRIEF 9.1. `order` holds one number for each line on screen: n ≥ 0 is original line n,
  // written from its own bytes (I1); n < 0 is added line -n-1, typed in this session and written
  // in the file's encoding. Every act is a list of splices on `order` — some numbers taken out at
  // a place, others put in — and its undo is the same splices run backwards. `savedOrder` is
  // `order` at open or at the last save in place; what changed is the one against the other (9.4).
  //
  // An added line keeps its text, its terminator, its lineage, and — when gedview wrote it for a
  // change stamp — its part in the stamp. Its lineage is the line it stands for: the original line
  // an edit was typed over (for an edit of an edit, the first one's lineage), or its own number
  // when it is new. The net change pairs a line before with a line after by lineage. An edit typed
  // back to its original — the same text and the same terminator — puts the original's number
  // back, and the save writes the original's own bytes (9.1).

  const TERM_BYTES = [[], [LF], [CR], [CR, LF], [LF, CR]];            // a terminator's units, by code
  const utf8 = new TextEncoder();
  const num = (n) => n.toLocaleString('en-US');

  function openDocument(input) {
    const m = read(input);
    const order = new Array(m.n);
    for (let i = 0; i < m.n; i += 1) order[i] = i;
    return {
      m,                                                             // the file as read; never changed
      added: [],                                                     // the lines typed in this session
      order,
      savedOrder: order.slice(),
      done: [],                                                      // Undo takes the last of these
      undone: [],                                                    // Redo takes the last of these
      common: commonTerm(m),
      view: m,                                                       // the lines as they are now, checked
    };
  }

  // The terminator a new line takes: the one most common in the file (9.2); LF in a file with none.
  function commonTerm(m) {
    let best = TERM.LF;
    for (const t of [TERM.CRLF, TERM.CR, TERM.LFCR]) if (m.termCounts[t] > m.termCounts[best]) best = t;
    return best;
  }

  function textOf(doc, e) { return e >= 0 ? doc.m.texts[e] : doc.added[-e - 1].text; }
  function termOf(doc, e) { return e >= 0 ? doc.m.term[e] : doc.added[-e - 1].term; }
  function lineageOf(doc, e) { return e >= 0 ? e : doc.added[-e - 1].lineage; }
  function stampOf(doc, e) { return e >= 0 ? null : doc.added[-e - 1].stamp; }

  // A line's level, id and tag as its text gives them: an original line's from the reading, an
  // added line's read once and kept. Level -1: the line does not parse.
  function shapeOf(doc, e) {
    if (e >= 0) return { level: doc.m.level[e], xref: doc.m.xref[e], tag: doc.m.tag[e] };
    const line = doc.added[-e - 1];
    if (!line.shape) {
      const hit = SHAPE.exec(line.text.replace(/^[ \t]+/, ''));
      line.shape = hit ? { level: Number(hit[1]), xref: hit[2] === undefined ? null : hit[2], tag: hit[3] }
        : { level: -1, xref: null, tag: null };
    }
    return line.shape;
  }

  function newLine(doc, text, term, lineage, stamp) {
    const id = -(doc.added.length + 1);
    doc.added.push({ text, term, lineage: lineage === undefined ? id : lineage, stamp: stamp || null, shape: null });
    return id;
  }

  // I11 — what a line may not hold, because it could not be written as typed: CR or LF, which
  // would end the line there (I2); half of a surrogate pair, which no encoding writes; and, in a
  // file read as ASCII or one byte per character, anything outside ASCII (9.2).
  function textRefusal(doc, text) {
    const oneByte = doc.m.unit === 1 && doc.m.codec !== 'utf-8';
    for (let k = 0; k < text.length; k += 1) {
      const c = text.charCodeAt(k);
      if (c === LF || c === CR) return 'A line cannot hold a line break: CR or LF would end the line there.';
      if (oneByte && c >= 0x80) {
        const cp = text.codePointAt(k);
        return `${String.fromCodePoint(cp)} (U+${cp.toString(16).toUpperCase().padStart(4, '0')}) is not ASCII. ` +
          `This file is read as ${doc.m.encodingLabel}, and gedview writes only ASCII into it.`;
      }
      if (c >= 0xd800 && c <= 0xdfff) {
        const d = k + 1 < text.length ? text.charCodeAt(k + 1) : 0;
        if (c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff) { k += 1; continue; }
        return 'The text holds half of a surrogate pair, which no encoding can write.';
      }
    }
    return null;
  }

  // An added line's bytes: its text in the file's encoding, then its terminator. textRefusal has
  // kept out whatever the encoding cannot hold.
  function lineBytes(doc, text, term) {
    const codec = doc.m.codec;
    const tail = TERM_BYTES[term];
    if (codec === 'utf-8') {
      const body = utf8.encode(text);
      const out = new Uint8Array(body.length + tail.length);
      out.set(body);
      out.set(tail, body.length);
      return out;
    }
    if (codec === 'utf-16-le' || codec === 'utf-16-be') {
      const hi = codec === 'utf-16-be' ? 0 : 1;                       // where a unit's high byte goes
      const units = text.length + tail.length;
      const out = new Uint8Array(units * 2);
      for (let k = 0; k < units; k += 1) {
        const u = k < text.length ? text.charCodeAt(k) : tail[k - text.length];
        out[2 * k + hi] = u >> 8;
        out[2 * k + 1 - hi] = u & 0xff;
      }
      return out;
    }
    const out = new Uint8Array(text.length + tail.length);           // ASCII, one byte per character
    for (let k = 0; k < text.length; k += 1) out[k] = text.charCodeAt(k);
    out.set(tail, text.length);
    return out;
  }

  // The bytes of a save (10.2): `order` walked, original lines from their own bytes, added lines
  // encoded. `upTo` stops after that many lines.
  function saveBytes(doc, upTo) {
    const order = doc.order;
    const count = upTo === undefined ? order.length : Math.min(upTo, order.length);
    return joinBytes(doc.m, count, (k) => order[k], (e) => {
      const line = doc.added[-e - 1];
      return lineBytes(doc, line.text, line.term);
    });
  }

  // Whether the lines of `order`, written out, read back as these same lines (6.2). A line's text
  // holds no CR or LF, so every line ends where its terminator starts; what can go wrong is where
  // two lines meet. A line with no terminator runs into the next; an empty last line with no
  // terminator is no line at all; and an empty line's terminator can join the one before it: CR
  // then LF is one CR LF, and LF then CR is one LF CR in a file whose first line ends that way.
  // The line where it would go wrong, or -1.
  function joinFault(doc) {
    const order = doc.order;
    const n = order.length;
    if (n === 0) return -1;
    const first = termOf(doc, order[0]);
    const lfcr = first === TERM.LFCR || (first === TERM.LF && n > 1 && textOf(doc, order[1]) === '' &&
      TERM_BYTES[termOf(doc, order[1])][0] === CR);
    let before = -1;                                                 // the terminator of the line above
    for (let k = 0; k < n; k += 1) {
      const e = order[k];
      const t = termOf(doc, e);
      if (before === TERM.NONE) return k - 1;
      if (textOf(doc, e).length === 0) {
        const unit = TERM_BYTES[t][0];
        if (t === TERM.NONE) return k;
        if (before === TERM.CR && unit === LF) return k;
        if (lfcr && before === TERM.LF && unit === CR) return k;
      }
      before = t;
    }
    return -1;
  }

  function faultReason(doc, k) {
    const at = num(k + 1);
    if (termOf(doc, doc.order[k]) !== TERM.NONE) {
      return `The empty line at line ${at} would not read back as a line: its line ending would join the one above it.`;
    }
    if (k < doc.order.length - 1) return `Line ${at} has no line ending, and the line after it would run into it.`;
    return 'An empty last line with no line ending would not be in the file at all.';
  }

  // How the file would be read, written out as it now is (6.1): its first bytes and its header
  // decide its encoding, and an edit can change either. Read as read() reads a file, from the
  // bytes of the lines read() looks at for the header.
  function headerOf(doc) {
    const bytes = saveBytes(doc, HEADER_LINES);
    const enc = detect(bytes);
    const idx = indexLines(bytes, enc.prefix, enc.unit, enc.codec === 'utf-16-be');
    const head = readHeader(bytes, idx, enc.codec || 'one-byte');
    return { enc, head, decided: decideEncoding(enc, head.declared, head.version) };
  }

  function encodingReason(doc, hdr) {
    if (hdr.decided.codec === doc.m.codec) {
      return 'The first line would then begin with a byte-order mark, which is read as the file\'s own, not the line\'s.';
    }
    const now = CODEC_LABEL[hdr.decided.codec] || hdr.head.declared || 'one byte per character';
    return `The file would then be read as ${now}, not ${doc.m.encodingLabel} (6.1), and every other line in it would read differently.`;
  }

  // The document checked again, whole (section 7 has no incremental checker): the lines as they
  // now are go through the analyse() that read the file.
  function recheck(doc, header) {
    const hdr = header || headerOf(doc);
    const m = doc.m;
    const order = doc.order;
    const n = order.length;
    const texts = new Array(n);
    const bad = new Uint8Array(n);
    const term = new Uint8Array(n);
    for (let k = 0; k < n; k += 1) {
      const e = order[k];
      if (e >= 0) { texts[k] = m.texts[e]; bad[k] = m.bad[e]; term[k] = m.term[e]; }
      else { const line = doc.added[-e - 1]; texts[k] = line.text; term[k] = line.term; }
    }
    doc.view = analyse(texts, bad, term, hdr.enc, hdr.head, hdr.decided);
  }

  // Take `count` numbers out of `list` at `at` and put `items` in, in place. (A spread of very
  // many items can overflow the stack, so a long run is put in by hand.)
  function spliceIn(list, at, count, items) {
    if (items.length <= 1000) { list.splice(at, count, ...items); return; }
    const tail = list.slice(at + count);
    list.length = at;
    for (const x of items) list.push(x);
    for (const x of tail) list.push(x);
  }

  // An act is made as it is planned: each splice at once, kept with what it took out, so that the
  // act runs backwards exactly.
  function cut(doc, done, at, count, items) {
    const removed = doc.order.slice(at, at + count);
    spliceIn(doc.order, at, count, items);
    done.push({ at, removed, inserted: items });
  }

  function unmake(doc, splices) {
    for (let k = splices.length - 1; k >= 0; k -= 1) {
      const s = splices[k];
      spliceIn(doc.order, s.at, s.inserted.length, s.removed);
    }
  }

  function remake(doc, splices) {
    for (const s of splices) spliceIn(doc.order, s.at, s.removed.length, s.inserted);
  }

  // An act, finished. The file as it now stands must read back as the lines shown, and in the
  // encoding it was opened in (I11); if not, the act is run backwards and refused, saying why.
  // Otherwise it is one step of the history, and the whole document is checked again.
  function finish(doc, label, done) {
    if (!done.length) return { ok: true, step: null };
    const k = joinFault(doc);
    const hdr = k < 0 ? headerOf(doc) : null;
    let reason = null;
    if (k >= 0) reason = faultReason(doc, k);
    else if (hdr.decided.codec !== doc.m.codec || hdr.enc.prefix !== doc.m.prefix) reason = encodingReason(doc, hdr);
    if (reason) {
      unmake(doc, done);
      return { ok: false, reason };
    }
    const step = { label, splices: done };
    doc.done.push(step);
    doc.undone.length = 0;
    recheck(doc, hdr);
    return { ok: true, step };
  }

  const refuse = (reason) => ({ ok: false, reason });
  const E8_REASON = 'This line\'s bytes could not be read in the file\'s encoding (E8). It can be deleted, not edited.';

  // 9.2 — a line typed over, whole: level, tag and value. It keeps its terminator. A line whose
  // bytes could not be read (E8) can be deleted, not edited: its text is not what the file holds.
  function editLine(doc, pos, text) {
    const e = doc.order[pos];
    if (e === undefined) return refuse(`There is no line ${num(pos + 1)}.`);
    if (e >= 0 && doc.m.bad[e]) return refuse(E8_REASON);
    if (text === textOf(doc, e)) return { ok: true, step: null };
    const why = textRefusal(doc, text);
    if (why) return refuse(why);
    const term = termOf(doc, e);
    const lineage = lineageOf(doc, e);
    const back = lineage >= 0 && text === doc.m.texts[lineage] && term === doc.m.term[lineage];
    const done = [];
    cut(doc, done, pos, 1, [back ? lineage : newLine(doc, text, term, lineage)]);
    return finish(doc, `Edit line ${num(pos + 1)}`, done);
  }

  // 9.2 — a new line directly under line `pos` (a child), or after line `pos`'s subtree (a sibling
  // below). The page offers the level; the text is the owner's.
  function addChild(doc, pos, text) { return addAt(doc, pos + 1, text); }
  function addSibling(doc, pos, text) { return addAt(doc, subtreeEnd(doc.view, pos), text); }

  function addAt(doc, at, text) {
    const why = textRefusal(doc, text);
    if (why) return refuse(why);
    const done = [];
    const refused = insert(doc, done, at, [{ text, stamp: null }]);
    if (refused) return refuse(refused);
    return finish(doc, `Add line ${num(at + 1)}`, done);
  }

  // New lines at `at`, each with the terminator most common in the file (9.2). After a last line
  // with no terminator, that line gains the common one and the new last line has none, so the file
  // ends as it did. Returns why, when the lines cannot go there.
  function insert(doc, done, at, lines) {
    const ids = lines.map((l) => newLine(doc, l.text, doc.common, undefined, l.stamp));
    const order = doc.order;
    if (at < order.length || at === 0 || termOf(doc, order[at - 1]) !== TERM.NONE) {
      cut(doc, done, at, 0, ids);
      return null;
    }
    const last = order[at - 1];
    if (last >= 0 && doc.m.bad[last]) {
      return 'The last line has no line ending, and its bytes could not be read (E8): it cannot be written again with one, so no line can follow it.';
    }
    const gained = newLine(doc, textOf(doc, last), doc.common, lineageOf(doc, last), stampOf(doc, last));
    doc.added[-ids[ids.length - 1] - 1].term = TERM.NONE;
    cut(doc, done, at - 1, 1, [gained, ...ids]);
    return null;
  }

  // 9.2 — a line and its subtree.
  function deleteLine(doc, pos) {
    if (doc.order[pos] === undefined) return refuse(`There is no line ${num(pos + 1)}.`);
    const end = subtreeEnd(doc.view, pos);
    const done = [];
    cut(doc, done, pos, end - pos, []);
    return finish(doc, end - pos > 1 ? `Delete lines ${num(pos + 1)}–${num(end)}` : `Delete line ${num(pos + 1)}`, done);
  }

  // 9.3 — what deleting the record that holds line `pos` takes: the record's own lines, and every
  // line elsewhere that points at it, each with its subtree. The page shows this and the owner
  // unticks what should stay. A pointer comes ticked, unless its id is defined again elsewhere
  // (E6): then it still points at a record. Null for a line before the first record.
  function recordDeletion(doc, pos) {
    const v = doc.view;
    const r = v.recOf[pos];
    if (r === undefined || r < 0) return null;
    const from = v.records[r];
    const to = recordEnd(v, r);
    const id = v.xref[from];
    const again = id !== null && v.definedAt.get(id).length > 1;
    const pointers = [];
    if (id !== null) {
      for (const line of v.pointedBy.get(id) || []) {
        if (line >= from && line < to) continue;                     // inside the record: goes with it
        pointers.push({ line, end: subtreeEnd(v, line), ticked: !again });
      }
    }
    return { record: r, from, to, id, tag: v.tag[from], pointers };
  }

  // The record that holds line `pos`, with the pointer lines listed in `ticked` (their line
  // numbers from recordDeletion; when not given, those it ticks), each with its subtree: all of it
  // one step, so one Undo brings all of it back.
  function deleteRecord(doc, pos, ticked) {
    const plan = recordDeletion(doc, pos);
    if (!plan) return refuse('This line is in no record.');
    const chosen = new Set(ticked === undefined ? plan.pointers.filter((p) => p.ticked).map((p) => p.line) : ticked);
    const ranges = [[plan.from, plan.to]];
    for (const p of plan.pointers) if (chosen.has(p.line)) ranges.push([p.line, p.end]);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of ranges) {
      const last = merged[merged.length - 1];
      if (last && s < last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    const done = [];
    for (let k = merged.length - 1; k >= 0; k -= 1) cut(doc, done, merged[k][0], merged[k][1] - merged[k][0], []);
    return finish(doc, `Delete record ${plan.id === null ? plan.tag : `${plan.id} ${plan.tag}`}`, done);
  }

  // Undo and Redo, one step each; the history survives a save (9.2).
  function undo(doc) {
    const step = doc.done.pop();
    if (!step) return null;
    unmake(doc, step.splices);
    doc.undone.push(step);
    recheck(doc);
    return step;
  }

  function redo(doc) {
    const step = doc.undone.pop();
    if (!step) return null;
    remake(doc, step.splices);
    doc.done.push(step);
    recheck(doc);
    return step;
  }

  // A save in place is done: the lines as they now are are the file on disk (10.2, step 10).
  function markSaved(doc) { doc.savedOrder = doc.order.slice(); }

  // Whether the lines differ from the file on disk.
  function isChanged(doc) {
    const a = doc.order;
    const b = doc.savedOrder;
    if (a.length !== b.length) return true;
    for (let k = 0; k < a.length; k += 1) if (a[k] !== b[k]) return true;
    return false;
  }

  // Which numbers a list holds, and at what place.
  function placesIn(doc, list) {
    const orig = new Int32Array(doc.m.n).fill(-1);
    const added = new Int32Array(doc.added.length).fill(-1);
    for (let k = 0; k < list.length; k += 1) {
      const e = list[k];
      if (e >= 0) orig[e] = k; else added[-e - 1] = k;
    }
    return (e) => (e >= 0 ? orig[e] : added[-e - 1]);
  }

  // 9.4 — what changed: `savedOrder` against `order`, never the history of keystrokes. No act
  // moves a line, so the numbers the two lists share come in the same order in both, and one walk
  // over the two finds every difference. Between two lines they share, a line before and a line
  // after of one lineage are one line changed; the other lines before were removed, the other
  // lines after added. Each item holds the line's place before (in `savedOrder`) and after (in
  // `order`), -1 where it has none; a removed line also holds `at`, the place after where it was.
  function netChange(doc) {
    const S = doc.savedOrder;
    const O = doc.order;
    const inS = placesIn(doc, S);
    const inO = placesIn(doc, O);
    const items = [];
    let i = 0; let j = 0;
    while (i < S.length || j < O.length) {
      if (i < S.length && j < O.length && S[i] === O[j]) { i += 1; j += 1; continue; }
      const i0 = i; const j0 = j;
      while (i < S.length && inO(S[i]) < 0) i += 1;
      while (j < O.length && inS(O[j]) < 0) j += 1;
      if ((i < S.length) !== (j < O.length) || (i < S.length && S[i] !== O[j])) {
        throw new Error('netChange: the lines as saved and the lines now are out of step');
      }
      const byLineage = new Map();
      for (let a = i0; a < i; a += 1) byLineage.set(lineageOf(doc, S[a]), a);
      const pairOf = new Map();                                      // place after → place before
      for (let b = j0; b < j; b += 1) {
        const a = byLineage.get(lineageOf(doc, O[b]));
        if (a !== undefined) pairOf.set(b, a);
      }
      const paired = new Set(pairOf.values());
      let a = i0; let b = j0;
      while (a < i || b < j) {
        if (a < i && !paired.has(a)) { items.push({ kind: 'removed', before: a, after: -1, at: b }); a += 1; }
        else if (b < j && !pairOf.has(b)) { items.push({ kind: 'added', before: -1, after: b }); b += 1; }
        else {
          if (pairOf.get(b) !== a) throw new Error('netChange: a changed line out of step');
          items.push({ kind: 'changed', before: a, after: b });
          a += 1; b += 1;
        }
      }
    }
    return items;
  }

  // The record a line of `savedOrder` sat in, as its record line's place there (-1: before the
  // first record). `memo` carries the last answer, so a run of removed lines is walked once.
  function savedRecordOf(doc, a, memo) {
    const S = doc.savedOrder;
    let r;
    if (shapeOf(doc, S[a]).level === 0) r = a;
    else if (memo.a === a - 1) r = memo.r;
    else { r = a - 1; while (r >= 0 && shapeOf(doc, S[r]).level !== 0) r -= 1; }
    memo.a = a;
    memo.r = r;
    return r;
  }

  // The net change in runs, for the Changes panel and the log: lines of one kind, each right after
  // the last, in one record, and all written by a change stamp or none. A run holds its kind; its
  // first place before and after (and, removed, `at`, the place after where it was); its lines, as
  // `was` and `now`; its record, as id and tag — in the file as saved for a removed run, as it now
  // is for the others; and whether a stamp wrote it.
  function changeRuns(doc, items) {
    const list = items || netChange(doc);
    const S = doc.savedOrder;
    const O = doc.order;
    const v = doc.view;
    const memo = { a: -2, r: -1 };
    const runs = [];
    for (const it of list) {
      let record = null;
      if (it.kind === 'removed') {
        const r = savedRecordOf(doc, it.before, memo);
        if (r >= 0) { const s = shapeOf(doc, S[r]); record = { id: s.xref, tag: s.tag, key: `saved ${r}` }; }
      } else if (v.recOf[it.after] >= 0) {
        const line = v.records[v.recOf[it.after]];
        record = { id: v.xref[line], tag: v.tag[line], key: `now ${line}` };
      }
      const stamp = it.after >= 0 && stampOf(doc, O[it.after]) !== null;
      const was = it.before >= 0 ? textOf(doc, S[it.before]) : null;
      const now = it.after >= 0 ? textOf(doc, O[it.after]) : null;
      const last = runs[runs.length - 1];
      const joins = last && last.kind === it.kind && last.stamp === stamp &&
        (last.record && last.record.key) === (record && record.key) &&
        (it.before < 0 || it.before === last.before + last.lines.length) &&
        (it.after < 0 || it.after === last.after + last.lines.length);
      if (joins) last.lines.push({ was, now });
      else {
        runs.push({ kind: it.kind, before: it.before, after: it.after, at: it.kind === 'removed' ? it.at : it.after,
          record, stamp, lines: [{ was, now }] });
      }
    }
    return runs;
  }

  // For the grid: each line now, 1 changed or 2 added since the last save; and, where lines were
  // removed, the place after they were.
  function lineMarks(doc, items) {
    const list = items || netChange(doc);
    const status = new Uint8Array(doc.order.length);
    const removedAt = new Uint8Array(doc.order.length + 1);
    for (const it of list) {
      if (it.kind === 'changed') status[it.after] = 1;
      else if (it.kind === 'added') status[it.after] = 2;
      else removedAt[it.at] = 1;
    }
    return { status, removedAt };
  }

  // ---------------------------------------------------------------------------------------------
  // 10.4 The change stamp
  // ---------------------------------------------------------------------------------------------

  const STAMP_TAGS = new Set(['FAM', 'INDI', 'OBJE', 'NOTE', 'REPO', 'SOUR', 'SUBM']);
  const STAMP_TAGS_7 = new Set(['FAM', 'INDI', 'OBJE', 'SNOTE', 'REPO', 'SOUR', 'SUBM']);
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const STAMP_NOTE = 'Edited by hand in gedview.';
  const STAMP_NOTE_MAX = 200;

  // A stamp's date and time, for a save made at `when`: the day without a leading zero, the month
  // as JAN … DEC, the year in four digits; HH:MM:SS on a 24-hour clock, local — and in a file whose
  // version starts with 7, UTC with a closing Z, the date being UTC's too.
  function stampTime(when, v7) {
    const two = (x) => String(x).padStart(2, '0');
    const [y, mo, d, h, mi, s] = v7
      ? [when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), when.getUTCHours(), when.getUTCMinutes(), when.getUTCSeconds()]
      : [when.getFullYear(), when.getMonth(), when.getDate(), when.getHours(), when.getMinutes(), when.getSeconds()];
    return { date: `${d} ${MONTHS[mo]} ${y}`, time: `${two(h)}:${two(mi)}:${two(s)}${v7 ? 'Z' : ''}` };
  }

  // A stamp's note: what the owner typed for this save, or, when he typed nothing, the standing
  // note. One line, 200 characters at most, nothing the file's encoding cannot hold.
  function stampNote(doc, typed) {
    const text = String(typed || '').trim() || STAMP_NOTE;
    if (/[\r\n]/.test(text)) return { reason: 'The note must be one line.' };
    const length = codePoints(text);
    if (length > STAMP_NOTE_MAX) return { reason: `The note is ${num(length)} characters; ${STAMP_NOTE_MAX} at most.` };
    const why = textRefusal(doc, text);
    return why ? { reason: why } : { text };
  }

  // The records a save stamps: every record the net change touched — a line changed or added in
  // it, or a line it lost — other than by a stamp of gedview's own, that is still in the file,
  // under a tag that may carry a change date (section 2). Record numbers of the view, last first.
  function stampTargets(doc, items) {
    const list = items || netChange(doc);
    const v = doc.view;
    const S = doc.savedOrder;
    const O = doc.order;
    const tags = v.v7 ? STAMP_TAGS_7 : STAMP_TAGS;
    const placeNow = placesIn(doc, O);
    const changedTo = new Map();                                     // place before → place after
    for (const it of list) if (it.kind === 'changed') changedTo.set(it.before, it.after);
    const memo = { a: -2, r: -1 };
    const hit = new Set();
    for (const it of list) {
      let b;
      if (it.kind !== 'removed') {
        if (stampOf(doc, O[it.after]) !== null) continue;            // written by a stamp, not by him
        b = it.after;
      } else {
        const r = savedRecordOf(doc, it.before, memo);
        if (r < 0) continue;
        b = placeNow(S[r]);
        if (b < 0 && changedTo.has(r)) b = changedTo.get(r);
        if (b < 0) continue;                                         // its record was deleted: no stamp
      }
      const rec = v.recOf[b];
      if (rec >= 0 && tags.has(v.tag[v.records[rec]])) hit.add(rec);
    }
    return [...hit].sort((x, y) => y - x);
  }

  // 10.4 — the stamps of a save made at `when`, as one step of the history. A record with no
  // `1 CHAN` gains one at its end: `1 CHAN`, `2 DATE`, `3 TIME`, `2 NOTE`. A record with one has
  // its `2 DATE` and `3 TIME` set (either added when missing) and a `2 NOTE` added at the end of
  // the block; notes already there stay. A note gedview added since the last save in place (a copy
  // was saved in between) is set anew instead, never added to.
  function applyStamps(doc, when, typed) {
    const note = stampNote(doc, typed);
    if (note.reason) return refuse(note.reason);
    const v = doc.view;
    const targets = stampTargets(doc);
    const { date, time } = stampTime(when, v.v7);
    const inSaved = placesIn(doc, doc.savedOrder);
    const done = [];
    const set = (at, text, role) => {                                // line `at` set to `text`, in its place
      const e = doc.order[at];
      if (textOf(doc, e) !== text) cut(doc, done, at, 1, [newLine(doc, text, termOf(doc, e), lineageOf(doc, e), role)]);
      return null;
    };
    for (const r of targets) {
      const from = v.records[r];
      const to = recordEnd(v, r);
      const chan = firstChild(v, from + 1, to, 1, 'CHAN');
      const ops = [];                                                // [place, act], made last place first
      if (chan < 0) {
        ops.push([to, () => insert(doc, done, to, [{ text: '1 CHAN', stamp: 'chan' },
          { text: `2 DATE ${date}`, stamp: 'date' }, { text: `3 TIME ${time}`, stamp: 'time' },
          { text: `2 NOTE ${note.text}`, stamp: 'note' }])]);
      } else {
        const end = subtreeEnd(v, chan);
        let fresh = -1;
        for (let p = chan + 1; p < end && fresh < 0; p += 1) {
          const e = doc.order[p];
          if (stampOf(doc, e) === 'note' && inSaved(e) < 0) fresh = p;
        }
        if (fresh >= 0) ops.push([fresh, () => set(fresh, `2 NOTE ${note.text}`, 'note')]);
        else ops.push([end, () => insert(doc, done, end, [{ text: `2 NOTE ${note.text}`, stamp: 'note' }])]);
        const dt = firstChild(v, chan + 1, end, 2, 'DATE');
        if (dt < 0) {
          ops.push([chan + 1, () => insert(doc, done, chan + 1, [{ text: `2 DATE ${date}`, stamp: 'date' },
            { text: `3 TIME ${time}`, stamp: 'time' }])]);
        } else {
          const tm = firstChild(v, dt + 1, subtreeEnd(v, dt), 3, 'TIME');
          if (tm < 0) ops.push([dt + 1, () => insert(doc, done, dt + 1, [{ text: `3 TIME ${time}`, stamp: 'time' }])]);
          else ops.push([tm, () => set(tm, `3 TIME ${time}`, 'time')]);
          ops.push([dt, () => set(dt, `2 DATE ${date}`, 'date')]);
        }
      }
      ops.sort((x, y) => y[0] - x[0]);                               // stable: at one place, in the order above
      for (const [, act] of ops) {
        const refused = act();
        if (refused) { unmake(doc, done); return refuse(refused); }
      }
    }
    return finish(doc, 'Change stamps', done);
  }

  return {
    TERM, TERM_NAMES, KIND, CHECKS, STAMP_NOTE, STAMP_NOTE_MAX,
    read, detect, bytesOf, summary,
    recordEnd, subtreeEnd, valueOf, isPointerLine, joinedValue,
    search, searchTag, recordCounts, codePoints,
    openDocument, saveBytes, textOf, termOf,
    editLine, addChild, addSibling, deleteLine, recordDeletion, deleteRecord, undo, redo,
    markSaved, isChanged, netChange, changeRuns, lineMarks,
    stampTime, stampNote, stampTargets, applyStamps,
  };
});
