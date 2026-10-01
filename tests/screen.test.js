// What the screen draws from, held under Node (the third round): a label's surname parts (3.8),
// the web address at a point in a value (3.9), a line clipped to a count (3.10), and a _META
// value's parts rebuilt from the allowlist alone (3.3) — with a test that nothing outside the
// allowlist survives, and that a written _META of every shape in the export draws the same way.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');
const h = require('./helpers.js');

describe('3.8 surnames in bold: a label\'s parts', () => {
  it('the text between slashes is the surname; the slashes go; a name with none is as written; // is no surname', () => {
    assert.deepEqual(core.nameParts('Jane /Fixture/'), [{ text: 'Jane ', surname: false }, { text: 'Fixture', surname: true }]);
    assert.deepEqual(core.nameParts('/Fixture/ Jr.'), [{ text: 'Fixture', surname: true }, { text: ' Jr.', surname: false }]);
    assert.deepEqual(core.nameParts('Jane Fixture'), [{ text: 'Jane Fixture', surname: false }]);
    assert.deepEqual(core.nameParts('Jane //'), [{ text: 'Jane ', surname: false }]);
    assert.deepEqual(core.nameParts(''), []);
    assert.deepEqual(core.nameParts('Jane /Fixture/ (1900–1950)'), [{ text: 'Jane ', surname: false }, { text: 'Fixture', surname: true }, { text: ' (1900–1950)', surname: false }]);
    assert.deepEqual(core.nameParts('Abe /Fixture/ & Ada /Fixture/').filter((p) => p.surname).length, 2, 'a family label: both surnames');
    assert.deepEqual(core.nameParts('Jane /Fix/ture/'), [{ text: 'Jane ', surname: false }, { text: 'Fix', surname: true }, { text: 'ture/', surname: false }], 'a third slash is just a character');
  });

  it('the label as shown, for the filter: Fixture, and Jane Fixture, find it either way', () => {
    assert.equal(core.nameShown('Jane /Fixture/ (1900–1950)'), 'Jane Fixture (1900–1950)');
    assert.equal(core.nameShown('/Fixture/ Jr.'), 'Fixture Jr.');
    assert.equal(core.nameShown('0 @I1@ INDI'), '0 @I1@ INDI');
  });
});

describe('3.9 selecting a link: the web address at a point', () => {
  const at = (text, k) => { const r = core.linkAt(text, k); return r ? text.slice(r[0], r[1]) : null; };
  it('http, https and www addresses, whole, from any character in them; the sentence\'s punctuation left off', () => {
    const t = 'see https://example.org/a/b?c=1 for more';
    assert.equal(at(t, 4), 'https://example.org/a/b?c=1');
    assert.equal(at(t, 30), 'https://example.org/a/b?c=1');
    assert.equal(at(t, 3), null);
    assert.equal(at(t, 31), null);
    assert.equal(at('at www.example.org.', 5), 'www.example.org');
    assert.equal(at('(http://x.y/z)', 3), 'http://x.y/z');
    assert.equal(at('see http://x.y/Foo_(bar), then', 6), 'http://x.y/Foo_(bar)', 'a bracket the address opened stays');
    assert.equal(at('http://a.b/c; http://d.e/f', 16), 'http://d.e/f', 'the second of two');
    assert.equal(at('http://a.b/c; http://d.e/f', 12), null, 'the semicolon between them is in neither');
    assert.equal(at('no address here', 3), null);
    assert.equal(at('2 NOTE https://example.org', 7), 'https://example.org');
  });
});

