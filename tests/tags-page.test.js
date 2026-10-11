// 0.6.2 (P12, BUILD-BRIEF section 19): the table of tags in the page. core.js judges every line's tag
// by the table of the standard the file declares, which gives the checks E10 (malformed: not a
// GEDCOM tag), N8 (out of place) and N9 (an extension the header does not declare), and words the
// plain line the right frame shows under a selected line's tag. tests/tags.test.js holds the table
// itself; here are the checks and the words, over written files and made-up text.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const tags = require('../tags.js');
const h = require('./helpers.js');

const CODES = ['E10', 'N8', 'N9'];
// What the three checks found, as [code, line number on the screen, the finding's words].
const found = (m) => m.findings.list.filter((f) => CODES.includes(f.code)).map((f) => [f.code, f.line + 1, f.detail]);
// A file of the version named, its header and its end written, and `body` between them. Version 7
// has no CHAR line: a 7.0 file is UTF-8, and says so by being 7.0.
const file = (version, body, header = '') => `0 HEAD\n1 GEDC\n2 VERS ${version}\n${version.startsWith('7') ? '' : '1 CHAR UTF-8\n'}${header}${body}0 TRLR\n`;
// The line number, on the screen, of the nth line of `text` that is exactly `line`.
const at = (text, line, nth = 1) => {
  let seen = 0;
  const lines = text.split('\n');
  for (let k = 0; k < lines.length; k += 1) if (lines[k] === line && (seen += 1) === nth) return k + 1;
  throw new Error(`no line ${nth} that is "${line}"`);
};
const read = (text) => h.readText(text);
const open = (text) => core.openDocument(new Uint8Array(Buffer.from(text, 'utf8')));
const fixture = (name) => h.readFile(path.join(h.SYNTHETIC, name));

