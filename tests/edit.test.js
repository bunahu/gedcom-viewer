// The editing half of core.js (BUILD-BRIEF sections 9 and 10.4): the document, the acts, undo,
// the net change, the change stamps and the bytes of a save. Section 14's rows first, then the
// refusals (I11), then the document checked again after every act, held to a fresh read of the
// bytes it would save.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../core.js');
const h = require('./helpers.js');

const open = (name) => core.openDocument(h.bytesOfFile(path.join(h.SYNTHETIC, name)));
const openText = (text) => core.openDocument(new Uint8Array(Buffer.from(text, 'utf8')));
const ok = (r) => { assert.ok(r.ok, r.reason); return r; };
const hash = (doc) => h.sha256(core.saveBytes(doc));
const lines = (doc) => doc.view.texts.slice();

// Local time, so the stamp's words do not depend on where the tests run.
const AT = new Date(2026, 8, 28, 15, 42, 0);
const LATER = new Date(2026, 9, 2, 9, 5, 7);

// What the document shows must be what a fresh read of its bytes shows: the same lines, the same
// findings, the same counts, the same labels (9.2: the checks say so at once).
function sameAsFreshRead(doc) {
  const fresh = core.read(core.saveBytes(doc));
  assert.deepEqual(doc.view.texts, fresh.texts);
  assert.deepEqual(h.findingsOf(doc.view), h.findingsOf(fresh));
  const a = core.summary(doc.view, 'x', 'x');
  const b = core.summary(fresh, 'x', 'x');
  delete a.bytes;
  delete b.bytes;
  assert.deepEqual(a, b);
  assert.deepEqual(doc.view.labels, fresh.labels);
}

// The lines of the file the page is on, the original or the last copy (or of `base`, the file first
// opened), with the net change from them laid over them, must be the lines now: every line the net
// change does not name is the same line, in the same order.
function replayed(doc, items, base = doc.savedOrder) {
  const was = base.map((e) => core.textOf(doc, e));
  const gone = new Set(items.filter((it) => it.kind !== 'added').map((it) => it.before));
  const named = new Set(items.filter((it) => it.kind !== 'removed').map((it) => it.after));
  const out = [];
  let a = 0;
  for (let b = 0; b < doc.order.length; b += 1) {
    if (named.has(b)) { out.push(core.textOf(doc, doc.order[b])); continue; }
    while (gone.has(a)) a += 1;
    out.push(was[a]);
    a += 1;
  }
  return out;
}

describe('the document, with no edit (I1)', () => {
  it('saves every written file as it was opened', () => {
    for (const file of h.gedFiles(h.SYNTHETIC)) {
      const bytes = h.bytesOfFile(file);
      assert.equal(h.sha256(core.saveBytes(core.openDocument(bytes))), h.sha256(bytes), path.basename(file));
    }
  });

  it('saves every public test file as it was opened', { skip: h.NO_CORPORA }, () => {
    for (const file of h.gedFiles(h.CORPORA)) {
      const bytes = h.bytesOfFile(file);
      assert.equal(h.sha256(core.saveBytes(core.openDocument(bytes))), h.sha256(bytes), path.basename(file));
    }
  });
});

