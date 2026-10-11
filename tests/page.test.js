// The page's own files: what it loads, in what order, that none of them can reach the network
// (I5), and that the page tells the browser to enforce it (0.5.2).
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.js');
const K = require('./contrast.js');
const core = require('../core.js');

const PAGE = ['index.html', 'style.css', 'tags.js', 'core.js', 'save.js', 'ui.js'];
const FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'import(', '@import',
  'url(http', 'http://', 'https://'];
const read = (name) => fs.readFileSync(path.join(h.ROOT, name), 'utf8');
const FEEDBACK = 'feedback@gedcom-viewer.net';
const loads = (page) => [...page.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]);

describe('the page', () => {
  it('index.html loads style.css and the icons, then tags.js, core.js, save.js and ui.js as classic scripts, in that order (the table before the code that reads it); links privacy.html; and nothing else', () => {
    const page = read('index.html');
    assert.deepEqual([...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]),
      ['<script src="tags.js" charset="utf-8">', '<script src="core.js" charset="utf-8">', '<script src="save.js" charset="utf-8">', '<script src="ui.js" charset="utf-8">']);
    assert.deepEqual(loads(page),
      ['style.css', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'privacy.html', 'tags.js', 'core.js', 'save.js', 'ui.js']);
    assert.ok(!/type="module"/.test(page), 'no modules: a page opened from disk may not import one');
  });

  it('publish.yml serves every file index.html and privacy.html load, tags.js among them, and hashes the same files it serves', () => {
    const yml = fs.readFileSync(path.join(h.ROOT, '.github', 'workflows', 'publish.yml'), 'utf8');
    const copied = yml.match(/^\s*cp (.+) site\/$/m);
    const hashed = yml.match(/^\s*sha256sum (.+) > sums\.txt$/m);
    assert.ok(copied && hashed, 'the publish job copies, and the release job hashes');
    const served = copied[1].split(' ');
    assert.deepEqual(hashed[1].split(' '), served, 'the two lists must match, in order (the workflow says so itself)');
    assert.ok(served.includes('tags.js'), 'tags.js is served');
    const wanted = [...loads(read('index.html')), ...loads(read('privacy.html'))].filter((u) => !u.includes('://') && !u.startsWith('mailto:'))
      .map((u) => u.split('#')[0]);
    for (const file of new Set(wanted)) assert.ok(served.includes(file), `${file} is loaded by a page and not served`);
  });

  it('no file of the page can reach the network — no exceptions', () => {
    for (const name of PAGE) {
      const text = read(name);
      for (const word of FORBIDDEN) assert.ok(!text.includes(word), `${name} holds "${word}"`);
    }
  });

  it('index.html and privacy.html each tell the browser to load nothing but their own files and to connect nowhere, before anything loads', () => {
    for (const name of ['index.html', 'privacy.html']) {
      const page = read(name);
      const m = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
      assert.ok(m, `${name} carries no policy`);
      const policy = m[1];
      assert.ok(policy.startsWith("default-src 'none'"), `${name}: the policy must start by refusing everything: ${policy}`);
      assert.ok(policy.includes("connect-src 'none'"), `${name}: the policy must refuse every connection: ${policy}`);
      assert.ok(!/unsafe|http|data:|blob:|\*/.test(policy), `${name}: a hole in the policy: ${policy}`);
      assert.ok(/style-src 'self';/.test(policy), `${name}: styles must be the page's own file alone, none inline: ${policy}`);
      if (name === 'index.html') assert.ok(/script-src 'self';/.test(policy), `${name}: scripts must be the page's own alone: ${policy}`);
      else assert.ok(!/script-src/.test(policy), `${name}: no script at all, so no script-src: ${policy}`);
      assert.ok(page.indexOf('<meta http-equiv="Content-Security-Policy"') < page.indexOf('<link'), `${name}: the policy must come before anything the page loads`);
    }
  });

  it('privacy.html holds no script and loads only style.css and the icons; its links out go to GitHub alone, bar one mailto to the feedback address; favicon.svg holds nothing but shapes', () => {
    const privacy = read('privacy.html');
    assert.equal(privacy.match(/<script\b/g), null, 'a script in privacy.html');
    const out = loads(privacy).filter((u) => u.includes('://'));
    assert.ok(out.length > 0 && out.every((u) => /^https:\/\/(docs\.)?github\.com\//.test(u)), `a link out that is not GitHub's: ${out}`);
    // the one other way out is an email, which the browser hands to the person's own mail program: a navigation, not a request
    assert.deepEqual(loads(privacy).filter((u) => u.startsWith('mailto:')), [`mailto:${FEEDBACK}`], 'exactly one mailto link, to the feedback address');
    assert.deepEqual(loads(privacy).filter((u) => !u.includes('://') && !u.startsWith('mailto:')),
      ['style.css', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'index.html']);
    const svg = read('favicon.svg').replace('xmlns="http://www.w3.org/2000/svg"', '');
    for (const word of [...FORBIDDEN, '<script', 'href', '<image', '<use', '<foreignObject', 'url(']) {
      assert.ok(!svg.includes(word), `favicon.svg holds "${word}"`);
    }
  });

  it('every colour and size the rules use is a custom property, defined at the top of style.css', () => {
    const css = read('style.css');
    const rules = css.slice(css.indexOf('/* -------'));
    const literal = rules.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g);
    assert.equal(literal, null, `a colour written into the rules below the properties: ${literal}`);
    const used = new Set([...rules.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    const defined = new Set([...css.slice(0, css.indexOf('/* -------')).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const missing = [...used].filter((v) => !defined.has(v) && v !== '--ln-width');
    assert.deepEqual(missing, [], 'used but not defined at the top');
  });

  // 0.5.4: what the page tells the browser about the boxes and places that hold a file's words
  const tagOf = (page, id) => {
    const m = page.match(new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`));
    assert.ok(m, `index.html has no element with id "${id}"`);
    return m[0];
  };

  it('the Search box, the Records filter and Go to Line turn spell check and the grammar helpers off', () => {
    const page = read('index.html');
    for (const id of ['search-box', 'records-filter', 'goto']) {
      const tag = tagOf(page, id);
      assert.ok(/\bspellcheck="false"/.test(tag), `#${id} leaves spell check on: ${tag}`);
      assert.ok(/\bdata-gramm="false"/.test(tag), `#${id} leaves Grammarly on: ${tag}`);
    }
  });

  it('what shows the file is marked translate="no": the lines, the right frame, the records list, the Checks, Changes, Search and Tags panels, the file\'s name, its facts and its counts', () => {
    const page = read('index.html');
    for (const id of ['grid', 'detail', 'records-list', 'panel-checks', 'panel-changes', 'panel-search', 'panel-tags', 'file-name', 'facts', 'counts']) {
      assert.ok(/\btranslate="no"/.test(tagOf(page, id)), `#${id} can be translated: ${tagOf(page, id)}`);
    }
  });

  it('the tab holds the file\'s name only through the File name in the tab setting, which is off unless it was turned on', () => {
    const page = read('index.html');
    const menu = page.slice(page.indexOf('id="settings-menu"'), page.indexOf('</div>\n\n<nav class="counts"'));
    assert.ok(menu.includes('id="tab-name"') && /id="tab-name"[^>]*aria-pressed="false"[^>]*>File name in the tab</.test(menu), 'no File name in the tab button in Settings');
    assert.ok(menu.indexOf('id="surnames"') < menu.indexOf('id="tab-name"'), 'File name in the tab sits beside Bold surnames');
    const ui = read('ui.js');
    assert.ok(ui.includes("store.get('tabName', false) === true"), 'the setting must default to off');
    const titles = ui.match(/document\.title\s*=[^;]*;/g) || [];
    assert.equal(titles.length, 1, 'the tab\'s title is set in one place');
    assert.ok(titles[0].includes('state.nameInTab'), `the title must name the file only when the setting is on: ${titles[0]}`);
    assert.ok(/File name in the tab \$\{state\.nameInTab/.test(ui), 'the report\'s settings line must carry the setting');
  });

  it('privacy.html names every setting the page stores, so a new one cannot go unlisted', () => {
    // each key the page stores, and the words privacy.html uses for it
    const named = { theme: 'the theme (System, Light, Dusk or Dark)', textSize: 'the text size (Normal or Larger)', indent: 'Indent', indentWidth: 'its width', surnames: 'Bold surnames',
      tabName: 'File name in the tab', hideLeft: 'whether each is hidden', hideRight: 'whether each is hidden',
      tagsOrder: 'Tags list\'s order', stamps: 'change stamps', headerNote: 'date is noted in the header', facts: 'file\'s facts show' };
    const keys = [...new Set([...read('ui.js').matchAll(/store\.(?:get|set)\('(\w+)'/g)].map((m) => m[1]))].sort();
    assert.deepEqual(keys, Object.keys(named).sort(), 'a key the page stores is not in this list: add it here and to privacy.html');
    const privacy = read('privacy.html').replace(/\s+/g, ' ');
    for (const [key, words] of Object.entries(named)) assert.ok(privacy.includes(words), `privacy.html does not name ${key} (${words})`);
  });

  it('privacy.html: "everything this page sends", no longer "the whole of what leaves your computer"; and the two sections on what the page cannot control and how to check it', () => {
    const privacy = read('privacy.html').replace(/\s+/g, ' ');
    assert.ok(!privacy.includes('the whole of what leaves your computer'), 'the old sentence is still there');
    assert.ok(privacy.includes('That is everything this page sends.'));
    assert.ok(privacy.includes('<h2>What the page cannot control</h2>'));
    assert.ok(/<h2(?: id="how-to-check")?>How to check it yourself<\/h2>/.test(privacy), 'the section on checking it yourself');
    assert.ok(privacy.includes('refuse requests, images, fonts and scripts from anywhere else'));
  });

  // 0.5.6: saving as section 10 has it (P5, S3, the log cut)
  it('one Save, ⌘S, and no Save a copy or ⇧⌘S: Save reads Download a copy in a browser without the Save dialog', () => {
    const page = read('index.html');
    const ui = read('ui.js');
    assert.ok(/<button class="button" id="save" type="button" title="Save a dated copy, where you choose; the original is never written \(⌘S\)" hidden disabled>Save<\/button>/.test(page));
    for (const gone of ['save-copy', 'Save a copy', '⇧⌘S']) {
      assert.ok(!page.includes(gone), `index.html still holds "${gone}"`);
      assert.ok(!ui.includes(gone), `ui.js still holds "${gone}"`);
    }
    assert.ok(ui.includes("$('save').textContent = canPick() ? 'Save' : 'Download a copy';"), 'the label follows the browser');
    assert.ok(/function canPick\(\) \{ return PICKERS && \(!state\.doc \|\| !!state\.handle\); \}/.test(ui), 'the Save dialog only for a file with a handle, which step 6 needs');
    assert.ok(ui.includes("if (mod && !e.shiftKey && !e.altKey && key === 's') {"), '⌘S alone');
    assert.ok(ui.includes('window.showSaveFilePicker({ suggestedName: name, startIn: state.handle, types: GEDCOM_TYPES })'),
      'the Save dialog offers the dated name and opens at the original');
    assert.ok(/updateBar\(\);\s+\/\/ Save, or Download a copy, as this browser has it\n\}\)\(\);/.test(ui), 'the label is set as the page starts');
  });

  it('nothing asks for a folder, and nothing writes a backup or a log', () => {
    for (const name of ['ui.js', 'save.js']) {
      const text = read(name);
      for (const gone of ['showDirectoryPicker', 'getDirectoryHandle', 'grantFolder', 'gedcom-viewer-history', '.edits.log', '.bak', 'keepExistingData', 'logBlock']) {
        assert.ok(!text.includes(gone), `${name} still holds "${gone}"`);
      }
    }
    assert.ok(read('save.js').includes('f.handle.isSameEntry(handle)'), 'step 6 asks the browser whether the file picked is a file of the visit');
  });

  it('the Save dialog: Add change stamps and Note the date in the header, each with the lines it will write under it, hidden when unticked; the Note box among the stamps\' lines; the dot, Save and leaving mean lines that no file holds yet', () => {
    const ui = read('ui.js');
    const dlg = ui.slice(ui.indexOf('async function saveDialog'), ui.indexOf('// Saving (10.2)'));
    assert.ok(dlg.includes("checkRow(body, 'save-stamps', 'Add change stamps', state.stamps, plan.length ? '' : 'no record to stamp')"), 'Add change stamps, no count; disabled, with a line, when no record can carry one');
    assert.ok(dlg.includes("checkRow(body, 'save-header', 'Note the date in the header', state.headerNote, head ? '' : 'no header in this file')"));
    assert.ok(dlg.includes('stamps.appendChild(noteRow);'), 'the Note box sits in the stamps\' block, with the records');
    assert.ok(dlg.includes('stamps.hidden = stampBox.disabled || !stampBox.checked;') && dlg.includes('dated.hidden = headerBox.disabled || !headerBox.checked;'), 'unticked: hidden, not dimmed');
    assert.ok(dlg.includes("return { note: stamps ? note.value : '', stamps, header: !headerBox.disabled && headerBox.checked, when };"), 'unticked, the note goes nowhere; the moment shown is the save\'s');
    assert.ok(dlg.includes("store.set('headerNote', state.headerNote);") && ui.includes("headerNote: store.get('headerNote', true) !== false,"), 'ticked unless unticked, and remembered');
    assert.ok(!/\blog\b/.test(dlg) && !dlg.includes('No change from the original'), 'nothing of a log, and no dialog for nothing');
    assert.ok(/const changed = !!doc && C\.unsaved\(doc\);/.test(ui));
    assert.ok(/window\.addEventListener\('beforeunload', \(e\) => \{\s+if \(state\.doc && C\.unsaved\(state\.doc\)\)/.test(ui), 'leaving warns only for lines no file holds');
    assert.ok(/\.dialog-line \{\s+padding-left: calc\(\(var\(--lv\) \+ 1\) \* var\(--dialog-level-step\)\);/.test(read('style.css')), 'each line indented by its level');
    assert.ok(/Date in the header \$\{state\.headerNote \? 'on' : 'off'\}`/.test(ui), 'the report\'s settings line carries it');
  });

  it('what a save writes into a file names no product and says nothing of hands: the stamp\'s note says what changed', () => {
    for (const name of ['core.js', 'save.js']) {
      assert.ok(!/Edited by hand|by hand in GEDCOM Viewer/.test(read(name)), `${name} still writes the old note`);
    }
    assert.ok(read('core.js').includes("const KINDS = ['Changed', 'Added', 'Removed', 'Moved'];"));
  });

  it('the Changes tab has a copy button at its top, like every box\'s, that puts the list on the clipboard as text and writes it nowhere', () => {
    const page = read('index.html');
    const panel = page.slice(page.indexOf('<section class="panel" id="panel-changes"'), page.indexOf('</section>', page.indexOf('id="panel-changes"')));
    assert.ok(/<div class="panel-sum has-copy"><span id="changes-sum"><\/span><button class="copy" id="changes-copy" type="button" title="Copy the changes, as text" aria-label="Copy the changes, as text" hidden><\/button><\/div>/.test(panel),
      'the copy button sits in the line above the list');
    assert.ok(panel.indexOf('id="changes-copy"') < panel.indexOf('id="changes-list"'), 'at its top');
    const ui = read('ui.js');
    assert.ok(ui.includes("wireCopy($('changes-copy'), changesAsText,") && ui.includes('S.changesText({ when: new Date(), file: state.fileName,'));
    assert.ok(/\.copy\[hidden\] \{ display: none; \}/.test(read('style.css')), 'hidden with no file open');
  });

  it('privacy.html: Saving says no folder is asked for, a dated copy goes where you choose, the original is never written, and elsewhere it is a download', () => {
    const privacy = read('privacy.html').replace(/\s+/g, ' ');
    const saving = (privacy.match(/<li><strong>Saving\.<\/strong>(.*?)<\/li>/) || [])[1];
    assert.ok(saving, 'no Saving bullet');
    for (const words of ['dated copy', 'where you choose', 'No folder is asked for', 'never written', 'download']) {
      assert.ok(saving.includes(words), `the Saving bullet does not say "${words}": ${saving}`);
    }
    for (const gone of ['The folder you grant', 'Save a copy', 'in place']) assert.ok(!saving.includes(gone), `the Saving bullet still says "${gone}"`);
  });

  // 0.5.5: type, the text size, the theme, motion and forced colours, the one console line
  const ownProps = (css) => K.blocksOf(css).filter((b) => b.selector === ':root').pop().props;
  const px = (v) => { const m = /^([\d.]+)px$/.exec(v); assert.ok(m, `not a size in px: ${v}`); return Number(m[1]); };

  it('type is 16px, the lines 15px and the small print 14px, with rows 24px high; nothing is under 14px, at either text size', () => {
    const css = read('style.css');
    const own = ownProps(css);
    assert.deepEqual(['--font-size-body', '--font-size-grid', '--font-size-small', '--row-height'].map((k) => own.get(k)), ['16px', '15px', '14px', '24px']);
    assert.ok(px(own.get('--list-row-height')) >= 26, 'the lists\' rows are at least 26px');
    const larger = K.blocksOf(css).find((b) => b.selector === '.text-larger').props;
    for (const [name, value] of [...own, ...larger]) if (/^--font-size-/.test(name)) assert.ok(px(value) >= 14, `${name} is ${value}`);
    const rules = css.slice(css.indexOf('/* -------'));
    for (const m of rules.matchAll(/font-size:\s*([\d.]+)(px|em|rem|%)/g)) {
      const n = Number(m[1]);
      const ok = m[2] === 'px' ? n >= 14 : m[2] === '%' ? n >= 100 : n >= 1;     // a relative size is never smaller than what it sits in
      assert.ok(ok, `a font size under 14px: ${m[0]}`);
    }
    for (const m of rules.matchAll(/(?<![-\w])font:\s*(?:\d+\s+)?([\d.]+)(px|em|rem|%)/g)) {
      const n = Number(m[1]);
      assert.ok(m[2] === 'px' ? n >= 14 : n >= 1, `a font size under 14px: ${m[0]}`);
    }
  });

  it('Larger sets the type and both row heights larger than Normal, and no more than that; the fold\'s click area is 24px each way at least', () => {
    const css = read('style.css');
    const own = ownProps(css);
    const larger = K.blocksOf(css).find((b) => b.selector === '.text-larger').props;
    for (const k of ['--font-size-title', '--font-size-file', '--font-size-body', '--font-size-small', '--font-size-grid', '--row-height', '--list-row-height']) {
      assert.ok(larger.has(k), `Larger does not set ${k}`);
      assert.ok(px(larger.get(k)) > px(own.get(k)), `${k} is not larger in Larger: ${larger.get(k)} against ${own.get(k)}`);
    }
    assert.ok(css.indexOf('.text-larger {') > css.lastIndexOf(':root {', css.indexOf('/* -------')), 'Larger must come after the block it overrides');
    assert.ok(px(own.get('--fold-hit')) >= 24, '--fold-hit is at least 24px');
    assert.ok(px(own.get('--row-height')) >= px(own.get('--fold-hit')), 'a fold is as high as its row');
    assert.ok(/\.fold \{[^}]*width:\s*max\(2ch, var\(--fold-hit\)\);[^}]*height:\s*var\(--row-height\);/.test(css), 'the grid\'s fold is --fold-hit wide at least, and a row high');
    assert.ok(/\.item\.is-head \.fold \{[^}]*width:\s*max\(1\.4em, var\(--fold-hit\)\)/.test(css), 'the Checks list\'s fold is --fold-hit wide at least');
  });

  it('Settings: Theme offers System, Light, Dusk, Dark in that order, and Text offers Normal and Larger; Sunset is gone from the page', () => {
    const page = read('index.html');
    const menu = page.slice(page.indexOf('id="settings-menu"'), page.indexOf('</div>\n\n<nav class="counts"'));
    const ids = [...menu.matchAll(/<button[^>]*\bid="([\w-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids.slice(0, 6), ['theme-system', 'theme-light', 'theme-dusk', 'theme-dark', 'text-normal', 'text-larger']);
    assert.ok(/id="theme-dusk"[^>]*>Dusk</.test(menu) && /id="text-larger"[^>]*>Larger</.test(menu));
    assert.ok(!/sunset/i.test(page), 'index.html still says sunset');
    assert.ok(menu.indexOf('Theme') < menu.indexOf('>Text<') && menu.indexOf('>Text<') < menu.indexOf('>Lines<'), 'Text sits under Theme');
  });

  it('the theme: System is the default, follows the computer while the page is open, and a stored sunset reads as Dusk; the text size defaults to Normal', () => {
    const ui = read('ui.js');
    assert.ok(ui.includes("const THEMES = ['system', 'light', 'dusk', 'dark']"));
    assert.ok(ui.includes("store.get('theme', 'system')"), 'no stored theme means System');
    assert.ok(/if \(t === 'sunset'\) return 'dusk';/.test(ui), 'a stored sunset must read as dusk');
    assert.ok(ui.includes("matchMedia('(prefers-color-scheme: dark)')") && /prefersDark\.addEventListener\('change'/.test(ui), 'System must follow the computer live');
    assert.ok(ui.includes("root.classList.remove('dark', 'dusk')"));
    assert.ok(ui.includes("store.get('textSize', 'normal')"), 'the text size defaults to Normal');
    assert.ok(/`theme \$\{state\.theme\} · Text size \$\{state\.textSize\}/.test(ui), 'the report\'s settings line carries the theme and the text size');
  });

  it('a change of text size makes every list read its row height again, and a file too long for the taller rows is refused the change', () => {
    const ui = read('ui.js');
    assert.ok(/lists\.push\(list\);/.test(ui) && /for \(const list of lists\) list\.remeasure\(\);/.test(ui), 'each list is remeasured');
    for (const name of ['recordsList', 'checksList', 'changesList', 'tagsList']) assert.ok(new RegExp(`const ${name} = Virtual\\(`).test(ui), `${name} is a Virtual list`);
    assert.ok(/rowCount\(\) \* grid\.rowHeight\(\) > MAX_PIXELS/.test(ui), 'the guard against a grid taller than a page can be');
  });

  it('no motion when the computer asks for less, and the colours the browser drops are drawn again in the system\'s own', () => {
    const css = read('style.css');
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'), css.indexOf('@media (forced-colors: active)'));
    assert.ok(/transition:\s*none !important/.test(reduce) && /animation:\s*none !important/.test(reduce), 'reduced motion must stop transitions and animations');
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
    for (const want of ['.row.is-sel', '.button[aria-pressed="true"]', '.tab[aria-selected="true"]', '.drop-line', '.cg.is-changed::before', '--focus-color',
      'Highlight', 'HighlightText', 'CanvasText', 'forced-color-adjust: none']) {
      assert.ok(forced.includes(want), `forced colors: no ${want}`);
    }
    assert.equal(forced.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|var\(--color-/g), null, 'forced colors use the system\'s colors, not the palette\'s');
    const before = css.slice(0, css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.ok(/transition:/.test(before), 'the side frames still ease when motion is allowed');
  });

  it('a _META that does not parse costs one line of ours in the console, and the page sends nothing', () => {
    const ui = read('ui.js');
    const meta = ui.slice(ui.indexOf('function metaOf'), ui.indexOf('// The rebuilt story as elements'));
    assert.ok(/getElementsByTagName\('parsererror'\)[^]*console\.info\('GEDCOM Viewer: a _META held XML that does not parse, so nothing is drawn from it\./.test(meta));
    assert.ok(/Nothing was sent anywhere\.'\);\s*return null;/.test(meta), 'then it draws nothing');
    assert.equal((ui.match(/console\.\w+\(/g) || []).length, 1, 'the only console line the page writes is that one');
  });

  it('the feedback address is on the privacy page as a mailto link whose text is the address, in the README, and in the Report a problem dialog, beside the issue route; and the policy is as it was', () => {
    const privacy = read('privacy.html');
    assert.ok(privacy.includes(`<a href="mailto:${FEEDBACK}">${FEEDBACK}</a>`), 'the mailto link must read as the address itself');
    assert.ok(/An issue is public and an email is not\./.test(privacy.replace(/\s+/g, ' ')), 'the privacy page says an issue is public and an email is not');
    assert.ok(privacy.replace(/\s+/g, ' ').includes('In an issue, write nothing you would not want public.'), 'the warning belongs to the issue');
    assert.ok(privacy.includes('github.com/bunahu/gedcom-viewer'), 'the GitHub route stays');
    const readme = read('README.md');
    assert.ok(readme.includes(FEEDBACK) && readme.includes('github.com/bunahu/gedcom-viewer/issues'), 'the README names both routes');
    const ui = read('ui.js');
    assert.equal((ui.match(/or into an email to feedback@gedcom-viewer\.net/g) || []).length, 2, 'the dialog and its Copy notice both offer the email');
    assert.equal((ui.match(/github\.com\/bunahu\/gedcom-viewer\/issues/g) || []).length, 2, 'and both still name the issue route');
    const policy = read('index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)[1];
    assert.ok(policy.includes("form-action 'none'") && policy.includes("connect-src 'none'") && !/mailto/.test(policy), 'the policy is untouched: a mailto link is a navigation');
  });

  it('the empty page is as 0.6.0 had it (0.6.3): Open GEDCOM, and under it "The file does not leave your computer." with one link, Privacy Policy, to privacy.html, and nothing else; the side frames, the counts bar and the strip are there, not hidden', () => {
    const page = read('index.html');
    const note = page.match(/<p class="empty-note">([^]*?)<\/p>/);
    assert.ok(note, 'no empty-note paragraph');
    assert.equal(note[1], 'The file does not leave your computer. <a href="privacy.html">Privacy Policy</a>');
    const empty = between(page, '<div class="empty" id="empty">', '<div class="notice"');
    assert.deepEqual([...empty.matchAll(/<(p|button)\b[^>]*>([^]*?)<\/\1>/g)].map((m) => m[2]), ['Open GEDCOM', note[1]], 'a button, and that one line');
    assert.equal((empty.match(/<a\b/g) || []).length, 1, 'one link');
    assert.ok(/<main class="work" id="work">/.test(page) && !/id="counts"[^>]*\shidden/.test(page) && !/id="strip"[^>]*\shidden/.test(page), 'no class and no attribute hides a frame, the counts bar or the strip');
    assert.ok(!/no-file|try-sample|empty-column/.test(page + read('style.css') + read('ui.js')), 'nothing of a first screen is left in the page');
  });

  it('the story\'s styles are stripped from its HTML, by core.js, right before the page reads it, so a _META that parses draws no refusal; and the What happened label says who can see what', () => {
    const ui = read('ui.js');
    assert.ok(ui.includes("parser.parseFromString(C.stripStyles(html), 'text/html')"), 'stripStyles must come right before the HTML is read');
    assert.equal((ui.match(/parseFromString\(/g) || []).length, 2, 'the page reads the XML and the story, and nothing else, in an inert document');
    assert.ok(/function stripStyles\(html\)/.test(read('core.js')), 'it is a function of core.js');
    assert.ok(ui.includes("'What happened, in your own words. An issue is public, so write nothing there you would not want seen.'"));
    assert.ok(!/What happened \u2014 /.test(ui), 'the old label, with its dash, is gone');
  });

  it('the README names no path on anyone\'s disk', () => {
    const readme = read('README.md');
    assert.ok(!/~\/Desktop|\/Users\/|\/home\//.test(readme), 'a path on one disk is in the README');
  });

  // 0.6: the bars (P9, A1 and B1), Edit on as a file opens (P10), and three cleanups from the review's item 21
  const between = (text, from, to) => {
    const a = text.indexOf(from);
    assert.ok(a >= 0, `no ${from}`);
    const b = text.indexOf(to, a + from.length);
    assert.ok(b >= 0, `no ${to} after ${from}`);
    return text.slice(a, b);
  };
  const idsIn = (html) => [...html.matchAll(/<(?:button|span|input|div)\b[^>]*\bid="([\w-]+)"/g)].map((m) => m[1]);

  it('the top bar holds the name, the file\'s name with its dot, Save and Settings, and nothing else: no icon button, no version, no Edit, Undo, Redo or Go to Line', () => {
    const page = read('index.html');
    const bar = between(page, '<header class="bar">', '</header>');
    assert.ok(!/icon-button/.test(bar), 'an icon button in the top bar');
    assert.deepEqual(idsIn(bar), ['file-name', 'dirty', 'save', 'settings', 'facts']);
    assert.ok(!/class="version"/.test(page) && !/\.version\b/.test(read('style.css')), 'the version is out of the title bar');
    assert.ok(between(bar, '<nav class="actions">', '</nav>').indexOf('id="save"') < bar.indexOf('id="settings"'), 'Save, then Settings');
  });

  it('each side frame\'s icon is in the frame it hides: the left bar\'s at the right end of its tab row, outside the tablist; the right frame\'s at the right end of a header row, after its title', () => {
    const page = read('index.html');
    const head = between(page, '<div class="side-head">', '<section class="panel"');
    assert.ok(head.indexOf('</nav>') < head.indexOf('id="hide-left"'), 'the left icon comes after the tabs');
    assert.ok(!between(head, '<nav class="tabs" role="tablist">', '</nav>').includes('hide-left'), 'and is not inside the tablist');
    const right = between(page, '<aside class="right" id="right">', '</aside>');
    const header = between(right, '<div class="frame-head">', '<div class="detail"');
    assert.ok(header.indexOf('id="frame-title"') >= 0 && header.indexOf('id="frame-title"') < header.indexOf('id="hide-right"'), 'the title, then the icon');
    assert.ok(/<div class="detail" id="detail" translate="no"><\/div>/.test(right), 'the frame\'s content under its header');
    const css = read('style.css');
    assert.ok(/\.frame-icon \{ position: absolute; right: var\(--frame-pad\); \}/.test(css), 'each icon at its frame\'s right edge, so it stays in the strip when the frame shrinks');
    const ui = read('ui.js');
    assert.ok(ui.includes("hiddenLeft: store.get('hideLeft', false) === true") && ui.includes("hiddenRight: store.get('hideRight', false) === true"), 'the stored state keeps its keys');
  });

  it('A1: a hidden side frame shrinks to a strip one icon button wide, holding its icon alone; the bars beside it do not drag', () => {
    const css = read('style.css');
    assert.ok(/--frame-shrunk: calc\(var\(--icon-button\) \+ 2 \* var\(--frame-pad\)\);/.test(css), 'one icon button wide, and the room round it');
    assert.ok(css.includes('.work.left-hidden { grid-template-columns: var(--frame-shrunk) var(--split-width) minmax(0, 1fr) var(--split-width) var(--right-width); }'));
    assert.ok(css.includes('.work.right-hidden { grid-template-columns: var(--left-width) var(--split-width) minmax(0, 1fr) var(--split-width) var(--frame-shrunk); }'));
    assert.ok(css.includes('.work.left-hidden.right-hidden { grid-template-columns: var(--frame-shrunk) var(--split-width) minmax(0, 1fr) var(--split-width) var(--frame-shrunk); }'));
    assert.ok(css.includes('.work.left-hidden .side > :not(.side-head), .work.left-hidden .tabs,\n.work.right-hidden .right > :not(.frame-head), .work.right-hidden .frame-title { visibility: hidden;'),
      'everything but the icon goes out of sight');
    assert.ok(read('ui.js').includes("if ((prop === '--left-width' && state.hiddenLeft) || (prop === '--right-width' && state.hiddenRight)) return;"), 'no drag while shrunk');
  });

  it('the strip above the lines: Top, Back and Collapse all in a group at its left; Go to Line…, Edit, Undo and Redo, in that order, in a group at its right, which wraps under the left one when the width runs out', () => {
    const page = read('index.html');
    const strip = between(page, '<div class="strip" id="strip">', '<div class="grid"');
    assert.deepEqual(idsIn(between(strip, 'id="strip-left"', 'id="strip-right"')), ['top', 'back', 'fold-all']);
    assert.deepEqual(idsIn(strip.slice(strip.indexOf('id="strip-right"'))), ['goto-box', 'goto', 'goto-go', 'goto-clear', 'edit', 'undo', 'redo']);
    assert.ok(strip.indexOf('id="strip-left"') < strip.indexOf('id="strip-right"'));
    const css = read('style.css');
    assert.ok(/\.strip \{[^}]*flex-wrap: wrap;[^}]*\}/.test(css) && /\.strip-group \{[^}]*flex-wrap: wrap;/.test(css), 'the strip wraps its groups, and a group its controls: nothing is clipped');
    assert.ok(/\.strip-end \{ margin-left: auto;/.test(css), 'the right group keeps to the right, under the left one when it wraps');
    assert.ok(/\.middle \{[^}]*display: flex; flex-direction: column; \}/.test(css) && /\.grid \{\s*position: relative;\s*flex: 1;/.test(css),
      'the lines start where the strip ends, however tall it grows: nothing overlaps them');
  });

  it('Go to Line…, Edit, Undo, Redo and Save are hidden, not disabled, until a file is open; Save is disabled too until there is something to save', () => {
    const page = read('index.html');
    for (const id of ['goto-box', 'edit', 'undo', 'redo', 'save']) assert.ok(/\shidden[\s>]/.test(tagOf(page, id)), `#${id} is not hidden before a file is open: ${tagOf(page, id)}`);
    for (const id of ['goto', 'edit', 'undo', 'redo']) assert.ok(!/\sdisabled[\s>]/.test(tagOf(page, id)), `#${id} is disabled in the markup; hidden is the rule now: ${tagOf(page, id)}`);
    assert.ok(/\sdisabled[\s>]/.test(tagOf(page, 'save')), 'Save is disabled until there is something to save');
    const ui = read('ui.js');
    assert.ok(ui.includes("for (const id of ['goto-box', 'edit', 'undo', 'redo', 'save']) $(id).hidden = !doc;"), 'shown when a file is open, hidden when none is');
    assert.ok(!/\$\('(?:goto|edit)'\)\.disabled/.test(ui), 'nothing disables Go to Line or Edit any more');
    assert.ok(ui.includes("$('save').disabled = !changed;") && ui.includes("$('undo').disabled = !doc || !doc.done.length;"), 'Save, Undo and Redo are still off when there is nothing for them');
    assert.ok(/\.goto-box\[hidden\] \{ display: none; \}/.test(read('style.css')), 'the box\'s own display must not undo hidden');
  });

  it('the keys do not change: E, ⌘Z, ⇧⌘Z, ⌘L, ⌘S, ⌘O, ⌘F', () => {
    const ui = read('ui.js');
    for (const want of ["if (mod && !e.shiftKey && !e.altKey && key === 's') {", "if (mod && !e.shiftKey && !e.altKey && key === 'o') {",
      "if (mod && !e.shiftKey && !e.altKey && (key === 'f' || key === 'l')) {", "if (mod && !e.altKey && key === 'z') {", "if (e.shiftKey) doRedo(); else doUndo();",
      "} else if (key === 'e' && !e.shiftKey) {"]) {
      assert.ok(ui.includes(want), `a key is gone: ${want}`);
    }
  });

  it('B1: the right frame\'s title is the line it shows, as the number column writes it, or the lines in hand: a Go to Line range, or a selected line whose block is shut', () => {
    const ui = read('ui.js');
    const fn = between(ui, 'function frameTitle(i) {', 'function renderDetail()');
    assert.ok(fn.includes('const span = (a, b) => (a === b ? `Line ${fmt(a + 1)}` : `Lines ${fmt(a + 1)}-${fmt(b + 1)}`);'), 'Line 66, Lines 23-31, with the numbers as the number column has them');
    assert.ok(fn.indexOf('if (state.range)') < fn.indexOf('if (isShut(i))'), 'a range in force is what is in hand, before a shut block');
    assert.ok(fn.includes('return span(i, C.subtreeEnd(m, i) - 1);'), 'a shut block: the line through the last line it hides');
    const render = between(ui, 'function renderDetail() {', 'const typing =');
    assert.ok(render.indexOf("$('frame-title').textContent = '';") < render.indexOf('renderHelp(d, state.help)') && render.indexOf("$('frame-title').textContent = frameTitle(i);") > render.indexOf('if (!m || i < 0 || i >= m.n) return;'),
      'no title for a check\'s meaning, a removed line, or no line selected');
  });

  it('P10: Edit is on whenever a file opens, and while it is on the lines take a darker look of their own; the README says so', () => {
    const ui = read('ui.js');
    const open = between(ui, 'async function openFile(file, handle) {', 'async function pickFile()');
    assert.ok(open.includes('state.editing = true;') && !open.includes('state.editing = false'), 'a file opens with Edit on');
    assert.ok(ui.includes("$('middle').classList.toggle('is-edit-on', !!doc && state.editing);"));
    const css = read('style.css');
    assert.ok(css.includes('.middle.is-edit-on { --lines-bg: var(--editing-bg); --row-selected: var(--editing-selected); }'), 'Edit on: the lines\' background is the editing look, the selected line its own wash');
    for (const b of K.blocksOf(css).filter((x) => [':root', '.dusk', '.dark'].includes(x.selector) && x.props.has('--color-bg'))) {
      assert.ok(/^#[0-9a-f]{6}$/.test(b.props.get('--editing-bg') || ''), `${b.selector} has no editing look of its own`);
    }
    const readme = read('README.md').replace(/\s+/g, ' ');
    assert.ok(!/Edit is off whenever a file opens|it is off whenever a file opens/.test(readme), 'the README still says Edit is off when a file opens');
    assert.ok(readme.includes('Edit is on whenever a file opens.') && readme.includes('it is on whenever a file opens'));
  });

  it('the delete question names what goes (core.deleteQuestion), a record\'s label shown as labels are, a line\'s text with its marks', () => {
    const ui = read('ui.js');
    const del = between(ui, 'async function deleteSelected() {', '// 9.3');
    assert.ok(del.includes('dialog((title) => putQuestion(title, C.deleteQuestion(m, i)),'), 'the question comes from core.js');
    const put = between(ui, 'function putQuestion(parent, parts) {', '// A dialog:');
    assert.ok(put.includes("if (p.as === 'label') putLabel(parent, p.text);") && put.includes("else if (p.as === 'line') putText(parent, p.text);"));
    assert.ok(between(ui, 'function dialog(title, fill, buttons) {', 'const body').includes("if (typeof title === 'function') title(heading); else heading.textContent = title;"));
  });

  it('Tags: the order button reads Sort beside its icon, aria-label Sort, and names the order in force in its hover text alone', () => {
    const page = read('index.html');
    const tag = tagOf(page, 'tags-order');
    assert.ok(/aria-label="Sort"/.test(tag) && !/title="/.test(tag), `the button: ${tag}`);
    assert.ok(/<\/svg>Sort<\/button>/.test(between(page, 'id="tags-order"', '</div>')), 'the word Sort, after the icon');
    const ui = read('ui.js');
    assert.ok(ui.includes("const TAG_ORDER_NAMES = ['by count', 'by count rising', 'A to Z', 'Z to A'];"));
    assert.ok(ui.includes("function updateTagsOrder() { $('tags-order').title = TAG_ORDER_NAMES[state.tagsOrder]; }"));
    assert.ok(/updateTagsOrder\(\);\n {2}openPanel\('records'\);/.test(ui), 'named as the page starts');
  });

  // 0.6.0, from the owner's walk of 0.6: the right frame, and the way back from Search to Tags
  it('the right frame offers three buttons, Add line under, Add line after and Delete line, with their hover texts; Edit line and Delete record are gone', () => {
    const ui = read('ui.js');
    const acts = between(ui, '// what can be done to it, with Edit on (0.6.0)', 'd.appendChild(acts);');
    const labels = [...acts.matchAll(/actionButton\(acts, '([^']+)'/g)].map((x) => x[1]);
    assert.deepEqual(labels, ['Add line under', 'Add line after', 'Delete line']);
    assert.ok(acts.includes("actionButton(acts, 'Add line under', 'A new line directly under this one, one level deeper', () => startAdd('inside'));"));
    assert.ok(acts.includes("actionButton(acts, 'Add line after', 'A new line after this block, at this line\\'s level', () => startAdd('after'));"));
    for (const gone of ["'Edit line'", "'Delete record'", "'Add inside'", "'Add after'"]) assert.ok(!ui.includes(gone), `ui.js still offers ${gone}`);
    assert.ok(/\.detail-actions \{ display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 16px; \}/.test(read('style.css')), 'one row under the title, with room above and below');
  });

  it('Delete line on a record\'s first line deletes the record, with the pointers elsewhere shown first and the question naming the record; ⌫ keeps its meaning', () => {
    const ui = read('ui.js');
    assert.ok(ui.includes('() => (record ? deleteRecordAsked() : deleteSelected())'), 'the button: the record on its first line, the line elsewhere');
    assert.ok(ui.includes('const isRecordLine = (i) => state.m.recOf[i] >= 0 && state.m.records[state.m.recOf[i]] === i;'));
    const asked = between(ui, 'async function deleteRecordAsked() {', 'afterAct(plan.from);');
    assert.ok(asked.includes('dialog((title) => putQuestion(title, C.deleteQuestion(m, plan.from)),'), 'the question names the record as the delete question does');
    assert.ok(asked.includes('The lines elsewhere that point at it:') && asked.includes("box.checked = p.ticked;"), 'the same preview of the pointers elsewhere, ticked');
    assert.ok(/\} else if \(key === 'Backspace' \|\| key === 'Delete'\) \{\s+e\.preventDefault\(\);\s+deleteSelected\(\);/.test(ui), '⌫ deletes the line and the lines under it, as before');
  });

  it('the right frame\'s path: core.linePath\'s parts, each a link that selects its line; "Under it" with the first line under and how many more; no "in" line', () => {
    const ui = read('ui.js');
    const render = between(ui, 'function renderDetail() {', '// ---');
    assert.ok(render.includes('const path = C.linePath(m, i);') && render.includes("sec.appendChild(el('span', 'path-word', 'Under it: '));")
      && render.includes("sec.appendChild(el('span', 'path-word', ` and ${fmt(path.under.more)} more`));"));
    assert.ok(!render.includes("document.createTextNode('in ')"), 'the "in" line is gone');
    assert.ok(between(ui, 'function pathLink(parent, line) {', 'function putStep').includes("b.addEventListener('click', () => { select(line, 'jump'); chosenIn('right'); });"), 'each part selects its line, and Back returns');
    assert.ok(/function linePath\(m, i\)/.test(read('core.js')) && /function pathName\(m, r, depth = 0\)/.test(read('core.js')), 'the wording is core.js\'s, held by tests/screen.test.js');
  });

  it('Tags to Search and back: a tag clicked shows Back to Tags at the head of Search; it, or Esc in the search box, returns to the list as it was; a search of one\'s own takes it away; the order is not touched', () => {
    const page = read('index.html');
    const panel = between(page, '<section class="panel" id="panel-search"', '</section>');
    assert.ok(/<button class="button search-back" id="search-back" type="button" hidden>← Back to Tags<\/button>/.test(panel), 'the button, hidden until a tag is clicked');
    assert.ok(panel.indexOf('id="search-back"') < panel.indexOf('class="panel-head"'), 'at the head of the panel');
    const ui = read('ui.js');
    const click = between(ui, "$('tags-list').addEventListener('click', (e) => {", '});');
    assert.ok(click.includes("fromTags = { top: $('tags-list').scrollTop };") && click.includes("$('search-back').hidden = false;"));
    assert.ok(!/tagsOrder|renderTags|TAG_ORDERS/.test(click), 'going to Search never touches the list\'s order');
    assert.ok(between(ui, 'function backToTags() {', '}\n').includes("openPanel('tags');") && ui.includes("if (was) $('tags-list').scrollTop = was.top;"), 'back to the list, at its place');
    assert.ok(ui.includes("if (e.target === $('search-box') && fromTags) backToTags();"), 'Esc in the search box, when the search came from Tags');
    assert.equal((ui.match(/leaveTagsSearch\(\);/g) || []).length, 5, 'the way back goes for a search of one\'s own (typed, Tag turned), a file opened or refused, and once it is taken');
  });

  it('the version is out of the title bar and at the foot of the Settings menu, "Version 0.6.3", in three parts, centred, written once; the problem report reads it there; the README has a row for it', () => {
    const page = read('index.html');
    const menu = page.slice(page.indexOf('id="settings-menu"'), page.indexOf('</div>\n\n<nav class="counts"'));
    const foot = menu.match(/<div class="menu-foot">Version <span id="version">(\d+\.\d+\.\d+)<\/span><\/div>\s*$/);
    assert.ok(foot, 'no version line, three parts, at the foot of the Settings menu');
    assert.equal(foot[1], '0.6.3');
    assert.ok(/\.menu-foot \{[^}]*text-align: center;/.test(read('style.css')), 'the line is centred');
    assert.ok(menu.lastIndexOf('class="menu-row"') < menu.indexOf('class="menu-foot"'), 'at its foot');
    assert.equal((page.match(/\bid="version"/g) || []).length, 1, 'the version is written once');
    const ui = read('ui.js');
    assert.ok(ui.includes("const version = $('version').textContent;") && !ui.includes("querySelector('.version')"), 'the report reads it from the same place');
    assert.ok(read('README.md').includes(`\n| ${foot[1]} | `), `the README's version table has no row for ${foot[1]}`);
  });

  // 0.6.1: the drawers, and P11 as picked (D1): after a save the page is on the copy
  it('the drawers: below --drawer-right-below the right frame lies over the lines, below --drawer-left-below the left bar too, their columns gone; ui.js reads the two widths from style.css; a drawer is shut as a file opens, when a line is chosen in it, and on Esc; nothing of it is stored', () => {
    const css = read('style.css');
    const own = ownProps(css);
    assert.deepEqual([own.get('--drawer-right-below'), own.get('--drawer-left-below')], ['1100px', '800px']);
    assert.ok(css.includes('.work.right-drawer { grid-template-columns: var(--left-width) var(--split-width) minmax(0, 1fr) 0 0; }'));
    assert.ok(css.includes('.work.left-drawer { grid-template-columns: 0 0 minmax(0, 1fr) 0 0; }'));
    assert.ok(css.includes('.work.right-drawer .right, .work.left-drawer .side { grid-column: auto; position: absolute; top: 0; z-index: 6; }'), 'over the lines, which keep the whole width');
    assert.ok(css.includes('.work.right-drawer .strip { padding-right: var(--frame-shrunk); }') && css.includes('.work.left-drawer .strip { padding-left: var(--frame-shrunk); }'),
      'shut, a drawer is its icon at the strip\'s end, in room the strip leaves for it');
    assert.ok(/\.side \{ grid-column: 1; \}\n#split-left \{ grid-column: 2; \}\n\.middle \{ grid-column: 3; \}\n#split-right \{ grid-column: 4; \}\n\.right \{ grid-column: 5; \}/.test(css), 'each part in its own column');
    const ui = read('ui.js');
    assert.ok(ui.includes("right: window.matchMedia(`(width < ${pxOf('--drawer-right-below')}px)`),") && ui.includes("left: window.matchMedia(`(width < ${pxOf('--drawer-left-below')}px)`),"));
    assert.ok(between(ui, 'async function openFile(file, handle) {', 'async function pickFile()').includes('state.drawer = null;'), 'shut as a file opens, whatever is stored');
    const toggle = between(ui, 'function toggleFrame(side) {', 'function setDrawer');
    assert.ok(toggle.indexOf('if (isDrawer(side)) {') < toggle.indexOf("store.set('hideLeft'"), 'a drawer opens and shuts before anything is stored, and nothing of it is');
    assert.ok(between(ui, 'function applyFrames() {', 'function toggleFrame').includes("w.classList.toggle('right-hidden', !drawer.right && state.hiddenRight);"), 'the stored state counts only where the frame is a column');
    for (const [where, from] of [['Records', "$('records-list').addEventListener('click'"], ['Checks', "$('checks-list').addEventListener('click'"],
      ['Changes', "$('changes-list').addEventListener('click'"], ['Tags', "$('tags-list').addEventListener('click'"]]) {
      assert.ok(between(ui, from, '});').includes("chosenIn('left');"), `a line chosen in ${where} shuts the left drawer`);
    }
    assert.ok(ui.includes("$('search-next').addEventListener('click', () => { stepSearch(1); chosenIn('left'); });"), 'and Search\'s next line');
    assert.ok(ui.includes("row.addEventListener('click', () => { select(j, 'jump'); chosenIn('right'); });") && ui.includes("link.addEventListener('click', () => { jumpToId(value); chosenIn('right'); });"), 'a line chosen in the right frame shuts its drawer');
    assert.ok(ui.includes("if (key === 'Escape' && state.drawer) {"), 'Esc shuts an open drawer');
    assert.ok(!/store\.set\('drawer/.test(ui), 'never stored');
  });

  it('P11, D1: after a save the page is on the copy: its name in the chip, its facts, its handle where the next save opens, the visit\'s files refused; a download the same, with no handle; leaving warns for what no file holds', () => {
    const ui = read('ui.js');
    const saving = between(ui, 'async function saveNow() {', '// P11, D1');
    assert.ok(saving.includes('const r = await S.save({ doc: state.doc, file: { name: state.fileName, handle: state.handle }, visit: state.visit,') && saving.includes('if (r.done) onTheCopy(r);'));
    const on = between(ui, 'function onTheCopy(r) {', '// 10.2 step 6');
    for (const want of ['state.fileName = r.name;', 'state.handle = r.handle;', 'state.disk = { sha256: r.sha256, bytes: r.size, lines: lines.length };',
      'state.visit.push({ name: r.name, handle: r.handle, bytes: () => C.saveBytes(doc, undefined, lines) });', "$('file-name').textContent = r.name;"]) {
      assert.ok(on.includes(want), `onTheCopy: ${want}`);
    }
    assert.ok(between(ui, 'async function openFile(file, handle) {', 'async function pickFile()').includes('state.visit = [{ name: file.name, handle: state.handle, bytes: () => doc.m.bytes }];'), 'the visit begins with the file opened');
    assert.ok(ui.includes("[{ label: 'Close', value: '' }, { label: `Download ${r.restoreName}`, value: 'get', primary: true }]"), 'a file of the visit that could not be put back is offered under its own name');
    assert.ok(/window\.addEventListener\('beforeunload', \(e\) => \{\s+if \(state\.doc && C\.unsaved\(state\.doc\)\)/.test(ui), 'leaving warns for lines no file of the visit holds');
    const saveJs = read('save.js');
    assert.equal((saveJs.match(/core\.moveOntoCopy\(doc\);/g) || []).length, 2, 'a copy written and a download each move the page onto the copy');
    assert.ok(saveJs.includes('for (let k = 0; k < kept.length; k += 1) {') && saveJs.includes('const before = await Promise.all(kept.map('), 'every file of the visit read before the dialog, and refused after it');
  });

  // 0.6.2 (P12): the table of tags in the page

  it('0.6.2: the table loads before the code that reads it, and core.js asks for it the way save.js asks for core.js, under Node and in the page', () => {
    const page = read('index.html');
    assert.ok(page.indexOf('<script src="tags.js"') > 0 && page.indexOf('<script src="tags.js"') < page.indexOf('<script src="core.js"'));
    const core = read('core.js');
    assert.ok(core.includes("module.exports = factory(require('./tags.js'));") && core.includes('else root.GedCore = factory(root.GedTags);'));
    assert.ok(core.includes('})(typeof self !== \'undefined\' ? self : this, function (tags) {'));
    assert.ok(read('tags.js').includes('else root.GedTags = factory();'), 'the table sets the global core.js reads');
    assert.ok(/\| `tags\.js` \|[^\n]*5\.5\.1[^\n]*5\.5\.5[^\n]*7\.0[^\n]*Apache[^\n]*notice[^\n]*header/.test(read('README.md')), 'the README\'s Files table: the standards it came from, and the 7.0 text\'s licence and notice');
    assert.ok(read('privacy.html').includes("The page's six files hold no code that fetches"), 'privacy.html counts six files');
  });

  it('0.6.2: a tag the table finds wanting has a wavy line under it, red for E10 and gold for N8 and N9, as properties at the top of style.css, and the finding\'s words as its hover text', () => {
    const css = read('style.css');
    const top = css.slice(0, css.indexOf('/* -------'));
    assert.ok(/--wave-error: var\(--mark-error\);/.test(top) && /--wave-note: var\(--mark-note\);/.test(top) && /--wave-width: [\d.]+px;/.test(top) && /--wave-offset: [\d.]+px;/.test(top), 'the colours are the dots\', and the thickness and the offset are properties');
    const rule = css.match(/\.tg\.is-wave-error, \.tg\.is-wave-note \{([^}]*)\}/);
    assert.ok(rule && /text-decoration-style: wavy;/.test(rule[1]) && /text-decoration-thickness: var\(--wave-width\);/.test(rule[1]) && /text-underline-offset: var\(--wave-offset\);/.test(rule[1]), 'a wavy line');
    assert.ok(!/(padding|margin|height|border|display)/.test(rule[1]), 'it takes no room: the rows keep their height, and the number column its width');
    assert.ok(/\.tg\.is-wave-error \{ text-decoration-color: var\(--wave-error\); \}/.test(css) && /\.tg\.is-wave-note \{ text-decoration-color: var\(--wave-note\); \}/.test(css));
    const ui = read('ui.js');
    assert.ok(ui.includes("const TAG_WAVES = { E10: 'is-wave-error', N8: 'is-wave-note', N9: 'is-wave-note' };"), 'red for E10, gold for N8 and N9');
    assert.ok(between(ui, 'function paintRow(row, k) {', 'function markTag').includes('markTag(row, i);'), 'a row marks its tag');
    const mark = between(ui, 'function markTag(row, i) {', 'function paintExtra');
    assert.ok(mark.includes("row.querySelector('.tg')") && mark.includes('tg.title = said.detail;') && mark.includes('tg.classList.add(TAG_WAVES[said.code]);'), 'the tag\'s own hover text is the finding\'s words');
  });

  it('0.6.2 (M3): the meaning is in the right frame alone: one line under the selected line\'s tag, above its value; no hover text on the lines but the findings\', and nothing in the Tags list', () => {
    const ui = read('ui.js');
    assert.equal((ui.match(/C\.tagMeaning\(/g) || []).length, 1, 'asked for in one place');
    const detail = between(ui, 'function renderDetail() {', 'const was = state.changeAt.get(i);');
    const head = detail.indexOf('d.appendChild(head);');
    const said = detail.indexOf("C.tagMeaning(live ? shape.tag : m.tag[i], m.tagVersion, m.schema)");
    assert.ok(head > 0 && said > head && detail.indexOf("el('div', 'detail-meaning', said)") > said, 'under the tag');
    assert.ok(detail.indexOf("const box = el('div', 'detail-value');", said) > said, 'and above the value');
    assert.ok(!between(ui, 'function paintRow(row, k) {', 'function markTag').includes('.title'), 'a row gets its hover text in one place, markTag, and only for a finding');
    assert.ok(!between(ui, "const tagsList = Virtual($('tags-list')", '});').includes('meaning'), 'the Tags list stays a list of tags and counts');
    assert.ok(/\.detail-meaning \{[^}]*color: var\(--color-text-muted\);/.test(read('style.css')));
  });

  it('0.6.2: Checks lists E10, N8 and N9 as it lists the others, each with its explanation, and N8 says which tag and which parent', () => {
    const ui = read('ui.js');
    const help = between(ui, 'const CHECK_HELP = {', '  };\n  let drag');
    for (const code of ['E10', 'N8', 'N9']) assert.ok(new RegExp(`\\n    ${code}: "`).test(help), `${code} has its explanation`);
    for (const code of core.CHECKS.map((c) => c.code)) assert.ok(new RegExp(`\\n    ${code}: [\"']`).test(help), `${code} has an explanation`);
    assert.ok(ui.includes("const SAYS_WHAT = new Set(['E4', 'E9', 'N6', 'N7', 'N8']);"), 'N8\'s own words show in Checks and in the right frame');
    const text = help.replace(/\s+/g, ' ');
    assert.ok(!/\u2014|\u00b7/.test(help.slice(help.indexOf('E10: "'))), 'no dash and no middle dot in the new explanations');
    assert.ok(text.includes('FAM9') && text.includes('BIRT under a FAM') && text.includes('SCHMA'), 'each in its own words');
  });
  it('0.6.2: a title in Checks that is longer than its row goes on a second line, so every title shows whole: the head row says the check\'s own name, a long title makes a wrapped row whose height the list is told, and only the Checks list takes rows of different heights', () => {
    const ui = read('ui.js');
    const css = read('style.css');
    const paint = between(ui, "const checksList = Virtual($('checks-list'), (row, k) => {", '  }, undefined, {');
    const head = paint.slice(0, paint.indexOf('const f = item.f;'));
    assert.ok(head.includes("el('span', 'main', c.name)") && !/\.slice\(|substring|substr\(/.test(head), 'the title is the check\'s name, whole, never a cut one');
    assert.ok(head.includes("row.className = `item is-head is-${c.kind}${linesOfCheckRow(k) > 1 ? ' is-wrapped' : ''}`;"), 'a title of more than one line makes a wrapped row');
    const count = between(ui, 'function measureTitles() {', 'const linesOfCheckRow');
    assert.ok(count.includes("'item is-head is-wrapped is-ruler'") && count.includes('title.getBoundingClientRect().height / line') && count.includes('checksList.mount(ruler)'),
      'the lines a title takes are counted by a head row laid out out of sight, at the list\'s width');
    assert.ok(ui.includes('function Virtual(scroller, paint, style, tall) {'), 'a list may be told its rows hold more than one line');
    assert.equal((ui.match(/\}, undefined, \{ measure:/g) || []).length, 1, 'and only the Checks list is');
    assert.ok(ui.includes('{ measure: measureTitles, any: () => [...titleLines.values()].some((k) => k > 1), lines: linesOfCheckRow }'));
    const layout = between(ui, '    function layout() {', '    scroller.addEventListener(\'scroll\', draw');
    assert.ok(layout.includes("if (scroller.clientWidth > 0) tall.measure();") && layout.indexOf('tall.measure()') < layout.indexOf('new Float64Array(count + 1)'), 'counted at the width the list has, before the rows are laid out');
    const rule = (css.match(/\.item\.is-head\.is-wrapped \{([^}]*)\}/) || [])[1] || '';
    assert.ok(/align-items: flex-start;/.test(rule) && /line-height: var\(--list-line-height\);/.test(rule) && /box-sizing: border-box;/.test(rule)
      && /padding-top: calc\(\(var\(--list-row-height\) - var\(--list-line-height\)\) \/ 2\);/.test(rule), 'the first line stays where a row of one line has it, and the count stays level with it');
    assert.ok(/\.item\.is-head\.is-wrapped \.main \{[^}]*white-space: normal;[^}]*text-overflow: clip;/.test(css), 'the title wraps instead of ending in an ellipsis');
    assert.ok(/\.item\.is-ruler \{[^}]*visibility: hidden;/.test(css), 'the head row that counts is never seen');
    const props = css.slice(0, css.indexOf('/* -------'));
    assert.ok(/--list-line-height: 20px;/.test(props) && /\.text-larger \{[^}]*--list-line-height: 24px;/.test(props), 'a line is a property, for both sizes of text');
    assert.ok(/\| `--list-line-height` \|/.test(read('README.md')), 'and the README lists it');
  });
});
