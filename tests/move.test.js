// 3.4a — a block, a record or a run of records moved among its siblings: what may move and where
// it may land, the fixed places refused, the net change's `moved` (9.4), what the log says, and
// which records a move stamps. Every move is held to a fresh read of the bytes it would save, and
// undone to the file's own sha256.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../core.js');
const save = require('../save.js');
const h = require('./helpers.js');

const open = (name) => core.openDocument(h.bytesOfFile(path.join(h.SYNTHETIC, name)));
const openText = (text) => core.openDocument(new Uint8Array(Buffer.from(text, 'utf8')));
const ok = (r) => { assert.ok(r.ok, r.reason); return r; };
const hash = (doc) => h.sha256(core.saveBytes(doc));
const texts = (doc) => doc.view.texts.slice();
const block = (doc, i) => [i, core.subtreeEnd(doc.view, i)];
const AT = new Date(2026, 8, 30, 10, 0, 0);

function sameAsFreshRead(doc) {
  const fresh = core.read(core.saveBytes(doc));
  assert.deepEqual(doc.view.texts, fresh.texts);
  assert.deepEqual(h.findingsOf(doc.view), h.findingsOf(fresh));
  assert.deepEqual(doc.view.labels, fresh.labels);
}

// The lines of the file the page is on (or of `base`) with the net change laid over them must be the
// lines now (see edit.test.js).
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