describe('E10, N8 and N9 are checks like the others', () => {
  it('E10 is an error after E9, N8 and N9 notes after N7, and the titles are the owner\'s', () => {
    const by = Object.fromEntries(core.CHECKS.map((c) => [c.code, c]));
    assert.deepEqual(by.E10, { code: 'E10', kind: 'error', name: 'Malformed: not a GEDCOM tag' });
    assert.deepEqual(by.N8, { code: 'N8', kind: 'note', name: 'Out of place' });
    assert.deepEqual(by.N9, { code: 'N9', kind: 'note', name: 'Extension not declared in the header' });
    const codes = core.CHECKS.map((c) => c.code);
    assert.deepEqual(codes, ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'], 'errors first, each check after the ones before it');
  });

  it('a finding has its dot (an error or a note), its count, and its place in the list by line', () => {
    const m = fixture('e10-n8-tags.ged');
    assert.equal(m.findings.errors, 1);
    assert.equal(m.findings.notes, 1);
    assert.equal(m.findings.byCode.E10.length, 1);
    assert.equal(m.findings.byCode.N8.length, 1);
    assert.equal(m.findings.byCode.N9.length, 0);
    assert.equal(m.findings.marks[28], 1, 'the FAM9 line: an error\'s dot');
    assert.equal(m.findings.marks[26], 2, 'the BIRT line: a note\'s dot');
    assert.deepEqual(found(m).map((f) => f[0]), ['N8', 'E10'], 'in the order of the lines');
    assert.deepEqual(m.findings.atLine.get(28).map((f) => f.code), ['E10']);
  });
});

describe('E10: a tag the file\'s version does not have, and a custom tag may not be', () => {
  it('FAM9 as a record\'s tag is one finding, with its words; the lines under it raise nothing of their own', () => {
    const t = file('5.5.1', '0 @F1@ FAM9\n1 HUSB @I1@\n1 BIRT\n2 DATE 1900\n1 FOO9 x\n0 @I1@ INDI\n1 FAMS @F1@\n');
    const m = read(t);
    assert.deepEqual(found(m), [['E10', at(t, '0 @F1@ FAM9'), 'FAM9 is not a GEDCOM tag']], 'a mistake, a finding: HUSB, BIRT and FOO9 sit under a tag that is not judged');
    assert.equal(m.findings.errors, 1);
  });

  it('a lower case tag, a tag with a digit, and a tag of letters alone that no standard has, are malformed in a file of any version', () => {
    for (const version of ['5.5.1', '5.5.5', '7.0']) {
      const t = file(version, '0 @I1@ INDI\n1 birt\n1 BIRT2\n1 XYZZY\n');
      assert.deepEqual(found(read(t)).map((f) => f.slice(0, 2)), [['E10', at(t, '1 birt')], ['E10', at(t, '1 BIRT2')], ['E10', at(t, '1 XYZZY')]], version);
    }
  });

  it('a custom tag is no finding in 5.5.1, however it is used; 5.5.5 bars some, with words that say so', () => {
    const body = '0 @I1@ INDI\n1 _APID 1,2::3\n1 _MREL x\n2 _SUB y\n1 _\n0 @_X@ _MTTAG\n1 NAME t\n';
    assert.deepEqual(found(read(file('5.5.1', body))), [], '5.5.1 lets any tag of your own begin with an underscore, and an underscore stand alone');
    const five = file('5.5.5', body);
    assert.deepEqual(found(read(five)), [['E10', at(five, '1 _'), '_ is not a custom tag that GEDCOM 5.5.5 allows']], '5.5.5 does not let an underscore stand alone');
    const t = file('5.5.5', '0 @I1@ INDI\n1 _PLAC x\n1 _SSN y\n1 _SNOTE z\n1 NOTE_N\n');
    assert.deepEqual(found(read(t)), [
      ['E10', at(t, '1 _PLAC x'), '_PLAC is not a custom tag that GEDCOM 5.5.5 allows'],
      ['E10', at(t, '1 _SSN y'), '_SSN is not a custom tag that GEDCOM 5.5.5 allows'],
      ['E10', at(t, '1 NOTE_N'), 'NOTE_N is not a GEDCOM tag'],
    ], '5.5.5 bars an underscore in front of a standard tag or of one it retired; a tag only 7.0 has may be carried as _SNOTE');
  });

  it('a tag that only another version defines is said to be no tag of this one', () => {
    const a = file('5.5.1', '0 @N1@ SNOTE x\n');
    assert.deepEqual(found(read(a)), [['E10', at(a, '0 @N1@ SNOTE x'), 'SNOTE is not a tag of GEDCOM 5.5.1']]);
    const b = file('7.0', '0 @I1@ INDI\n1 NAME a\n2 CONC b\n');
    assert.deepEqual(found(read(b)), [['E10', at(b, '2 CONC b'), 'CONC is not a tag of GEDCOM 7.0']], 'CONC is 5.5\'s');
    const c = file('7.0', '0 @I1@ INDI\n', '1 CHAR UTF-8\n');
    assert.deepEqual(found(read(c)), [['E10', at(c, '1 CHAR UTF-8'), 'CHAR is not a tag of GEDCOM 7.0']], 'and so is CHAR');
    assert.deepEqual(found(fixture('e10-555-afn.ged')).filter((f) => f[0] === 'E10'), [['E10', 12, 'AFN is not a tag of GEDCOM 5.5.5']], 'AFN was dropped by 5.5.5');
  });

  it('a line under a tag that is not a standard one is not judged, whatever tag it carries: one mistake, one finding', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 FOO9\n2 BAR9\n3 BAZ9\n1 _MILT\n2 QUX9\n2 DATE x\n0 @F1@ FAM9\n1 BAR9\n');
    assert.deepEqual(found(read(t)), [['E10', at(t, '1 FOO9'), 'FOO9 is not a GEDCOM tag'], ['E10', at(t, '0 @F1@ FAM9'), 'FAM9 is not a GEDCOM tag']],
      'FOO9 and FAM9 stand under a standard tag, or none; BAR9, BAZ9, QUX9 and the second BAR9 under tags that are not');
  });

  it('a malformed tag under a standard one is judged at any depth', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 BIRT\n2 PLAC x\n3 MAP\n4 FOO9 y\n');
    assert.deepEqual(found(read(t)), [['E10', at(t, '4 FOO9 y'), 'FOO9 is not a GEDCOM tag']]);
  });

  it('a line that did not parse has no tag, ends nothing, and is not judged', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 FOO9\n garbage here\n2 BAR9\nno level\n\n1 NAME a\n');
    assert.deepEqual(found(read(t)), [['E10', at(t, '1 FOO9'), 'FOO9 is not a GEDCOM tag']], 'BAR9 stands under FOO9 still, the lines between ending nothing');
  });
});