describe('a line as typed, for the right frame to follow the typing', () => {
  it('its shape: level, id, tag and where the value starts; a line that does not parse; a blank one', () => {
    assert.deepEqual(core.lineShape('1 NAME Jane /Fixture/'), { lead: 0, level: 1, xref: null, tag: 'NAME', valAt: 7, blank: false });
    assert.deepEqual(core.lineShape('0 @I1@ INDI'), { lead: 0, level: 0, xref: '@I1@', tag: 'INDI', valAt: -1, blank: false });
    assert.deepEqual(core.lineShape('  2 CONT x'), { lead: 2, level: 2, xref: null, tag: 'CONT', valAt: 9, blank: false });
    assert.deepEqual(core.lineShape('1NAME x'), { lead: 0, level: -1, xref: null, tag: null, valAt: -1, blank: false });
    assert.deepEqual(core.lineShape(''), { lead: 0, level: -1, xref: null, tag: null, valAt: -1, blank: true });
    assert.deepEqual(core.lineShape('   '), { lead: 3, level: -1, xref: null, tag: null, valAt: -1, blank: true });
  });
});

describe('3.10 a clipped row says so', () => {
  it('where the shown part ends and how many characters are not shown, in characters, never half of one', () => {
    assert.deepEqual(core.clip('short', 2000), { end: 5, more: 0 });
    const long = `1 _META ${'x'.repeat(83789)}`;
    assert.equal(core.codePoints(long), 83797);
    assert.deepEqual(core.clip(long, 2000), { end: 2000, more: 81797 });
    const emoji = `${'\u{1F600}'.repeat(3)}abc`;
    assert.deepEqual(core.clip(emoji, 2), { end: 4, more: 4 }, 'two characters are four units');
    assert.deepEqual(core.clip(emoji, 6), { end: 9, more: 0 });
  });
});

// The _META of a Find a Grave record, as batch 20's export has them (fictional people): a story
// in web formatting, a transcription, the persons, the cemetery and the record id.
const STORY_HTML = [
  '<p>Jane <strong>Fixture</strong> was born in <em>Fixtureville</em>.<br>She lived there.</p>',
  '<p><span style="font-size:12pt"><font face="Arial">A span and a font, unwrapped.</font></span></p>',
  '<h1 class="x">A heading</h1><blockquote>Quoted</blockquote><pre>kept  as   is</pre><hr>',
  '<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><dl><dt>Term</dt><dd>What it means</dd></dl>',
  '<table border="1" width="100%"><thead><tr><th colspan="2">Head</th></tr></thead><tbody><tr><td>a</td><td rowspan="2" bgcolor="red">b</td></tr></tbody></table>',
  '<p>A link: <a href="https://example.org/grave/1">the record</a>, and a bare one <a href="https://example.org">https://example.org</a>.</p>',
  '<p>An image: <img src="https://example.org/photo.jpg" alt="photo"></p>',
  '<!-- a comment --><style>p { color: red }</style><script>alert(1)</script>',
  '<w:WordDocument><w:View>Normal</w:View></w:WordDocument><o:p></o:p><m:oMath>x</m:oMath><xml>hidden</xml>',
  '<div>sup<sup>2</sup> sub<sub>3</sub> <u>under</u> <b>bold</b> <i>italic</i> <address>An address</address></div>',
];
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const META = `<metadataxml><content>${STORY_HTML.map((l) => `<line>${escape(l)}</line>`).join('')}</content>` +
  '<transcription>Line one\nLine two</transcription>' +
  '<personas><persona><pname>Jane Fixture</pname><bdate>1 Jan 1900</bdate><bplace>Fixtureville</bplace><ddate>2 Feb 1950</ddate><dplace>Fixture City</dplace></persona>' +
  '<persona><pname>Joe Fixture</pname></persona><persona></persona></personas>' +
  '<cemetery>Fixture Cemetery</cemetery><record_source_gid>12345</record_source_gid></metadataxml>';

const names = (nodes, out = []) => {
  for (const n of nodes) if (n.name !== undefined) { out.push(n.name); names(n.children, out); }
  return out;
};
const attrs = (nodes, out = []) => {
  for (const n of nodes) if (n.name !== undefined) { for (const a of Object.keys(n.attrs)) out.push(`${n.name}.${a}=${n.attrs[a]}`); attrs(n.children, out); }
  return out;
};
const textOf = (nodes) => nodes.map((n) => (n.text !== undefined ? n.text : textOf(n.children))).join('');

