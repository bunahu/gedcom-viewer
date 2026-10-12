// Removed lines restored (9.4) after the lines around them have changed: a block moved (3.4a), by a
// drag or by ⌥↑ and ⌥↓, or lines added beside them. The beta-readiness review of 2026-10-12 found
// that Restore put a line back where its block had been taken from, in another block or another
// person, in 0.6.3 and 0.6.4 alike. A removed line goes back into its own block, under the line it
// sat under, wherever that block now is, and no other line comes to sit under it; the page draws it
// struck through in that place first; when no place keeps it so, Restore refuses and says why.
// Every restore is held to a fresh read of the bytes it would save, and undone and redone exactly.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../core.js');
const h = require('./helpers.js');

const openText = (text) => core.openDocument(new Uint8Array(Buffer.from(text, 'utf8')));
const ok = (r) => { assert.ok(r.ok, r.reason); return r; };
const texts = (doc) => doc.view.texts.slice();
const removedRuns = (doc) => core.changeRuns(doc).filter((r) => r.kind === 'removed');
const restoreRun = (doc, run) => core.restoreLines(doc, run.before, run.lines.length);
const AT = new Date(2026, 9, 12, 16, 0, 0);

function sameAsFreshRead(doc) {
  const fresh = core.read(core.saveBytes(doc));
  assert.deepEqual(doc.view.texts, fresh.texts);
  assert.deepEqual(h.findingsOf(doc.view), h.findingsOf(fresh));
  assert.deepEqual(doc.view.labels, fresh.labels);
}

// A person with two facts, each with a date and a place.
const PERSON = '0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Ada /L/\n1 BIRT\n2 DATE 1900\n2 PLAC Here\n1 DEAT\n2 DATE 1980\n2 PLAC There\n0 TRLR\n';
// Three people and a family; @I1@ is the wife.
const PEOPLE = '0 HEAD\n1 CHAR UTF-8\n0 @I0@ INDI\n1 NAME Cy /K/\n0 @I1@ INDI\n1 NAME Ada /L/\n1 FAMS @F1@\n0 @I2@ INDI\n1 NAME Bob /S/\n1 SEX M\n0 @F1@ FAM\n1 WIFE @I1@\n0 TRLR\n';

