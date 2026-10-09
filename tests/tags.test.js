// The tag table (tags.js): its shape, its counts against the tag lists the two standards print
// themselves, the places it allows, and the written files in fixtures/synthetic/, whose standard
// tags must all be in it. Nothing here needs the page, core.js or a network.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tags = require('../tags.js');

const ROOT = path.resolve(__dirname, '..');
const SYNTHETIC = path.join(ROOT, 'fixtures', 'synthetic');
const { TAGS, meaning, allowedUnder } = tags;
const V551 = '5.5.1';
const V7 = '7.0';
const words = (text) => text.trim().split(/\s+/);
const sorted = (list) => [...list].sort();
const entry = (tag) => TAGS.find((e) => e.tag === tag);
const definedBy = (version) => TAGS.filter((e) => e.versions.includes(version)).map((e) => e.tag);
// The tags that may sit directly under `parent` in a version, by the table.
const under = (parent, version) => TAGS.filter((e) => e.versions.includes(version) && e.under[version].includes(parent)).map((e) => e.tag);

// ---------------------------------------------------------------------------------------------
// What the standards print themselves, and how it was counted. Each list was taken out of the
// standard's own text by a script, not typed from memory.
//
// GEDCOM 5.5.1, the release of 15 November 2019. Its Appendix A, "Lineage-Linked GEDCOM Tag
// Definitions", is a glossary with one heading for each tag, written like `ABBR {ABBREVIATION}:=`.
// It has 136 headings. It does not agree with the standard's own Chapter 2, the grammar that the
// table's places are read from: Chapter 2 writes EMAIL where the glossary prints EMAI, and uses
// ADR3, which the glossary never defines. So the table holds the 137 tags of Chapter 2: the
// glossary's 136, with EMAI read as EMAIL, and ADR3.
const APPENDIX_A_551 = words(`
  ABBR ADDR ADR1 ADR2 ADOP AFN AGE AGNC ALIA ANCE ANCI ANUL ASSO AUTH BAPL BAPM BARM BASM BIRT
  BLES BURI CALN CAST CAUS CENS CHAN CHAR CHIL CHR CHRA CITY CONC CONF CONL CONT COPR CORP CREM
  CTRY DATA DATE DEAT DESC DESI DEST DIV DIVF DSCR EDUC EMAI EMIG ENDL ENGA EVEN FACT FAM FAMC
  FAMF FAMS FAX FCOM FILE FORM FONE GEDC GIVN GRAD HEAD HUSB IDNO IMMI INDI LANG LATI LONG MAP
  MARB MARC MARL MARR MARS MEDI NAME NATI NATU NCHI NICK NMR NOTE NPFX NSFX OBJE OCCU ORDI ORDN
  PAGE PEDI PHON PLAC POST PROB PROP PUBL QUAY REFN RELA RELI REPO RESI RESN RETI RFN RIN ROLE
  ROMN SEX SLGC SLGS SOUR SPFX SSN STAE STAT SUBM SUBN SURN TEMP TEXT TIME TITL TRLR TYPE VERS
  WIFE WILL WWW`);
// FamilySearch GEDCOM 7.0, the text of 7.0.18 of 17 February 2026. Its section 3.3.4, "Structure
// types", has one heading for each structure type: 181 of them, each with its tag and its g7:
// address (TRAN alone has one heading without an address, for the kind all four TRANs share). They
// carry 141 different tags. One of them, CONT, is a line continuation, which the standard calls a
// pseudo-structure; the grammar of section 3.2 holds the other 140.
const STRUCTURE_TYPES_70 = words(`
  ABBR ADDR ADOP ADR1 ADR2 ADR3 AGE AGNC ALIA ANCI ANUL ASSO AUTH BAPL BAPM BARM BASM BIRT BLES
  BURI CALN CAST CAUS CENS CHAN CHIL CHR CHRA CITY CONF CONL CONT COPR CORP CREA CREM CROP CTRY
  DATA DATE DEAT DESI DEST DIV DIVF DSCR EDUC EMAIL EMIG ENDL ENGA EVEN EXID FACT FAM FAMC FAMS
  FAX FCOM FILE FORM GEDC GIVN GRAD HEAD HEIGHT HUSB IDNO IMMI INDI INIL LANG LATI LEFT LONG MAP
  MARB MARC MARL MARR MARS MEDI MIME NAME NATI NATU NCHI NICK NMR NO NOTE NPFX NSFX OBJE OCCU ORDN
  PAGE PEDI PHON PHRASE PLAC POST PROB PROP PUBL QUAY REFN RELI REPO RESI RESN RETI ROLE SCHMA
  SDATE SEX SLGC SLGS SNOTE SOUR SPFX SSN STAE STAT SUBM SURN TAG TEMP TEXT TIME TITL TOP TRAN
  TRLR TYPE UID VERS WIDTH WIFE WILL WWW`);

