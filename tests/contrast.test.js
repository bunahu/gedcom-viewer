// Contrast (WCAG 2.2 AA), measured from style.css as text: the three palette blocks are read, each
// pair's tokens are resolved for each theme, and the ratio is computed (tests/contrast.js). A
// token written as color-mix(in srgb, X n%, transparent) is X at n% alpha over what it sits on.
// Text needs 4.5:1 (1.4.3); the ring round a control, and a control's edge, need 3:1 (1.4.11).
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.js');
const K = require('./contrast.js');

const css = fs.readFileSync(path.join(h.ROOT, 'style.css'), 'utf8');
const THEMES = [['Light', null], ['Dusk', 'dusk'], ['Dark', 'dark']];

// The three backgrounds the palette sets: the frames and bars (card), the left bar, the boxes.
const CARD = ['--color-bg-card'];
const SIDE = ['--color-bg-sidebar'];
const BOX = ['--color-bg'];
const BASES = [CARD, SIDE, BOX];
const label = (layers) => layers.map((t) => t.replace(/^--(color-bg-)?/, '')).join(' + ');

// Every token in `fg` against every background in `on`, in all three themes.
function holds(fg, on, min, themes = THEMES) {
  const short = [];
  for (const [name, cls] of themes) {
    for (const layers of on) {
      const r = K.ratio(css, cls, fg, layers);
      if (r < min) short.push(`${name}: ${fg} on ${label(layers)} is ${r.toFixed(2)}, needs ${min}`);
    }
  }
  assert.deepEqual(short, []);
}

