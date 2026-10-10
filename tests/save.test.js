// save.js (BUILD-BRIEF section 10): the dated name, the Changes text, Save in the order of 10.2
// over in-memory handles and a Save dialog that empties the file picked in it, as Chromium's does
// (tests/fake-handles.js), the download in a browser with no pickers, the page moving onto each
// copy it writes (P11's D1), and the phase-5 walk's saving steps, every step but the person's clicks
// in the computer's dialog.
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
const COPY2 = 'Fixture_Family.2026-10-08T160500.ged';

// The page's part around save.js, as ui.js plays it: the file it is on, and every file of the visit,
// each with its handle and its bytes as the page knows them; after a copy, the page is on it (D1).
function pageOn(doc, name, handle) {
  const page = { file: { name, handle }, visit: [{ name, handle, bytes: () => doc.m.bytes }] };
  page.save = async (opts) => {
    const r = await save.save({ doc, file: page.file, visit: page.visit, hash, ...opts });
    if (r.done) {
      const lines = doc.savedOrder;
      page.file = { name: r.name, handle: r.handle };
      page.visit.push({ name: r.name, handle: r.handle, bytes: () => core.saveBytes(doc, undefined, lines) });
    }
    return r;
  };
  return page;
}

// A folder holding a written file under `name`, the document opened from it, and the page on it.
function setUp(file = 'family.ged', name = NAME) {
  const bytes = h.bytesOfFile(path.join(h.SYNTHETIC, file));
  const dir = new FakeDir('folder');
  const handle = dir.put(name, bytes);
  const doc = core.openDocument(bytes);
  return { dir, doc, bytes, page: pageOn(doc, name, handle) };
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
  const opened = (doc, bytes) => ({ sha256: h.sha256(bytes), bytes: bytes.length, lines: doc.m.n });

  it('the file by its name; the file the changes count from by its name, sha256, size and lines; then each run: its place in that file, then now, its record, and its lines', () => {
    const { doc, bytes } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');             // @I42@
    core.deleteLine(doc, 29);                                         // 1 CHIL @I42@ in @F1@, and its _FREL
    core.applyStamps(doc, AT, 'Fixed a name.');
    assert.equal(save.changesText({ when: AT, file: NAME, from: opened(doc, bytes), runs: core.changeRuns(doc) }), [
      `GEDCOM Viewer  changes to Fixture_Family.ged  as of ${save.localTime(AT)}`,
      `from  Fixture_Family.ged  sha256 ${h.sha256(bytes)}  465 bytes  37 lines`,
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
    const moved = save.changesText({ when: AT, file: NAME, from: opened(doc, bytes), runs: core.changeRuns(doc) }).split('\n');
    assert.deepEqual(moved.slice(2), ['moved    16-22 -> 8-14  @I42@ INDI  (7 lines)', '']);
    assert.ok(!moved.some((l) => l.includes('Jane')), 'no line of what moved');
    const end = setUp('no-final-newline.ged');
    core.addSibling(end.doc, 7, '0 @N1@ NOTE after the end');
    const lines = save.changesText({ when: AT, file: NAME, from: opened(end.doc, end.bytes), runs: core.changeRuns(end.doc) }).split('\n');
    assert.deepEqual(lines.slice(2), ['changed  8 -> 8  TRLR', '  - 0 TRLR', '  + 0 TRLR', '    line ending: none -> LF',
      'added         9  @N1@ NOTE', '  + 0 @N1@ NOTE after the end', '']);
  });

  it('no change: the two lines about the file, and nothing under them', () => {
    const { doc, bytes } = setUp();
    assert.equal(save.changesText({ when: AT, file: NAME, from: opened(doc, bytes), runs: core.changeRuns(doc) }),
      `GEDCOM Viewer  changes to Fixture_Family.ged  as of ${save.localTime(AT)}\nfrom  Fixture_Family.ged  sha256 ${h.sha256(bytes)}  465 bytes  37 lines\n`);
  });
});

describe('Save (10.2)', () => {
  it('in order: nothing written before the dialog but a read of the original; the dated name offered; the copy written and read back; the original untouched; the page on the copy', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const pick = saveDialog(dir);
    const r = await page.save({ when: AT, note: '', stamps: true, pick });
    assert.ok(r.done, r.say);
    assert.deepEqual(pick.offered, [COPY]);
    assert.deepEqual(dir.journal, [`read ${NAME}`, `create ${COPY}`, `write ${COPY}`, `read ${COPY}`]);
    assert.equal(r.name, COPY);
    assert.equal(r.handle, dir.at(COPY), 'the copy\'s handle, for the page to be on');
    assert.equal(r.size, dir.at(COPY).bytes.length);
    assert.deepEqual(dir.at(COPY).bytes, core.saveBytes(doc), 'the copy is the document, stamps and all');
    assert.equal(r.sha256, await hash(dir.at(COPY).bytes));
    assert.deepEqual(dir.at(NAME).bytes, bytes, 'the original is never written');
    assert.ok(text(dir.at(COPY).bytes).includes('1 NAME Jane /Fixtures/\n1 SEX F\n1 BIRT\n2 DATE 1 JAN 1900\n1 FAMC @F1@\n1 FAMS @F2@\n1 CHAN\n2 DATE 8 OCT 2026\n3 TIME 15:12:00\n2 NOTE Changed: NAME\n'));
    assert.ok(!text(dir.at(COPY).bytes).includes('Last updated'), 'the header\'s date only when it is asked for');
    // 8: the page is on the copy (D1): its bytes are what the changes count from
    assert.deepEqual(core.saveBytes(doc, undefined, doc.savedOrder), dir.at(COPY).bytes, 'the copy\'s bytes are the baseline');
    assert.equal(core.isChanged(doc), false, 'Changes reads 0, and the dots go');
    assert.equal(core.unsaved(doc), false, 'the dot goes, and Save turns off');
    assert.deepEqual(core.changeRuns(doc), []);
    assert.deepEqual(core.changeRuns(doc, null, doc.openedOrder).map((run) => [run.kind, run.stamp]), [['changed', false], ['added', true]],
      'from the file first opened, the edit and the stamp');
  });

  it('nothing to save, the lines being the original\'s, the last copy\'s or an earlier copy\'s: says which, writes nothing, asks nothing', async () => {
    const { dir, doc, page } = setUp();
    const pick = saveDialog(dir);
    let r = await page.save({ when: AT, note: '', stamps: true, pick });
    assert.deepEqual([r.done, r.step, r.say], [false, 1, 'Nothing has changed since the file was opened. Nothing was written.']);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.ok((await page.save({ when: AT, note: '', stamps: true, pick })).done);
    dir.journal.length = 0;
    r = await page.save({ when: LATER, note: '', stamps: true, pick });
    assert.deepEqual([r.done, r.step, r.say], [false, 1, 'Nothing has changed since the last copy. Nothing was written.']);
    core.editLine(doc, doc.view.definedAt.get('@I43@')[0] + 1, '1 NAME Joe /Fixtures/');
    assert.ok((await page.save({ when: LATER, note: '', stamps: false, pick })).done);
    core.undo(doc);                                                   // Joe's edit: back to the first copy's lines
    r = await page.save({ when: LATER, note: '', stamps: true, pick });
    assert.deepEqual([r.step, r.say], [1, 'These lines are already in an earlier copy. Nothing was written.']);
    core.undo(doc);
    core.undo(doc);                                                   // the stamps, then the edit: the original
    r = await page.save({ when: LATER, note: '', stamps: false, pick });
    assert.deepEqual([r.step, r.say], [1, 'These lines are already in the original. Nothing was written.'], 'so no copy of the original\'s bytes');
    assert.equal(pick.offered.length, 2, 'the Save dialog was asked only for the two copies');
  });

  it('the date in the header: in the copy\'s HEAD when asked for, with the stamps\' moment; taken back with them when nothing is written', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    let r = await page.save({ when: AT, note: '', stamps: true, header: true, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    const lines = text(dir.at(r.name).bytes).split('\n');
    assert.deepEqual(lines.slice(0, 7), ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 SUBM @U1@', '1 NOTE Last updated: 8 OCT 2026 15:12:00', '0 @U1@ SUBM']);
    assert.ok(lines.includes('3 TIME 15:12:00'));
    const doc2 = core.openDocument(bytes);                            // the same file opened again, in another tab
    const page2 = pageOn(doc2, NAME, dir.at(NAME));
    core.editLine(doc2, 16, '1 NAME Jane /Fixtures/');
    const before = { order: doc2.order.slice(), done: doc2.done.slice(), undone: doc2.undone.slice() };
    r = await page2.save({ when: AT, note: '', stamps: true, header: true, pick: saveDialog(dir, null) });
    assert.equal(r.step, 5);
    assert.deepEqual({ order: doc2.order, done: doc2.done, undone: doc2.undone }, before, 'cancelled: the stamps and the header\'s date taken back, together');
    r = await page2.save({ when: AT, note: '', stamps: false, header: true, pick: null });
    assert.ok(text(r.bytes).includes('1 NOTE Last updated: 8 OCT 2026 15:12:00\n') && !text(r.bytes).includes('1 CHAN'), 'the header\'s date without the stamps, downloaded');
    assert.deepEqual(dir.at(NAME).bytes, bytes, 'the original as it was');
  });

  it('the original picked: refused at step 6 in the brief\'s words; the browser emptied it, and it is put back byte for byte, saying nothing of it; no copy; the stamps taken back', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const before = history(doc);
    const r = await page.save({ when: AT, note: '', stamps: true, pick: saveDialog(dir, NAME) });
    assert.deepEqual([r.done, r.step, r.original], [false, 6, true]);
    assert.equal(r.say, 'That is the original. It is unchanged. Choose another name.');
    assert.deepEqual(dir.journal, [`read ${NAME}`, `empty ${NAME}`, `read ${NAME}`, `write ${NAME}`, `read ${NAME}`],
      'read whole before the dialog; emptied by it; put back; read back');
    assert.equal(await hash(dir.at(NAME).bytes), h.sha256(bytes), 'the original, byte for byte');
    assert.deepEqual(dir.names(), [NAME], 'no copy written');
    assert.deepEqual(history(doc), before, 'the stamps taken back: the lines, the history and Redo as they were');
    assert.equal(core.unsaved(doc), true, 'the change is still to save');
    assert.equal(page.file.name, NAME, 'the page is still on the original');
  });

  it('the original picked, in a browser that leaves the file as it is: refused in the same words, and nothing written at all', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await page.save({ when: AT, note: '', stamps: true, pick: saveDialog(dir, NAME, { empties: false }) });
    assert.deepEqual([r.step, r.say], [6, 'That is the original. It is unchanged. Choose another name.']);
    assert.ok(!dir.journal.some((j) => j.startsWith('write')), 'not one write');
    assert.deepEqual(dir.at(NAME).bytes, bytes);
  });

  it('the original changed from outside since it was opened, then picked: put back as it was just before the dialog, the outside change kept', async () => {
    const { dir, doc, page } = setUp();
    const outside = new Uint8Array([...dir.at(NAME).bytes, ...Buffer.from('0 NOTE changed from outside\n')]);
    dir.at(NAME).bytes = outside;
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await page.save({ when: AT, note: '', stamps: false, pick: saveDialog(dir, NAME) });
    assert.equal(r.step, 6);
    assert.deepEqual(dir.at(NAME).bytes, outside);
  });

  it('the original picked, emptied, and it cannot be put back: said loudly, with its bytes as they were, to download under its name', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    dir.at(NAME).fail = 'open';
    const r = await page.save({ when: AT, note: '', stamps: true, pick: saveDialog(dir, NAME) });
    assert.deepEqual([r.step, r.loud, r.original], [6, true, true]);
    assert.equal(r.say, 'That is the original. Your browser emptied it and it could not be restored. Download it as it was and put it back.');
    assert.deepEqual(r.restore, bytes);
    assert.equal(r.restoreName, NAME);
    assert.equal(core.unsaved(doc), true);
  });

  it('a file opened with no handle is held to its name', async () => {
    const { dir, doc, bytes } = setUp();
    const page = pageOn(doc, NAME, null);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await page.save({ when: AT, note: '', stamps: false, pick: saveDialog(dir, NAME) });
    assert.equal(r.step, 6);
    assert.equal(await hash(dir.at(NAME).bytes), h.sha256(bytes), 'put back from the bytes as they were opened');
  });

  it('Cancel in the Save dialog: "No copy was written."; the stamps taken back; nothing written', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    core.editLine(doc, 23, '1 NAME Joe /Fixtures/');
    core.undo(doc);                                                   // Redo holds Joe's edit
    const before = history(doc);
    const pick = saveDialog(dir, null);
    const r = await page.save({ when: AT, note: 'never written', stamps: true, pick });
    assert.deepEqual([r.done, r.step, r.say, r.cancelled], [false, 5, 'No copy was written.', true]);
    assert.deepEqual(pick.offered, [COPY]);
    assert.deepEqual(history(doc), before, 'the lines, the history and Redo as they were');
    assert.deepEqual(dir.names(), [NAME]);
    assert.deepEqual(dir.at(NAME).bytes, bytes);
  });

  for (const how of ['garble', 'close', 'open']) {
    it(`a copy that does not read back as written (${how}): said loudly, the file named, the original untouched, the stamps taken back`, async () => {
      const { dir, doc, bytes, page } = setUp();
      core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
      dir.failNew = how;
      const before = history(doc);
      const r = await page.save({ when: AT, note: '', stamps: true, pick: saveDialog(dir) });
      assert.deepEqual([r.done, r.step, r.loud], [false, 7, true]);
      assert.match(r.say, how === 'garble'
        ? /^The copy, Fixture_Family\.2026-10-08T151200\.ged, did not read back as it was written: do not rely on it\. The original, Fixture_Family\.ged, is as it was\.$/
        : /^The copy, Fixture_Family\.2026-10-08T151200\.ged, could not be written \(\w+: .*\)\. The original, Fixture_Family\.ged, is as it was\.$/);
      assert.deepEqual(dir.at(NAME).bytes, bytes);
      assert.deepEqual(history(doc), before);
      assert.equal(core.unsaved(doc), true, 'no copy: the change is still to save');
      assert.equal(page.file.name, NAME, 'and the page is still on the original');
    });
  }

  it('the stamps unticked: none added, and the note goes nowhere, so it is not even read; ticked, a note the file cannot hold stops the save at step 3', async () => {
    const ascii = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR ASCII\n0 @I1@ INDI\n1 NAME Jane /Fixture/\n0 TRLR\n';
    const dir = new FakeDir('folder');
    const handle = dir.put('ascii.ged', Buffer.from(ascii));
    const doc = core.openDocument(new Uint8Array(Buffer.from(ascii)));
    const page = pageOn(doc, 'ascii.ged', handle);
    core.editLine(doc, 5, '1 NAME Jane /Fixtures/');
    let r = await page.save({ when: AT, note: 'café', stamps: true, pick: saveDialog(dir) });
    assert.deepEqual([r.step, dir.journal], [3, []]);
    assert.match(r.say, /is not ASCII/);
    r = await page.save({ when: AT, note: 'café', stamps: false, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    assert.equal(text(dir.at(r.name).bytes), ascii.replace('/Fixture/', '/Fixtures/'), 'no stamp, and no note');
  });

  it('a copy of a copy: the dated name of the copy opened, its timestamp replaced', async () => {
    const { dir, doc, page } = setUp('family.ged', COPY);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const pick = saveDialog(dir);
    const r = await page.save({ when: LATER, note: '', stamps: false, pick });
    assert.deepEqual(pick.offered, [COPY2]);
    assert.equal(r.name, COPY2);
  });

  it('a browser with no pickers: steps 1 to 4, then the bytes to download under the dated name; nothing read or written; the page is on the download, with no handle', async () => {
    const { dir, doc, bytes } = setUp();
    const page = pageOn(doc, NAME, null);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await page.save({ when: AT, note: 'By hand.', stamps: true, pick: null });
    assert.deepEqual([r.done, r.download, r.name, r.handle], [true, true, COPY, null]);
    assert.deepEqual(r.bytes, core.saveBytes(doc));
    assert.equal(r.size, r.bytes.length);
    assert.ok(text(r.bytes).includes('2 NOTE By hand.\n'), 'stamped');
    assert.equal(r.sha256, await hash(r.bytes));
    assert.deepEqual(dir.journal, []);
    assert.deepEqual(dir.at(NAME).bytes, bytes);
    assert.deepEqual([page.file.name, core.isChanged(doc), core.unsaved(doc)], [COPY, false, false], 'on the download: Changes 0, and leaving warns only for changes made since');
    core.editLine(doc, 8, '1 NAME Ada /Fixtures/');
    assert.equal(core.unsaved(doc), true);
    const again = await page.save({ when: LATER, note: '', stamps: false, pick: null });
    assert.equal(again.name, COPY2, 'the next download: the copy\'s stem, its timestamp replaced');
  });
});