describe('3.3 the _META drawn as it reads', () => {
  it('every part, from a value of every shape the export holds', () => {
    const parts = h.metaOf(META);
    assert.ok(parts && !parts.empty);
    assert.equal(parts.transcription, 'Line one\nLine two', 'its line breaks kept');
    assert.deepEqual(parts.persons, [
      { name: 'Jane Fixture', born: '1 Jan 1900', birthplace: 'Fixtureville', died: '2 Feb 1950', deathplace: 'Fixture City' },
      { name: 'Joe Fixture', born: '', birthplace: '', died: '', deathplace: '' },
    ], 'a persona with nothing in it is left out');
    assert.equal(parts.cemetery, 'Fixture Cemetery');
    assert.equal(parts.recordId, '12345');
    assert.ok(Array.isArray(parts.story) && parts.story.length > 5);
  });

  it('nothing outside the allowlist survives: no link, image, script, style, comment, namespace, span, font or other attribute', () => {
    const story = h.metaOf(META).story;
    const seen = new Set(names(story));
    const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'div', 'blockquote', 'pre', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'address', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'td', 'th']);
    for (const n of seen) assert.ok(allowed.has(n), `${n} survived`);
    for (const n of ['a', 'img', 'script', 'style', 'xml', 'span', 'font', 'w:WordDocument', 'w:View', 'o:p', 'm:oMath']) assert.ok(!seen.has(n), `${n} survived`);
    assert.deepEqual(attrs(story).sort(), ['td.rowspan=2', 'th.colspan=2'], 'colspan and rowspan on cells, nothing else');
    const text = textOf(story);
    assert.ok(text.includes('the record (https://example.org/grave/1)'), 'a link is its text, then its address in plain text');
    assert.ok(text.includes('bare one https://example.org.'), 'an address that is its own text is not written twice');
    assert.ok(text.includes('An image: [image]'));
    assert.ok(!text.includes('alert') && !text.includes('color: red') && !text.includes('a comment') && !text.includes('hidden') && !text.includes('Normal'),
      'what goes with its content is gone');
    assert.ok(text.includes('A span and a font, unwrapped.'));
    assert.ok(text.includes('kept  as   is'));
    assert.ok(text.includes('Jane Fixture was born in Fixtureville.She lived there.'));
  });

  it('what is not a <metadataxml>, or does not parse, gets nothing; an empty one is empty; drawn the same way twice', () => {
    assert.equal(h.metaOf('<other><content><line>x</line></content></other>'), null);
    assert.equal(h.metaOf('just text'), null);
    assert.equal(h.metaOf(''), null);
    const bare = h.metaOf('<metadataxml></metadataxml>');
    assert.ok(bare.empty);
    assert.deepEqual(h.metaOf('<metadataxml><content><line>  </line></content><transcription> </transcription><personas></personas></metadataxml>').empty, true);
    assert.deepEqual(h.metaOf(META), h.metaOf(META));
    const content = h.metaOf('<metadataxml><content>&lt;p&gt;no line elements&lt;/p&gt;</content></metadataxml>');
    assert.deepEqual(content.story, [{ name: 'p', attrs: {}, children: [{ text: 'no line elements' }] }], 'a content with no line children is read whole');
  });

  it('metaRebuild on its own: nested unwrapping, text kept, attributes dropped, a bad colspan dropped', () => {
    const tree = h.parseMarkup('<div id="a" style="x"><center><code>c</code></center><td colspan="abc">x</td><td colspan="1">y</td><td colspan="4000">z</td></div>');
    const out = core.metaRebuild(tree);
    assert.deepEqual(out, [{ name: 'div', attrs: {}, children: [{ text: 'c' },
      { name: 'td', attrs: {}, children: [{ text: 'x' }] }, { name: 'td', attrs: {}, children: [{ text: 'y' }] }, { name: 'td', attrs: {}, children: [{ text: 'z' }] }] }]);
    assert.deepEqual(core.metaRebuild({ comment: true }), []);
    assert.deepEqual(core.metaRebuild({ text: 'plain' }), [{ text: 'plain' }]);
  });
});
