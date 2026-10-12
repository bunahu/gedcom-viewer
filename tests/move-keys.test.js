// 3.4a, by key: ⌥↑ and ⌥↓ move the selected line's block past the sibling above or below it.
// core.js gives the place (neighbourLanding) and holds it to every rule of a drag; the page moves the
// block by it. Every move is held to a fresh read of the bytes it would save, and undone to the file's
// own sha256. Only the files written for the tests (fixtures/synthetic) are opened here.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const h = require('./helpers.js');

const open = (name) => core.openDocument(h.bytesOfFile(path.join(h.SYNTHETIC, name)));
const openText = (text) => core.openDocument(new Uint8Array(Buffer.from(text, 'utf8')));
const hash = (doc) => h.sha256(core.saveBytes(doc));
const texts = (doc) => doc.view.texts.slice();
const NOWHERE = 'This block has nowhere else to go among its siblings.';
const SUBM_RULE = 'The submitter record stays directly after HEAD, below GEDCOM 7.';
const written = () => h.gedFiles(h.SYNTHETIC);

// What the page does for ⌥↑ (dir -1) and ⌥↓ (dir 1) on a selected line: its block, which is the line
// and everything under it (a 0 line, its record); the place the rule gives; the move. `line` is where
// the same line stands after, the one the page keeps selected.
function press(doc, line, dir) {
  const end = core.subtreeEnd(doc.view, line);
  const r = core.neighbourLanding(doc, line, end, dir);
  if (!r.ok) return { ok: false, reason: r.reason };
  const m = core.moveLines(doc, line, end, r.to);
  assert.ok(m.ok, m.reason);
  return { ok: true, to: r.to, step: m.step, line: r.to < line ? r.to : r.to - (end - line) };
}

// The first lines of the blocks under `parent`, as the document's own numbers for them.
const heads = (doc, parent) => core.blocksUnder(doc.view, parent).blocks.map((b) => doc.order[b[0]]);

function sameAsFreshRead(doc) {
  const fresh = core.read(core.saveBytes(doc));
  assert.deepEqual(doc.view.texts, fresh.texts);
  assert.deepEqual(h.findingsOf(doc.view), h.findingsOf(fresh));
}

