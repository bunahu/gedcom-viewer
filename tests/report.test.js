// P8 — a problem report: counts and codes only, never a line of the file; its checksum; and the
// tool that reads one back. 2026-10-12: the visit's trail (the last ten acts, by their undo labels;
// the errors the page hit; how long the last open and the last act took), the window's size, and
// for each check the tag and its parent's tag and its first lines, notes too; and a made-up file,
// edited every way the page can, whose values never reach the report.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const h = require('./helpers.js');
const core = require('../core.js');

const INFO = { version: '0.5.3', where: 'opened from disk', browser: 'Chrome 154 · macOS', bytes: 1234,
  sha256: 'abcdef0123456789'.repeat(4), editing: false, unsaved: 0, settings: 'theme light · Indent off · Bold surnames off' };
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const built = (m, info = INFO) => { const t = core.report(m, info); return core.withChecksum(t, sha(`${t}\n`)); };
const tool = (text) => {
  const r = spawnSync(process.execPath, [path.join(h.ROOT, 'tools', 'report-check.js')], { input: text, encoding: 'utf8' });
  return { code: r.status, said: r.stdout.trim() };
};
const open = (text) => core.openDocument(new Uint8Array(Buffer.from(text)));
const lineOf = (m, text) => { const i = m.texts.indexOf(text); assert.ok(i >= 0, `no line "${text}"`); return i; };
// The page's trail, as ui.js keeps it: entries numbered from 1, the last ten kept.
function trailOf(entries, more = {}) {
  const acts = entries.map((e, k) => ({ n: k + 1, ...e }));
  return { acts: acts.slice(-10), count: acts.length, errors: [], errorCount: 0, open: null, last: null, ...more };
}