describe("section 14's rows", () => {
  it('one edit: the saved bytes differ from the original only inside that line', () => {
    const doc = open('family.ged');
    const m = doc.m;
    const i = 16;                                                    // @I42@'s 1 NAME
    assert.equal(m.texts[i], '1 NAME Jane /Fixture/');
    ok(core.editLine(doc, i, '1 NAME Jane /Fixtur/'));
    const out = core.saveBytes(doc);
    const tail = m.bytes.length - m.end[i];
    assert.deepEqual(out.subarray(0, m.start[i]), m.bytes.subarray(0, m.start[i]));
    assert.deepEqual(out.subarray(out.length - tail), m.bytes.subarray(m.end[i]));
    assert.equal(Buffer.from(out.subarray(m.start[i], out.length - tail)).toString('utf8'), '1 NAME Jane /Fixtur/');
    assert.equal(out.length, m.bytes.length - 1, 'one character shorter');
    sameAsFreshRead(doc);
  });

  it('typed back: an edit returned to the original text is no edit', () => {
    const doc = open('family.ged');
    ok(core.editLine(doc, 16, '1 NAME Jane /Fixtur/'));
    ok(core.editLine(doc, 16, '1 NAME Jane /Fixture/'));
    assert.equal(doc.order[16], 16, 'the original line is back, and saves from its own bytes');
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
    assert.deepEqual(core.netChange(doc), []);
    assert.equal(core.isChanged(doc), false);
    const same = core.editLine(doc, 16, '1 NAME Jane /Fixture/');
    assert.equal(same.step, null, 'typing a line as it already is makes no step');
  });

  for (const bigEndian of [false, true]) {
    it(`an edit in a UTF-16 ${bigEndian ? 'big' : 'little'}-endian file: only that line is encoded again`, () => {
      const text = '0 HEAD\r\n1 GEDC\r\n2 VERS 5.5.1\r\n1 CHAR UNICODE\r\n0 @I1@ INDI\r\n1 NAME José /Fixture/\r\n2 PLAC Łódź\r\n0 TRLR\r\n';
      for (const mark of [false, true]) {
        const bytes = h.utf16(text, { bigEndian, mark });
        const doc = core.openDocument(bytes);
        assert.equal(doc.m.codec, bigEndian ? 'utf-16-be' : 'utf-16-le');
        const i = 6;
        ok(core.editLine(doc, i, '2 PLAC Łódź, Polska'));
        const out = core.saveBytes(doc);
        const m = doc.m;
        const tail = bytes.length - m.end[i];
        assert.deepEqual(out.subarray(0, m.start[i]), bytes.subarray(0, m.start[i]), 'before it: the original bytes');
        assert.deepEqual(out.subarray(out.length - tail), bytes.subarray(m.end[i]), 'after it: the original bytes');
        const middle = h.utf16('2 PLAC Łódź, Polska', { bigEndian });
        assert.deepEqual(out.subarray(m.start[i], out.length - tail), middle, 'the line: its text, encoded as the file is');
        sameAsFreshRead(doc);
      }
    });
  }

  it('encoding refusal: a character outside ASCII, in a file read as ASCII or one byte per character (I11)', () => {
    for (const char of ['ASCII', 'ANSEL']) {
      const doc = openText(`0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR ${char}\n0 @I1@ INDI\n1 NAME Jose /Fixture/\n0 TRLR\n`);
      const r = core.editLine(doc, 5, '1 NAME José /Fixture/');
      assert.equal(r.ok, false, char);
      assert.match(r.reason, /é \(U\+00E9\) is not ASCII/);
      assert.deepEqual(doc.order, [0, 1, 2, 3, 4, 5, 6], 'nothing changed');
      assert.equal(doc.done.length, 0, 'no step');
      assert.equal(core.addChild(doc, 4, '1 NOTE Ł').ok, false, 'an added line too');
      ok(core.editLine(doc, 5, '1 NAME Jose /Fixtures/'));
    }
    const utf8 = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jose /Fixture/\n0 TRLR\n');
    ok(core.editLine(utf8, 5, '1 NAME José /Fixture/'));
    sameAsFreshRead(utf8);
  });

  it('delete with pointers: the record and the lines that point at it go; no E7 after; one undo restores the file', () => {
    const doc = open('family.ged');
    const at = doc.view.definedAt.get('@I42@')[0];
    const plan = core.recordDeletion(doc, at + 3);                   // any line of the record
    assert.deepEqual([plan.from, plan.to, plan.id, plan.tag], [15, 22, '@I42@', 'INDI']);
    assert.deepEqual(plan.pointers.map((p) => [doc.view.texts[p.line], p.end - p.line, p.ticked]),
      [['1 CHIL @I42@', 2, true], ['1 WIFE @I42@', 1, true]], 'the CHIL line goes with its _FREL');
    const r = ok(core.deleteRecord(doc, at + 3));
    assert.equal(r.step.label, 'Delete record @I42@ INDI');
    assert.equal(doc.view.n, 37 - 7 - 2 - 1);
    assert.equal(doc.view.findings.byCode.E7.length, 0, 'no pointer is left pointing at nothing');
    assert.ok(!doc.view.texts.some((t) => t.includes('@I42@')));
    assert.ok(doc.view.definedAt.has('@F1@') && doc.view.definedAt.has('@F2@'), 'a family left with fewer members stays');
    sameAsFreshRead(doc);
    core.undo(doc);
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
    assert.equal(doc.view.n, 37);
  });

  it('delete with pointers, one unticked: it stays, and E7 marks it (9.3)', () => {
    const doc = open('family.ged');
    const plan = core.recordDeletion(doc, 15);
    ok(core.deleteRecord(doc, 15, [plan.pointers[0].line]));
    const e7 = doc.view.findings.byCode.E7;
    assert.deepEqual(e7.map((f) => doc.view.texts[f.line]), ['1 WIFE @I42@']);
  });

  it('undo and redo: any run of acts, undone to the start, saves identical; redone, as it was', () => {
    const doc = open('family.ged');
    const hashes = [hash(doc)];
    const acts = [
      () => core.editLine(doc, 16, '1 NAME Janet /Fixture/'),
      () => core.addChild(doc, 18, '2 PLAC Fixtureville'),
      () => core.addSibling(doc, 16, '1 NOTE a sibling below the name'),
      () => core.deleteLine(doc, 30),
      () => core.deleteRecord(doc, doc.view.definedAt.get('@I43@')[0]),
      () => core.editLine(doc, 0, '0 HEAD'),                        // no change: no step
      () => core.addSibling(doc, 0, '0 @N1@ NOTE after the header'),
    ];
    for (const act of acts) {
      const r = ok(act());
      if (r.step) hashes.push(hash(doc));
      sameAsFreshRead(doc);
    }
    assert.equal(doc.done.length, hashes.length - 1);
    for (let k = hashes.length - 2; k >= 0; k -= 1) {
      core.undo(doc);
      assert.equal(hash(doc), hashes[k], `undone to step ${k}`);
      sameAsFreshRead(doc);
    }
    assert.equal(core.undo(doc), null, 'nothing more to undo');
    for (let k = 1; k < hashes.length; k += 1) {
      core.redo(doc);
      assert.equal(hash(doc), hashes[k], `redone to step ${k}`);
    }
    assert.equal(core.redo(doc), null, 'nothing more to redo');
    core.undo(doc);
    ok(core.editLine(doc, 1, '1 GEDC'));                             // no change: redo is kept
    assert.equal(doc.undone.length, 1);
    ok(core.editLine(doc, 1, '1 GEDC x'));                           // a new act: redo is gone
    assert.equal(doc.undone.length, 0);
  });

  it('net change: changed, removed and added, with their places before and after', () => {
    const doc = open('family.ged');
    ok(core.editLine(doc, 16, '1 NAME Janet /Fixture/'));            // line 17
    ok(core.deleteLine(doc, 29));                                    // line 30, 1 CHIL @I42@, and its _FREL
    ok(core.addChild(doc, 11, '1 NOTE about Abe'));                  // a new line 13, under @I2@
    const items = core.netChange(doc);
    assert.deepEqual(items.map((it) => [it.kind, it.before + 1, it.after + 1]), [
      ['added', 0, 13],
      ['changed', 17, 18],
      ['removed', 30, 0],
      ['removed', 31, 0],
    ]);
    assert.deepEqual(replayed(doc, items), doc.view.texts);
    const runs = core.changeRuns(doc, items);
    assert.deepEqual(runs.map((r) => [r.kind, r.before + 1, r.after + 1, r.record.id, r.record.tag, r.lines.length]), [
      ['added', 0, 13, '@I2@', 'INDI', 1],
      ['changed', 17, 18, '@I42@', 'INDI', 1],
      ['removed', 30, 0, '@F1@', 'FAM', 2],
    ]);
    assert.deepEqual(runs[1].lines, [{ was: '1 NAME Jane /Fixture/', now: '1 NAME Janet /Fixture/' }]);
    assert.deepEqual(runs[2].lines.map((l) => l.was), ['1 CHIL @I42@', '2 _FREL Natural']);
    assert.equal(runs[2].at + 1, 31, 'the removed lines sat just above what is now line 31');
    const marks = core.lineMarks(doc, items);
    assert.equal(marks.status[12], 2);
    assert.equal(marks.status[17], 1);
    assert.equal(marks.removedAt[30], 1);
    core.moveOntoCopy(doc);
    assert.equal(core.isChanged(doc), false, 'the page is on the copy just written');
    assert.deepEqual(core.netChange(doc), [], 'against it, nothing is changed');
    assert.equal(core.netChange(doc, doc.openedOrder).length, 4, 'against the file first opened, every change stands');
  });

  it('net change: an edit of an edit is one change; a new line edited is still one line added', () => {
    const doc = open('family.ged');
    ok(core.editLine(doc, 16, '1 NAME A'));
    ok(core.editLine(doc, 16, '1 NAME B'));
    ok(core.addChild(doc, 16, '2 GIVN x'));
    ok(core.editLine(doc, 17, '2 GIVN y'));
    assert.deepEqual(core.netChange(doc).map((it) => [it.kind, it.before, it.after]), [['changed', 16, 16], ['added', -1, 17]]);
    core.moveOntoCopy(doc);
    ok(core.editLine(doc, 17, '2 GIVN z'));
    ok(core.editLine(doc, 16, '1 NAME Jane /Fixture/'));             // back to the file's own words
    assert.equal(doc.order[16], 16);
    const items = core.netChange(doc);
    assert.deepEqual(items.map((it) => [it.kind, it.before, it.after]), [['changed', 16, 16], ['changed', 17, 17]],
      'against the copy the page is on: the NAME changed back, the GIVN changed again');
    assert.deepEqual(replayed(doc, items), doc.view.texts);
    assert.deepEqual(core.netChange(doc, doc.openedOrder).map((it) => [it.kind, it.before, it.after]), [['added', -1, 17]],
      'against the file first opened: the NAME is its own again, and the GIVN is one line added');
  });

  it('on a copy (D1): a line typed back to its words in the copy is that line again, no change from it; typed back to the original\'s, the original\'s own line', () => {
    const doc = open('family.ged');
    ok(core.editLine(doc, 16, '1 NAME Janet /Fixture/'));
    const inCopy = doc.order[16];
    core.moveOntoCopy(doc);
    ok(core.editLine(doc, 16, '1 NAME Jan /Fixture/'));
    assert.deepEqual(core.netChange(doc).map((it) => [it.kind, it.before, it.after]), [['changed', 16, 16]]);
    ok(core.editLine(doc, 16, '1 NAME Janet /Fixture/'));             // the copy's words again
    assert.equal(doc.order[16], inCopy, 'the copy\'s own line, not a new one with its words');
    assert.equal(core.isChanged(doc), false);
    assert.equal(core.unsaved(doc), false, 'the copy holds these lines: nothing to save');
    ok(core.editLine(doc, 16, '1 NAME Jane /Fixture/'));              // the original's words
    assert.equal(doc.order[16], 16, 'the original\'s line, written from its own bytes');
    assert.deepEqual(core.netChange(doc).map((it) => [it.kind, it.before, it.after]), [['changed', 16, 16]], 'a change from the copy');
    assert.equal(core.asOpened(doc), true);
    assert.equal(h.sha256(core.saveBytes(doc)), h.sha256(doc.m.bytes));
  });

  it('no final newline: identity; a line added after the last line — it gains the common terminator, the new one has none', () => {
    const doc = open('no-final-newline.ged');
    const bytes = doc.m.bytes;
    assert.equal(hash(doc), h.sha256(bytes));
    ok(core.addSibling(doc, 7, '0 @N1@ NOTE after the end'));
    const out = Buffer.from(core.saveBytes(doc)).toString('utf8');
    assert.equal(out, `${Buffer.from(bytes).toString('utf8')}\n0 @N1@ NOTE after the end`);
    const items = core.netChange(doc);
    assert.deepEqual(items.map((it) => it.kind), ['changed', 'added'], 'the old last line changed: it gained a line ending');
    assert.deepEqual(core.changeRuns(doc, items)[0].lines, [{ was: '0 TRLR', now: '0 TRLR', ending: ['none', 'LF'] }]);
    sameAsFreshRead(doc);
    core.undo(doc);
    assert.equal(hash(doc), h.sha256(bytes));
  });

  it('mixed line endings: a new line takes the commonest; an edited line keeps its own', () => {
    const doc = open('mixed-endings.ged');                          // CRLF 4 · LF 3 · CR 1
    assert.equal(doc.common, core.TERM.CRLF);
    ok(core.addChild(doc, 0, '1 NOTE new'));
    assert.equal(core.termOf(doc, doc.order[1]), core.TERM.CRLF);
    const name = doc.view.texts.indexOf('1 NAME Jane /Fixture/');
    assert.equal(core.termOf(doc, doc.order[name]), core.TERM.LF);
    ok(core.editLine(doc, name, '1 NAME Jane /Fixtures/'));
    assert.equal(core.termOf(doc, doc.order[name]), core.TERM.LF);
    const cr = doc.view.texts.indexOf('1 CHAR UTF-8');                // the file's one CR line
    ok(core.editLine(doc, cr, '1 CHAR UTF8'));
    assert.equal(core.termOf(doc, doc.order[cr]), core.TERM.CR);
    sameAsFreshRead(doc);
  });
});