describe('N8: a standard tag where the standard does not put it', () => {
  it('BIRT under a FAM is one note that says which tag and which parent; BIRT under an INDI is not', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 BIRT\n2 DATE 1900\n0 @F1@ FAM\n1 BIRT\n2 DATE 1900\n3 TIME 10:00:00\n');
    assert.deepEqual(found(read(t)), [['N8', at(t, '1 BIRT', 2), 'BIRT does not belong under FAM']], 'the DATE under it is where a DATE may sit, so it is not another finding');
  });

  it('a record\'s own line is judged as a record: a tag that is not one gives "does not belong at level 0"', () => {
    const a = file('5.5.1', '0 @X1@ BIRT\n');
    assert.deepEqual(found(read(a)), [['N8', at(a, '0 @X1@ BIRT'), 'BIRT does not belong at level 0']]);
    const b = file('7.0', '0 @N1@ NOTE x\n0 @N2@ SNOTE y\n');
    assert.deepEqual(found(read(b)), [['N8', at(b, '0 @N1@ NOTE x'), 'NOTE does not belong at level 0']], 'in 7.0 a note record is SNOTE');
  });

  it('a line under a custom, malformed or undeclared tag is not judged, so a standard tag there is not out of place', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 _MILT\n2 DATE 1900\n2 BIRT\n1 FOO9\n2 HUSB @I1@\n');
    assert.deepEqual(found(read(t)), [['E10', at(t, '1 FOO9'), 'FOO9 is not a GEDCOM tag']]);
    const seven = file('7.0', '0 @I1@ INDI\n1 _MILT\n2 BIRT\n', '1 SCHMA\n2 TAG _MILT https://example.com/m\n');
    assert.deepEqual(found(read(seven)), [], 'a declared extension, with a BIRT under it: nothing');
    const undeclared = file('7.0', '0 @I1@ INDI\n1 _MILT\n2 BIRT\n');
    assert.deepEqual(found(read(undeclared)).map((f) => f[0]), ['N9'], 'an undeclared one: its own note, and nothing for the BIRT');
  });

  it('a tag under the wrong standard tag is one finding, on the line that is out of place, and what is under it is judged by it', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 HUSB @I2@\n2 AGE 30\n1 CHIL @I2@\n0 @I2@ INDI\n');
    assert.deepEqual(found(read(t)), [['N8', at(t, '1 HUSB @I2@'), 'HUSB does not belong under INDI'], ['N8', at(t, '1 CHIL @I2@'), 'CHIL does not belong under INDI']],
      'AGE under HUSB is fine: HUSB is a standard tag, and AGE sits under it in a family event');
  });

  it('5.5.5 narrowed some places: a SUBM under an INDI is out of place there and not in 5.5.1', () => {
    const body = '0 @I1@ INDI\n1 SUBM @U1@\n0 @U1@ SUBM\n';
    assert.deepEqual(found(read(file('5.5.1', body))), []);
    const t = file('5.5.5', body);
    assert.deepEqual(found(read(t)), [['N8', at(t, '1 SUBM @U1@'), 'SUBM does not belong under INDI']]);
    assert.deepEqual(found(fixture('e10-555-afn.ged')).filter((f) => f[0] === 'N8'), [['N8', 13, 'SUBM does not belong under INDI']]);
  });

  it('the header\'s lines are judged under HEAD, and a CONC or CONT under any tag that holds a value is allowed', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 NOTE a\n2 CONC b\n2 CONT c\n1 OCCU d\n2 CONC e\n', '1 SOUR x\n2 VERS 1\n1 BIRT\n');
    assert.deepEqual(found(read(t)), [['N8', at(t, '1 BIRT'), 'BIRT does not belong under HEAD']]);
  });
});