describe('⌥↑ and ⌥↓: a block past the sibling above or below it', () => {
  it('up once stands the block before the sibling above it; down once, after the sibling below it; a sibling of several lines is passed whole', () => {
    // family.ged, @I42@: 16 NAME, 17 SEX, 18-19 BIRT with its DATE, 20 FAMC, 21 FAMS (line numbers less 1)
    const doc = open('family.ged');
    assert.deepEqual(core.neighbourLanding(doc, 18, 20, -1), { ok: true, to: 17 }, 'BIRT: before SEX');
    assert.deepEqual(core.neighbourLanding(doc, 18, 20, 1), { ok: true, to: 21 }, 'BIRT: after FAMC');
    const up = press(doc, 18, -1);
    assert.equal(up.line, 17, 'the same line, at its new number');
    assert.deepEqual(texts(doc).slice(15, 22), ['0 @I42@ INDI', '1 NAME Jane /Fixture/', '1 BIRT', '2 DATE 1 JAN 1900', '1 SEX F', '1 FAMC @F1@', '1 FAMS @F2@']);
    sameAsFreshRead(doc);

    const down = open('family.ged');
    assert.equal(press(down, 18, 1).line, 19);
    assert.deepEqual(texts(down).slice(15, 22), ['0 @I42@ INDI', '1 NAME Jane /Fixture/', '1 SEX F', '1 FAMC @F1@', '1 BIRT', '2 DATE 1 JAN 1900', '1 FAMS @F2@']);
    sameAsFreshRead(down);

    const past = open('family.ged');
    assert.equal(press(past, 17, 1).line, 19, 'SEX down passes BIRT and its DATE together');
    assert.deepEqual(texts(past).slice(15, 22), ['0 @I42@ INDI', '1 NAME Jane /Fixture/', '1 BIRT', '2 DATE 1 JAN 1900', '1 SEX F', '1 FAMC @F1@', '1 FAMS @F2@']);
    const over = open('family.ged');
    assert.equal(press(over, 20, -1).line, 18, 'FAMC up passes BIRT and its DATE together');
    assert.deepEqual(texts(over).slice(15, 22), ['0 @I42@ INDI', '1 NAME Jane /Fixture/', '1 SEX F', '1 FAMC @F1@', '1 BIRT', '2 DATE 1 JAN 1900', '1 FAMS @F2@']);
  });

  it('the first block under its line has nowhere to go up, the last none down: the words a drag uses, and no step', () => {
    const doc = open('family.ged');
    assert.equal(core.NOWHERE_ELSE, NOWHERE);
    assert.deepEqual(core.neighbourLanding(doc, 16, 17, -1), { ok: false, reason: NOWHERE }, '1 NAME, first under @I42@');
    assert.deepEqual(core.neighbourLanding(doc, 21, 22, 1), { ok: false, reason: NOWHERE }, '1 FAMS, last under @I42@');
    assert.deepEqual(core.neighbourLanding(doc, 19, 20, -1), { ok: false, reason: NOWHERE }, '2 DATE, alone under BIRT');
    assert.deepEqual(core.neighbourLanding(doc, 19, 20, 1), { ok: false, reason: NOWHERE });
    assert.equal(press(doc, 16, -1).ok, false);
    assert.equal(doc.done.length, 0);
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
  });

  it("a record's 0 line takes its whole record past the neighbouring record; a record moved whole is not stamped", () => {
    const doc = open('family.ged');
    const record = texts(doc).slice(15, 22);
    assert.deepEqual(core.neighbourLanding(doc, 15, 22, -1), { ok: true, to: 11 }, '@I42@ before @I2@');
    const up = press(doc, 15, -1);
    assert.equal(up.line, 11);
    assert.deepEqual(doc.view.records.map((i) => doc.view.xref[i]).slice(2, 6), ['@I1@', '@I42@', '@I2@', '@I43@']);
    assert.deepEqual(texts(doc).slice(11, 18), record, 'all seven of its lines, in order');
    const runs = core.changeRuns(doc);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].moved, { what: 'record', tag: 'INDI', records: 1, sameKind: 0 });
    assert.deepEqual(core.stampTargets(doc), []);
    sameAsFreshRead(doc);

    const down = open('family.ged');
    assert.deepEqual(core.neighbourLanding(down, 15, 22, 1), { ok: true, to: 26 }, '@I42@ after @I43@, at the edge before the first family');
    assert.equal(press(down, 15, 1).line, 19);
    assert.deepEqual(down.view.records.map((i) => down.view.xref[i]).slice(2, 6), ['@I1@', '@I2@', '@I43@', '@I42@']);
    assert.deepEqual(texts(down).slice(19, 26), record);
    assert.deepEqual(core.stampTargets(down), []);
    sameAsFreshRead(down);
  });
});