describe('removed lines, restored', () => {
  it('a deleted record, and a pointer line elsewhere, each put back in its place: no change is left', () => {
    const doc = open('family.ged');
    ok(core.deleteRecord(doc, 15));                                  // @I42@, and its CHIL and WIFE lines
    ok(core.editLine(doc, 0, '0 HEAD'));                              // no change, no step
    ok(core.addChild(doc, 7, '1 NOTE after the delete'));             // under @I1@: every line below moves one down
    const removed = core.changeRuns(doc).filter((r) => r.kind === 'removed');
    assert.deepEqual(removed.map((r) => [r.before + 1, r.lines.length, r.record.id]), [[16, 7, '@I42@'], [30, 2, '@F1@'], [34, 1, '@F2@']]);
    const pointer = removed[1];
    const r = ok(core.restoreLines(doc, pointer.before, pointer.lines.length));
    assert.equal(r.step.label, 'Restore 2 lines');
    assert.equal(doc.view.texts[pointer.at], '1 CHIL @I42@', 'back where it was');
    assert.deepEqual(h.findingsOf(doc.view).E7, [pointer.at + 1], 'and pointing at nothing, since @I42@ is still gone: E7 says so');
    const record = core.changeRuns(doc).find((x) => x.kind === 'removed' && x.record.id === '@I42@');
    ok(core.restoreLines(doc, record.before, record.lines.length));
    assert.equal(h.findingsOf(doc.view).E7, undefined);
    const wife = core.changeRuns(doc).find((x) => x.kind === 'removed');
    ok(core.restoreLines(doc, wife.before, 1));
    assert.deepEqual(core.netChange(doc).map((it) => it.kind), ['added'], 'only the added line is left to save');
    sameAsFreshRead(doc);
    core.undo(doc);
    assert.equal(core.changeRuns(doc).filter((x) => x.kind === 'removed').length, 1, 'a restore undoes like any act');
  });

  it('a line that is not removed is not restored', () => {
    const doc = open('family.ged');
    assert.equal(core.restoreLines(doc, 3, 1).ok, false);
    ok(core.deleteLine(doc, 3));
    assert.equal(core.restoreLines(doc, 3, 2).ok, false, 'one of the two is still there');
    ok(core.restoreLines(doc, 3, 1));
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
  });
});

