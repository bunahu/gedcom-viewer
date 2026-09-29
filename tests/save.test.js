// save.js (BUILD-BRIEF section 10): the names, the log block, Save in place in the order of 10.2,
// Save a copy, and section 15's editing walk — every step of it but the owner's clicks — over
// in-memory handles (tests/fake-handles.js).
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../core.js');
const save = require('../save.js');
const h = require('./helpers.js');
const { FakeDir } = require('./fake-handles.js');

const hash = async (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const AT = new Date(2026, 8, 28, 15, 42, 0);
const LATER = new Date(2026, 8, 28, 15, 50, 9);
const NAME = 'Fixture_Family.ged';

// A folder holding a written file under NAME, the document opened from it, and the file on disk
// as the page keeps it: its hash, bytes and lines.
async function setUp(file = 'family.ged') {
  const bytes = h.bytesOfFile(path.join(h.SYNTHETIC, file));
  const dir = new FakeDir('folder');
  dir.put(NAME, bytes);
  const doc = core.openDocument(bytes);
  return { dir, doc, bytes, disk: { sha256: await hash(bytes), bytes: bytes.length, lines: doc.m.n } };
}

const text = (bytes) => Buffer.from(bytes).toString('utf8');

describe('names (10.1)', () => {
  it('the backup, the copy and the log, for a save at 3:42:00 pm on 2026-09-28', () => {
    const n = save.names(NAME, AT);
    assert.equal(n.backup(1), 'Fixture_Family.2026-09-28T154200.ged.bak');
    assert.equal(n.copy(1), 'Fixture_Family.2026-09-28T154200.ged');
    assert.equal(n.log, 'Fixture_Family.ged.edits.log');
    assert.equal(n.logDownload, 'Fixture_Family.ged.2026-09-28T154200.edits.log');
  });

  it('.GED kept as written; .cleaned.ged keeps .cleaned in the stem; .gedcom; a name with neither', () => {
    assert.equal(save.names('FIXTURE.GED', AT).copy(1), 'FIXTURE.2026-09-28T154200.GED');
    assert.equal(save.names('Fixture.cleaned.ged', AT).copy(1), 'Fixture.cleaned.2026-09-28T154200.ged');
    assert.equal(save.names('Fixture.cleaned.ged', AT).backup(1), 'Fixture.cleaned.2026-09-28T154200.ged.bak');
    assert.equal(save.names('fixture.gedcom', AT).copy(1), 'fixture.2026-09-28T154200.gedcom');
    assert.equal(save.names('fixture.txt', AT).copy(1), 'fixture.txt.2026-09-28T154200');
    assert.equal(save.names('.ged', AT).copy(1), '.ged.2026-09-28T154200', 'a name that is only an extension is all stem');
  });

  it('a taken name gets -2, then -3; the backup too, so none is written over', async () => {
    const { dir, doc, disk } = await setUp();
    dir.put('Fixture_Family.2026-09-28T154200.ged', [1]);
    dir.put('Fixture_Family.2026-09-28T154200-2.ged', [2]);
    const copy = await save.saveCopy({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: false, hash });
    assert.equal(copy.copy, 'Fixture_Family.2026-09-28T154200-3.ged');
    assert.deepEqual(dir.at('Fixture_Family.2026-09-28T154200.ged').bytes, new Uint8Array([1]), 'untouched');
    const history = await dir.getDirectoryHandle('gedcom-viewer-history', { create: true });
    history.put('Fixture_Family.2026-09-28T154200.ged.bak', [9]);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: false, hash });
    assert.equal(r.backup, 'gedcom-viewer-history/Fixture_Family.2026-09-28T154200-2.ged.bak');
    assert.deepEqual(history.at('Fixture_Family.2026-09-28T154200.ged.bak').bytes, new Uint8Array([9]), 'untouched');
  });

  it("the log's time is local, with its offset from UTC", () => {
    const off = -AT.getTimezoneOffset();
    const sign = off < 0 ? '-' : '+';
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
    const mm = String(Math.abs(off) % 60).padStart(2, '0');
    assert.equal(save.logTime(AT), `2026-09-28T15:42:00${sign}${hh}:${mm}`);
    assert.equal(save.timestamp(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02T030405');
  });
});

describe('the log block (10.5)', () => {
  it('a save: the note, before and after, the backup, and each run of the net change', async () => {
    const { dir, doc, disk } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');             // @I42@
    core.deleteLine(doc, 29);                                         // 1 CHIL @I42@ in @F1@, and its _FREL
    const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: 'Fixed a name.', stamps: true, hash });
    assert.ok(r.done, r.say);
    const after = dir.at(NAME).bytes;
    const log = text(dir.at('Fixture_Family.ged.edits.log').bytes);
    assert.equal(log, [
      `=== ${save.logTime(AT)}  save  Fixture_Family.ged`,
      'note     Fixed a name.',
      `before   sha256 ${disk.sha256}  465 bytes  37 lines`,
      `after    sha256 ${await hash(after)}  ${after.length} bytes  43 lines`,
      'backup   gedcom-viewer-history/Fixture_Family.2026-09-28T154200.ged.bak',
      'changed  17    -> 17     @I42@ INDI',
      '  - 1 NAME Jane /Fixture/',
      '  + 1 NAME Jane /Fixtures/',
      'added             23-26  @I42@ INDI  (change stamp)',
      '  + 1 CHAN',
      '  + 2 DATE 28 SEP 2026',
      '  + 3 TIME 15:42:00',
      '  + 2 NOTE Fixed a name.',
      'removed  30-31           @F1@ FAM',
      '  - 1 CHIL @I42@',
      '  - 2 _FREL Natural',
      'added             34-37  @F1@ FAM  (change stamp)',
      '  + 1 CHAN',
      '  + 2 DATE 28 SEP 2026',
      '  + 3 TIME 15:42:00',
      '  + 2 NOTE Fixed a name.',
      '', ''].join('\n'));
  });

  it('a copy: its name after the file, and no backup; a line that gained an ending says so', async () => {
    const { dir, doc, disk } = await setUp('no-final-newline.ged');
    core.addSibling(doc, 7, '0 @N1@ NOTE after the end');
    const r = await save.saveCopy({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: false, hash });
    assert.ok(r.done, r.say);
    const log = text(dir.at('Fixture_Family.ged.edits.log').bytes).split('\n');
    assert.equal(log[0], `=== ${save.logTime(AT)}  copy  Fixture_Family.ged -> Fixture_Family.2026-09-28T154200.ged`);
    assert.equal(log[1], 'note     Edited by hand in GEDCOM Viewer.');
    assert.ok(!log.some((l) => l.startsWith('backup')));
    assert.deepEqual(log.slice(4, 10), ['changed  8 -> 8  TRLR', '  - 0 TRLR', '  + 0 TRLR', '    line ending: none -> LF',
      'added         9  @N1@ NOTE', '  + 0 @N1@ NOTE after the end']);
  });
});