describe('what a key may not do: the rules of a drag', () => {
  it('HEAD stays first, TRLR last, and below version 7 the submitter record directly after HEAD', () => {
    const doc = open('family.ged');
    for (const dir of [-1, 1]) {
      assert.equal(core.neighbourLanding(doc, 0, 5, dir).reason, 'HEAD stays first.');
      assert.equal(core.neighbourLanding(doc, 36, 37, dir).reason, 'TRLR stays last.');
      assert.equal(core.neighbourLanding(doc, 5, 7, dir).reason, SUBM_RULE);
    }
    assert.equal(core.neighbourLanding(doc, 7, 11, -1).reason, SUBM_RULE, 'the first person up: nothing stands before the submitter record');
    assert.equal(core.neighbourLanding(doc, 31, 36, 1).reason, 'TRLR stays last.', 'the last family down: nothing stands after TRLR');
    assert.equal(doc.done.length, 0);

    // no submitter record: the first record after HEAD cannot go before it; the last before TRLR cannot go after it
    const bare = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 @F1@ FAM\n1 HUSB @I1@\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n');
    assert.equal(core.neighbourLanding(bare, 2, 4, -1).reason, 'HEAD stays first.');
    assert.equal(core.neighbourLanding(bare, 6, 8, 1).reason, 'TRLR stays last.');
    assert.deepEqual(core.neighbourLanding(bare, 4, 6, -1), { ok: true, to: 2 }, 'the family up past the first person');

    // a submitter record directly after HEAD, in a file not bunched by type
    const subm = openText('0 HEAD\n1 CHAR UTF-8\n0 @U1@ SUBM\n1 NAME Walk /Fixture/\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 @F1@ FAM\n1 HUSB @I1@\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n');
    assert.equal(core.sectionsOf(subm.view), null);
    assert.equal(core.neighbourLanding(subm, 4, 6, -1).reason, SUBM_RULE);
    assert.equal(core.neighbourLanding(subm, 2, 4, 1).reason, SUBM_RULE);
    assert.deepEqual(core.neighbourLanding(subm, 8, 10, -1), { ok: true, to: 6 });

    // version 7: the submitter record moves like any record
    const v7 = openText('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 @U1@ SUBM\n1 NAME Walk /Fixture/\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n');
    assert.equal(core.sectionsOf(v7.view), null);
    assert.deepEqual(core.neighbourLanding(v7, 5, 7, -1), { ok: true, to: 3 }, 'up, to the edge right after HEAD');
    assert.deepEqual(core.neighbourLanding(v7, 5, 7, 1), { ok: true, to: 9 });
    assert.equal(press(v7, 5, -1).line, 3);
    assert.deepEqual(v7.view.records.map((i) => v7.view.tag[i]), ['HEAD', 'SUBM', 'INDI', 'INDI', 'TRLR']);
  });

  it("HEAD's own lines are blocks among themselves, as a drag has them", () => {
    const doc = open('family.ged');
    assert.deepEqual(core.neighbourLanding(doc, 1, 3, 1), { ok: true, to: 4 }, 'GEDC and its VERS after CHAR');
    assert.equal(press(doc, 1, 1).line, 2);
    assert.deepEqual(texts(doc).slice(0, 5), ['0 HEAD', '1 CHAR UTF-8', '1 GEDC', '2 VERS 5.5.1', '1 SUBM @U1@']);
  });

  it('a CONC or CONT line never moves alone, and nothing lands between a line and its CONC or CONT lines', () => {
    const n1 = open('n1-line-breaks.ged');
    for (const dir of [-1, 1]) {
      assert.equal(core.neighbourLanding(n1, 8, 9, dir).reason, "Line 9 is a CONC line, part of its line's value: it moves only with that line.");
      assert.match(core.neighbourLanding(n1, 9, 10, dir).reason, /^Line 10 is a CONC line/);
    }
    assert.deepEqual(core.neighbourLanding(n1, 6, 7, 1), { ok: true, to: 10 }, 'the NAME goes after the NOTE and its CONC lines');
    assert.deepEqual(core.neighbourLanding(n1, 7, 10, -1), { ok: true, to: 6 }, 'the NOTE takes its CONC lines with it');
    assert.equal(press(n1, 7, -1).line, 6);
    assert.deepEqual(texts(n1).slice(6, 10).map((t) => t.slice(0, 8)), ['1 NOTE t', '2 CONC t', '2 CONC ,', '1 NAME J']);

    // a DATE under a NOTE whose CONC line comes first: the DATE cannot go up past it
    const above = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NOTE a note,\n2 CONC continued\n2 DATE 1900\n2 PLAC Fixtureville\n1 SEX F\n0 TRLR\n');
    assert.equal(core.neighbourLanding(above, 5, 6, -1).reason, 'Nothing lands between a line and its CONC lines.');
    assert.deepEqual(core.neighbourLanding(above, 6, 7, -1), { ok: true, to: 5 }, 'the PLAC before the DATE');
    assert.deepEqual(core.neighbourLanding(above, 5, 6, 1), { ok: true, to: 7 }, 'the DATE after the PLAC');

    // a CONC line that comes last: the line before it cannot move at all; the one before that cannot go down past it
    const below = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NOTE a note,\n2 DATE 1900\n2 PLAC Fixtureville\n2 CONC continued\n1 SEX F\n0 TRLR\n');
    assert.equal(core.neighbourLanding(below, 4, 5, 1).reason, 'Nothing lands between a line and its CONC lines.');
    for (const dir of [-1, 1]) assert.match(core.neighbourLanding(below, 5, 6, dir).reason, /^Line 7 is a CONC line, and would then continue another line\.$/);
  });

  it('a line that did not parse moves only with the block it sits in', () => {
    const doc = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jane /Fixture/\nno level here\n1 SEX F\n0 TRLR\n');
    assert.equal(doc.view.level[4], -1);
    for (const dir of [-1, 1]) assert.equal(core.neighbourLanding(doc, 4, 5, dir).reason, 'Line 5 did not parse: it moves only with the block it sits in.');
    assert.deepEqual(core.neighbourLanding(doc, 3, 5, 1), { ok: true, to: 6 }, 'the NAME block holds the line that did not parse');
    assert.equal(press(doc, 3, 1).line, 4);
    assert.deepEqual(texts(doc).slice(3, 6), ['1 SEX F', '1 NAME Jane /Fixture/', 'no level here']);
    const e1 = open('e1-no-level.ged');
    const bad = e1.view.texts.findIndex((t) => !/^\d/.test(t));
    for (const dir of [-1, 1]) assert.match(core.neighbourLanding(e1, bad, bad + 1, dir).reason, /did not parse: it moves only with the block it sits in/);
  });

  it('a block with nothing to land among, or none that the rules allow, is refused in words, never with nothing', () => {
    assert.match(core.neighbourLanding(open('family.ged'), 40, 41, 1).reason, /^There are no lines/);
    const e3 = open('e3-jump.ged');
    for (let i = 0; i < e3.view.n; i += 1) {
      for (const dir of [-1, 1]) {
        const r = core.neighbourLanding(e3, i, core.subtreeEnd(e3.view, i), dir);
        assert.ok(r.ok || (typeof r.reason === 'string' && r.reason.length > 0), `line ${i + 1}, dir ${dir}`);
      }
    }
  });
});