describe('change stamps (10.4)', () => {
  const block = (doc, id) => {
    const v = doc.view;
    const at = v.definedAt.get(id)[0];
    return v.texts.slice(at, core.recordEnd(v, v.recOf[at]));
  };

  it('both rows of the table: no 1 CHAN gains one at the end; a 1 CHAN has its DATE and TIME set and a NOTE added', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));            // @I2@: no CHAN
    ok(core.editLine(doc, 8, '1 NAME Jane /Fixtures/'));            // @I1@: CHAN with DATE, TIME and a NOTE
    ok(core.addChild(doc, 17, '1 NOTE a family note'));              // @F1@: CHAN with a DATE and no TIME
    assert.deepEqual(core.stampPlan(doc).map((p) => [p.id, p.how]), [['@I1@', 'sets'], ['@I2@', 'adds'], ['@F1@', 'sets']],
      'what the Save dialog shows before the stamps are made');
    const r = ok(core.applyStamps(doc, AT, 'Fixed the surname.'));
    assert.equal(r.step.label, 'Change stamps');
    assert.deepEqual(block(doc, '@I2@'), ['0 @I2@ INDI', '1 NAME Joe /Fixtures/', '1 FAMS @F1@',
      '1 CHAN', '2 DATE 28 SEP 2026', '3 TIME 15:42:00', '2 NOTE Fixed the surname.']);
    assert.deepEqual(block(doc, '@I1@'), ['0 @I1@ INDI', '1 NAME Jane /Fixtures/', '1 FAMS @F1@',
      '1 CHAN', '2 DATE 28 SEP 2026', '3 TIME 15:42:00', '2 NOTE an earlier change', '2 NOTE Fixed the surname.']);
    assert.deepEqual(block(doc, '@F1@'), ['0 @F1@ FAM', '1 NOTE a family note', '1 HUSB @I2@', '1 WIFE @I1@',
      '1 CHAN', '2 DATE 28 SEP 2026', '3 TIME 15:42:00', '2 NOTE Fixed the surname.']);
    sameAsFreshRead(doc);
    const runs = core.changeRuns(doc);
    assert.ok(runs.filter((run) => run.stamp).length >= 3, 'the stamps show among the changes, marked as stamps');
    core.undo(doc);
    assert.equal(doc.view.texts.filter((t) => t === '1 CHAN').length, 2, 'one undo takes every stamp back');
  });

  it('the note: typed, the same in every record, one line, 200 characters at most; nothing typed, each record says what changed in it', () => {
    assert.equal(core.stampNote(open('chan.ged'), '   ').text, null, 'nothing typed: each record its own');
    assert.match(core.stampNote(open('chan.ged'), 'x'.repeat(201)).reason, /201 characters; 200 at most/);
    assert.equal(core.stampNote(open('chan.ged'), 'x'.repeat(200)).text.length, 200);
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));          // @I2@
    ok(core.editLine(doc, 8, '1 NAME Jane /Fixtures/'));          // @I1@
    assert.match(core.applyStamps(doc, AT, 'two\nlines').reason, /one line/);
    ok(core.applyStamps(doc, AT, ''));
    assert.deepEqual(doc.view.texts.filter((t) => t.startsWith('2 NOTE ')), ['2 NOTE an earlier change', '2 NOTE Changed: NAME', '2 NOTE Changed: NAME']);
    assert.ok(!doc.view.texts.some((t) => /GEDCOM Viewer|by hand/.test(t)), 'no product name, and no "by hand", in what is written');
  });

  it('a record\'s own note: Changed, Added, Removed and Moved, each tag once, in file order; a CONC or CONT as the line it continues', () => {
    const doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n1 SEX F\n1 FAMS @F1@\n' +
      '1 NOTE a note\n2 CONC that goes on\n1 BIRT\n2 DATE 1900\n1 DEAT\n2 DATE 1980\n0 @F1@ FAM\n1 WIFE @I1@\n0 TRLR\n');
    ok(core.editLine(doc, 6, '1 SEX M'));                           // SEX first in the file, NAME after: file order, not the order typed
    ok(core.editLine(doc, 5, '1 NAME Jane /Fixtures/'));
    ok(core.editLine(doc, 9, '2 CONC that went on'));               // a CONC: its line, the NOTE
    ok(core.deleteLine(doc, 7));                                     // 1 FAMS @F1@
    ok(core.addSibling(doc, 6, '1 OCCU fixture maker'));
    ok(core.addSibling(doc, 6, '1 RESI'));
    ok(core.moveLines(doc, 13, 15, 11));                             // the DEAT block before the BIRT block
    const note = core.recordNote(core.recordChanges(doc).get(doc.view.recOf[4]));
    assert.equal(note, 'Changed: NAME, SEX, NOTE. Added: RESI, OCCU. Removed: FAMS. Moved: DEAT, DATE');
    ok(core.applyStamps(doc, AT, ''));
    assert.equal(block(doc, '@I1@').slice(-1)[0], `2 NOTE ${note}`);
    assert.ok(!block(doc, '@F1@').includes('1 CHAN'), 'the family is as it was, so it gains no stamp');
  });

  it('a record\'s own note is one line of 200 characters at most: the list in hand ends ", and more"', () => {
    const many = Array.from({ length: 60 }, (_, k) => ({ place: k, tag: `_TAG${k}` }));
    const note = core.recordNote({ Changed: many, Added: [{ place: 1, tag: 'BIRT' }], Removed: [], Moved: [] });
    assert.ok(note.length <= 200 && note.endsWith(', and more') && note.startsWith('Changed: _TAG0, _TAG1, '), note);
    assert.equal(core.recordNote({ Changed: [{ place: 2, tag: 'NAME' }, { place: 1, tag: 'SEX' }, { place: 3, tag: 'NAME' }], Added: [], Removed: [], Moved: [] }),
      'Changed: SEX, NAME', 'file order, each tag once');
  });

  it('version 7: the time is UTC, with a closing Z', () => {
    const doc = openText('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 @N1@ SNOTE a shared note\n0 TRLR\n');
    ok(core.editLine(doc, 4, '1 NAME Jane /Fixtures/'));
    ok(core.editLine(doc, 5, '0 @N1@ SNOTE a shared note, edited'));
    ok(core.applyStamps(doc, new Date(Date.UTC(2026, 8, 28, 23, 30, 5)), ''));
    assert.deepEqual(block(doc, '@I1@'), ['0 @I1@ INDI', '1 NAME Jane /Fixtures/', '1 CHAN', '2 DATE 28 SEP 2026',
      '3 TIME 23:30:05Z', '2 NOTE Changed: NAME']);
    assert.equal(block(doc, '@N1@').slice(-1)[0], '2 NOTE Changed: SNOTE', 'a record whose own line changed');
    assert.equal(doc.view.texts.filter((t) => t === '1 CHAN').length, 2, 'the SNOTE record is stamped too');
    assert.deepEqual(core.stampTime(new Date(Date.UTC(2026, 11, 31, 23, 59, 59)), true), { date: '31 DEC 2026', time: '23:59:59Z' });
    assert.deepEqual(core.stampTime(new Date(2026, 0, 5, 7, 8, 9), false), { date: '5 JAN 2026', time: '07:08:09' });
  });

  it('a deleted record gets none; a family that lost a pointer line does', () => {
    const doc = open('chan.ged');
    ok(core.deleteRecord(doc, 14));                                  // @I2@, and 1 HUSB @I2@ in @F1@
    assert.deepEqual(core.stampTargets(doc).map((r) => doc.view.tag[doc.view.records[r]]), ['FAM']);
    ok(core.applyStamps(doc, AT, ''));
    assert.deepEqual(block(doc, '@F1@'), ['0 @F1@ FAM', '1 WIFE @I1@', '1 CHAN', '2 DATE 28 SEP 2026', '3 TIME 15:42:00',
      '2 NOTE Removed: HUSB']);
    sameAsFreshRead(doc);
  });

  it('HEAD, TRLR and records under other tags are never stamped', () => {
    const doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @T1@ _MTTAG\n1 NAME tag\n0 TRLR\n');
    ok(core.addChild(doc, 0, '1 NOTE about the file'));
    ok(core.editLine(doc, 6, '1 NAME a tag'));
    assert.deepEqual(core.stampTargets(doc), []);
    assert.equal(core.applyStamps(doc, AT, '').step, null);
  });

  it('a second save with no edit writes nothing, and stamps nothing', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));
    ok(core.applyStamps(doc, AT, ''));
    core.moveOntoCopy(doc);
    assert.equal(core.isChanged(doc), false, 'the page is on the copy');
    assert.equal(core.unsaved(doc), false);
    assert.equal(core.asOpened(doc), false, 'the copy holds the change; the file first opened does not');
    assert.deepEqual(core.stampTargets(doc), []);
    assert.equal(core.applyStamps(doc, LATER, '').step, null);
  });

  it('a record changed only by an earlier stamp is not stamped again', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));
    ok(core.applyStamps(doc, AT, ''));                               // a copy was saved; the file is not
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixture/'));              // typed back: only the stamp is left
    assert.deepEqual(core.stampTargets(doc), []);
    assert.equal(core.applyStamps(doc, LATER, '').step, null);
    assert.ok(doc.view.texts.includes('3 TIME 15:42:00'), 'the earlier stamp stays as it was');
  });

  it('a stamp added for an earlier copy is set anew when its record changes again, never added to, and left as it was when it does not', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));            // @I2@: no CHAN
    ok(core.editLine(doc, 8, '1 NAME Jane /Fixtures/'));            // @I1@: a CHAN of its own
    ok(core.applyStamps(doc, AT, 'first'));
    core.moveOntoCopy(doc);                                          // the first copy, and the page on it (D1)
    assert.deepEqual(core.stampPlan(doc), [], 'nothing changed since the copy: nothing to stamp');
    ok(core.addChild(doc, doc.view.definedAt.get('@I2@')[0], '1 NOTE about Joe'));   // @I2@ changes again; @I1@ does not
    assert.deepEqual(core.stampPlan(doc).map((p) => [p.id, p.how]), [['@I2@', 'resets']]);
    ok(core.applyStamps(doc, LATER, 'second'));
    assert.deepEqual(block(doc, '@I2@').slice(-4), ['1 CHAN', '2 DATE 2 OCT 2026', '3 TIME 09:05:07', '2 NOTE second'],
      'its stamp set anew: one NOTE, the second');
    assert.deepEqual(block(doc, '@I1@').slice(3), ['1 CHAN', '2 DATE 28 SEP 2026', '3 TIME 15:42:00',
      '2 NOTE an earlier change', '2 NOTE first'], '@I1@ did not change again: its stamp still says when, and why');
    core.moveOntoCopy(doc);                                          // the second copy
    ok(core.editLine(doc, doc.view.definedAt.get('@I1@')[0] + 1, '1 NAME Janet /Fixtures/'));
    ok(core.applyStamps(doc, new Date(2026, 9, 3, 10, 0, 0), 'third'));
    assert.deepEqual(block(doc, '@I1@').slice(3), ['1 CHAN', '2 DATE 3 OCT 2026', '3 TIME 10:00:00',
      '2 NOTE an earlier change', '2 NOTE third'], 'the file\'s own note stays; the stamp of this visit is set anew');
    assert.deepEqual(block(doc, '@I2@').slice(-4), ['1 CHAN', '2 DATE 2 OCT 2026', '3 TIME 09:05:07', '2 NOTE second']);
    sameAsFreshRead(doc);
  });

  it('a record changed before a copy written with the stamps unticked is in that copy as it is: the next copy stamps what changed after it, its note counted from the file first opened', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));            // @I2@
    core.moveOntoCopy(doc);                                          // a copy, stamps unticked; the page on it
    ok(core.editLine(doc, 8, '1 NAME Jane /Fixtures/'));            // @I1@, after it
    assert.deepEqual(core.stampPlan(doc).map((p) => [p.id, p.how]), [['@I1@', 'sets']], 'only @I1@ changed since the copy the page is on');
    ok(core.addChild(doc, doc.view.definedAt.get('@I2@')[0], '1 SEX M'));   // @I2@ again: its NAME before the copy, a SEX after it
    const plan = core.stampPlan(doc, LATER, '');
    assert.deepEqual(plan.map((p) => [p.id, p.how, p.note]), [['@I1@', 'sets', 'Changed: NAME'], ['@I2@', 'adds', 'Changed: NAME. Added: SEX']],
      'each record\'s note names what the visit changed in it');
  });

  it('after a move onto a copy (D1) the stamps of this visit are set anew, never doubled; an Undo that takes a stamp out is no change of the person\'s to stamp', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));            // @I2@: no CHAN of its own
    ok(core.saveActs(doc, AT, { stamps: true, typed: '', header: true }));
    core.moveOntoCopy(doc);
    assert.deepEqual(block(doc, '@I2@').slice(-4), ['1 CHAN', '2 DATE 28 SEP 2026', '3 TIME 15:42:00', '2 NOTE Changed: NAME']);
    assert.equal(core.undo(doc).label, 'Change stamps and the date in the header');
    assert.deepEqual(core.changeRuns(doc).map((r) => [r.kind, r.stamp, r.header, r.lines.length]), [['removed', true, true, 1], ['removed', true, false, 4]],
      'from the copy: its header\'s date and its stamp, removed, each said to be the viewer\'s');
    assert.deepEqual(core.stampTargets(doc), [], 'a stamp taken out is not a change to stamp');
    core.redo(doc);
    assert.equal(core.isChanged(doc), false, 'Redo brings the copy\'s lines back');
    ok(core.addChild(doc, doc.view.definedAt.get('@I2@')[0], '1 SEX M'));
    assert.deepEqual(core.stampPlan(doc, LATER, '').map((p) => [p.id, p.how, p.lines.map((l) => [l.how, l.text])]), [['@I2@', 'resets', [
      ['kept', '1 CHAN'], ['set', '2 DATE 2 OCT 2026'], ['set', '3 TIME 09:05:07'], ['set', '2 NOTE Changed: NAME. Added: SEX']]]]);
    assert.deepEqual(core.headerPlan(doc, LATER).lines.map((l) => [l.how, l.text]), [['set', '1 NOTE Last updated: 2 OCT 2026 09:05:07']]);
    ok(core.saveActs(doc, LATER, { stamps: true, typed: '', header: true }));
    assert.deepEqual(block(doc, '@I2@').slice(-4), ['1 CHAN', '2 DATE 2 OCT 2026', '3 TIME 09:05:07', '2 NOTE Changed: NAME. Added: SEX'],
      'one stamp, set anew: its note names the NAME of the first copy and the SEX of this one');
    assert.equal(block(doc, '@I2@').filter((t) => t.startsWith('1 CHAN')).length, 1);
    assert.deepEqual(doc.view.texts.filter((t) => t.includes('Last updated')), ['1 NOTE Last updated: 2 OCT 2026 09:05:07'], 'the header\'s date set in place, one line');
    assert.deepEqual(core.changeRuns(doc).map((r) => [r.kind, r.stamp, r.lines.length]), [['changed', true, 1], ['added', false, 1], ['changed', true, 3]],
      'from the copy: the header\'s date and the stamp set anew, and the line added');
    sameAsFreshRead(doc);
  });

  it('a save that wrote nothing takes its stamps back: the lines, the history and Redo as they were', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));
    ok(core.editLine(doc, 8, '1 NAME Jane /Fixtures/'));
    core.undo(doc);                                                  // Redo now holds the second edit
    const before = { order: doc.order.slice(), done: doc.done.slice(), undone: doc.undone.slice() };
    const undone = doc.undone.slice();
    const r = ok(core.applyStamps(doc, AT, ''));
    assert.equal(doc.undone.length, 0, 'an act empties Redo');
    assert.equal(core.takeBack(doc, r.step, undone), true);
    assert.deepEqual({ order: doc.order, done: doc.done, undone: doc.undone }, before);
    assert.equal(core.takeBack(doc, r.step, undone), false, 'once only: it is no longer the last step');
    sameAsFreshRead(doc);
  });

  it('a stamp at the very end of a file with no final newline keeps the file ending as it did', () => {
    const doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jane /Fixture/');
    ok(core.editLine(doc, 5, '1 NAME Jane /Fixtures/'));
    ok(core.applyStamps(doc, AT, ''));
    const out = Buffer.from(core.saveBytes(doc)).toString('utf8');
    assert.ok(out.endsWith('1 NAME Jane /Fixtures/\n1 CHAN\n2 DATE 28 SEP 2026\n3 TIME 15:42:00\n2 NOTE Changed: NAME'));
    sameAsFreshRead(doc);
  });

  // The Save dialog shows each record's stamp before the save as the lines it will gain or have
  // set; those lines must be the ones the save writes, in the file's order
  // A record's CHAN block as written; records keep their order through the stamps, so a plan's
  // record number still names it after them
  const written = (doc, record) => {
    const v = doc.view;
    const chan = core.blocksUnder(v, v.records[record]).blocks.map((b) => b[0]).find((p) => v.tag[p] === 'CHAN');
    return v.texts.slice(chan, core.subtreeEnd(v, chan));
  };

  it('the Save dialog\'s plan: each record\'s lines as they will be written, in file order, at the moment shown', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));            // @I2@: no CHAN
    ok(core.editLine(doc, 8, '1 NAME Jane /Fixtures/'));            // @I1@: a CHAN with DATE, TIME and a NOTE
    ok(core.deleteLine(doc, 18));                                    // @F1@: a CHAN with a DATE and no TIME; it lost its HUSB
    const plan = core.stampPlan(doc, AT, '');
    assert.deepEqual(plan.map((p) => [p.id, p.how, p.note]), [['@I1@', 'sets', 'Changed: NAME'], ['@I2@', 'adds', 'Changed: NAME'], ['@F1@', 'sets', 'Removed: HUSB']]);
    assert.deepEqual(plan[0].lines, [{ level: 1, text: '1 CHAN', how: 'kept' }, { level: 2, text: '2 DATE 28 SEP 2026', how: 'set' },
      { level: 3, text: '3 TIME 15:42:00', how: 'set' }, { level: 2, text: '2 NOTE Changed: NAME', how: 'added' }]);
    assert.deepEqual(plan[1].lines.map((l) => [l.level, l.text, l.how]), [[1, '1 CHAN', 'added'], [2, '2 DATE 28 SEP 2026', 'added'],
      [3, '3 TIME 15:42:00', 'added'], [2, '2 NOTE Changed: NAME', 'added']]);
    assert.deepEqual(plan[2].lines.map((l) => l.text), ['1 CHAN', '2 DATE 28 SEP 2026', '3 TIME 15:42:00', '2 NOTE Removed: HUSB'],
      'a TIME added after a DATE that is set lands before the NOTE added at the block\'s end, as in the file');
    assert.deepEqual(core.stampPlan(doc, AT, 'Typed.').map((p) => p.note), ['Typed.', 'Typed.', 'Typed.'], 'a typed note in every record');
    ok(core.applyStamps(doc, AT, ''));
    for (const p of plan) {
      const lines = written(doc, p.record);
      assert.deepEqual(p.lines.map((l) => l.text), lines.filter((t) => p.lines.some((l) => l.text === t)), `${p.id}: the dialog's lines are the file's, in its order`);
    }
  });

  it('the plan is what the stamps write, over every written file, at random', () => {
    for (const file of h.gedFiles(h.SYNTHETIC)) {
      const doc = core.openDocument(h.bytesOfFile(file));
      const rnd = prng(5);
      for (let k = 0; k < 25; k += 1) {
        const pos = Math.floor(rnd() * doc.order.length);
        const lv = Math.max(doc.view.level[pos], 0);
        if (rnd() < 0.5) core.editLine(doc, pos, `${lv} NOTE edited ${k}`); else core.addSibling(doc, pos, `${lv} NOTE added ${k}`);
      }
      const plan = core.stampPlan(doc, AT, '');
      const r = core.applyStamps(doc, AT, '');
      if (!r.ok) continue;                                           // refused, the same as it would be at the save
      for (const p of plan) {
        const lines = written(doc, p.record);
        const shown = p.lines.map((l) => l.text);
        assert.deepEqual(shown, lines.filter((t) => shown.includes(t)), `${path.basename(file)} ${p.id}`);
        assert.ok(p.lines.every((l) => l.how === 'kept' || lines.includes(l.text)), `${path.basename(file)} ${p.id}: every line shown is written`);
      }
    }
  });

  it('the date in the header, three ways: a NOTE at HEAD\'s end; a CONT at the end of HEAD\'s NOTE; a line of that form set anew, never a second', () => {
    const at = new Date(2026, 9, 9, 9, 33, 45);
    const head = (doc) => doc.view.texts.slice(0, core.recordEnd(doc.view, 0));
    // no NOTE in HEAD
    let doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 DATE 1 JAN 2020\n2 TIME 10:00:00\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 TRLR\n');
    assert.deepEqual(core.headerPlan(doc, at).lines, [{ level: 1, text: '1 NOTE Last updated: 9 OCT 2026 09:33:45', how: 'added' }]);
    ok(core.saveActs(doc, at, { stamps: false, typed: '', header: true }));
    assert.deepEqual(head(doc), ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 DATE 1 JAN 2020', '2 TIME 10:00:00',
      '1 NOTE Last updated: 9 OCT 2026 09:33:45'], 'at HEAD\'s end; the header\'s own DATE and TIME untouched');
    sameAsFreshRead(doc);
    // a NOTE in HEAD, with a CONT of its own
    doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 NOTE Exported for the family\n2 CONT second line\n1 SUBM @U1@\n0 @U1@ SUBM\n1 NAME Jane /Fixture/\n0 TRLR\n');
    assert.deepEqual(core.headerPlan(doc, at).lines, [{ level: 1, text: '1 NOTE Exported for the family', how: 'kept' },
      { level: 2, text: '2 CONT Last updated: 9 OCT 2026 09:33:45', how: 'added' }]);
    ok(core.saveActs(doc, at, { stamps: false, typed: '', header: true }));
    assert.deepEqual(head(doc), ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 NOTE Exported for the family', '2 CONT second line',
      '2 CONT Last updated: 9 OCT 2026 09:33:45', '1 SUBM @U1@']);
    // saved again: the line set anew, in its place
    const later = new Date(2026, 9, 9, 11, 0, 1);
    assert.deepEqual(core.headerPlan(doc, later).lines.map((l) => [l.text, l.how]), [['1 NOTE Exported for the family', 'kept'],
      ['2 CONT Last updated: 9 OCT 2026 11:00:01', 'set']]);
    ok(core.saveActs(doc, later, { stamps: false, typed: '', header: true }));
    assert.deepEqual(head(doc).filter((t) => /Last updated/.test(t)), ['2 CONT Last updated: 9 OCT 2026 11:00:01'], 'one, not two');
    // a file whose HEAD holds one already, from an earlier save, as a NOTE of its own
    doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 NOTE Last updated: 8 OCT 2026 15:12:00\n0 TRLR\n');
    ok(core.saveActs(doc, at, { stamps: false, typed: '', header: true }));
    assert.deepEqual(head(doc), ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 NOTE Last updated: 9 OCT 2026 09:33:45']);
    sameAsFreshRead(doc);
    // a NOTE that only begins with the words, by someone's hand, is not ours: the date goes under it
    doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 NOTE Last updated: whenever\n0 TRLR\n');
    ok(core.saveActs(doc, at, { stamps: false, typed: '', header: true }));
    assert.deepEqual(head(doc).slice(4), ['1 NOTE Last updated: whenever', '2 CONT Last updated: 9 OCT 2026 09:33:45']);
  });

  it('the date in the header in a version 7 file: UTC, with a closing Z, the date being UTC\'s too; no HEAD, nothing', () => {
    const doc = openText('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 TRLR\n');
    const at = new Date(Date.UTC(2026, 9, 9, 23, 59, 59));
    ok(core.editLine(doc, 4, '1 NAME Jane /Fixtures/'));
    ok(core.saveActs(doc, at, { stamps: true, typed: '', header: true }));
    assert.deepEqual(doc.view.texts.slice(0, 4), ['0 HEAD', '1 GEDC', '2 VERS 7.0', '1 NOTE Last updated: 9 OCT 2026 23:59:59Z']);
    assert.ok(doc.view.texts.includes('3 TIME 23:59:59Z'), 'the same moment as the stamps, in their forms');
    sameAsFreshRead(doc);
    assert.equal(core.headerPlan(openText('0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 TRLR\n'), at), null, 'a file that does not open with HEAD');
  });

  it('the stamps and the header\'s date are one step: one Undo takes both back, and a save that writes nothing takes both back; they show among the changes', () => {
    const doc = open('chan.ged');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));
    const before = hash(doc);
    const undone = doc.undone.slice();
    const r = ok(core.saveActs(doc, AT, { stamps: true, typed: '', header: true }));
    assert.equal(r.step.label, 'Change stamps and the date in the header');
    const runs = core.changeRuns(doc);
    assert.deepEqual(runs.filter((run) => run.header).map((run) => [run.kind, run.lines[0].now]), [['added', '1 NOTE Last updated: 28 SEP 2026 15:42:00']]);
    assert.ok(runs.some((run) => run.stamp && !run.header), 'the stamp, a run of its own');
    assert.equal(core.undo(doc).label, 'Change stamps and the date in the header');
    assert.equal(hash(doc), before);
    core.redo(doc);
    assert.equal(core.takeBack(doc, r.step, undone), true);
    assert.equal(hash(doc), before);
    assert.equal(ok(core.saveActs(open('chan.ged'), AT, { stamps: false, typed: '', header: true })).step.label, 'The date in the header');
  });

  it('nothing to save when the lines are the original\'s, or any copy\'s: so no save writes the original\'s bytes again', () => {
    const doc = open('chan.ged');
    assert.equal(core.unsaved(doc), false, 'as opened');
    ok(core.editLine(doc, 15, '1 NAME Joe /Fixtures/'));
    assert.equal(core.unsaved(doc), true);
    core.moveOntoCopy(doc);                                          // the first copy
    assert.equal(core.unsaved(doc), false, 'the lines of the copy');
    ok(core.editLine(doc, 8, '1 NAME Jane /Fixtures/'));
    core.moveOntoCopy(doc);                                          // the second
    core.undo(doc);                                                  // back to the first copy's lines
    assert.equal(core.unsaved(doc), false, 'an earlier copy\'s lines');
    assert.equal(core.isChanged(doc), true, 'a change from the copy the page is on, the second');
    core.undo(doc);                                                  // back to the original
    assert.equal(core.unsaved(doc), false, 'the original: nothing to save');
    assert.equal(core.asOpened(doc), true);
    assert.equal(core.isChanged(doc), true, 'still a change from the copy the page is on');
  });
});