describe('the version a file is judged by is the one it declares', () => {
  it('5.5 is read as 5.5.1, a file that says nothing as 5.5.1, 5.5.5 as itself, and any 7.x as 7.0', () => {
    const version = (text) => read(text).tagVersion;
    assert.equal(version(file('5.5', '')), '5.5.1');
    assert.equal(version(file('5.5.1', '')), '5.5.1');
    assert.equal(version('0 HEAD\n1 CHAR UTF-8\n0 TRLR\n'), '5.5.1', 'no GEDC.VERS');
    assert.equal(version(file('5.5.5', '')), '5.5.5');
    assert.equal(version(file('7.0', '')), '7.0');
    assert.equal(version(file('7.0.18', '')), '7.0');
    assert.equal(version(file('7.1', '')), '7.0');
    assert.equal(version(file('banana', '')), '5.5.1');
  });

  it('the same lines come out differently by version: AFN and SNOTE are each in some versions and not others', () => {
    const kinds = (version, body) => found(read(file(version, body))).map((f) => f[0]);
    assert.deepEqual(kinds('5.5.1', '0 @I1@ INDI\n1 AFN x\n'), []);
    assert.deepEqual(kinds('5.5.5', '0 @I1@ INDI\n1 AFN x\n'), ['E10']);
    assert.deepEqual(kinds('7.0', '0 @I1@ INDI\n1 AFN x\n'), ['E10']);
    assert.deepEqual(kinds('7.0', '0 @N1@ SNOTE x\n'), []);
    assert.deepEqual(kinds('5.5.5', '0 @N1@ SNOTE x\n'), ['E10']);
  });
});

describe('N9: in a 7.0 file, an extension tag the header\'s SCHMA does not declare', () => {
  it('the written file: _SKYPEID is declared and says nothing, _APID is not and is one note, with its words', () => {
    const m = fixture('n9-undeclared.ged');
    assert.equal(m.tagVersion, '7.0');
    assert.deepEqual([...m.schema], ['_SKYPEID']);
    assert.deepEqual(found(m), [['N9', 12, '_APID is not declared in the header']]);
  });

  it('the header\'s list is read once, by the first word of each TAG line under SCHMA under HEAD, and nowhere else', () => {
    const header = '1 SCHMA\n2 TAG _A https://example.com/a\n2 TAG  _B https://example.com/b\n2 TAG _C\n2 NOTE _D\n1 NOTE x\n2 TAG _E https://example.com/e\n';
    const m = read(file('7.0', '0 @I1@ INDI\n1 _A 1\n1 _B 2\n1 _C 3\n1 _D 4\n1 _E 5\n1 _F 6\n', header));
    assert.deepEqual([...m.schema].sort(), ['_A', '_B', '_C']);
    assert.deepEqual(found(m).filter((f) => f[0] === 'N9').map((f) => f[2]), ['_D is not declared in the header', '_E is not declared in the header', '_F is not declared in the header'], 'a TAG under another tag declares nothing');
    assert.deepEqual(found(m).filter((f) => f[0] === 'N8').map((f) => f[2]), ['NOTE does not belong under SCHMA', 'TAG does not belong under NOTE'], 'and the two lines that say so are out of place');
    assert.equal(read(file('5.5.1', '', header)).schema.size, 0, 'only a 7.0 file has its header read for this');
  });

  it('only a 7.0 file has an undeclared extension: in 5.5.1 and 5.5.5 a custom tag is nobody\'s business here', () => {
    for (const version of ['5.5.1', '5.5.5']) {
      assert.deepEqual(found(read(file(version, '0 @I1@ INDI\n1 _APID 1\n'))), [], version);
    }
    assert.equal(read(file('5.5.1', '0 @I1@ INDI\n1 _APID 1\n')).findings.byCode.N9.length, 0);
  });

  it('N9 says each undeclared tag, wherever it stands: under a standard tag, a declared extension, or an undeclared one', () => {
    const header = '1 SCHMA\n2 TAG _OK https://example.com/ok\n';
    const t = file('7.0', '0 @I1@ INDI\n1 BIRT\n2 _ONE x\n1 _OK y\n2 _TWO z\n3 _THREE w\n', header);
    assert.deepEqual(found(read(t)).map((f) => f.slice(0, 2)), [['N9', at(t, '2 _ONE x')], ['N9', at(t, '2 _TWO z')], ['N9', at(t, '3 _THREE w')]]);
  });

  it('a lower case or lone-underscore extension is malformed in 7.0, not undeclared; an underscore inside one is fine', () => {
    const t = file('7.0', '0 @I1@ INDI\n1 _apid 1\n1 _\n1 _A_B 1\n');
    assert.deepEqual(found(read(t)), [
      ['E10', at(t, '1 _apid 1'), '_apid is not a custom tag that GEDCOM 7.0 allows'],
      ['E10', at(t, '1 _'), '_ is not a custom tag that GEDCOM 7.0 allows'],
      ['N9', at(t, '1 _A_B 1'), '_A_B is not declared in the header'],
    ]);
  });

  it('a 7.0 file with no SCHMA declares nothing, and a file with no header at all is read as 5.5.1', () => {
    assert.deepEqual(found(read('0 @I1@ INDI\n1 _APID 1\n0 TRLR\n')), [], 'no version at all: read as 5.5.1');
    const t = file('7.0', '0 @I1@ INDI\n1 _APID 1\n');
    assert.deepEqual(found(read(t)), [['N9', at(t, '1 _APID 1'), '_APID is not declared in the header']]);
  });
});