// What differs between the two, from the lists above.
const ONLY_551 = words('AFN ANCE CHAR CONC DESC FAMF FONE ORDI RELA RFN RIN ROMN SUBN');
const ONLY_7 = words('CREA CROP EXID HEIGHT INIL LEFT MIME NO PHRASE SCHMA SDATE SNOTE TAG TOP TRAN UID WIDTH');

// The records, and the lines the standards put directly under the header, a person and a family.
// Written out by hand from the definitions of HEAD, INDI and FAM in each standard, not taken from
// the table.
const RECORDS_551 = words('FAM HEAD INDI NOTE OBJE REPO SOUR SUBM SUBN TRLR');
const RECORDS_7 = words('FAM HEAD INDI OBJE REPO SNOTE SOUR SUBM TRLR');
const HEADER_551 = words('CHAR COPR DATE DEST FILE GEDC LANG NOTE PLAC SOUR SUBM SUBN');
const HEADER_7 = words('COPR DATE DEST GEDC LANG NOTE PLAC SCHMA SNOTE SOUR SUBM');
const PERSON_EVENTS = 'ADOP BAPM BARM BASM BIRT BLES BURI CENS CHR CHRA CONF CREM DEAT EMIG EVEN FCOM GRAD IMMI NATU ORDN PROB RETI WILL';
const PERSON_FACTS = 'CAST DSCR EDUC FACT IDNO NATI NCHI NMR OCCU PROP RELI RESI SSN TITL';
const INDI_551 = words(`RESN NAME SEX ${PERSON_EVENTS} ${PERSON_FACTS} BAPL CONL ENDL SLGC FAMC FAMS SUBM ASSO ALIA
  ANCI DESI RFN AFN REFN RIN CHAN NOTE SOUR OBJE`);
const INDI_7 = words(`RESN NAME SEX ${PERSON_EVENTS} ${PERSON_FACTS} NO BAPL CONL ENDL INIL SLGC FAMC FAMS SUBM ASSO
  ALIA ANCI DESI REFN UID EXID NOTE SNOTE SOUR OBJE CHAN CREA`);
const FAM_551 = words(`RESN ANUL CENS DIV DIVF ENGA MARB MARC MARL MARR MARS RESI EVEN HUSB WIFE CHIL NCHI SUBM SLGS
  REFN RIN CHAN NOTE SOUR OBJE`);
const FAM_7 = words(`RESN NCHI RESI FACT ANUL CENS DIV DIVF ENGA MARB MARC MARL MARR MARS EVEN NO HUSB WIFE CHIL ASSO
  SUBM SLGS REFN UID EXID NOTE SNOTE SOUR OBJE CHAN CREA`);

