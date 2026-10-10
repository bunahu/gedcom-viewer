// The reading half of core.js: identity, the counts of every test file, the checks each written
// file was made for, the LF CR files, and the helpers the page reads with.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const h = require('./helpers.js');

describe('identity (I1): open, then the bytes of a save with no edit, is the same file', () => {
  it('every written file in fixtures/synthetic/', () => {
    const files = h.gedFiles(h.SYNTHETIC);
    assert.ok(files.length >= 17, `found ${files.length} files`);
    for (const file of files) {
      const bytes = h.bytesOfFile(file);
      const out = core.bytesOf(core.read(bytes));
      assert.equal(h.sha256(out), h.sha256(bytes), path.basename(file));
    }
  });

  it('every public test file in fixtures/corpora/', { skip: h.NO_CORPORA }, () => {
    const files = h.gedFiles(h.CORPORA);
    assert.equal(files.length, 52);
    for (const file of files) {
      const bytes = h.bytesOfFile(file);
      assert.equal(h.sha256(core.bytesOf(core.read(bytes))), h.sha256(bytes), path.basename(file));
    }
  });
});

describe('counts and checks: core.js gives the numbers in spike/baseline-fixtures.jsonl', () => {
  it('all 52 files, key for key', { skip: h.NO_CORPORA }, () => {
    const byName = h.corpusByName();
    const lines = fs.readFileSync(path.join(h.ROOT, 'spike', 'baseline-fixtures.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 52);
    for (const line of lines) {
      const expected = JSON.parse(line);
      const file = byName.get(expected.file);
      assert.ok(file, `${expected.file} is in fixtures/corpora/`);
      const bytes = h.bytesOfFile(file);
      const got = core.summary(core.read(bytes), expected.file, h.sha256(bytes));
      assert.deepEqual(got, expected, expected.file);
    }
  });
});

describe('the written files: each gives exactly the findings it was made for, by code and line', () => {
  const EXPECTED = {
    'e1-no-level.ged': { E1: [8] },
    'e2-shapes.ged': { E2: [8, 9, 10, 11, 12] },
    'e3-jump.ged': { E3: [1, 10] },
    // three ways, three files: one file cannot both lack a TRLR and have lines after it
    'e4-frame.ged': { E4: [8, 11, 12] },
    'e4-no-head.ged': { E4: [1], E9: ['file'], N3: [1] },
    'e4-no-trlr.ged': { E4: [6] },
    'e5-blank.ged': { E5: [8, 10] },
    'e6-e7-ids.ged': { E6: [8], E7: [12], N3: [10] },
    'e8-bad-bytes.ged': { E8: [8, 9] },
    'e9-says-unicode.ged': { E9: [4] },
    'e9-no-char.ged': { E9: ['file'] },
    'n1-line-breaks.ged': { N1: [9, 10] },
    'n5-leading.ged': { N5: [7, 8] },
    'mixed-endings.ged': { N7: ['file'] },
    // 0.6.2: the table of tags in the page. FAM9, and a BIRT under a FAM, in a 5.5.1 file; in a 7.0
    // file, _SKYPEID declared in the header's SCHMA and _APID not; in a 5.5.5 file, an AFN, which
    // 5.5.5 dropped, so no tag of its own (E10), and a SUBM under an INDI, which 5.5.5 no longer allows (N8)
    'e10-n8-tags.ged': { N8: [27], E10: [29] },
    'n9-undeclared.ged': { N9: [12] },
    'e10-555-afn.ged': { E10: [12], N8: [13] },
    'no-final-newline.ged': {},
    'family.ged': {},
    'chan.ged': {},
  };

  it('every file in fixtures/synthetic/ has its expectation here', () => {
    assert.deepEqual(h.gedFiles(h.SYNTHETIC).map((p) => path.basename(p)).sort(), Object.keys(EXPECTED).sort());
  });

  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(name, () => {
      assert.deepEqual(h.findingsOf(h.readFile(path.join(h.SYNTHETIC, name))), expected);
    });
  }

  const read = (name) => h.readFile(path.join(h.SYNTHETIC, name));

  it('e2: the five shapes are E2, not E1: each begins with a digit', () => {
    const m = read('e2-shapes.ged');
    for (const i of [7, 8, 9, 10, 11]) assert.equal(m.kind[i], core.KIND.BAD_SHAPE, `line ${i + 1}`);
    assert.equal(m.records.length, 3, '`0 @I1 INDI` did not parse, so it opens no record');
  });

  it('e3: the level-3 line still parses; its level is what is written', () => {
    const m = read('e3-jump.ged');
    assert.equal(m.level[9], 3);
    assert.equal(m.tag[9], 'CITY');
  });

  it('e4: a lone line after the TRLR belongs to the record it sits in', () => {
    const m = read('e4-frame.ged');
    assert.equal(m.recOf[12], m.recOf[11]);
    assert.equal(m.tag[m.records[m.recOf[12]]], 'SUBM');
  });

  it('e8: the unreadable lines still count and still save back byte for byte', () => {
    const bytes = h.bytesOfFile(path.join(h.SYNTHETIC, 'e8-bad-bytes.ged'));
    const m = core.read(bytes);
    assert.equal(m.n, 10);
    assert.equal(m.kind[7], core.KIND.OK, 'the shape is read from the text, bad bytes and all');
    assert.deepEqual(core.bytesOf(m), bytes);
  });

  it('n1: U+0085 and U+2028 stay inside their CONC lines; the line count proves no split', () => {
    const m = read('n1-line-breaks.ged');
    assert.equal(m.n, 11);
    assert.equal(m.n1Chars, 2);
    assert.equal(m.tag[8], 'CONC');
    assert.equal(core.valueOf(m, 8), 'the second part\x85and what came after it');
    assert.equal(m.tag[9], 'CONC');
    assert.equal(core.valueOf(m, 9), `, then${String.fromCharCode(0x2028)}the end`);
  });

  it('n5: a line with spaces or a tab before its level still parses', () => {
    const m = read('n5-leading.ged');
    assert.deepEqual([m.level[6], m.tag[6], core.valueOf(m, 6)], [1, 'NAME', 'Jane /Fixture/']);
    assert.deepEqual([m.level[7], m.tag[7], core.valueOf(m, 7)], [1, 'NOTE', 'x']);
  });

  it('mixed endings: every terminator kept as it is, and counted', () => {
    const m = read('mixed-endings.ged');
    assert.deepEqual([...m.term].map((t) => core.TERM_NAMES[t]),
      ['CRLF', 'LF', 'CRLF', 'CR', 'LF', 'CRLF', 'LF', 'CRLF']);
    assert.equal(m.findings.byCode.N7[0].detail, 'CRLF 4 · LF 3 · CR 1');
  });

  it('no final newline: the last line has no terminator, and gets none', () => {
    const m = read('no-final-newline.ged');
    assert.equal(m.term[m.n - 1], core.TERM.NONE);
    assert.equal(m.texts[m.n - 1], '0 TRLR');
  });
});

describe('LF CR: one terminator only in a file whose first line ends that way', () => {
  it('LTERLFCR.GED and ulhlc.ged read as 50 and 329 lines, no blank line', { skip: h.NO_CORPORA }, () => {
    const byName = h.corpusByName();
    for (const [name, lines] of [['LTERLFCR.GED', 50], ['ulhlc.ged', 329]]) {
      const m = h.readFile(byName.get(name));
      assert.equal(m.n, lines, name);
      assert.equal(m.findings.byCode.E5.length, 0, name);
      assert.equal(m.termCounts[core.TERM.LFCR] + m.termCounts[core.TERM.NONE], lines, name);
    }
  });

  it('in a file whose first line ends LF alone, LF then CR is two terminators and a blank line', () => {
    const m = h.readText('0 HEAD\n1 CHAR UTF-8\n\r0 TRLR\n');
    assert.deepEqual(m.texts, ['0 HEAD', '1 CHAR UTF-8', '', '0 TRLR']);
    assert.deepEqual(h.findingsOf(m).E5, [3]);
  });
});

describe('what the page reads with', () => {
  const family = () => h.readFile(path.join(h.SYNTHETIC, 'family.ged'));
  const recordOf = (m, id) => m.recOf[m.definedAt.get(id)[0]];

  it('labels: a person is the first NAME and the years; a family its partners; the rest as the table says', () => {
    const m = family();
    assert.equal(m.labels[recordOf(m, '@I42@')], 'Jane /Fixture/ (1900–)');
    assert.equal(m.labels[recordOf(m, '@I1@')], 'Ada /Fixture/');
    assert.equal(m.labels[recordOf(m, '@F1@')], 'Abe /Fixture/ & Ada /Fixture/');
    assert.equal(m.labels[recordOf(m, '@F2@')], 'Joe /Fixture/ & Jane /Fixture/ (1900–)');
    assert.equal(m.labels[recordOf(m, '@U1@')], 'Jane /Fixture/');
    assert.equal(m.labels[0], '0 HEAD');
    assert.equal(m.labels[m.records.length - 1], '0 TRLR');
  });

  it('the counts bar: one figure per record tag, largest first, HEAD and TRLR left out', () => {
    assert.deepEqual(core.recordCounts(family()), [['INDI', 4], ['FAM', 2], ['SUBM', 1]]);
  });

  it('pointers: who points at a record; @VOID@ is no pointer', () => {
    const m = family();
    assert.deepEqual(m.pointedBy.get('@I42@').map((i) => m.texts[i]), ['1 CHIL @I42@', '1 WIFE @I42@']);
    const ids = h.readFile(path.join(h.SYNTHETIC, 'e6-e7-ids.ged'));
    assert.equal(core.isPointerLine(ids, 11), true);
    assert.equal(core.isPointerLine(ids, 12), false);
  });

  it('a subtree runs to the first line whose level is not greater', () => {
    const m = family();
    const chil = m.texts.indexOf('1 CHIL @I42@');
    assert.equal(core.subtreeEnd(m, chil), chil + 2, 'the CHIL line takes its _FREL with it');
    const person = m.definedAt.get('@I42@')[0];
    assert.equal(core.subtreeEnd(m, person), core.recordEnd(m, m.recOf[person]));
  });

  it('a CONC/CONT run reads joined, from any of its lines', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'n1-line-breaks.ged'));
    const whole = `the first part of a long value, the second part\x85and what came after it, then${String.fromCharCode(0x2028)}the end`;
    for (const i of [7, 8, 9]) assert.deepEqual(core.joinedValue(m, i), { from: 7, to: 10, text: whole });
    assert.equal(core.joinedValue(m, 6), null);
    const cont = h.readText('0 @N1@ NOTE a\n1 CONT b\n1 CONC c\n0 TRLR\n');
    assert.equal(core.joinedValue(cont, 0).text, 'a\nbc');
  });

  it('search: text in the line as written, case not minded; or every line of a tag', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'n1-line-breaks.ged'));
    assert.deepEqual(core.searchTag(m, 'CONC'), [8, 9]);
    assert.deepEqual(core.search(m, 'fixture'), [6]);
    assert.deepEqual(core.search(m, ''), []);
  });

  it("the file's facts: encoding, version, the exporting system and the header's date, as written", () => {
    const m = h.readText('0 HEAD\n1 SOUR Fixture Maker\n2 VERS 2.1\n1 DATE 16 SEP 2026\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 TRLR\n');
    assert.deepEqual(m.facts, { source: 'Fixture Maker', sourceVersion: '2.1', date: '16 SEP 2026',
      lines: { version: 5, char: 6, date: 3, source: 1 } }, 'and the line each came from, for the page to go to');
    assert.equal(m.version, '5.5.1', 'the GEDC version, not the exporting system\'s');
    assert.equal(m.encodingLabel, 'UTF-8');
  });
});