describe('a block moved among its siblings', () => {
  it("@I42@'s BIRT block before its NAME: every line keeps its parent and level; one moved run, in its record", () => {
    const doc = open('family.ged');
    const before = texts(doc);
    const [from, end] = block(doc, 18);                              // 1 BIRT and its 2 DATE (lines 19–20)
    assert.deepEqual([from, end], [18, 20]);
    const r = ok(core.moveLines(doc, from, end, 16));                // before 1 NAME (line 17)
    assert.equal(r.step.label, 'Move lines 19–20 to 17');
    assert.deepEqual(texts(doc).slice(15, 22), ['0 @I42@ INDI', '1 BIRT', '2 DATE 1 JAN 1900', '1 NAME Jane /Fixture/', '1 SEX F', '1 FAMC @F1@', '1 FAMS @F2@']);
    assert.deepEqual(doc.order.slice(15, 22), [15, 18, 19, 16, 17, 20, 21], 'the same original lines, in a new order');
    sameAsFreshRead(doc);
    const items = core.netChange(doc);
    assert.deepEqual(items, [
      { kind: 'moved', before: 18, after: 16, at: 20, changed: false },
      { kind: 'moved', before: 19, after: 17, at: 20, changed: false },
    ]);
    assert.deepEqual(replayed(doc, items), texts(doc));
    const runs = core.changeRuns(doc, items);
    assert.equal(runs.length, 1);
    assert.deepEqual([runs[0].kind, runs[0].before + 1, runs[0].after + 1, runs[0].at + 1, runs[0].lines.length], ['moved', 19, 17, 21, 2]);
    assert.deepEqual(runs[0].record, { id: '@I42@', tag: 'INDI', key: 'now 15' });
    assert.deepEqual(runs[0].moved, { what: 'block', tag: 'BIRT', records: 0, sameKind: 0 });
    assert.deepEqual(runs[0].lines, [{ was: null, now: null }, { was: null, now: null }], 'never the lines\' text');
    const marks = core.lineMarks(doc, items);
    assert.deepEqual([marks.status[16], marks.status[17], marks.movedFrom[20]], [3, 3, 1]);
    assert.deepEqual(core.stampTargets(doc).map((x) => doc.view.xref[doc.view.records[x]]), ['@I42@'], 'a record whose own lines were reordered is stamped');
    assert.equal(core.saveBytes(doc).length, doc.m.bytes.length, 'the same bytes, in a new order');
    assert.notEqual(hash(doc), h.sha256(doc.m.bytes));
    core.undo(doc);
    assert.deepEqual(texts(doc), before);
    assert.equal(hash(doc), h.sha256(doc.m.bytes), 'one undo, and the file is itself again');
    assert.deepEqual(core.netChange(doc), []);
  });

  it('moved back to exactly where it was, it is no change at all; and a move to where it is makes no step', () => {
    const doc = open('family.ged');
    ok(core.moveLines(doc, 18, 20, 16));
    ok(core.moveLines(doc, 16, 18, 20));                             // back: before 1 FAMC, where 1 BIRT was
    assert.deepEqual(core.netChange(doc), []);
    assert.equal(core.isChanged(doc), false);
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
    assert.equal(ok(core.moveLines(doc, 18, 20, 18)).step, null, 'to its own start');
    assert.equal(ok(core.moveLines(doc, 18, 20, 20)).step, null, 'to its own end');
    assert.equal(doc.done.length, 2);
  });

  it('a moved line then edited is moved and changed, in its new place', () => {
    const doc = open('family.ged');
    ok(core.moveLines(doc, 18, 20, 16));
    ok(core.editLine(doc, 17, '2 DATE 2 JAN 1900'));
    const items = core.netChange(doc);
    assert.deepEqual(items.map((it) => [it.kind, it.before, it.after, it.changed]), [['moved', 18, 16, false], ['moved', 19, 17, true]]);
    const runs = core.changeRuns(doc, items);
    assert.deepEqual(runs.map((r) => [r.kind, r.after + 1, r.lines.length]), [['moved', 17, 2], ['changed', 18, 1]]);
    assert.deepEqual(runs[1].lines, [{ was: '1 DATE 1 JAN 1900'.replace('1 DATE', '2 DATE'), now: '2 DATE 2 JAN 1900' }]);
    assert.equal(core.lineMarks(doc, items).status[17], 1, 'shown as changed');
    assert.deepEqual(replayed(doc, items), texts(doc));
    sameAsFreshRead(doc);
  });

  it('two lines of one tag under one parent: which is first is which is preferred, and the run says so', () => {
    const doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n2 GIVN Jane\n1 NAME Janie /Fixture/\n1 SEX F\n0 TRLR\n');
    ok(core.moveLines(doc, 7, 8, 5));                                // the second NAME before the first
    assert.deepEqual(texts(doc).slice(4, 9), ['0 @I1@ INDI', '1 NAME Janie /Fixture/', '1 NAME Jane /Fixture/', '2 GIVN Jane', '1 SEX F']);
    const run = core.changeRuns(doc)[0];
    assert.deepEqual(run.moved, { what: 'block', tag: 'NAME', records: 0, sameKind: 2 });
    assert.equal(save.movedWords(run), 'NAME · 1 line · among its 2 NAME lines the first is read as preferred');
    assert.equal(doc.view.labels[1], 'Janie /Fixture/', 'the label follows the first NAME');
  });

  it('a line whose bytes could not be read (E8) moves with its block, its bytes as they were', () => {
    const doc = open('e8-bad-bytes.ged');
    const m = doc.m;
    assert.equal(m.bad[8], 1);
    ok(core.moveLines(doc, 8, 9, 7));                                // the second NOTE before the first
    const out = core.saveBytes(doc);
    const line = m.bytes.subarray(m.start[8], m.end[8]);
    assert.deepEqual(out.subarray(m.start[7], m.start[7] + line.length), line, 'the unreadable line, byte for byte, where the first NOTE was');
    assert.equal(out.length, m.bytes.length);
    assert.deepEqual(h.findingsOf(doc.view).E8, [8, 9], 'both unreadable lines still are');
    sameAsFreshRead(doc);
    core.undo(doc);
    assert.equal(hash(doc), h.sha256(m.bytes));
  });
});