// ---------------------------------------------------------------------------------------------
describe('the table: its shape', () => {
  it('is one table and two lookups, and nothing else', () => {
    assert.deepEqual(Object.keys(tags).sort(), ['TAGS', 'allowedUnder', 'meaning']);
    assert.ok(Array.isArray(TAGS));
    assert.equal(typeof meaning, 'function');
    assert.equal(typeof allowedUnder, 'function');
  });

  it('loads as a classic script with nothing around it, and sets GedTags, as the page will load it', () => {
    const source = fs.readFileSync(path.join(ROOT, 'tags.js'), 'utf8');
    const page = vm.createContext({});      // no module, no require, no process: a page has none
    vm.runInContext(source, page, { filename: 'tags.js' });
    assert.deepEqual(Object.keys(page.GedTags).sort(), ['TAGS', 'allowedUnder', 'meaning']);
    assert.equal(page.GedTags.TAGS.length, TAGS.length);
    assert.equal(page.GedTags.meaning('BIRT'), meaning('BIRT'));
    assert.equal(page.GedTags.allowedUnder('CHAN', 'INDI', V7), true);
    assert.equal(page.GedTags.allowedUnder('CHAN', 'HEAD', V7), false);
  });

  it('gives every entry the four fields and no other, each of its kind', () => {
    assert.ok(TAGS.length > 0);
    for (const e of TAGS) {
      assert.deepEqual(Object.keys(e).sort(), ['meaning', 'tag', 'under', 'versions'], e.tag);
      assert.equal(typeof e.tag, 'string');
      assert.ok(Array.isArray(e.versions), `${e.tag}: versions`);
      assert.equal(typeof e.meaning, 'string', `${e.tag}: meaning`);
      assert.ok(e.under && typeof e.under === 'object' && !Array.isArray(e.under), `${e.tag}: under`);
    }
  });

  it('writes each tag in capital letters, digits and underscore, once, none of them an extension, in alphabetical order', () => {
    for (const e of TAGS) assert.match(e.tag, /^[A-Z][A-Z0-9_]*$/, e.tag);   // so none begins with an underscore
    assert.equal(new Set(TAGS.map((e) => e.tag)).size, TAGS.length, 'a tag twice');
    assert.deepEqual(TAGS.map((e) => e.tag), sorted(TAGS.map((e) => e.tag)));
  });

  it('names as versions only 5.5.1 and 7.0, at least one, in that order, none twice', () => {
    for (const e of TAGS) {
      assert.ok(e.versions.length >= 1, e.tag);
      assert.deepEqual(e.versions, [V551, V7].filter((v) => e.versions.includes(v)), e.tag);
    }
  });

  it('gives each tag one line of plain words: a capital, a full stop, at most 90 characters, no em dash, no middle dot', () => {
    for (const e of TAGS) {
      assert.match(e.meaning, /^[A-Z].*\.$/, `${e.tag}: ${e.meaning}`);
      assert.ok(e.meaning.length <= 90, `${e.tag} is ${e.meaning.length} characters`);
      assert.ok(!/[\n\r\u2014\u2013\u00b7]/.test(e.meaning), `${e.tag}: a line break, a dash or a middle dot`);
    }
  });

  it('gives each tag one list of parents for each version it has, and no list for another', () => {
    for (const e of TAGS) {
      assert.deepEqual(Object.keys(e.under), e.versions, e.tag);
      for (const v of e.versions) {
        assert.ok(Array.isArray(e.under[v]) && e.under[v].length > 0, `${e.tag} in ${v}: no parents`);
        assert.equal(new Set(e.under[v]).size, e.under[v].length, `${e.tag} in ${v}: a parent twice`);
      }
    }
  });

  it('allows a parent only if it is "record" or a tag the same version defines', () => {
    for (const e of TAGS) {
      for (const v of e.versions) {
        const defined = new Set(definedBy(v));
        for (const p of e.under[v]) assert.ok(p === 'record' || defined.has(p), `${e.tag} sits under ${p} in ${v}, which ${v} does not define`);
      }
    }
  });

  it('cannot be changed from outside', () => {
    assert.ok(Object.isFrozen(TAGS));
    for (const e of TAGS) {
      assert.ok(Object.isFrozen(e) && Object.isFrozen(e.versions) && Object.isFrozen(e.under), e.tag);
      for (const v of e.versions) assert.ok(Object.isFrozen(e.under[v]), `${e.tag} in ${v}`);
    }
  });

  it('is a source with no dependency, no request, no em dash and no middle dot', () => {
    const source = fs.readFileSync(path.join(ROOT, 'tags.js'), 'utf8');
    assert.ok(!/\brequire\s*\(/.test(source) && !/\bimport\b/.test(source), 'it needs nothing');
    // what page.test.js refuses in each file the page loads, so that this file can join them
    for (const word of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'import(', '@import', 'url(http', 'http://', 'https://']) {
      assert.ok(!source.includes(word), `tags.js holds "${word}"`);
    }
    assert.ok(!/[\u2014\u00b7]/.test(source), 'an em dash or a middle dot');
  });
});