describe('the checks run again on every edit, in the same way as on a whole file', () => {
  it('FAM turned into FAM9 and back: the finding comes and goes, and always equals a fresh read of the lines', () => {
    const t = file('5.5.1', '0 @F1@ FAM\n1 HUSB @I1@\n0 @I1@ INDI\n1 FAMS @F1@\n');
    const doc = open(t);
    const pos = at(t, '0 @F1@ FAM') - 1;
    assert.deepEqual(found(doc.view), []);
    assert.ok(core.editLine(doc, pos, '0 @F1@ FAM9').ok);
    assert.deepEqual(found(doc.view), [['E10', pos + 1, 'FAM9 is not a GEDCOM tag']]);
    assert.deepEqual(h.findingsOf(doc.view), h.findingsOf(core.read(core.saveBytes(doc))));
    assert.ok(core.editLine(doc, pos, '0 @F1@ FAM').ok);
    assert.deepEqual(found(doc.view), []);
    assert.ok(core.undo(doc), 'an act to undo');
    assert.deepEqual(found(doc.view).map((f) => f[0]), ['E10']);
  });

  it('a BIRT added under a FAM is N8, and gone when it is removed or moved under the person', () => {
    const t = file('5.5.1', '0 @F1@ FAM\n1 HUSB @I1@\n0 @I1@ INDI\n1 FAMS @F1@\n');
    const doc = open(t);
    const fam = at(t, '0 @F1@ FAM') - 1;
    assert.ok(core.addChild(doc, fam, '1 BIRT').ok);
    assert.deepEqual(found(doc.view), [['N8', fam + 2, 'BIRT does not belong under FAM']]);
    assert.ok(core.editLine(doc, fam + 1, '1 DEAT').ok);
    assert.deepEqual(found(doc.view), [['N8', fam + 2, 'DEAT does not belong under FAM']]);
    assert.ok(core.deleteLine(doc, fam + 1).ok);
    assert.deepEqual(found(doc.view), []);
  });

  it('a TAG line added under SCHMA declares the extension, and the note goes', () => {
    const t = file('7.0', '0 @I1@ INDI\n1 _APID 1\n', '1 SCHMA\n2 TAG _OK https://example.com/ok\n');
    const doc = open(t);
    assert.deepEqual(found(doc.view).map((f) => f[0]), ['N9']);
    assert.ok(core.addChild(doc, at(t, '1 SCHMA') - 1, '2 TAG _APID https://example.com/apid').ok);
    assert.deepEqual(found(doc.view), []);
    assert.ok(core.undo(doc), 'an act to undo');
    assert.deepEqual(found(doc.view).map((f) => f[0]), ['N9']);
  });

  it('the version typed in the header decides the table at once', () => {
    const t = file('5.5.1', '0 @I1@ INDI\n1 AFN x\n');
    const doc = open(t);
    assert.deepEqual(found(doc.view), []);
    assert.ok(core.editLine(doc, at(t, '2 VERS 5.5.1') - 1, '2 VERS 5.5.5').ok);
    assert.deepEqual(found(doc.view).map((f) => f[0]), ['E10']);
    assert.equal(doc.view.tagVersion, '5.5.5');
  });
});