describe('refused, loudly (I11)', () => {
  it('a line break inside a line', () => {
    const doc = open('family.ged');
    for (const text of ['1 NAME a\nb', '1 NAME a\rb']) {
      assert.match(core.editLine(doc, 16, text).reason, /cannot hold a line break/);
      assert.match(core.addChild(doc, 16, text).reason, /cannot hold a line break/);
    }
    assert.equal(doc.done.length, 0);
  });

  it('half of a surrogate pair; a whole pair is written', () => {
    const doc = open('family.ged');
    const high = String.fromCharCode(0xd83d);
    assert.match(core.editLine(doc, 16, `1 NAME ${high}`).reason, /surrogate/);
    ok(core.editLine(doc, 16, `1 NAME ${high}${String.fromCharCode(0xde00)}`));
    sameAsFreshRead(doc);
  });

  it('a line whose bytes could not be read (E8) can be deleted, not edited', () => {
    const doc = open('e8-bad-bytes.ged');
    assert.match(core.editLine(doc, 7, '1 NOTE fixed').reason, /E8/);
    ok(core.deleteLine(doc, 7));
    sameAsFreshRead(doc);
    core.undo(doc);
    assert.equal(hash(doc), h.sha256(doc.m.bytes), 'undone, its bytes are back as they were');
  });

  it("an edit that would change how the file's encoding is read; a CHAR put right is kept", () => {
    const doc = open('family.ged');
    assert.match(core.editLine(doc, 3, '1 CHAR ANSEL').reason, /read as ANSEL, not UTF-8/);
    assert.equal(doc.done.length, 0);
    ok(core.editLine(doc, 3, '1 CHAR UTF8'));                        // another name for the same encoding
    const says = open('e9-says-unicode.ged');
    assert.equal(says.view.findings.byCode.E9.length, 1);
    const charLine = says.view.texts.findIndex((t) => t.startsWith('1 CHAR'));
    ok(core.editLine(says, charLine, '1 CHAR UTF-8'));
    assert.equal(says.view.findings.byCode.E9.length, 0, 'the header now says what the bytes are');
    sameAsFreshRead(says);
  });

  it('a line that would not read back as a line of its own', () => {
    const last = open('no-final-newline.ged');
    assert.match(core.editLine(last, 7, '').reason, /empty last line/);
    const doc = openText('0 HEAD\r1 CHAR UTF-8\r1 NOTE x\n0 TRLR\r');
    assert.match(core.editLine(doc, 2, '').reason, /would join the one above/);
    assert.equal(doc.done.length, 0);
    const lf = openText('0 HEAD\n1 CHAR UTF-8\n1 NOTE x\n0 TRLR\n');
    ok(core.editLine(lf, 2, ''));                                    // allowed, and malformed: E5 says so
    assert.deepEqual(h.findingsOf(lf.view).E5, [3]);
  });
});