// ---------------------------------------------------------------------------------------------
describe('the counts, against the standards own lists', () => {
  it('5.5.1: the 137 tags of Chapter 2, which are Appendix A (136 headings) with EMAI read as EMAIL, and ADR3', () => {
    assert.equal(APPENDIX_A_551.length, 136);
    assert.equal(new Set(APPENDIX_A_551).size, 136);
    const chapter2 = new Set(APPENDIX_A_551);
    chapter2.delete('EMAI');
    chapter2.add('EMAIL');
    chapter2.add('ADR3');
    assert.equal(definedBy(V551).length, 137);
    assert.deepEqual(sorted(definedBy(V551)), sorted(chapter2));
  });

  it('7.0: the 141 tags of the structure types (181 headings, one of them a tag the grammar leaves out, CONT)', () => {
    assert.equal(STRUCTURE_TYPES_70.length, 141);
    assert.equal(new Set(STRUCTURE_TYPES_70).size, 141);
    assert.equal(definedBy(V7).length, 141);
    assert.deepEqual(sorted(definedBy(V7)), sorted(STRUCTURE_TYPES_70));
  });

  it('in all, 154 different tags: 124 in both standards, 13 only in 5.5.1 and 17 only in 7.0', () => {
    assert.equal(TAGS.length, 154);
    assert.equal(TAGS.filter((e) => e.versions.length === 2).length, 124);
    assert.deepEqual(sorted(TAGS.filter((e) => e.versions.join() === V551).map((e) => e.tag)), sorted(ONLY_551));
    assert.deepEqual(sorted(TAGS.filter((e) => e.versions.join() === V7).map((e) => e.tag)), sorted(ONLY_7));
    assert.equal(ONLY_551.length, 13);
    assert.equal(ONLY_7.length, 17);
    assert.equal(124 + 13 + 17, 154);
  });

  it('has a level 0 line only for the records: 10 in 5.5.1 and 9 in 7.0, 11 in all', () => {
    assert.equal(RECORDS_551.length, 10);
    assert.equal(RECORDS_7.length, 9);
    assert.deepEqual(sorted(under('record', V551)), sorted(RECORDS_551));
    assert.deepEqual(sorted(under('record', V7)), sorted(RECORDS_7));
    assert.deepEqual(sorted(new Set([...under('record', V551), ...under('record', V7)])),
      sorted(['INDI', 'FAM', 'SOUR', 'REPO', 'OBJE', 'NOTE', 'SNOTE', 'SUBM', 'SUBN', 'HEAD', 'TRLR']));
  });

  it('lets the header hold what each standard defines for it: 12 tags in 5.5.1, 11 in 7.0', () => {
    assert.equal(HEADER_551.length, 12);
    assert.equal(HEADER_7.length, 11);
    assert.deepEqual(sorted(under('HEAD', V551)), sorted(HEADER_551));
    assert.deepEqual(sorted(under('HEAD', V7)), sorted(HEADER_7));
  });

  it('lets a person hold what each standard defines for INDI: 59 tags in 5.5.1, 62 in 7.0', () => {
    assert.equal(INDI_551.length, 59);
    assert.equal(INDI_7.length, 62);
    assert.deepEqual(sorted(under('INDI', V551)), sorted(INDI_551));
    assert.deepEqual(sorted(under('INDI', V7)), sorted(INDI_7));
  });

  it('lets a family hold what each standard defines for FAM: 25 tags in 5.5.1, 31 in 7.0', () => {
    assert.equal(FAM_551.length, 25);
    assert.equal(FAM_7.length, 31);
    assert.deepEqual(sorted(under('FAM', V551)), sorted(FAM_551));
    assert.deepEqual(sorted(under('FAM', V7)), sorted(FAM_7));
  });
});