describe('a record, and a section, moved whole', () => {
  it('@I42@ before @I1@: one moved run, the record; no stamp; the ids and pointers as they were', () => {
    const doc = open('family.ged');
    const r = ok(core.moveLines(doc, 15, 22, 7));
    assert.equal(r.step.label, 'Move lines 16–22 to 8');
    assert.equal(doc.view.texts[7], '0 @I42@ INDI');
    assert.equal(doc.view.texts[14], '0 @I1@ INDI');
    const runs = core.changeRuns(doc);
    assert.equal(runs.length, 1);
    assert.deepEqual([runs[0].kind, runs[0].before + 1, runs[0].after + 1, runs[0].lines.length], ['moved', 16, 8, 7]);
    assert.deepEqual(runs[0].moved, { what: 'record', tag: 'INDI', records: 1, sameKind: 0 });
    assert.deepEqual(runs[0].record, { id: '@I42@', tag: 'INDI', key: 'now 7' });
    assert.equal(save.movedWords(runs[0]), 'record · 7 lines');
    assert.deepEqual(core.stampTargets(doc), [], 'a record moved whole is not stamped');
    assert.equal(core.applyStamps(doc, AT, '').step, null);
    assert.deepEqual([...doc.view.pointedBy.get('@I42@')].map((i) => doc.view.texts[i]), ['1 CHIL @I42@', '1 WIFE @I42@']);
    assert.equal(doc.view.findings.byCode.E7.length, 0);
    sameAsFreshRead(doc);
  });

  it('the FAM section before the INDI section: the same bytes in a new order; one entry; no stamp; the Changes text names it', async () => {
    const doc = open('family.ged');
    const bytes = doc.m.bytes;
    ok(core.moveLines(doc, 26, 36, 7));                              // @F1@ and @F2@ (lines 27–36) before @I1@ (line 8)
    const out = core.saveBytes(doc);
    assert.equal(out.length, bytes.length);
    assert.notEqual(h.sha256(out), h.sha256(bytes));
    const sortedLines = (b) => Buffer.from(b).toString('utf8').split('\n').sort();
    assert.deepEqual(sortedLines(out), sortedLines(bytes), 'every line is there, once');
    assert.deepEqual(doc.view.records.map((i) => doc.view.tag[i]), ['HEAD', 'SUBM', 'FAM', 'FAM', 'INDI', 'INDI', 'INDI', 'INDI', 'TRLR']);
    const runs = core.changeRuns(doc);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].moved, { what: 'section', tag: 'FAM', records: 2, sameKind: 0 });
    assert.equal(runs[0].record, null);
    assert.equal(save.movedWords(runs[0]), 'section FAM · 2 records · 10 lines');
    assert.deepEqual(core.stampTargets(doc), []);
    const text = save.changesText({ when: AT, file: 'Fixture_Family.ged', original: { sha256: 'a', bytes: 1, lines: 37 }, runs }).split('\n');
    assert.deepEqual(text.slice(2), ['moved    27-36 -> 8-17  (section FAM, 2 records, 10 lines)', '']);
    sameAsFreshRead(doc);
    core.undo(doc);
    assert.equal(hash(doc), h.sha256(bytes));
  });

  it('a move stands in the history like any act: undo and redo, and a copy written makes it no change since the copy', () => {
    const doc = open('family.ged');
    ok(core.moveLines(doc, 22, 26, 7));                              // @I43@ first
    ok(core.moveLines(doc, 26, 31, 7));                              // then @F1@ first of all
    const after = texts(doc);
    core.undo(doc);
    core.undo(doc);
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
    core.redo(doc);
    core.redo(doc);
    assert.deepEqual(texts(doc), after);
    core.moveOntoCopy(doc);
    assert.deepEqual(core.netChange(doc), [], 'the page is on the copy (D1): nothing moved since it');
    ok(core.moveLines(doc, 7, 12, 31));                              // @F1@ back to before @F2@
    assert.deepEqual(core.changeRuns(doc).map((r) => [r.kind, r.moved.what]), [['moved', 'record']], 'against the copy, one record moved');
  });
});