// A small seeded generator (mulberry32), so a failure can be run again.
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Acts picked at random over a file — edits, lines added and deleted, records deleted, moves,
// stamps, undo and redo — each checked as it is made: the view against a fresh read, the net
// change against the lines. Then all of it undone: the file, byte for byte.
function walkAtRandom(file, count, seed) {
  const bytes = h.bytesOfFile(file);
  const doc = core.openDocument(bytes);
  const rnd = prng(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  let made = 0;
  for (let k = 0; k < count; k += 1) {
    const n = doc.order.length;
    if (!n) { core.undo(doc); continue; }
    const pos = Math.floor(rnd() * n);
    const lv = doc.view.level[pos];
    const text = doc.view.texts[pos];
    const roll = rnd();
    let r;
    if (roll < 0.3) {
      r = core.editLine(doc, pos, pick([`${text} x`, '', `${text}é`, 'no level here', `0 @X${k}@ INDI`,
        `${Math.max(lv, 0)} NOTE edited ${k}`, doc.m.texts[Math.min(pos, doc.m.n - 1)] || 'x']));
    } else if (roll < 0.45) r = core.addChild(doc, pos, `${lv + 1} NOTE child ${k}`);
    else if (roll < 0.55) r = core.addSibling(doc, pos, `${Math.max(lv, 0)} NOTE sibling ${k}`);
    else if (roll < 0.63) r = core.deleteLine(doc, pos);
    else if (roll < 0.68) r = core.deleteRecord(doc, pos);
    else if (roll < 0.76) {                                          // a move to a place landings offers (3.4a)
      const l = core.landings(doc, pos, core.subtreeEnd(doc.view, pos));
      r = l.at.length ? core.moveLines(doc, pos, core.subtreeEnd(doc.view, pos), pick(l.at)) : { ok: false, reason: l.reason || 'nowhere to go' };
    }
    else if (roll < 0.84) r = { ok: true, step: core.undo(doc) };
    else if (roll < 0.9) r = { ok: true, step: core.redo(doc) };
    else if (roll < 0.95) r = core.applyStamps(doc, AT, `stamp ${k}`);
    else { core.moveOntoCopy(doc); r = { ok: true, step: null }; }
    if (!r.ok) {
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
      continue;
    }
    made += 1;
    sameAsFreshRead(doc);
    assert.deepEqual(replayed(doc, core.netChange(doc)), doc.view.texts, `net change from the file the page is on after act ${k}`);
    assert.deepEqual(replayed(doc, core.netChange(doc, doc.openedOrder), doc.openedOrder), doc.view.texts, `net change from the file first opened after act ${k}`);
  }
  while (doc.done.length) core.undo(doc);
  assert.equal(h.sha256(core.saveBytes(doc)), h.sha256(bytes), `${path.basename(file)}: everything undone`);
  return made;
}

describe('the document, checked again after every act, is what a fresh read of its bytes shows', () => {
  it('acts at random over every written file', () => {
    for (const file of h.gedFiles(h.SYNTHETIC)) {
      for (const seed of [1, 2, 3]) assert.ok(walkAtRandom(file, 60, seed) > 0, path.basename(file));
    }
  });

  it('acts at random over every public test file: UTF-16, ANSEL, ASCII, CR, LF CR', { skip: h.NO_CORPORA }, () => {
    for (const file of h.gedFiles(h.CORPORA)) walkAtRandom(file, 12, 7);
  });
});