// ---------------------------------------------------------------------------------------------
describe('the places: spot checks', () => {
  const both = (tag, parent) => [allowedUnder(tag, parent, V551), allowedUnder(tag, parent, V7)];

  it('NAME under INDI is allowed in both, and under SUBM, REPO and the program of the header; not under FAM', () => {
    assert.deepEqual(both('NAME', 'INDI'), [true, true]);
    assert.deepEqual(both('NAME', 'SUBM'), [true, true]);
    assert.deepEqual(both('NAME', 'REPO'), [true, true]);
    assert.deepEqual(both('NAME', 'SOUR'), [true, true]);
    assert.deepEqual(both('NAME', 'FAM'), [false, false]);
    assert.deepEqual(both('NAME', 'record'), [false, false]);
  });

  it('CHAN under INDI is allowed, and under every record that takes one; under HEAD it is not, in either', () => {
    assert.deepEqual(both('CHAN', 'INDI'), [true, true]);
    assert.deepEqual(both('CHAN', 'HEAD'), [false, false]);
    assert.deepEqual(both('CHAN', 'record'), [false, false]);
    for (const parent of ['FAM', 'OBJE', 'REPO', 'SOUR', 'SUBM']) assert.deepEqual(both('CHAN', parent), [true, true], parent);
    // the records differ: 5.5.1 has NOTE and SUBN records, and 7.0 has SNOTE
    assert.deepEqual([allowedUnder('CHAN', 'NOTE', V551), allowedUnder('CHAN', 'NOTE', V7)], [true, false]);
    assert.deepEqual([allowedUnder('CHAN', 'SUBN', V551), allowedUnder('CHAN', 'SUBN', V7)], [true, false]);
    assert.deepEqual([allowedUnder('CHAN', 'SNOTE', V551), allowedUnder('CHAN', 'SNOTE', V7)], [false, true]);
  });

  it('TIME under DATE is allowed in both, which is how a header date and a change date carry their time; under CHAN directly it is not', () => {
    assert.deepEqual(both('TIME', 'DATE'), [true, true]);
    assert.deepEqual(both('TIME', 'CHAN'), [false, false]);
    assert.deepEqual(both('TIME', 'HEAD'), [false, false]);
    // the table knows the one tag above a line, not the one above that: it cannot tell which DATEs
    assert.deepEqual(entry('TIME').under[V551], ['DATE'], 'in 5.5.1 only a date holds a time');
  });

  it('NOTE under HEAD is allowed, in 5.5.1 and in 7.0 (each gives the header at most one, which the table does not count)', () => {
    assert.deepEqual(both('NOTE', 'HEAD'), [true, true]);
    assert.deepEqual(both('NOTE', 'INDI'), [true, true]);
    assert.deepEqual(both('NOTE', 'NOTE'), [false, false], 'a note holds no note');
  });

  it('NOTE is a record only in 5.5.1, and SNOTE is a tag only in 7.0', () => {
    assert.deepEqual([allowedUnder('NOTE', 'record', V551), allowedUnder('NOTE', 'record', V7)], [true, false]);
    assert.deepEqual(entry('SNOTE').versions, [V7]);
    assert.equal(allowedUnder('SNOTE', 'record', V7), true);
    assert.equal(allowedUnder('SNOTE', 'INDI', V7), true, 'a pointer to a shared note');
    assert.equal(allowedUnder('SNOTE', 'record', V551), false, 'a tag the table has, in a version that does not');
    assert.equal(allowedUnder('SNOTE', 'INDI', V551), false);
  });

  it('a made-up tag is not in the table: FAM9 has no meaning and no answer about its place', () => {
    assert.equal(meaning('FAM9'), null);
    for (const version of [V551, V7]) {
      for (const parent of ['record', 'HEAD', 'INDI', 'FAM']) assert.equal(allowedUnder('FAM9', parent, version), null, `${parent} in ${version}`);
    }
  });

  it('an extension tag, which begins with an underscore, is not in the table either: "not in the standard", not an error', () => {
    for (const tag of ['_APID', '_META', '_MTTAG', '_FREL', '_', '_X1']) {
      assert.equal(meaning(tag), null, tag);
      for (const version of [V551, V7]) {
        assert.equal(allowedUnder(tag, 'INDI', version), null, `${tag} in ${version}`);
        assert.equal(allowedUnder(tag, 'record', version), null, `${tag} in ${version}`);
      }
    }
  });

  it('a standard tag in the wrong place is false: a birth under a family, a marriage under a person, a person under the header', () => {
    assert.deepEqual(both('BIRT', 'INDI'), [true, true]);
    assert.deepEqual(both('BIRT', 'FAM'), [false, false]);
    assert.deepEqual(both('MARR', 'FAM'), [true, true]);
    assert.deepEqual(both('MARR', 'INDI'), [false, false]);
    assert.deepEqual(both('HUSB', 'FAM'), [true, true]);
    assert.deepEqual(both('HUSB', 'MARR'), [true, true], 'the husband at a marriage: his age');
    assert.deepEqual(both('HUSB', 'INDI'), [false, false]);
    assert.deepEqual(both('FAMC', 'INDI'), [true, true]);
    assert.deepEqual(both('FAMC', 'FAM'), [false, false]);
    assert.deepEqual(both('INDI', 'record'), [true, true]);
    assert.deepEqual(both('INDI', 'HEAD'), [false, false]);
    assert.deepEqual(both('INDI', 'FAM'), [false, false]);
    assert.deepEqual(both('HEAD', 'record'), [true, true]);
    assert.deepEqual(both('TRLR', 'record'), [true, true]);
    assert.deepEqual(both('DATE', 'record'), [false, false]);
    assert.deepEqual(both('SEX', 'INDI'), [true, true]);
    assert.deepEqual(both('SEX', 'FAM'), [false, false]);
  });

  it('a standard tag under a parent that is not a standard tag is false: no standard puts it there', () => {
    for (const parent of ['_APID', 'FAM9', '', 'birt', 'level 0']) {
      assert.deepEqual(both('NAME', parent), [false, false], parent);
      assert.deepEqual(both('DATE', parent), [false, false], parent);
    }
  });

  it('what moved between the two standards moved in the table', () => {
    assert.deepEqual(both('CHAR', 'HEAD'), [true, false], 'CHAR: 7.0 is always UTF-8');
    assert.deepEqual(both('FORM', 'GEDC'), [true, false], 'GEDC.FORM: only 5.5.1');
    assert.deepEqual(both('VERS', 'GEDC'), [true, true]);
    assert.deepEqual(both('SCHMA', 'HEAD'), [false, true]);
    assert.deepEqual(both('TAG', 'SCHMA'), [false, true]);
    assert.deepEqual(both('CREA', 'INDI'), [false, true]);
    assert.deepEqual(both('FILE', 'HEAD'), [true, false], 'HEAD.FILE: only 5.5.1');
    assert.deepEqual(both('FILE', 'OBJE'), [true, true]);
    assert.deepEqual(both('FONE', 'NAME'), [true, false]);
    assert.deepEqual(both('TRAN', 'NAME'), [false, true]);
    assert.deepEqual(both('RELA', 'ASSO'), [true, false]);
    assert.deepEqual(both('ROLE', 'ASSO'), [false, true]);
    assert.deepEqual(both('SUBN', 'record'), [true, false]);
    assert.deepEqual(both('INIL', 'INDI'), [false, true]);
    assert.deepEqual(both('NO', 'INDI'), [false, true]);
    assert.deepEqual(both('PHRASE', 'DATE'), [false, true]);
    assert.deepEqual(both('ADR3', 'ADDR'), [true, true]);
    assert.deepEqual(both('EMAIL', 'SUBM'), [true, true]);
    assert.equal(meaning('EMAI'), null, 'EMAI is a typo of the 5.5.1 glossary, not a tag');
  });

  it('CONC is a tag of 5.5.1 only, and CONT of both; each may follow the lines the standards draw them under, and no line without a text value', () => {
    assert.deepEqual(entry('CONC').versions, [V551]);
    assert.deepEqual(entry('CONT').versions, [V551, V7]);
    // where the 5.5.1 grammar draws them
    for (const parent of ['NOTE', 'TEXT', 'AUTH', 'TITL', 'PUBL', 'DSCR', 'COPR', 'SOUR']) {
      assert.equal(allowedUnder('CONC', parent, V551), true, `CONC under ${parent}`);
      assert.equal(allowedUnder('CONT', parent, V551), true, `CONT under ${parent}`);
    }
    assert.equal(allowedUnder('CONT', 'ADDR', V551), true);
    // and a long value anywhere else is still a long value
    assert.equal(allowedUnder('CONC', 'PAGE', V551), true);
    assert.equal(allowedUnder('CONC', 'OCCU', V551), true);
    // but a line that holds no text cannot be carried on
    for (const parent of ['record', 'HEAD', 'INDI', 'FAM', 'BIRT', 'FAMC', 'HUSB', 'CHAN', 'CONT', 'CONC']) {
      assert.equal(allowedUnder('CONT', parent, V551), false, `CONT under ${parent} in 5.5.1`);
      assert.equal(allowedUnder('CONC', parent, V551), false, `CONC under ${parent} in 5.5.1`);
    }
    // 7.0 reserves CONC and defines nothing for it
    for (const parent of ['NOTE', 'TEXT', 'record', 'INDI']) assert.equal(allowedUnder('CONC', parent, V7), false, `CONC under ${parent} in 7.0`);
    // 7.0 lets a line break into a payload of type Text or Special, and no other
    for (const parent of ['NOTE', 'SNOTE', 'TEXT', 'ADDR', 'PAGE', 'TITL', 'PHRASE']) assert.equal(allowedUnder('CONT', parent, V7), true, `CONT under ${parent} in 7.0`);
    for (const parent of ['record', 'HEAD', 'INDI', 'BIRT', 'DATE', 'FAMC', 'HUSB', 'SEX', 'LANG', 'PLAC', 'CONT']) assert.equal(allowedUnder('CONT', parent, V7), false, `CONT under ${parent} in 7.0`);
  });

  it('the plain line is the same in every version, and null for what is not in the table', () => {
    for (const e of TAGS) assert.equal(meaning(e.tag), e.meaning, e.tag);
    assert.equal(meaning('BIRT'), 'Birth: when and where a person was born.');
    assert.equal(typeof meaning('SNOTE'), 'string');
    assert.equal(typeof meaning('CONC'), 'string');
    for (const odd of ['', 'birt', 'Birt', ' BIRT', 'BIRT ', 'EMAI', 'BLOB', undefined, null, 5, {}, ['BIRT']]) assert.equal(meaning(odd), null, String(odd));
  });

  it('answers only for the two versions it knows: anything else is null, and a tag a version lacks is false there', () => {
    for (const version of ['5.5', '5.5.5', '7', '7.0.18', '7.1', '', undefined, null, 551, 'V7']) {
      assert.equal(allowedUnder('BIRT', 'INDI', version), null, String(version));
    }
    assert.equal(allowedUnder('CHAR', 'HEAD', V7), false);
    assert.equal(allowedUnder('SCHMA', 'HEAD', V551), false);
  });

  it('is exact: tags are matched as written, in capitals, and nothing from Object.prototype is a tag', () => {
    assert.equal(allowedUnder('birt', 'INDI', V551), null);
    assert.equal(allowedUnder('BIRT', 'indi', V551), false);
    for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      assert.equal(meaning(word), null, word);
      assert.equal(allowedUnder(word, 'record', V7), null, word);
      assert.equal(allowedUnder('NAME', word, V7), false, word);
    }
    assert.equal(allowedUnder('BIRT', 'INDI', '__proto__'), null);
  });
});

