// GEDCOM Viewer. Copyright (C) 2026 bunahu. Free software under the GNU General Public License, version 3 or later: see LICENSE.
/* GEDCOM Viewer — save.js
 *
 * Saving (BUILD-BRIEF section 10): the dated name of 10.1, Save in the order of 10.2, and the
 * Changes text of 10.3. The original is never written: every save is a new, dated file, where the
 * person chooses in the computer's Save dialog, or a download in a browser without that dialog.
 * It works over "handles" passed to it, with the few methods the browser's file handles have, and
 * over the Save dialog passed to it as a function, and never touches the page; so the tests run it
 * under Node over in-memory stand-ins (tests/fake-handles.js), and the page runs it over the real
 * ones. core.js gives it the document, the stamps and the bytes; the caller gives it the hash (the
 * page crypto.subtle, Node node:crypto).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.GedSave = factory(root.GedCore);
})(typeof self !== 'undefined' ? self : this, function (core) {
  'use strict';

  const two = (n) => String(n).padStart(2, '0');

  // ---------------------------------------------------------------------------------------------
  // 10.1 The name
  // ---------------------------------------------------------------------------------------------

  // Local time, YYYY-MM-DDTHHMMSS.
  function timestamp(d) {
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  }

  // Local time with its offset from UTC, for the Changes text: 2026-10-08T15:12:00-04:00.
  function localTime(d) {
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

  // A stem that ends in a dated copy's timestamp: a copy opened and saved again. The -2 or -3 that
  // versions before 0.5.6 put after a timestamp already taken counts as part of it.
  const DATED = /\.\d{4}-\d\d-\d\dT\d{6}(?:-\d+)?$/;

  // The name of a copy saved at `when`: <stem>.<timestamp><ext>. A stem that already ends in a
  // timestamp has it replaced, not stacked: RAW.2026-10-08T151200.ged saved again is
  // RAW.2026-10-08T160500.ged. The name is offered; the person may change it.
  function datedName(fileName, when) {
    const { stem, ext } = split(fileName);
    return `${stem.replace(DATED, '')}.${timestamp(when)}${ext}`;
  }

  // ---------------------------------------------------------------------------------------------
  // 10.3 The Changes text
  // ---------------------------------------------------------------------------------------------

  // What a moved run carries (3.4a), for the Changes panel and the Save dialog: a block by its tag,
  // a record, or a section by its type and its count of records; and how many lines. Never their text.
  function movedWords(r) {
    const mv = r.moved;
    const lines = `${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'}`;
    if (mv.what === 'record') return `record · ${lines}`;
    if (mv.what === 'section') return `section ${mv.tag || 'of records'} · ${mv.records} records · ${lines}`;
    const same = mv.sameKind ? ` · among its ${mv.sameKind} ${mv.tag} lines the first is read as preferred` : '';
    return `${mv.tag || 'block'} · ${lines}${same}`;
  }

  // The same, for the Changes text, which names the record already: a record moved whole is its
  // count of lines alone.
  function movedText(r) {
    const mv = r.moved;
    const lines = `${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'}`;
    if (mv.what === 'record') return lines;
    if (mv.what === 'section') return `section ${mv.tag || 'of records'}, ${mv.records} records, ${lines}`;
    const same = mv.sameKind ? `; among its ${mv.sameKind} ${mv.tag} lines the first is read as preferred` : '';
    return `${mv.tag || 'block'}, ${lines}${same}`;
  }

  // What the Changes tab's copy button puts on the clipboard (10.3), and nothing writes anywhere:
  // the original by its name, as of now; its sha256, size and lines, as it was opened; then the
  // net change from it, run by run, in the lines the log's blocks had: each run's place in the
  // original, then its place now, its record, and its lines, - as they were and + as they are. A
  // move says what moved and how many lines, never their text. It holds what the file holds,
  // living people included, and belongs beside the file, never in a repo (I9).
  function changesText({ when, file, original, runs }) {
    const out = [`GEDCOM Viewer  changes to ${file}  as of ${localTime(when)}`];
    out.push(`original  sha256 ${original.sha256}  ${original.bytes} bytes  ${original.lines} lines`);
    const span = (first, count) => (first < 0 ? '' : count > 1 ? `${first + 1}-${first + count}` : `${first + 1}`);
    const rows = runs.map((r) => ({ r, b: span(r.before, r.lines.length), a: span(r.after, r.lines.length) }));
    const wb = Math.max(0, ...rows.map((x) => x.b.length));
    const wa = Math.max(0, ...rows.map((x) => x.a.length));
    for (const { r, b, a } of rows) {
      const record = r.record ? `${r.record.id ? `${r.record.id} ` : ''}${r.record.tag || ''}` : '';
      const places = r.kind === 'changed' || r.kind === 'moved' ? `${b} -> ${a}` : `${b.padEnd(wb)}    ${a}`;
      const head = `${r.kind.padEnd(7)}  ${places.padEnd(wb + 4 + wa)}`;
      const tail = r.kind === 'moved' ? `(${movedText(r)})` : r.stamp ? '(change stamp)' : '';
      out.push([head, record, tail].filter((x) => x).join('  ').trimEnd());
      for (const l of r.lines) {
        if (l.was !== null) out.push(`  - ${l.was}`);
        if (l.now !== null) out.push(`  + ${l.now}`);
        if (l.ending) out.push(`    line ending: ${l.ending[0]} -> ${l.ending[1]}`);
      }
    }
    return `${out.join('\n')}\n`;
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

  // A file written through a handle the person picked: written, read back, compared.
  async function writeChecked(handle, bytes, hash) {
    await writeAll(handle, bytes);
    return (await hash(await bytesOfHandle(handle))) === (await hash(bytes));
  }

  const failed = (step, say, more) => ({ done: false, step, say, ...more });
  const reason = (e) => `${e.name || 'Error'}: ${e.message}`;

  // ---------------------------------------------------------------------------------------------
  // 10.2 Save
  // ---------------------------------------------------------------------------------------------

  const REFUSED = 'That is the original. GEDCOM Viewer never writes over it. Pick another name.';

  // Step 1's words: since the last copy, or since the open when none has been written.
  function nothingSince(doc) {
    return `Nothing has changed since ${doc.copiedOrder ? 'the last copy' : 'the file was opened'}. Nothing was written.`;
  }

  // Steps 3 and 4: the change stamps, when they are ticked, as one step of the history, with the
  // note for them; then the bytes. Unticked, the note goes nowhere and is not read.
  function prepare(doc, { when, note, stamps }) {
    const undone = doc.undone.slice();
    let step = null;
    if (stamps) {
      const r = core.applyStamps(doc, when, note);
      if (!r.ok) return { reason: r.reason };
      step = r.step;
    }
    return { bytes: core.saveBytes(doc), back: () => core.takeBack(doc, step, undone) };
  }

  // Step 6: whether the file picked is the original's own. A file opened in a browser with the
  // pickers has a handle, and the browser says whether two handles are one file; a handle that
  // cannot say, and a file opened with none, are held to the original's name.
  async function isOriginal(handle, original) {
    if (original.handle && typeof original.handle.isSameEntry === 'function') {
      try { return await original.handle.isSameEntry(handle); } catch (e) { /* by its name, below */ }
    }
    return handle.name === original.name;
  }

  // The original, picked in the Save dialog, may have been emptied by the browser before the page
  // could refuse it: Chromium creates the picked file, or truncates it to nothing when it exists,
  // before it hands the page its handle. Emptied, it is put back from `bytes`, the file as it was
  // read just before the dialog, and read back. A file that is not empty was left as it was, and
  // nothing is written into it.
  async function putBack(handle, bytes, hash) {
    try {
      if ((await handle.getFile()).size > 0 || bytes.length === 0) return { emptied: false, ok: true };
      await writeAll(handle, bytes);
      if ((await hash(await bytesOfHandle(handle))) === (await hash(bytes))) return { emptied: true, ok: true };
      return { emptied: true, ok: false, why: 'it did not read back as it was' };
    } catch (e) {
      return { emptied: true, ok: false, why: reason(e) };
    }
  }

  // 10.2: Save, in this order, stopping at the first failure. Step 2, the page's own dialog (the
  // changes, the note, the change-stamp box), is the page's, before this is called. `original` is
  // the file as it was opened: its name, and its handle (null when the browser gave none). `pick`
  // is the computer's Save dialog, given the dated name to offer (the page's showSaveFilePicker,
  // opening at the original); with none, in a browser without the pickers, the copy comes back to
  // be downloaded. `stamps` says whether the change stamps are ticked and `note` is what was typed
  // for them; `when` is the moment of the save. What happened comes back for the page to say:
  // `done`, or the step that stopped it and why. Whatever stops it after step 3 takes the stamps
  // back, so the document is as it was before the attempt.
  async function save({ doc, original, when, note, stamps, hash, pick }) {
    // 1. nothing changed since the last copy: say so, write nothing
    if (!core.changedSinceCopy(doc)) return failed(1, nothingSince(doc));
    // 3. the change stamps; 4. the bytes, and their hash
    const ready = prepare(doc, { when, note, stamps });
    if (ready.reason) return failed(3, ready.reason);
    const name = datedName(original.name, when);
    const sha256 = await hash(ready.bytes);
    if (!pick) {
      // a browser with no pickers: downloaded under the dated name, wherever the browser keeps
      // downloads; nothing can be read back, and the download is the last copy
      core.markCopied(doc);
      return { done: true, download: true, name, bytes: ready.bytes, sha256 };
    }
    // 5. where: the Save dialog. The file picked there is emptied before the page sees it, so the
    // original is read now, while it is whole, in case it is the one picked (step 6)
    const before = original.handle ? await bytesOfHandle(original.handle).catch(() => null) : null;
    let handle;
    try {
      handle = await pick(name);
    } catch (e) {
      ready.back();
      return failed(5, e.name === 'AbortError' ? 'No copy was written.' : `No copy was written (${reason(e)}).`, { cancelled: e.name === 'AbortError' });
    }
    // 6. the file picked must not be the original
    if (await isOriginal(handle, original)) {
      ready.back();
      const bytes = before || doc.m.bytes;
      const back = await putBack(handle, bytes, hash);
      if (back.ok) {
        return failed(6, back.emptied ? `${REFUSED} Your browser emptied it as it was picked, so GEDCOM Viewer put it back as it was, byte for byte.` : REFUSED, { original: true });
      }
      return failed(6, `That is the original, ${original.name}. GEDCOM Viewer never writes over it, but your browser emptied it as it was picked, ` +
        `and GEDCOM Viewer could not put it back (${back.why}). Download it as it was, and put it in place of the empty one.`,
      { original: true, loud: true, restore: bytes });
    }
    // 7. the bytes; read back; the hash equals step 4's
    let read;
    try {
      await writeAll(handle, ready.bytes);
      read = await hash(await bytesOfHandle(handle));
    } catch (e) {
      ready.back();
      return failed(7, `The copy, ${handle.name}, could not be written (${reason(e)}). The original, ${original.name}, is as it was.`, { loud: true });
    }
    if (read !== sha256) {
      ready.back();
      return failed(7, `The copy, ${handle.name}, did not read back as it was written: do not rely on it. The original, ${original.name}, is as it was.`, { loud: true });
    }
    // 8. the copy is the last copy; the page stays on the original
    core.markCopied(doc);
    return { done: true, name: handle.name, sha256 };
  }

  return {
    timestamp, localTime, split, datedName, movedWords, changesText, nothingSince,
    save, bytesOfHandle, writeChecked,
  };
});