describe('in a file bunched by type, a record stays among the records of its type', () => {
  it('a person goes no further than the people, a family no further than the families', () => {
    const doc = open('family.ged');
    assert.equal(core.neighbourLanding(doc, 22, 26, 1).reason, NOWHERE, 'the last person, down: the next record is a family');
    assert.equal(core.neighbourLanding(doc, 26, 31, -1).reason, NOWHERE, 'the first family, up: the record above is a person');
    assert.deepEqual(core.neighbourLanding(doc, 11, 15, -1), { ok: true, to: 7 }, 'a person up past a person');
    assert.deepEqual(core.neighbourLanding(doc, 26, 31, 1), { ok: true, to: 36 }, 'a family down past a family, to the edge before TRLR');
    assert.equal(doc.done.length, 0);
    // the first person: the rule of the submitter record is said first, as for a drag; the type would refuse it too
    assert.equal(core.neighbourLanding(doc, 7, 11, -1).reason, SUBM_RULE);
  });

  it('the same press in a file not bunched goes past a record of another type', () => {
    const loose = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 @F1@ FAM\n1 HUSB @I1@\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 TRLR\n');
    assert.equal(core.sectionsOf(loose.view), null);
    assert.deepEqual(core.neighbourLanding(loose, 6, 8, -1), { ok: true, to: 4 }, 'a person up past a family');
    assert.deepEqual(core.neighbourLanding(loose, 2, 4, 1), { ok: true, to: 6 }, 'a person down past a family');
    const bunched = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 @I2@ INDI\n1 NAME Joe /Fixture/\n0 @F1@ FAM\n1 HUSB @I1@\n0 TRLR\n');
    assert.equal(core.sectionsOf(bunched.view).length, 4);
    assert.equal(core.neighbourLanding(bunched, 4, 6, 1).reason, NOWHERE, 'the same records, bunched: the last person cannot go down');
    assert.equal(core.neighbourLanding(bunched, 6, 8, -1).reason, NOWHERE, 'the family cannot go up');
    assert.deepEqual(core.neighbourLanding(bunched, 2, 4, 1), { ok: true, to: 6 }, 'a person down past the other person');
  });

  it('a line under a record is held to no type, in either kind of file', () => {
    const doc = open('family.ged');
    const at = core.landings(doc, 18, 20).at;
    assert.equal(core.keepBunched(doc, 18, at, false), at);
    for (let i = 0; i < doc.view.n; i += 1) {
      if (doc.view.level[i] === 0) continue;
      const end = core.subtreeEnd(doc.view, i);
      const l = core.landings(doc, i, end);
      if (!l.reason) assert.deepEqual(core.keepBunched(doc, i, l.at, false), l.at, `line ${i + 1}`);
    }
  });

  it('sectionsOf and keepBunched: a type by its row lands at another type\'s edge only, a record among its own type', () => {
    const doc = open('family.ged');
    assert.deepEqual(core.sectionsOf(doc.view).map((s) => [s.tag, s.from, s.to, s.records, s.index]),
      [['HEAD', 0, 5, 1, 0], ['SUBM', 5, 7, 1, 1], ['INDI', 7, 26, 4, 2], ['FAM', 26, 36, 2, 3], ['TRLR', 36, 37, 1, 4]]);
    const person = core.landings(doc, 15, 22).at;
    assert.deepEqual(person, [7, 11, 26, 31, 36], 'core.js allows any sibling edge');
    assert.deepEqual(core.keepBunched(doc, 15, person, false), [7, 11, 26], 'the people, and the edge before the first family');
    const families = core.landings(doc, 26, 36).at;
    assert.deepEqual(families, [7, 11, 15, 22]);
    assert.deepEqual(core.keepBunched(doc, 26, families, true), [7], 'the families by their row: only the people\'s edge');
    assert.equal(core.sectionsOf(openText('0 @I1@ INDI\n0 @I2@ INDI\n').view), null, 'one type only: no sections');
    assert.equal(core.sectionsOf(openText('0 HEAD\n0 @I1@ INDI\n0 @F1@ FAM\n0 @I2@ INDI\n0 TRLR\n').view), null, 'a type in two runs: no sections');
    const loose = openText('0 HEAD\n0 @I1@ INDI\n0 @F1@ FAM\n0 @I2@ INDI\n0 TRLR\n');
    const l = core.landings(loose, 1, 2);
    assert.equal(core.keepBunched(loose, 1, l.at, false), l.at, 'a file not bunched: every place stands');
  });
});

