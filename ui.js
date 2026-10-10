// GEDCOM Viewer. Copyright (C) 2026 bunahu. Free software under the GNU General Public License, version 3 or later: see LICENSE.
/* GEDCOM Viewer — ui.js
 *
 * The page: the grid, the panels, the right pane, the dialogs, the keys. It is the only file that
 * knows the page and the browser's file pickers exist; what it shows, it asks core.js for, and
 * every save goes through save.js. Text from a file always goes into the page as text, never as
 * markup.
 */
(function () {
  'use strict';

  const C = window.GedCore;
  const S = window.GedSave;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('en-US');
  const root = document.documentElement;
  // The computer's own Open and Save dialogs (Chrome, Edge). Without them a file is opened through
  // the file box, and Save is Download a copy (10.2).
  const PICKERS = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  const GEDCOM_TYPES = [{ description: 'GEDCOM', accept: { 'application/x-gedcom': ['.ged', '.gedcom'] } }];

  // Remembered between visits: preferences only, never a file's name, content or handle. Storage
  // may be missing or refused (a private window); then nothing is remembered.
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(`gedview.${key}`);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`gedview.${key}`, JSON.stringify(value)); } catch (e) { /* not remembered */ }
    },
  };

  const THEMES = ['system', 'light', 'dusk', 'dark'];     // System follows the computer's light or dark
  const TEXT_SIZES = ['normal', 'larger'];
  const RECORD_NAMES = {
    INDI: 'People', FAM: 'Families', SOUR: 'Sources', OBJE: 'Media', REPO: 'Repositories',
    NOTE: 'Notes', SNOTE: 'Notes', SUBM: 'Submitters',
  };
  const CHECK = Object.fromEntries(C.CHECKS.map((c) => [c.code, c]));
  // Findings whose detail is a sentence; the rest show the line they are on.
  const SAYS_WHAT = new Set(['E4', 'E9', 'N6', 'N7']);
  const ROW_CHARS = 2000;             // a row shows at most this much of its line
  const MAX_PIXELS = 33000000;        // about the tallest a page lets one element be
  const MAX_INDENT = 40;              // a level past this is set in no further
  const POINTERS_SHOWN = 1000;
  const LINES_SHOWN = 60;             // of one change, in the Save dialog
  const ID_WHOLE = /^@[^@ ]+@$/;
  const SHA_TITLE = 'sha256: a fingerprint of the file\'s exact bytes, as it was opened. ' +
    'Change one character anywhere and it changes completely; two files with the same sha256 are the same, ' +
    'byte for byte. GEDCOM Viewer never writes this file; a copy\'s own is shasum -a 256 and the copy\'s name, in Terminal.';
  const CANCEL = { label: 'Cancel', value: '' };
  // 3.6 — what each check means, why it matters, and what is usually done about it. The owner's
  // to change.
  const CHECK_HELP = {
    E1: "This line doesn't begin with a level number, so no program can tell where it belongs in the tree. It is usually the tail of a value that broke onto a line of its own, or text pasted in by mistake. Join it to the line it came from as a CONC or CONT line, or delete it.",
    E2: "This line begins with a number but isn't in GEDCOM's shape — a level, an optional @id@, a tag, then the value, one space apart. Typical causes: a leading zero (01), no space after the level, an id missing its closing @, or a character in the tag other than a letter, digit or underscore. Other programs may skip it or misread it. Retype it in the right shape.",
    E3: "This line is more than one level deeper than the line above it — a 3 straight under a 1 — so the level between is missing; or the file doesn't open at level 0. Programs attach such a line wherever they guess. Correct its level, or add the missing line above it.",
    E4: 'A GEDCOM file opens with 0 HEAD and ends with 0 TRLR, once each. Here one is missing or doubled, or there are records after TRLR, which many programs never read. Move or delete the stray lines.',
    E5: 'An empty line, or one of spaces only. The standard allows none, and some programs stop reading at the first. Delete it.',
    E6: "Two records carry this same id. A pointer to it could mean either, so programs choose one — often the last — and the other record's links go wrong. Give one of them a new id, and repoint the lines that meant it.",
    E7: 'This line points at an id that no record in the file has — the record was deleted, or the id mistyped — so the link is lost on import. Point it at the right record, or delete the line.',
    E8: "This line holds bytes that aren't valid in the file's encoding. They are kept exactly as they are and shown as best they can be. GEDCOM Viewer lets you delete such a line but not edit it, so nothing is changed by a guess. Delete it, or correct it in the program that made the file.",
    E9: "The header's 1 CHAR line names one encoding and the file's bytes are in another — or a file that needs a CHAR line has none. GEDCOM Viewer reads the bytes as they are; a program that trusts the header may garble every accented letter. Correct the CHAR line to match the bytes.",
    N1: "This value holds a character that some programs treat as the end of a line, though GEDCOM does not — NEL (U+0085), LS (U+2028) and the like; it's shown marked. A program that breaks there cuts the value in two and can lose the rest of it. Keeping it is usually safe; delete it if the value reads the same without it.",
    N2: 'This value holds an invisible control character other than a tab, shown marked. It is usually left over from copy and paste, and some programs drop or reject it. Delete it.',
    N3: "No line in the file points at this record — a person in no family, a source no fact cites, a picture attached to no one. That isn't wrong: it may be kept on purpose. But it's often what is left behind after something else was removed. Look before you delete it.",
    N4: 'GEDCOM 5.5 allows a line of at most 255 characters; a longer value is meant to continue on CONC lines. A program that keeps to the letter may cut this line short. GEDCOM 7 has no such limit, so this is not noted in version-7 files.',
    N5: 'There are spaces or tabs before the level number. The standard allows none, and a strict program may reject the line. Delete them.',
    N6: "This file is in an encoding GEDCOM Viewer can't show as its own letters — ANSEL, for one. Each byte is shown as the character with the same number, so accented letters may look wrong on screen; but every line you don't edit is written back byte for byte. A line you edit may hold plain ASCII only.",
    N7: "Lines in this file end in more than one way — most with LF and some with CR LF, for instance. Every line keeps its own ending when saved, and a new line takes the file's most common one. Most programs don't mind; a few treat it as damage.",
  };
  let drag = null;                    // a block being dragged (3.4a); see "Dragging"

  const state = {
    doc: null,                        // the document: the file as read, and the lines typed over it
    m: null,                          // its lines as they now are, checked (the document's view)
    fileName: '',
    handle: null,                     // the file's handle, from the picker or a drop: where the Save dialog opens, and what it may not pick (10.2); never stored
    disk: null,                       // the file as it was opened, the original: sha256, bytes, lines
    hashing: null,                    // the hash at open, while it is being taken
    sel: -1,                          // the selected line
    back: [],
    indent: store.get('indent', false) === true,
    indentWidth: clampWidth(store.get('indentWidth', 4)),
    theme: storedTheme(),
    textSize: TEXT_SIZES.includes(store.get('textSize', 'normal')) ? store.get('textSize', 'normal') : 'normal',
    stamps: store.get('stamps', true) !== false,   // F1, V1: on unless unticked
    headerNote: store.get('headerNote', true) !== false,   // the date in the header: on unless unticked
    showFacts: store.get('facts', false) === true,  // the file's facts, shown under its name
    boldSurnames: store.get('surnames', false) === true,   // 3.8: surnames in bold wherever a record is named
    nameInTab: store.get('tabName', false) === true,       // the file's name in the tab's title: off unless asked for
    hiddenLeft: store.get('hideLeft', false) === true,     // 3.1: the left bar hidden
    hiddenRight: store.get('hideRight', false) === true,   // 3.1: the right frame hidden
    help: null,                       // 3.6: the check whose meaning the right frame shows
    tagsOrder: [0, 1, 2, 3].includes(store.get('tagsOrder', 0)) ? store.get('tagsOrder', 0) : 0,   // the Tags list's order: by count, by count rising, A–Z, Z–A
    maxLevel: 0,                      // the deepest level in the file, for the grid's width
    editing: false,                   // Edit: on whenever a file opens (P10); off with none open
    folds: new Set(),                 // the lines shut, by their number in the document's order
    sections: null,                   // the record types, when the file is bunched by type
    shutSections: new Set(),          // the sections shut, by tag
    range: null,                      // Go to Line… with a range: lines a to b alone
    gotoApplied: '',                  // what Go to Line… last went to
    rows: new Int32Array(0),          // the main frame's rows (see rebuildRows)
    rowOf: new Int32Array(0),
    extras: [],
    pick: null,                       // a removed line selected (Edit on): its place as saved
    pending: null,                    // a line being added: where it goes
    edit: null,                       // a line being typed
    marks: null,                      // per line: changed or added; where lines were removed
    runs: [],                         // the net change in runs: the Changes panel
    changeAt: new Map(),              // a changed line → its line as saved
    movedAt: new Map(),               // a moved line → its place as saved
    recordType: null,
    recordRows: [],                   // the records the list shows, as record numbers
    checkRows: [],                    // a check's head, then its findings, check by check
    collapsed: new Set(),
    tagRows: [],
    search: { query: '', tag: false, hits: [], at: -1, idDone: false },
    hitFlags: null,
    highlight: null,
  };

  // The theme chosen last, or System for anyone who has not chosen. Dusk was called Sunset until
  // 0.5.5; a Sunset kept in the browser still means it.
  function storedTheme() {
    const t = store.get('theme', 'system');
    if (t === 'sunset') return 'dusk';
    return THEMES.includes(t) ? t : 'system';
  }

  function clampWidth(w) {
    const n = Number(w);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 4;
  }

  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

  // the first place in a sorted list at which x or more is found
  function lowerBound(list, x) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < x) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  async function sha256(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------------------------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------------------------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // A line break or control character inside a value shows as a small mark: the character itself
  // would break the row or show as nothing. On the screen only; the file keeps it (I4).
  const SPECIAL = /[\x00-\x08\x0b-\x1f\x7f\x85\u{2028}\u{2029}]/gu;
  function specialName(ch) {
    const code = ch.codePointAt(0);
    if (code === 0x85) return 'NEL';
    if (code === 0x2028) return 'LS';
    if (code === 0x2029) return 'PS';
    if (code === 0x7f) return String.fromCharCode(0x2421);
    return String.fromCharCode(0x2400 + code);                     // the control pictures
  }
  function putText(parent, text) {
    SPECIAL.lastIndex = 0;
    let last = 0;
    let hit;
    while ((hit = SPECIAL.exec(text)) !== null) {
      if (hit.index > last) parent.appendChild(document.createTextNode(text.slice(last, hit.index)));
      const mark = el('span', 'ch', specialName(hit[0]));
      mark.title = `U+${hit[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
      parent.appendChild(mark);
      last = hit.index + hit[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  // A line cut into the parts the screen styles apart, as [start, end, class] over its text as
  // written: level (quiet), id, tag (strong), value, or a pointer (a link). The parts are exactly
  // the line: one space between them, as the shape requires. A line that did not parse is one
  // part, shown as written.
  function partsOf(m, i) {
    const shape = { lead: m.lead[i], level: m.level[i], xref: m.xref[i], tag: m.tag[i], valAt: m.valAt[i], blank: m.kind[i] === C.KIND.BLANK };
    return partsFromShape(m.texts[i], shape, C.isPointerLine(m, i));
  }

  // The same, for a line as typed (its shape from core.lineShape), while the right frame follows
  // the typing.
  function partsFromShape(t, s, pointer) {
    if (s.level < 0) return [[0, t.length, s.blank ? '' : 'raw']];
    const out = [];
    let p = s.lead;
    if (p) out.push([0, p, '']);
    const lvEnd = t.indexOf(' ', p);
    out.push([p, lvEnd, 'lv']);
    p = lvEnd;
    if (s.xref !== null) {
      out.push([p, p + 1, ''], [p + 1, p + 1 + s.xref.length, 'id']);
      p += 1 + s.xref.length;
    }
    out.push([p, p + 1, ''], [p + 1, p + 1 + s.tag.length, 'tg']);
    p += 1 + s.tag.length;
    if (s.valAt >= 0) out.push([p, s.valAt, ''], [s.valAt, t.length, pointer ? 'ptr' : 'val']);
    return out;
  }

  const isPointerValue = (v) => v !== '@VOID@' && ID_WHOLE.test(v);

  // The parts into `parent`, up to `limit` characters, with the ranges in `marks` highlighted.
  function putParts(parent, t, parts, limit, marks) {
    for (const [s, e0, cls] of parts) {
      const e = Math.min(e0, limit);
      if (s >= e) continue;
      const host = cls ? el('span', cls) : parent;
      let p = s;
      for (const [ms, me] of marks) {
        if (me <= p || ms >= e) continue;
        const a = Math.max(ms, p);
        if (a > p) putText(host, t.slice(p, a));
        const b = Math.min(me, e);
        const hl = el('mark');
        putText(hl, t.slice(a, b));
        host.appendChild(hl);
        p = b;
      }
      if (p < e) putText(host, t.slice(p, e));
      if (host !== parent) parent.appendChild(host);
    }
  }

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function matchesIn(i, limit) {
    const re = state.highlight;
    if (!re || !state.hitFlags || !state.hitFlags[i]) return [];
    const t = state.m.texts[i];
    const out = [];
    re.lastIndex = 0;
    let hit;
    while ((hit = re.exec(t)) !== null && hit.index < limit) {
      out.push([hit.index, hit.index + hit[0].length]);
      if (!hit[0].length) re.lastIndex += 1;
    }
    return out;
  }

  const recordName = (id, tag) => (id ? `${id} ${tag || ''}` : tag || '').trim();

  // ---------------------------------------------------------------------------------------------
  // A list of rows of one height, where only the rows in view exist in the page (the grid, and
  // the Records, Checks, Changes and Tags lists). The rows sit in a layer that sticks to the top
  // of the view while the list scrolls under it, and each scroll repaints what they show: a fast
  // drag of the scrollbar shows rows, never an empty screen.
  // ---------------------------------------------------------------------------------------------

  // Every list made, so that a change of text size can lay each one out again.
  const lists = [];

  // `paint` draws a row whole; `style`, when given, only its look (Virtual.restyle).
  function Virtual(scroller, paint, style) {
    const layer = el('div', 'v-rows');
    const inner = el('div', 'v-inner');
    const spacer = el('div', 'v-spacer');
    layer.appendChild(inner);
    scroller.append(layer, spacer);
    const pool = [];
    let count = 0;
    let version = 0;
    const measure = () => parseFloat(getComputedStyle(scroller).getPropertyValue('--row-height')) || 24;
    let h = measure();

    function draw() {
      const vh = scroller.clientHeight;
      const top = scroller.scrollTop;
      const first = Math.max(0, Math.min(Math.floor(top / h), count - 1));
      const want = count ? Math.min(Math.ceil(vh / h) + 1, count - first) : 0;
      inner.style.transform = `translateY(${first * h - top}px)`;
      while (pool.length < want) {
        const r = el('div');
        r._i = -1;
        inner.appendChild(r);
        pool.push(r);
      }
      for (let k = 0; k < pool.length; k += 1) {
        const r = pool[k];
        if (k >= want) {
          if (r.style.display !== 'none') r.style.display = 'none';
          r._i = -1;
          continue;
        }
        const i = first + k;
        if (r.style.display) r.style.display = '';
        if (r._i !== i || r._v !== version) {
          r._i = i;
          r._v = version;
          paint(r, i);
        }
      }
    }
    function layout() {
      h = measure();
      const vh = scroller.clientHeight;
      layer.style.height = `${vh}px`;
      spacer.style.height = `${Math.max(0, count * h - vh)}px`;
      draw();
    }
    scroller.addEventListener('scroll', draw, { passive: true });
    new ResizeObserver(layout).observe(scroller);

    const list = {
      setCount(n, keepScroll) {
        count = n;
        version += 1;
        if (!keepScroll) scroller.scrollTop = 0;
        layout();
      },
      refresh() { version += 1; draw(); },
      // The row height read again from the style, once the text size has changed: the rows are laid
      // out afresh, and the view stays at the same row.
      remeasure() {
        const next = measure();
        if (next === h) return;
        const row = scroller.scrollTop / h;
        version += 1;
        layout();
        scroller.scrollTop = row * h;
        draw();
      },
      // Each row's look again, its contents kept (a highlight in them holds).
      restyle() {
        for (const r of pool) if (r._i >= 0 && r.style.display !== 'none') (style || paint)(r, r._i);
      },
      rowHeight: () => h,
      pageRows: () => Math.max(1, Math.floor(scroller.clientHeight / h) - 1),
      // The rows' width, as CSS: the list scrolls sideways when it is wider than the view.
      setWidth(css) { layer.style.width = css; spacer.style.width = css; },
      // Something drawn over the rows, at the top of the view: the gold line of a drag.
      mount(elt) { layer.appendChild(elt); },
      // Where row i's top edge is, in the layer (the view's own pixels).
      topOf(i) { return i * h - scroller.scrollTop; },
      // Bring row i into view: to a few rows below the top for a jump, by as little as it takes
      // otherwise.
      show(i, jump) {
        const vh = scroller.clientHeight;
        const y = i * h;
        if (jump) scroller.scrollTop = Math.max(0, y - Math.min(3 * h, Math.floor(vh / 3)));
        else if (y < scroller.scrollTop) scroller.scrollTop = y;
        else if (y + h > scroller.scrollTop + vh) scroller.scrollTop = y + h - vh;
        draw();
      },
      rowOf(target) {
        const r = target.closest && target.closest('.v-inner > div');
        return r && r._i >= 0 ? r._i : -1;
      },
    };
    lists.push(list);
    return list;
  }

  // ---------------------------------------------------------------------------------------------
  // The main frame's rows. Most are lines; the rest are the row of a line being added, a section's
  // row between two record types, and, with Edit on, a line removed since the file was opened, shown
  // struck through where it was. A line with lines under it (its subtree, 6.4) shows ▾ open or ▸
  // shut; a shut line hides its subtree and says how many lines it holds; a shut section hides
  // every record of its type. Go to Line… with a range shows those lines alone.
  //
  // `rows` holds a line's place (0 up), -1 for the line being added, or -2 down for `extras[k]`
  // at -2 - k; `rowOf` holds each line's row, -1 when it is hidden.
  // ---------------------------------------------------------------------------------------------

  function hasKids(i) {
    const lv = state.m.level;
    return lv[i] >= 0 && i + 1 < state.m.n && (lv[i + 1] < 0 || lv[i + 1] > lv[i]);
  }

  const isShut = (i) => state.folds.size > 0 && state.folds.has(state.doc.order[i]) && hasKids(i);

  function setFold(i, shut) {
    const e = state.doc.order[i];
    if (shut) state.folds.add(e); else state.folds.delete(e);
  }

  // The file's record types as sections — each type's records in one run — when every type is in
  // one run, the file being bunched by type; else null, and no section rows.
  function sectionsOf(m) {
    const out = [];
    const seen = new Set();
    for (const line of m.records) {
      const tag = m.tag[line];
      const last = out[out.length - 1];
      if (last && last.tag === tag) {
        last.records += 1;
        continue;
      }
      if (seen.has(tag)) return null;
      seen.add(tag);
      out.push({ tag, from: line, to: 0, records: 1, index: out.length });
    }
    out.forEach((s, k) => { s.to = k + 1 < out.length ? out[k + 1].from : m.n; });
    return out.length > 1 ? out : null;
  }

  // The removed lines of the net change, by the place they were: the row of each goes just above
  // the line now at that place.
  function removedByPlace() {
    const map = new Map();
    for (const run of state.runs) {
      if (run.kind !== 'removed') continue;
      const list = map.get(run.at) || [];
      for (let k = 0; k < run.lines.length; k += 1) list.push({ kind: 'removed', run, k });
      map.set(run.at, list);
    }
    return map;
  }

  function rebuildRows() {
    const m = state.m;
    const n = m.n;
    const rows = [];
    const rowOf = new Int32Array(n).fill(-1);
    const extras = [];
    const extra = (x) => {
      extras.push(x);
      rows.push(-1 - extras.length);
    };
    const range = state.range;
    const first = range ? range.a : 0;
    const end = range ? range.b + 1 : n;
    const starts = range || !state.sections ? null : new Map(state.sections.map((s) => [s.from, s]));
    const removed = state.editing ? removedByPlace() : null;
    const adding = state.pending;
    for (let i = first; i <= end;) {
      if (removed && removed.has(i) && (i < end || !range)) for (const x of removed.get(i)) extra(x);
      if (adding && adding.at === i) rows.push(-1);
      if (i === end) break;
      const sec = starts && starts.get(i);
      if (sec && sec.index > 0) {
        extra({ kind: 'section', sec });
        if (state.shutSections.has(sec.tag)) {
          i = sec.to;
          continue;
        }
      }
      rowOf[i] = rows.length;
      rows.push(i);
      i = isShut(i) ? C.subtreeEnd(m, i) : i + 1;
    }
    state.rows = Int32Array.from(rows);
    state.rowOf = rowOf;
    state.extras = extras;
    updateFoldAll();
  }

  const rowCount = () => state.rows.length;
  const rowOfLine = (i) => state.rowOf[i];
  const extraOf = (v) => state.extras[-v - 2];
  const isPicked = (x) => !!state.pick && x.kind === 'removed' && x.run.before === state.pick.before && x.k === state.pick.k;

  // The line shown nearest line i, at it or above it (below it, when nothing above is shown).
  function shownLineOf(i) {
    for (let j = Math.min(i, state.m.n - 1); j >= 0; j -= 1) if (state.rowOf[j] >= 0) return j;
    for (let j = i + 1; j < state.m.n; j += 1) if (state.rowOf[j] >= 0) return j;
    return -1;
  }

  // The lines above line i whose subtree holds it, nearest first.
  function ancestors(i) {
    const lv = state.m.level;
    const out = [];
    let need = lv[i] >= 0 ? lv[i] : Infinity;
    for (let j = i - 1; j >= 0 && need > 0; j -= 1) {
      if (lv[j] >= 0 && lv[j] < need) {
        out.push(j);
        need = lv[j];
      }
    }
    return out;
  }

  // A line that is hidden is shown: a range it is outside of goes, and every section and block
  // around it opens.
  function reveal(i) {
    let changed = false;
    if (state.range && (i < state.range.a || i > state.range.b)) {
      state.range = null;
      $('goto').value = '';
      state.gotoApplied = '';
      updateGoto();
      changed = true;
    }
    for (const sec of state.sections || []) {
      if (sec.index > 0 && i >= sec.from && i < sec.to && state.shutSections.delete(sec.tag)) changed = true;
    }
    if (state.folds.size) {
      for (const j of ancestors(i)) {
        if (isShut(j)) {
          setFold(j, false);
          changed = true;
        }
      }
    }
    if (changed) {
      rebuildRows();
      grid.setCount(rowCount(), true);
    }
  }

  // After a block or a section shuts, the selected line, if it is now hidden, is the shown line
  // nearest it.
  function keepSelectionShown(inView) {
    if (state.sel >= 0 && state.rowOf[state.sel] < 0) state.sel = shownLineOf(state.sel);
    if (inView !== undefined && inView >= 0) grid.show(inView);
    grid.restyle();
    renderDetail();
  }

  // Open or shut line i's block; with ⌥, every block at its level.
  function toggleFold(i, everyAtLevel) {
    if (!hasKids(i)) return;
    const shut = !isShut(i);
    if (everyAtLevel) {
      const m = state.m;
      const lv = m.level[i];
      for (let j = 0; j < m.n; j += 1) if (m.level[j] === lv && hasKids(j)) setFold(j, shut);
      state.sel = i;
    }
    else setFold(i, shut);
    rebuildRows();
    grid.setCount(rowCount(), true);
    keepSelectionShown(rowOfLine(i));
  }

  // Open or shut a section — every record of one type; with ⌥, every section.
  function toggleSection(sec, every) {
    const shut = !state.shutSections.has(sec.tag);
    for (const s of every ? state.sections : [sec]) {
      if (s.index === 0) continue;
      if (shut) state.shutSections.add(s.tag); else state.shutSections.delete(s.tag);
    }
    rebuildRows();
    grid.setCount(rowCount(), true);
    const k = state.extras.findIndex((x) => x.kind === 'section' && x.sec.tag === sec.tag);
    keepSelectionShown(k >= 0 ? state.rows.indexOf(-2 - k) : -1);
  }

  // ---------------------------------------------------------------------------------------------
  // The grid
  // ---------------------------------------------------------------------------------------------

  function foldPart(lv, kids, shut) {
    const fd = el('span', 'fd');
    if (state.indent && lv > 0) fd.style.paddingLeft = `${Math.min(lv, MAX_INDENT) * state.indentWidth}ch`;
    fd.appendChild(el('span', kids ? `fold ${shut ? 'is-shut' : 'is-open'}` : 'fold', kids ? (shut ? '▸' : '▾') : ''));
    return fd;
  }

  // The part of a row that stays at the left edge while the grid scrolls sideways (3.1): the line
  // number, the mark, and the indent with the fold.
  function fixedPart(ln, markClass, lv, kids, shut, change) {
    const fx = el('span', 'fx');
    fx.appendChild(el('span', 'ln', ln));
    fx.appendChild(el('span', markClass));
    fx.appendChild(el('span', change ? `cg is-${change}` : 'cg'));   // the change dot, beside the finding's
    fx.appendChild(foldPart(lv, kids, shut));
    return fx;
  }
  const CHANGE_NAMES = ['', 'changed', 'added', 'moved'];

  // 3.10 — the text of a row, up to ROW_CHARS characters, and then how many more the line holds.
  function putClipped(row, tx, text, parts, marks) {
    const c = C.clip(text, ROW_CHARS);
    if (parts) putParts(tx, text, parts, c.end, marks); else putText(tx, text.slice(0, c.end));
    row.appendChild(tx);
    if (c.more) row.appendChild(el('span', 'more', `… ${fmt(c.more)} more`));
  }

  // The grid is as wide as the longest line as it shows — at most ROW_CHARS characters, and the
  // clip's tail — plus the indent while Indent is on, and the line number, mark and fold before it.
  function updateGridWidth() {
    const m = state.m;
    if (!m) { grid.setWidth(''); return; }
    const indent = state.indent ? Math.min(state.maxLevel, MAX_INDENT) * state.indentWidth : 0;
    const chars = fmt(m.n).length + 1 + 2 + 2 + 2 + indent + Math.min(m.longest, ROW_CHARS) + (m.longest > ROW_CHARS ? 20 : 2);
    grid.setWidth(`max(100%, ${chars}ch)`);
  }

  // A row's look: its kind, whether it is selected or found, what is not yet saved.
  function rowClass(k) {
    const v = state.rows[k];
    const dragging = drag && drag.started;
    if (v === -1) return 'row is-added';
    if (v <= -2) {
      const x = extraOf(v);
      if (x.kind === 'section') {
        return `row is-section${state.shutSections.has(x.sec.tag) ? ' is-shut' : ''}${dragging && drag.section === x.sec ? ' is-dragging' : ''}`;
      }
      return `row is-removed${isPicked(x) ? ' is-sel' : ''}`;
    }
    const mk = state.marks;
    let cls = 'row';
    if (mk.status[v] === 1) cls += ' is-changed';
    else if (mk.status[v] === 2) cls += ' is-added';
    else if (mk.status[v] === 3) cls += ' is-moved';
    if (v === state.sel && !state.pick) cls += ' is-sel';
    else if (state.hitFlags && state.hitFlags[v]) cls += ' is-hit';
    if (!state.editing) {                                            // with Edit on, removed lines show themselves
      if (mk.removedAt[v]) cls += ' is-removed-above';
      if (v === state.m.n - 1 && mk.removedAt[state.m.n]) cls += ' is-removed-below';
    } else {                                                         // and a rule marks where a move took lines from
      if (mk.movedFrom[v]) cls += ' is-moved-above';
      if (v === state.m.n - 1 && mk.movedFrom[state.m.n]) cls += ' is-moved-below';
    }
    if (dragging && v >= drag.from && v < drag.end) cls += ' is-dragging';
    return cls;
  }

  const levelOfText = (t) => { const hit = /^[ \t]*(\d+) /.exec(t); return hit ? Number(hit[1]) : 0; };

  function paintRow(row, k) {
    row.className = rowClass(k);
    const v = state.rows[k];
    if (v === -1) { paintAdding(row); return; }
    if (v <= -2) { paintExtra(row, extraOf(v)); return; }
    const i = v;
    const m = state.m;
    const editing = state.edit && state.edit.kind === 'edit' && state.edit.pos === i;
    if (editing && state.edit.input.parentNode === row) return;     // the box being typed in stays put
    row.textContent = '';
    const marks = m.findings.marks[i];
    const kids = hasKids(i);
    const shut = kids && isShut(i);
    const fx = fixedPart(fmt(i + 1), marks & 1 ? 'mk is-error' : marks & 2 ? 'mk is-note' : 'mk', m.level[i], kids, shut, CHANGE_NAMES[state.marks.status[i]]);
    row.appendChild(fx);
    if (editing) {
      row.appendChild(state.edit.input);
      state.edit.input.style.width = `${Math.max(120, $('grid').clientWidth - fx.offsetWidth - 12)}px`;
      return;
    }
    putClipped(row, el('span', 'tx'), m.texts[i], partsOf(m, i), matchesIn(i, C.clip(m.texts[i], ROW_CHARS).end));
    if (shut) {
      const end = C.subtreeEnd(m, i);
      const inside = state.marks.sum[end] - state.marks.sum[i + 1];
      row.appendChild(el('span', inside ? 'hc is-changed' : 'hc', plural(end - i - 1, 'line', 'lines')));
    }
  }

  function paintExtra(row, x) {
    row.textContent = '';
    if (x.kind === 'section') {
      // A type's row has nothing to scroll for, so its name sits in the part that stays at the left
      // edge: with the lines scrolled sideways it still reads SUBM, never UBM
      const sec = x.sec;
      const shut = state.shutSections.has(sec.tag);
      const fx = fixedPart('', 'mk', 0, true, shut, '');
      const tx = el('span', 'tx');
      tx.appendChild(el('span', 'tg', sec.tag));
      if (RECORD_NAMES[sec.tag]) tx.appendChild(el('span', 'sec-name', ` ${RECORD_NAMES[sec.tag]}`));
      if (sec.tag !== 'HEAD' && sec.tag !== 'TRLR') tx.appendChild(el('span', 'sec-count', ` ${fmt(sec.records)}`));
      if (shut) tx.appendChild(el('span', 'sec-name', ` · ${plural(sec.to - sec.from, 'line', 'lines')}`));
      fx.appendChild(tx);
      row.appendChild(fx);
      return;
    }
    const was = x.run.lines[x.k].was;                                // a removed line: its number as saved, and its words
    row.appendChild(fixedPart(fmt(x.run.before + x.k + 1), 'mk', levelOfText(was), false, false, ''));
    putClipped(row, el('span', 'tx'), was, null, []);
  }

  function paintAdding(row) {
    if (state.edit.input.parentNode === row) return;
    row.textContent = '';
    const fx = fixedPart('+', 'mk', state.edit.level === null ? 0 : state.edit.level, false, false, 'added');
    row.appendChild(fx);
    row.appendChild(state.edit.input);
    state.edit.input.style.width = `${Math.max(120, $('grid').clientWidth - fx.offsetWidth - 12)}px`;
  }

  const grid = Virtual($('grid'), paintRow, (row, k) => { row.className = rowClass(k); });

  // Select line i. The rows' contents are drawn again only where the view moved; the rest keep
  // theirs, so a highlight made with the mouse holds, to be copied.
  function select(i, how) {
    const m = state.m;
    if (!m || !m.n) return;
    const to = Math.max(0, Math.min(m.n - 1, i));
    reveal(to);
    if (how === 'jump' && state.sel >= 0 && state.sel !== to) {
      state.back.push(state.sel);
      updateBack();
    }
    state.sel = to;
    state.pick = null;
    state.help = null;
    if (how === 'jump' || how === 'step') $('grid').scrollLeft = 0;     // a jump shows the line's start
    grid.show(rowOfLine(to), how === 'jump' || how === 'step');
    grid.restyle();
    renderDetail();
  }

  // Move the selection by `delta` rows, landing on a line (the other rows are passed over).
  function moveBy(delta) {
    const rows = state.rows;
    if (!rows.length) return;
    const from = state.sel >= 0 && state.rowOf[state.sel] >= 0 ? state.rowOf[state.sel] : 0;
    const target = Math.max(0, Math.min(rows.length - 1, from + delta));
    const dir = delta >= 0 ? 1 : -1;
    let t = target;
    while (t >= 0 && t < rows.length && rows[t] < 0) t += dir;
    if (t < 0 || t >= rows.length) {
      t = target;
      while (t >= 0 && t < rows.length && rows[t] < 0) t -= dir;
    }
    if (t >= 0 && t < rows.length) select(rows[t]);
  }

  // A removed line (Edit on) selected: the right frame says what it was, and offers it back.
  function pickRemoved(x) {
    state.pick = { before: x.run.before, k: x.k };
    state.help = null;
    grid.restyle();
    renderDetail();
  }

  function pickedRemoved() {
    return state.pick ? state.extras.find((x) => isPicked(x)) || null : null;
  }

  function jumpToId(id) {
    const def = state.m.definedAt.get(id);
    if (def) select(def[0], 'jump');
  }

  function goBack() {
    const line = state.back.pop();
    updateBack();
    if (line !== undefined) select(line, 'step');
  }

  // 3.7 — Back sits in the strip above the lines, at the main frame's top left, naming the line
  // it returns to, only while there is one; Top, beside it, is always there.
  function updateBack() {
    const b = $('back');
    b.hidden = state.back.length === 0;
    b.textContent = state.back.length ? `← Back to ${fmt(state.back[state.back.length - 1] + 1)}` : '← Back';
    $('top').disabled = !state.m;
  }

  $('grid').addEventListener('click', (e) => {
    if (clickAfterDrag) { clickAfterDrag = false; return; }        // the release of a drag is no click
    const k = grid.rowOf(e.target);
    if (k < 0) return;
    const v = state.rows[k];
    if (v === -1 || e.target.closest('input')) return;
    if (v <= -2) {
      const x = extraOf(v);
      if (x.kind === 'section') toggleSection(x.sec, e.altKey);
      else pickRemoved(x);
      return;
    }
    if (e.target.closest('.fold') && hasKids(v)) {
      toggleFold(v, e.altKey);
      return;
    }
    if (e.target.closest('.ptr') && !e.altKey) {                    // ⌥ makes a link plain text (3.9)
      state.sel = v;                                                 // Back comes back to this line
      jumpToId(C.valueOf(state.m, v));
      return;
    }
    select(v);
  });

  // A double-click: with Edit on it types over the line. With Edit off — or with ⌥, which makes
  // a link plain text (3.9) — it is the browser's own and highlights a word, except that a web
  // address is selected whole, and, with ⌥, so is a pointer, @ to @.
  $('grid').addEventListener('dblclick', (e) => {
    const k = grid.rowOf(e.target);
    if (k < 0 || e.target.closest('input, .fold')) return;
    const v = state.rows[k];
    const ptr = e.target.closest('.ptr');
    if (ptr && e.altKey) { selectWhole(ptr); return; }
    if (ptr) return;                                                 // the first click jumped
    if (state.editing && !e.altKey) {
      if (v >= 0) {
        window.getSelection().removeAllRanges();
        startEdit(v);
      }
      return;
    }
    selectLinkAt(e);
  });

  function selectWhole(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // The web address under the pointer, selected whole: the text of the value's span as shown, the
  // character at the point, and the address there (3.9).
  function selectLinkAt(e) {
    const host = e.target.closest('.val, .raw');
    if (!host) return;
    const caret = document.caretPositionFromPoint ? document.caretPositionFromPoint(e.clientX, e.clientY) : null;
    const node = caret ? caret.offsetNode : null;
    if (!node || !host.contains(node)) return;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = '';
    let at = -1;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t === node) at = text.length + caret.offset;
      nodes.push({ node: t, start: text.length });
      text += t.data;
    }
    if (at < 0) return;
    const link = C.linkAt(text, Math.min(at, text.length - 1));
    if (!link) return;
    const place = (k) => {
      let n = nodes[0];
      for (const x of nodes) if (x.start <= k) n = x;
      return [n.node, k - n.start];
    };
    const range = document.createRange();
    range.setStart(...place(link[0]));
    range.setEnd(...place(link[1]));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ---------------------------------------------------------------------------------------------
  // Editing (9.2): a line typed over in its row; a line added under or after it; Enter keeps,
  // Esc drops, and clicking away keeps.
  // ---------------------------------------------------------------------------------------------

  function makeEditor(text) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'The line');
    input.value = text;
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
    // A paste that holds a line break would be flattened by the box without a word; it is refused
    // instead (I11).
    input.addEventListener('paste', (e) => {
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (t && /[\r\n]/.test(t)) {
        e.preventDefault();
        notice('A line cannot hold a line break, so that text was not pasted. Paste one line at a time.', 'error');
      }
    });
    input.addEventListener('blur', () => {
      if (!state.edit || state.edit.input !== input) return;
      if (pressing) keepAfterPress = state.edit;                   // kept once the press's click has landed
      else commitEdit(true);
    });
    input.addEventListener('input', () => {                        // the right frame follows the typing
      if (state.edit && state.edit.input === input) renderDetail();
    });
    return input;
  }

  // A press outside the box being typed in takes its focus, and so keeps what was typed; but the
  // press's click must land on the page as it was pressed — keeping redraws the page — so the
  // keeping waits until the click is over.
  let pressing = false;
  let keepAfterPress = null;
  document.addEventListener('pointerdown', () => { pressing = true; }, true);
  function pressOver() {
    pressing = false;
    setTimeout(() => {
      const ed = keepAfterPress;
      keepAfterPress = null;
      if (ed && state.edit === ed) commitEdit(true, true);
    }, 0);
  }
  document.addEventListener('pointerup', pressOver, true);
  document.addEventListener('pointercancel', pressOver, true);

  // The box takes the focus and the caret at `at`. Each of those scrolls the grid sideways to
  // follow it, which takes the level and tag columns off the screen. The grid is put back where
  // it was, and put back again when the box closes, since typing at the end of a long line
  // scrolls it too.
  function focusEditor(input, at, left) {
    const g = $('grid');
    input.focus({ preventScroll: true });
    input.setSelectionRange(at, at);
    g.scrollLeft = left;
  }

  function startEdit(i) {
    if (!state.doc || !state.editing || i < 0 || i >= state.m.n) return;
    if (state.edit && !commitEdit(false)) return;
    const cannot = C.editRefusal(state.doc, i);
    if (cannot) {
      notice(cannot, 'error');
      return;
    }
    select(i);
    const input = makeEditor(state.m.texts[i]);
    const left = $('grid').scrollLeft;
    state.edit = { kind: 'edit', pos: i, input, prefill: input.value, level: state.m.level[i], left };
    $('grid').classList.add('is-editing');
    grid.refresh();
    focusEditor(input, input.value.length, left);
  }

  // A new line inside the selected line's block — directly under it, one level deeper — or after
  // its block, at its level. Its row is offered with the level typed in; an Enter with nothing
  // more adds nothing.
  function startAdd(kind) {
    if (!state.doc || !state.editing || state.sel < 0 || !state.m.n) return;
    if (state.edit && !commitEdit(false)) return;
    const m = state.m;
    const i = state.sel;
    const lv = m.level[i];
    if (kind === 'inside' && isShut(i)) setFold(i, false);
    const at = kind === 'inside' ? i + 1 : C.subtreeEnd(m, i);
    const level = lv < 0 ? null : kind === 'inside' ? lv + 1 : lv;
    const prefill = level === null ? '' : `${level} `;
    const input = makeEditor(prefill);
    const left = $('grid').scrollLeft;
    state.edit = { kind, pos: i, at, input, prefill, level, left };
    state.pending = { at };
    rebuildRows();
    $('grid').classList.add('is-editing');
    grid.setCount(rowCount(), true);
    grid.show(state.rows.indexOf(-1));
    grid.refresh();
    renderDetail();                                                  // the new line in the right frame, and its title, at once: a shut block was opened for it
    focusEditor(input, prefill.length, left);
  }

  function closeEditor() {
    const ed = state.edit;
    state.edit = null;
    state.pending = null;
    $('grid').classList.remove('is-editing');
    if (document.activeElement === ed.input) $('grid').focus();
    ed.input.remove();
    $('grid').scrollLeft = ed.left;
    return ed;
  }

  // Keep what was typed. Refused (I11), the box stays open and says why. After a press elsewhere,
  // the line that press selected stays selected.
  function commitEdit(fromBlur, afterPress) {
    const ed = state.edit;
    if (!ed) return true;
    const text = ed.input.value;
    if (ed.kind !== 'edit' && (text === ed.prefill || text.trim() === '')) {
      cancelEdit(fromBlur, afterPress);
      return true;
    }
    const doc = state.doc;
    const was = ed.kind === 'edit' ? doc.order[ed.pos] : null;
    let r;
    if (ed.kind === 'edit') r = C.editLine(doc, ed.pos, text);
    else if (ed.kind === 'inside') r = C.addChild(doc, ed.pos, text);
    else r = C.addSibling(doc, ed.pos, text);
    if (!r.ok) {
      notice(r.reason, 'error');
      if (fromBlur) setTimeout(() => { if (state.edit === ed) ed.input.focus(); }, 0);
      return false;
    }
    if (ed.kind === 'edit' && state.folds.has(was)) {                // a shut line typed over stays shut
      state.folds.delete(was);
      state.folds.add(doc.order[ed.pos]);
    }
    const grew = doc.view.n - state.m.n;                              // an added line moves those below it
    const sel = grew && state.sel >= ed.at ? state.sel + grew : state.sel;
    closeEditor();
    if (r.step) afterAct(afterPress ? sel : ed.kind === 'edit' ? ed.pos : ed.at);
    else refreshGrid(afterPress ? sel : ed.pos);
    if (!fromBlur) $('grid').focus();
    return true;
  }

  function cancelEdit(fromBlur, afterPress) {
    if (!state.edit) return;
    const ed = closeEditor();
    refreshGrid(afterPress ? state.sel : ed.pos);
    if (!fromBlur) $('grid').focus();
  }

  function refreshGrid(pos) {
    rebuildRows();
    grid.setCount(rowCount(), true);
    select(pos);
  }

  async function deleteSelected() {
    if (!state.doc || !state.editing || state.sel < 0 || !state.m.n) return;
    if (state.edit && !commitEdit(false)) return;
    const m = state.m;
    const i = state.sel;
    const end = C.subtreeEnd(m, i);
    if (end - i > 1) {
      // the question names what goes: a record by its id, tag and name, another line by its number and its text (core.js)
      const yes = await dialog((title) => putQuestion(title, C.deleteQuestion(m, i)), (body) => {
        const t = el('div', 'dialog-list');
        const line = el('div', 'chg-line is-was');
        line.appendChild(el('span', 'chg-sign', '−'));
        putText(line, m.texts[i].slice(0, 300));
        t.appendChild(line);
        body.appendChild(t);
        body.appendChild(el('div', 'dialog-sum', `Lines ${fmt(i + 1)}–${fmt(end)}`));
      }, [CANCEL, { label: 'Delete', value: 'go', primary: true }]);
      if (!yes) return;
    }
    const r = C.deleteLine(state.doc, i);
    if (!r.ok) {
      notice(r.reason, 'error');
      return;
    }
    afterAct(i);
  }

  // 9.3 — a record, and the lines elsewhere that point at it: shown first, each pointer ticked,
  // and the owner unticks what should stay.
  async function deleteRecordAsked() {
    if (!state.doc || !state.editing || state.sel < 0) return;
    if (state.edit && !commitEdit(false)) return;
    const m = state.m;
    const plan = C.recordDeletion(state.doc, state.sel);
    if (!plan) {
      notice('This line is in no record.', 'error');
      return;
    }
    const boxes = [];
    const go = await dialog(`Delete ${recordName(plan.id, plan.tag)}?`, (body) => {
      if (m.labels[plan.record] !== m.texts[plan.from].slice(m.lead[plan.from])) {
        const label = el('div');
        putLabel(label, m.labels[plan.record]);
        body.appendChild(label);
      }
      body.appendChild(el('div', 'dialog-sum',
        `The record: ${plural(plan.to - plan.from, 'line', 'lines')}, ${fmt(plan.from + 1)}–${fmt(plan.to)}`));
      if (!plan.pointers.length) return;
      body.appendChild(el('div', 'dialog-sum', `The lines elsewhere that point at it: ${fmt(plan.pointers.length)}`));
      const list = el('div', 'dialog-list');
      for (const p of plan.pointers) {
        const row = el('label', 'dialog-check');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = p.ticked;
        box.value = String(p.line);
        boxes.push(box);
        row.appendChild(box);
        row.appendChild(el('span', 'muted', fmt(p.line + 1)));
        const t = el('span', 'mono');
        putText(t, m.texts[p.line].slice(0, 300));
        row.appendChild(t);
        const r = m.recOf[p.line];
        const under = p.end - p.line > 1 ? ` · and ${plural(p.end - p.line - 1, 'line', 'lines')} under it` : '';
        if (r >= 0) row.appendChild(el('span', 'muted', `in ${recordName(m.xref[m.records[r]], m.tag[m.records[r]])}${under}`));
        list.appendChild(row);
      }
      body.appendChild(list);
    }, [CANCEL, { label: 'Delete', value: 'go', primary: true }]);
    if (!go) return;
    const r = C.deleteRecord(state.doc, state.sel, boxes.filter((b) => b.checked).map((b) => Number(b.value)));
    if (!r.ok) {
      notice(r.reason, 'error');
      return;
    }
    afterAct(plan.from);
  }

  // Removed lines put back where they were (Edit on): the whole run a removed line is in.
  function restoreRemoved(x) {
    if (!state.doc || !state.editing) return;
    const r = C.restoreLines(state.doc, x.run.before, x.run.lines.length);
    if (!r.ok) {
      notice(r.reason, 'error');
      return;
    }
    afterAct(x.run.at);
  }

  const firstPlace = (step) => Math.min(...step.splices.map((s) => s.at));

  function doUndo() {
    if (!state.doc) return;
    if (state.edit) {
      cancelEdit(false);
      return;
    }
    const step = C.undo(state.doc);
    if (step) afterAct(firstPlace(step));
  }

  function doRedo() {
    if (!state.doc) return;
    if (state.edit && !commitEdit(false)) return;
    const step = C.redo(state.doc);
    if (step) afterAct(firstPlace(step));
  }

  // After any act, undo or save: the page drawn again from the document as it now is. A range
  // shown by Go to Line… grows or shrinks with lines added or removed inside it.
  function afterAct(pos) {
    const grew = state.doc.view.n - state.m.n;
    const range = state.range;
    if (range && grew) {
      if (pos < range.a) range.a = Math.max(0, range.a + grew);
      if (pos <= range.b) range.b = Math.max(range.a, range.b + grew);
      range.b = Math.min(range.b, state.doc.view.n - 1);
    }
    state.m = state.doc.view;
    const m = state.m;
    state.sections = sectionsOf(m);
    state.maxLevel = Math.max(0, ...[...m.levelCounts.keys()].map(Number));
    updateMarks();
    $('grid').style.setProperty('--ln-width', `${fmt(m.n).length + 1}ch`);
    updateGridWidth();
    state.back = state.back.filter((b) => b < m.n);
    updateBack();
    if (state.search.query) runSearch();
    renderFacts();
    renderCounts();
    renderChecks(true);
    renderTags(true);
    filterRecords(true);
    renderChanges();
    updateBar();
    rebuildRows();
    grid.setCount(rowCount(), true);
    if (m.n) select(Math.max(0, Math.min(m.n - 1, pos)));
    else {
      state.sel = -1;
      renderDetail();
    }
  }

  // What is not yet saved, line by line: the marks in the grid, the runs of the Changes panel, and
  // each changed line's words as saved.
  function updateMarks() {
    const doc = state.doc;
    const items = C.netChange(doc);
    const marks = C.lineMarks(doc, items);
    const n = doc.order.length;
    const sum = new Int32Array(n + 2);                               // marks before each line, for a shut block
    for (let p = 0; p <= n; p += 1) sum[p + 1] = sum[p] + ((p < n && marks.status[p]) || marks.removedAt[p] || marks.movedFrom[p] ? 1 : 0);
    marks.sum = sum;
    state.marks = marks;
    state.runs = C.changeRuns(doc, items);
    state.changeAt = new Map();
    state.movedAt = new Map();
    for (const run of state.runs) {
      if (run.kind === 'changed') run.lines.forEach((l, k) => state.changeAt.set(run.after + k, l));
      if (run.kind === 'moved') run.lines.forEach((l, k) => state.movedAt.set(run.after + k, run.before + k));
    }
  }

  // Whether Save asks where, in the computer's Save dialog: the browser has it, and the file opened
  // has a handle, for step 6 to tell the original apart. Otherwise Save downloads the copy (10.2).
  function canPick() { return PICKERS && (!state.doc || !!state.handle); }

  function updateBar() {
    const doc = state.doc;
    const changed = !!doc && C.unsaved(doc);                        // what no file holds yet: not the original, nor any copy (10.2)
    for (const id of ['goto-box', 'edit', 'undo', 'redo', 'save']) $(id).hidden = !doc;   // P9: hidden, not disabled, until a file is open
    $('edit').setAttribute('aria-pressed', String(!!doc && state.editing));
    $('middle').classList.toggle('is-edit-on', !!doc && state.editing);   // P10: the lines' editor's look, while Edit is on
    $('fold-all').hidden = !doc;
    $('file-name').hidden = !doc;
    $('file-name').setAttribute('aria-expanded', String(state.showFacts));
    $('facts').hidden = !doc || !state.showFacts;
    $('dirty').hidden = !changed;
    $('dirty').title = doc && doc.copies.length ? 'Changes in no copy yet' : 'Changed since it was opened';
    $('save').disabled = !changed;
    $('save').textContent = canPick() ? 'Save' : 'Download a copy';
    $('save').title = canPick() ? 'Save a dated copy, where you choose; the original is never written (⌘S)'
      : 'Download a dated copy; the original is never written (⌘S)';
    $('undo').disabled = !doc || !doc.done.length;
    $('redo').disabled = !doc || !doc.undone.length;
    $('undo').title = doc && doc.done.length ? `Undo: ${doc.done[doc.done.length - 1].label} (⌘Z)` : 'Undo (⌘Z)';
    $('redo').title = doc && doc.undone.length ? `Redo: ${doc.undone[doc.undone.length - 1].label} (⇧⌘Z)` : 'Redo (⇧⌘Z)';
    // The tab's title lands in the browser's history, and in synced history, so a file's name was
    // leaving the machine through the browser. The title holds the name only when asked to.
    const mark = changed ? '● ' : '';
    document.title = doc && state.nameInTab ? `${mark}${state.fileName} - GEDCOM Viewer` : `${mark}GEDCOM Viewer`;
  }

  // ---------------------------------------------------------------------------------------------
  // The right pane: what can be done to the selected line; its whole value, its words as saved,
  // its joined value, its record, what points at it, and its findings
  // ---------------------------------------------------------------------------------------------

  function section(parent, title) {
    const sec = el('div', 'detail-section');
    if (title) sec.appendChild(el('div', 'detail-title', title));
    parent.appendChild(sec);
    return sec;
  }

  // 3.8 — a record's label (section 8), as the screen shows it: with Bold surnames on, the part
  // between slashes in bold and without them. Labels only; a line as written goes through putText.
  function putLabel(parent, label) {
    if (!state.boldSurnames) { putText(parent, label); return; }
    for (const part of C.nameParts(label)) {
      if (part.surname) {
        const b = el('span', 'surname');
        putText(b, part.text);
        parent.appendChild(b);
      } else putText(parent, part.text);
    }
  }

  function recordRef(parent, r) {
    const m = state.m;
    const line = m.records[r];
    if (m.xref[line] !== null) {
      parent.appendChild(el('span', 'id', m.xref[line]));
      parent.appendChild(document.createTextNode(' '));
    }
    parent.appendChild(el('span', 'tg', m.tag[line]));
    const label = m.labels[r];
    if (label !== m.texts[line].slice(m.lead[line])) {
      parent.appendChild(document.createTextNode(' '));
      const main = el('span', 'main');
      putLabel(main, label);
      parent.appendChild(main);
    }
  }

  // 3.2 — a copy button at a box's top right: one click copies the box's text, `text()` giving it
  // exactly as the box shows it, and the icon is a check mark for 1.5 seconds. If the clipboard
  // refuses, the box's text is selected so that ⌘C copies it, and a notice says so.
  function copyButton(box, text) {
    box.classList.add('has-copy');
    const b = el('button', 'copy');
    b.type = 'button';
    b.title = 'Copy';
    b.setAttribute('aria-label', 'Copy');
    wireCopy(b, text, () => {
      const range = document.createRange();
      range.selectNodeContents(box);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      notice('The clipboard refused, so the text is selected instead: ⌘C copies it.', 'error');
    });
    box.appendChild(b);
    return b;
  }

  // A copy button's click: what `text()` gives (a text, or a promise of one) to the clipboard, and
  // the icon a check mark for 1.5 seconds; refused, `refused(text)` offers the text another way.
  function wireCopy(b, text, refused) {
    const icon = (id) => $(id).content.firstElementChild.cloneNode(true);
    b.appendChild(icon('icon-copy'));
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      let t = text();
      if (typeof t !== 'string') t = await t;
      let copied = false;
      try {
        await navigator.clipboard.writeText(t);
        copied = true;
      } catch (err) { copied = false; }
      if (!copied) {
        refused(t);
        return;
      }
      b.textContent = '';
      b.appendChild(icon('icon-check'));
      b.classList.add('is-done');
      setTimeout(() => {
        b.textContent = '';
        b.appendChild(icon('icon-copy'));
        b.classList.remove('is-done');
      }, 1500);
    });
  }

  // A box of text with its copy button: the text as written, its special characters marked.
  function textBox(cls, text) {
    const box = el('div', cls);
    putText(box, text);
    copyButton(box, () => text);
    return box;
  }

  // 3.6 — what a check means, in the right frame.
  function renderHelp(d, code) {
    const c = CHECK[code];
    const box = el('div', `help is-${c.kind}`);
    const head = el('div');
    head.appendChild(el('span', 'help-code', code));
    head.appendChild(el('span', 'help-name', c.name));
    box.appendChild(head);
    box.appendChild(el('div', 'help-text', CHECK_HELP[code]));
    const n = state.m ? state.m.findings.byCode[code].length : 0;
    box.appendChild(el('div', 'detail-title', n ? `${plural(n, 'line', 'lines')} in this file` : 'none in this file'));
    d.appendChild(box);
  }

  // 3.3 — the XML of a _META, and the HTML of its story, read in an inert document and handed to
  // core.js as plain nodes: nothing in them is ever put in the page as markup, and nothing loads.
  function domToTree(node) {
    if (node.nodeType === 3 || node.nodeType === 4) return { text: node.data };
    if (node.nodeType === 8) return { comment: true };
    if (node.nodeType !== 1) return null;
    const attrs = {};
    for (const a of node.attributes) attrs[a.name.toLowerCase()] = a.value;
    const children = [];
    for (const c of node.childNodes) {
      const t = domToTree(c);
      if (t) children.push(t);
    }
    return { name: node.nodeName.toLowerCase(), attrs, children };
  }

  function metaOf(text) {
    if (!/^\s*<metadataxml[\s>]/i.test(text)) return null;
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    if (xml.getElementsByTagName('parsererror').length || !xml.documentElement) {
      // Chrome adds its own styled error block to this inert document, and refuses that style under the policy
      // (index.html), with messages of its own in the console. Nothing from the block is ever drawn.
      console.info('GEDCOM Viewer: a _META held XML that does not parse, so nothing is drawn from it. The policy messages above are Chrome refusing the styles on its own error block. Nothing was sent anywhere.');
      return null;
    }
    return C.metaParts(domToTree(xml.documentElement), (html) => domToTree(parser.parseFromString(C.stripStyles(html), 'text/html').body));
  }

  // The rebuilt story as elements: only what the allowlist kept, built by name, never as markup.
  function buildNodes(parent, nodes) {
    for (const n of nodes) {
      if (n.text !== undefined) { parent.appendChild(document.createTextNode(n.text)); continue; }
      const e = document.createElement(n.name);
      for (const [k, v] of Object.entries(n.attrs)) e.setAttribute(k, v);
      buildNodes(e, n.children);
      parent.appendChild(e);
    }
  }

  // Each part under the name the file gives it.
  function named(d, name) {
    const sec = section(d, name);
    sec.firstChild.classList.add('mono');
    return sec;
  }

  function renderMeta(d, parts) {
    if (parts.story) {
      const card = el('div', 'detail-card meta-story');
      buildNodes(card, parts.story);
      copyButton(card, () => card.innerText);
      named(d, 'content').appendChild(card);
    }
    if (parts.transcription) named(d, 'transcription').appendChild(textBox('detail-card detail-value meta-text', parts.transcription));
    if (parts.persons.length) {
      const table = el('table', 'persons');
      const head = el('tr');
      for (const t of ['Name', 'Born', 'Birthplace', 'Died', 'Death place']) head.appendChild(el('th', null, t));
      table.appendChild(head);
      for (const p of parts.persons) {
        const row = el('tr');
        for (const k of ['name', 'born', 'birthplace', 'died', 'deathplace']) row.appendChild(el('td', null, p[k]));
        table.appendChild(row);
      }
      const card = el('div', 'detail-card');
      card.appendChild(table);
      copyButton(card, () => table.innerText);
      named(d, 'personas').appendChild(card);
    }
    if (parts.cemetery) named(d, 'cemetery').appendChild(textBox('detail-value meta-text', parts.cemetery));
    if (parts.recordId) named(d, 'record_source_gid').appendChild(textBox('detail-value meta-text', parts.recordId));
  }

  function actionButton(parent, label, title, act, disabled) {
    const b = el('button', 'button', label);
    b.type = 'button';
    b.title = title;
    b.disabled = !!disabled;
    b.addEventListener('click', act);
    parent.appendChild(b);
  }

  // A removed line, selected with Edit on: what it was, where, and Restore.
  function renderRemoved(d, x) {
    const run = x.run;
    const n = run.lines.length;
    const acts = el('div', 'detail-actions');
    actionButton(acts, n > 1 ? `Restore ${fmt(n)} lines` : 'Restore', 'Put back where they were', () => restoreRemoved(x));
    d.appendChild(acts);
    d.appendChild(el('div', 'detail-removed-title', `Removed · line ${fmt(run.before + x.k + 1)} as saved`));
    d.appendChild(textBox('detail-value detail-removed', run.lines[x.k].was));
    if (run.record) d.appendChild(el('div', 'detail-section', `in ${recordName(run.record.id, run.record.tag)}`));
  }

  // The right frame's title (P9, B1): the line it shows, as the number column writes it (Line 41,201);
  // when more than one line is in hand, Lines 41,201-41,215: a Go to Line range in force, or else a
  // selected line whose block is shut, from it through the last line it hides.
  function frameTitle(i) {
    const m = state.m;
    const span = (a, b) => (a === b ? `Line ${fmt(a + 1)}` : `Lines ${fmt(a + 1)}-${fmt(b + 1)}`);
    if (state.range) return span(state.range.a, state.range.b);
    if (isShut(i)) return span(i, C.subtreeEnd(m, i) - 1);
    return span(i, i);
  }

  function renderDetail() {
    const d = $('detail');
    d.textContent = '';
    $('frame-title').textContent = '';                               // no line selected, a check's meaning, a removed line: no title
    const m = state.m;
    if (state.help) {
      renderHelp(d, state.help);
      return;
    }
    const removed = pickedRemoved();
    if (removed) {
      renderRemoved(d, removed);
      return;
    }
    const i = state.sel;
    if (!m || i < 0 || i >= m.n) return;
    $('frame-title').textContent = frameTitle(i);
    const typing = state.edit && state.edit.input ? state.edit : null;
    if (typing && typing.kind !== 'edit') {                          // a new line being typed, shown first
      const sec = section(d, typing.kind === 'inside' ? 'New line, inside' : 'New line, after');
      const typed = typing.input.value;
      const box = el('div', 'detail-value');
      putParts(box, typed, partsFromShape(typed, C.lineShape(typed), false), typed.length, []);
      sec.appendChild(box);
    }
    const live = !!typing && typing.kind === 'edit' && typing.pos === i;   // the line itself as it is typed
    const t = live ? typing.input.value : m.texts[i];
    const shape = live ? C.lineShape(t) : null;
    const level = live ? shape.level : m.level[i];
    const valAt = live ? shape.valAt : m.valAt[i];
    const pointer = live ? valAt >= 0 && isPointerValue(t.slice(valAt)) : C.isPointerLine(m, i);
    const parts = live ? partsFromShape(t, shape, pointer) : partsOf(m, i);

    if (state.editing) {                                             // what can be done to it: with Edit on
      const acts = el('div', 'detail-actions');
      const cannot = C.editRefusal(state.doc, i);
      actionButton(acts, 'Edit line', cannot || 'Type over the whole line (Enter, or a double-click)', () => startEdit(state.sel), cannot);
      actionButton(acts, 'Add inside', 'A new line inside this block: directly under this line, one level deeper', () => startAdd('inside'));
      actionButton(acts, 'Add after', 'A new line after this block, at this line\'s level', () => startAdd('after'));
      actionButton(acts, 'Delete line', 'This line, and the lines under it (⌫)', () => deleteSelected());
      actionButton(acts, 'Delete record', 'The record this line is in, and the lines elsewhere that point at it',
        () => deleteRecordAsked(), m.recOf[i] < 0);
      d.appendChild(acts);
    }

    if (level >= 0) {
      const hasValue = valAt >= 0;
      const head = el('div', 'detail-head');
      putParts(head, t, hasValue ? parts.slice(0, -2) : parts, t.length, []);
      d.appendChild(head);
      if (hasValue && valAt < t.length) {
        const box = el('div', 'detail-value');
        const value = t.slice(valAt);
        if (pointer) {
          const link = el('span', 'ptr');
          putText(link, value);
          link.addEventListener('click', () => jumpToId(value));
          box.appendChild(link);
        } else putText(box, value);
        copyButton(box, () => value);
        d.appendChild(box);
      }
    } else {
      d.appendChild(textBox('detail-value raw', t));
    }

    const was = state.changeAt.get(i);
    const movedFrom = state.movedAt.get(i);
    if (was) {
      const sec = section(d, 'Was');
      sec.classList.add('detail-was');
      sec.appendChild(textBox('detail-value', was.was));
      if (was.ending) sec.appendChild(el('div', 'detail-title', `Line ending: ${was.ending[0]} → ${was.ending[1]}`));
    } else if (state.marks && state.marks.status[i] === 2) {
      section(d).appendChild(el('span', 'detail-added', 'Added'));
    }
    if (movedFrom !== undefined) section(d).appendChild(el('span', 'detail-moved', `Moved · line ${fmt(movedFrom + 1)} as saved`));

    const run = C.joinedValue(m, i);
    const head = run ? run.from : i;
    if (m.tag[head] === '_META') {                                   // 3.3: drawn as it reads, above Joined
      const meta = metaOf(run ? run.text : C.valueOf(m, head));
      if (meta && !meta.empty) renderMeta(d, meta);
    }
    if (run) section(d, 'Joined').appendChild(textBox('detail-card detail-value', run.text));

    const r = m.recOf[i];
    if (r >= 0 && m.records[r] !== i) {
      const sec = section(d);
      sec.classList.add('detail-link');
      sec.appendChild(document.createTextNode('in '));
      recordRef(sec, r);
      sec.addEventListener('click', () => select(m.records[r], 'jump'));
    } else if (r >= 0 && m.labels[r] !== t.slice(m.lead[i])) {
      putLabel(section(d), m.labels[r]);
    }

    if (m.level[i] === 0 && m.xref[i] !== null) {
      const by = m.pointedBy.get(m.xref[i]) || [];
      if (by.length) {
        const sec = section(d, `Pointed at by ${fmt(by.length)}`);
        const list = el('div', 'detail-list');
        for (const j of by.slice(0, POINTERS_SHOWN)) {
          const row = el('div', 'detail-row');
          row.appendChild(el('span', 'ln-small', fmt(j + 1)));
          const main = el('span', 'main');
          if (m.recOf[j] >= 0) recordRef(main, m.recOf[j]);
          row.appendChild(main);
          row.appendChild(el('span', 'tg', m.tag[j]));
          row.addEventListener('click', () => select(j, 'jump'));
          list.appendChild(row);
        }
        if (by.length > POINTERS_SHOWN) list.appendChild(el('div', 'detail-title', `+ ${fmt(by.length - POINTERS_SHOWN)}`));
        sec.appendChild(list);
      }
    }

    const found = m.findings.atLine.get(i);
    if (found) {
      const sec = section(d);
      for (const f of found) {
        const c = CHECK[f.code];
        const row = el('div', `finding is-${c.kind}`);
        row.appendChild(el('span', 'code', f.code));
        const main = el('span', 'main');
        putText(main, f.detail !== undefined && SAYS_WHAT.has(f.code) ? `${c.name} · ${f.detail}` : c.name);
        row.appendChild(main);
        sec.appendChild(row);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The bar, the facts line and the counts bar
  // ---------------------------------------------------------------------------------------------

  function sizeOf(n) {
    if (n < 1000) return `${n} B`;
    if (n < 1e6) return `${(n / 1e3).toFixed(1)} KB`;
    return `${(n / 1e6).toFixed(1)} MB`;
  }

  // The file's facts, in the owner's order: the GEDCOM version, the encoding, when and by what it
  // was exported, its size on disk, its lines, and its sha256 on demand. Shown under the file's
  // name when the name is clicked. A fact that comes from a line of the header goes to that line.
  function renderFacts() {
    const m = state.m;
    const f = $('facts');
    f.textContent = '';
    if (!m) return;
    const where = m.facts.lines;
    const fact = (text, line) => {
      if (line === undefined || line < 0) return el('span', 'fact', text);
      const b = el('button', 'fact is-link', text);
      b.type = 'button';
      b.addEventListener('click', () => select(line, 'jump'));
      return b;
    };
    const groups = [];
    if (m.version) groups.push([fact(`GEDCOM ${m.version}`, where.version)]);
    groups.push([fact(m.encodingLabel, where.char)]);
    const source = [m.facts.source, m.facts.sourceVersion].filter((x) => x).join(' ');
    const made = [];
    if (m.facts.date) made.push(fact(`exported ${m.facts.date}`, where.date));
    if (source) made.push(fact(`${m.facts.date ? 'by' : 'exported by'} ${source}`, where.source));
    if (made.length) groups.push(made);
    groups.push([fact(sizeOf(state.disk.bytes))]);
    groups.push([fact(`${fmt(m.n)} lines`)]);
    const sha = el('button', 'sha', 'sha256');
    sha.type = 'button';
    sha.title = SHA_TITLE;
    sha.addEventListener('click', async () => {
      const hex = state.disk.sha256 || await state.hashing;
      const shown = el('span', 'hash', hex);
      shown.title = SHA_TITLE;
      sha.replaceWith(shown);
    });
    groups.push([sha]);
    groups.forEach((g, k) => {
      if (k) f.appendChild(document.createTextNode(' · '));
      g.forEach((x, j) => {
        if (j) f.appendChild(document.createTextNode(' '));
        f.appendChild(x);
      });
    });
    const another = el('button', 'fact is-link open-another', 'Open another GEDCOM…');
    another.type = 'button';
    another.title = '⌘O, or drop a file on the page. Nothing leaves the machine: the file is read here.';
    another.addEventListener('click', pickFile);
    f.appendChild(another);
  }

  function renderCounts() {
    const bar = $('counts');
    bar.textContent = '';
    for (const [tg, n] of C.recordCounts(state.m)) {
      const b = el('button', 'count-item');
      b.type = 'button';
      b.title = tg;
      b.appendChild(el('span', 'count-name', RECORD_NAMES[tg] || tg));
      b.appendChild(el('span', 'count-figure', fmt(n)));
      b.addEventListener('click', () => {
        state.recordType = tg;
        openPanel('records');
        filterRecords();
      });
      bar.appendChild(b);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The side panels: Records, Checks, Changes, Search, Tags
  // ---------------------------------------------------------------------------------------------

  const PANELS = ['records', 'checks', 'changes', 'search', 'tags'];

  function openPanel(name) {
    for (const tab of document.querySelectorAll('.tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.panel === name));
    }
    for (const p of PANELS) $(`panel-${p}`).hidden = p !== name;
  }

  const recordsList = Virtual($('records-list'), (row, k) => {
    const m = state.m;
    const r = state.recordRows[k];
    const line = m.records[r];
    row.className = 'item';
    row.textContent = '';
    if (m.xref[line] !== null) row.appendChild(el('span', 'muted mono', m.xref[line]));
    const main = el('span', 'main');
    putLabel(main, m.labels[r].slice(0, 400));
    row.appendChild(main);
    row.appendChild(el('span', 'end', m.tag[line]));
  });

  function filterRecords(keepScroll) {
    const m = state.m;
    if (!m) return;
    const q = $('records-filter').value.trim().toLowerCase();
    const type = state.recordType;
    const rows = [];
    for (let r = 0; r < m.records.length; r += 1) {
      const line = m.records[r];
      if (type && m.tag[line] !== type) continue;
      if (q && m.labels[r].toLowerCase().indexOf(q) === -1 && C.nameShown(m.labels[r]).toLowerCase().indexOf(q) === -1
        && (m.xref[line] || '').toLowerCase().indexOf(q) === -1 && m.tag[line].toLowerCase() !== q) continue;
      rows.push(r);
    }
    state.recordRows = rows;
    const chip = $('records-type');
    chip.hidden = !type;
    chip.textContent = type ? `${RECORD_NAMES[type] || type} ×` : '';
    chip.title = type || '';
    recordsList.setCount(rows.length, keepScroll);
  }

  const checksList = Virtual($('checks-list'), (row, k) => {
    const m = state.m;
    const item = state.checkRows[k];
    row.textContent = '';
    if (item.head) {
      const c = item.head;
      row.className = `item is-head is-${c.kind}`;
      row.appendChild(el('span', 'fold', state.collapsed.has(c.code) ? '▸' : '▾'));   // opens or shuts its lines
      row.appendChild(el('span', 'muted', c.code));
      row.appendChild(el('span', 'main', c.name));                   // a click on the title: what it means (3.6)
      row.appendChild(el('span', 'end', fmt(m.findings.byCode[c.code].length)));
      return;
    }
    const f = item.f;
    row.className = 'item is-sub';
    row.appendChild(el('span', 'muted', f.line < 0 ? 'file' : fmt(f.line + 1)));
    const main = el('span', 'main mono');
    putText(main, (SAYS_WHAT.has(f.code) || f.line < 0 ? f.detail : m.texts[f.line]).slice(0, 400));
    row.appendChild(main);
  });

  function renderChecks(keepScroll) {
    const fnd = state.m.findings;
    const count = $('checks-count');
    count.textContent = '';
    if (fnd.errors) count.appendChild(el('span', 'n-error', fmt(fnd.errors)));
    if (fnd.notes) count.appendChild(el('span', 'n-note', fmt(fnd.notes)));
    $('checks-sum').textContent = `${plural(fnd.errors, 'error', 'errors')} · ${plural(fnd.notes, 'note', 'notes')}`;
    buildCheckRows(keepScroll);
  }

  function buildCheckRows(keepScroll) {
    const m = state.m;
    const rows = [];
    for (const c of C.CHECKS) {
      const list = m.findings.byCode[c.code];
      if (!list.length) continue;
      rows.push({ head: c });
      if (state.collapsed.has(c.code)) continue;
      for (const f of list) rows.push({ f: { code: c.code, line: f.line, detail: f.detail } });
    }
    state.checkRows = rows;
    checksList.setCount(rows.length, keepScroll);
  }

  // Changes: the net change from the original, as it was opened, run by run (9.4), however many
  // copies have been written since (10.2). A run shows the line it is at now: a removed run, the
  // line now below where it was.
  const changesList = Virtual($('changes-list'), (row, k) => {
    const run = state.runs[k];
    row.className = `item is-${run.kind}`;
    row.textContent = '';
    const at = run.kind === 'removed' ? run.at : run.after;
    row.appendChild(el('span', 'muted', fmt(at + 1)));
    const first = run.lines[0];
    const main = el('span', run.kind === 'moved' ? 'main' : 'main mono');
    if (run.kind === 'moved') main.textContent = `moved: ${S.movedWords(run)}`;   // what moved, never its text (3.4a)
    else putText(main, (run.kind === 'removed' ? first.was : first.now).slice(0, 400));
    row.appendChild(main);
    const more = run.kind !== 'moved' && run.lines.length > 1 ? `+${fmt(run.lines.length - 1)}` : '';
    const where = run.record ? run.record.id || run.record.tag || '' : run.kind === 'moved' && run.moved.tag ? run.moved.tag : '';
    row.appendChild(el('span', 'end', run.header ? 'header' : [more, run.stamp ? 'stamp' : '', where].filter((x) => x).join(' · ')));   // the header's date: one line, in HEAD
    const span = (first0) => (run.lines.length > 1 ? `${fmt(first0 + 1)}–${fmt(first0 + run.lines.length)}` : fmt(first0 + 1));
    const before = run.kind === 'moved' ? `; lines ${span(run.before)} as saved, now ${span(run.after)}`
      : run.before >= 0 ? `; line ${fmt(run.before + 1)} as saved` : '';
    row.title = `${run.kind}${run.header ? ' as the date in the header' : run.stamp ? ' by a change stamp' : ''}: ${plural(run.lines.length, 'line', 'lines')}${before}`;
  });

  function changeCounts(runs) {
    const count = { changed: 0, removed: 0, added: 0, moved: 0 };
    for (const run of runs) count[run.kind] += run.lines.length;
    const words = [`${fmt(count.changed)} changed`, `${fmt(count.removed)} removed`, `${fmt(count.added)} added`];
    if (count.moved) words.push(`${fmt(count.moved)} moved`);
    return words.join(' · ');
  }

  function renderChanges() {
    $('changes-count').textContent = state.runs.length ? fmt(state.runs.length) : '';
    $('changes-sum').textContent = changeCounts(state.runs);
    $('changes-copy').hidden = !state.doc;
    changesList.setCount(state.runs.length, true);
  }

  // 10.3: the Changes tab's copy button: the list below it as text (save.js, changesText), on the
  // clipboard and nowhere else. The original's sha256 is taken as the file opens, so it is all but
  // always there by the first click. Refused, the text is shown in a box, selected, for ⌘C.
  function changesAsText() {
    const build = (sha256) => S.changesText({ when: new Date(), file: state.fileName,
      original: { sha256, bytes: state.disk.bytes, lines: state.disk.lines }, runs: state.runs });
    return state.disk.sha256 ? build(state.disk.sha256) : state.hashing.then(build);
  }
  wireCopy($('changes-copy'), changesAsText, (text) => {
    let box;
    dialog('The changes, as text', (body) => {
      body.appendChild(el('div', 'dialog-sum', 'The clipboard refused, so the text is here, selected: ⌘C copies it.'));
      box = el('textarea', 'report');
      box.value = text;
      box.readOnly = true;
      box.rows = 11;
      box.spellcheck = false;
      box.setAttribute('translate', 'no');
      box.setAttribute('aria-label', 'The changes, as text');
      body.appendChild(box);
    }, [{ label: 'Close', value: '', primary: true }]);
    box.focus();
    box.select();
  });

  const tagsList = Virtual($('tags-list'), (row, k) => {
    const [tg, n] = state.tagRows[k];
    row.className = 'item';
    row.textContent = '';
    row.appendChild(el('span', 'main mono', tg));
    row.appendChild(el('span', 'end', fmt(n)));
  });

  // The Tags list in one of four orders, the button beside it stepping to the next: by count,
  // largest first; by count, smallest first; A–Z; Z–A.
  const TAG_ORDERS = [
    (a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1),
    (a, b) => (a[1] - b[1]) || (a[0] < b[0] ? -1 : 1),
    (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    (a, b) => (a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : 0),
  ];
  // The button reads Sort; the order in force is named in its hover text alone (the owner, 0.5.1:
  // the orders are not named on its face).
  const TAG_ORDER_NAMES = ['by count', 'by count rising', 'A to Z', 'Z to A'];
  function renderTags(keepScroll) {
    state.tagRows = [...state.m.tagCounts.entries()].sort(TAG_ORDERS[state.tagsOrder]);
    tagsList.setCount(state.tagRows.length, keepScroll);
  }
  function updateTagsOrder() { $('tags-order').title = TAG_ORDER_NAMES[state.tagsOrder]; }
  $('tags-order').addEventListener('click', () => {
    state.tagsOrder = (state.tagsOrder + 1) % TAG_ORDERS.length;
    store.set('tagsOrder', state.tagsOrder);
    updateTagsOrder();
    if (state.m) renderTags(false);
  });

  // -- search -----------------------------------------------------------------------------------

  const tagMode = () => $('search-tag').getAttribute('aria-pressed') === 'true';

  function runSearch() {
    const m = state.m;
    if (!m) return;
    const query = $('search-box').value;
    const tag = tagMode();
    const hits = !query ? [] : tag ? C.searchTag(m, query.trim()) : C.search(m, query);
    state.search = { query, tag, hits, at: -1, idDone: false };
    state.hitFlags = hits.length ? new Uint8Array(m.n) : null;
    for (const hitLine of hits) state.hitFlags[hitLine] = 1;
    state.highlight = query && !tag ? new RegExp(escapeRegExp(query), 'giu') : null;
    updateSearch();
    grid.refresh();
  }

  function updateSearch() {
    const s = state.search;
    let text = '';
    if (s.query) text = s.at >= 0 ? `${fmt(s.at + 1)} of ${fmt(s.hits.length)}` : fmt(s.hits.length);
    $('search-count').textContent = text;
    $('search-prev').disabled = !s.hits.length;
    $('search-next').disabled = !s.hits.length;
  }

  function stepSearch(dir) {
    const m = state.m;
    if (!m) return;
    if (state.search.query !== $('search-box').value || state.search.tag !== tagMode()) runSearch();
    const s = state.search;
    const id = s.query.trim();
    if (!s.tag && !s.idDone && ID_WHOLE.test(id) && m.definedAt.has(id)) {
      // an id typed whole goes to its record first
      s.idDone = true;
      const line = m.definedAt.get(id)[0];
      s.at = lowerBound(s.hits, line);
      select(line, 'jump');
      updateSearch();
      return;
    }
    if (!s.hits.length) return;
    const n = s.hits.length;
    let k;
    if (s.at >= 0 && s.hits[s.at] === state.sel) k = s.at + dir;
    else if (dir > 0) k = lowerBound(s.hits, Math.max(0, state.sel));
    else k = lowerBound(s.hits, Math.max(0, state.sel) + 1) - 1;
    k = ((k % n) + n) % n;
    s.at = k;
    select(s.hits[k], 'step');
    updateSearch();
  }

  // ---------------------------------------------------------------------------------------------
  // Dialogs and notices
  // ---------------------------------------------------------------------------------------------

  let noticeTimer = 0;
  function notice(text, kind) {
    const n = $('notice');
    n.textContent = text;
    n.className = `notice${kind ? ` is-${kind}` : ''}`;
    n.hidden = false;
    clearTimeout(noticeTimer);
    if (kind !== 'error') noticeTimer = setTimeout(() => { n.hidden = true; }, 9000);
  }
  $('notice').addEventListener('click', () => { $('notice').hidden = true; });

  // P8 — Report a problem (Settings; 0.5.3). core.js writes the report from counts and codes; the
  // dialog shows it in a box to read, change or cut, with a line under it saying whether it still
  // reads as built; a second box, What happened, the reporter's own words; Copy puts the first box
  // as it reads, then "What happened:" and the second, on the clipboard — and nothing else. Nothing
  // is sent, and the original is kept nowhere.
  function browserName() {
    const ua = navigator.userAgent;
    const pick = (pairs) => { for (const [name, re] of pairs) { const x = re.exec(ua); if (x) return x[1] ? `${name} ${x[1]}` : name; } return ''; };
    const browser = pick([['Edge', /Edg\/(\d+)/], ['Chrome', /Chrome\/(\d+)/], ['Firefox', /Firefox\/(\d+)/], ['Safari', /Version\/(\d+)[.\d]* .*Safari/]]) || 'a browser';
    const os = pick([['iOS', /iPhone|iPad/], ['macOS', /Mac OS X/], ['Windows', /Windows/], ['Android', /Android/], ['Linux', /Linux/]]);
    return [browser, os].filter((x) => x).join(' · ');
  }

  // A text to the clipboard; refused, the box's text is selected instead, so that ⌘C copies it (3.2).
  async function copyPlain(text, box, said) {
    try {
      await navigator.clipboard.writeText(text);
      notice(said);
      return true;
    } catch (err) {
      if (box && box.select) box.select();
      notice('The clipboard refused, so the report box is selected instead: ⌘C copies it; add What happened by hand.', 'error');
      return false;
    }
  }

  async function reportProblem() {
    const version = $('version').textContent;                       // the foot of the Settings menu: the one place the version is written
    const where = location.protocol === 'file:' ? 'opened from disk' : location.host;
    const settings = `theme ${state.theme} · Text size ${state.textSize} · Indent ${state.indent ? 'on' : 'off'} · Bold surnames ${state.boldSurnames ? 'on' : 'off'} · File name in the tab ${state.nameInTab ? 'on' : 'off'} · Date in the header ${state.headerNote ? 'on' : 'off'}`;
    const info = {
      version, where, browser: browserName(),
      bytes: state.disk ? state.disk.bytes : null,
      sha256: state.disk ? (state.disk.sha256 || await state.hashing) : null,
      editing: !!state.editing, settings,
      unsaved: state.doc && C.unsaved(state.doc) ? C.changeRuns(state.doc, null, state.doc.copiedOrder).length : 0,   // in no copy yet
    };
    const encoder = new TextEncoder();
    const text = C.report(state.m, info);
    const built = C.withChecksum(text, await sha256(encoder.encode(`${text}\n`)));
    let box;
    let what;
    let stateLine;
    const asBuilt = async () => {
      const p = C.reportChecksumParts(box.value);
      if (!p.claimed) { stateLine.textContent = 'No checksum line: the report cannot be read back as built.'; return; }
      const hex = await sha256(encoder.encode(p.above));
      stateLine.textContent = hex.startsWith(p.claimed)
        ? 'As built: the checksum matches the lines above it.'
        : 'Changed since it was built: the checksum no longer matches the lines above it.';
    };
    const composed = () => `${box.value.replace(/\n+$/, '')}\nWhat happened: ${what.value.trim() || '(nothing said)'}\n`;
    await dialog('Report a problem', (body) => {
      body.appendChild(el('div', 'dialog-sum', 'Nothing is sent by this page. The box holds counts and codes only, never a line of the file. ' +
        'Read it; change or cut anything; then Copy, and paste it into a new issue at github.com/bunahu/gedcom-viewer/issues, or into an email to feedback@gedcom-viewer.net. The privacy page says more.'));
      box = el('textarea', 'report');
      box.id = 'report-text';
      box.value = built;
      box.rows = 11;
      box.spellcheck = false;
      box.setAttribute('aria-label', 'The report');
      box.addEventListener('input', () => { asBuilt(); });
      body.appendChild(box);
      stateLine = el('div', 'dialog-sum');
      stateLine.id = 'report-state';
      body.appendChild(stateLine);
      body.appendChild(el('div', 'dialog-sum', 'What happened, in your own words. An issue is public, so write nothing there you would not want seen.'));
      what = el('textarea', 'report is-words');
      what.id = 'report-what';
      what.rows = 4;
      what.setAttribute('aria-label', 'What happened');
      body.appendChild(what);
      const row = el('div', 'dialog-note');
      const copy = el('button', 'button is-primary', 'Copy');
      copy.type = 'button';
      copy.id = 'report-copy';
      copy.addEventListener('click', () => copyPlain(composed(), box, 'Copied: the report, then What happened. Paste it into a new issue at github.com/bunahu/gedcom-viewer/issues, or into an email to feedback@gedcom-viewer.net.'));
      row.appendChild(copy);
      row.appendChild(el('span', 'muted', 'puts the report as it reads, then What happened, on the clipboard'));
      body.appendChild(row);
      asBuilt();
    }, [{ label: 'Close', value: '' }]);
  }

  // A question in parts, as core.js words it: a record's label shown as labels are (3.8), a line's
  // own text with its special characters marked, and the words between.
  function putQuestion(parent, parts) {
    for (const p of parts) {
      if (p.as === 'label') putLabel(parent, p.text);
      else if (p.as === 'line') putText(parent, p.text);
      else parent.appendChild(document.createTextNode(p.text));
    }
  }

  // A dialog: a title (its words, or a function that puts them in the heading), what `fill` puts in
  // its body, and its buttons. It resolves with the value of the button pressed, or null for Cancel or Esc.
  function dialog(title, fill, buttons) {
    const d = $('dialog');
    d.textContent = '';
    const form = el('form', 'dialog-form');
    form.method = 'dialog';
    const heading = el('h2', 'dialog-title');
    if (typeof title === 'function') title(heading); else heading.textContent = title;
    form.appendChild(heading);
    const body = el('div', 'dialog-body');
    fill(body);
    form.appendChild(body);
    const row = el('div', 'dialog-buttons');
    let primary = null;
    for (const b of buttons) {
      const btn = el('button', b.primary ? 'button is-primary' : 'button', b.label);
      btn.type = 'submit';
      btn.value = b.value;
      if (b.primary) primary = btn;
      row.appendChild(btn);
    }
    form.appendChild(row);
    d.appendChild(form);
    return new Promise((resolve) => {
      d.addEventListener('close', () => {
        resolve(d.returnValue || null);
        if (state.doc) $('grid').focus();
      }, { once: true });
      d.returnValue = '';
      d.showModal();
      const first = body.querySelector('input[type=text]:not(:disabled)');
      (first || primary || d).focus();
    });
  }

  function saidLoudly(title, text) {
    return dialog(title, (body) => body.appendChild(el('div', null, text)), [{ label: 'Close', value: '', primary: true }]);
  }

  // The runs of a change, as the Save dialog lists them: kind, line numbers, record, and the
  // lines themselves, − as they were and + as they are.
  function putRuns(list, runs) {
    for (const run of runs) {
      const head = el('div', `chg is-${run.kind}`);
      head.appendChild(el('span', 'chg-kind', run.header ? `${run.kind}, the date in the header` : run.stamp ? `${run.kind} · stamp` : run.kind));
      const n = run.lines.length;
      const span = (first) => (n > 1 ? `${fmt(first + 1)}–${fmt(first + n)}` : fmt(first + 1));
      const where = run.kind === 'changed' ? `line ${span(run.after)}` : run.kind === 'added' ? `line ${span(run.after)}`
        : run.kind === 'moved' ? `line ${span(run.before)} as saved → ${span(run.after)}` : `line ${span(run.before)} as saved`;
      head.appendChild(el('span', 'muted', where));
      if (run.record) head.appendChild(el('span', 'muted', recordName(run.record.id, run.record.tag)));
      list.appendChild(head);
      if (run.kind === 'moved') {                                    // what moved and how many lines, never their text
        list.appendChild(el('div', 'chg-line muted', S.movedWords(run)));
        continue;
      }
      for (const l of run.lines.slice(0, LINES_SHOWN)) {
        for (const [text, cls, sign] of [[l.was, 'is-was', '−'], [l.now, 'is-now', '+']]) {
          if (text === null) continue;
          const line = el('div', `chg-line ${cls}`);
          line.appendChild(el('span', 'chg-sign', sign));
          putText(line, text.slice(0, 400));
          list.appendChild(line);
        }
        if (l.ending) list.appendChild(el('div', 'chg-line muted', `line ending: ${l.ending[0]} → ${l.ending[1]}`));
      }
      if (n > LINES_SHOWN) list.appendChild(el('div', 'chg-line muted', `+ ${plural(n - LINES_SHOWN, 'line', 'lines')}`));
    }
  }

  // A checkbox of the Save dialog, with its words; `off` says why it cannot be ticked, under it.
  function checkRow(body, id, words, checked, off) {
    const label = el('label', 'dialog-check');
    const box = el('input');
    box.type = 'checkbox';
    box.id = id;
    box.checked = checked;
    label.appendChild(box);
    label.appendChild(el('span', null, words));
    body.appendChild(label);
    if (off) {
      box.disabled = true;
      body.appendChild(el('div', 'dialog-off', off));
    }
    return box;
  }

  // A record, as the Save dialog names it: its id and tag, then its label where that says more.
  function recordRow(line) {
    const m = state.m;
    const row = el('div', 'dialog-rec');
    row.appendChild(el('span', 'mono', recordName(m.xref[line], m.tag[line])));
    const label = m.labels[m.recOf[line]];
    if (label && label !== m.texts[line].slice(m.lead[line])) {
      row.appendChild(document.createTextNode(' '));
      putLabel(row, label);
    }
    return row;
  }

  // A line the save will write, indented as the file indents it; a line already there, quiet.
  function planRow(l) {
    const row = el('div', `dialog-line${l.how === 'kept' ? ' is-kept' : ''}`);
    row.style.setProperty('--lv', String(Math.max(0, l.level)));
    putText(row, l.text);
    return row;
  }

  // 10.2 step 2: every change since the original; under Add change stamps (F1: ticked unless
  // unticked, and remembered) each record that gains a stamp, as the lines it gains or has set,
  // indented as the file indents them, with the values they will be written with, and the Note box
  // among them; under Note the date in the header (ticked unless unticked, and remembered) the line
  // HEAD gains or has set. Unticked, a box's lines are hidden, the Note box with the stamps'. The
  // moment shown is the moment the save is made at, so what the dialog shows is what is written.
  // `picks` says whether the computer's Save dialog comes next, or a download. Resolves with
  // { note, stamps, header, when }, or null.
  async function saveDialog(picks) {
    const doc = state.doc;
    const when = new Date();
    const plan = C.stampPlan(doc, when, '');
    const head = C.headerPlan(doc, when);
    let note;
    let stampBox;
    let headerBox;
    const go = await dialog(`${picks ? 'Save' : 'Download'} a copy of ${state.fileName}`, (body) => {
      body.appendChild(el('div', 'dialog-sum', changeCounts(state.runs)));
      const list = el('div', 'dialog-list');
      putRuns(list, state.runs);
      body.appendChild(list);
      stampBox = checkRow(body, 'save-stamps', 'Add change stamps', state.stamps, plan.length ? '' : 'no record to stamp');
      const stamps = el('div', 'dialog-block');
      stamps.id = 'save-stamp-lines';
      const notes = [];                                              // each stamp's NOTE, to show the note typed, or the record's own
      for (const p of plan) {
        stamps.appendChild(recordRow(p.line));
        for (const l of p.lines) {
          const row = planRow(l);
          if (l.how !== 'kept' && l.text.startsWith(`${l.level} NOTE `)) notes.push({ row, level: l.level, own: p.note });
          stamps.appendChild(row);
        }
      }
      const noteRow = el('label', 'dialog-note');
      noteRow.appendChild(el('span', null, 'Note'));
      note = el('input', 'input');
      note.type = 'text';
      note.maxLength = C.STAMP_NOTE_MAX;
      note.title = 'One line, 200 characters at most, the same in every record stamped. Left empty, each record\'s note says what changed in it';
      note.addEventListener('input', () => {
        const typed = note.value.trim();
        for (const n of notes) n.row.textContent = `${n.level} NOTE ${typed || n.own}`;
      });
      noteRow.appendChild(note);
      stamps.appendChild(noteRow);
      body.appendChild(stamps);
      headerBox = checkRow(body, 'save-header', 'Note the date in the header', state.headerNote, head ? '' : 'no header in this file');
      const dated = el('div', 'dialog-block');
      dated.id = 'save-header-lines';
      if (head) {
        dated.appendChild(recordRow(head.line));
        for (const l of head.lines) dated.appendChild(planRow(l));
      }
      body.appendChild(dated);
      const shown = () => {
        stamps.hidden = stampBox.disabled || !stampBox.checked;
        dated.hidden = headerBox.disabled || !headerBox.checked;
      };
      shown();
      stampBox.addEventListener('change', shown);
      headerBox.addEventListener('change', shown);
    }, [CANCEL, { label: picks ? 'Save' : 'Download', value: 'go', primary: true }]);
    if (!go) return null;
    if (!stampBox.disabled) {
      state.stamps = stampBox.checked;
      store.set('stamps', state.stamps);
    }
    if (!headerBox.disabled) {
      state.headerNote = headerBox.checked;
      store.set('headerNote', state.headerNote);
    }
    const stamps = !stampBox.disabled && stampBox.checked;
    return { note: stamps ? note.value : '', stamps, header: !headerBox.disabled && headerBox.checked, when };
  }

  // ---------------------------------------------------------------------------------------------
  // Saving (10.2): a dated copy, never the original
  // ---------------------------------------------------------------------------------------------

  // Step 1 and the page's dialog (step 2) here; the rest in save.js, given the computer's Save
  // dialog to ask where, opening at the original, or, in a browser without it, the bytes back to
  // download. Nothing asks for a folder. One save at a time: ⌘S while one is under way does nothing.
  let saving = false;
  async function doSave() {
    if (!state.doc || $('dialog').open || saving) return;
    saving = true;
    try { await saveNow(); } finally { saving = false; }
  }

  async function saveNow() {
    if (state.edit && !commitEdit(false)) return;
    // 1. nothing to save, the lines being the original's or a copy's: say so, write nothing
    if (!C.unsaved(state.doc)) {
      notice(S.nothingSince(state.doc));
      return;
    }
    // 2. the dialog
    const picks = canPick();
    const choice = await saveDialog(picks);
    if (!choice) return;
    // 3 to 8: the stamps, the bytes, where, not the original, written and read back, the last copy
    const pick = picks ? (name) => window.showSaveFilePicker({ suggestedName: name, startIn: state.handle, types: GEDCOM_TYPES }) : null;
    const r = await S.save({ doc: state.doc, original: { name: state.fileName, handle: state.handle },
      when: choice.when, note: choice.note, stamps: choice.stamps, header: choice.header, hash: sha256, pick });
    afterAct(state.sel);
    if (r.done && r.download) {
      download(r.bytes, r.name);
      notice(`Downloaded as ${r.name}, where your browser keeps downloads.`, 'ok');
    } else if (r.done) notice(`Saved as ${r.name}.`, 'ok');
    else if (r.original) await refusedOriginal(r);
    else if (r.loud) await saidLoudly('The copy did not finish', r.say);
    else notice(r.say, r.cancelled ? '' : 'error');
  }

  // 10.2 step 6: the original was picked, and nothing was saved into it. If the browser had emptied
  // it, save.js put it back, and says nothing of it; if it could not, the original's bytes as they
  // were are offered as a download, to put in place of the empty file.
  async function refusedOriginal(r) {
    if (!r.restore) {
      await saidLoudly('Save failed', r.say);
      return;
    }
    const get = await dialog('No copy was written', (body) => body.appendChild(el('div', null, r.say)),
      [{ label: 'Close', value: '' }, { label: `Download ${state.fileName}`, value: 'get', primary: true }]);
    if (get) download(r.restore, state.fileName);
  }

  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type: type || 'application/octet-stream' }));
    const a = el('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ---------------------------------------------------------------------------------------------
  // Opening a file
  // ---------------------------------------------------------------------------------------------

  function showEmpty(message) {
    state.doc = null;
    state.m = null;
    state.handle = null;
    state.disk = null;
    state.sel = -1;
    state.back = [];
    state.edit = null;
    state.pending = null;
    state.folds = new Set();
    state.runs = [];
    state.rows = new Int32Array(0);
    state.rowOf = new Int32Array(0);
    state.extras = [];
    state.range = null;
    state.pick = null;
    state.help = null;
    state.movedAt = new Map();
    state.editing = false;
    endDrag();
    $('file-name').textContent = '';
    $('facts').textContent = '';
    $('counts').textContent = '';
    $('checks-count').textContent = '';
    $('checks-sum').textContent = '';
    $('changes-count').textContent = '';
    $('changes-sum').textContent = '';
    $('changes-copy').hidden = true;
    $('search-count').textContent = '';
    $('detail').textContent = '';
    $('frame-title').textContent = '';
    $('goto').value = '';
    state.gotoApplied = '';
    updateGoto();
    $('grid').scrollLeft = 0;
    state.recordRows = [];
    state.checkRows = [];
    state.tagRows = [];
    for (const list of [grid, recordsList, checksList, changesList, tagsList]) list.setCount(0);
    updateGridWidth();
    updateBack();
    updateBar();
    $('empty').hidden = false;
    $('message').hidden = !message;
    $('message').textContent = message || '';
  }

  // Changes not in any copy yet are dropped only when the owner says so.
  async function mayDropChanges() {
    if (state.edit && !commitEdit(false)) return false;
    if (!state.doc || !C.unsaved(state.doc)) return true;
    const go = await dialog(`${state.fileName} has changes that are not saved`, (body) => {
      body.appendChild(el('div', null, 'Opening another file drops them.'));
    }, [CANCEL, { label: 'Drop them, and open', value: 'go', primary: true }]);
    return !!go;
  }

  async function openFile(file, handle) {
    let doc;
    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      doc = C.openDocument(bytes);
    } catch (e) {
      showEmpty(`${file.name}: ${e.name}: ${e.message}`);
      return;
    }
    const most = Math.floor(MAX_PIXELS / grid.rowHeight());
    if (doc.m.n > most) {
      showEmpty(`${file.name} has ${fmt(doc.m.n)} lines. This page can show at most ${fmt(most)}.`);
      return;
    }
    if (state.edit) closeEditor();
    state.doc = doc;
    state.m = doc.view;
    state.fileName = file.name;
    state.handle = handle || null;
    state.disk = { sha256: null, bytes: bytes.length, lines: doc.m.n };
    state.hashing = sha256(bytes).then((hex) => {
      if (state.doc === doc && state.disk.sha256 === null) state.disk.sha256 = hex;
      return hex;
    });
    state.sel = -1;
    state.back = [];
    state.folds = new Set();
    state.sections = sectionsOf(doc.view);
    state.shutSections = new Set();
    state.range = null;
    state.pick = null;
    state.help = null;
    state.maxLevel = Math.max(0, ...[...doc.view.levelCounts.keys()].map(Number));
    state.editing = true;                                            // P10: a file opens with Edit on, as a text editor has it
    endDrag();
    state.pending = null;
    state.recordType = null;
    state.collapsed = new Set();
    state.search = { query: '', tag: false, hits: [], at: -1, idDone: false };
    state.hitFlags = null;
    state.highlight = null;
    $('search-box').value = '';
    $('search-tag').setAttribute('aria-pressed', 'false');
    $('records-filter').value = '';
    $('message').hidden = true;
    $('notice').hidden = true;
    $('empty').hidden = true;
    $('goto').value = '';
    state.gotoApplied = '';
    updateGoto();
    $('file-name').textContent = file.name;
    $('grid').scrollLeft = 0;                                        // a file opens at the lines' left edge
    $('grid').style.setProperty('--ln-width', `${fmt(doc.m.n).length + 1}ch`);
    updateGridWidth();
    updateMarks();
    renderFacts();
    renderCounts();
    renderChecks(false);
    renderChanges();
    renderTags(false);
    filterRecords(false);
    updateSearch();
    updateBack();
    updateBar();
    rebuildRows();
    grid.setCount(rowCount());
    select(0);
    $('grid').focus();
  }

  async function pickFile() {
    if (!(await mayDropChanges())) return;
    if (!PICKERS) {
      $('file-input').click();                                       // a browser with no pickers
      return;
    }
    let handle;
    try {
      [handle] = await window.showOpenFilePicker({ types: GEDCOM_TYPES });
    } catch (e) {
      if (e.name !== 'AbortError') notice(`${e.name}: ${e.message}`, 'error');
      return;
    }
    await openFile(await handle.getFile(), handle);
  }

  $('open-empty').addEventListener('click', pickFile);
  $('report').addEventListener('click', () => {
    try { $('settings-menu').hidePopover(); } catch (err) { /* not open */ }
    reportProblem();
  });
  $('file-input').addEventListener('change', () => {
    const file = $('file-input').files[0];
    $('file-input').value = '';
    if (file) openFile(file, null);
  });

  // A file dropped anywhere on the page. Its handle (where the Save dialog opens, and what it may
  // not pick) must be asked for while the drop is still being handled; the browser forgets the
  // dropped items after.
  let dragDepth = 0;
  const carriesFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => {
    if (!carriesFiles(e)) return;
    dragDepth += 1;
    $('drop').hidden = false;
  });
  document.addEventListener('dragleave', (e) => {
    if (!carriesFiles(e)) return;
    dragDepth -= 1;
    if (dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; }
  });
  document.addEventListener('dragover', (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('drop').hidden = true;
    const item = [...e.dataTransfer.items].find((it) => it.kind === 'file');
    if (!item) return;
    const asking = item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : Promise.resolve(null);
    const file = item.getAsFile();
    asking.then((h) => h, () => null).then(async (h) => {
      if (await mayDropChanges()) await openFile(file, h && h.kind === 'file' ? h : null);
    });
  });

  // Leaving with changes not in any copy yet: the browser asks first. A copy written, or downloaded,
  // holds the changes made before it (10.2, step 8).
  window.addEventListener('beforeunload', (e) => {
    if (state.doc && C.unsaved(state.doc)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Controls, panels and keys
  // ---------------------------------------------------------------------------------------------

  // System is the computer's light or dark, and follows it while the page is open.
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const drawnTheme = () => (state.theme === 'system' ? (prefersDark.matches ? 'dark' : 'light') : state.theme);
  function applyTheme() {
    root.classList.remove('dark', 'dusk');
    const drawn = drawnTheme();
    if (drawn !== 'light') root.classList.add(drawn);
    for (const name of THEMES) $(`theme-${name}`).setAttribute('aria-pressed', String(name === state.theme));
  }
  for (const name of THEMES) {
    $(`theme-${name}`).addEventListener('click', () => {
      state.theme = name;
      store.set('theme', state.theme);
      applyTheme();
    });
  }
  prefersDark.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });

  // Text: Larger sets the type and the rows' heights again (a class on <html>). Every list reads
  // its row height again, so nothing is left laid out for the old one.
  function applyTextSize() {
    root.classList.toggle('text-larger', state.textSize === 'larger');
    for (const name of TEXT_SIZES) $(`text-${name}`).setAttribute('aria-pressed', String(name === state.textSize));
    for (const list of lists) list.remeasure();
    if ($('settings-menu').matches(':popover-open')) placeMenu();   // the menu, and its button, have moved
  }
  for (const name of TEXT_SIZES) {
    $(`text-${name}`).addEventListener('click', () => {
      if (state.textSize === name) return;
      const was = state.textSize;
      state.textSize = name;
      applyTextSize();
      if (rowCount() * grid.rowHeight() > MAX_PIXELS) {         // taller rows than a page can be tall for this file
        state.textSize = was;
        applyTextSize();
        notice('This file has too many lines to show in larger text, so the text stays Normal.', 'error');
        return;
      }
      store.set('textSize', state.textSize);
    });
  }
  // Settings opens under its button; a click elsewhere, or Esc, closes it.
  function placeMenu() {
    const menu = $('settings-menu');
    const b = $('settings').getBoundingClientRect();
    menu.style.top = `${Math.round(b.bottom + 4)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(b.left, window.innerWidth - menu.offsetWidth - 8)))}px`;
  }
  $('settings-menu').addEventListener('toggle', (e) => { if (e.newState === 'open') placeMenu(); });

  function applyIndent() {
    $('indent').setAttribute('aria-pressed', String(state.indent));
    $('indent-width').hidden = !state.indent;
    $('indent-width').value = String(state.indentWidth);
    updateGridWidth();
    grid.refresh();
  }
  $('indent').addEventListener('click', () => {
    state.indent = !state.indent;
    store.set('indent', state.indent);
    applyIndent();
  });
  $('indent-width').addEventListener('input', () => {
    const w = Number($('indent-width').value);
    if (!Number.isInteger(w) || w < 1 || w > 12) return;
    state.indentWidth = w;
    store.set('indentWidth', w);
    updateGridWidth();
    grid.refresh();
  });

  // 3.5 — Collapse all shuts every record to its first line and every type to its row; Expand all
  // opens every block and every type. The button reads as what it will do.
  function updateFoldAll() {
    const m = state.m;
    if (!m) return;
    let open = false;
    for (const sec of state.sections || []) if (sec.index > 0 && !state.shutSections.has(sec.tag)) { open = true; break; }
    if (!open) for (const i of m.records) if (hasKids(i) && !isShut(i)) { open = true; break; }
    $('fold-all').textContent = open ? 'Collapse all' : 'Expand all';
  }
  $('fold-all').addEventListener('click', () => {
    const m = state.m;
    if (!m) return;
    if ($('fold-all').textContent === 'Collapse all') {
      for (const i of m.records) if (hasKids(i)) setFold(i, true);
      for (const sec of state.sections || []) if (sec.index > 0) state.shutSections.add(sec.tag);
    } else {
      state.folds = new Set();
      state.shutSections = new Set();
    }
    rebuildRows();
    grid.setCount(rowCount(), true);
    keepSelectionShown(state.sel >= 0 ? rowOfLine(state.sel) : -1);
    $('grid').focus();
  });

  // 3.8 — Bold surnames, on or off, remembered.
  function applySurnames() {
    $('surnames').setAttribute('aria-pressed', String(state.boldSurnames));
    if (state.m) {
      filterRecords(true);
      renderDetail();
    }
  }
  $('surnames').addEventListener('click', () => {
    state.boldSurnames = !state.boldSurnames;
    store.set('surnames', state.boldSurnames);
    applySurnames();
  });

  // The file's name in the tab's title, on or off, remembered.
  function applyTabName() {
    $('tab-name').setAttribute('aria-pressed', String(state.nameInTab));
    updateBar();
  }
  $('tab-name').addEventListener('click', () => {
    state.nameInTab = !state.nameInTab;
    store.set('tabName', state.nameInTab);
    applyTabName();
  });

  // 3.1, P9: the icon at the top right of each side frame, beside the left bar's tabs and in the
  // right frame's header, shrinks the frame to a strip holding the icon alone, and brings it back at
  // its width. Remembered, under the same keys as before 0.6.
  function applyFrames() {
    $('work').classList.toggle('left-hidden', state.hiddenLeft);
    $('work').classList.toggle('right-hidden', state.hiddenRight);
    for (const [id, hidden, name] of [['hide-left', state.hiddenLeft, 'left bar'], ['hide-right', state.hiddenRight, 'right frame']]) {
      const b = $(id);
      b.setAttribute('aria-pressed', String(hidden));
      b.title = `${hidden ? 'Show' : 'Hide'} ${name}`;
      b.setAttribute('aria-label', b.title);
    }
  }
  function toggleFrame(side) {
    if (side === 'left') state.hiddenLeft = !state.hiddenLeft; else state.hiddenRight = !state.hiddenRight;
    store.set('hideLeft', state.hiddenLeft);
    store.set('hideRight', state.hiddenRight);
    applyFrames();
  }
  $('hide-left').addEventListener('click', () => toggleFrame('left'));
  $('hide-right').addEventListener('click', () => toggleFrame('right'));
  // Top: line 1, as a jump, so Back returns; the lines at their left edge
  $('top').addEventListener('click', () => { if (state.m) select(0, 'jump'); $('grid').focus(); });
  // scrolled sideways, the number column casts a shade on what goes under it
  $('grid').addEventListener('scroll', () => {
    const g = $('grid');
    const aside = g.scrollLeft > 0;
    if (aside !== g.classList.contains('is-aside')) g.classList.toggle('is-aside', aside);
  }, { passive: true });

  $('back').addEventListener('click', goBack);
  $('save').addEventListener('click', doSave);
  $('undo').addEventListener('click', doUndo);
  $('redo').addEventListener('click', doRedo);

  // Edit: on, as every file opens (P10), lines can be typed over, added and deleted, the lines removed
  // since the file was opened show where they were, and the lines take their editor's look; off, the
  // file is read, and a double-click highlights a word.
  function setEditing(on) {
    if (!state.doc || on === state.editing) return;
    if (!on && state.edit && !commitEdit(false)) return;
    state.editing = on;
    state.pick = null;
    updateBar();
    rebuildRows();
    grid.setCount(rowCount(), true);
    if (state.sel >= 0) select(state.sel);
  }
  $('edit').addEventListener('click', () => setEditing(!state.editing));

  // The file's name shows its facts, and hides them.
  $('file-name').addEventListener('click', () => {
    state.showFacts = !state.showFacts;
    store.set('facts', state.showFacts);
    updateBar();
  });

  // Go to Line…: a number goes to that line; two, as 105-117, show those lines alone, until ×.
  function updateGoto() {
    const v = $('goto').value.trim();
    $('goto-go').hidden = !state.m || !v || v === state.gotoApplied;
    $('goto-clear').hidden = !state.range;
  }

  function applyGoto() {
    const m = state.m;
    if (!m || !m.n) return;
    const v = $('goto').value.trim();
    const number = (s) => parseInt(s.replace(/[,._]/g, ''), 10);
    const clamp = (x) => Math.max(1, Math.min(m.n, x));
    const two = /^(\d[\d,._]*)\s*(?:-|–|—|\.\.|to)\s*(\d[\d,._]*)$/i.exec(v);
    const one = /^(\d[\d,._]*)$/.exec(v);
    if (two) {
      let a = clamp(number(two[1]));
      let b = clamp(number(two[2]));
      if (a > b) [a, b] = [b, a];
      state.range = { a: a - 1, b: b - 1 };
      rebuildRows();
      grid.setCount(rowCount());
      state.gotoApplied = v;
      select(a - 1, 'jump');
    } else if (one || !v) {
      const had = !!state.range;
      state.range = null;
      state.gotoApplied = v;
      if (had) {
        rebuildRows();
        grid.setCount(rowCount(), true);
      }
      if (one) select(clamp(number(one[1])) - 1, 'jump');
      else if (had) select(state.sel);
    } else return;
    updateGoto();
    $('grid').focus();
  }

  function clearRange() {
    $('goto').value = '';
    applyGoto();
  }

  $('goto').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    applyGoto();
  });
  $('goto').addEventListener('input', updateGoto);
  $('goto-go').addEventListener('click', applyGoto);
  $('goto-clear').addEventListener('click', clearRange);

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => openPanel(tab.dataset.panel));
  }

  $('records-filter').addEventListener('input', () => filterRecords(false));
  $('records-type').addEventListener('click', () => {
    state.recordType = null;
    filterRecords(false);
  });
  $('records-list').addEventListener('click', (e) => {
    const k = recordsList.rowOf(e.target);
    if (k >= 0) select(state.m.records[state.recordRows[k]], 'jump');
  });

  $('checks-list').addEventListener('click', (e) => {
    const k = checksList.rowOf(e.target);
    if (k < 0) return;
    const item = state.checkRows[k];
    if (item.head) {
      const code = item.head.code;
      if (e.target.closest('.fold')) {
        if (state.collapsed.has(code)) state.collapsed.delete(code); else state.collapsed.add(code);
        buildCheckRows(true);
      } else {
        state.help = code;
        renderDetail();
      }
    } else if (item.f.line >= 0) select(item.f.line, 'jump');
  });

  // A change clicked: its line; for removed lines with Edit on, the first of them, struck through.
  $('changes-list').addEventListener('click', (e) => {
    const k = changesList.rowOf(e.target);
    if (k < 0) return;
    const run = state.runs[k];
    select(run.kind === 'removed' ? run.at : run.after, 'jump');
    if (run.kind !== 'removed' || !state.editing) return;
    const x = state.extras.findIndex((y) => y.kind === 'removed' && y.run.before === run.before && y.k === 0);
    if (x < 0) return;
    grid.show(state.rows.indexOf(-2 - x), true);
    pickRemoved(state.extras[x]);
  });

  $('tags-list').addEventListener('click', (e) => {
    const k = tagsList.rowOf(e.target);
    if (k < 0) return;
    openPanel('search');
    $('search-box').value = state.tagRows[k][0];
    $('search-tag').setAttribute('aria-pressed', 'true');
    runSearch();
    stepSearch(1);
  });

  let searchTimer = 0;
  $('search-box').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 150);
  });
  $('search-box').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(searchTimer);
    stepSearch(e.shiftKey ? -1 : 1);
  });
  $('search-tag').addEventListener('click', () => {
    $('search-tag').setAttribute('aria-pressed', String(!tagMode()));
    runSearch();
  });
  $('search-prev').addEventListener('click', () => stepSearch(-1));
  $('search-next').addEventListener('click', () => stepSearch(1));

  // The side panel and the right pane are dragged wider or narrower by the bars beside the grid.
  function dragSplit(handle, prop, sign) {
    handle.addEventListener('pointerdown', (e) => {
      if ((prop === '--left-width' && state.hiddenLeft) || (prop === '--right-width' && state.hiddenRight)) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const start = parseFloat(getComputedStyle(root).getPropertyValue(prop)) || 300;
      const move = (ev) => {
        const w = Math.max(160, Math.min(1000, start + sign * (ev.clientX - startX)));
        root.style.setProperty(prop, `${Math.round(w)}px`);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        store.set(prop, root.style.getPropertyValue(prop));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
  dragSplit($('split-left'), '--left-width', 1);
  dragSplit($('split-right'), '--right-width', -1);
  for (const prop of ['--left-width', '--right-width']) {
    const w = store.get(prop, null);
    if (typeof w === 'string' && /^\d+px$/.test(w)) root.style.setProperty(prop, w);
  }

  document.addEventListener('keydown', (e) => {
    if ($('dialog').open) return;                                    // a dialog takes its own keys
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && !e.shiftKey && !e.altKey && key === 's') {            // ⌘S: from anywhere
      e.preventDefault();
      doSave();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && key === 'o') {           // ⌘O: open a file
      e.preventDefault();
      pickFile();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && (key === 'f' || key === 'l')) {
      if (!state.m) return;
      e.preventDefault();
      if (state.edit && !commitEdit(false)) return;
      const box = key === 'f' ? $('search-box') : $('goto');
      if (key === 'f') openPanel('search');
      box.focus();
      box.select();
      return;
    }
    if (state.edit && e.target === state.edit.input) return;       // the box being typed in has its own keys
    if (e.target.closest && e.target.closest('input, textarea, select')) {
      if (key === 'Escape') {
        e.target.blur();
        $('grid').focus();
      }
      return;
    }
    if (!state.m) return;
    if (drag) {
      if (key === 'Escape') endDrag();                               // a drag let go: nothing moves
      return;
    }
    if (state.edit) {
      if (key === 'Escape') cancelEdit(false);
      return;
    }
    if (mod && !e.altKey && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if (mod || e.altKey || !state.m.n) return;
    const page = grid.pageRows();
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    const i = Math.max(0, state.sel);
    if (key === 'Escape' && state.pick) {
      select(state.sel);
    } else if (key in moves) {
      e.preventDefault();
      moveBy(moves[key]);
    } else if (key === 'Home') {
      e.preventDefault();
      $('grid').scrollLeft = 0;
      moveBy(-state.rows.length);
    } else if (key === 'End') {
      e.preventDefault();
      moveBy(state.rows.length);
    } else if (key === 'ArrowLeft') {                                // shut the block, or go up to the line above it
      e.preventDefault();
      if (hasKids(i) && !isShut(i)) toggleFold(i, false);
      else if (ancestors(i).length) select(ancestors(i)[0], 'step');
    } else if (key === 'ArrowRight') {                               // open the block, or go down into it
      e.preventDefault();
      if (hasKids(i)) {
        if (isShut(i)) toggleFold(i, false); else select(i + 1, 'step');
      }
    } else if (key === 'Enter') {
      e.preventDefault();
      startEdit(i);
    } else if (key === 'Backspace' || key === 'Delete') {
      e.preventDefault();
      deleteSelected();
    } else if (key === 'e' && !e.shiftKey) {                         // E: Edit on or off (3.11)
      e.preventDefault();
      setEditing(!state.editing);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Dragging (3.4a): with Edit on, a press on a row — a type row, for a section — moved a few
  // pixels takes hold of its block, a record, or a section; what would move dims, and a gold line
  // shows where it would land, only at a sibling's edge; near the frame's top or bottom the frame
  // scrolls. Release moves it; Esc, or a release where no gold line shows, moves nothing. In a
  // file bunched by type a record lands only among the records of its own type, and a section
  // only at another section's edge, so the file stays bunched.
  // ---------------------------------------------------------------------------------------------

  const dropLine = el('div', 'drop-line');
  dropLine.hidden = true;
  grid.mount(dropLine);
  let clickAfterDrag = false;
  let scrollTimer = 0;

  // The row at whose top edge the block would land before line `to`: the first row at or after
  // `to`, a type's own row included, or the row after the last for the end. For a record dragged
  // to the top of its own type (`own` is that type's first line), its type's row is passed over,
  // so the gold line sits under the row, never above it; at the next type's row it stays, as the
  // last edge among the record's own kind.
  function edgeRows(tos, own) {
    const rows = state.rows;
    const out = new Map();
    let k = 0;
    for (const to of tos) {
      while (k < rows.length) {
        const v = rows[k];
        let at = -1;
        if (v >= 0) at = v;
        else if (v <= -2 && extraOf(v).kind === 'section' && extraOf(v).sec.from !== own) at = extraOf(v).sec.from;
        if (at >= to) break;
        k += 1;
      }
      out.set(to, k);
    }
    return out;
  }

  function startDrag(d) {
    const l = C.landings(state.doc, d.from, d.end);
    if (l.reason) {
      notice(l.reason, 'error');
      return false;
    }
    let tos = l.at;
    if (state.sections) {
      const starts = new Set(state.sections.map((s) => s.from));
      if (d.section) tos = tos.filter((to) => starts.has(to));
      else if (state.m.level[d.from] === 0) {
        const sec = state.sections.find((s) => d.from >= s.from && d.from < s.to);
        tos = tos.filter((to) => to >= sec.from && to <= sec.to);
      }
    }
    if (!tos.length) {
      notice('This block has nowhere else to go among its siblings.', 'error');
      return false;
    }
    const ownSection = !d.section && state.sections && state.m.level[d.from] === 0 ? state.sections.find((s) => d.from >= s.from && d.from < s.to).from : -1;
    const rows = edgeRows([...tos, d.from, d.end].sort((a, b) => a - b), ownSection);
    d.edges = tos.map((to) => ({ to, row: rows.get(to) }));
    d.stay = [rows.get(d.from), rows.get(d.end)];                    // its own edges: no move
    d.started = true;
    d.at = -1;
    $('grid').classList.add('is-drag');
    $('grid').setPointerCapture(d.id);
    window.getSelection().removeAllRanges();
    grid.restyle();
    return true;
  }

  function placeDropLine() {
    const d = drag;
    if (!d || !d.started) return;
    const g = $('grid');
    const rect = g.getBoundingClientRect();
    const y = d.y - rect.top + g.scrollTop;
    const rowY = y / grid.rowHeight();
    let best = null;
    for (const e of d.edges) if (!best || Math.abs(e.row - rowY) < Math.abs(best.row - rowY)) best = e;
    const ownDistance = Math.min(...d.stay.map((r) => Math.abs(r - rowY)));
    if (!best || ownDistance < Math.abs(best.row - rowY)) {
      d.at = -1;
      dropLine.hidden = true;
      return;
    }
    d.at = best.to;
    dropLine.hidden = false;
    dropLine.style.top = `${grid.topOf(best.row)}px`;
  }

  function autoScroll() {
    const d = drag;
    if (!d || !d.started) return;
    const g = $('grid');
    const rect = g.getBoundingClientRect();
    const zone = 28;
    let step = 0;
    if (d.y < rect.top + zone) step = -Math.ceil((rect.top + zone - d.y) / 4);
    else if (d.y > rect.bottom - zone) step = Math.ceil((d.y - rect.bottom + zone) / 4);
    if (step) {
      g.scrollTop += step * 3;
      placeDropLine();
    }
    scrollTimer = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(scrollTimer);
    dropLine.hidden = true;
    $('grid').classList.remove('is-drag');
    if (d.started) {
      try { $('grid').releasePointerCapture(d.id); } catch (e) { /* already released */ }
      grid.restyle();
    }
  }

  $('grid').addEventListener('pointerdown', (e) => {
    if (!state.editing || e.button !== 0 || e.altKey || state.edit || !state.m) return;
    const k = grid.rowOf(e.target);
    if (k < 0 || e.target.closest('input, .copy')) return;
    const v = state.rows[k];
    let from; let end; let section = null;
    if (v >= 0) { from = v; end = C.subtreeEnd(state.m, v); }
    else if (v <= -2 && extraOf(v).kind === 'section') { section = extraOf(v).sec; from = section.from; end = section.to; }
    else return;
    drag = { from, end, section, x0: e.clientX, y0: e.clientY, y: e.clientY, id: e.pointerId, started: false, at: -1, edges: null, stay: null };
  });

  $('grid').addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    d.y = e.clientY;
    if (!d.started) {
      if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 4) return;   // a few pixels first
      if (!startDrag(d)) { drag = null; return; }
      autoScroll();
    }
    placeDropLine();
  });

  $('grid').addEventListener('pointerup', (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    const started = d.started;
    const to = d.at;
    const { from, end } = d;
    endDrag();
    if (!started) return;
    clickAfterDrag = true;
    setTimeout(() => { clickAfterDrag = false; }, 0);
    if (to < 0) return;
    const r = C.moveLines(state.doc, from, end, to);
    if (!r.ok) {
      notice(r.reason, 'error');
      return;
    }
    if (r.step) afterAct(to < from ? to : to - (end - from));
  });
  $('grid').addEventListener('pointercancel', () => endDrag());

  applyTheme();
  applyTextSize();
  applyIndent();
  applySurnames();
  applyFrames();
  updateTagsOrder();
  openPanel('records');
  updateBack();
  applyTabName();
  updateBar();                                                       // Save, or Download a copy, as this browser has it
})();