describe('Save, in place (10.2)', () => {
  it('in order: the file read, the backup written and read back, the file written and read back, the log appended', async () => {
    const { dir, doc, disk, bytes } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    dir.journal.length = 0;
    const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: true, hash });
    assert.ok(r.done, r.say);
    assert.deepEqual(dir.journal, [
      'read Fixture_Family.ged',
      'write gedcom-viewer-history/Fixture_Family.2026-09-28T154200.ged.bak',
      'read gedcom-viewer-history/Fixture_Family.2026-09-28T154200.ged.bak',
      'write Fixture_Family.ged',
      'read Fixture_Family.ged',
      'read Fixture_Family.ged.edits.log',
      'append Fixture_Family.ged.edits.log',
    ]);
    assert.deepEqual(dir.at(r.backup).bytes, bytes, 'the backup is the file as it was');
    assert.deepEqual(dir.at(NAME).bytes, core.saveBytes(doc), 'the file is the document');
    assert.equal(r.disk.sha256, await hash(dir.at(NAME).bytes));
    assert.equal(core.isChanged(doc), false, 'the lines now are the file on disk');
  });

  it('nothing changed: says so, writes nothing', async () => {
    const { dir, doc, disk } = await setUp();
    dir.journal.length = 0;
    const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: true, hash });
    assert.equal(r.step, 1);
    assert.match(r.say, /Nothing has changed/);
    assert.deepEqual(dir.journal, []);
  });

  it('the file changed on disk since it was opened: refused, nothing written (I7)', async () => {
    const { dir, doc, disk } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    dir.at(NAME).bytes = new Uint8Array([...dir.at(NAME).bytes, 0x0a]);
    const check = await save.checkDisk({ dir, name: NAME, diskHash: disk.sha256, hash });
    assert.equal(check.changedOnDisk, true);
    dir.journal.length = 0;
    const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: true, hash });
    assert.equal(r.step, 3);
    assert.equal(r.changedOnDisk, true);
    assert.deepEqual(dir.journal, ['read Fixture_Family.ged']);
    assert.equal(dir.at('gedcom-viewer-history'), undefined, 'not even a backup');
    assert.equal(core.isChanged(doc), true, 'the edit is still there to save elsewhere');
  });

  for (const how of ['open', 'close', 'garble']) {
    it(`a backup that fails (${how}) stops the save, and the file is untouched`, async () => {
      const { dir, doc, disk, bytes } = await setUp();
      core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
      const history = await dir.getDirectoryHandle('gedcom-viewer-history', { create: true });
      history.failNew = how;
      const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: false, hash });
      assert.equal(r.done, false);
      assert.equal(r.step, 7);
      assert.match(r.say, /Fixture_Family.ged was not touched/);
      assert.deepEqual(dir.at(NAME).bytes, bytes);
      assert.ok(!dir.journal.includes('write Fixture_Family.ged'));
      assert.equal(core.isChanged(doc), true);
    });
  }

  it('a file that does not read back as written: said loudly, and the backup named', async () => {
    const { dir, doc, disk } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    dir.at(NAME).fail = 'garble';
    const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: false, hash });
    assert.equal(r.step, 8);
    assert.equal(r.loud, true);
    assert.match(r.say, /in gedcom-viewer-history\/Fixture_Family\.2026-09-28T154200\.ged\.bak/);
    assert.equal(core.isChanged(doc), true);
  });

  it('a log that cannot be written: said, and the save stands', async () => {
    const { dir, doc, disk } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    dir.failNew = 'open';
    const r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: false, hash });
    assert.equal(r.done, true);
    assert.match(r.logFailed, /The save stands/);
    assert.equal(core.isChanged(doc), false);
  });

  it('the log only grows: opened keeping what is there, and written at its end', async () => {
    const { dir, doc, disk } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const first = await save.save({ doc, dir, name: NAME, disk, when: AT, note: 'one', stamps: false, hash });
    const once = dir.at('Fixture_Family.ged.edits.log').bytes.slice();
    core.editLine(doc, 23, '1 NAME Joe /Fixtures/');
    const second = await save.save({ doc, dir, name: NAME, disk: first.disk, when: LATER, note: 'two', stamps: false, hash });
    assert.ok(second.done, second.say);
    const twice = dir.at('Fixture_Family.ged.edits.log').bytes;
    assert.ok(twice.length > once.length);
    assert.deepEqual(twice.subarray(0, once.length), once, 'the first block is as it was');
    assert.equal(text(twice).split('\n=== ').length, 2, 'two blocks');
  });
});