describe('P8 the problem report', () => {
  it('holds counts and codes, and no line of any fixture', () => {
    for (const p of h.gedFiles(h.SYNTHETIC)) {
      const m = h.readFile(p);
      const text = built(m);
      for (let i = 0; i < m.n; i += 1) {
        const t = m.texts[i].trim();
        if (t.length >= 3) assert.ok(!text.includes(t), `${path.basename(p)}: line ${i + 1} is in the report`);
      }
      assert.match(text, /^GEDCOM Viewer 0\.5\.3 — a problem report\. Counts and codes only; no line of the file\.\n/);
      assert.match(text, /\nWhere: opened from disk · Chrome 154 · macOS\n/);
      assert.match(text, /\nFile: 1,234 bytes · [\d,]+ lines · /);
      assert.match(text, /\nEdit: off · unsaved changes: 0\n/);
      assert.match(text, /\nchecksum: [0-9a-f]{8}$/);
    }
  });

  it('family.ged: the records, the tags, the checks, the header, and the sha256 cut short', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'family.ged'));
    const text = built(m);
    const records = [...m.topCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${c}`).join(' · ');
    assert.ok(text.includes(`\nRecords: ${records}\n`), text);
    assert.ok(text.includes(`\nTags: ${m.tagCounts.size} distinct · ids defined ${m.definedAt.size}\n`), text);
    assert.ok(text.includes('sha256 abcdef012345…'), text);
    assert.ok(!/Fixture/.test(text), 'a name in the report');
    assert.match(text, /\nLines: LF \d+ · longest \d+ characters · CONC \d+ · CONT \d+ · CHAN \d+\n/);
    assert.match(text, /\nChecks: (none|[EN]\d+ \d+.*)\n/);
  });

  it('with no file open: File: none open', () => {
    const text = core.report(null, INFO);
    assert.ok(text.includes('\nFile: none open\n'), text);
    assert.ok(!/Records:/.test(text));
  });

  it('the checksum reads back; tools/report-check.js says as built, changed, or no checksum', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'family.ged'));
    const text = built(m);
    const parts = core.reportChecksumParts(`${text}\nWhat happened: it broke\n`);
    assert.equal(parts.claimed, sha(parts.above).slice(0, 8));
    assert.equal(parts.after, 'What happened: it broke\n');
    assert.equal(core.reportChecksumParts('no checksum here').claimed, null);
    const asBuilt = tool(`${text}\nWhat happened: the words after the checksum are not checked\n`);
    assert.equal(asBuilt.code, 0, asBuilt.said);
    assert.match(asBuilt.said, /^as built: the checksum [0-9a-f]{8} matches its \d+ lines$/);
    const cut = text.split('\n').filter((l) => !l.startsWith('Where:')).join('\n');
    const changed = tool(cut);
    assert.equal(changed.code, 1, changed.said);
    assert.match(changed.said, /^changed after it was built: the checksum [0-9a-f]{8} does not match/);
    const none = text.split('\n').filter((l) => !l.startsWith('checksum:')).join('\n');
    const unread = tool(none);
    assert.equal(unread.code, 2, unread.said);
    assert.match(unread.said, /^no checksum line/);
  });

  it('a whole report, the trail in it, reads back as built through the tool', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'family.ged'));
    const trail = trailOf([{ what: 'open', by: 'drop', lines: m.n, handle: true }, { what: 'act', label: 'Edit line 8' }],
      { errors: [{ words: 'TypeError: x is not a function', place: 'https://gedcom-viewer.net/ui.js:12:5', count: 1, after: 2 }], errorCount: 1,
        open: { disk: 3, read: m.timings, drawn: 40, all: 61 }, last: { n: 2, act: 30, recheck: { checks: 20, gather: 2, labels: 3 }, drawn: 9, all: 44 } });
    const text = built(m, { ...INFO, window: { width: 1440, height: 900, ratio: 2 }, trail });
    const r = tool(`${text}\nWhat happened: it broke\n`);
    assert.equal(r.code, 0, r.said);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Each check: the tag and its parent's tag, and the first three lines, for notes as for errors
// ---------------------------------------------------------------------------------------------

describe('the report: each check by its places, the tag and its parent\'s tag, with its first lines', () => {
  it('e6-e7-ids.ged: an error and a note alike name their place and their lines', () => {
    const text = built(h.readFile(path.join(h.SYNTHETIC, 'e6-e7-ids.ged')));
    assert.ok(text.includes('\nChecks: E6 1 · E7 1 · N3 1\n  E6 1: SUBM at level 0 (line 8)\n  E7 1: FAMC under INDI (line 12)\n  N3 1: INDI at level 0 (line 10)\n'), text);
  });

  it('the most common place first, three lines each, "of" the place\'s count; three places at most, the rest counted', () => {
    const long = 'x'.repeat(300);
    const lines = ['0 HEAD', '1 CHAR UTF-8'];
    for (let k = 0; k < 5; k += 1) lines.push(`0 @I${k}@ INDI`, `1 NOTE ${long}`);   // N4 ×5: NOTE under INDI
    lines.push('0 @N1@ NOTE', `1 CONC ${long}`, `1 CONC ${long}`);                     // N4 ×2: CONC under NOTE
    lines.push('0 @S1@ SOUR', `1 TITL ${long}`, '1 PAGE p', `2 TEXT ${long}`);           // N4: TITL under SOUR, TEXT under PAGE
    lines.push('0 TRLR');
    const m = h.readText(`${lines.join('\n')}\n`);
    const text = core.report(m, INFO);
    const n4 = text.split('\n').find((l) => l.startsWith('  N4 '));
    assert.equal(n4, '  N4 9: NOTE under INDI (lines 4, 6 and 8, of 5) · CONC under NOTE (lines 14 and 15) · TITL under SOUR (line 17) · 1 more, in 1 other place', text);
    const n3 = text.split('\n').find((l) => l.startsWith('  N3 '));
    assert.equal(n3, '  N3 7: INDI at level 0 (lines 3, 5 and 7, of 5) · NOTE at level 0 (line 13) · SOUR at level 0 (line 16)', 'a note names its lines too');
  });

  it('a line with no tag is named for what it is, under the nearest line above it that has one; a finding about the whole file is the file', () => {
    const shapes = core.report(h.readFile(path.join(h.SYNTHETIC, 'e2-shapes.ged')), INFO);
    assert.ok(shapes.includes('\n  E2 5: a line that did not parse under NAME (lines 8, 9 and 10, of 5)\n'), shapes);
    const blank = core.report(h.readText('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n\n1 NAME A\n0 TRLR\n'), INFO);
    assert.ok(blank.includes('\n  E5 1: a blank line under INDI (line 4)\n'), blank);
    const mixed = core.report(h.readFile(path.join(h.SYNTHETIC, 'mixed-endings.ged')), INFO);
    assert.ok(mixed.includes('\nChecks: N7 1\n  N7 1: the file\n'), mixed);
    const empty = core.report(h.readText('just words\n'), INFO);
    assert.ok(empty.includes('\n  E4 2: the file (2)\n'), empty);
    assert.ok(empty.includes('\n  E1 1: a line that did not parse under no line (line 1)\n'), empty);
  });

  it('a tag is named as written only when a standard defines it or it has a custom tag\'s form; any other is a malformed or a custom tag, never as written', () => {
    const m = h.readText(['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Ada /Quill/',
      '1 Quillfeather keeps the ledger', '1 _Nickname Lina', '1 _MILITARY Sergeant', '1 SNOTE @N1@', '2 Brecknock x',
      '0 Pennant private', '1 NOTE kept', '0 TRLR', ''].join('\n'));
    const text = core.report(m, INFO);
    for (const word of ['Quillfeather', 'Nickname', 'Brecknock', 'Pennant']) assert.ok(!text.includes(word), `${word} is in the report:\n${text}`);
    assert.ok(text.includes('\nRecords: HEAD 1 · INDI 1 · a malformed tag 1 · TRLR 1\n'), text);
    assert.ok(text.includes('\n  E10 3: a malformed tag under INDI (line 7) · SNOTE under INDI (line 10) · a malformed tag at level 0 (line 12)\n'), text);
    // a line under a tag the report does not name names it as what it is; _MILITARY, in a custom tag's form, as written
    const under = core.report(h.readText(['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 _Nickname Lina', `2 NOTE ${'y'.repeat(300)}`,
      '1 _MILITARY S', `2 NOTE ${'y'.repeat(300)}`, '0 TRLR', ''].join('\n')), INFO);
    assert.ok(under.includes('\n  N4 2: NOTE under a custom tag (line 5) · NOTE under _MILITARY (line 7)\n'), under);
    // 7.0 lets only a custom tag's form pass, and a lower case one is malformed there
    const seven = core.report(h.readText(['0 HEAD', '1 GEDC', '2 VERS 7.0', '0 @I1@ INDI', '1 _nick Lina', '1 _APID 1,2::3', '0 TRLR', ''].join('\n')), INFO);
    assert.ok(seven.includes('\n  E10 1: a malformed tag under INDI (line 5)\n') && seven.includes('\n  N9 1: _APID under INDI (line 6)\n'), seven);
    assert.ok(!seven.includes('_nick'), seven);
  });
});

// ---------------------------------------------------------------------------------------------
// 1. The acts: the last ten, by their undo labels, and no label carries a value
// ---------------------------------------------------------------------------------------------

describe('the report: the visit\'s last ten acts, in order, by their undo labels', () => {
  it('each kind of entry in its words; the last ten of the visit, numbered as the visit numbers them, oldest first', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'family.ged'));
    const entries = [
      { what: 'open', by: 'picker', lines: 30, handle: true },
      { what: 'act', label: 'Edit line 8' },
      { what: 'open', by: 'input', lines: 1500000, outcome: 'long' },
      { what: 'open', by: 'drop', outcome: 'failed' },
      { what: 'open', by: 'drop', lines: 1234, handle: false },
      { what: 'act', label: 'Edit line 8' },
      { what: 'act', label: 'Add line 12' },
      { what: 'act', label: 'Delete lines 5–6' },
      { what: 'act', label: 'Delete record @I1@ INDI', line: 3, pointers: 2 },
      { what: 'act', label: 'Move lines 5–6 to 8', by: 'drag' },
      { what: 'act', label: 'Move line 5 to 4', by: 'up' },
      { what: 'act', label: 'Restore a line' },
      { what: 'undo', label: 'Delete record @I1@ INDI' },
      { what: 'redo', label: 'Restore 2 lines' },
    ];
    const text = core.report(m, { ...INFO, trail: trailOf(entries) });
    assert.ok(text.includes(['', 'Acts: 14 this visit; the last 10, oldest first',
      '  5. Open by a drop: 1,234 lines, with no handle',
      '  6. Edit line 8',
      '  7. Add line 12',
      '  8. Delete lines 5–6',
      '  9. Delete record INDI, at line 3, with 2 lines that pointed at it',
      '  10. Move lines 5–6 to 8, by a drag',
      '  11. Move line 5 to 4, by ⌥↑',
      '  12. Restore a line',
      '  13. Undo: Delete record INDI',
      '  14. Redo: Restore 2 lines',
      'Errors: none this visit', ''].join('\n')), text);
    assert.ok(!text.includes('@I1@'), 'a record\'s id is never in the report');
    const first = core.report(m, { ...INFO, trail: trailOf(entries.slice(0, 4)) });
    assert.ok(first.includes(['', 'Acts: 4 this visit, oldest first', '  1. Open by Open GEDCOM: 30 lines, with a handle', '  2. Edit line 8',
      '  3. Open by the file box: refused, 1,500,000 lines, more than the page can show', '  4. Open by a drop: failed, with an error', ''].join('\n')), first);
    assert.ok(core.report(m, { ...INFO, trail: trailOf([]) }).includes('\nActs: none this visit\nErrors: none this visit\n'));
  });

  it('a refused act by what it was asked and its lines, never its reason; a save by its way, what it added and how it ended, never its note', () => {
    const entries = [
      { what: 'refused', act: 'edit', line: 8 },
      { what: 'refused', act: 'add', line: 12 },
      { what: 'refused', act: 'delete', line: 5, end: 6 },
      { what: 'refused', act: 'delete', line: 5, end: 5 },
      { what: 'refused', act: 'record', line: 1 },
      { what: 'refused', act: 'restore', count: 3 },
      { what: 'refused', act: 'move', line: 5, end: 9, by: 'down' },
      { what: 'save', by: 'dialog', stamps: true, note: true, header: true, outcome: 'saved' },
      { what: 'save', by: 'download', stamps: false, note: false, header: true, outcome: 'downloaded' },
      { what: 'save', by: 'dialog', stamps: true, note: false, header: false, outcome: 'cancelled', step: 5 },
    ];
    const more = [
      { what: 'save', by: 'dialog', stamps: false, note: false, header: false, outcome: 'stopped', step: 6 },
      { what: 'save', by: 'dialog', stamps: true, note: false, header: true, outcome: 'stopped', step: 7 },
      { what: 'save', by: 'dialog', outcome: 'nothing' },
      { what: 'save', by: 'download', outcome: 'dropped' },
    ];
    const text = core.report(null, { ...INFO, trail: trailOf(entries) });
    assert.ok(text.includes(['', 'Acts: 10 this visit, oldest first',
      '  1. Edit line 8: refused',
      '  2. Add line 12: refused',
      '  3. Delete lines 5–6: refused',
      '  4. Delete line 5: refused',
      '  5. Delete record at line 1: refused',
      '  6. Restore 3 lines: refused',
      '  7. Move lines 5–9, by ⌥↓: refused',
      '  8. Save, with change stamps (a note typed) and the date in the header: saved',
      '  9. Download a copy, with the date in the header: downloaded',
      '  10. Save, with change stamps: cancelled in the Save dialog', ''].join('\n')), text);
    const after = core.report(null, { ...INFO, trail: trailOf(more) });
    assert.ok(after.includes(['', 'Acts: 4 this visit, oldest first',
      '  1. Save, with no change stamps and no date in the header: stopped at step 6 of 10.2, a file of this visit picked',
      '  2. Save, with change stamps and the date in the header: stopped at step 7 of 10.2',
      '  3. Save: nothing to save',
      '  4. Download a copy: cancelled in the page\'s dialog', ''].join('\n')), after);
  });

  it('every finish() in core.js makes a label of line numbers and counts alone, bar Delete record\'s id, which the report never gives', () => {
    const src = fs.readFileSync(path.join(h.ROOT, 'core.js'), 'utf8');
    const calls = [...src.matchAll(/\bfinish\(doc, (.+), done\);/g)].map((x) => x[1]);
    assert.equal(calls.length, 8, `finish() is called ${calls.length} times: a new label is checked here, then added`);
    const inner = (expr) => [...expr.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((x) => x[1]);
    let record = 0;
    for (const expr of calls) {
      if (expr === 'label') continue;                                // saveActs: three fixed strings, below
      for (const part of inner(expr)) {
        if (/^num\([\w .+-]+\)$/.test(part)) continue;               // a line number or a count
        assert.equal(part, 'plan.id === null ? plan.tag : `${plan.id} ${plan.tag}`', `a label holds ${part}`);
        record += 1;
      }
    }
    assert.equal(record, 1, 'one label names something of the file: Delete record, by id and tag');
    const saveLabel = /const label = (.+);\n/.exec(src.slice(src.indexOf('function saveActs(')))[1];
    assert.equal(saveLabel, "stamped && dated ? 'Change stamps and the date in the header' : stamped ? 'Change stamps' : 'The date in the header'");
  });

  it('every act made in core.js has a label the report gives as it is, Delete record\'s without its id', () => {
    const text = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '0 @ADA1@ INDI', '1 NAME Ada /Quill/', '1 BIRT', '2 DATE 1900', '2 PLAC Here',
      '1 DEAT', '2 DATE 1980', '1 FAMS @F1@', '0 @F1@ FAM', '1 WIFE @ADA1@', '0 NOTE no id', '0 TRLR', ''].join('\n');
    const doc = open(text);
    const labels = [];
    const did = (r) => { assert.ok(r.ok, r.reason); labels.push(r.step.label); };
    const at = (t) => { const i = doc.view.texts.indexOf(t); assert.ok(i >= 0, `no line "${t}"`); return i; };
    const restore = () => {
      const run = core.changeRuns(doc).find((r) => r.kind === 'removed');
      did(core.restoreLines(doc, run.before, run.lines.length));
    };
    const move = (from, end, to) => {
      assert.ok(core.landings(doc, from, end).at.includes(to), 'a place a drag may land');
      did(core.moveLines(doc, from, end, to));
    };
    did(core.editLine(doc, at('2 DATE 1980'), '2 DATE 1981'));
    did(core.addChild(doc, at('1 BIRT'), '2 NOTE n'));
    did(core.addSibling(doc, at('1 BIRT'), '1 SEX F'));
    did(core.deleteLine(doc, at('1 WIFE @ADA1@')));
    restore();                                                     // Restore a line
    did(core.deleteLine(doc, at('2 PLAC Here')));
    did(core.deleteLine(doc, at('1 DEAT')));                       // with its DATE
    restore();                                                     // the three, side by side as saved
    move(at('1 SEX F'), at('1 SEX F') + 1, at('1 NAME Ada /Quill/'));
    move(at('1 BIRT'), core.subtreeEnd(doc.view, at('1 BIRT')), at('1 SEX F'));
    did(core.applyStamps(doc, new Date(2026, 9, 12, 10, 0, 0), ''));
    did(core.saveActs(doc, new Date(2026, 9, 12, 10, 0, 1), { stamps: true, typed: '', header: true }));
    did(core.saveActs(doc, new Date(2026, 9, 12, 10, 0, 2), { stamps: false, typed: '', header: true }));
    did(core.deleteRecord(doc, at('0 @ADA1@ INDI')));
    did(core.deleteRecord(doc, at('0 NOTE no id')));
    const said = labels.map((l) => core.reportLabel(doc.view, l));
    assert.deepEqual(said.slice(0, -2), labels.slice(0, -2), 'every label but a record\'s as it is');
    assert.deepEqual(said.slice(-2), ['Delete record INDI', 'Delete record NOTE']);
    assert.deepEqual(labels.map((l) => l.replace(/[\d,]+/g, 'N')), ['Edit line N', 'Add line N', 'Add line N', 'Delete line N', 'Restore a line',
      'Delete line N', 'Delete lines N–N', 'Restore N lines', 'Move line N to N', 'Move lines N–N to N', 'Change stamps',
      'Change stamps and the date in the header', 'The date in the header', 'Delete record @ADAN@ INDI', 'Delete record NOTE'], 'every form of label made');
    assert.ok(!said.join(' ').includes('ADA1'), 'the id is never given');
  });

  it('whatever an entry holds, only numbers, the fixed words and a label in a known form reach the report', () => {
    const v = 'Zebedee Marchbanks';
    const entries = [
      { what: 'act', label: `Edit line 8 ${v}`, line: v, by: v, pointers: v },
      { what: 'act', label: `Delete record @${v}@ INDI` },
      { what: 'act', label: 'Delete record @ZEBEDEE@ Marchbanks' },
      { what: 'undo', label: v }, { what: 'redo', label: { toString: () => v } },
      { what: 'refused', act: v, line: v, end: v, count: v, by: v },
      { what: 'refused', act: 'move', line: 3, end: 4, by: v },
      { what: 'save', by: v, stamps: v, note: v, header: v, outcome: v, step: v },
      { what: 'open', by: v, lines: v, handle: v, outcome: v },
      { what: v, label: 'Edit line 8' },
    ];
    const text = core.report(null, { ...INFO, trail: trailOf(entries, { last: { n: v, act: v, recheck: { checks: v }, drawn: v, all: v }, open: { disk: v, read: { total: v }, drawn: v } }) });
    for (const word of ['Zebedee', 'Marchbanks']) assert.ok(!text.includes(word), `${word} reached the report:\n${text}`);
    assert.ok(text.includes(['', 'Acts: 10 this visit, oldest first',
      '  1. an act in no form the report knows',
      '  2. an act in no form the report knows',
      '  3. Delete record with a malformed tag',
      '  4. Undo: an act in no form the report knows',
      '  5. Redo: an act in no form the report knows',
      '  6. An act: refused',
      '  7. Move lines 3–4: refused',
      '  8. Save, with change stamps (a note typed) and the date in the header: stopped at step 0 of 10.2',
      '  9. Open by another way: 0 lines, with a handle',
      '  10. an entry the report does not know', ''].join('\n')), text);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. The errors the page hit
// ---------------------------------------------------------------------------------------------

describe('the report: the errors the page hit, the last three, in the browser\'s words, at their place, never the stack', () => {
  it('each with its place as file:line:column, the file by its own name and never its folder, the act it came after, and a repeat counted', () => {
    const trail = trailOf([{ what: 'act', label: 'Edit line 8' }, { what: 'act', label: 'Edit line 9' }], {
      errorCount: 7,
      errors: [
        { words: 'TypeError: Cannot read properties of undefined (reading \'length\')', place: 'file:///Users/someone/Desktop/gedcom-viewer/ui.js:1196:31', count: 4, after: 2 },
        { words: 'RangeError: Maximum call stack size exceeded', place: 'https://gedcom-viewer.net/core.js?v=1:420:12', count: 1, after: 0 },
        { words: 'not an error, a string', place: '', count: 1, after: 1 },
      ],
    });
    const text = core.report(null, { ...INFO, trail });
    assert.ok(text.includes(['', 'Errors: 7 this visit; the last 3, oldest first',
      '  TypeError: Cannot read properties of undefined (reading \'length\'), at ui.js:1196:31, 4 times, after act 2',
      '  RangeError: Maximum call stack size exceeded, at core.js:420:12, before any act',
      '  not an error, a string, at a place not given, after act 1', ''].join('\n')), text);
    assert.ok(!text.includes('someone') && !text.includes('Desktop'), 'never the folder');
  });

  it('on one line, cut to 200 characters; a line, a value or a name of the file cut out first, should a fault have put one there', () => {
    const doc = open('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Zebedee /Marchbanks/\n1 BIRT\n2 PLAC Llanwrtyd Wells, Brecknockshire\n'
      + `1 NOTE ${'Saskatoon '.repeat(30)}\n0 TRLR\n`);
    core.editLine(doc, 3, '1 NAME Ottoline /Fairweather/');
    const errors = [
      { words: 'TypeError: Cannot create property \'x\' on string \'1 NAME Zebedee /Marchbanks/\'', place: 'ui.js:1:1', count: 1, after: 0 },
      { words: 'TypeError: Cannot use \'in\' operator to search for \'k\' in Llanwrtyd Wells, Brecknockshire', place: 'ui.js:2:2', count: 1, after: 0 },
      { words: `Error: Marchbanks of Brecknock.ged and Ottoline /Fairweather/ and ${'Saskatoon '.repeat(30).trim()}\nat the second line`, place: 'ui.js:3:3', count: 1, after: 0 },
    ];
    const text = core.report(doc.view, { ...INFO, trail: trailOf([], { errors, errorCount: 3 }), opened: doc.m, names: ['Marchbanks of Brecknock.ged'] });
    for (const word of ['Zebedee', 'Marchbanks', 'Llanwrtyd', 'Brecknock', 'Ottoline', 'Fairweather', 'Saskatoon']) assert.ok(!text.includes(word), `${word} is in the report:\n${text}`);
    assert.ok(text.includes('\n  TypeError: Cannot create property \'x\' on string \'…\', at ui.js:1:1, before any act\n'), text);
    assert.ok(text.includes('\n  TypeError: Cannot use \'in\' operator to search for \'k\' in …, at ui.js:2:2, before any act\n'), text);
    assert.ok(text.includes('\n  Error: … and … and …'), text);
    const padded = open(`0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NOTE x\n${' '.repeat(12)}Quixote${' '.repeat(12)}\n0 TRLR\n`);   // longer than the words, not once trimmed
    const pad = core.report(padded.view, { ...INFO, trail: trailOf([], { errors: [{ words: 'Error: Quixote', place: 'ui.js:5:5', count: 1, after: 0 }], errorCount: 1 }) });
    assert.ok(!pad.includes('Quixote'), 'a line with spaces around it is cut by its words alone');
    const long = core.report(null, { ...INFO, trail: trailOf([], { errors: [{ words: `Error: ${'a'.repeat(400)}`, place: 'ui.js:4:4', count: 1, after: 0 }], errorCount: 1 }) });
    const line = long.split('\n').find((l) => l.startsWith('  Error: '));
    assert.equal(line, `  Error: ${'a'.repeat(193)}…, at ui.js:4:4, before any act`);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Timings and the window
// ---------------------------------------------------------------------------------------------

describe('the report: how long the last open and the last act took, and the window\'s size', () => {
  it('the open by its parts, the read\'s own timings among them; the last act with its re-check; the window in CSS pixels, with its pixel ratio', () => {
    const trail = trailOf([{ what: 'open', by: 'drop', lines: 9, handle: true }, { what: 'act', label: 'Edit line 8' }], {
      open: { disk: 12.4, read: { lines: 40.2, checks: 120.6, gather: 9.5, labels: 10.1, total: 180.4 }, drawn: 220.2, all: 412.7 },
      last: { n: 2, act: 80.4, recheck: { checks: 60.2, gather: 4.6, labels: 5.3 }, drawn: 17.2, all: 97.5 },
    });
    const text = core.report(null, { ...INFO, window: { width: 1440, height: 900, ratio: 2 }, trail });
    assert.ok(text.includes('\nWhere: opened from disk · Chrome 154 · macOS\nWindow: 1,440 × 900 · pixel ratio 2\n'), text);
    assert.ok(text.includes('\nTiming of the last open, in ms: 413 in all · from disk 12 · read 180 (lines 40 · checks 121 · gather 9.5 · labels 10) · drawn 220\n'), text);
    assert.ok(text.includes('\nTiming of act 2, the last timed, in ms: 98 in all · the act 80, its re-check 70 (checks 60 · gather 4.6 · labels 5.3) · drawn 17\n'), text);
    const small = core.report(null, { ...INFO, trail: trailOf([{ what: 'act', label: 'Edit line 8' }], { last: { n: 1, act: 0.34, recheck: { checks: 0.21, gather: 0.04, labels: 0 }, drawn: 9.96, all: 1234.4 } }) });
    assert.ok(small.includes('\nTiming of act 1, the last timed, in ms: 1,234 in all · the act 0.3, its re-check 0.3 (checks 0.2 · gather 0 · labels 0) · drawn 10\n'), 'under 10 ms to a tenth, so a small file\'s act does not read 0');
    const zoomed = core.report(null, { ...INFO, window: { width: 1280.4, height: 711, ratio: 1.25 } });
    assert.ok(zoomed.includes('\nWindow: 1,280 × 711 · pixel ratio 1.25\n'), zoomed);
  });

  it('a file read in Node gives the timings the page reports, by the same names', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'family.ged'));
    assert.deepEqual(Object.keys(m.timings).sort(), ['checks', 'gather', 'labels', 'lines', 'total']);
    const doc = core.openDocument(h.bytesOfFile(path.join(h.SYNTHETIC, 'family.ged')));
    core.editLine(doc, 1, doc.view.texts[1]);
    core.deleteLine(doc, doc.view.n - 2);
    assert.deepEqual(Object.keys(doc.view.timings).sort(), ['checks', 'gather', 'labels'], 'the re-check after an act');
  });
});

// ---------------------------------------------------------------------------------------------
// Privacy: a made-up file full of names, places, dates and notes, edited every way the page can
// ---------------------------------------------------------------------------------------------

describe('the report holds no value of a file, after every kind of act on it', () => {
  // Every value here is made up, and chosen so that none can turn up in a report by chance. The
  // header's program, its version and the date it gives are in a report by P8's design (the File
  // line), as are the GEDCOM version and the encoding the header declares; nothing else from it is.
  const FILE = [
    '0 HEAD', '1 SOUR FICTIONTREE', '2 VERS 3.1', '2 NAME Fiction Tree Maker', '1 DATE 9 OCT 2026', '1 GEDC', '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', '1 SUBM @SUBMQUILL@',
    '0 @SUBMQUILL@ SUBM', '1 NAME Perpetua /Quillfeather/', '1 ADDR 14 Wrenfield Lane', '2 CITY Thistlecombe',
    '0 @ZEBEDEE1@ INDI', '1 NAME Zebedee /Marchbanks/', '2 GIVN Zebedee', '2 SURN Marchbanks', '1 SEX M',
    '1 BIRT', '2 DATE 17 SEP 1834', '2 PLAC Llanwrtyd Wells, Brecknockshire, Wales',
    '1 DEAT', '2 DATE 3 FEB 1901', '2 PLAC Saskatoon, Saskatchewan',
    '1 NOTE The orchard by the mill burned in the hard frost of that winter', '2 CONT and Zebedee carried water from the Afon Irfon all night',
    '1 OCCU Cooper and wheelwright', '1 _MILITARY Sergeant of the Brecknock Rifle Volunteers', '1 Marchbanks keeps the ledger',
    '1 FAMS @F17@',
    '0 @OTTOLINE2@ INDI', '1 NAME Ottoline /Fairweather/', '1 SEX F', '1 BIRT', '2 DATE ABT 1840', '2 PLAC Tregaron, Cardiganshire',
    '1 _Nickname Lina of the Lanterns', '1 FAMS @F17@',
    '0 @F17@ FAM', '1 HUSB @ZEBEDEE1@', '1 WIFE @OTTOLINE2@', '1 MARR', '2 DATE 22 JUN 1862', '2 PLAC Capel Soar-y-mynydd', '1 CHIL @HEPZIBAH3@',
    '0 @HEPZIBAH3@ INDI', '1 NAME Hepzibah /Marchbanks/', '1 FAMC @F17@', '1 EVEN Crossed the Atlantic aboard the Cambria Pride', '2 TYPE Emigration',
    '0 @S1@ SOUR', '1 TITL Parish register of St Cynllo, Llanbister', '1 AUTH Reverend Iolo Pennant-Gwilt',
    '0 Pennant private record', '1 NOTE Kept by Iolo in the vestry',
    '0 TRLR', '',
  ].join('\n');
  const NAME = 'Marchbanks of Brecknock.ged';
  const COPY = 'Marchbanks of Brecknock.2026-10-12T101500.ged';
  const TYPED = { name: '1 NAME Ottoline /Fairweather-Pryce/', note: '2 NOTE Whispering pines above Thistlecombe', stamp: 'Corrected after Aunt Gwenllian wrote' };
  const BY_DESIGN = new Set(['FICTIONTREE', '3.1', '9 OCT 2026', '5.5.1', 'UTF-8']);
  const WORDS = ['Zebedee', 'Marchbanks', 'Ottoline', 'Fairweather', 'Pryce', 'Hepzibah', 'Perpetua', 'Quillfeather', 'Wrenfield', 'Thistlecombe',
    'Llanwrtyd', 'Brecknock', 'Saskatoon', 'Saskatchewan', 'orchard', 'Irfon', 'wheelwright', 'Cooper', 'Sergeant', 'Volunteers', 'ledger',
    'Tregaron', 'Cardiganshire', 'Nickname', 'Lanterns', 'Soar-y-mynydd', 'Cambria', 'Emigration', 'Cynllo', 'Llanbister', 'Pennant', 'Iolo',
    'vestry', 'Whispering', 'Gwenllian', 'ZEBEDEE1', 'OTTOLINE2', 'HEPZIBAH3', 'SUBMQUILL', 'F17', '17 SEP 1834', '3 FEB 1901', 'ABT 1840',
    '22 JUN 1862', 'Fiction Tree Maker', 'LINEAGE-LINKED'];

  // The acts, made in core.js as the page makes them, and noted in the trail as ui.js notes them:
  // an act by its step's label, a refusal by what it was, a save by how it went.
  function visit() {
    const doc = open(FILE);
    const entries = [{ what: 'open', by: 'drop', lines: doc.m.n, handle: true }];
    const at = (t) => { const i = doc.view.texts.indexOf(t); assert.ok(i >= 0, `no line "${t}"`); return i; };
    const act = (r, more = {}) => { assert.ok(r.ok, r.reason); entries.push({ what: 'act', label: r.step.label, ...more }); };
    act(core.editLine(doc, at('1 NAME Ottoline /Fairweather/'), TYPED.name));
    act(core.addChild(doc, at('1 BIRT'), TYPED.note));
    const occu = at('1 OCCU Cooper and wheelwright');
    act(core.deleteLine(doc, occu));
    const deat = at('1 DEAT');
    const up = core.neighbourLanding(doc, deat, core.subtreeEnd(doc.view, deat), -1);
    assert.ok(up.ok, up.reason);
    act(core.moveLines(doc, deat, core.subtreeEnd(doc.view, deat), up.to), { by: 'up' });
    const removed = core.changeRuns(doc).find((r) => r.kind === 'removed');
    act(core.restoreLines(doc, removed.before, removed.lines.length));
    const undone = core.undo(doc);
    entries.push({ what: 'undo', label: undone.label });
    const redone = core.redo(doc);
    entries.push({ what: 'redo', label: redone.label });
    const bad = core.editLine(doc, at('2 PLAC Saskatoon, Saskatchewan'), '2 PLAC Saskatoon\nRegina');
    assert.ok(!bad.ok, 'a line ending typed into a line is refused');
    entries.push({ what: 'refused', act: 'edit', line: at('2 PLAC Saskatoon, Saskatchewan') + 1 });
    const plan = core.recordDeletion(doc, at('0 @HEPZIBAH3@ INDI'));
    act(core.deleteRecord(doc, plan.from), { line: plan.from + 1, pointers: plan.pointers.filter((p) => p.ticked).length });
    const saved = core.saveActs(doc, new Date(2026, 9, 12, 10, 15, 0), { stamps: true, typed: TYPED.stamp, header: true });
    assert.ok(saved.ok, saved.reason);
    core.moveOntoCopy(doc);
    entries.push({ what: 'save', by: 'dialog', stamps: true, note: true, header: true, outcome: 'saved' });
    const back = core.undo(doc);
    entries.push({ what: 'undo', label: back.label });
    return { doc, entries };
  }

  it('none of its names, places, dates, notes, ids or tags typed where a tag goes, nor any line or value, read or typed', () => {
    const { doc, entries } = visit();
    const errors = [
      { words: `TypeError: Cannot create property 'x' on string '${TYPED.name}'`, place: 'ui.js:1196:31', count: 1, after: 5 },
      { words: `Error: ${NAME} and ${COPY} could not be read`, place: 'save.js:12:3', count: 2, after: 9 },
      { words: 'TypeError: Cannot use \'in\' operator to search for \'k\' in Llanwrtyd Wells, Brecknockshire, Wales', place: 'core.js:7:7', count: 1, after: 12 },
    ];
    const trail = trailOf(entries, { errors, errorCount: 4, open: { disk: 1, read: doc.m.timings, drawn: 2, all: 3 },
      last: { n: entries.length, act: 4, recheck: doc.view.timings, drawn: 5, all: 9 } });
    const text = built(doc.view, { ...INFO, window: { width: 1440, height: 900, ratio: 2 }, editing: true, unsaved: core.changeRuns(doc).length,
      trail, opened: doc.m, names: [NAME, COPY] });
    for (const word of WORDS) assert.ok(!text.includes(word), `"${word}" is in the report:\n${text}`);
    const seen = [];
    for (const m of [doc.m, doc.view]) {
      for (let i = 0; i < m.n; i += 1) {
        const line = m.texts[i].trim();
        if (line.length >= 3 && text.includes(line)) seen.push(`line "${line}"`);
        const value = m.valAt[i] >= 0 ? m.texts[i].slice(m.valAt[i]).trim() : '';
        if (value.length >= 3 && !BY_DESIGN.has(value) && text.includes(value)) seen.push(`value "${value}"`);
      }
    }
    for (const typed of Object.values(TYPED)) if (text.includes(typed)) seen.push(`typed "${typed}"`);
    assert.deepEqual(seen, [], text);
    // and it still says what happened, in order, by the acts' own labels
    assert.match(text, /\nActs: 12 this visit; the last 10, oldest first\n {2}3\. Add line \d+\n {2}4\. Delete line \d+\n {2}5\. Move lines \d+–\d+ to \d+, by ⌥↑\n {2}6\. Restore a line\n {2}7\. Undo: Restore a line\n {2}8\. Redo: Restore a line\n {2}9\. Edit line \d+: refused\n {2}10\. Delete record INDI, at line \d+, with 1 line that pointed at it\n {2}11\. Save, with change stamps \(a note typed\) and the date in the header: saved\n {2}12\. Undo: Change stamps and the date in the header\n/);
    assert.match(text, /\nChecks: E10 2 · N3 1\n {2}E10 2: a malformed tag under INDI \(line \d+\) · a malformed tag at level 0 \(line \d+\)\n {2}N3 1: SOUR at level 0 \(line \d+\)\n/);
    assert.match(text, /\nRecords: INDI 2 · HEAD 1 · SUBM 1 · FAM 1 · SOUR 1 · a malformed tag 1 · TRLR 1\n/);
    assert.match(text, /\nErrors: 4 this visit; the last 3, oldest first\n {2}TypeError: Cannot create property 'x' on string '…', at ui\.js:1196:31, after act 5\n {2}Error: … and … could not be read, at save\.js:12:3, 2 times, after act 9\n {2}TypeError: Cannot use 'in' operator to search for 'k' in …, at core\.js:7:7, after act 12\n/);
    assert.match(text, /\nFile: 1,234 bytes · \d+ lines · UTF-8 · GEDCOM 5\.5\.1 · exported 9 OCT 2026 by FICTIONTREE 3\.1 · sha256 abcdef012345…\n/);
    assert.equal(tool(text).code, 0, 'and it reads back as built');
  });
});

// ---------------------------------------------------------------------------------------------
// The page's side (ui.js), read as text: what it notes in the trail, and the errors it listens for
// ---------------------------------------------------------------------------------------------

describe('the page notes the trail as numbers and fixed words, an act by its step\'s label alone', () => {
  const ui = fs.readFileSync(path.join(h.ROOT, 'ui.js'), 'utf8');
  const KEYS = new Set(['what', 'act', 'label', 'line', 'end', 'count', 'by', 'outcome', 'lines', 'handle', 'pointers', 'stamps', 'note', 'header', 'step']);

  it('every entry it notes holds only the keys core.js reads, and a label is a step\'s own', () => {
    const notes = [...ui.matchAll(/\b(?:noteAct|acted)\(((?:\{[^{}]*\})|(?:[^;]*?\? \{[^{}]*\} : \{[^{}]*\}))/g)].map((x) => x[1]);
    assert.ok(notes.length >= 20, `${notes.length} entries noted`);
    for (const literal of notes) {
      for (const obj of literal.match(/\{[^{}]*\}/g)) {
        const body = obj.slice(1, -1).trim();
        const keys = body.split(/,(?![^(]*\))/).map((p) => p.trim().split(':')[0].trim()).filter((k) => k && !k.startsWith('...'));
        for (const k of keys) assert.ok(KEYS.has(k), `${k} in ${obj}`);
        const label = /label: ([^,}]+)/.exec(body);
        if (label) assert.ok(['r.step.label', 'step.label', 'undone.label'].includes(label[1].trim()), `a label from ${label[1]}`);
      }
    }
    assert.ok(!/noteAct\(\{[^}]*reason/.test(ui), 'never a refusal\'s reason');
    assert.ok(!/noteAct\(\{[^}]*(?:text|fileName|file\.name|value)\b/.test(ui), 'never a line\'s text, a value or a name');
  });

  it('it listens for the window\'s errors and unhandled rejections from the start, keeps the last three with their places and no stack', () => {
    const top = ui.indexOf("window.addEventListener('error'");
    assert.ok(top > 0 && top < ui.indexOf('const state = {'), 'before the page is set up');
    assert.ok(ui.includes("window.addEventListener('unhandledrejection', (e) => caught(e.reason));"));
    assert.ok(ui.includes('const TRAIL_ERRORS = 3;') && ui.includes('const TRAIL_ACTS = 10;'));
    assert.ok(!/stack: /.test(ui.slice(top, ui.indexOf('const state = {'))), 'a stack is read for its first place, and never kept');
    const report = ui.slice(ui.indexOf('async function reportProblem()'));
    assert.ok(report.includes('window: { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio }') && report.includes('trail,'));
    assert.ok(report.includes('for (const build of [() => C.report(state.m, info), () => C.report(null, info), () => C.report(null, { ...info, trail: null })]) {')
      && report.includes('} catch (e) { caught(e); }'), 'a report that fails to build is an error noted, and a smaller one is built');
  });
});