// ---------------------------------------------------------------------------------------------
// The written files of fixtures/synthetic/ are read here with a few lines of their own, so that this
// test needs nothing but the table. The shape of a line is the brief's 6.3.
const SHAPE = /^(0|[1-9][0-9]*) (?:(@[^@ ]+@) )?([A-Za-z0-9_]+)(?: (.*))?$/s;
const fixtureFiles = () => fs.readdirSync(SYNTHETIC).filter((name) => /\.ged$/i.test(name)).sort();

// The lines of a file that have the shape of a line: level and tag, and the tag of the line they
// belong to, which is the nearest line above with one level less (none when a level is skipped).
function linesOf(name) {
  const text = fs.readFileSync(path.join(SYNTHETIC, name)).toString('latin1');   // one character a byte: no byte is invalid
  const out = [];
  const stack = [];
  text.split(/\r\n|\n\r|\n|\r/).forEach((raw, i) => {
    const m = SHAPE.exec(raw.replace(/^[ \t]+/, ''));
    if (!m) return;
    const level = Number(m[1]);
    stack.length = Math.min(stack.length, level);
    out.push({ file: name, number: i + 1, level, tag: m[3], parent: level === 0 ? 'record' : stack[level - 1] });
    stack[level] = m[3];
  });
  return out;
}