describe('a press is one step, and leaves the file as it was when pressed back', () => {
  it('up then down puts the file back, byte for byte: the same sha256, and no change at all', () => {
    for (const [line, dir] of [[18, -1], [18, 1], [15, -1], [15, 1], [26, 1], [11, -1], [21, -1]]) {
      const doc = open('family.ged');
      const sha = hash(doc);
      const there = press(doc, line, dir);
      assert.ok(there.ok, `line ${line + 1}, dir ${dir}`);
      assert.notEqual(hash(doc), sha, 'moved');
      assert.equal(core.saveBytes(doc).length, doc.m.bytes.length, 'the same bytes in a new order');
      const back = press(doc, there.line, -dir);
      assert.ok(back.ok, `back from line ${there.line + 1}`);
      assert.equal(back.line, line);
      assert.equal(hash(doc), sha, 'the file as it was');
      assert.deepEqual(core.netChange(doc), []);
      assert.equal(core.isChanged(doc), false);
    }
  });

  it('each press is one step: one Undo takes it back to the file\'s own sha256, and Redo puts it again', () => {
    const doc = open('family.ged');
    const sha = [hash(doc)];
    const text = [texts(doc)];
    for (const [line, dir] of [[18, -1], [11, -1], [26, 1]]) {
      const before = doc.done.length;
      const r = press(doc, line, dir);
      assert.equal(doc.done.length, before + 1, 'one step');
      assert.match(r.step.label, /^Move lines? \d/);
      sha.push(hash(doc));
      text.push(texts(doc));
    }
    for (let k = 3; k > 0; k -= 1) {
      assert.ok(core.undo(doc));
      assert.equal(hash(doc), sha[k - 1]);
    }
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
    for (let k = 1; k <= 3; k += 1) {
      assert.ok(core.redo(doc));
      assert.deepEqual(texts(doc), text[k]);
    }
  });

  it("a moved line is written from its own bytes (I1): a line whose bytes could not be read moves with them, and every line keeps its own ending", () => {
    const doc = open('e8-bad-bytes.ged');
    const m = doc.m;
    assert.equal(m.bad[8], 1);
    assert.deepEqual(core.neighbourLanding(doc, 8, 9, -1), { ok: true, to: 7 });
    assert.equal(press(doc, 8, -1).line, 7);
    const out = core.saveBytes(doc);
    const line = m.bytes.subarray(m.start[8], m.end[8]);
    assert.deepEqual(out.subarray(m.start[7], m.start[7] + line.length), line, 'the unreadable line, byte for byte, where the first NOTE was');
    assert.equal(out.length, m.bytes.length);
    assert.deepEqual(h.findingsOf(doc.view).E8, [8, 9]);
    core.undo(doc);
    assert.equal(hash(doc), h.sha256(m.bytes));
  });

  it('a place the rules give may still be one the file could not read back (I11): moveLines refuses it, and a key shows that refusal', () => {
    // an empty line (E5) first under @I1@, ending LF; a SEX line ending CR: SEX before the empty line would join their endings
    const doc = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n\n1 SEX F\r1 NOTE x\n0 TRLR\n');
    assert.deepEqual(core.neighbourLanding(doc, 4, 5, -1), { ok: true, to: 3 }, 'the place is the rules\'; the file\'s readability is moveLines\'s');
    const r = core.moveLines(doc, 4, 5, 3);
    assert.equal(r.ok, false);
    assert.match(r.reason, /The empty line at line 5 would not read back as a line/);
    assert.equal(doc.done.length, 0);
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
    assert.equal(press(doc, 5, -1).line, 4, 'the NOTE, ending LF, before the SEX');
    assert.equal(press(doc, 4, -1).line, 3, 'and before the empty line: fine');
    assert.deepEqual(texts(doc).slice(3, 6), ['1 NOTE x', '', '1 SEX F']);
    sameAsFreshRead(doc);
  });
});

