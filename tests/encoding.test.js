// Section 6.1 — the encoding is told from the bytes before the header is asked — and 6.2, a line
// ends at CR LF, LF CR, LF or CR and nowhere else. The cases of the sibling project's own encoding test
// (sibling/api/tests/test_gedcom_reader_encoding.py) come first, as JavaScript; then the rest of
// 6.1's table.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../core.js');
const h = require('./helpers.js');

const LINES = (char) => ['0 HEAD', '1 SOUR TEST', '1 GEDC', '2 VERS 5.5.1', `1 CHAR ${char}`, '0 @I1@ INDI',
  '1 NAME José /Fixture/', '1 BIRT', '2 DATE 1 JAN 1900', '2 PLAC Łódź', '0 TRLR'];
const BODY = (char) => LINES(char).map((l) => `${l}\n`).join('');
const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);
const e9 = (m) => m.findings.byCode.E9.map((f) => f.detail);

// Every model built here must also save back as it came (I1).
function readBytes(bytes) {
  const m = core.read(bytes);
  assert.deepEqual(core.bytesOf(m), bytes, 'identity');
  return m;
}

describe("The sibling project's cases", () => {
  for (const bigEndian of [false, true]) {
    it(`UTF-16 ${bigEndian ? 'big' : 'little'}-endian with no byte-order mark is read as written`, () => {
      const m = readBytes(h.utf16(BODY('UNICODE'), { bigEndian }));
      assert.equal(m.codec, bigEndian ? 'utf-16-be' : 'utf-16-le');
      assert.equal(m.how, 'byte pattern');
      assert.equal(m.declared, 'UNICODE', 'the header could be read');
      assert.deepEqual(e9(m), [], '…so nothing is "missing"');
      assert.deepEqual(m.texts, LINES('UNICODE'));
      assert.ok(!m.texts.some((t) => t.includes(NUL)));
    });
  }

  it('the corpus files with no byte-order mark decode clean', { skip: h.NO_CORPORA }, () => {
    const charset = path.join(h.CORPORA, 'eichmann', 'charset');
    for (const name of ['UHLCL.GED', 'ULHC.GED', 'ULHCL.GED', 'ULHL.GED', 'ulhlc.ged']) {
      const m = readBytes(h.bytesOfFile(path.join(charset, name)));
      assert.ok(m.codec === 'utf-16-le' || m.codec === 'utf-16-be', name);
      assert.equal(m.how, 'byte pattern', name);
      assert.equal(m.declared, 'UNICODE', name);
      assert.deepEqual(e9(m), [], name);
      assert.ok(!m.texts.some((t) => t.includes(NUL) || t.includes(REPLACEMENT)), name);
      assert.equal(m.texts[0], '0 HEAD', name);
    }
  });

  it('a file with no CHAR line is read as UTF-8, and flagged (E9)', () => {
    const src = LINES('x').filter((l) => !l.startsWith('1 CHAR')).map((l) => `${l}\n`).join('');
    const m = readBytes(new Uint8Array(Buffer.from(src)));
    assert.equal(m.codec, 'utf-8');
    assert.deepEqual(e9(m), ['no CHAR line; read as UTF-8']);
    assert.equal(m.findings.byCode.E9[0].line, -1, 'one finding, for the file');
  });

  for (const declared of ['UNICODE', 'UTF-16']) {
    it(`bytes that are not UTF-16 are not read as UTF-16, whatever the header says (${declared})`, () => {
      const m = readBytes(new Uint8Array(Buffer.from(BODY(declared))));
      assert.equal(m.codec, 'utf-8');
      assert.equal(m.declared, declared);
      assert.deepEqual(m.texts, LINES(declared));
      assert.deepEqual(e9(m), [`header says ${declared} but the bytes are one per character; read as UTF-8`]);
      assert.equal(m.findings.byCode.E9[0].line, 4, 'shown on the CHAR line');
    });
  }

  for (const bigEndian of [false, true]) {
    it(`a byte-order mark is read first (${bigEndian ? 'big' : 'little'}-endian)`, () => {
      const m = readBytes(h.utf16(BODY('UNICODE'), { bigEndian, mark: true }));
      assert.deepEqual([m.codec, m.how, m.prefix, m.declared, e9(m)],
        [bigEndian ? 'utf-16-be' : 'utf-16-le', 'byte-order mark', 2, 'UNICODE', []]);
      assert.deepEqual(m.texts, LINES('UNICODE'), 'the mark is the file\'s prefix, not part of line 1');
    });
  }

  it('the three terminators break a line, and a last one opens none', () => {
    assert.deepEqual(h.readText('0 HEAD\r\n1 CHAR UTF-8\n0 @I1@ INDI\r0 TRLR\n').texts,
      ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '0 TRLR']);
    assert.equal(h.readText('').n, 0);
    assert.deepEqual(h.readText('0 TRLR').texts, ['0 TRLR']);
  });

  it('LF then CR, in a file whose first line ends that way, is ONE terminator (where the sibling project reads a blank line)', () => {
    const m = h.readText('0 HEAD\n\r0 TRLR');
    assert.deepEqual(m.texts, ['0 HEAD', '0 TRLR']);
    assert.equal(m.term[0], core.TERM.LFCR);
    assert.equal(m.findings.byCode.E5.length, 0);
  });

  const NOT_A_LINE_END = [0x0b, 0x0c, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029];
  for (const code of NOT_A_LINE_END) {
    it(`U+${code.toString(16).toUpperCase().padStart(4, '0')} does not break a line`, () => {
      const line = `1 NOTE before${String.fromCharCode(code)}after`;
      const m = readBytes(new Uint8Array(Buffer.from(`0 @I1@ INDI\n${line}\n0 TRLR\n`)));
      assert.deepEqual(m.texts, ['0 @I1@ INDI', line, '0 TRLR']);
      assert.equal(core.valueOf(m, 1), line.slice(7));
    });
  }
});