describe('a line removed from a block that then moved goes back into that block', () => {
  it('a fact\'s place, its fact dragged below the next fact: drawn and put back after the fact\'s date, not under NAME where the fact was', () => {
    const doc = openText(PERSON);
    ok(core.deleteLine(doc, 6));                                     // 2 PLAC Here, under 1 BIRT
    const to = core.landings(doc, 4, 6).at.filter((x) => x > 6)[0];  // 1 BIRT and its 2 DATE, dragged below 1 DEAT's block
    ok(core.moveLines(doc, 4, 6, to));
    assert.deepEqual(texts(doc), ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Ada /L/', '1 DEAT', '2 DATE 1980', '2 PLAC There',
      '1 BIRT', '2 DATE 1900', '0 TRLR']);
    const [run] = removedRuns(doc);
    assert.deepEqual([run.at, run.record.id], [9, '@I1@'], 'struck through after 2 DATE 1900, in its block');
    assert.equal(core.lineMarks(doc).removedAt[9], 1);
    const r = ok(restoreRun(doc, run));
    assert.equal(r.step.label, 'Restore a line');
    const back = ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Ada /L/', '1 DEAT', '2 DATE 1980', '2 PLAC There',
      '1 BIRT', '2 DATE 1900', '2 PLAC Here', '0 TRLR'];
    assert.deepEqual(texts(doc), back);
    sameAsFreshRead(doc);
    assert.deepEqual(core.changeRuns(doc).map((x) => [x.kind, x.lines.length, x.moved.what]), [['moved', 3, 'block']],
      'nothing is left removed: two facts of three lines each have changed places');
    core.undo(doc);
    assert.deepEqual(removedRuns(doc).map((x) => x.at), [9], 'Undo: removed again, and drawn in the same place');
    core.redo(doc);
    assert.deepEqual(texts(doc), back, 'Redo: back in its block');
    sameAsFreshRead(doc);
  });

  it('the same by ⌥↑: a place removed from DEAT, DEAT pressed above BIRT, goes back under DEAT, not under BIRT', () => {
    const doc = openText(PERSON);
    ok(core.deleteLine(doc, 9));                                     // 2 PLAC There, under 1 DEAT
    const key = core.neighbourLanding(doc, 7, 9, -1);
    assert.deepEqual(key, { ok: true, to: 4 });
    ok(core.moveLines(doc, 7, 9, key.to));
    const [run] = removedRuns(doc);
    assert.equal(run.at, 6, 'struck through after 2 DATE 1980, in DEAT\'s block');
    ok(restoreRun(doc, run));
    assert.deepEqual(texts(doc), ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Ada /L/', '1 DEAT', '2 DATE 1980', '2 PLAC There',
      '1 BIRT', '2 DATE 1900', '2 PLAC Here', '0 TRLR']);
    sameAsFreshRead(doc);
    core.undo(doc);
    core.redo(doc);
    assert.equal(texts(doc)[6], '2 PLAC There');
  });

  it('and by ⌥↑ the other way: BIRT pressed above NAME takes its removed place with it', () => {
    const doc = openText(PERSON);
    ok(core.deleteLine(doc, 6));
    ok(core.moveLines(doc, 4, 6, core.neighbourLanding(doc, 4, 6, -1).to));
    ok(restoreRun(doc, removedRuns(doc)[0]));
    assert.deepEqual(texts(doc).slice(2, 7), ['0 @I1@ INDI', '1 BIRT', '2 DATE 1900', '2 PLAC Here', '1 NAME Ada /L/']);
    sameAsFreshRead(doc);
  });

  it('a line removed from a person who then moved, by ⌥↓: FAMS goes back into @I1@, not into @I0@ above where @I1@ was', () => {
    const doc = openText(PEOPLE);
    ok(core.deleteLine(doc, 6));                                     // 1 FAMS @F1@, in @I1@
    const key = core.neighbourLanding(doc, 4, 6, 1);
    assert.deepEqual(key, { ok: true, to: 9 });
    ok(core.moveLines(doc, 4, 6, key.to));                           // @I1@ below @I2@
    const [run] = removedRuns(doc);
    assert.deepEqual([run.at, run.record.id], [9, '@I1@']);
    ok(restoreRun(doc, run));
    const back = ['0 HEAD', '1 CHAR UTF-8', '0 @I0@ INDI', '1 NAME Cy /K/', '0 @I2@ INDI', '1 NAME Bob /S/', '1 SEX M',
      '0 @I1@ INDI', '1 NAME Ada /L/', '1 FAMS @F1@', '0 @F1@ FAM', '1 WIFE @I1@', '0 TRLR'];
    assert.deepEqual(texts(doc), back);
    sameAsFreshRead(doc);
    assert.deepEqual(core.changeRuns(doc).map((x) => [x.kind, x.lines.length, x.moved.what]), [['moved', 3, 'record']],
      'nothing is left removed: two people of three lines each have changed places');
    core.undo(doc);
    assert.deepEqual(removedRuns(doc).map((x) => x.at), [9]);
    core.redo(doc);
    assert.deepEqual(texts(doc), back);
  });

  it('the same by a drag: @I1@ dragged above @I0@ takes its removed FAMS with it', () => {
    const doc = openText(PEOPLE);
    ok(core.deleteLine(doc, 6));
    assert.ok(core.landings(doc, 4, 6).at.includes(2));
    ok(core.moveLines(doc, 4, 6, 2));
    const [run] = removedRuns(doc);
    assert.equal(run.at, 4, 'after 1 NAME Ada /L/, the end of @I1@');
    ok(restoreRun(doc, run));
    assert.deepEqual(texts(doc).slice(2, 7), ['0 @I1@ INDI', '1 NAME Ada /L/', '1 FAMS @F1@', '0 @I0@ INDI', '1 NAME Cy /K/']);
    sameAsFreshRead(doc);
  });

  it('a whole record goes back after the record it followed, wherever that is now, and stays whole', () => {
    const doc = openText(PEOPLE);
    ok(core.deleteLine(doc, 7));                                     // @I2@, three lines
    ok(core.moveLines(doc, 4, 7, core.neighbourLanding(doc, 4, 7, -1).to));   // @I1@ above @I0@
    const [run] = removedRuns(doc);
    assert.deepEqual([run.lines.length, run.at], [3, 5]);
    ok(restoreRun(doc, run));
    assert.deepEqual(texts(doc).slice(2, 12), ['0 @I1@ INDI', '1 NAME Ada /L/', '1 FAMS @F1@', '0 @I2@ INDI', '1 NAME Bob /S/', '1 SEX M',
      '0 @I0@ INDI', '1 NAME Cy /K/', '0 @F1@ FAM', '1 WIFE @I1@']);
    sameAsFreshRead(doc);
  });

  it('lines added at the end of the fact before it stay under that fact: the restored fact goes after them', () => {
    const doc = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 BIRT\n2 DATE 1900\n1 DEAT\n2 DATE 1980\n0 TRLR\n');
    ok(core.deleteLine(doc, 5));                                     // 1 DEAT and its date
    ok(core.addSibling(doc, 4, '2 PLAC Here'));                      // under 1 BIRT, after its date
    const [run] = removedRuns(doc);
    assert.equal(run.at, 6, 'after 2 PLAC Here, which would otherwise come to sit under DEAT');
    ok(restoreRun(doc, run));
    assert.deepEqual(texts(doc), ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 BIRT', '2 DATE 1900', '2 PLAC Here', '1 DEAT', '2 DATE 1980', '0 TRLR']);
    assert.deepEqual(core.changeRuns(doc).map((x) => [x.kind, x.lines[0].now]), [['added', '2 PLAC Here']], 'only the added line is left to save');
    sameAsFreshRead(doc);
  });
});