describe('after a copy the page is on it (P11, D1)', () => {
  it('its name, handle and bytes: Changes count from it, a line typed back to its words is no change, an undo shows as a change from it and Redo brings its lines back; the next save offers its stem with the timestamp replaced', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.ok((await page.save({ when: AT, note: '', stamps: true, header: true, pick: saveDialog(dir) })).done);
    assert.deepEqual([page.file.name, page.file.handle], [COPY, dir.at(COPY)]);
    const copy = dir.at(COPY).bytes.slice();
    assert.deepEqual(core.saveBytes(doc, undefined, doc.savedOrder), copy, 'the baseline is the copy, byte for byte');
    assert.deepEqual(core.changeRuns(doc), []);
    // an undo after the save: the stamp and the header's date, taken out, are a change from the copy
    assert.equal(core.undo(doc).label, 'Change stamps and the date in the header');
    assert.deepEqual(core.changeRuns(doc).map((run) => [run.kind, run.stamp, run.header, run.lines.length]), [['removed', true, true, 1], ['removed', true, false, 4]]);
    assert.equal(core.unsaved(doc), true, 'lines no file holds: the edit without its stamp');
    core.redo(doc);
    assert.deepEqual(core.changeRuns(doc), [], 'Redo brings the copy\'s lines back');
    assert.deepEqual(core.saveBytes(doc), copy);
    // a line typed over, then back to its words in the copy: no change from it
    const at = doc.view.definedAt.get('@I42@')[0] + 1;
    core.editLine(doc, at, '1 NAME Jane /Fixturez/');
    core.editLine(doc, at, '1 NAME Jane /Fixtures/');
    assert.deepEqual([core.isChanged(doc), core.unsaved(doc)], [false, false]);
    // the next save: the copy's stem, its timestamp replaced; the page then on the second copy
    core.editLine(doc, at, '1 NAME Janet /Fixtures/');
    const pick = saveDialog(dir);
    dir.journal.length = 0;
    const r = await page.save({ when: LATER, note: '', stamps: true, header: true, pick });
    assert.ok(r.done, r.say);
    assert.deepEqual(pick.offered, [COPY2]);
    assert.deepEqual(dir.journal, [`read ${NAME}`, `read ${COPY}`, `create ${COPY2}`, `write ${COPY2}`, `read ${COPY2}`],
      'every file of the visit read whole before the dialog, nothing written but the new copy');
    assert.deepEqual([page.file.name, dir.at(NAME).bytes, dir.at(COPY).bytes], [COPY2, bytes, copy], 'the original and the first copy as they were');
    assert.deepEqual(core.changeRuns(doc), []);
  });

  it('every file of the visit is refused in the Save dialog, in the same words, and put back as it was: the original first opened, a copy, and the copy the page is on', async () => {
    const { dir, doc, bytes, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.ok((await page.save({ when: AT, note: '', stamps: true, pick: saveDialog(dir) })).done);
    core.editLine(doc, doc.view.definedAt.get('@I43@')[0] + 1, '1 NAME Joe /Fixtures/');
    assert.ok((await page.save({ when: LATER, note: '', stamps: true, pick: saveDialog(dir) })).done);
    const files = { [NAME]: bytes, [COPY]: dir.at(COPY).bytes.slice(), [COPY2]: dir.at(COPY2).bytes.slice() };
    core.editLine(doc, 8, '1 NAME Ada /Fixtures/');
    const before = history(doc);
    for (const name of [NAME, COPY, COPY2]) {
      dir.journal.length = 0;
      const r = await page.save({ when: new Date(2026, 9, 8, 17, 0, 0), note: '', stamps: true, header: true, pick: saveDialog(dir, name) });
      assert.deepEqual([r.step, r.say, r.original], [6, 'That is the original. It is unchanged. Choose another name.', true], name);
      assert.deepEqual(dir.journal, [`read ${NAME}`, `read ${COPY}`, `read ${COPY2}`, `empty ${name}`, `read ${name}`, `write ${name}`, `read ${name}`],
        `${name}: every file read before the dialog; this one emptied by it, put back and read back`);
      assert.deepEqual(dir.at(name).bytes, files[name], `${name}, byte for byte`);
      assert.deepEqual(history(doc), before, 'the stamps taken back');
      assert.equal(page.file.name, COPY2, 'the page still on the copy it was on');
    }
    assert.deepEqual(dir.names(), [COPY, COPY2, NAME].sort(), 'no file written beside them');
  });

  it('a copy of the visit picked whose read failed before the dialog is put back from its bytes as written', async () => {
    const { dir, doc, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.ok((await page.save({ when: AT, note: '', stamps: false, pick: saveDialog(dir) })).done);
    const copy = dir.at(COPY).bytes.slice();
    core.editLine(doc, 23, '1 NAME Joe /Fixtures/');
    const handle = dir.at(COPY);
    const getFile = handle.getFile;
    let reads = 0;
    handle.getFile = async function () { reads += 1; if (reads === 1) throw Object.assign(new Error('gone a moment'), { name: 'NotReadableError' }); return getFile.call(this); };
    const r = await page.save({ when: LATER, note: '', stamps: false, pick: saveDialog(dir, COPY) });
    assert.equal(r.step, 6);
    assert.deepEqual(dir.at(COPY).bytes, copy, 'put back from the bytes the page wrote it with');
  });

  it('the stamps and the header\'s date of this visit are set anew in the next copy, never doubled; a record\'s note names what the visit changed in it', async () => {
    const { dir, doc, page } = setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');               // @I42@, whose record has no CHAN
    assert.ok((await page.save({ when: AT, note: '', stamps: true, header: true, pick: saveDialog(dir) })).done);
    core.addChild(doc, doc.view.definedAt.get('@I42@')[0], '1 NOTE about Jane');
    assert.deepEqual(core.stampPlan(doc, LATER, '').map((p) => [p.id, p.how, p.lines.map((l) => [l.how, l.text])]), [['@I42@', 'resets', [
      ['kept', '1 CHAN'], ['set', '2 DATE 8 OCT 2026'], ['set', '3 TIME 16:05:00'], ['set', '2 NOTE Changed: NAME. Added: NOTE']]]]);
    assert.deepEqual(core.headerPlan(doc, LATER).lines.map((l) => [l.how, l.text]), [['set', '1 NOTE Last updated: 8 OCT 2026 16:05:00']]);
    const r = await page.save({ when: LATER, note: '', stamps: true, header: true, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    const lines = text(dir.at(COPY2).bytes).split('\n');
    assert.deepEqual(lines.filter((l) => l.startsWith('1 CHAN') || l.includes('Last updated') || l.startsWith('2 NOTE')), [
      '1 NOTE Last updated: 8 OCT 2026 16:05:00', '1 CHAN', '2 NOTE Changed: NAME. Added: NOTE'], 'one header date, one stamp, one note: set anew');
    const at = lines.indexOf('1 CHAN');
    assert.deepEqual(lines.slice(at, at + 4), ['1 CHAN', '2 DATE 8 OCT 2026', '3 TIME 16:05:00', '2 NOTE Changed: NAME. Added: NOTE']);
  });
});

describe("the phase-5 walk's saving steps, every one but the person's clicks in the computer's Save dialog", () => {
  it('20 to 24, 33, 34, 36 and 37: a dated copy with its stamp and the header\'s date, the page on it; the original untouched; undone, a change from the copy; every file of the visit refused; a change from outside left out; the outside line removed', async () => {
    const { dir, doc, bytes, page } = setUp();
    const sha = h.sha256(bytes);

    // 20: an edit; the dialog lists 1 change, the stamp @I42@ gains and the header's date, both ticked; Save; the dated name kept
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.equal(core.changeRuns(doc).length, 1);
    assert.deepEqual(core.stampPlan(doc, AT, '').map((p) => [p.id, p.how, p.lines.map((l) => l.text)]),
      [['@I42@', 'adds', ['1 CHAN', '2 DATE 8 OCT 2026', '3 TIME 15:12:00', '2 NOTE Changed: NAME']]]);
    assert.deepEqual(core.headerPlan(doc, AT).lines.map((l) => l.text), ['1 NOTE Last updated: 8 OCT 2026 15:12:00']);
    let r = await page.save({ when: AT, note: '', stamps: true, header: true, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    assert.equal(r.name, COPY);

    // 21: the record ends with the stamp; the page is on the copy: its name, its facts, Changes 0
    const v = doc.view;
    const at = v.definedAt.get('@I42@')[0];
    assert.deepEqual(v.texts.slice(at + 7, at + 11), ['1 CHAN', '2 DATE 8 OCT 2026', '3 TIME 15:12:00', '2 NOTE Changed: NAME']);
    assert.deepEqual([page.file.name, r.size, r.sha256], [COPY, dir.at(COPY).bytes.length, await hash(dir.at(COPY).bytes)], 'the facts\' name, size and sha256 are the copy\'s');
    assert.deepEqual([core.unsaved(doc), core.changeRuns(doc).length], [false, 0], '● gone, Save off, Changes 0');

    // 22: the original is the file as opened; the copy's sha256 is the one the facts show
    assert.equal(await hash(dir.at(NAME).bytes), sha);
    assert.equal(await hash(dir.at(COPY).bytes), r.sha256);
    const copySha = r.sha256;

    // 23: the copy differs from the original in HEAD's last line and in that record alone; the Changes text names the copy and lists nothing
    const m = doc.m;
    const head = m.start[5];                                         // where HEAD ends: 0 @U1@ SUBM
    const from = m.start[15];                                        // 0 @I42@ INDI
    const to = m.start[22];                                          // 0 @I43@ INDI
    const copy = dir.at(COPY).bytes.slice();
    const dated = Buffer.from('1 NOTE Last updated: 8 OCT 2026 15:12:00\n');
    assert.deepEqual(copy.subarray(0, head), bytes.subarray(0, head));
    assert.deepEqual(copy.subarray(head, head + dated.length), new Uint8Array(dated));
    assert.deepEqual(copy.subarray(head + dated.length, head + dated.length + (from - head)), bytes.subarray(head, from));
    assert.deepEqual(copy.subarray(copy.length - (bytes.length - to)), bytes.subarray(to));
    const pasted = save.changesText({ when: AT, file: page.file.name, from: { sha256: copySha, bytes: r.size, lines: doc.view.n }, runs: core.changeRuns(doc) }).split('\n');
    assert.deepEqual(pasted, [`GEDCOM Viewer  changes to ${COPY}  as of ${save.localTime(AT)}`, `from  ${COPY}  sha256 ${copySha}  ${copy.length} bytes  42 lines`, '']);

    // 24: Undo once: the header's date and the stamp, removed from the copy, and ● on; again: the edit, the lines the original's, so ● goes and Save is off
    // while Changes still lists three changes from the copy; Redo twice: the copy's lines, Changes 0
    assert.equal(core.undo(doc).label, 'Change stamps and the date in the header');
    assert.deepEqual(core.changeRuns(doc).map((run) => [run.kind, run.lines.length]), [['removed', 1], ['removed', 4]]);
    assert.equal(core.unsaved(doc), true);
    assert.equal(core.undo(doc).label, 'Edit line 17');
    assert.deepEqual([core.asOpened(doc), core.unsaved(doc)], [true, false], 'the original\'s lines: nothing to save');
    assert.deepEqual(core.changeRuns(doc).map((run) => run.kind), ['removed', 'changed', 'removed'], 'from the copy: the header\'s date, the name, the stamp');
    r = await page.save({ when: LATER, note: '', stamps: false, header: true, pick: saveDialog(dir) });
    assert.deepEqual([r.step, r.say], [1, 'These lines are already in the original. Nothing was written.']);
    core.redo(doc);
    core.redo(doc);
    assert.deepEqual([core.changeRuns(doc).length, core.unsaved(doc)], [0, false], 'the copy\'s lines again');

    // 33: an edit; Save offers the copy's stem with a new timestamp, beside the copy; the copy picked, then the original: each refused, each put back
    core.editLine(doc, doc.view.definedAt.get('@I1@')[0] + 1, '1 NAME Ada /Fixtures/');
    for (const name of [COPY, NAME]) {
      const pick = saveDialog(dir, name);
      r = await page.save({ when: LATER, note: '', stamps: false, header: true, pick });
      assert.deepEqual([pick.offered[0], r.step, r.say], [COPY2, 6, 'That is the original. It is unchanged. Choose another name.'], name);
    }
    assert.deepEqual([await hash(dir.at(NAME).bytes), await hash(dir.at(COPY).bytes)], [sha, copySha], 'both as they were');
    assert.equal(doc.view.texts.filter((t) => /Last updated/.test(t)).length, 1, 'the header\'s date taken back with each refusal, the copy\'s own left');

    // 34: a line appended from outside to the copy the page is on; Save, the offered name: the new copy is the page's lines, without the outside line
    dir.at(COPY).bytes = new Uint8Array([...dir.at(COPY).bytes, ...Buffer.from('0 NOTE changed from outside\n')]);
    r = await page.save({ when: new Date(2026, 9, 8, 16, 30, 0), note: '', stamps: false, header: false, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    assert.ok(text(dir.at(r.name).bytes).endsWith('0 TRLR\n'), 'the new copy\'s last line is 0 TRLR');
    assert.ok(text(dir.at(COPY).bytes).endsWith('0 NOTE changed from outside\n'), 'the copy keeps what was done to it from outside');
    assert.equal(page.file.name, r.name, 'the page on the new copy');

    // 36 and 37: the copy that took the outside line, opened again, one line more; that line removed; no stamp needed;
    // with the header's date unticked, the new copy's sha256 is the copy's of step 22
    const again = core.openDocument(dir.at(COPY).bytes.slice());
    assert.equal(again.m.n, 43);
    assert.ok(core.deleteLine(again, 42).ok);
    assert.deepEqual(core.stampPlan(again), [], 'no record to stamp');
    const page2 = pageOn(again, COPY, dir.at(COPY));
    r = await page2.save({ when: new Date(2026, 9, 8, 16, 45, 0), note: '', stamps: true, header: false, pick: saveDialog(dir) });
    assert.ok(r.done, r.say);
    assert.equal(r.name, 'Fixture_Family.2026-10-08T164500.ged');
    assert.equal(await hash(dir.at(r.name).bytes), copySha);
  });
});