describe('what may not move, and where nothing lands', () => {
  it('HEAD stays first, TRLR last, and below version 7 the submitter record directly after HEAD', () => {
    const doc = open('family.ged');
    assert.equal(core.moveRefusal(doc, 0, 5, 7), 'HEAD stays first.');
    assert.equal(core.moveRefusal(doc, 7, 11, 0), 'HEAD stays first.');
    assert.equal(core.moveRefusal(doc, 5, 7, 7), 'The submitter record stays directly after HEAD, below GEDCOM 7.');
    assert.equal(core.moveRefusal(doc, 7, 11, 5), 'The submitter record stays directly after HEAD, below GEDCOM 7.');
    assert.equal(core.moveRefusal(doc, 7, 11, 2), 'A block lands only at the edge of a sibling: between two lines that sit under the same line as it does.', 'inside HEAD is no edge at all');
    assert.equal(core.moveRefusal(doc, 36, 37, 7), 'TRLR stays last.');
    assert.equal(core.moveRefusal(doc, 7, 11, 37), 'TRLR stays last.');
    assert.equal(core.moveRefusal(doc, 7, 11, 36), null, 'before TRLR is the last place a record may land');
    assert.deepEqual(core.landings(doc, 15, 22).at, [7, 11, 26, 31, 36], 'where @I42@ may land: before each other record but HEAD and SUBM, and before TRLR');
    assert.deepEqual(core.landings(doc, 5, 7), { reason: 'The submitter record stays directly after HEAD, below GEDCOM 7.', at: [] });
    const v7 = openText('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @U1@ SUBM\n1 NAME Walk /Fixture/\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 TRLR\n');
    assert.equal(core.moveRefusal(v7, 3, 5, 7), null, 'in version 7 the submitter record moves like any record');
    assert.deepEqual(core.landings(v7, 5, 7).at, [3]);
  });

  it('a CONC or CONT line never moves alone; nothing lands between a line and its CONC lines; nothing leaves a line to be continued', () => {
    const n1 = open('n1-line-breaks.ged');
    assert.match(core.moveRefusal(n1, 8, 9, 7), /^Line 9 is a CONC line, part of its line's value/);
    assert.match(core.moveRefusal(n1, 9, 10, 8), /^Line 10 is a CONC line/);
    assert.deepEqual(core.landings(n1, 6, 7).at, [10], 'the NAME may land only after the NOTE and its CONC lines');
    const doc = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NOTE a note,\n2 CONC continued\n2 DATE 1900\n2 CONT and on\n1 SEX F\n0 TRLR\n');
    assert.match(core.moveRefusal(doc, 5, 6, 4), /^Line 7 is a CONT line, and would then continue another line/, 'the DATE between a CONC and a CONT cannot move at all');
    assert.deepEqual(core.landings(doc, 5, 6).at, []);
    const two = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NOTE a note,\n2 CONC continued\n2 DATE 1900\n2 PLAC Fixtureville\n1 SEX F\n0 TRLR\n');
    assert.equal(core.moveRefusal(two, 6, 7, 4), 'Nothing lands between a line and its CONC lines.');
    assert.deepEqual(core.landings(two, 6, 7).at, [5], 'the PLAC may go before the DATE, and nowhere else');
    assert.equal(core.moveRefusal(two, 5, 7, 4), 'Nothing lands between a line and its CONC lines.');
    const first = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NOTE a note,\n2 DATE 1900\n2 CONC continued\n1 SEX F\n0 TRLR\n');
    assert.match(core.moveRefusal(first, 4, 5, 6), /^Line 6 is a CONC line, and would then continue another line/);
  });

  it('whole sibling blocks only, at a sibling\'s edge only; a line that did not parse moves only inside its block', () => {
    const doc = open('family.ged');
    const edge = 'A block lands only at the edge of a sibling: between two lines that sit under the same line as it does.';
    assert.equal(core.moveRefusal(doc, 18, 19, 16), 'Lines 19–19 are not whole blocks under one line.', 'a BIRT without its DATE');
    assert.equal(core.moveRefusal(doc, 16, 19, 21), 'Lines 17–19 are not whole blocks under one line.', 'NAME, SEX and half of BIRT');
    assert.equal(core.moveRefusal(doc, 16, 22, 7), edge, "@I42@'s lines are whole blocks, but line 8 is under nothing, not under @I42@");
    assert.equal(core.moveRefusal(doc, 16, 17, 19), edge, 'inside the BIRT block');
    assert.equal(core.moveRefusal(doc, 16, 17, 27), edge, 'inside another record');
    assert.deepEqual(core.landings(doc, 16, 17).at, [18, 20, 21, 22], 'the NAME may go before SEX… no: before BIRT, FAMC, FAMS, or last');
    assert.equal(core.moveRefusal(doc, 15, 22, 18), 'A block cannot land inside itself.');
    assert.equal(core.moveRefusal(doc, 16, 18, 17), 'A block cannot land inside itself.');
    assert.match(core.moveRefusal(doc, 40, 41, 0), /^There are no lines/);
    const e1 = open('e1-no-level.ged');
    const bad = e1.view.texts.findIndex((t) => !/^\d/.test(t));
    assert.match(core.moveRefusal(e1, bad, bad + 1, 0), /did not parse: it moves only with the block it sits in/);
    assert.equal(doc.done.length + e1.done.length, 0, 'nothing refused made a step');
  });

  it('a move that would join two line endings into one is refused, like any act (I11)', () => {
    // an empty line (E5) first under @I1@, ending LF; a SEX line ending CR: moved before the empty
    // line, its CR and the LF would read back as one CR LF, and the empty line would be gone
    const doc = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n\n1 SEX F\r1 NOTE x\n0 TRLR\n');
    assert.equal(doc.view.n, 7);
    assert.deepEqual(h.findingsOf(doc.view).E5, [4]);
    assert.deepEqual(core.landings(doc, 4, 5).at, [3, 6], 'before the empty line, or last');
    const r = core.moveLines(doc, 4, 5, 3);
    assert.equal(r.ok, false);
    assert.match(r.reason, /The empty line at line 5 would not read back as a line: its line ending would join the one above it/);
    assert.equal(doc.done.length, 0, 'refused, and undone at once');
    assert.equal(hash(doc), h.sha256(doc.m.bytes));
    ok(core.moveLines(doc, 5, 6, 3));                                // 1 NOTE x (ending LF) before the empty line: fine
    assert.deepEqual(texts(doc).slice(3, 6), ['1 NOTE x', '', '1 SEX F']);
    sameAsFreshRead(doc);
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

// Moves at random over a file, with edits, deletes and undos among them: each move goes to one
// of the places `landings` offers, and after each act the view is what a fresh read of the bytes
// gives and the net change replays to the lines. Then all of it undone: the file, byte for byte.
function moveAtRandom(file, count, seed) {
  const bytes = h.bytesOfFile(file);
  const doc = core.openDocument(bytes);
  const rnd = prng(seed);
  let moved = 0;
  for (let k = 0; k < count; k += 1) {
    const n = doc.order.length;
    if (!n) { core.undo(doc); continue; }
    const pos = Math.floor(rnd() * n);
    const roll = rnd();
    let r;
    if (roll < 0.6) {
      let end = core.subtreeEnd(doc.view, pos);
      if (rnd() < 0.3) {                                             // a run of sibling blocks
        const extra = core.subtreeEnd(doc.view, end);
        if (extra > end && end < doc.view.n && doc.view.level[end] === doc.view.level[pos]) end = extra;
      }
      const l = core.landings(doc, pos, end);
      if (l.reason) {
        assert.match(l.reason, /./);
        assert.equal(core.moveLines(doc, pos, end, 0).ok, false, 'what cannot move is refused');
        continue;
      }
      if (!l.at.length) continue;
      const to = l.at[Math.floor(rnd() * l.at.length)];
      r = core.moveLines(doc, pos, end, to);
      if (r.ok && r.step) moved += 1;
    } else if (roll < 0.7) r = core.editLine(doc, pos, `${Math.max(doc.view.level[pos], 0)} NOTE edited ${k}`);
    else if (roll < 0.78) r = core.deleteLine(doc, pos);
    else if (roll < 0.86) r = core.addChild(doc, pos, `${doc.view.level[pos] + 1} NOTE child ${k}`);
    else if (roll < 0.94) r = { ok: true, step: core.undo(doc) };
    else if (roll < 0.97) r = core.applyStamps(doc, AT, `stamp ${k}`);
    else { core.moveOntoCopy(doc); r = { ok: true, step: null }; }
    if (!r.ok) {
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
      continue;
    }
    sameAsFreshRead(doc);
    const items = core.netChange(doc);
    assert.deepEqual(replayed(doc, items), doc.view.texts, `net change from the file the page is on after act ${k}`);
    const opened = core.netChange(doc, doc.openedOrder);
    assert.deepEqual(replayed(doc, opened, doc.openedOrder), doc.view.texts, `net change from the file first opened after act ${k}`);
    core.changeRuns(doc, opened, doc.openedOrder);
    core.changeRuns(doc, items);
    core.lineMarks(doc, items);
    core.stampTargets(doc, items);
  }
  while (doc.done.length) core.undo(doc);
  assert.equal(h.sha256(core.saveBytes(doc)), h.sha256(bytes), `${path.basename(file)}: everything undone`);
  return moved;
}

describe('moves at random, each checked against a fresh read and undone to the file\'s own sha256', () => {
  it('over every written file', () => {
    let moved = 0;
    for (const file of h.gedFiles(h.SYNTHETIC)) for (const seed of [1, 2, 3]) moved += moveAtRandom(file, 50, seed);
    assert.ok(moved > 50, `${moved} moves made`);
  });

  it('over every public test file', { skip: h.NO_CORPORA }, () => {
    for (const file of h.gedFiles(h.CORPORA)) moveAtRandom(file, 15, 11);
  });
});