describe('Save a copy (10.3)', () => {
  it('the copy under its dated name, read back; the original untouched; the log block in the original\'s log', async () => {
    const { dir, doc, disk, bytes } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await save.saveCopy({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: true, hash });
    assert.ok(r.done, r.say);
    assert.equal(r.copy, 'Fixture_Family.2026-09-28T154200.ged');
    assert.deepEqual(dir.at(r.copy).bytes, core.saveBytes(doc));
    assert.deepEqual(dir.at(NAME).bytes, bytes, 'the original on disk is untouched');
    assert.equal(core.isChanged(doc), true, 'so the document stays unsaved against it');
    assert.match(text(dir.at('Fixture_Family.ged.edits.log').bytes), /copy {2}Fixture_Family\.ged -> Fixture_Family\.2026-09-28T154200\.ged/);
    assert.equal(dir.at('gedcom-viewer-history'), undefined, 'a copy makes no backup');
  });

  it('with no folder, or no pickers: the copy\'s bytes and name, and the log block to offer as a second file', async () => {
    const { doc, disk } = await setUp();
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    const r = await save.copyFiles({ doc, name: NAME, disk, when: AT, note: '', stamps: false, hash });
    assert.equal(r.copy, 'Fixture_Family.2026-09-28T154200.ged');
    assert.equal(r.logName, 'Fixture_Family.ged.2026-09-28T154200.edits.log');
    assert.deepEqual(r.bytes, core.saveBytes(doc));
    assert.match(r.logText('chosen.ged'), /copy {2}Fixture_Family\.ged -> chosen\.ged/);
  });
});

