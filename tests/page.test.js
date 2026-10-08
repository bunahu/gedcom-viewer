// The page's own files: what it loads, in what order, that none of them can reach the network
// (I5), and that the page tells the browser to enforce it (0.5.2).
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
      // the one allowance: index.html lets styles be inline, since Chrome styles its own XML parse-error block
      // inline in the inert document a malformed _META is read in; a style can reach nothing outside the page
      const allowed = name === 'index.html' ? policy.replace("style-src 'self' 'unsafe-inline';", "style-src 'self';") : policy;
      assert.ok(!/unsafe|http|data:|blob:|\*/.test(allowed), `${name}: a hole in the policy: ${policy}`);
      if (name === 'index.html') assert.ok(/script-src 'self';/.test(policy), `${name}: scripts must be the page's own alone: ${policy}`);
      else assert.ok(!/script-src/.test(policy), `${name}: no script at all, so no script-src: ${policy}`);
      assert.ok(page.indexOf('<meta http-equiv="Content-Security-Policy"') < page.indexOf('<link'), `${name}: the policy must come before anything the page loads`);
    }
  });

  it('privacy.html holds no script and loads only style.css and the icons; its links out go to GitHub alone; favicon.svg holds nothing but shapes', () => {
    const privacy = read('privacy.html');
    assert.equal(privacy.match(/<script\b/g), null, 'a script in privacy.html');
    const out = loads(privacy).filter((u) => u.includes('://'));
    assert.ok(out.length > 0 && out.every((u) => /^https:\/\/(docs\.)?github\.com\//.test(u)), `a link out that is not GitHub's: ${out}`);
    assert.deepEqual(loads(privacy).filter((u) => !u.includes('://')),
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
});