describe('contrast, measured from style.css', () => {
  it('the helper: black on white is 21:1, a colour on itself 1:1, color-mix is alpha over the background', () => {
    const fake = ':root { --a: #000000; --b: #ffffff; --c: color-mix(in srgb, var(--a) 50%, transparent); --d: var(--b); }';
    assert.equal(K.ratioOf(K.colour(K.propsOf(fake, null), '--a'), K.colour(K.propsOf(fake, null), '--d')), 21);
    assert.equal(K.ratio(fake, null, '--b', ['--d']), 1);
    const mid = K.layered(K.propsOf(fake, null), ['--b', '--c']);
    assert.equal(Math.round(mid.r), 128);
    const themed = ':root { --a: #111111; } .dark { --a: #eeeeee; } :root { --b: var(--a); }';
    assert.equal(K.colour(K.propsOf(themed, 'dark'), '--b').r, 0xee);
    assert.equal(K.colour(K.propsOf(themed, null), '--b').r, 0x11);
  });

  it('the three palette blocks are :root (Light), .dusk and .dark; Sunset is Dusk, and no rule is left for it', () => {
    const selectors = K.blocksOf(css).map((b) => b.selector);
    assert.deepEqual(selectors.filter((s) => s !== ':root').sort(), ['.dark', '.dusk', '.text-larger']);
    assert.ok(!/sunset/i.test(css), 'style.css still says sunset');
  });

  it('the focus ring: 3:1 on the three backgrounds, on a hovered and on a pressed control, in every theme (1.4.11)', () => {
    const on = [];
    for (const base of BASES) on.push(base, [...base, '--hover-bg'], [...base, '--pressed-bg']);
    holds('--focus-color', on, 3);
  });

  it('the rules draw the ring from --focus-color, and --focus-ring is the one outline the controls use', () => {
    assert.ok(/--focus-ring:\s*2px solid var\(--focus-color\);/.test(css), '--focus-ring must be built from --focus-color');
    const rules = css.slice(css.indexOf('/* -------'));
    const outlines = [...rules.matchAll(/(?<![-\w])outline:\s*([^;}]+)/g)].map((m) => m[1].trim());
    assert.ok(outlines.length > 0 && outlines.every((o) => o === 'var(--focus-ring)' || o === 'none'), `an outline that is not the focus ring: ${outlines}`);
  });

  it('a note count, in a tab or a list: 4.5:1 on the left bar, the frames and the boxes; in Light, also on a hovered and a selected tab', () => {
    holds('--mark-note', BASES, 4.5);
    holds('--mark-note', [[...SIDE, '--hover-bg'], [...SIDE, '--pressed-bg']], 4.5, [THEMES[0]]);
  });

  it('an error count, in a tab or a list: 4.5:1 on the left bar, the frames and the boxes; in Light, also on a hovered and a selected tab', () => {
    holds('--mark-error', BASES, 4.5);
    holds('--mark-error', [[...SIDE, '--hover-bg'], [...SIDE, '--pressed-bg']], 4.5, [THEMES[0]]);
    holds('--raw-color', BASES, 4.5);
  });

  it('record ids such as @I1@: 4.5:1 on the lines\' background and on a box; in Light, also on a selected line', () => {
    holds('--id-color', [CARD, BOX], 4.5);
    holds('--id-color', [[...CARD, '--row-selected']], 4.5, [THEMES[0]]);
  });

  it('muted text: 4.5:1 on the left bar, the frames and the boxes', () => {
    holds('--color-text-muted', BASES, 4.5);
  });

  it('the edge of an input and of a button: 3:1 on the three backgrounds (1.4.11)', () => {
    holds('--control-border', BASES, 3);
  });

  it('inputs, buttons and the report box take that edge; the quieter lines between parts keep --color-border', () => {
    const rules = css.slice(css.indexOf('/* -------'));
    const body = (selector) => {
      const at = rules.indexOf(`\n${selector} {`);
      assert.ok(at >= 0, `no rule for ${selector}`);
      return rules.slice(at, rules.indexOf('}', at));
    };
    for (const selector of ['.button', '.input', '.report']) {
      assert.ok(/border:\s*1px solid var\(--control-border\)/.test(body(selector)), `${selector} must take --control-border`);
    }
    assert.ok(/--split-color:\s*var\(--color-border\)/.test(css), 'the bars you drag keep --color-border');
  });

  it('the text colour holds 4.5:1 on the three backgrounds and on the selected line, so the gold stays a fill behind it', () => {
    holds('--color-text', [...BASES, [...CARD, '--row-selected']], 4.5);
  });

  // P10 (0.6): Edit is on whenever a file opens, and the lines take a darker, editor's look while it is on
  const EDITING = ['--editing-bg'];

  it('Edit on: the lines\' editing look is darker than the frames in every theme', () => {
    for (const [name, cls] of THEMES) {
      const props = K.propsOf(css, cls);
      const editing = K.luminance(K.colour(props, '--editing-bg'));
      assert.ok(K.colour(props, '--editing-bg').a === 1, `${name}: the editing look must be opaque`);
      assert.ok(editing < K.luminance(K.colour(props, '--color-bg-card')), `${name}: the editing look is not darker than the frames`);
    }
  });

  it('Edit on: the lines\' text, numbers, levels, ids, muted text and pointers hold 4.5:1 on the editing look, in every theme', () => {
    for (const fg of ['--color-text', '--tag-color', '--value-color', '--line-number-color', '--level-color', '--id-color', '--color-text-muted', '--more-color', '--pointer-color']) holds(fg, [EDITING], 4.5);
  });

  // 0.6.0, from the owner's walk of 0.6: the selected line takes a wash of its own while Edit is on
  // (lighter in Light), and the pointer blue is set for each look (deeper in Light)
  const SELECTED_EDITING = [...EDITING, '--editing-selected'];
  it('Edit on: ids and text on the selected line hold 4.5:1, in every theme', () => {
    holds('--id-color', [SELECTED_EDITING], 4.5);
    holds('--color-text', [SELECTED_EDITING], 4.5);
  });

  it('pointers hold 4.5:1 on the frames\' colour as well as on the editing look, in every theme', () => {
    holds('--pointer-color', [CARD, EDITING], 4.5);
  });

  // 0.6.2: the wavy line under a tag the table of tags finds wanting is a graphical mark beside the
  // dot (1.4.11), so it holds 3:1 on the lines' background, with Edit on and off, and on the selected line
  it('the wavy lines under a tag, red and gold: 3:1 on the lines, with Edit on and off, and on the selected line, in every theme', () => {
    for (const fg of ['--wave-error', '--wave-note']) holds(fg, [CARD, EDITING, [...CARD, '--row-selected'], SELECTED_EDITING], 3);
  });

  it('the pointer colour and the editing wash are set for each look, and the block after the palettes does not set them again (it would override every theme)', () => {
    const blocks = K.blocksOf(css);
    for (const selector of [':root', '.dusk', '.dark']) {
      const palette = blocks.find((b) => b.selector === selector && b.props.has('--color-bg'));
      for (const name of ['--pointer-color', '--editing-selected']) assert.ok(palette.props.has(name), `${selector} does not set ${name}`);
    }
    const own = blocks.filter((b) => b.selector === ':root' && !b.props.has('--color-bg'));
    for (const b of own) for (const name of ['--pointer-color', '--editing-selected', '--editing-bg']) assert.ok(!b.props.has(name), `the shared block sets ${name} again`);
  });

  it('Edit on: the box a line is typed in is lighter than the editing look, so it stands out, and its text holds 4.5:1', () => {
    for (const [name, cls] of THEMES) {
      const props = K.propsOf(css, cls);
      assert.ok(K.luminance(K.colour(props, '--edit-bg')) > K.luminance(K.colour(props, '--editing-bg')), `${name}: the box is not lighter than the lines around it`);
    }
    holds('--color-text', [['--edit-bg']], 4.5);
  });

  it('the rules: Edit on sets the lines\' background to the editing look, and the grid and its number column draw it', () => {
    const rules = css.slice(css.indexOf('/* -------'));
    assert.ok(/\.middle\.is-edit-on \{ --lines-bg: var\(--editing-bg\); --row-selected: var\(--editing-selected\); \}/.test(rules), 'Edit on: the editing look, and its own wash for the selected line');
    assert.ok(/--lines-bg:\s*var\(--color-bg-card\);/.test(css), 'with Edit off, the frames\' own colour');
    assert.ok(/\.grid \{[^}]*background: var\(--lines-bg\);/.test(rules), 'the grid draws --lines-bg');
    assert.ok(/\.fx \{[^}]*var\(--lines-bg\);/.test(rules) && /\.row\.is-dragging \.fx \{ background: var\(--lines-bg\); \}/.test(rules), 'the number column under its tint draws it too, never the frames\' colour');
  });

  it('the ids, counts and notes are drawn from the tokens measured here', () => {
    const rules = css.slice(css.indexOf('/* -------'));
    assert.ok(/\.n-note\s*\{[^}]*color:\s*var\(--mark-note\)/.test(rules), '.n-note must use --mark-note');
    assert.ok(/\.n-error\s*\{[^}]*color:\s*var\(--mark-error\)/.test(rules), '.n-error must use --mark-error');
    assert.ok(/\.id\s*\{\s*color:\s*var\(--id-color\)/.test(rules), '.id must use --id-color');
    assert.ok(/\.ptr\s*\{\s*color:\s*var\(--pointer-color\)/.test(rules), '.ptr must use --pointer-color');
    assert.ok(/--mark-error:\s*var\(--color-danger\)/.test(css), '--mark-error must follow --color-danger');
  });
});