describe('every line of every file written, pressed both ways', () => {
  it('a press moves the block exactly one place among its siblings, to a place a drag offers, or says why not, in words', () => {
    let pressed = 0;
    let moved = 0;
    for (const file of written()) {
      const bytes = h.bytesOfFile(file);
      const n = core.openDocument(bytes).view.n;
      for (let i = 0; i < n; i += 1) {
        for (const dir of [-1, 1]) {
          const doc = core.openDocument(bytes);
          const v = doc.view;
          const end = core.subtreeEnd(v, i);
          const r = core.neighbourLanding(doc, i, end, dir);
          pressed += 1;
          const name = `${path.basename(file)}, line ${i + 1}, ${dir < 0 ? 'up' : 'down'}`;
          if (!r.ok) {
            assert.ok(typeof r.reason === 'string' && r.reason.length > 0, `${name}: a refusal has words`);
            assert.equal(r.to, undefined);
            continue;
          }
          assert.ok(core.landings(doc, i, end).at.includes(r.to), `${name}: the place is one that landings gives`);
          assert.equal(core.moveRefusal(doc, i, end, r.to), null, `${name}: nothing refuses it`);
          const parent = core.parentOf(v, i);
          const before = heads(doc, parent);
          const k = before.indexOf(doc.order[i]);
          const want = before.slice();
          [want[k], want[k + dir]] = [want[k + dir], want[k]];
          const m = core.moveLines(doc, i, end, r.to);
          assert.ok(m.ok, `${name}: ${m.reason}`);
          moved += 1;
          assert.deepEqual(heads(doc, parent), want, `${name}: the block and its neighbour changed places, nothing else`);
          assert.equal(doc.done.length, 1, `${name}: one step`);
          sameAsFreshRead(doc);
          assert.equal(doc.view.level.length, v.level.length);
          core.undo(doc);
          assert.equal(hash(doc), h.sha256(bytes), `${name}: undone to the file's own sha256`);
        }
      }
    }
    assert.ok(pressed > 500 && moved > 150, `${pressed} presses, ${moved} of them moves`);
  });

  it('up then down, or down then up, puts each file back as it was, where the file\'s frame is right', () => {
    let restored = 0;
    for (const file of written()) {
      const bytes = h.bytesOfFile(file);
      const sha = h.sha256(bytes);
      const probe = core.openDocument(bytes);
      const frameWrong = !!h.findingsOf(probe.view).E4;               // a second TRLR may move to be last, and then it stays: as a drag has it
      for (let i = 0; i < probe.view.n; i += 1) {
        for (const dir of [-1, 1]) {
          const doc = core.openDocument(bytes);
          const end = core.subtreeEnd(doc.view, i);
          const first = press(doc, i, dir);
          if (!first.ok) continue;
          const back = press(doc, first.line, -dir);
          const name = `${path.basename(file)}, line ${i + 1}, dir ${dir}`;
          if (frameWrong && !back.ok) continue;
          assert.ok(back.ok, `${name}: ${back.reason}`);
          assert.equal(back.line, i, name);
          assert.equal(hash(doc), sha, name);
          assert.deepEqual(core.netChange(doc), [], name);
          assert.equal(end - i, core.subtreeEnd(doc.view, i) - i, name);
          restored += 1;
        }
      }
    }
    assert.ok(restored > 150, `${restored} pairs put back`);
  });

  it('every moved line is written from its own bytes and its own ending (I1), and the file keeps its size', () => {
    let checked = 0;
    for (const file of written()) {
      const bytes = h.bytesOfFile(file);
      const n = core.openDocument(bytes).view.n;
      for (let i = 0; i < n; i += 1) {
        for (const dir of [-1, 1]) {
          const doc = core.openDocument(bytes);
          if (!press(doc, i, dir).ok) continue;
          const m = doc.m;
          const out = core.saveBytes(doc);
          const fresh = core.read(out);
          assert.equal(out.length, bytes.length, `${path.basename(file)}, line ${i + 1}`);
          for (let j = 0; j < doc.order.length; j += 1) {
            const e = doc.order[j];
            assert.ok(e >= 0, 'only lines of the file as read');
            assert.deepEqual(fresh.bytes.subarray(fresh.start[j], fresh.end[j]), m.bytes.subarray(m.start[e], m.end[e]), `line ${j + 1}'s bytes`);
            assert.equal(fresh.term[j], m.term[e], `line ${j + 1}'s ending`);
          }
          checked += 1;
        }
      }
    }
    assert.ok(checked > 150, `${checked} moves written`);
  });
});