describe("the rest of 6.1's table", () => {
  const withChar = (char, extra = []) => ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', `1 CHAR ${char}`, '0 @I1@ INDI', ...extra, '0 TRLR'];
  const bytesOf = (lines, odd) => new Uint8Array(Buffer.concat(lines.map((l) =>
    Buffer.concat([typeof l === 'string' ? Buffer.from(l, 'latin1') : Buffer.from(l), Buffer.from('\n')]))));

  it('ASCII: a byte of 128 or more is E8 on its line, and shown as the character of its number', () => {
    const m = readBytes(bytesOf(withChar('ASCII', [[...Buffer.from('1 NAME Jos'), 0xe9, ...Buffer.from(' /Fixture/')]])));
    assert.equal(m.codec, 'ascii');
    assert.deepEqual(h.findingsOf(m), { E8: [6], N3: [5] });
    assert.equal(core.valueOf(m, 5), 'Jos\xe9 /Fixture/');
  });

  it('ANSEL (or any other name): one byte = one character of the same number, and N6', () => {
    const m = readBytes(bytesOf(withChar('ANSEL', [[...Buffer.from('1 NOTE '), 0x80, 0x9f, 0xe2]])));
    assert.equal(m.codec, 'one-byte');
    assert.equal(m.encodingLabel, 'ANSEL');
    assert.deepEqual(h.findingsOf(m), { N3: [5], N6: [4] });
    assert.deepEqual([...core.valueOf(m, 5)].map((c) => c.charCodeAt(0)), [0x80, 0x9f, 0xe2],
      'not Windows-1252: byte 0x80 is U+0080, not the euro sign');
  });

  it('ANSI, or any other one-byte name, over bytes all ASCII: no N6, since every character shows as itself; one byte above 127 and N6 is back (0.6.1)', () => {
    const plain = readBytes(bytesOf(withChar('ANSI', ['1 NOTE plain words'])));
    assert.equal(plain.codec, 'one-byte');
    assert.equal(plain.encodingLabel, 'ANSI');
    assert.deepEqual(h.findingsOf(plain), { N3: [5] });
    const high = readBytes(bytesOf(withChar('ANSI', [[...Buffer.from('1 NOTE caf'), 0xe9]])));
    assert.deepEqual(h.findingsOf(high), { N3: [5], N6: [4] });
  });

  it('version 7 has no CHAR and is UTF-8, with no flag; and no line is too long in version 7', () => {
    // the long line is a continuation of the note, a CONT in 7.0 and a CONC in 5.5.1, where the tag table puts one (0.6.2)
    const m7 = readBytes(new Uint8Array(Buffer.from(`0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @N1@ SNOTE a\n1 CONT ${'x'.repeat(300)}\n0 TRLR\n`)));
    assert.equal(m7.codec, 'utf-8');
    assert.deepEqual(h.findingsOf(m7), { N3: [4] });
    const m5 = h.readText(`0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @N1@ NOTE a\n1 CONC ${'x'.repeat(300)}\n0 TRLR\n`);
    assert.deepEqual(h.findingsOf(m5), { N3: [5], N4: [6] });
  });

  it('a line is measured in characters, not in 16-bit units', () => {
    const face = String.fromCodePoint(0x1f600);                    // one character, two units
    const m = h.readText(`0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 NOTE ${face.repeat(200)}\n0 TRLR\n`);
    assert.equal(m.longest, 207);
    assert.equal(m.findings.byCode.N4.length, 0, '207 characters is not over 255, though it is 407 units');
  });

  it('a UTF-8 byte-order mark and a header that names something else: E9; the mark is not part of line 1', () => {
    const m = readBytes(new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(BODY('ANSEL'))])));
    assert.deepEqual([m.codec, m.prefix, m.texts[0]], ['utf-8', 3, '0 HEAD']);
    assert.deepEqual(e9(m), ['header says ANSEL but the file opens with a UTF-8 byte-order mark']);
  });

  it('UTF-16 bytes and a header that names something else: E9, and the bytes win', () => {
    const m = readBytes(h.utf16(BODY('UTF-8'), { mark: true }));
    assert.equal(m.codec, 'utf-16-le');
    assert.deepEqual(m.texts, LINES('UTF-8'));
    assert.deepEqual(e9(m), ['header says UTF-8 but the bytes are UTF-16']);
  });

  it('a UTF-16 file of odd length keeps its last byte, cannot read it (E8), and writes it back', () => {
    const bytes = new Uint8Array([...h.utf16('0 HEAD\n1 CHAR UNICODE\n0 TRLR\n', { mark: true }), 0x41]);
    const m = readBytes(bytes);
    assert.equal(m.n, 4);
    assert.deepEqual(h.findingsOf(m).E8, [4]);
  });

  it('a U+FEFF inside the file is a character, kept', () => {
    const m = readBytes(new Uint8Array(Buffer.from(`0 HEAD\n1 NOTE ${String.fromCharCode(0xfeff)}x\n0 TRLR\n`)));
    assert.equal(core.valueOf(m, 1), `${String.fromCharCode(0xfeff)}x`);
  });

  it('a U+FFFD written in the file is a character, not an unreadable byte', () => {
    const m = h.readText(`0 HEAD\n1 CHAR UTF-8\n1 NOTE ${REPLACEMENT}\n0 TRLR\n`);
    assert.equal(m.findings.byCode.E8.length, 0);
  });
});