const NEW_FILES = ['e10-n8-tags.ged', 'n9-undeclared.ged', 'e10-555-afn.ged'];   // the three made for these checks

describe('what the written files say', () => {
  it('every written file but the three made for these checks gives none of them: the files that were clean stay clean', () => {
    const names = h.gedFiles(h.SYNTHETIC).map((p) => path.basename(p));
    assert.ok(names.length >= 20);
    for (const name of names) {
      if (NEW_FILES.includes(name)) continue;
      assert.deepEqual(found(fixture(name)), [], name);
    }
  });

  it('each of the three says what it was made to say, and in the version it declares', () => {
    assert.deepEqual(found(fixture('e10-n8-tags.ged')), [['N8', 27, 'BIRT does not belong under FAM'], ['E10', 29, 'FAM9 is not a GEDCOM tag']]);
    assert.equal(fixture('e10-n8-tags.ged').tagVersion, '5.5.1');
    assert.deepEqual(found(fixture('e10-555-afn.ged')), [['E10', 12, 'AFN is not a tag of GEDCOM 5.5.5'], ['N8', 13, 'SUBM does not belong under INDI']]);
    assert.equal(fixture('e10-555-afn.ged').tagVersion, '5.5.5');
  });
});

describe('the lines are judged as parentOf says a line\'s parent is', () => {
  // The same judgement, written the plain way: each line's parent by core.parentOf, its tag by tagKind,
  // its place by allowedUnder. The page reads with a stack of the open lines and a cache; this does not.
  function plain(m) {
    const out = [];
    const kind = (t) => tags.tagKind(t, m.tagVersion, m.schema);
    for (let i = 0; i < m.n; i += 1) {
      if (m.level[i] < 0) continue;
      const t = m.tag[i];
      const k = kind(t);
      const parent = core.parentOf(m, i);
      const place = m.level[i] === 0 ? 'record' : parent >= 0 && kind(m.tag[parent]) === 'standard' ? m.tag[parent] : null;
      if (k === 'undeclared') out.push(['N9', i + 1]);
      else if (place !== null && k === 'malformed') out.push(['E10', i + 1]);
      else if (place !== null && k === 'standard' && tags.allowedUnder(t, place, m.tagVersion) === false) out.push(['N8', i + 1]);
    }
    return out;
  }

  it('over every written file, and files of lines out of order, jumping levels and not parsing', () => {
    const odd7 = file('7.0', '0 @I1@ INDI\n1 NAME a\n3 GIVN b\n garbage\n2 SURN c\n1 FOO9\n2 DATE x\n0 @F1@ FAM\n3 BIRT\n1 _Z\n2 _Y\n1 HUSB @I1@\n\n1 CHIL @I1@\n4 DEAT\n',
      '1 SCHMA\n2 TAG _Z https://example.com/z\n');
    const odd5 = file('5.5.1', '2 NAME a\n0 @I1@ INDI\n3 GIVN b\n1 BIRT\n3 DATE x\n1 FOO9\n 2 DATE y\n1 _X\n3 DATE z\n0 @F1@ FAM\n1 NAME q\n0 @Q@ HEAD\n');
    const texts = [...h.gedFiles(h.SYNTHETIC).map((p) => fs.readFileSync(p).toString('latin1')), odd7, odd5];
    let judged = 0;
    for (const text of texts) {
      const m = h.readText(text, 'latin1');
      assert.deepEqual(found(m).map((f) => [f[0], f[1]]), plain(m), text.slice(0, 40));
      judged += m.n;
    }
    assert.ok(judged > 250, `${judged} lines judged`);
  });
});

