// save.js (BUILD-BRIEF section 10): the dated name, the Changes text, Save in the order of 10.2
// over in-memory handles and a Save dialog that empties the file picked in it, as Chromium's does
// (tests/fake-handles.js), the download in a browser with no pickers, and the phase-5 walk's saving
// steps, every step but the person's clicks in the computer's dialog.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../core.js');
const save = require('../save.js');
const h = require('./helpers.js');
const { FakeDir, saveDialog } = require('./fake-handles.js');

const hash = async (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const AT = new Date(2026, 9, 8, 15, 12, 0);
const LATER = new Date(2026, 9, 8, 16, 5, 0);
const NAME = 'Fixture_Family.ged';
const COPY = 'Fixture_Family.2026-10-08T151200.ged';

// A folder holding a written file under `name`, the document opened from it, and the original as
// the page knows it: its name and its handle.
function setUp(file = 'family.ged', name = NAME) {
  const bytes = h.bytesOfFile(path.join(h.SYNTHETIC, file));
  const dir = new FakeDir('folder');
  const handle = dir.put(name, bytes);
  const doc = core.openDocument(bytes);
  return { dir, doc, bytes, original: { name, handle } };
}

const text = (bytes) => Buffer.from(bytes).toString('utf8');
const history = (doc) => ({ order: doc.order.slice(), done: doc.done.slice(), undone: doc.undone.slice() });

describe('the name (10.1)', () => {
  it('<stem>.<timestamp><ext>, the extension kept as written', () => {
    assert.equal(save.datedName(NAME, AT), COPY);
    assert.equal(save.datedName('FIXTURE.GED', AT), 'FIXTURE.2026-10-08T151200.GED');
    assert.equal(save.datedName('Fixture.cleaned.ged', AT), 'Fixture.cleaned.2026-10-08T151200.ged', '.cleaned stays in the stem');
    assert.equal(save.datedName('fixture.gedcom', AT), 'fixture.2026-10-08T151200.gedcom');
    assert.equal(save.datedName('fixture.txt', AT), 'fixture.txt.2026-10-08T151200', 'a name with neither extension is all stem');
    assert.equal(save.datedName('.ged', AT), '.ged.2026-10-08T151200', 'a name that is only an extension is all stem');
  });

  it('a stem that already ends in a timestamp has it replaced, not stacked', () => {
    assert.equal(save.datedName('family.2026-10-08T151200.ged', LATER), 'family.2026-10-08T160500.ged');
    assert.equal(save.datedName('family.2026-10-08T151200.GEDCOM', LATER), 'family.2026-10-08T160500.GEDCOM');
    assert.equal(save.datedName('family.2026-09-28T154200-2.ged', LATER), 'family.2026-10-08T160500.ged', 'a -2 from before 0.5.6 goes with it');
    assert.equal(save.datedName('family.2026-10-08T151200.cleaned.ged', LATER), 'family.2026-10-08T151200.cleaned.2026-10-08T160500.ged',
      'a timestamp that does not end the stem stays');
    assert.equal(save.datedName('family-2026-10-08T151200.ged', LATER), 'family-2026-10-08T151200.2026-10-08T160500.ged', 'only after a dot');
  });

  it('the timestamp is local time; the Changes text\'s time has its offset from UTC', () => {
    assert.equal(save.timestamp(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02T030405');
    const off = -AT.getTimezoneOffset();
    const sign = off < 0 ? '-' : '+';
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
    const mm = String(Math.abs(off) % 60).padStart(2, '0');
    assert.equal(save.localTime(AT), `2026-10-08T15:12:00${sign}${hh}:${mm}`);
  });
});

describe('the Changes text (10.3)', () => {
  const original = (doc, bytes) => ({ sha256: h.sha256(bytes), bytes: bytes.length, lines: doc.m.n });

  it('the original by its name, sha256, size and lines; then each run: its place in the original, then now, its record, and its lines', () => {
    const { doc, bytes } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');             // @I42@
    core.deleteLine(doc, 29);                                         // 1 CHIL @I42@ in @F1@, and its _FREL
    core.applyStamps(doc, AT, 'Fixed a name.');
    assert.equal(save.changesText({ when: AT, file: NAME, original: original(doc, bytes), runs: core.changeRuns(doc) }), [
      `GEDCOM Viewer  changes to Fixture_Family.ged  as of ${save.localTime(AT)}`,
      `original  sha256 ${h.sha256(bytes)}  465 bytes  37 lines`,
      'changed  17 -> 17        @I42@ INDI',
      '  - 1 NAME Jane /Fixture/',
      '  + 1 NAME Jane /Fixtures/',
      'added             23-26  @I42@ INDI  (change stamp)',
      '  + 1 CHAN',
      '  + 2 DATE 8 OCT 2026',
      '  + 3 TIME 15:12:00',
      '  + 2 NOTE Fixed a name.',
      'removed  30-31           @F1@ FAM',
      '  - 1 CHIL @I42@',
      '  - 2 _FREL Natural',
      'added             34-37  @F1@ FAM  (change stamp)',
      '  + 1 CHAN',
      '  + 2 DATE 8 OCT 2026',
      '  + 3 TIME 15:12:00',
      '  + 2 NOTE Fixed a name.',
      ''].join('\n'));
  });

  it('a move names what moved and how many lines, never their text; a line that gained an ending says so', () => {
    const { doc, bytes } = setUp();
    core.moveLines(doc, 15, 22, 7);                                   // @I42@ before @I1@
    const moved = save.changesText({ when: AT, file: NAME, original: original(doc, bytes), runs: core.changeRuns(doc) }).split('\n');
    assert.deepEqual(moved.slice(2), ['moved    16-22 -> 8-14  @I42@ INDI  (7 lines)', '']);
    assert.ok(!moved.some((l) => l.includes('Jane')), 'no line of what moved');
    const end = setUp('no-final-newline.ged');
    core.addSibling(end.doc, 7, '0 @N1@ NOTE after the end');
    const lines = save.changesText({ when: AT, file: NAME, original: original(end.doc, end.bytes), runs: core.changeRuns(end.doc) }).split('\n');
    assert.deepEqual(lines.slice(2), ['changed  8 -> 8  TRLR', '  - 0 TRLR', '  + 0 TRLR', '    line ending: none -> LF',
      'added         9  @N1@ NOTE', '  + 0 @N1@ NOTE after the end', '']);
  });

  it('no change: the two lines about the original, and nothing under them', () => {
    const { doc, bytes } = setUp();
    assert.equal(save.changesText({ when: AT, file: NAME, original: original(doc, bytes), runs: core.changeRuns(doc) }),
      `GEDCOM Viewer  changes to Fixture_Family.ged  as of ${save.localTime(AT)}\noriginal  sha256 ${h.sha256(bytes)}  465 bytes  37 lines\n`);
  });
});

describe('Save (10.2)', () => {
  it('in order: nothing written before the dialog but a read of the original; the dated name offered; the copy written and read back; the original untouched', async () => {
    const { dir, doc, bytes, original } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const pick = saveDialog(dir);
    const r = await save.save({ doc, original, when: AT, note: '', stamps: true, hash, pick });
    assert.ok(r.done, r.say);
    assert.deepEqual(pick.offered, [COPY]);
    assert.deepEqual(dir.journal, [`read ${NAME}`, `create ${COPY}`, `write ${COPY}`, `read ${COPY}`]);
    assert.equal(r.name, COPY);
    assert.deepEqual(dir.at(COPY).bytes, core.saveBytes(doc), 'the copy is the document, stamps and all');
    assert.equal(r.sha256, await hash(dir.at(COPY).bytes));
    assert.deepEqual(dir.at(NAME).bytes, bytes, 'the original is never written');
    assert.ok(text(dir.at(COPY).bytes).includes('1 NAME Jane /Fixtures/\n1 SEX F\n1 BIRT\n2 DATE 1 JAN 1900\n1 FAMC @F1@\n1 FAMS @F2@\n1 CHAN\n2 DATE 8 OCT 2026\n3 TIME 15:12:00\n2 NOTE Changed: NAME\n'));
    assert.ok(!text(dir.at(COPY).bytes).includes('Last updated'), 'the header\'s date only when it is asked for');
    // 8: the copy is the last copy; the page stays on the original
    assert.equal(core.changedSinceCopy(doc), false, 'the dot goes, and Save turns off');
    assert.equal(core.isChanged(doc), true, 'the changes are still counted from the original');
    assert.deepEqual(core.changeRuns(doc).map((run) => [run.kind, run.stamp]), [['changed', false], ['added', true]]);
  });

  it('nothing to save, the lines being the original\'s, the last copy\'s or an earlier copy\'s: says which, writes nothing, asks nothing', async () => {
    const { dir, doc, original } = setUp();
    const pick = saveDialog(dir);
    let r = await save.save({ doc, original, when: AT, note: '', stamps: true, hash, pick });
    assert.deepEqual([r.done, r.step, r.say], [false, 1, 'Nothing has changed since the file was opened. Nothing was written.']);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.ok((await save.save({ doc, original, when: AT, note: '', stamps: true, hash, pick })).done);
    dir.journal.length = 0;
    r = await save.save({ doc, original, when: LATER, note: '', stamps: true, hash, pick });
    assert.deepEqual([r.done, r.step, r.say], [false, 1, 'Nothing has changed since the last copy. Nothing was written.']);
    core.editLine(doc, 23, '1 NAME Joe /Fixtures/');
    assert.ok((await save.save({ doc, original, when: LATER, note: '', stamps: false, hash, pick })).done);
    core.undo(doc);                                                   // Joe's edit: back to the first copy's lines
    r = await save.save({ doc, original, when: LATER, note: '', stamps: true, hash, pick });
    assert.deepEqual([r.step, r.say], [1, 'These lines are already in an earlier copy. Nothing was written.']);
    core.undo(doc);
    core.undo(doc);                                                   // the stamps, then the edit: the original
    r = await save.save({ doc, original, when: LATER, note: '', stamps: false, hash, pick });
    assert.deepEqual([r.step, r.say], [1, 'Nothing has changed since the file was opened. Nothing was written.'], 'so no copy of the original\'s bytes');
    assert.equal(pick.offered.length, 2, 'the Save dialog was asked only for the two copies');
  });

  it('the date in the header: in the copy\'s HEAD when asked for, with the stamps\' moment; taken back with them when nothing is written', async () => {
    const { dir, doc, bytes, original } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    let r = await save.save({ doc, original, when: AT, note: '', stamps: true, header: true, hash, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    const lines = text(dir.at(r.name).bytes).split('\n');
    assert.deepEqual(lines.slice(0, 7), ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 SUBM @U1@', '1 NOTE Last updated: 8 OCT 2026 15:12:00', '0 @U1@ SUBM']);
    assert.ok(lines.includes('3 TIME 15:12:00'));
    const doc2 = setUp().doc;
    core.editLine(doc2, 16, '1 NAME Jane /Fixtures/');
    const before = { order: doc2.order.slice(), done: doc2.done.slice(), undone: doc2.undone.slice() };
    r = await save.save({ doc: doc2, original, when: AT, note: '', stamps: true, header: true, hash, pick: saveDialog(dir, null) });
    assert.equal(r.step, 5);
    assert.deepEqual({ order: doc2.order, done: doc2.done, undone: doc2.undone }, before, 'cancelled: the stamps and the header\'s date taken back, together');
    r = await save.save({ doc: doc2, original, when: AT, note: '', stamps: false, header: true, hash, pick: null });
    assert.ok(text(r.bytes).includes('1 NOTE Last updated: 8 OCT 2026 15:12:00\n') && !text(r.bytes).includes('1 CHAN'), 'the header\'s date without the stamps, downloaded');
    assert.deepEqual(dir.at(NAME).bytes, bytes, 'the original as it was');
  });

  it('the original picked: refused at step 6 in the brief\'s words; the browser emptied it, and it is put back byte for byte, saying nothing of it; no copy; the stamps taken back', async () => {
    const { dir, doc, bytes, original } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const before = history(doc);
    const r = await save.save({ doc, original, when: AT, note: '', stamps: true, hash, pick: saveDialog(dir, NAME) });
    assert.deepEqual([r.done, r.step, r.original], [false, 6, true]);
    assert.equal(r.say, 'That is the original. It is unchanged. Pick another name.');
    assert.deepEqual(dir.journal, [`read ${NAME}`, `empty ${NAME}`, `read ${NAME}`, `write ${NAME}`, `read ${NAME}`],
      'read whole before the dialog; emptied by it; put back; read back');
    assert.equal(await hash(dir.at(NAME).bytes), h.sha256(bytes), 'the original, byte for byte');
    assert.deepEqual(dir.names(), [NAME], 'no copy written');
    assert.deepEqual(history(doc), before, 'the stamps taken back: the lines, the history and Redo as they were');
    assert.equal(core.changedSinceCopy(doc), true, 'the change is still to save');
  });

  it('the original picked, in a browser that leaves the file as it is: refused in the same words, and nothing written at all', async () => {
    const { dir, doc, bytes, original } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await save.save({ doc, original, when: AT, note: '', stamps: true, hash, pick: saveDialog(dir, NAME, { empties: false }) });
    assert.deepEqual([r.step, r.say], [6, 'That is the original. It is unchanged. Pick another name.']);
    assert.ok(!dir.journal.some((j) => j.startsWith('write')), 'not one write');
    assert.deepEqual(dir.at(NAME).bytes, bytes);
  });

  it('the original changed from outside since it was opened, then picked: put back as it was just before the dialog, the outside change kept', async () => {
    const { dir, doc, original } = setUp();
    const outside = new Uint8Array([...dir.at(NAME).bytes, ...Buffer.from('0 NOTE changed from outside\n')]);
    dir.at(NAME).bytes = outside;
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await save.save({ doc, original, when: AT, note: '', stamps: false, hash, pick: saveDialog(dir, NAME) });
    assert.equal(r.step, 6);
    assert.deepEqual(dir.at(NAME).bytes, outside);
  });

  it('the original picked, emptied, and it cannot be put back: said loudly, with its bytes as they were, to download', async () => {
    const { dir, doc, bytes, original } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    dir.at(NAME).fail = 'open';
    const r = await save.save({ doc, original, when: AT, note: '', stamps: true, hash, pick: saveDialog(dir, NAME) });
    assert.deepEqual([r.step, r.loud, r.original], [6, true, true]);
    assert.equal(r.say, 'That is the original. Your browser emptied it and it could not be restored. Download it as it was and put it back.');
    assert.deepEqual(r.restore, bytes);
    assert.equal(core.changedSinceCopy(doc), true);
  });

  it('a file opened with no handle is held to the original\'s name', async () => {
    const { dir, doc, bytes } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await save.save({ doc, original: { name: NAME, handle: null }, when: AT, note: '', stamps: false, hash, pick: saveDialog(dir, NAME) });
    assert.equal(r.step, 6);
    assert.equal(await hash(dir.at(NAME).bytes), h.sha256(bytes), 'put back from the bytes as they were opened');
  });

  it('Cancel in the Save dialog: "No copy was written."; the stamps taken back; nothing written', async () => {
    const { dir, doc, bytes, original } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    core.editLine(doc, 23, '1 NAME Joe /Fixtures/');
    core.undo(doc);                                                   // Redo holds Joe's edit
    const before = history(doc);
    const pick = saveDialog(dir, null);
    const r = await save.save({ doc, original, when: AT, note: 'never written', stamps: true, hash, pick });
    assert.deepEqual([r.done, r.step, r.say, r.cancelled], [false, 5, 'No copy was written.', true]);
    assert.deepEqual(pick.offered, [COPY]);
    assert.deepEqual(history(doc), before, 'the lines, the history and Redo as they were');
    assert.deepEqual(dir.names(), [NAME]);
    assert.deepEqual(dir.at(NAME).bytes, bytes);
  });

  for (const how of ['garble', 'close', 'open']) {
    it(`a copy that does not read back as written (${how}): said loudly, the file named, the original untouched, the stamps taken back`, async () => {
      const { dir, doc, bytes, original } = setUp();
      core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
      dir.failNew = how;
      const before = history(doc);
      const r = await save.save({ doc, original, when: AT, note: '', stamps: true, hash, pick: saveDialog(dir) });
      assert.deepEqual([r.done, r.step, r.loud], [false, 7, true]);
      assert.match(r.say, how === 'garble'
        ? /^The copy, Fixture_Family\.2026-10-08T151200\.ged, did not read back as it was written: do not rely on it\. The original, Fixture_Family\.ged, is as it was\.$/
        : /^The copy, Fixture_Family\.2026-10-08T151200\.ged, could not be written \(\w+: .*\)\. The original, Fixture_Family\.ged, is as it was\.$/);
      assert.deepEqual(dir.at(NAME).bytes, bytes);
      assert.deepEqual(history(doc), before);
      assert.equal(core.changedSinceCopy(doc), true, 'no copy: the change is still to save');
    });
  }

  it('the stamps unticked: none added, and the note goes nowhere, so it is not even read; ticked, a note the file cannot hold stops the save at step 3', async () => {
    const ascii = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR ASCII\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 TRLR\n';
    const dir = new FakeDir('folder');
    const handle = dir.put('ascii.ged', Buffer.from(ascii));
    const doc = core.openDocument(new Uint8Array(Buffer.from(ascii)));
    core.editLine(doc, 5, '1 NAME Jane /Fixtures/');
    let r = await save.save({ doc, original: { name: 'ascii.ged', handle }, when: AT, note: 'café', stamps: true, hash, pick: saveDialog(dir) });
    assert.deepEqual([r.step, dir.journal], [3, []]);
    assert.match(r.say, /is not ASCII/);
    r = await save.save({ doc, original: { name: 'ascii.ged', handle }, when: AT, note: 'café', stamps: false, hash, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    assert.equal(text(dir.at(r.name).bytes), ascii.replace('/Fixture/', '/Fixtures/'), 'no stamp, and no note');
  });

  it('a copy of a copy: the dated name of the copy opened, its timestamp replaced', async () => {
    const { dir, doc, original } = setUp('family.ged', COPY);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const pick = saveDialog(dir);
    const r = await save.save({ doc, original, when: LATER, note: '', stamps: false, hash, pick });
    assert.deepEqual(pick.offered, ['Fixture_Family.2026-10-08T160500.ged']);
    assert.equal(r.name, 'Fixture_Family.2026-10-08T160500.ged');
  });

  it('a browser with no pickers: steps 1 to 4, then the bytes to download under the dated name; nothing read or written; the download is the last copy', async () => {
    const { dir, doc, bytes, original } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await save.save({ doc, original: { name: original.name, handle: null }, when: AT, note: 'By hand.', stamps: true, hash, pick: null });
    assert.deepEqual([r.done, r.download, r.name], [true, true, COPY]);
    assert.deepEqual(r.bytes, core.saveBytes(doc));
    assert.ok(text(r.bytes).includes('2 NOTE By hand.\n'), 'stamped');
    assert.equal(r.sha256, await hash(r.bytes));
    assert.deepEqual(dir.journal, []);
    assert.deepEqual(dir.at(NAME).bytes, bytes);
    assert.equal(core.changedSinceCopy(doc), false, 'so leaving warns only for changes made since');
    core.editLine(doc, 8, '1 NAME Ada /Fixtures/');
    assert.equal(core.changedSinceCopy(doc), true);
  });
});

describe("the phase-5 walk's saving steps, every one but the person's clicks in the computer's Save dialog", () => {
  it('20 to 24, 33, 34 and 37: a dated copy with its stamp and the header\'s date; the original untouched; back to the original, nothing to save; the original refused; a change from outside left out; the outside line removed', async () => {
    const { dir, doc, bytes, original } = setUp();
    const sha = h.sha256(bytes);

    // 20: an edit; the dialog lists 1 change, the stamp @I42@ gains and the header's date, both ticked; Save; the dated name kept
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.equal(core.changeRuns(doc).length, 1);
    assert.deepEqual(core.stampPlan(doc, AT, '').map((p) => [p.id, p.how, p.lines.map((l) => l.text)]),
      [['@I42@', 'adds', ['1 CHAN', '2 DATE 8 OCT 2026', '3 TIME 15:12:00', '2 NOTE Changed: NAME']]]);
    assert.deepEqual(core.headerPlan(doc, AT).lines.map((l) => l.text), ['1 NOTE Last updated: 8 OCT 2026 15:12:00']);
    const pick = saveDialog(dir);
    let r = await save.save({ doc, original, when: AT, note: '', stamps: true, header: true, hash, pick });
    assert.ok(r.done, r.say);
    assert.equal(r.name, COPY);

    // 21: the record ends with the stamp; nothing changed since the copy; the changes still counted from the original
    const v = doc.view;
    const at = v.definedAt.get('@I42@')[0];
    assert.deepEqual(v.texts.slice(at + 7, at + 11), ['1 CHAN', '2 DATE 8 OCT 2026', '3 TIME 15:12:00', '2 NOTE Changed: NAME']);
    assert.equal(core.unsaved(doc), false);
    assert.equal(core.changeRuns(doc).length, 3, 'the header\'s date, the name, and the stamp: all changes from the original');

    // 22: the original is the file as opened; the copy differs
    assert.equal(await hash(dir.at(NAME).bytes), sha);
    assert.notEqual(await hash(dir.at(COPY).bytes), sha);

    // 23: the copy differs from the original in HEAD's last line and in that record alone; the Changes text names the original and lists them
    const m = doc.m;
    const head = m.start[5];                                         // where HEAD ends: 0 @U1@ SUBM
    const from = m.start[15];                                        // 0 @I42@ INDI
    const to = m.start[22];                                          // 0 @I43@ INDI
    const copy = dir.at(COPY).bytes;
    const dated = Buffer.from('1 NOTE Last updated: 8 OCT 2026 15:12:00\n');
    assert.deepEqual(copy.subarray(0, head), bytes.subarray(0, head));
    assert.deepEqual(copy.subarray(head, head + dated.length), new Uint8Array(dated));
    assert.deepEqual(copy.subarray(head + dated.length, head + dated.length + (from - head)), bytes.subarray(head, from));
    assert.deepEqual(copy.subarray(copy.length - (bytes.length - to)), bytes.subarray(to));
    const pasted = save.changesText({ when: AT, file: NAME, original: { sha256: sha, bytes: bytes.length, lines: m.n }, runs: core.changeRuns(doc) }).split('\n');
    assert.equal(pasted[0], `GEDCOM Viewer  changes to Fixture_Family.ged  as of ${save.localTime(AT)}`);
    assert.equal(pasted[1], `original  sha256 ${sha}  465 bytes  37 lines`);
    assert.deepEqual(pasted.slice(2, 13), ['added          6      HEAD  (the date in the header)', '  + 1 NOTE Last updated: 8 OCT 2026 15:12:00',
      'changed  17 -> 18     @I42@ INDI', '  - 1 NAME Jane /Fixture/', '  + 1 NAME Jane /Fixtures/',
      'added          24-27  @I42@ INDI  (change stamp)', '  + 1 CHAN', '  + 2 DATE 8 OCT 2026', '  + 3 TIME 15:12:00', '  + 2 NOTE Changed: NAME', '']);

    // 24: Undo twice (the stamp and the header's date, one step; then the edit): back to the original, there is nothing to save
    assert.equal(core.undo(doc).label, 'Change stamps and the date in the header');
    assert.equal(core.undo(doc).label, 'Edit line 17');
    assert.equal(core.isChanged(doc), false, 'no change from the original');
    assert.equal(core.unsaved(doc), false, 'so Save is off: no save writes the original\'s bytes again');
    r = await save.save({ doc, original, when: LATER, note: '', stamps: false, header: true, hash, pick });
    assert.deepEqual([r.step, r.say], [1, 'Nothing has changed since the file was opened. Nothing was written.']);
    assert.equal(pick.offered.length, 1);

    // 33: an edit, then the original's own name typed: refused, and the original as it was
    core.editLine(doc, 8, '1 NAME Ada /Fixtures/');
    r = await save.save({ doc, original, when: LATER, note: '', stamps: false, header: true, hash, pick: saveDialog(dir, NAME) });
    assert.equal(r.step, 6);
    assert.equal(await hash(dir.at(NAME).bytes), sha);
    assert.ok(!doc.view.texts.some((t) => /Last updated/.test(t)), 'the header\'s date taken back with the refusal');

    // 34: a line appended from outside; an edit; Save, the offered name: the copy is the page's lines, without the outside line
    dir.at(NAME).bytes = new Uint8Array([...dir.at(NAME).bytes, ...Buffer.from('0 NOTE changed from outside\n')]);
    r = await save.save({ doc, original, when: new Date(2026, 9, 8, 16, 30, 0), note: '', stamps: false, hash, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    assert.ok(text(dir.at(r.name).bytes).endsWith('0 TRLR\n'), 'the copy\'s last line is 0 TRLR');
    assert.ok(text(dir.at(NAME).bytes).endsWith('0 NOTE changed from outside\n'), 'the original keeps what was done to it from outside');

    // 36 and 37: the original opened again, one line more; that line removed; no stamp needed; with the header's date unticked, the copy's sha256 is the first one's
    const again = core.openDocument(dir.at(NAME).bytes.slice());
    assert.equal(again.m.n, 38);
    assert.ok(core.deleteLine(again, 37).ok);
    assert.deepEqual(core.stampPlan(again), [], 'no record to stamp');
    r = await save.save({ doc: again, original: { name: NAME, handle: dir.at(NAME) }, when: new Date(2026, 9, 8, 16, 45, 0), note: '', stamps: true, header: false, hash, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    assert.equal(await hash(dir.at(r.name).bytes), sha);
  });
});
