/* gedview — ui.js
 *
 * The page: the grid, the panels, the right pane, the keys. It is the only file that knows the
 * page and the browser's file pickers exist; everything it shows, it asks core.js for. Text from
 * a file always goes into the page as text, never as markup.
 *
 * Phase 2: the page reads. Editing and saving come in phase 4, with save.js.
 */
(function () {
  'use strict';

  const C = window.GedCore;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('en-US');
  const root = document.documentElement;

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
  const ID_WHOLE = /^@[^@ ]+@$/;

  const state = {
    m: null,
    handle: null,                     // for phase 4, to save in place; never stored
    sel: -1,
    back: [],
    indent: store.get('indent', false) === true,
    indentWidth: clampWidth(store.get('indentWidth', 4)),
    theme: THEMES.includes(store.get('theme', 'light')) ? store.get('theme', 'light') : 'light',
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

  // ---------------------------------------------------------------------------------------------
  // A list of rows of one height, where only the rows in view exist in the page (the grid, and
  // the Records, Checks and Tags lists). The rows sit in a layer that sticks to the top of the
  // view while the list scrolls under it, and each scroll repaints what they show: a fast drag of
  // the scrollbar shows rows, never an empty screen.
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
  // The grid
  // ---------------------------------------------------------------------------------------------

  function paintRow(row, i) {
    const m = state.m;
    let cls = 'row';
    if (i === state.sel) cls += ' is-sel';
    else if (state.hitFlags && state.hitFlags[i]) cls += ' is-hit';
    row.className = cls;
    row.textContent = '';
    row.appendChild(el('span', 'ln', fmt(i + 1)));
    const marks = m.findings.marks[i];
    row.appendChild(el('span', marks & 1 ? 'mk is-error' : marks & 2 ? 'mk is-note' : 'mk'));
    const tx = el('span', 'tx');
    const lv = m.level[i];
    if (state.indent && lv > 0) tx.style.paddingLeft = `${Math.min(lv, MAX_INDENT) * state.indentWidth}ch`;
    putParts(tx, m.texts[i], partsOf(m, i), ROW_CHARS, matchesIn(i, ROW_CHARS));
    row.appendChild(tx);
  }

  const grid = Virtual($('grid'), paintRow);

  function select(i, how) {
    const m = state.m;
    if (!m || !m.n) return;
    const to = Math.max(0, Math.min(m.n - 1, i));
    if (how === 'jump' && state.sel >= 0 && state.sel !== to) {
      state.back.push(state.sel);
      updateBack();
    }
    state.sel = to;
    grid.show(to, how === 'jump' || how === 'step');
    grid.refresh();
    renderDetail();
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
    const i = grid.rowOf(e.target);
    if (i < 0) return;
    if (e.target.closest('.ptr')) {
      state.sel = i;                                                 // Back comes back to this line
      jumpToId(C.valueOf(state.m, i));
      return;
    }
    select(i);
  });

  // ---------------------------------------------------------------------------------------------
  // The right pane: the selected line's whole value, its joined value, its record, what points at
  // it, and its findings
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

  function renderDetail() {
    const d = $('detail');
    d.textContent = '';
    const m = state.m;
    const i = state.sel;
    if (!m || i < 0) return;
    const t = m.texts[i];
    const parts = partsOf(m, i);

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

  function renderFacts() {
    const m = state.m;
    const f = $('facts');
    f.textContent = '';
    const parts = [m.encodingLabel, `${fmt(m.n)} lines`, sizeOf(m.size)];
    if (m.version) parts.push(m.version);
    const source = [m.facts.source, m.facts.sourceVersion].filter((x) => x).join(' ');
    if (source) parts.push(source);
    if (m.facts.date) parts.push(m.facts.date);
    putText(f, `${parts.join(' · ')} · `);
    const sha = el('button', 'sha', 'sha256');
    sha.type = 'button';
    sha.addEventListener('click', async () => {
      const digest = await crypto.subtle.digest('SHA-256', m.bytes);
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      sha.replaceWith(el('span', 'hash', hex));
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
  // The side panels: Records, Checks, Search, Tags
  // ---------------------------------------------------------------------------------------------

  function openPanel(name) {
    for (const tab of document.querySelectorAll('.tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.panel === name));
    }
    for (const p of ['records', 'checks', 'search', 'tags']) $(`panel-${p}`).hidden = p !== name;
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

  function filterRecords() {
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
    recordsList.setCount(rows.length);
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

  function plural(n, one, many) { return `${fmt(n)} ${n === 1 ? one : many}`; }

  function renderChecks() {
    const fnd = state.m.findings;
    const count = $('checks-count');
    count.textContent = '';
    if (fnd.errors) count.appendChild(el('span', 'n-error', fmt(fnd.errors)));
    if (fnd.notes) count.appendChild(el('span', 'n-note', fmt(fnd.notes)));
    $('checks-sum').textContent = `${plural(fnd.errors, 'error', 'errors')} · ${plural(fnd.notes, 'note', 'notes')}`;
    buildCheckRows(false);
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

  const tagsList = Virtual($('tags-list'), (row, k) => {
    const [tg, n] = state.tagRows[k];
    row.className = 'item';
    row.textContent = '';
    row.appendChild(el('span', 'main mono', tg));
    row.appendChild(el('span', 'end', fmt(n)));
  });

  function renderTags() {
    state.tagRows = [...state.m.tagCounts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
    tagsList.setCount(state.tagRows.length);
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
  // Opening a file
  // ---------------------------------------------------------------------------------------------

  function showEmpty(message) {
    state.m = null;
    state.handle = null;
    state.sel = -1;
    state.back = [];
    document.title = 'gedview';
    $('file-name').textContent = '';
    $('facts').textContent = '';
    $('counts').textContent = '';
    $('checks-count').textContent = '';
    $('checks-sum').textContent = '';
    $('search-count').textContent = '';
    $('detail').textContent = '';
    $('goto').disabled = true;
    state.recordRows = [];
    state.checkRows = [];
    state.tagRows = [];
    for (const list of [grid, recordsList, checksList, tagsList]) list.setCount(0);
    updateBack();
    $('empty').hidden = false;
    $('message').hidden = !message;
    $('message').textContent = message || '';
  }

  async function openFile(file, handle) {
    let m;
    try {
      m = C.read(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      showEmpty(`${file.name}: ${e.name}: ${e.message}`);
      return;
    }
    const most = Math.floor(MAX_PIXELS / grid.rowHeight());
    if (m.n > most) {
      showEmpty(`${file.name} has ${fmt(m.n)} lines. This page can show at most ${fmt(most)}.`);
      return;
    }
    state.m = m;
    state.handle = handle || null;
    state.sel = -1;
    state.back = [];
    state.recordType = null;
    state.collapsed = new Set();
    state.search = { query: '', tag: false, hits: [], at: -1, idDone: false };
    state.hitFlags = null;
    state.highlight = null;
    $('search-box').value = '';
    $('search-tag').setAttribute('aria-pressed', 'false');
    $('records-filter').value = '';
    $('message').hidden = true;
    $('empty').hidden = true;
    $('goto').disabled = false;
    document.title = `${file.name} — gedview`;
    $('file-name').textContent = file.name;
    $('grid').style.setProperty('--ln-width', `${fmt(m.n).length + 1}ch`);
    renderFacts();
    renderCounts();
    renderChecks();
    renderTags();
    filterRecords();
    updateSearch();
    updateBack();
    grid.setCount(m.n);
    select(0);
    $('grid').focus();
  }

  async function pickFile() {
    if (!('showOpenFilePicker' in window)) {
      $('file-input').click();                                       // a browser with no pickers
      return;
    }
    let handle;
    try {
      [handle] = await window.showOpenFilePicker({
        types: [{ description: 'GEDCOM', accept: { 'application/x-gedcom': ['.ged', '.gedcom'] } }],
      });
    } catch (e) {
      if (e.name !== 'AbortError') showEmpty(`${e.name}: ${e.message}`);
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

  // A file dropped anywhere on the page. Its handle (for saving in place, phase 4) must be asked
  // for while the drop is still being handled; the browser forgets the dropped items after.
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
    asking.then((h) => openFile(file, h && h.kind === 'file' ? h : null), () => openFile(file, null));
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

  $('records-filter').addEventListener('input', filterRecords);
  $('records-type').addEventListener('click', () => {
    state.recordType = null;
    filterRecords();
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
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && !e.shiftKey && !e.altKey && (key === 'f' || key === 'l')) {
      if (!state.m) return;
      e.preventDefault();
      const box = key === 'f' ? $('search-box') : $('goto');
      if (key === 'f') openPanel('search');
      box.focus();
      box.select();
      return;
    }
    if (e.target.closest && e.target.closest('input, textarea, select')) {
      if (key === 'Escape') {
        e.target.blur();
        $('grid').focus();
      }
      return;
    }
    if (!state.m || mod || e.altKey) return;
    const page = grid.pageRows();
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (key in moves) {
      e.preventDefault();
      select(Math.max(0, state.sel) + moves[key]);
    } else if (key === 'Home') {
      e.preventDefault();
      select(0);
    } else if (key === 'End') {
      e.preventDefault();
      select(state.m.n - 1);
    }
  });

  applyTheme();
  applyIndent();
  openPanel('records');
  updateBack();
})();