describe('the plain line under a selected line\'s tag (M3)', () => {
  const meaning = (tag, version = '5.5.1', schema) => core.tagMeaning(tag, version, schema);

  it('a standard tag: what the table says it means', () => {
    assert.equal(meaning('BIRT'), tags.meaning('BIRT'));
    assert.equal(meaning('FAM'), 'A family: a couple, and their children if any.');
    assert.equal(meaning('SNOTE', '7.0'), tags.meaning('SNOTE'));
  });

  it('a known custom tag: "A custom tag of <programs>:" and the table\'s line, its first letter small unless it is a program\'s name', () => {
    assert.equal(meaning('_MREL'), 'A custom tag of Family Tree Maker and Legacy: how a child is related to the mother, such as Natural.');
    assert.equal(meaning('_APID'), 'A custom tag of Ancestry: where on Ancestry the cited record is: a collection number, two colons, an entry number.');
    assert.equal(meaning('_META'), 'A custom tag of Ancestry: Ancestry details for a Find a Grave record: its story, transcription, people and cemetery.');
    assert.equal(meaning('_AKA'), 'A custom tag of PAF and Ancestral Quest: an also-known-as name, written under a NAME line.');
    assert.equal(meaning('_PRIM'), 'A custom tag of Legacy, PAF, Ancestral Quest and Family Origins: says whether a picture or other media item is the main one: Y or N.');
    assert.equal(meaning('_UID'), 'A custom tag of PAF, Legacy, RootsMagic, Family Historian, MyHeritage and many more: a unique ID, usually a UUID, that lets a record be matched from one file to another.');
    assert.equal(meaning('_SDATE'), 'A custom tag of Family Historian, read by some other programs: a date used only to sort an event or fact, written beside its own DATE.');
    assert.equal(meaning('_WITN'), 'A custom tag of several programs: a witness to an event: a pointer to a person, or the names as plain text.');
    assert.equal(meaning('_LOC'), 'A custom tag of German programs (GEDCOM EL): a place kept as a record of its own, from the German GEDCOM EL extension.');
  });

  it('all 29 well known custom tags read in that form, whichever version the file declares', () => {
    assert.equal(tags.CUSTOM_TAGS.length, 29);
    for (const e of tags.CUSTOM_TAGS) {
      const line = meaning(e.tag, '5.5.1');
      assert.ok(line.startsWith('A custom tag of '), line);
      const programs = line.slice('A custom tag of '.length, line.indexOf(': '));
      assert.ok(programs.length > 0 && !programs.includes(';') && !/ and .* and /.test(programs), `${e.tag}: ${programs}`);
      assert.ok(line.endsWith('.'), line);
      assert.equal(line.slice(line.indexOf(': ') + 2).toLowerCase(), e.meaning.toLowerCase(), `${e.tag}: the table's own words, only the first letter changed`);
      assert.equal(meaning(e.tag, '7.0', new Set([e.tag])), line, `${e.tag} in a 7.0 file that declares it`);
      assert.equal(meaning(e.tag, '7.0', new Set()), line, `${e.tag} in a 7.0 file that does not`);
    }
  });

  it('a custom tag the table does not know reads "A custom tag."; so does an undeclared one in 7.0', () => {
    assert.equal(meaning('_ZZZ'), 'A custom tag.');
    assert.equal(meaning('_OID'), 'A custom tag.', 'no source says what it is, so the table has no line for it');
    assert.equal(meaning('_ZZZ', '7.0', new Set(['_ZZZ'])), 'A custom tag.');
    assert.equal(meaning('_ZZZ', '7.0', new Set()), 'A custom tag.');
  });

  it('a malformed tag: the E10 finding\'s words, with a full stop; the same words as the finding, for every one a file holds', () => {
    assert.equal(meaning('FAM9'), 'FAM9 is not a GEDCOM tag.');
    assert.equal(meaning('SNOTE', '5.5.1'), 'SNOTE is not a tag of GEDCOM 5.5.1.');
    assert.equal(meaning('_DATE', '5.5.5'), '_DATE is not a custom tag that GEDCOM 5.5.5 allows.');
    for (const name of ['e10-n8-tags.ged', 'e10-555-afn.ged']) {
      const m = fixture(name);
      assert.ok(m.findings.byCode.E10.length > 0, name);
      for (const f of m.findings.byCode.E10) assert.equal(meaning(m.tag[f.line], m.tagVersion, m.schema), `${f.detail}.`, name);
    }
  });

  it('no tag, no line: a line that did not parse', () => {
    assert.equal(meaning(null), null);
    assert.equal(meaning(undefined), null);
    assert.equal(core.read(new Uint8Array(Buffer.from('0 HEAD\nnot a line\n0 TRLR\n'))).tag[1], null);
  });

  it('every tag of the written files that are clean has one, and none says it is malformed', () => {
    const seen = new Set();
    for (const p of h.gedFiles(h.SYNTHETIC)) {
      if (NEW_FILES.includes(path.basename(p))) continue;
      const m = h.readText(fs.readFileSync(p).toString('latin1'), 'latin1');
      for (let i = 0; i < m.n; i += 1) {
        const t = m.tag[i];
        if (t === null || t === undefined || seen.has(t)) continue;
        seen.add(t);
        const line = core.tagMeaning(t, m.tagVersion, m.schema);
        assert.ok(line && !/is not a /.test(line), `${t}: ${line}`);
      }
    }
    assert.ok(seen.size > 20, `${seen.size} tags`);
  });
});