describe('in the page (ui.js), read as text', () => {
  const ui = fs.readFileSync(path.join(h.ROOT, 'ui.js'), 'utf8');
  const between = (text, a, b) => {
    const from = text.indexOf(a);
    assert.ok(from >= 0, `"${a}" is in ui.js`);
    const to = text.indexOf(b, from + a.length);
    assert.ok(to >= 0, `"${b}" follows it`);
    return text.slice(from, to);
  };

  it('the keys: ⌥↑ and ⌥↓ alone, before the handler returns on a modifier, with Edit on and with the default stopped; with Edit off nothing is done', () => {
    const handler = between(ui, "document.addEventListener('keydown', (e) => {", '  // Dragging (3.4a)');
    const branch = between(handler, "if (e.altKey && !mod && !e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {", 'if (mod || e.altKey || !state.m.n) return;');
    assert.ok(branch.includes('if (state.editing) {'), 'Edit on only');
    assert.ok(branch.includes('e.preventDefault();\n        moveSelected(key === \'ArrowUp\' ? -1 : 1);'), 'the default stopped, and one function that takes the direction');
    assert.ok(branch.trimEnd().endsWith('return;\n    }'), 'with Edit off the key goes no further, and does nothing');
    assert.ok(handler.indexOf("if (drag) {") < handler.indexOf(branch) && handler.indexOf('if (state.edit) {') < handler.indexOf(branch), 'not while a drag is in hand or a line is typed');
  });

  it('one function moves the selected block by a direction, for a key and, later, a button: the place and the words are core.js\'s', () => {
    const fn = between(ui, 'function moveSelected(dir) {', '\n  }\n');
    assert.ok(fn.includes('!state.editing') && fn.includes('state.pick') && fn.includes('state.sel < 0'), 'Edit on, and a line selected');
    assert.ok(fn.includes('if (state.edit && !commitEdit(false)) return;'), 'a line being typed is kept first, as for Delete');
    assert.ok(fn.includes('const end = blockEnd(from);') && fn.includes('C.neighbourLanding(state.doc, from, end, dir)'));
    assert.ok(fn.includes("notice(r.reason, 'error');"), 'a refusal in core.js\'s words');
    assert.ok(fn.includes("const by = dir < 0 ? 'up' : 'down';") && fn.includes('moveBlock(from, end, r.to, by);'), 'the key it came by goes with it, for the problem report');
  });

  it('a press on a row and a key take the same block, and finish the same way', () => {
    assert.ok(ui.includes('const blockEnd = (i) => C.subtreeEnd(state.m, i);'));
    assert.ok(ui.includes('if (v >= 0) { from = v; end = blockEnd(v); }'), 'a press on a row takes the block blockEnd gives');
    assert.equal(ui.split('C.subtreeEnd(state.m, v)').length - 1, 0, 'no second version of it');
    const up = between(ui, "$('grid').addEventListener('pointerup', (e) => {", "$('grid').addEventListener('pointercancel'");
    assert.ok(up.includes("moveBlock(from, end, to, 'drag');") && !up.includes('C.moveLines'), 'a drag lets go through moveBlock');
    const fn = between(ui, 'function moveBlock(from, end, to, by) {', '\n  }\n');
    assert.ok(fn.includes('C.moveLines(state.doc, from, end, to)') && fn.includes("acted({ what: 'act', label: r.step.label, by }, t0, to < from ? to : to - (end - from));"));
  });

  it('the page asks core.js for the types and the places, and holds no second copy of the words', () => {
    assert.ok(!ui.includes('function sectionsOf('), 'sectionsOf is core.js\'s');
    assert.equal(ui.split('C.sectionsOf(').length - 1, 2);
    const drag = between(ui, 'function startDrag(d) {', 'const ownSection');
    assert.ok(drag.includes('C.keepBunched(state.doc, d.from, l.at, !!d.section)') && drag.includes('notice(C.NOWHERE_ELSE'));
    assert.ok(!ui.includes('nowhere else to go'), 'the sentence is in core.js alone');
  });
});
