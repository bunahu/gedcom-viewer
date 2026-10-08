// P8 — a problem report: counts and codes only, never a line of the file; its checksum; and the
// tool that reads one back.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const h = require('./helpers.js');
const core = require('../core.js');

const INFO = { version: '0.5.3', where: 'opened from disk', browser: 'Chrome 154 · macOS', bytes: 1234,
  sha256: 'abcdef0123456789'.repeat(4), editing: false, unsaved: 0, settings: 'theme light · Indent off · Bold surnames off' };
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const built = (m) => { const t = core.report(m, INFO); return core.withChecksum(t, sha(`${t}\n`)); };
const tool = (text) => {
  const r = spawnSync(process.execPath, [path.join(h.ROOT, 'tools', 'report-check.js')], { input: text, encoding: 'utf8' });
  return { code: r.status, said: r.stdout.trim() };
};

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
    assert.match(text, /\nChecks: (none|[EN]\d \d+.*)\n/);
  });

  it('an error check names its lines, numbers only: E7 in e6-e7-ids.ged', () => {
    const m = h.readFile(path.join(h.SYNTHETIC, 'e6-e7-ids.ged'));
    const text = built(m);
    const e7 = m.findings.byCode.E7;
    assert.ok(e7.length > 0, 'the fixture holds an E7');
    assert.match(text, new RegExp(`E7 ${e7.length} \\(lines? [\\d, and]+\\)`), text);
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
});
