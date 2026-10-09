// Contrast, measured from style.css as text (not a test: tests/contrast.test.js uses it, and so can a
// script that wants the numbers). It reads the blocks of custom properties at the top of the file,
// resolves a token for one theme the way the cascade would, and gives WCAG 2's contrast ratio.
'use strict';

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// The blocks above the first rule, in source order: [{ selector, props: Map(name → value) }].
function blocksOf(css) {
  const at = css.indexOf('/* -------');
  const head = strip(at < 0 ? css : css.slice(0, at));
  const out = [];
  for (const m of head.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const props = new Map();
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) props.set(d[1], d[2].trim());
    out.push({ selector: m[1].trim(), props });
  }
  return out;
}

// Every custom property as one theme has it. `theme` is the class on <html> ('dark', 'dusk'), or
// null for Light. `:root` applies to all; a class block applies to its theme; the blocks have the
// same weight, so the later wins.
function propsOf(css, theme) {
  const props = new Map();
  for (const b of blocksOf(css)) {
    if (b.selector === ':root' || (theme && b.selector === `.${theme}`)) for (const [k, v] of b.props) props.set(k, v);
  }
  return props;
}

function hex(s) {
  const h = s.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a colour: ${s}`);
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: 1 };
}

// A token's colour: a hex, another token (var), or color-mix(in srgb, X n%, transparent), which is
// X at n% alpha.
function colour(props, name, depth = 0) {
  if (depth > 12) throw new Error(`${name}: tokens refer to each other in a circle`);
  const raw = props.get(name);
  if (raw === undefined) throw new Error(`${name} is not defined`);
  return colourOf(props, raw, depth + 1, name);
}

function colourOf(props, raw, depth, name) {
  const v = raw.trim();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (v.startsWith('#')) return hex(v);
  let m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m) return colour(props, m[1], depth);
  m = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/.exec(v);
  if (m) {
    const c = colourOf(props, m[1], depth, name);
    return { ...c, a: c.a * Number(m[2]) / 100 };
  }
  throw new Error(`${name}: cannot read "${raw}" as a colour`);
}

const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});

// Layers drawn one over the next, the first opaque: ['--color-bg-card', '--row-selected'].
function layered(props, tokens) {
  let c = colour(props, tokens[0]);
  if (c.a !== 1) throw new Error(`${tokens[0]} is not opaque, so it cannot be the first layer`);
  for (const t of tokens.slice(1)) c = over(colour(props, t), c);
  return c;
}

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
const ratioOf = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// The ratio of a token to what it sits on (a layer list), as the theme has them; a translucent
// token is first blended over what it sits on.
function ratio(css, theme, fg, on) {
  const props = propsOf(css, theme);
  const bg = layered(props, on);
  return ratioOf(over(colour(props, fg), bg), bg);
}

module.exports = { blocksOf, propsOf, colour, layered, over, ratioOf, ratio };