describe('when no place keeps a removed line under its own line, Restore says why and does nothing', () => {
  it('the line it sat under is gone: restore that one first, and then it goes back under it', () => {
    const doc = openText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 BIRT\n2 DATE 1900\n2 PLAC Here\n0 TRLR\n');
    ok(core.deleteLine(doc, 5));                                     // 2 PLAC Here
    ok(core.editLine(doc, 4, '1 DATE 1900'));                        // the date, now beside BIRT
    ok(core.deleteLine(doc, 3));                                     // 1 BIRT, nothing under it now
    const runs = removedRuns(doc);
    assert.deepEqual(runs.map((x) => x.lines[0].was), ['1 BIRT', '2 PLAC Here']);
    const steps = doc.done.length;
    const r = restoreRun(doc, runs[1]);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'This line sat under 1 BIRT, which is no longer in the file: restore that line first.');
    assert.equal(doc.done.length, steps, 'no step');
    ok(restoreRun(doc, runs[0]));
    ok(restoreRun(doc, removedRuns(doc)[0]));
    assert.deepEqual(texts(doc), ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 BIRT', '2 PLAC Here', '1 DATE 1900', '0 TRLR'],
      'under 1 BIRT again; the edited date, beside BIRT now, stays where it is');
    sameAsFreshRead(doc);
  });

  it('two removals side by side, with a line added between their places since: no one place keeps both, so it says so', () => {
    const doc = openText('0 HEAD\n1 CHAR UTF-8\n0 @S1@ SOUR\n1 TITL Book\n0 @I1@ INDI\n1 BIRT\n2 SOUR @S1@\n3 PAGE 12\n1 DEAT\n0 TRLR\n');
    ok(core.deleteLine(doc, 7));                                     // 3 PAGE 12
    ok(core.deleteLine(doc, 7));                                     // 1 DEAT: the two lines are one run now
    ok(core.addSibling(doc, 6, '2 NOTE n'));                         // under BIRT, after the citation
    const [run] = removedRuns(doc);
    assert.deepEqual(run.lines.map((l) => l.was), ['3 PAGE 12', '1 DEAT']);
    const r = restoreRun(doc, run);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'These lines cannot be put back under 2 SOUR @S1@, the line they sat under: the lines around that place have changed.');
    core.undo(doc);                                                  // the added note taken back
    ok(restoreRun(doc, removedRuns(doc)[0]));
    assert.equal(h.sha256(core.saveBytes(doc)), h.sha256(doc.m.bytes), 'the file as it was');
  });

  it('the header\'s date under the header\'s own NOTE, both removed: the date waits for its NOTE', () => {
    const doc = openText('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 NOTE Exported for the family\n1 SUBM @U1@\n0 @U1@ SUBM\n1 NAME Jane /Fixture/\n0 @I1@ INDI\n1 NAME Ada /Fixture/\n0 TRLR\n');
    ok(core.editLine(doc, 9, '1 NAME Ada /Fixtures/'));
    ok(core.saveActs(doc, AT, { stamps: false, typed: '', header: true }));
    assert.equal(texts(doc)[5], '2 CONT Last updated: 12 OCT 2026 16:00:00');
    core.moveOntoCopy(doc);
    ok(core.deleteLine(doc, 4));                                     // the NOTE and the date under it
    const runs = removedRuns(doc);
    assert.deepEqual(runs.map((x) => [x.lines[0].was, x.header]), [['1 NOTE Exported for the family', false],
      ['2 CONT Last updated: 12 OCT 2026 16:00:00', true]], 'two runs: one written by hand, one as the header\'s date');
    const r = restoreRun(doc, runs[1]);
    assert.equal(r.reason, 'This line sat under 1 NOTE Exported for the family, which is no longer in the file: restore that line first.');
    ok(restoreRun(doc, runs[0]));
    ok(restoreRun(doc, removedRuns(doc)[0]));
    assert.deepEqual(core.netChange(doc), [], 'the copy\'s lines, as they were');
  });
});