// A file that is written to be flagged by a later check may use a tag the standards do not have
// (FAM9), or put a standard tag where it does not belong. Name such tags and files here, so that
// the two tests below go on saying something about all the others.
const MADE_UP_ON_PURPOSE = new Set([]);          // tags
const PLACED_WRONG_ON_PURPOSE = new Set([]);     // file names

describe('the written files of fixtures/synthetic/', () => {
  const all = fixtureFiles().flatMap(linesOf);

  it('every standard tag they use is in the table, and the extension tags they use are not', () => {
    assert.ok(fixtureFiles().length >= 17, 'the files of the folder');
    const used = new Set(all.map((l) => l.tag));
    const extensions = [...used].filter((t) => t.startsWith('_'));
    const standard = [...used].filter((t) => !t.startsWith('_') && !MADE_UP_ON_PURPOSE.has(t));
    assert.ok(extensions.includes('_FREL'), 'family.ged carries one extension tag');
    for (const tag of extensions) assert.equal(meaning(tag), null, tag);
    const missing = standard.filter((t) => meaning(t) === null);
    assert.deepEqual(missing, [], `tags the files use that the table lacks: ${missing} (if on purpose, add them to MADE_UP_ON_PURPOSE)`);
    // so that the check above cannot pass by finding nothing
    for (const tag of words('HEAD GEDC VERS CHAR SUBM NAME NOTE ADDR CITY INDI FAMS FAMC CHAN DATE TIME FAM HUSB WIFE CHIL SEX BIRT MARR CONC TRLR')) {
      assert.ok(used.has(tag), `${tag} is in no file`);
    }
  });

  it('every line whose parent is there sits where 5.5.1 allows it (the files say VERS 5.5.1), bar the lines the files are written to break', () => {
    const judged = all.filter((l) => l.parent !== undefined && !l.tag.startsWith('_') && !l.parent.startsWith('_')
      && !MADE_UP_ON_PURPOSE.has(l.tag) && !MADE_UP_ON_PURPOSE.has(l.parent) && !PLACED_WRONG_ON_PURPOSE.has(l.file));
    assert.ok(judged.length > 100, `${judged.length} lines judged`);
    const out = judged.filter((l) => allowedUnder(l.tag, l.parent, V551) !== true);
    assert.deepEqual(out.map((l) => `${l.file}:${l.number} ${l.tag} under ${l.parent}`), []);
  });
});
