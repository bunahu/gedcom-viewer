/* gedview — save.js
 *
 * Saving: the names of BUILD-BRIEF 10.1, Save in place in the order of 10.2, Save a copy (10.3)
 * and the log block (10.5). It works over "handles" passed to it — a folder and the files in it,
 * with the few methods the browser's file-system handles have — and never touches the page, so
 * the tests run it under Node over in-memory stand-ins (tests/fake-handles.js), and the page runs
 * it over the real ones. core.js gives it the document, the stamps and the bytes; the caller gives
 * it the hash (the page crypto.subtle, Node node:crypto).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.GedSave = factory(root.GedCore);
})(typeof self !== 'undefined' ? self : this, function (core) {
  'use strict';

  const HISTORY = 'gedview-history';
  const utf8 = new TextEncoder();
  const two = (n) => String(n).padStart(2, '0');

  // ---------------------------------------------------------------------------------------------
  // 10.1 Names
  // ---------------------------------------------------------------------------------------------

  // Local time, YYYY-MM-DDTHHMMSS.
  function timestamp(d) {
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  }

  // The log's time: local, with its offset from UTC — 2026-09-28T15:42:00-04:00.
  function logTime(d) {
    const off = -d.getTimezoneOffset();
    const a = Math.abs(off);
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:` +
      `${two(d.getSeconds())}${off < 0 ? '-' : '+'}${two(Math.floor(a / 60))}:${two(a % 60)}`;
  }

  // The stem is the file's name without its last extension when that is .ged or .gedcom, in any
  // case; the extension is kept as written.
  function split(name) {
    const m = /^(.+)(\.ged(?:com)?)$/i.exec(name);
    return m ? { stem: m[1], ext: m[2] } : { stem: name, ext: '' };
  }

  // The names of a save made at `when`. A copy's name that is taken gets -2, -3 … before its
  // extension, so it still ends as the file does; a backup's name the same, so that no backup is
  // ever written over.
  function names(fileName, when) {
    const { stem, ext } = split(fileName);
    const t = timestamp(when);
    const nth = (k) => (k > 1 ? `-${k}` : '');
    return {
      backup: (k) => `${stem}.${t}${nth(k)}${ext}.bak`,              // in gedview-history/
      copy: (k) => `${stem}.${t}${nth(k)}${ext}`,
      log: `${fileName}.edits.log`,
      logDownload: `${fileName}.${t}.edits.log`,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // 10.5 The log block
  // ---------------------------------------------------------------------------------------------

  // One block: what was saved, when, where, with what note, the file before and after, the backup,
  // and the net change run by run — each line's place before, then after, its record, and the
  // lines themselves, - as they were and + as they are. A copy's block names the copy and has no
  // backup. It holds what the file holds, living people included: it belongs beside the file,
  // never in a repo (I9).
  function logBlock(o) {
    const out = [o.copy ? `=== ${logTime(o.when)}  copy  ${o.file} -> ${o.copy}` : `=== ${logTime(o.when)}  save  ${o.file}`];
    out.push(`note     ${o.note}`);
    out.push(`before   sha256 ${o.before.sha256}  ${o.before.bytes} bytes  ${o.before.lines} lines`);
    out.push(`after    sha256 ${o.after.sha256}  ${o.after.bytes} bytes  ${o.after.lines} lines`);
    if (o.backup) out.push(`backup   ${o.backup}`);
    const span = (first, count) => (first < 0 ? '' : count > 1 ? `${first + 1}-${first + count}` : `${first + 1}`);
    const rows = o.runs.map((r) => ({ r, b: span(r.before, r.lines.length), a: span(r.after, r.lines.length) }));
    const wb = Math.max(0, ...rows.map((x) => x.b.length));
    const wa = Math.max(0, ...rows.map((x) => x.a.length));
    for (const { r, b, a } of rows) {
      const record = r.record ? `${r.record.id ? `${r.record.id} ` : ''}${r.record.tag || ''}` : '';
      const head = `${r.kind.padEnd(7)}  ${b.padEnd(wb)}${r.kind === 'changed' ? ' -> ' : '    '}${a.padEnd(wa)}  ${record}`;
      out.push(`${head}${r.stamp ? '  (change stamp)' : ''}`.trimEnd());
      for (const l of r.lines) {
        if (l.was !== null) out.push(`  - ${l.was}`);
        if (l.now !== null) out.push(`  + ${l.now}`);
        if (l.ending) out.push(`    line ending: ${l.ending[0]} -> ${l.ending[1]}`);
      }
    }
    return `${out.join('\n')}\n\n`;
  }

  // ---------------------------------------------------------------------------------------------
  // Handles
  // ---------------------------------------------------------------------------------------------

  async function bytesOfHandle(handle) {
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  }

  async function writeAll(handle, bytes) {
    const w = await handle.createWritable();
    await w.write(bytes);
    await w.close();
  }

  async function exists(dir, name) {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch (e) {
      if (e.name === 'NotFoundError') return false;
      if (e.name === 'TypeMismatchError') return true;               // a folder of that name
      throw e;
    }
  }

  async function freeName(dir, make) {
    for (let k = 1; ; k += 1) if (!(await exists(dir, make(k)))) return make(k);
  }

  // The log: opened keeping what is there, written at its end, never rewritten (10.5).
  async function appendLog(dir, name, text) {
    const handle = await dir.getFileHandle(name, { create: true });
    const size = (await handle.getFile()).size;
    const w = await handle.createWritable({ keepExistingData: true });
    await w.seek(size);
    await w.write(utf8.encode(text));
    await w.close();
  }

  const failed = (step, say, more) => ({ done: false, step, say, ...more });
  const reason = (e) => `${e.name || 'Error'}: ${e.message}`;

  // ---------------------------------------------------------------------------------------------
  // 10.2 Save, in place; 10.3 Save a copy
  // ---------------------------------------------------------------------------------------------

  // 10.2 step 3: the file on disk, read through the folder, must be the file as it was opened or
  // last saved. The page asks this before it shows the Save dialog, and save() asks it again just
  // before anything is written, for the file may change while the dialog is open (I7).
  async function checkDisk({ dir, name, diskHash, hash }) {
    let handle;
    let bytes;
    try {
      handle = await dir.getFileHandle(name);
      bytes = await bytesOfHandle(handle);
    } catch (e) {
      return failed(3, `${name} could not be read from its folder (${reason(e)}). Nothing was written.`);
    }
    const sha256 = await hash(bytes);
    if (sha256 !== diskHash) {
      return failed(3, `${name} changed on disk since it was opened or last saved. Nothing was written.`, { changedOnDisk: true });
    }
    return { done: true, handle, bytes, sha256 };
  }

  // 10.2 steps 5 and 6, shared by every way of saving: the change stamps, when they are ticked, as
  // one step of the history; then the net change as it will be logged, and the bytes.
  function prepare(doc, { when, note, stamps }) {
    const typed = core.stampNote(doc, note);
    if (typed.reason) return { reason: typed.reason };
    if (stamps) {
      const r = core.applyStamps(doc, when, note);
      if (!r.ok) return { reason: r.reason };
    }
    return { note: typed.text, runs: core.changeRuns(doc), bytes: core.saveBytes(doc) };
  }

  // 10.2 — Save, in place, in this order, stopping at the first failure. `dir` is the folder the
  // owner granted (step 2 is the page's, as is the dialog of step 4); `name` the file's name in it;
  // `disk` the file as it was opened or last saved: { sha256, bytes, lines }. `stamps` says whether
  // the change stamps are ticked; `when` is the moment of the save. What happened comes back, for
  // the page to say: `done`, or the step that stopped it and why.
  async function save({ doc, dir, name, disk, when, note, stamps, hash }) {
    // 1. nothing changed: say so, write nothing
    if (!core.isChanged(doc)) return failed(1, 'Nothing has changed since the file was opened or last saved. Nothing was written.');
    // 3. the file on disk is still the file as opened or last saved
    const now = await checkDisk({ dir, name, diskHash: disk.sha256, hash });
    if (!now.done) return now;
    // 5, 6. the stamps; the bytes and their hash
    const nm = names(name, when);
    const ready = prepare(doc, { when, note, stamps });
    if (ready.reason) return failed(5, ready.reason);
    const after = { sha256: await hash(ready.bytes), bytes: ready.bytes.length, lines: doc.order.length };
    // 7. the backup, from the bytes read in step 3; read back; the hashes equal
    let backupName;
    try {
      const history = await dir.getDirectoryHandle(HISTORY, { create: true });
      backupName = await freeName(history, nm.backup);
      const backup = await history.getFileHandle(backupName, { create: true });
      await writeAll(backup, now.bytes);
      if ((await hash(await bytesOfHandle(backup))) !== now.sha256) {
        return failed(7, `The backup ${HISTORY}/${backupName} did not read back as the file. ${name} was not touched.`);
      }
    } catch (e) {
      return failed(7, `The backup could not be written (${reason(e)}). ${name} was not touched.`);
    }
    const backupPath = `${HISTORY}/${backupName}`;
    // 8. the file; read back; its hash equals step 6's
    try {
      await writeAll(now.handle, ready.bytes);
      if ((await hash(await bytesOfHandle(now.handle))) !== after.sha256) {
        return failed(8, `${name} did not read back as it was written. The file as it was is in ${backupPath}.`, { loud: true, backup: backupPath });
      }
    } catch (e) {
      return failed(8, `${name} could not be written (${reason(e)}). The file as it was is in ${backupPath}.`, { loud: true, backup: backupPath });
    }
    // 9. the log block; a failure here is said, and the save stands
    let logged = null;
    try {
      await appendLog(dir, nm.log, logBlock({ when, file: name, note: ready.note, before: disk, after, backup: backupPath, runs: ready.runs }));
    } catch (e) {
      logged = `The save stands, but its log block could not be written to ${nm.log} (${reason(e)}).`;
    }
    // 10. the new hash is the file's; the lines as they now are are the file on disk
    core.markSaved(doc);
    return { done: true, disk: after, backup: backupPath, log: nm.log, logFailed: logged, runs: ready.runs };
  }

  // 10.3 — Save a copy, into the folder: steps 5 and 6 (the page does 4), then the copy under its
  // dated name, read back and compared, and a log block appended to the original's log. The
  // original is untouched, so the document stays unsaved against it. A copy is written even when
  // nothing changed — a dated copy is what was asked for (section 15's editing walk writes one
  // after an undo has left nothing changed), so 10.3's step 1 is not taken here.
  async function saveCopy({ doc, dir, name, disk, when, note, stamps, hash }) {
    const nm = names(name, when);
    const ready = prepare(doc, { when, note, stamps });
    if (ready.reason) return failed(5, ready.reason);
    const after = { sha256: await hash(ready.bytes), bytes: ready.bytes.length, lines: doc.order.length };
    let copyName;
    try {
      copyName = await freeName(dir, nm.copy);
      const handle = await dir.getFileHandle(copyName, { create: true });
      await writeAll(handle, ready.bytes);
      if ((await hash(await bytesOfHandle(handle))) !== after.sha256) {
        return failed(6, `The copy ${copyName} did not read back as it was written.`, { loud: true });
      }
    } catch (e) {
      return failed(6, `The copy could not be written (${reason(e)}).`, { loud: true });
    }
    let logged = null;
    try {
      await appendLog(dir, nm.log, logBlock({ when, file: name, copy: copyName, note: ready.note, before: disk, after, runs: ready.runs }));
    } catch (e) {
      logged = `The copy stands, but its log block could not be written to ${nm.log} (${reason(e)}).`;
    }
    return { done: true, copy: copyName, disk: after, log: nm.log, logFailed: logged, runs: ready.runs };
  }

  // 10.3 — Save a copy with no folder access, or in a browser with no pickers: the page writes the
  // copy where the owner picks, or downloads it, and offers the log block as a second file. This
  // gives it what to write: the copy's bytes and name, and the log block with its name.
  async function copyFiles({ doc, name, disk, when, note, stamps, hash }) {
    const nm = names(name, when);
    const ready = prepare(doc, { when, note, stamps });
    if (ready.reason) return failed(5, ready.reason);
    const after = { sha256: await hash(ready.bytes), bytes: ready.bytes.length, lines: doc.order.length };
    const copyName = nm.copy(1);
    return {
      done: true, copy: copyName, bytes: ready.bytes, disk: after, runs: ready.runs, logName: nm.logDownload,
      logText: (actualName) => logBlock({ when, file: name, copy: actualName || copyName, note: ready.note, before: disk, after, runs: ready.runs }),
    };
  }

  // A copy written through a handle the owner picked: written, read back, compared.
  async function writeChecked(handle, bytes, hash) {
    await writeAll(handle, bytes);
    return (await hash(await bytesOfHandle(handle))) === (await hash(bytes));
  }

  return {
    HISTORY, timestamp, logTime, split, names, logBlock,
    checkDisk, save, saveCopy, copyFiles, writeChecked,
  };
});