// A small seeded generator (mulberry32), as move.test.js has it, so a failure can be run again.
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

// The line each line of `list` sits under, by lineage (null for none; a line that did not parse is
// left out, since it sits in whatever it sits in).
const lineage = (doc, e) => (e >= 0 ? e : doc.added[-e - 1].lineage);
function parentsByLineage(doc, list) {
  const out = new Map();
  const open = [];
  for (const e of list) {
    const lv = core.lineShape(core.textOf(doc, e)).level;
    if (lv < 0) continue;
    while (open.length && open[open.length - 1].lv >= lv) open.pop();
    out.set(lineage(doc, e), open.length ? open[open.length - 1].l : null);
    open.push({ lv, l: lineage(doc, e) });
  }
  return out;
}

// Acts at random over a file (deletes, drags, ⌥↑ and ⌥↓, lines added and edited, Undo and Redo),
// then every removed run restored, in random order: each restore puts its lines where the page drew
// them, each under the line it sat under as saved, and every other line under its own; a fresh read
// gives what the page shows; Undo then Redo gives the same lines. Or it is refused, saying why.
function restoreAtRandom(file, seed) {
  const doc = core.openDocument(h.bytesOfFile(file));
  const rnd = prng(seed);
  const pick = (n) => Math.floor(rnd() * n);
  let moves = 0;
  for (let k = 0, acts = 2 + pick(12); k < acts && doc.order.length; k += 1) {
    const pos = pick(doc.order.length);
    const end = core.subtreeEnd(doc.view, pos);
    const lv = doc.view.level[pos];
    const roll = rnd();
    let r = null;
    if (roll < 0.35) r = core.deleteLine(doc, pos);
    else if (roll < 0.6) {
      const at = core.landings(doc, pos, end).at;
      if (at.length) r = core.moveLines(doc, pos, end, at[pick(at.length)]);
    } else if (roll < 0.75) {
      const key = core.neighbourLanding(doc, pos, end, rnd() < 0.5 ? -1 : 1);
      if (key.ok) r = core.moveLines(doc, pos, end, key.to);
    } else if (roll < 0.85) {
      if (lv >= 0) r = rnd() < 0.5 ? core.addChild(doc, pos, `${lv + 1} NOTE child ${k}`) : core.addSibling(doc, pos, `${lv} NOTE after ${k}`);
    } else if (roll < 0.92) {
      if (lv >= 0 && core.editRefusal(doc, pos) === null) r = core.editLine(doc, pos, `${doc.view.texts[pos]} x`);
    } else if (roll < 0.96) core.undo(doc);
    else core.redo(doc);
    if (r && r.ok && r.step && /^Move/.test(r.step.label)) moves += 1;
  }
  let restores = 0;
  for (let guard = 0; guard < 40; guard += 1) {
    const runs = removedRuns(doc);
    if (!runs.length) break;
    const run = runs[pick(runs.length)];
    const S = doc.savedOrder;
    const was = parentsByLineage(doc, S);
    const before = parentsByLineage(doc, doc.order);
    const r = restoreRun(doc, run);
    if (!r.ok) {
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'a refusal says why');
      break;
    }
    restores += 1;
    const name = `${path.basename(file)}, seed ${seed}, ${run.lines[0].was}`;
    for (let k = 0; k < run.lines.length; k += 1) assert.equal(doc.order[run.at + k], S[run.before + k], `${name}: where the page drew it`);
    const back = new Set(run.lines.map((_, k) => lineage(doc, S[run.before + k])));
    for (const [l, p] of parentsByLineage(doc, doc.order)) {
      if (back.has(l)) assert.equal(p, was.get(l), `${name}: a restored line under the line it sat under`);
      else assert.equal(p, before.get(l), `${name}: every other line under its own`);
    }
    sameAsFreshRead(doc);
    const lines = texts(doc);
    core.undo(doc);
    core.redo(doc);
    assert.deepEqual(texts(doc), lines, `${name}: Undo, then Redo`);
  }
  return { restores, moves };
}

describe('restores at random after moves, adds and edits: each line under its own, the page\'s place kept', () => {
  it('over every written file', () => {
    let restores = 0;
    let moves = 0;
    for (const file of h.gedFiles(h.SYNTHETIC)) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const n = restoreAtRandom(file, seed);
        restores += n.restores;
        moves += n.moves;
      }
    }
    assert.ok(restores > 200 && moves > 100, `${restores} restores, ${moves} moves`);
  });

  it('over every public test file', { skip: h.NO_CORPORA }, () => {
    for (const file of h.gedFiles(h.CORPORA)) restoreAtRandom(file, 5);
  });
});
