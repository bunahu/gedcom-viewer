// The page's own files: what it loads, in what order, that none of them can reach the network
// (I5), and that the page tells the browser to enforce it (0.5.2).
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.js');
const K = require('./contrast.js');

const PAGE = ['index.html', 'style.css', 'core.js', 'save.js', 'ui.js'];
const FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'import(', '@import',
  'url(http', 'http://', 'https://'];
const read = (name) => fs.readFileSync(path.join(h.ROOT, name), 'utf8');
const FEEDBACK = 'feedback@gedcom-viewer.net';
const loads = (page) => [...page.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]);

describe('the page', () => {
  it('index.html loads style.css and the icons, then core.js, save.js and ui.js as classic scripts, in that order; links privacy.html; and nothing else', () => {
    const page = read('index.html');
    assert.deepEqual([...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]),
      ['<script src="core.js" charset="utf-8">', '<script src="save.js" charset="utf-8">', '<script src="ui.js" charset="utf-8">']);
    assert.deepEqual(loads(page),
      ['style.css', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'privacy.html', 'core.js', 'save.js', 'ui.js']);
    assert.ok(!/type="module"/.test(page), 'no modules: a page opened from disk may not import one');
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
      tagsOrder: 'Tags list\'s order', stamps: 'change stamps', facts: 'file\'s facts show' };
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
    assert.ok(privacy.includes('<h2>How to check it yourself</h2>'));
    assert.ok(privacy.includes('refuse requests, images, fonts and scripts from anywhere else'));
  });

  it('Save in place, refused a folder, says which folders Chrome refuses and what to do instead', () => {
    const ui = read('ui.js');
    const grant = ui.slice(ui.indexOf('async function grantFolder'), ui.indexOf('// 10.2 step 3 refused'));
    assert.ok(grant.includes("e.name === 'AbortError'"));
    for (const words of ['Downloads', 'Desktop', 'Documents', 'home folder', 'a folder of its own', 'Save a copy']) {
      assert.ok(grant.includes(words), `the refused-folder notice does not say "${words}"`);
    }
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

  it('the line under Open GEDCOM reads "The file does not leave your computer." with a Privacy Policy link to privacy.html', () => {
    const page = read('index.html');
    const note = page.match(/<p class="empty-note">([^]*?)<\/p>/);
    assert.ok(note, 'no empty-note paragraph');
    assert.equal(note[1], 'The file does not leave your computer. <a href="privacy.html">Privacy Policy</a>');
  });

  it('the README names no path on anyone\'s disk', () => {
    const readme = read('README.md');
    assert.ok(!/~\/Desktop|\/Users\/|\/home\//.test(readme), 'a path on one disk is in the README');
  });
});
