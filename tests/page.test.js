// The page's own files: what it loads, in what order, and that none of them can reach the
// network (I5).
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.js');

const PAGE = ['index.html', 'style.css', 'core.js', 'save.js', 'ui.js'];
const FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'import(', '@import',
  'url(http', 'http://', 'https://'];
const read = (name) => fs.readFileSync(path.join(h.ROOT, name), 'utf8');

describe('the page', () => {
  it('index.html loads style.css, then core.js, save.js and ui.js as classic scripts, in that order, and nothing else', () => {
    const page = read('index.html');
    assert.deepEqual([...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]),
      ['<script src="core.js" charset="utf-8">', '<script src="save.js" charset="utf-8">', '<script src="ui.js" charset="utf-8">']);
    assert.deepEqual([...page.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]), ['style.css', 'core.js', 'save.js', 'ui.js']);
    assert.ok(!/type="module"/.test(page), 'no modules: a page opened from disk may not import one');
  });

  it('no file of the page can reach the network — no exceptions', () => {
    for (const name of PAGE) {
      const text = read(name);
      for (const word of FORBIDDEN) assert.ok(!text.includes(word), `${name} holds "${word}"`);
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
});
