/* gedview — ui.js
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
  // Save in place needs the three pickers (Chrome); without them Save is off and Save a copy
  // downloads the copy (10.3).
  const PICKERS = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window && 'showDirectoryPicker' in window;

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

  const THEMES = ['light', 'sunset', 'dark'];
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
  const SHA_TITLE = 'sha256: a fingerprint of the file\'s exact bytes, as it is on disk (opened or last saved). ' +
    'Change one character anywhere and it changes completely; two files with the same sha256 are the same, ' +
    'byte for byte. Save checks it before it writes, and every backup must match it.';
  const CANCEL = { label: 'Cancel', value: '' };

  const state = {
    doc: null,                        // the document: the file as read, and the lines typed over it
    m: null,                          // its lines as they now are, checked (the document's view)
    fileName: '',
    handle: null,                     // the file's handle, from the picker or a drop; never stored
    dir: null,                        // the folder granted for Save (10.2 step 2); never stored
    disk: null,                       // the file on disk, as opened or last saved: sha256, bytes, lines
    hashing: null,                    // the hash at open, while it is being taken
    sel: -1,                          // the selected line
    back: [],
    indent: store.get('indent', false) === true,
    indentWidth: clampWidth(store.get('indentWidth', 4)),
    theme: THEMES.includes(store.get('theme', 'light')) ? store.get('theme', 'light') : 'light',
    stamps: store.get('stamps', true) !== false,   // F1, V1: on unless unticked
    folds: new Set(),                 // the lines shut, by their number in the document's order
    vis: new Int32Array(0),           // the lines the grid shows, first to last
    pending: null,                    // a line being added: where it goes, and its row
    edit: null,                       // a line being typed
    marks: null,                      // per line: changed or added; where lines were removed
    runs: [],                         // the net change in runs: the Changes panel
    changeAt: new Map(),              // a changed line → its line as saved
    recordType: null,
    recordRows: [],                   // the records the list shows, as record numbers
    checkRows: [],                    // a check's head, then its findings, check by check
    collapsed: new Set(),
    tagRows: [],
    search: { query: '', tag: false, hits: [], at: -1, idDone: false },
    hitFlags: null,
    highlight: null,
  };

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
    const t = m.texts[i];
    if (m.level[i] < 0) return [[0, t.length, m.kind[i] === C.KIND.BLANK ? '' : 'raw']];
    const out = [];
    let p = m.lead[i];
    if (p) out.push([0, p, '']);
    const lvEnd = t.indexOf(' ', p);
    out.push([p, lvEnd, 'lv']);
    p = lvEnd;
    const x = m.xref[i];
    if (x !== null) {
      out.push([p, p + 1, ''], [p + 1, p + 1 + x.length, 'id']);
      p += 1 + x.length;
    }
    const tg = m.tag[i];
    out.push([p, p + 1, ''], [p + 1, p + 1 + tg.length, 'tg']);
    p += 1 + tg.length;
    if (m.valAt[i] >= 0) out.push([p, m.valAt[i], ''], [m.valAt[i], t.length, C.isPointerLine(m, i) ? 'ptr' : 'val']);
    return out;
  }

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

  function Virtual(scroller, paint) {
    const layer = el('div', 'v-rows');
    const inner = el('div', 'v-inner');
    const spacer = el('div', 'v-spacer');
    layer.appendChild(inner);
    scroller.append(layer, spacer);
    const pool = [];
    let count = 0;
    let version = 0;
    const measure = () => parseFloat(getComputedStyle(scroller).getPropertyValue('--row-height')) || 22;
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

    return {
      setCount(n, keepScroll) {
        count = n;
        version += 1;
        if (!keepScroll) scroller.scrollTop = 0;
        layout();
      },
      refresh() { version += 1; draw(); },
      rowHeight: () => h,
      pageRows: () => Math.max(1, Math.floor(scroller.clientHeight / h) - 1),
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
  }

  // ---------------------------------------------------------------------------------------------
  // Blocks that open and shut. A line with lines under it (its subtree, 6.4) shows ▾ open or ▸
  // shut; a shut line hides its subtree and says how many lines it holds. The grid's rows are the
  // lines not hidden, `vis`; a line being added sits among them as one more row.
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

  function rebuildVis() {
    const m = state.m;
    const out = new Int32Array(m.n);
    let k = 0;
    for (let i = 0; i < m.n;) {
      out[k] = i;
      k += 1;
      i = isShut(i) ? C.subtreeEnd(m, i) : i + 1;
    }
    state.vis = out.subarray(0, k);
    if (state.pending) state.pending.row = lowerBound(state.vis, state.pending.at);
  }

  const rowCount = () => state.vis.length + (state.pending ? 1 : 0);

  // The line a row shows, or -1 for the row of a line being added.
  function lineAtRow(k) {
    const p = state.pending;
    if (p) {
      if (k === p.row) return -1;
      if (k > p.row) return state.vis[k - 1];
    }
    return state.vis[k];
  }

  function rowOfLine(i) {
    let r = lowerBound(state.vis, i);
    if (state.pending && r >= state.pending.row) r += 1;
    return r;
  }

  // The line that shows for line i: itself, or the shut line whose block hides it.
  function shownLineOf(i) {
    const r = lowerBound(state.vis, i);
    return r < state.vis.length && state.vis[r] === i ? i : state.vis[Math.max(0, r - 1)];
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

  // A line hidden in a shut block is shown: every block around it opens.
  function reveal(i) {
    if (!state.folds.size) return;
    let opened = false;
    for (const j of ancestors(i)) {
      if (isShut(j)) {
        setFold(j, false);
        opened = true;
      }
    }
    if (opened) {
      rebuildVis();
      grid.setCount(rowCount(), true);
    }
  }

  // Open or shut line i's block; with ⌥, every block at its level.
  function toggleFold(i, everyAtLevel) {
    if (!hasKids(i)) return;
    const shut = !isShut(i);
    if (everyAtLevel) {
      const m = state.m;
      const lv = m.level[i];
      for (let j = 0; j < m.n; j += 1) if (m.level[j] === lv && hasKids(j)) setFold(j, shut);
    } else setFold(i, shut);
    rebuildVis();
    grid.setCount(rowCount(), true);
    state.sel = everyAtLevel ? i : shownLineOf(state.sel);
    grid.show(rowOfLine(state.sel));
    grid.refresh();
    renderDetail();
  }

  // ---------------------------------------------------------------------------------------------
  // The grid
  // ---------------------------------------------------------------------------------------------

  function foldPart(i, lv, kids, shut) {
    const fd = el('span', 'fd');
    if (state.indent && lv > 0) fd.style.paddingLeft = `${Math.min(lv, MAX_INDENT) * state.indentWidth}ch`;
    const t = el('span', kids ? `fold ${shut ? 'is-shut' : 'is-open'}` : 'fold', kids ? (shut ? '▸' : '▾') : '');
    if (kids) t.title = shut ? 'Open (⌥: every block at this level)' : 'Shut (⌥: every block at this level)';
    fd.appendChild(t);
    return fd;
  }

  function paintRow(row, k) {
    const i = lineAtRow(k);
    if (i < 0) { paintAdding(row); return; }
    const m = state.m;
    const mk = state.marks;
    let cls = 'row';
    if (mk.status[i] === 1) cls += ' is-changed';
    else if (mk.status[i] === 2) cls += ' is-added';
    if (i === state.sel) cls += ' is-sel';
    else if (state.hitFlags && state.hitFlags[i]) cls += ' is-hit';
    if (mk.removedAt[i]) cls += ' is-removed-above';
    if (i === m.n - 1 && mk.removedAt[m.n]) cls += ' is-removed-below';
    row.className = cls;
    const editing = state.edit && state.edit.kind === 'edit' && state.edit.pos === i;
    if (editing && state.edit.input.parentNode === row) return;     // the box being typed in stays put
    row.textContent = '';
    row.appendChild(el('span', 'ln', fmt(i + 1)));
    const marks = m.findings.marks[i];
    row.appendChild(el('span', marks & 1 ? 'mk is-error' : marks & 2 ? 'mk is-note' : 'mk'));
    const kids = hasKids(i);
    const shut = kids && isShut(i);
    row.appendChild(foldPart(i, m.level[i], kids, shut));
    if (editing) {
      row.appendChild(state.edit.input);
      return;
    }
    const tx = el('span', 'tx');
    putParts(tx, m.texts[i], partsOf(m, i), ROW_CHARS, matchesIn(i, ROW_CHARS));
    row.appendChild(tx);
    if (shut) {
      const end = C.subtreeEnd(m, i);
      const inside = mk.sum[end] - mk.sum[i + 1];
      const hc = el('span', inside ? 'hc is-changed' : 'hc', plural(end - i - 1, 'line', 'lines'));
      if (inside) hc.title = 'Holds a change not yet saved';
      row.appendChild(hc);
    }
  }

  function paintAdding(row) {
    row.className = 'row is-added';
    if (state.edit.input.parentNode === row) return;
    row.textContent = '';
    row.appendChild(el('span', 'ln', '+'));
    row.appendChild(el('span', 'mk'));
    row.appendChild(foldPart(-1, state.edit.level === null ? 0 : state.edit.level, false, false));
    row.appendChild(state.edit.input);
  }

  const grid = Virtual($('grid'), paintRow);

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
    grid.show(rowOfLine(to), how === 'jump' || how === 'step');
    grid.refresh();
    renderDetail();
  }

  function selectRow(k) {
    if (!state.vis.length) return;
    select(state.vis[Math.max(0, Math.min(state.vis.length - 1, k))]);
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

  function updateBack() { $('back').disabled = state.back.length === 0; }

  $('grid').addEventListener('click', (e) => {
    const k = grid.rowOf(e.target);
    if (k < 0) return;
    const i = lineAtRow(k);
    if (i < 0 || e.target.closest('input')) return;
    if (e.target.closest('.fold') && hasKids(i)) {
      toggleFold(i, e.altKey);
      return;
    }
    if (e.target.closest('.ptr')) {
      state.sel = i;                                                 // Back comes back to this line
      jumpToId(C.valueOf(state.m, i));
      return;
    }
    select(i);
  });

  $('grid').addEventListener('dblclick', (e) => {
    const k = grid.rowOf(e.target);
    if (k < 0 || e.target.closest('input, .fold, .ptr')) return;
    const i = lineAtRow(k);
    if (i >= 0) startEdit(i);
  });

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

  function startEdit(i) {
    if (!state.doc || i < 0 || i >= state.m.n) return;
    if (state.edit && !commitEdit(false)) return;
    const cannot = C.editRefusal(state.doc, i);
    if (cannot) {
      notice(cannot, 'error');
      return;
    }
    select(i);
    const input = makeEditor(state.m.texts[i]);
    state.edit = { kind: 'edit', pos: i, input, prefill: input.value, level: state.m.level[i] };
    $('grid').classList.add('is-editing');
    grid.refresh();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  // A new line under the selected one (a child), or after its subtree at its level (a sibling
  // below). Its row is offered with the level typed in; an Enter with nothing more adds nothing.
  function startAdd(kind) {
    if (!state.doc || state.sel < 0 || !state.m.n) return;
    if (state.edit && !commitEdit(false)) return;
    const m = state.m;
    const i = state.sel;
    const lv = m.level[i];
    if (kind === 'child' && isShut(i)) setFold(i, false);
    const at = kind === 'child' ? i + 1 : C.subtreeEnd(m, i);
    const level = lv < 0 ? null : kind === 'child' ? lv + 1 : lv;
    const prefill = level === null ? '' : `${level} `;
    const input = makeEditor(prefill);
    state.edit = { kind, pos: i, at, input, prefill, level };
    state.pending = { at, row: 0 };
    rebuildVis();
    $('grid').classList.add('is-editing');
    grid.setCount(rowCount(), true);
    grid.show(state.pending.row);
    grid.refresh();
    input.focus();
    input.setSelectionRange(prefill.length, prefill.length);
  }

  function closeEditor() {
    const ed = state.edit;
    state.edit = null;
    state.pending = null;
    $('grid').classList.remove('is-editing');
    if (document.activeElement === ed.input) $('grid').focus();
    ed.input.remove();
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
    else if (ed.kind === 'child') r = C.addChild(doc, ed.pos, text);
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
    rebuildVis();
    grid.setCount(rowCount(), true);
    select(pos);
  }

  async function deleteSelected() {
    if (!state.doc || state.sel < 0 || !state.m.n) return;
    if (state.edit && !commitEdit(false)) return;
    const m = state.m;
    const i = state.sel;
    const end = C.subtreeEnd(m, i);
    if (end - i > 1) {
      const yes = await dialog(`Delete line ${fmt(i + 1)}, and the ${plural(end - i - 1, 'line', 'lines')} under it?`, (body) => {
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
    if (!state.doc || state.sel < 0) return;
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
        putText(label, m.labels[plan.record]);
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

  // After any act, undo or save: the page drawn again from the document as it now is.
  function afterAct(pos) {
    state.m = state.doc.view;
    const m = state.m;
    updateMarks();
    $('grid').style.setProperty('--ln-width', `${fmt(m.n).length + 1}ch`);
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
    rebuildVis();
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
    for (let p = 0; p <= n; p += 1) sum[p + 1] = sum[p] + ((p < n && marks.status[p]) || marks.removedAt[p] ? 1 : 0);
    marks.sum = sum;
    state.marks = marks;
    state.runs = C.changeRuns(doc, items);
    state.changeAt = new Map();
    for (const run of state.runs) {
      if (run.kind === 'changed') run.lines.forEach((l, k) => state.changeAt.set(run.after + k, l));
    }
  }

  function updateBar() {
    const doc = state.doc;
    const changed = !!doc && C.isChanged(doc);
    $('dirty').hidden = !changed;
    $('save').disabled = !changed || !PICKERS;
    $('save').title = PICKERS ? 'Save, in place (⌘S)' : 'This browser cannot write a file in place; Save a copy downloads one';
    $('save-copy').disabled = !doc;
    $('undo').disabled = !doc || !doc.done.length;
    $('redo').disabled = !doc || !doc.undone.length;
    $('undo').title = doc && doc.done.length ? `Undo: ${doc.done[doc.done.length - 1].label} (⌘Z)` : 'Undo (⌘Z)';
    $('redo').title = doc && doc.undone.length ? `Redo: ${doc.undone[doc.undone.length - 1].label} (⇧⌘Z)` : 'Redo (⇧⌘Z)';
    document.title = doc ? `${changed ? '● ' : ''}${state.fileName} — gedview` : 'gedview';
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
      putText(main, label);
      parent.appendChild(main);
    }
  }

  function actionButton(parent, label, title, act, disabled) {
    const b = el('button', 'button', label);
    b.type = 'button';
    b.title = title;
    b.disabled = !!disabled;
    b.addEventListener('click', act);
    parent.appendChild(b);
  }

  function renderDetail() {
    const d = $('detail');
    d.textContent = '';
    const m = state.m;
    const i = state.sel;
    if (!m || i < 0 || i >= m.n) return;
    const t = m.texts[i];
    const parts = partsOf(m, i);

    const acts = el('div', 'detail-actions');
    const cannot = C.editRefusal(state.doc, i);
    actionButton(acts, 'Edit', cannot || 'Type over the whole line (Enter, or a double-click)', () => startEdit(state.sel), cannot);
    actionButton(acts, 'Add child', 'A new line directly under this one, one level deeper', () => startAdd('child'));
    actionButton(acts, 'Add sibling', 'A new line after this one and the lines under it, at its level', () => startAdd('sibling'));
    actionButton(acts, 'Delete line', 'This line, and the lines under it (⌫)', () => deleteSelected());
    actionButton(acts, 'Delete record', 'The record this line is in, and the lines elsewhere that point at it',
      () => deleteRecordAsked(), m.recOf[i] < 0);
    d.appendChild(acts);

    if (m.level[i] >= 0) {
      const hasValue = m.valAt[i] >= 0;
      const head = el('div', 'detail-head');
      putParts(head, t, hasValue ? parts.slice(0, -2) : parts, t.length, []);
      d.appendChild(head);
      if (hasValue && m.valAt[i] < t.length) {
        const box = el('div', 'detail-value');
        const value = t.slice(m.valAt[i]);
        if (C.isPointerLine(m, i)) {
          const link = el('span', 'ptr');
          putText(link, value);
          link.addEventListener('click', () => jumpToId(value));
          box.appendChild(link);
        } else putText(box, value);
        d.appendChild(box);
      }
    } else {
      const box = el('div', 'detail-value raw');
      putText(box, t);
      d.appendChild(box);
    }

    const was = state.changeAt.get(i);
    if (was) {
      const sec = section(d, 'Was');
      sec.classList.add('detail-was');
      const box = el('div', 'detail-value');
      putText(box, was.was);
      sec.appendChild(box);
      if (was.ending) sec.appendChild(el('div', 'detail-title', `Line ending: ${was.ending[0]} → ${was.ending[1]}`));
    } else if (state.marks && state.marks.status[i] === 2) {
      section(d).appendChild(el('span', 'detail-added', 'Added'));
    }

    const run = C.joinedValue(m, i);
    if (run) {
      const card = el('div', 'detail-card detail-value');
      putText(card, run.text);
      section(d, 'Joined').appendChild(card);
    }

    const r = m.recOf[i];
    if (r >= 0 && m.records[r] !== i) {
      const sec = section(d);
      sec.classList.add('detail-link');
      sec.appendChild(document.createTextNode('in '));
      recordRef(sec, r);
      sec.addEventListener('click', () => select(m.records[r], 'jump'));
    } else if (r >= 0 && m.labels[r] !== t.slice(m.lead[i])) {
      putText(section(d), m.labels[r]);
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
  // was exported, its size on disk, its lines, and its sha256 on demand.
  function renderFacts() {
    const m = state.m;
    const f = $('facts');
    f.textContent = '';
    if (!m) return;
    const parts = [];
    const fact = (text, title) => {
      const s = el('span', 'fact', text);
      if (title) s.title = title;
      parts.push(s);
    };
    if (m.version) fact(`GEDCOM ${m.version}`, 'The GEDCOM version its header states (HEAD › GEDC › VERS)');
    fact(m.encodingLabel, `Its encoding, told by its ${m.how}${m.declared ? `; the header says ${m.declared}` : ''}`);
    const source = [m.facts.source, m.facts.sourceVersion].filter((x) => x).join(' ');
    if (m.facts.date || source) {
      fact(`exported${m.facts.date ? ` ${m.facts.date}` : ''}${source ? ` by ${source}` : ''}`,
        'When, and by what, the file was made, as its header says (HEAD › DATE; HEAD › SOUR and its VERS)');
    }
    fact(sizeOf(state.disk.bytes), 'Its size on disk, as opened or last saved');
    fact(`${fmt(m.n)} lines`);
    parts.forEach((p, k) => {
      if (k) f.appendChild(document.createTextNode(' · '));
      f.appendChild(p);
    });
    f.appendChild(document.createTextNode(' · '));
    const sha = el('button', 'sha', 'sha256');
    sha.type = 'button';
    sha.title = SHA_TITLE;
    sha.addEventListener('click', async () => {
      const hex = state.disk.sha256 || await state.hashing;
      const shown = el('span', 'hash', hex);
      shown.title = SHA_TITLE;
      sha.replaceWith(shown);
    });
    f.appendChild(sha);
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
    putText(main, m.labels[r].slice(0, 400));
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
      if (q && m.labels[r].toLowerCase().indexOf(q) === -1 && (m.xref[line] || '').toLowerCase().indexOf(q) === -1
        && m.tag[line].toLowerCase() !== q) continue;
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
      row.appendChild(el('span', 'muted', c.code));
      row.appendChild(el('span', 'main', c.name));
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

  // Changes: the net change since the file was opened or last saved, run by run (9.4). A run
  // shows the line it is at now — a removed run, the line now below where it was.
  const changesList = Virtual($('changes-list'), (row, k) => {
    const run = state.runs[k];
    row.className = `item is-${run.kind}`;
    row.textContent = '';
    const at = run.kind === 'removed' ? run.at : run.after;
    row.appendChild(el('span', 'muted', fmt(at + 1)));
    const first = run.lines[0];
    const main = el('span', 'main mono');
    putText(main, (run.kind === 'removed' ? first.was : first.now).slice(0, 400));
    row.appendChild(main);
    const more = run.lines.length > 1 ? `+${fmt(run.lines.length - 1)}` : '';
    const where = run.record ? run.record.id || run.record.tag || '' : '';
    row.appendChild(el('span', 'end', [more, run.stamp ? 'stamp' : '', where].filter((x) => x).join(' · ')));
    const before = run.before >= 0 ? `; line ${fmt(run.before + 1)} as saved` : '';
    row.title = `${run.kind}${run.stamp ? ' by a change stamp' : ''}: ${plural(run.lines.length, 'line', 'lines')}${before}`;
  });

  function renderChanges() {
    const count = { changed: 0, removed: 0, added: 0 };
    for (const run of state.runs) count[run.kind] += run.lines.length;
    $('changes-count').textContent = state.runs.length ? fmt(state.runs.length) : '';
    $('changes-sum').textContent = `${fmt(count.changed)} changed · ${fmt(count.removed)} removed · ${fmt(count.added)} added`;
    changesList.setCount(state.runs.length, true);
  }

  const tagsList = Virtual($('tags-list'), (row, k) => {
    const [tg, n] = state.tagRows[k];
    row.className = 'item';
    row.textContent = '';
    row.appendChild(el('span', 'main mono', tg));
    row.appendChild(el('span', 'end', fmt(n)));
  });

  function renderTags(keepScroll) {
    state.tagRows = [...state.m.tagCounts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
    tagsList.setCount(state.tagRows.length, keepScroll);
  }

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

  // A dialog: a title, what `fill` puts in its body, and its buttons. It resolves with the value of
  // the button pressed, or null for Cancel or Esc.
  function dialog(title, fill, buttons) {
    const d = $('dialog');
    d.textContent = '';
    const form = el('form', 'dialog-form');
    form.method = 'dialog';
    form.appendChild(el('h2', 'dialog-title', title));
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
      const first = body.querySelector('input[type=text]');
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
      head.appendChild(el('span', 'chg-kind', run.stamp ? `${run.kind} · stamp` : run.kind));
      const n = run.lines.length;
      const span = (first) => (n > 1 ? `${fmt(first + 1)}–${fmt(first + n)}` : fmt(first + 1));
      const where = run.kind === 'changed' ? `line ${span(run.after)}` : run.kind === 'added' ? `line ${span(run.after)}`
        : `line ${span(run.before)} as saved`;
      head.appendChild(el('span', 'muted', where));
      if (run.record) head.appendChild(el('span', 'muted', recordName(run.record.id, run.record.tag)));
      list.appendChild(head);
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

  const STAMP_HOW = {
    adds: 'gains 1 CHAN · 2 DATE · 3 TIME · 2 NOTE',
    sets: 'its CHAN: DATE and TIME set, a NOTE added',
    resets: 'the stamp gedview gave it since the last save, set anew',
  };

  // 10.2 step 4: the changes, the change stamps (F1: ticked unless unticked, and remembered), and
  // the note for this save. Resolves with { note, stamps }, or null.
  async function saveDialog(kind) {
    const doc = state.doc;
    let note;
    let box;
    const title = kind === 'copy' ? `Save a copy of ${state.fileName}` : `Save ${state.fileName}`;
    const go = await dialog(title, (body) => {
      const count = { changed: 0, removed: 0, added: 0 };
      for (const run of state.runs) count[run.kind] += run.lines.length;
      body.appendChild(el('div', 'dialog-sum', state.runs.length
        ? `${fmt(count.changed)} changed · ${fmt(count.removed)} removed · ${fmt(count.added)} added`
        : 'No change since the file was opened or last saved: the copy is the file as it is'));
      if (state.runs.length) {
        const list = el('div', 'dialog-list');
        putRuns(list, state.runs);
        body.appendChild(list);
      }
      const plan = C.stampPlan(doc);
      const label = el('label', 'dialog-check');
      box = el('input');
      box.type = 'checkbox';
      box.checked = state.stamps;
      label.appendChild(box);
      label.appendChild(el('span', null, `Change stamps${plan.length ? ` · ${plural(plan.length, 'record', 'records')}` : ' · none needed'}`));
      body.appendChild(label);
      const stamps = el('div', 'dialog-stamps');
      for (const p of plan) {
        const row = el('div');
        row.appendChild(el('span', 'mono', recordName(p.id, p.tag)));
        row.appendChild(el('span', 'muted', `  ${STAMP_HOW[p.how]}`));
        stamps.appendChild(row);
      }
      stamps.hidden = !box.checked;
      box.addEventListener('change', () => { stamps.hidden = !box.checked; });
      body.appendChild(stamps);
      const noteRow = el('label', 'dialog-note');
      noteRow.appendChild(el('span', null, 'Note'));
      note = el('input', 'input');
      note.type = 'text';
      note.maxLength = C.STAMP_NOTE_MAX;
      note.placeholder = C.STAMP_NOTE;                               // what is written when nothing is typed
      note.title = 'For the change stamps and the log; one line, 200 characters at most';
      noteRow.appendChild(note);
      body.appendChild(noteRow);
    }, [CANCEL, { label: kind === 'copy' ? 'Save a copy' : 'Save', value: 'go', primary: true }]);
    if (!go) return null;
    state.stamps = box.checked;
    store.set('stamps', state.stamps);
    return { note: note.value, stamps: box.checked };
  }

  // A save that wrote nothing takes its stamps back, so the document is as it was before it.
  function takeBackStamps(stepsBefore) {
    const doc = state.doc;
    if (doc.done.length > stepsBefore && doc.done[doc.done.length - 1].label === 'Change stamps') C.undo(doc);
  }

  // ---------------------------------------------------------------------------------------------
  // Saving (10.2, 10.3)
  // ---------------------------------------------------------------------------------------------

  // 10.2 step 2: the folder, asked for once, opening at the file, and proved to hold it; from then
  // on the file, its backup and its log are reached through it, under the one grant.
  async function grantFolder() {
    if (state.dir) return true;
    let dir;
    try {
      const opts = { id: 'gedview-save', mode: 'readwrite' };
      if (state.handle) opts.startIn = state.handle;
      dir = await window.showDirectoryPicker(opts);
    } catch (e) {
      if (e.name === 'AbortError') notice(`No folder, no save in place. Save a copy can write ${state.fileName} somewhere else.`);
      else notice(`${e.name}: ${e.message}`, 'error');
      return false;
    }
    let holds;
    if (state.handle) {
      const path = await dir.resolve(state.handle).catch(() => null);
      holds = !!path && path.length === 1 && path[0] === state.fileName;
    } else {
      // opened through the file box, with no handle: the folder's file of that name must be this
      // one, byte for byte
      holds = (await S.checkDisk({ dir, name: state.fileName, diskHash: state.disk.sha256, hash: sha256 })).done;
    }
    if (!holds) {
      notice(`That folder does not hold ${state.fileName}. Save again, and pick the folder it is in.`, 'error');
      return false;
    }
    state.dir = dir;
    return true;
  }

  // 10.2 step 3 refused: the file changed on disk. Nothing is written; the owner picks.
  async function changedOnDisk() {
    const buttons = [CANCEL];
    if (state.handle) buttons.push({ label: 'Reload it, and drop my changes', value: 'reload' });
    buttons.push({ label: 'Save a copy', value: 'copy', primary: true });
    const pick = await dialog(`${state.fileName} changed on disk since it was opened`, (body) => {
      body.appendChild(el('div', null, 'Another program changed it. gedview will not write over it.'));
    }, buttons);
    if (pick === 'copy') await doSaveCopy();
    if (pick === 'reload') await openFile(await state.handle.getFile(), state.handle);
  }

  async function doSave() {
    if (!state.doc || $('dialog').open) return;
    if (state.edit && !commitEdit(false)) return;
    // 1. nothing changed: say so, write nothing
    if (!C.isChanged(state.doc)) {
      notice('Nothing has changed since the file was opened or last saved. Nothing was written.');
      return;
    }
    if (!PICKERS) {
      notice('This browser cannot write a file in place. Save a copy downloads one.');
      return;
    }
    await state.hashing;
    // 2. the folder
    if (!(await grantFolder())) return;
    // 3. the file on disk is the file as opened or last saved
    const check = await S.checkDisk({ dir: state.dir, name: state.fileName, diskHash: state.disk.sha256, hash: sha256 });
    if (!check.done) {
      if (check.changedOnDisk) await changedOnDisk();
      else notice(check.say, 'error');
      return;
    }
    // 4. the dialog
    const choice = await saveDialog('save');
    if (!choice) return;
    // 5–10, in save.js
    const stepsBefore = state.doc.done.length;
    const r = await S.save({ doc: state.doc, dir: state.dir, name: state.fileName, disk: state.disk,
      when: new Date(), note: choice.note, stamps: choice.stamps, hash: sha256 });
    if (r.done) state.disk = r.disk;
    else if (!r.loud) takeBackStamps(stepsBefore);
    afterAct(state.sel);
    if (r.done) {
      notice(`Saved. The file as it was is in ${r.backup}. ${r.logFailed || `The log is ${r.log}.`}`, r.logFailed ? 'error' : 'ok');
    } else if (r.changedOnDisk) await changedOnDisk();
    else if (r.loud) await saidLoudly('Save did not finish', r.say);
    else notice(r.say, 'error');
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

  // 10.3 — Save a copy: into the folder when Save has been granted it; else where the owner picks,
  // the log block offered as a second file; in a browser with no pickers, both downloaded.
  async function doSaveCopy() {
    if (!state.doc || $('dialog').open) return;
    if (state.edit && !commitEdit(false)) return;
    await state.hashing;
    const choice = await saveDialog('copy');
    if (!choice) return;
    const stepsBefore = state.doc.done.length;
    const args = { doc: state.doc, name: state.fileName, disk: state.disk, when: new Date(),
      note: choice.note, stamps: choice.stamps, hash: sha256 };
    if (state.dir) {
      const r = await S.saveCopy({ ...args, dir: state.dir });
      if (!r.done) takeBackStamps(stepsBefore);
      afterAct(state.sel);
      if (!r.done) await saidLoudly('Save a copy did not finish', r.say);
      else notice(`The copy is ${r.copy}, beside the file. ${r.logFailed || `Its log block is in ${r.log}.`}`, r.logFailed ? 'error' : 'ok');
      return;
    }
    const r = await S.copyFiles(args);
    if (!r.done) {
      takeBackStamps(stepsBefore);
      afterAct(state.sel);
      notice(r.say, 'error');
      return;
    }
    afterAct(state.sel);
    if (PICKERS) {
      let handle;
      try {
        const opts = { suggestedName: r.copy, types: [{ description: 'GEDCOM', accept: { 'application/x-gedcom': ['.ged', '.gedcom'] } }] };
        if (state.handle) opts.startIn = state.handle;
        handle = await window.showSaveFilePicker(opts);
      } catch (e) {
        takeBackStamps(stepsBefore);
        afterAct(state.sel);
        notice(e.name === 'AbortError' ? 'No copy was written.' : `${e.name}: ${e.message}`, e.name === 'AbortError' ? '' : 'error');
        return;
      }
      if (!(await S.writeChecked(handle, r.bytes, sha256))) {
        await saidLoudly('Save a copy did not finish', `${handle.name} did not read back as it was written.`);
        return;
      }
      const more = await dialog('The copy is written', (body) => body.appendChild(el('div', 'mono', handle.name)),
        [{ label: 'Close', value: '' }, { label: 'Save its log block', value: 'log', primary: true }]);
      if (!more) return;
      try {
        const logHandle = await window.showSaveFilePicker({ suggestedName: r.logName });
        const w = await logHandle.createWritable();
        await w.write(new TextEncoder().encode(r.logText(handle.name)));
        await w.close();
      } catch (e) {
        if (e.name !== 'AbortError') notice(`${e.name}: ${e.message}`, 'error');
      }
      return;
    }
    download(r.bytes, r.copy);
    const more = await dialog('The copy is downloaded', (body) => body.appendChild(el('div', 'mono', r.copy)),
      [{ label: 'Close', value: '' }, { label: 'Download its log block', value: 'log', primary: true }]);
    if (more) download(new TextEncoder().encode(r.logText(r.copy)), r.logName, 'text/plain;charset=utf-8');
  }

  // ---------------------------------------------------------------------------------------------
  // Opening a file
  // ---------------------------------------------------------------------------------------------

  function showEmpty(message) {
    state.doc = null;
    state.m = null;
    state.handle = null;
    state.dir = null;
    state.disk = null;
    state.sel = -1;
    state.back = [];
    state.edit = null;
    state.pending = null;
    state.folds = new Set();
    state.runs = [];
    state.vis = new Int32Array(0);
    $('file-name').textContent = '';
    $('facts').textContent = '';
    $('counts').textContent = '';
    $('checks-count').textContent = '';
    $('checks-sum').textContent = '';
    $('changes-count').textContent = '';
    $('changes-sum').textContent = '';
    $('search-count').textContent = '';
    $('detail').textContent = '';
    $('goto').disabled = true;
    state.recordRows = [];
    state.checkRows = [];
    state.tagRows = [];
    for (const list of [grid, recordsList, checksList, changesList, tagsList]) list.setCount(0);
    updateBack();
    updateBar();
    $('empty').hidden = false;
    $('message').hidden = !message;
    $('message').textContent = message || '';
  }

  // Changes not yet saved are dropped only when the owner says so.
  async function mayDropChanges() {
    if (state.edit && !commitEdit(false)) return false;
    if (!state.doc || !C.isChanged(state.doc)) return true;
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
    state.dir = null;
    state.disk = { sha256: null, bytes: bytes.length, lines: doc.m.n };
    state.hashing = sha256(bytes).then((hex) => {
      if (state.doc === doc && state.disk.sha256 === null) state.disk.sha256 = hex;
      return hex;
    });
    state.sel = -1;
    state.back = [];
    state.folds = new Set();
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
    $('goto').disabled = false;
    $('file-name').textContent = file.name;
    $('grid').style.setProperty('--ln-width', `${fmt(doc.m.n).length + 1}ch`);
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
    rebuildVis();
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
      [handle] = await window.showOpenFilePicker({
        types: [{ description: 'GEDCOM', accept: { 'application/x-gedcom': ['.ged', '.gedcom'] } }],
      });
    } catch (e) {
      if (e.name !== 'AbortError') notice(`${e.name}: ${e.message}`, 'error');
      return;
    }
    await openFile(await handle.getFile(), handle);
  }

  $('open').addEventListener('click', pickFile);
  $('open-empty').addEventListener('click', pickFile);
  $('file-input').addEventListener('change', () => {
    const file = $('file-input').files[0];
    $('file-input').value = '';
    if (file) openFile(file, null);
  });

  // A file dropped anywhere on the page. Its handle (to save in place) must be asked for while the
  // drop is still being handled; the browser forgets the dropped items after.
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

  // Leaving with changes not saved: the browser asks first.
  window.addEventListener('beforeunload', (e) => {
    if (state.doc && C.isChanged(state.doc)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Controls, panels and keys
  // ---------------------------------------------------------------------------------------------

  function applyTheme() {
    root.classList.remove('dark', 'sunset');
    if (state.theme !== 'light') root.classList.add(state.theme);
    $('theme').title = state.theme;
  }
  $('theme').addEventListener('click', () => {
    state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
    store.set('theme', state.theme);
    applyTheme();
  });

  function applyIndent() {
    $('indent').setAttribute('aria-pressed', String(state.indent));
    $('indent-width').hidden = !state.indent;
    $('indent-width').value = String(state.indentWidth);
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
    grid.refresh();
  });

  $('back').addEventListener('click', goBack);
  $('save').addEventListener('click', doSave);
  $('save-copy').addEventListener('click', doSaveCopy);
  $('undo').addEventListener('click', doUndo);
  $('redo').addEventListener('click', doRedo);

  $('goto').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const n = parseInt($('goto').value.replace(/[\s,._]/g, ''), 10);
    if (!state.m || !(n >= 1)) return;
    select(Math.min(n, state.m.n) - 1, 'jump');
    $('grid').focus();
  });

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
      if (state.collapsed.has(code)) state.collapsed.delete(code); else state.collapsed.add(code);
      buildCheckRows(true);
    } else if (item.f.line >= 0) select(item.f.line, 'jump');
  });

  $('changes-list').addEventListener('click', (e) => {
    const k = changesList.rowOf(e.target);
    if (k < 0) return;
    const run = state.runs[k];
    select(run.kind === 'removed' ? run.at : run.after, 'jump');
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
    if (mod && !e.altKey && key === 's') {                           // ⌘S, ⇧⌘S: from anywhere
      e.preventDefault();
      if (e.shiftKey) doSaveCopy(); else doSave();
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
    if (key in moves) {
      e.preventDefault();
      selectRow(rowOfLine(i) + moves[key]);
    } else if (key === 'Home') {
      e.preventDefault();
      selectRow(0);
    } else if (key === 'End') {
      e.preventDefault();
      selectRow(state.vis.length - 1);
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
    }
  });

  applyTheme();
  applyIndent();
  openPanel('records');
  updateBack();
  updateBar();
})();