describe("section 15's editing walk, every step but the owner's clicks", () => {
  it('edit, Save, backup and log, Undo twice, Save unstamped, delete and undo, Save a copy, changed on disk', async () => {
    const { dir, doc, bytes } = await setUp();
    let disk = { sha256: await hash(bytes), bytes: bytes.length, lines: doc.m.n };
    const original = disk.sha256;

    // one name edited → Changes shows one line
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    assert.equal(core.changeRuns(doc).length, 1);

    // Save → the dialog lists the change and the stamp → saved
    assert.deepEqual(core.stampTargets(doc).map((r) => doc.view.xref[doc.view.records[r]]), ['@I42@']);
    let r = await save.save({ doc, dir, name: NAME, disk, when: AT, note: '', stamps: true, hash });
    assert.ok(r.done, r.say);
    disk = r.disk;
    assert.deepEqual(r.runs.map((run) => [run.kind, run.stamp]), [['changed', false], ['added', true]]);

    // the folder holds the backup in gedcom-viewer-history/ and the log; the backup's sha256 is the original
    assert.deepEqual(dir.names(), ['Fixture_Family.ged', 'Fixture_Family.ged.edits.log', 'gedcom-viewer-history']);
    assert.equal(await hash(dir.at(r.backup).bytes), original);

    // the saved file differs from the backup only in that record
    const m = doc.m;
    const from = m.start[15];                                        // 0 @I42@ INDI
    const to = m.start[22];                                          // 0 @I43@ INDI
    const saved = dir.at(NAME).bytes;
    assert.deepEqual(saved.subarray(0, from), bytes.subarray(0, from));
    assert.deepEqual(saved.subarray(saved.length - (bytes.length - to)), bytes.subarray(to));

    // Undo twice (the stamp, then the edit), Save with the stamp box unticked → the original sha256
    assert.equal(core.undo(doc).label, 'Change stamps');
    assert.equal(core.undo(doc).label, 'Edit line 17');
    r = await save.save({ doc, dir, name: NAME, disk, when: LATER, note: '', stamps: false, hash });
    assert.ok(r.done, r.say);
    disk = r.disk;
    assert.equal(await hash(dir.at(NAME).bytes), original);

    // a record deleted with its pointers, then undone
    assert.ok(core.deleteRecord(doc, 15).ok);
    core.undo(doc);
    assert.equal(core.isChanged(doc), false);

    // Save a copy writes the dated name
    r = await save.saveCopy({ doc, dir, name: NAME, disk, when: LATER, note: '', stamps: true, hash });
    assert.ok(r.done, r.say);
    assert.equal(r.copy, 'Fixture_Family.2026-09-28T155009.ged');
    assert.equal(await hash(dir.at(r.copy).bytes), original);

    // the file changed from outside (a line appended) → Save refuses
    dir.at(NAME).bytes = new Uint8Array([...dir.at(NAME).bytes, ...Buffer.from('0 @N9@ NOTE from elsewhere\n')]);
    core.editLine(doc, 16, '1 NAME Jane /Fixtures/');
    r = await save.save({ doc, dir, name: NAME, disk, when: LATER, note: '', stamps: true, hash });
    assert.equal(r.changedOnDisk, true);

    // the log: two saves and a copy, in that order, each block whole
    const log = text(dir.at('Fixture_Family.ged.edits.log').bytes);
    assert.deepEqual(log.split('\n').filter((l) => l.startsWith('=== ')).map((l) => l.split('  ')[1]), ['save', 'save', 'copy']);
  });
});