describe('the problem report counts the new checks by code, and says nothing of the tags', () => {
  const INFO = { version: '0.6.2', where: 'opened from disk', browser: 'Chrome', bytes: 1, sha256: 'ab'.repeat(32), editing: false, unsaved: 0, settings: '' };

  it('E10 with its line numbers, N8 and N9 with their counts', () => {
    const text = (name) => core.report(fixture(name), INFO);
    assert.ok(text('e10-n8-tags.ged').includes('\nChecks: E10 1 (line 29) · N8 1\n'), text('e10-n8-tags.ged'));
    assert.ok(text('n9-undeclared.ged').includes('\nChecks: N9 1\n'), text('n9-undeclared.ged'));
    assert.ok(text('e10-555-afn.ged').includes('\nChecks: E10 1 (line 12) · N8 1\n'), text('e10-555-afn.ged'));
    for (const name of ['e10-n8-tags.ged', 'n9-undeclared.ged', 'e10-555-afn.ged']) {
      for (const f of fixture(name).findings.list) assert.ok(!text(name).includes(f.detail), `${name}: "${f.detail}" is in the report`);
    }
  });
});

describe('within the budget on a file of about 300,000 lines', () => {
  // The brief's budget is 0.3 s for the whole file checked again after an edit (section 16), and the
  // walk holds it in the page. This is a smoke test with room for a slow machine: it fails if the
  // tag pass ever stops being a single pass.
  const people = 9000;
  const lines = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8'];
  for (let i = 1; i <= people; i += 1) {
    lines.push(`0 @I${i}@ INDI`, `1 NAME Given${i} /Fixture/`, '2 GIVN x', '1 SEX M', '1 BIRT', '2 DATE 1900', '2 PLAC Town', '3 MAP', '4 LATI N1', '1 DEAT', '2 DATE 1950',
      '1 OCCU x', '2 DATE 1900', '1 NOTE a', '2 CONC b', '2 CONT c', '1 SOUR @S1@', '2 PAGE 1', '2 DATA', '3 TEXT t', '1 _APID 1', `1 FAMC @F${i}@`, `1 FAMS @F${i}@`,
      '1 CHAN', '2 DATE 1 JAN 2020', '3 TIME 10:00:00');
    lines.push(`0 @F${i}@ FAM`, `1 HUSB @I${i}@`, '1 MARR', '2 DATE 1920', '2 PLAC Town', '1 _MREL x', `1 CHIL @I${i}@`);
  }
  lines.push('0 @S1@ SOUR', '1 TITL x', '0 TRLR');
  const bytes = new Uint8Array(Buffer.from(`${lines.join('\n')}\n`, 'utf8'));

  it('read, and an edit checked again, each within a second here', () => {
    assert.ok(lines.length > 290000 && lines.length < 320000, `${lines.length} lines`);
    const t0 = performance.now();
    const m = core.read(bytes);
    const readMs = performance.now() - t0;
    assert.equal(found(m).length, 0, 'a clean file');
    const doc = core.openDocument(bytes);
    const pos = 5000;
    const t1 = performance.now();
    assert.ok(core.editLine(doc, pos, `${core.textOf(doc, doc.order[pos])}x`).ok);
    const editMs = performance.now() - t1;
    assert.ok(readMs < 1000, `read took ${readMs.toFixed(0)} ms`);
    assert.ok(editMs < 1000, `the edit's whole-file check took ${editMs.toFixed(0)} ms`);
  });
});
