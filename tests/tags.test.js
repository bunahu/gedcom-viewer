// The tag table (tags.js): its shape, its counts against the tag lists the three standards print
// themselves, the places it allows, what makes a tag in each version (standard, custom, undeclared
// or malformed), the well known custom tags, and the written files in fixtures/synthetic/, whose
// standard tags must all be in it. Nothing here needs the page, core.js or a network.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tags = require('../tags.js');

const ROOT = path.resolve(__dirname, '..');
const SYNTHETIC = path.join(ROOT, 'fixtures', 'synthetic');
const { TAGS, VERSIONS, CUSTOM_TAGS, meaning, allowedUnder, versionFor, tagKind, customMeaning } = tags;
const V551 = '5.5.1';
const V555 = '5.5.5';
const V7 = '7.0';
const words = (text) => text.trim().split(/\s+/);
const sorted = (list) => [...list].sort();
const entry = (tag) => TAGS.find((e) => e.tag === tag);
const definedBy = (version) => TAGS.filter((e) => e.versions.includes(version)).map((e) => e.tag);
// The tags defined by exactly these versions and no other.
const definedOnlyBy = (...versions) => TAGS.filter((e) => e.versions.join() === versions.join()).map((e) => e.tag);
// The tags that may sit directly under `parent` in a version, by the table.
const under = (parent, version) => TAGS.filter((e) => e.versions.includes(version) && e.under[version].includes(parent)).map((e) => e.tag);
const source = fs.readFileSync(path.join(ROOT, 'tags.js'), 'utf8');

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
  ABBR ADDR ADR1 ADR2 ADOP AFN AGE AGNC ALIA ANCE ANCI ANUL ASSO AUTH BAPL BAPM BARM BASM BIRT BLES
  BURI CALN CAST CAUS CENS CHAN CHAR CHIL CHR CHRA CITY CONC CONF CONL CONT COPR CORP CREM CTRY DATA
  DATE DEAT DESC DESI DEST DIV DIVF DSCR EDUC EMAI EMIG ENDL ENGA EVEN FACT FAM FAMC FAMF FAMS FAX
  FCOM FILE FORM FONE GEDC GIVN GRAD HEAD HUSB IDNO IMMI INDI LANG LATI LONG MAP MARB MARC MARL MARR
  MARS MEDI NAME NATI NATU NCHI NICK NMR NOTE NPFX NSFX OBJE OCCU ORDI ORDN PAGE PEDI PHON PLAC POST
  PROB PROP PUBL QUAY REFN RELA RELI REPO RESI RESN RETI RFN RIN ROLE ROMN SEX SLGC SLGS SOUR SPFX
  SSN STAE STAT SUBM SUBN SURN TEMP TEXT TIME TITL TRLR TYPE VERS WIFE WILL WWW`);
// The GEDCOM 5.5.5 Specification with Annotations, first release of 2 October 2019. Its Appendix A,
// "Lineage-Linked GEDCOM Tag Definitions", has 108 headings, and agrees with its Chapter 2 (it
// prints EMAIL, and defines ADR3). The eight tags of the Basic GEDCOM Language are defined in the
// "GEDCOM Tag Definitions" of its Chapter 1 Part II: the five of the header and trailer, and the two
// line continuations. Together the 116 tags of the table.
const APPENDIX_A_555 = words(`
  ABBR ADDR ADR1 ADR2 ADR3 ADOP AGE AGNC ANUL ASSO AUTH BAPM BARM BASM BIRT BURI CALN CAST CAUS CENS
  CHAN CHIL CHR CHRA CITY CONF COPR CORP CREM CTRY DATA DATE DEAT DEST DIV DIVF DSCR EDUC EMAIL EMIG
  ENGA EVEN FACT FAM FAMC FAMS FAX FCOM FILE FONE GIVN GRAD HUSB IDNO IMMI INDI LANG LATI LONG MAP
  MARB MARC MARL MARR MARS MEDI NAME NATI NATU NCHI NICK NMR NOTE NPFX NSFX OBJE OCCU PAGE PEDI PHON
  PLAC POST PROB PROP PUBL QUAY REFN RELA RELI REPO RESI RETI RIN ROLE ROMN SEX SOUR SPFX STAE SUBM
  SURN TEXT TIME TITL TYPE WIFE WILL WWW`);
const BASIC_555 = words(`
  CHAR CONC CONT FORM GEDC HEAD TRLR VERS`);
// FamilySearch GEDCOM 7.0, the text of 7.0.18 of 17 February 2026. Its section 3.3.4, "Structure
// types", has one heading for each structure type: 181 of them, each with its tag and its g7:
// address (TRAN alone has one heading without an address, for the kind all four TRANs share). They
// carry 141 different tags. One of them, CONT, is a line continuation, which the standard calls a
// pseudo-structure; the grammar of section 3.2 holds the other 140.
const STRUCTURE_TYPES_70 = words(`
  ABBR ADDR ADOP ADR1 ADR2 ADR3 AGE AGNC ALIA ANCI ANUL ASSO AUTH BAPL BAPM BARM BASM BIRT BLES BURI
  CALN CAST CAUS CENS CHAN CHIL CHR CHRA CITY CONF CONL CONT COPR CORP CREA CREM CROP CTRY DATA DATE
  DEAT DESI DEST DIV DIVF DSCR EDUC EMAIL EMIG ENDL ENGA EVEN EXID FACT FAM FAMC FAMS FAX FCOM FILE
  FORM GEDC GIVN GRAD HEAD HEIGHT HUSB IDNO IMMI INDI INIL LANG LATI LEFT LONG MAP MARB MARC MARL
  MARR MARS MEDI MIME NAME NATI NATU NCHI NICK NMR NO NOTE NPFX NSFX OBJE OCCU ORDN PAGE PEDI PHON
  PHRASE PLAC POST PROB PROP PUBL QUAY REFN RELI REPO RESI RESN RETI ROLE SCHMA SDATE SEX SLGC SLGS
  SNOTE SOUR SPFX SSN STAE STAT SUBM SURN TAG TEMP TEXT TIME TITL TOP TRAN TRLR TYPE UID VERS WIDTH
  WIFE WILL WWW`);

// What differs between the three, from the lists above: the tags by the standards that define them.
const IN_551_ONLY = words('AFN ANCE DESC FAMF ORDI RFN SUBN');
const IN_551_555 = words('CHAR CONC FONE RELA RIN ROMN');
const IN_551_7 = words('ALIA ANCI BAPL BLES CONL DESI ENDL ORDN RESN SLGC SLGS SSN STAT TEMP');
const IN_7_ONLY = words('CREA CROP EXID HEIGHT INIL LEFT MIME NO PHRASE SCHMA SDATE SNOTE TAG TOP TRAN UID WIDTH');
// What 5.5.5 retired. Its own sentence on the tags "obsoleted in GEDCOM 5.5.5" names these 14 ...
const RETIRED_555_SAID = words('AFN ALIA ANCI BAPL CONL DESI ENDL ORDN SLGC RESN SSN SLGS SUBN STAT');
// ... and its tables of obsolete and duplicate records retire these 7 as well: BLES is a duplicate
// of EVEN, ANCE DESC FAMF and ORDI are the lines of the SUBN record, RFN is a line of INDI and SUBM
// that the table of obsolete records names, and TEMP goes with the LDS ordinances.
const RETIRED_555_TABLES = words('ANCE BLES DESC FAMF ORDI RFN TEMP');

// The records, and the lines the standards put directly under the header, a person and a family.
// Written out by hand from the definitions of HEAD, INDI and FAM in each standard, not taken from
// the table.
const RECORDS_551 = words('FAM HEAD INDI NOTE OBJE REPO SOUR SUBM SUBN TRLR');
const RECORDS_555 = words('FAM HEAD INDI NOTE OBJE REPO SOUR SUBM TRLR');
const RECORDS_7 = words('FAM HEAD INDI OBJE REPO SNOTE SOUR SUBM TRLR');
const HEADER_551 = words('CHAR COPR DATE DEST FILE GEDC LANG NOTE PLAC SOUR SUBM SUBN');
const HEADER_555 = words('CHAR COPR DATE DEST FILE GEDC LANG NOTE SOUR SUBM');
const HEADER_7 = words('COPR DATE DEST GEDC LANG NOTE PLAC SCHMA SNOTE SOUR SUBM');
const PERSON_EVENTS = 'ADOP BAPM BARM BASM BIRT BLES BURI CENS CHR CHRA CONF CREM DEAT EMIG EVEN FCOM GRAD IMMI NATU ORDN PROB RETI WILL';
const PERSON_FACTS = 'CAST DSCR EDUC FACT IDNO NATI NCHI NMR OCCU PROP RELI RESI SSN TITL';
// 5.5.5 has 21 events and 13 facts: no blessing, no ordination, no social security number.
const PERSON_EVENTS_555 = 'ADOP BAPM BARM BASM BIRT BURI CENS CHR CHRA CONF CREM DEAT EMIG EVEN FCOM GRAD IMMI NATU PROB RETI WILL';
const PERSON_FACTS_555 = 'CAST DSCR EDUC FACT IDNO NATI NCHI NMR OCCU PROP RELI RESI TITL';
const INDI_551 = words(`RESN NAME SEX ${PERSON_EVENTS} ${PERSON_FACTS} BAPL CONL ENDL SLGC FAMC FAMS SUBM ASSO ALIA
  ANCI DESI RFN AFN REFN RIN CHAN NOTE SOUR OBJE`);
const INDI_555 = words(`NAME SEX ${PERSON_EVENTS_555} ${PERSON_FACTS_555} FAMC FAMS ASSO REFN RIN CHAN NOTE SOUR OBJE`);
const INDI_7 = words(`RESN NAME SEX ${PERSON_EVENTS} ${PERSON_FACTS} NO BAPL CONL ENDL INIL SLGC FAMC FAMS SUBM ASSO
  ALIA ANCI DESI REFN UID EXID NOTE SNOTE SOUR OBJE CHAN CREA`);
const FAM_551 = words(`RESN ANUL CENS DIV DIVF ENGA MARB MARC MARL MARR MARS RESI EVEN HUSB WIFE CHIL NCHI SUBM SLGS
  REFN RIN CHAN NOTE SOUR OBJE`);
const FAM_555 = words(`ANUL CENS DIV DIVF ENGA MARB MARC MARL MARR MARS RESI EVEN HUSB WIFE CHIL NCHI REFN RIN CHAN
  NOTE SOUR OBJE`);
const FAM_7 = words(`RESN NCHI RESI FACT ANUL CENS DIV DIVF ENGA MARB MARC MARL MARR MARS EVEN NO HUSB WIFE CHIL ASSO
  SUBM SLGS REFN UID EXID NOTE SNOTE SOUR OBJE CHAN CREA`);

// ---------------------------------------------------------------------------------------------
describe('the table: its shape', () => {
  it('is the table, its three versions, the well known custom tags and five lookups, and nothing else', () => {
    assert.deepEqual(Object.keys(tags).sort(),
      ['CUSTOM_TAGS', 'TAGS', 'VERSIONS', 'allowedUnder', 'customMeaning', 'meaning', 'tagKind', 'versionFor']);
    assert.ok(Array.isArray(TAGS));
    assert.deepEqual(VERSIONS, [V551, V555, V7]);
    assert.ok(Object.isFrozen(VERSIONS));
    for (const lookup of [meaning, allowedUnder, versionFor, tagKind, customMeaning]) assert.equal(typeof lookup, 'function');
  });

  it('loads as a classic script with nothing around it, and sets GedTags, as the page will load it', () => {
    const page = vm.createContext({});      // no module, no require, no process: a page has none
    vm.runInContext(source, page, { filename: 'tags.js' });
    assert.deepEqual(Object.keys(page.GedTags).sort(), Object.keys(tags).sort());
    assert.equal(page.GedTags.TAGS.length, TAGS.length);
    assert.equal(page.GedTags.meaning('BIRT'), meaning('BIRT'));
    assert.equal(page.GedTags.allowedUnder('CHAN', 'INDI', V7), true);
    assert.equal(page.GedTags.allowedUnder('CHAN', 'HEAD', V7), false);
    assert.equal(page.GedTags.allowedUnder('CHAN', 'INDI', V555), true);
    assert.equal(page.GedTags.versionFor('7.0.18'), V7);
    assert.equal(page.GedTags.tagKind('_APID', V7), 'undeclared');
    assert.equal(page.GedTags.tagKind('_APID', V555), 'custom');
    assert.equal(page.GedTags.customMeaning('_APID').vendor, 'Ancestry');
    assert.equal(page.GedTags.CUSTOM_TAGS.length, CUSTOM_TAGS.length);
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

  it('names as versions only 5.5.1, 5.5.5 and 7.0, at least one, in that order, none twice', () => {
    for (const e of TAGS) {
      assert.ok(e.versions.length >= 1, e.tag);
      assert.deepEqual(e.versions, [V551, V555, V7].filter((v) => e.versions.includes(v)), e.tag);
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
    assert.ok(Object.isFrozen(CUSTOM_TAGS));
    for (const e of CUSTOM_TAGS) assert.ok(Object.isFrozen(e), e.tag);
  });

  it('is a source with no dependency, no request, nothing but ASCII, no em dash and no middle dot', () => {
    assert.ok(!/\brequire\s*\(/.test(source) && !/\bimport\b/.test(source), 'it needs nothing');
    // what page.test.js refuses in each file the page loads, so that this file can join them
    for (const word of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'import(', '@import', 'url(http', 'http://', 'https://']) {
      assert.ok(!source.includes(word), `tags.js holds "${word}"`);
    }
    assert.ok(!/[\u2014\u00b7]/.test(source), 'an em dash or a middle dot');
    assert.ok(!/[^\x00-\x7f]/.test(source), 'a character beyond ASCII');
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

  it('5.5.5: the 116 tags of Appendix A (108 headings) and of the Basic GEDCOM Language (8)', () => {
    assert.equal(APPENDIX_A_555.length, 108);
    assert.equal(new Set(APPENDIX_A_555).size, 108);
    assert.deepEqual(sorted(BASIC_555), words('CHAR CONC CONT FORM GEDC HEAD TRLR VERS'));
    const all = new Set([...APPENDIX_A_555, ...BASIC_555]);
    assert.equal(all.size, 116, 'a tag in both lists');
    assert.equal(definedBy(V555).length, 116);
    assert.deepEqual(sorted(definedBy(V555)), sorted(all));
  });

  it('7.0: the 141 tags of the structure types (181 headings, one of them a tag the grammar leaves out, CONT)', () => {
    assert.equal(STRUCTURE_TYPES_70.length, 141);
    assert.equal(new Set(STRUCTURE_TYPES_70).size, 141);
    assert.equal(definedBy(V7).length, 141);
    assert.deepEqual(sorted(definedBy(V7)), sorted(STRUCTURE_TYPES_70));
  });

  it('in all, 154 different tags: 110 in all three, 7 in 5.5.1 only, 6 in 5.5.1 and 5.5.5, 14 in 5.5.1 and 7.0, 17 in 7.0 only', () => {
    assert.equal(TAGS.length, 154);
    assert.equal(definedOnlyBy(V551, V555, V7).length, 110);
    assert.deepEqual(sorted(definedOnlyBy(V551)), sorted(IN_551_ONLY));
    assert.deepEqual(sorted(definedOnlyBy(V551, V555)), sorted(IN_551_555));
    assert.deepEqual(sorted(definedOnlyBy(V551, V7)), sorted(IN_551_7));
    assert.deepEqual(sorted(definedOnlyBy(V7)), sorted(IN_7_ONLY));
    assert.equal(IN_551_ONLY.length + IN_551_555.length + IN_551_7.length + IN_7_ONLY.length + 110, 154);
    // 5.5.5 adds no tag: it has none that 5.5.1 lacks
    assert.deepEqual(definedOnlyBy(V555), []);
    assert.deepEqual(definedOnlyBy(V555, V7), []);
  });

  it('5.5.5 is 5.5.1 less 21 tags: the 14 its sentence names and the 7 its tables of obsolete and duplicate records retire', () => {
    assert.equal(RETIRED_555_SAID.length, 14);
    assert.equal(RETIRED_555_TABLES.length, 7);
    const retired = definedBy(V551).filter((t) => !definedBy(V555).includes(t));
    assert.equal(retired.length, 21);
    assert.deepEqual(sorted(retired), sorted([...RETIRED_555_SAID, ...RETIRED_555_TABLES]));
    for (const t of definedBy(V555)) assert.ok(definedBy(V551).includes(t), `${t} is in 5.5.5 and not in 5.5.1`);
  });

  it('has a level 0 line only for the records: 10 in 5.5.1, 9 in 5.5.5 and 9 in 7.0, 11 in all', () => {
    assert.equal(RECORDS_551.length, 10);
    assert.equal(RECORDS_555.length, 9);
    assert.equal(RECORDS_7.length, 9);
    assert.deepEqual(sorted(under('record', V551)), sorted(RECORDS_551));
    assert.deepEqual(sorted(under('record', V555)), sorted(RECORDS_555));
    assert.deepEqual(sorted(under('record', V7)), sorted(RECORDS_7));
    assert.deepEqual(sorted(new Set([...under('record', V551), ...under('record', V555), ...under('record', V7)])),
      sorted(['INDI', 'FAM', 'SOUR', 'REPO', 'OBJE', 'NOTE', 'SNOTE', 'SUBM', 'SUBN', 'HEAD', 'TRLR']));
  });

  it('lets the header hold what each standard defines for it: 12 tags in 5.5.1, 10 in 5.5.5, 11 in 7.0', () => {
    assert.equal(HEADER_551.length, 12);
    assert.equal(HEADER_555.length, 10);
    assert.equal(HEADER_7.length, 11);
    assert.deepEqual(sorted(under('HEAD', V551)), sorted(HEADER_551));
    assert.deepEqual(sorted(under('HEAD', V555)), sorted(HEADER_555));
    assert.deepEqual(sorted(under('HEAD', V7)), sorted(HEADER_7));
  });

  it('lets a person hold what each standard defines for INDI: 59 tags in 5.5.1, 45 in 5.5.5, 62 in 7.0', () => {
    assert.equal(INDI_551.length, 59);
    assert.equal(INDI_555.length, 45);
    assert.equal(INDI_7.length, 62);
    assert.deepEqual(sorted(under('INDI', V551)), sorted(INDI_551));
    assert.deepEqual(sorted(under('INDI', V555)), sorted(INDI_555));
    assert.deepEqual(sorted(under('INDI', V7)), sorted(INDI_7));
  });

  it('lets a family hold what each standard defines for FAM: 25 tags in 5.5.1, 22 in 5.5.5, 31 in 7.0', () => {
    assert.equal(FAM_551.length, 25);
    assert.equal(FAM_555.length, 22);
    assert.equal(FAM_7.length, 31);
    assert.deepEqual(sorted(under('FAM', V551)), sorted(FAM_551));
    assert.deepEqual(sorted(under('FAM', V555)), sorted(FAM_555));
    assert.deepEqual(sorted(under('FAM', V7)), sorted(FAM_7));
  });
});

// ---------------------------------------------------------------------------------------------
describe('the places: spot checks', () => {
  const both = (tag, parent) => [allowedUnder(tag, parent, V551), allowedUnder(tag, parent, V7)];
  const three = (tag, parent) => [allowedUnder(tag, parent, V551), allowedUnder(tag, parent, V555), allowedUnder(tag, parent, V7)];

  it('NAME under INDI is allowed in all, and under SUBM, REPO and the program of the header; not under FAM', () => {
    assert.deepEqual(three('NAME', 'INDI'), [true, true, true]);
    assert.deepEqual(three('NAME', 'SUBM'), [true, true, true]);
    assert.deepEqual(three('NAME', 'REPO'), [true, true, true]);
    assert.deepEqual(three('NAME', 'SOUR'), [true, true, true]);
    assert.deepEqual(three('NAME', 'FAM'), [false, false, false]);
    assert.deepEqual(three('NAME', 'record'), [false, false, false]);
  });

  it('CHAN under INDI is allowed, and under every record that takes one; under HEAD it is not, in any', () => {
    assert.deepEqual(three('CHAN', 'INDI'), [true, true, true]);
    assert.deepEqual(three('CHAN', 'HEAD'), [false, false, false]);
    assert.deepEqual(three('CHAN', 'record'), [false, false, false]);
    for (const parent of ['FAM', 'OBJE', 'REPO', 'SOUR', 'SUBM']) assert.deepEqual(three('CHAN', parent), [true, true, true], parent);
    // the records differ: 5.5.1 and 5.5.5 have a NOTE record, 5.5.1 has a SUBN record, and 7.0 has SNOTE
    assert.deepEqual(three('CHAN', 'NOTE'), [true, true, false]);
    assert.deepEqual(three('CHAN', 'SUBN'), [true, false, false]);
    assert.deepEqual(three('CHAN', 'SNOTE'), [false, false, true]);
  });

  it('TIME under DATE is allowed in all, which is how a header date and a change date carry their time; under CHAN directly it is not', () => {
    assert.deepEqual(three('TIME', 'DATE'), [true, true, true]);
    assert.deepEqual(three('TIME', 'CHAN'), [false, false, false]);
    assert.deepEqual(three('TIME', 'HEAD'), [false, false, false]);
    // the table knows the one tag above a line, not the one above that: it cannot tell which DATEs
    assert.deepEqual(entry('TIME').under[V551], ['DATE'], 'in 5.5.1 only a date holds a time');
    assert.deepEqual(entry('TIME').under[V555], ['DATE'], 'in 5.5.5 too');
  });

  it('NOTE under HEAD is allowed, in all three (each gives the header at most one, which the table does not count)', () => {
    assert.deepEqual(three('NOTE', 'HEAD'), [true, true, true]);
    assert.deepEqual(three('NOTE', 'INDI'), [true, true, true]);
    assert.deepEqual(three('NOTE', 'NOTE'), [false, false, false], 'a note holds no note');
  });

  it('NOTE is a record in 5.5.1 and 5.5.5, and SNOTE is a tag only in 7.0', () => {
    assert.deepEqual(three('NOTE', 'record'), [true, true, false]);
    assert.deepEqual(entry('SNOTE').versions, [V7]);
    assert.equal(allowedUnder('SNOTE', 'record', V7), true);
    assert.equal(allowedUnder('SNOTE', 'INDI', V7), true, 'a pointer to a shared note');
    for (const version of [V551, V555]) {
      assert.equal(allowedUnder('SNOTE', 'record', version), false, 'a tag the table has, in a version that does not');
      assert.equal(allowedUnder('SNOTE', 'INDI', version), false);
    }
  });

  it('a made-up tag is not in the table: FAM9 has no meaning and no answer about its place', () => {
    assert.equal(meaning('FAM9'), null);
    for (const version of VERSIONS) {
      for (const parent of ['record', 'HEAD', 'INDI', 'FAM']) assert.equal(allowedUnder('FAM9', parent, version), null, `${parent} in ${version}`);
    }
  });

  it('an extension tag, which begins with an underscore, is not in the table either: "not in the standard", not an error', () => {
    for (const tag of ['_APID', '_META', '_MTTAG', '_FREL', '_', '_X1']) {
      assert.equal(meaning(tag), null, tag);
      for (const version of VERSIONS) {
        assert.equal(allowedUnder(tag, 'INDI', version), null, `${tag} in ${version}`);
        assert.equal(allowedUnder(tag, 'record', version), null, `${tag} in ${version}`);
      }
    }
  });

  it('a standard tag in the wrong place is false: a birth under a family, a marriage under a person, a person under the header', () => {
    assert.deepEqual(three('BIRT', 'INDI'), [true, true, true]);
    assert.deepEqual(three('BIRT', 'FAM'), [false, false, false]);
    assert.deepEqual(three('MARR', 'FAM'), [true, true, true]);
    assert.deepEqual(three('MARR', 'INDI'), [false, false, false]);
    assert.deepEqual(three('HUSB', 'FAM'), [true, true, true]);
    assert.deepEqual(three('HUSB', 'MARR'), [true, true, true], 'the husband at a marriage: his age');
    assert.deepEqual(three('HUSB', 'INDI'), [false, false, false]);
    assert.deepEqual(three('FAMC', 'INDI'), [true, true, true]);
    assert.deepEqual(three('FAMC', 'FAM'), [false, false, false]);
    assert.deepEqual(three('INDI', 'record'), [true, true, true]);
    assert.deepEqual(three('INDI', 'HEAD'), [false, false, false]);
    assert.deepEqual(three('INDI', 'FAM'), [false, false, false]);
    assert.deepEqual(three('HEAD', 'record'), [true, true, true]);
    assert.deepEqual(three('TRLR', 'record'), [true, true, true]);
    assert.deepEqual(three('DATE', 'record'), [false, false, false]);
    assert.deepEqual(three('SEX', 'INDI'), [true, true, true]);
    assert.deepEqual(three('SEX', 'FAM'), [false, false, false]);
  });

  it('a standard tag under a parent that is not a standard tag is false: no standard puts it there', () => {
    for (const parent of ['_APID', 'FAM9', '', 'birt', 'level 0']) {
      assert.deepEqual(three('NAME', parent), [false, false, false], parent);
      assert.deepEqual(three('DATE', parent), [false, false, false], parent);
    }
  });

  it('what moved between 5.5.1 and 7.0 moved in the table', () => {
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

  it('CONC is a tag of 5.5.1 and 5.5.5 only, and CONT of all three; each may follow the lines the standards draw them under, and no line without a text value', () => {
    assert.deepEqual(entry('CONC').versions, [V551, V555]);
    assert.deepEqual(entry('CONT').versions, [V551, V555, V7]);
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

  it('answers only for the three versions it knows: anything else is null, and a tag a version lacks is false there', () => {
    for (const version of ['5.5', '5', '7', '7.0.18', '7.1', '', undefined, null, 551, 'V7']) {
      assert.equal(allowedUnder('BIRT', 'INDI', version), null, String(version));
    }
    assert.equal(allowedUnder('CHAR', 'HEAD', V7), false);
    assert.equal(allowedUnder('SCHMA', 'HEAD', V551), false);
    assert.equal(allowedUnder('SCHMA', 'HEAD', V555), false);
    assert.equal(allowedUnder('SSN', 'INDI', V555), false);
  });

  it('is exact: tags are matched as written, in capitals, and nothing from Object.prototype is a tag', () => {
    assert.equal(allowedUnder('birt', 'INDI', V551), null);
    assert.equal(allowedUnder('BIRT', 'indi', V551), false);
    for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      assert.equal(meaning(word), null, word);
      assert.equal(allowedUnder(word, 'record', V7), null, word);
      assert.equal(allowedUnder(word, 'record', V555), null, word);
      assert.equal(allowedUnder('NAME', word, V7), false, word);
      assert.equal(allowedUnder('NAME', word, V555), false, word);
    }
    assert.equal(allowedUnder('BIRT', 'INDI', '__proto__'), null);
  });
});

// ---------------------------------------------------------------------------------------------
// What 5.5.5 took out of 5.5.1, from its own two tables: "Obsolete Records" (18 rows) and
// "Duplicate Records" (8 rows), each row a tag and the tag it sat under, written PARENT.TAG as the
// standard writes it (HEAD.CHAR.VERS is VERS under CHAR, which sat under HEAD; EVEN.RESN is RESN
// under any event). Every one is allowed in 5.5.1 and not in 5.5.5.
const REMOVED_BY_555 = [
  ['VERS', 'CHAR'], ['PLAC', 'HEAD'], ['FORM', 'PLAC'], ['SUBN', 'HEAD'], ['RESN', 'EVEN'], ['RESN', 'FAM'],
  ['STAT', 'FAMC'], ['SUBM', 'FAM'], ['RESN', 'INDI'], ['SUBM', 'INDI'], ['AFN', 'INDI'], ['ALIA', 'INDI'],
  ['ANCI', 'INDI'], ['DESI', 'INDI'], ['RFN', 'INDI'], ['LANG', 'SUBM'], ['RFN', 'SUBM'], ['SUBN', 'record'],
  ['BAPL', 'INDI'], ['BLES', 'INDI'], ['CONL', 'INDI'], ['ENDL', 'INDI'], ['ORDN', 'INDI'], ['SLGC', 'INDI'],
  ['SSN', 'INDI'], ['SLGS', 'FAM'],
];

describe('the places in 5.5.5: what it took out, and the little it put in', () => {
  const three = (tag, parent) => [allowedUnder(tag, parent, V551), allowedUnder(tag, parent, V555), allowedUnder(tag, parent, V7)];

  it('takes out every line its tables of obsolete and duplicate records name: allowed in 5.5.1, not in 5.5.5', () => {
    assert.equal(REMOVED_BY_555.length, 18 + 8);
    for (const [tag, parent] of REMOVED_BY_555) {
      assert.equal(allowedUnder(tag, parent, V551), true, `${tag} under ${parent} in 5.5.1`);
      assert.equal(allowedUnder(tag, parent, V555), false, `${tag} under ${parent} in 5.5.5`);
    }
  });

  it('the one place 5.5.5 gives a tag that 5.5.1 did not is VERS under FORM, the version of the GEDCOM form', () => {
    const added = [];
    for (const e of TAGS.filter((t) => t.versions.includes(V555))) {
      for (const p of e.under[V555]) if (!e.under[V551].includes(p)) added.push(`${e.tag} under ${p}`);
    }
    assert.deepEqual(added, ['VERS under FORM']);
    assert.deepEqual(three('VERS', 'FORM'), [false, true, false]);
    assert.deepEqual(three('VERS', 'CHAR'), [true, false, false]);
  });

  it('keeps one submitter, no address of its own for the file: HEAD.SUBM stays, FAM.SUBM and INDI.SUBM go', () => {
    assert.deepEqual(three('SUBM', 'HEAD'), [true, true, true]);
    assert.deepEqual(three('SUBM', 'FAM'), [true, false, true]);
    assert.deepEqual(three('SUBM', 'INDI'), [true, false, true]);
    assert.deepEqual(three('SUBM', 'record'), [true, true, true]);
    assert.deepEqual(three('SUBN', 'record'), [true, false, false]);
    assert.deepEqual(three('PLAC', 'HEAD'), [true, false, true], 'HEAD.PLAC: 7.0 kept it');
  });

  it('keeps the events and facts that are not duplicates: 21 events and 13 facts on a person', () => {
    for (const tag of words(PERSON_EVENTS_555)) assert.equal(allowedUnder(tag, 'INDI', V555), true, tag);
    for (const tag of words(PERSON_FACTS_555)) assert.equal(allowedUnder(tag, 'INDI', V555), true, tag);
    for (const tag of ['BLES', 'ORDN', 'SSN', 'BAPL', 'CONL', 'ENDL', 'SLGC', 'INIL']) assert.equal(allowedUnder(tag, 'INDI', V555), false, tag);
    // the detail lines of an event sit under the events 5.5.5 keeps, and under none it dropped
    for (const tag of ['DATE', 'PLAC', 'ADDR', 'TYPE', 'AGNC', 'CAUS', 'AGE']) {
      assert.equal(allowedUnder(tag, 'BIRT', V555), true, tag);
      for (const dropped of ['BLES', 'ORDN', 'SSN', 'BAPL']) assert.equal(allowedUnder(tag, dropped, V555), false, `${tag} under ${dropped}`);
    }
  });

  it('keeps no value on an address: its lines are ADR1 to CTRY, so no CONT or CONC sits under ADDR', () => {
    assert.deepEqual(three('CONT', 'ADDR'), [true, false, true]);
    assert.deepEqual(three('CONC', 'ADDR'), [true, false, false]);
    for (const tag of words('ADR1 ADR2 ADR3 CITY STAE POST CTRY')) assert.equal(allowedUnder(tag, 'ADDR', V555), true, tag);
  });

  it('lets CONC and CONT carry a long value under any tag that holds one, bar the header\'s own CHAR', () => {
    assert.deepEqual(entry('CONC').versions, [V551, V555]);
    for (const parent of ['NOTE', 'TEXT', 'AUTH', 'TITL', 'PUBL', 'DSCR', 'COPR', 'SOUR', 'PAGE', 'OCCU', 'NAME', 'DATE', 'LANG', 'FILE']) {
      assert.equal(allowedUnder('CONC', parent, V555), true, `CONC under ${parent}`);
      assert.equal(allowedUnder('CONT', parent, V555), true, `CONT under ${parent}`);
    }
    // VERS and FORM are in the header's basic lines and elsewhere (SOUR.VERS, FILE.FORM); the table sees one level
    for (const parent of ['VERS', 'FORM']) assert.equal(allowedUnder('CONT', parent, V555), true, parent);
    for (const parent of ['record', 'HEAD', 'GEDC', 'CHAR', 'INDI', 'FAM', 'BIRT', 'FAMC', 'HUSB', 'CHAN', 'MAP', 'CONT', 'CONC']) {
      assert.equal(allowedUnder('CONT', parent, V555), false, `CONT under ${parent} in 5.5.5`);
      assert.equal(allowedUnder('CONC', parent, V555), false, `CONC under ${parent} in 5.5.5`);
    }
  });

  it('writes a multimedia record with one file: TITL under FILE, the media type in TYPE under FORM, not MEDI', () => {
    assert.deepEqual(three('TITL', 'OBJE'), [true, false, true]);
    assert.deepEqual(three('TITL', 'FILE'), [true, true, true]);
    assert.deepEqual(three('MEDI', 'FORM'), [true, false, true]);
    assert.deepEqual(three('MEDI', 'CALN'), [true, true, true]);
    assert.deepEqual(three('TYPE', 'FORM'), [true, true, false], '7.0 keeps the media type in MEDI');
    assert.deepEqual(three('FILE', 'OBJE'), [true, true, true]);
    assert.deepEqual(three('FILE', 'HEAD'), [true, true, false]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('what makes a tag, version by version (tagKind)', () => {
  const kinds = (tag, declared) => VERSIONS.map((v) => tagKind(tag, v, declared));
  const long = (n) => `_${'X'.repeat(n - 1)}`;      // an extension tag n characters long, the underscore counted

  it('knows the three versions, and answers null for any other', () => {
    for (const version of ['5.5', '5', '7', '7.0.18', '7.1', '', undefined, null, 551, 'V7']) {
      assert.equal(tagKind('NAME', version), null, String(version));
      assert.equal(tagKind('_APID', version), null, String(version));
      assert.equal(tagKind('FAM9', version), null, String(version));
    }
  });

  it('calls a tag standard in the versions whose table has it, and malformed in the others, with the underscore tags apart', () => {
    for (const e of TAGS) {
      for (const version of VERSIONS) assert.equal(tagKind(e.tag, version), e.versions.includes(version) ? 'standard' : 'malformed', `${e.tag} in ${version}`);
    }
    assert.deepEqual(kinds('SNOTE'), ['malformed', 'malformed', 'standard'], 'a tag only 7.0 defines');
    assert.deepEqual(kinds('SSN'), ['standard', 'malformed', 'standard'], '5.5.5 retired it');
    assert.deepEqual(kinds('CONC'), ['standard', 'standard', 'malformed'], '7.0 has no CONC');
    assert.deepEqual(kinds('NAME'), ['standard', 'standard', 'standard']);
    // a tag another version defines can be told apart by the table: it has a meaning
    assert.equal(typeof meaning('SNOTE'), 'string');
  });

  it('calls a made-up tag, a tag that is not a tag and anything but a string malformed, in every version', () => {
    for (const tag of ['FAM9', 'FAMILY', 'NAME2', '9FAM', 'birt', 'Birt', '', ' ', 'NAME ', 'FAM-9', 'FAM 9', 'URL', 'WWW2', 'AB.CD', 'A\u00e9', undefined, null, 5, {}, ['NAME']]) {
      assert.deepEqual(kinds(tag), ['malformed', 'malformed', 'malformed'], String(tag));
    }
    // nothing from Object.prototype is a tag; __proto__ is a well formed user-defined tag in 5.5.1 only, and is no more than that
    assert.deepEqual(kinds('constructor'), ['malformed', 'malformed', 'malformed']);
    assert.deepEqual(kinds('toString'), ['malformed', 'malformed', 'malformed']);
    assert.deepEqual(kinds('__proto__'), ['custom', 'malformed', 'malformed']);
  });

  describe('5.5.1: letters, digits and underscores, 31 at most, an underscore first for what the standard does not define', () => {
    it('calls an underscore tag custom, in any case, with more underscores, with digits, and the underscore alone', () => {
      for (const tag of ['_APID', '_META', '_A_B', '_a', '_apid', '_Mixed_Case', '_3D', '_1', '_', '__', '_CITY', '_SSN', '_NAME', '_SNOTE']) {
        assert.equal(tagKind(tag, V551), 'custom', tag);
      }
    });

    it('allows 31 characters and no more, the underscore counted', () => {
      assert.equal(tagKind(long(31), V551), 'custom');
      assert.equal(tagKind(long(32), V551), 'malformed');
      assert.equal(tagKind(long(200), V551), 'malformed');
    });

    it('allows nothing but letters, digits and underscores', () => {
      for (const tag of ['_FOO-BAR', '_FOO BAR', '_FOO.BAR', '_FOO@', '_FOO\u00e9', '_FOO\n', ' _FOO', '_FOO ']) assert.equal(tagKind(tag, V551), 'malformed', JSON.stringify(tag));
    });

    it('does not read the declaration, which only 7.0 has', () => {
      assert.equal(tagKind('_APID', V551, new Set()), 'custom');
      assert.equal(tagKind('_APID', V551, ['_APID']), 'custom');
    });
  });

  describe('5.5.5: an optional underscore and then letters and digits, 31 at most, and not a standard tag in disguise', () => {
    it('calls an underscore tag custom, with digits first, and in lower case (advice, not a rule)', () => {
      for (const tag of ['_APID', '_META', '_3D', '_1', '_apid', '_Mixed', '_SNOTE', '_INIL', '_ZZZ']) assert.equal(tagKind(tag, V555), 'custom', tag);
    });

    it('allows the underscore only first and not alone', () => {
      for (const tag of ['_A_B', '_EVENT_DEFN', '_PLAC_DEFN', '_A_', '__', '_', '_A-B']) assert.equal(tagKind(tag, V555), 'malformed', tag);
    });

    it('allows 31 characters and no more', () => {
      assert.equal(tagKind(long(31), V555), 'custom');
      assert.equal(tagKind(long(32), V555), 'malformed');
    });

    it('bars a standard tag with an underscore in front, and a tag the standard retired: "It is illegal to use _CITY for anything"', () => {
      for (const tag of ['_CITY', '_NAME', '_DATE', '_PLAC', '_TYPE', '_EMAIL', '_NOTE', '_HEAD', '_TRLR', '_CONC', '_CONT', '_VERS']) assert.equal(tagKind(tag, V555), 'malformed', tag);
      for (const tag of ['_SSN', '_BLES', '_BAPL', '_STAT', '_TEMP', '_RESN', '_SUBN', '_ANCE', '_RFN', '_AFN']) assert.equal(tagKind(tag, V555), 'malformed', `${tag}, retired`);
      // all of it: every tag 5.5.1 or 5.5.5 defines, with an underscore in front, but not the tags only 7.0 has
      for (const e of TAGS) {
        assert.equal(tagKind(`_${e.tag}`, V555), e.versions.some((v) => v !== V7) ? 'malformed' : 'custom', `_${e.tag}`);
      }
      assert.equal(tagKind('_SNOTE', V555), 'custom', 'a tag of a newer standard may be carried as an extension in an older file');
      // the same tags are free in 5.5.1 and in 7.0, which have no such rule
      for (const tag of ['_CITY', '_NAME', '_SSN', '_PLAC']) {
        assert.equal(tagKind(tag, V551), 'custom', tag);
        assert.equal(tagKind(tag, V7), 'undeclared', tag);
      }
    });

    it('does not read the declaration, which only 7.0 has', () => {
      assert.equal(tagKind('_APID', V555, new Set()), 'custom');
      assert.equal(tagKind('_APID', V555, ['_APID']), 'custom');
    });
  });

  describe('7.0: capital letters, digits and underscores, an underscore first for an extension, no limit, declared in the header or not', () => {
    it('calls an extension tag undeclared unless the header declares it', () => {
      assert.equal(tagKind('_APID', V7), 'undeclared');
      assert.equal(tagKind('_APID', V7, null), 'undeclared');
      assert.equal(tagKind('_APID', V7, new Set()), 'undeclared');
      assert.equal(tagKind('_APID', V7, []), 'undeclared');
      assert.equal(tagKind('_APID', V7, new Set(['_APID'])), 'custom');
      assert.equal(tagKind('_APID', V7, ['_APID', '_META']), 'custom');
      assert.equal(tagKind('_META', V7, new Set(['_APID'])), 'undeclared', 'declaring one tag declares only that one');
    });

    it('reads the declaration as a Set or an array only, from another realm too, and as exact tags', () => {
      assert.equal(tagKind('_APID', V7, vm.runInNewContext('new Set(["_APID"])')), 'custom');
      assert.equal(tagKind('_APID', V7, vm.runInNewContext('["_APID"]')), 'custom');
      for (const wrong of ['_APID', { _APID: true }, 5, true, () => true]) assert.equal(tagKind('_APID', V7, wrong), 'undeclared', String(wrong));
      assert.equal(tagKind('_APID', V7, new Set(['_apid'])), 'undeclared');
      assert.equal(tagKind('_APID', V7, new Set(['APID'])), 'undeclared');
    });

    it('allows capital letters, digits and underscores after the first underscore, as often as it likes', () => {
      for (const tag of ['_APID', '_A', '_A_B', '__', '___', '_3D', '_1', '_EVENT_DEFN', '_CITY', '_SSN', '_SNOTE', '_NAME']) assert.equal(tagKind(tag, V7), 'undeclared', tag);
      assert.equal(tagKind(long(200), V7), 'undeclared', 'no limit on length');
      assert.equal(tagKind(long(200), V7, [long(200)]), 'custom');
    });

    it('bars lower case, the underscore alone and anything else', () => {
      for (const tag of ['_apid', '_Apid', '_aPID', '_', '_FOO-BAR', '_FOO BAR', '_FOO.BAR', '_FOO\u00e9', ' _FOO', '_FOO ', '_FOO\n']) assert.equal(tagKind(tag, V7), 'malformed', JSON.stringify(tag));
      assert.equal(tagKind('_apid', V7, new Set(['_apid'])), 'malformed', 'even when the header declares it');
    });

    it('calls a tag shaped like a standard one, but not defined, malformed: it is prohibited', () => {
      assert.equal(tagKind('FAM9', V7), 'malformed');
      assert.equal(tagKind('FAM9', V7, ['FAM9']), 'malformed');
      assert.equal(tagKind('SSN', V7), 'standard');
      assert.equal(tagKind('BLES', V7), 'standard');
    });
  });

  it('is exact about the version: the same tag is judged by the version asked for, not by the file or the others', () => {
    assert.deepEqual(kinds('_APID'), ['custom', 'custom', 'undeclared']);
    assert.deepEqual(kinds('_A_B'), ['custom', 'malformed', 'undeclared']);
    assert.deepEqual(kinds('_apid'), ['custom', 'custom', 'malformed']);
    assert.deepEqual(kinds('_CITY'), ['custom', 'malformed', 'undeclared']);
    assert.deepEqual(kinds('_'), ['custom', 'malformed', 'malformed']);
    assert.deepEqual(kinds('_APID', ['_APID']), ['custom', 'custom', 'custom']);
  });

  it('reads the version a file declares, by versionFor, and judges its tags by that', () => {
    assert.equal(tagKind('_EMAIL', versionFor('5.5'), []), 'custom', 'legal in 5.5, which lacks EMAIL (5.5.5 says so)');
    assert.equal(tagKind('EMAIL', versionFor('5.5'), []), 'standard');
    assert.equal(tagKind('_EMAIL', versionFor('5.5.5'), []), 'malformed');
    assert.equal(tagKind('_EMAIL', versionFor('7.0'), []), 'undeclared');
  });
});

// ---------------------------------------------------------------------------------------------
describe('the version a file declares (versionFor)', () => {
  it('reads 5.5.1, 5.5.5 and 7.0 as themselves, and any other 7.x as 7.0', () => {
    assert.equal(versionFor('5.5.1'), V551);
    assert.equal(versionFor('5.5.5'), V555);
    assert.equal(versionFor('7.0'), V7);
    for (const declared of ['7.0.18', '7.0.0', '7.1', '7.1.2', '7.12', '7.0.3.1']) assert.equal(versionFor(declared), V7, declared);
  });

  it('reads 5.5, and anything else, or nothing, as 5.5.1', () => {
    for (const declared of ['5.5', '5.4', '4.0', '3.0', '6.0', '7', '8.0', '5.5.2', '5.5.1.1', '5.5.5.1', '5.6', 'v7.0', '7.x', '7.', 'seven', '', ' ', '\n', undefined, null, 5.5, 7, {}, [], ['7.0']]) {
      assert.equal(versionFor(declared), V551, String(declared));
    }
  });

  it('ignores white space around the value, which a line may carry', () => {
    assert.equal(versionFor(' 5.5.5 '), V555);
    assert.equal(versionFor('7.0 '), V7);
    assert.equal(versionFor('\t5.5.1'), V551);
  });

  it('always gives one of the three versions', () => {
    for (const declared of ['5.5', '5.5.1', '5.5.5', '7.0', '7.0.18', '9.9', '', undefined]) assert.ok(VERSIONS.includes(versionFor(declared)), String(declared));
  });
});

// ---------------------------------------------------------------------------------------------
// The sources the legend of tags.js names: each custom tag is in the list under a comment that
// names at least one of these, so that a tag with no source cannot be added.
const SOURCES = ['Legacy', 'Gramps', 'Gramps forum', 'FHUG', 'Behold', 'Jones', 'GEDCOM 5.5.5', 'Ancestris', 'README'];
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('the well known custom tags (customMeaning)', () => {
  it('is a list in order of tag, each with a tag, a line of plain words and the programs that write it, and nothing else', () => {
    assert.equal(CUSTOM_TAGS.length, 29);      // pinned, so that a tag is added or dropped on purpose
    assert.deepEqual(CUSTOM_TAGS.map((e) => e.tag), sorted(CUSTOM_TAGS.map((e) => e.tag)));
    assert.equal(new Set(CUSTOM_TAGS.map((e) => e.tag)).size, CUSTOM_TAGS.length, 'a tag twice');
    for (const e of CUSTOM_TAGS) {
      assert.deepEqual(Object.keys(e).sort(), ['meaning', 'tag', 'vendor'], e.tag);
      assert.match(e.tag, /^_[A-Z0-9_]+$/, e.tag);       // an extension tag of 7.0, so a well formed one in 5.5.1 as well
      assert.match(e.meaning, /^[A-Z][\x20-\x7e]*\.$/, `${e.tag}: ${e.meaning}`);
      assert.ok(e.meaning.length <= 90, `${e.tag} is ${e.meaning.length} characters`);
      assert.match(e.vendor, /^[A-Za-z][\x20-\x7e]*[A-Za-z)]$/, `${e.tag}: ${e.vendor}`);
      assert.ok(e.vendor.length <= 70, `${e.tag}: vendor of ${e.vendor.length} characters`);
      assert.ok(!/[\u2014\u2013\u00b7]/.test(e.meaning + e.vendor), `${e.tag}: a dash or a middle dot`);
    }
  });

  it('holds no tag the standards define, and every one is custom in 5.5.1, and undeclared or custom in 7.0', () => {
    for (const e of CUSTOM_TAGS) {
      assert.equal(meaning(e.tag), null, e.tag);
      assert.equal(tagKind(e.tag, V551), 'custom', e.tag);
      assert.equal(tagKind(e.tag, V7), 'undeclared', e.tag);
      assert.equal(tagKind(e.tag, V7, [e.tag]), 'custom', e.tag);
    }
  });

  it('shows which of them a 5.5.5 file could not keep: a standard tag with an underscore in front, or an extra underscore', () => {
    const malformed = CUSTOM_TAGS.filter((e) => tagKind(e.tag, V555) === 'malformed').map((e) => e.tag);
    assert.deepEqual(malformed, ['_DATE', '_EMAIL', '_EVENT_DEFN', '_PLAC', '_PLAC_DEFN', '_STAT', '_TYPE']);
  });

  it('names each source in a comment above each tag, and only sources the legend knows', () => {
    for (const e of CUSTOM_TAGS) {
      const at = source.indexOf(`{ tag: '${e.tag}',`);
      assert.ok(at > 0, `${e.tag} is not written in tags.js`);
      const above = source.slice(0, at).split('\n');
      const comment = above[above.length - 2];             // the line before the one the tag starts on
      assert.match(comment, /^ {4}\/\/ .+\.$/, `${e.tag}: the line above is not a source comment`);
      for (const named of comment.replace(/^ {4}\/\/ /, '').replace(/\.$/, '').split('; ')) {
        assert.ok(SOURCES.some((s) => named === s || named.startsWith(`${s}, `)), `${e.tag}: source "${named}"`);
      }
    }
    // and the legend names every source, at the start of a line of its own
    for (const s of SOURCES) assert.match(source, new RegExp(`^ {2}//   ${escapeRe(s)}\\b`, 'm'), s);
  });

  it('gives the line and the vendor of a tag, and null for anything else', () => {
    const apid = customMeaning('_APID');
    assert.deepEqual(Object.keys(apid).sort(), ['meaning', 'tag', 'vendor']);
    assert.equal(apid.tag, '_APID');
    assert.equal(apid.vendor, 'Ancestry');
    assert.match(apid.meaning, /Ancestry/);
    assert.match(customMeaning('_MREL').meaning, /mother/);
    assert.match(customMeaning('_FREL').meaning, /father/);
    assert.equal(customMeaning('_MTTAG').vendor, 'Ancestry');
    assert.equal(customMeaning('_MTCAT').vendor, 'Ancestry');
    assert.equal(customMeaning('_META').vendor, 'Ancestry');
    assert.match(customMeaning('_UID').vendor, /PAF.*Legacy.*RootsMagic/);
    assert.match(customMeaning('_SDATE').meaning, /sort/);
    assert.match(customMeaning('_PLAC').vendor, /RootsMagic/);
    for (const e of CUSTOM_TAGS) assert.equal(customMeaning(e.tag), e, e.tag);
    for (const odd of ['_NOPE', '_apid', ' _APID', '_APID ', 'APID', 'NAME', 'BIRT', '', '_', undefined, null, 5, {}, ['_APID'], 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.equal(customMeaning(odd), null, String(odd));
    }
  });

  it('leaves out what no source describes: _OID, _FSFTID, _TREE, _ENV, _VISI, _RTLSAVE', () => {
    for (const tag of ['_OID', '_FSFTID', '_TREE', '_ENV', '_VISI', '_RTLSAVE']) assert.equal(customMeaning(tag), null, tag);
  });
});

// ---------------------------------------------------------------------------------------------
// Files are read here with a few lines of their own, so that this test needs nothing but the table.
// The shape of a line is the brief's 6.3.
const SHAPE = /^(0|[1-9][0-9]*) (?:(@[^@ ]+@) )?([A-Za-z0-9_]+)(?: (.*))?$/s;

// The lines of a text that have the shape of a line: level, tag and value, and the tag of the line
// each belongs to, which is the nearest line above with one level less ('record' at level 0, and
// none when a level is skipped).
function linesOf(text, file) {
  const out = [];
  const stack = [];
  text.split(/\r\n|\n\r|\n|\r/).forEach((raw, i) => {
    const m = SHAPE.exec(raw.replace(/^[ \t]+/, ''));
    if (!m) return;
    const level = Number(m[1]);
    stack.length = Math.min(stack.length, level);
    out.push({ file, number: i + 1, level, tag: m[3], value: m[4], parent: level === 0 ? 'record' : stack[level - 1] });
    stack[level] = m[3];
  });
  return out;
}

// The version a file says it is, by versionFor: its GEDC.VERS read as 5.5.1, 5.5.5 or 7.0.
function versionOf(lines) {
  const vers = lines.find((l) => l.tag === 'VERS' && l.parent === 'GEDC');
  return versionFor(vers && vers.value);
}

// The extension tags a 7.0 file's header declares: the first word of each TAG line under SCHMA.
function declaredIn(lines) {
  return new Set(lines.filter((l) => l.tag === 'TAG' && l.parent === 'SCHMA').map((l) => (l.value || '').split(' ')[0]));
}

// The lines that the table can judge: the line has a parent, and neither is an extension.
const judgeable = (lines) => lines.filter((l) => l.parent !== undefined && !l.tag.startsWith('_') && !l.parent.startsWith('_'));
const notAllowed = (lines, version) => lines.filter((l) => allowedUnder(l.tag, l.parent, version) !== true)
  .map((l) => `${l.file}:${l.number} ${l.tag} under ${l.parent}`);

// ---------------------------------------------------------------------------------------------
const fixtureFiles = () => fs.readdirSync(SYNTHETIC).filter((name) => /\.ged$/i.test(name)).sort();
const readFixture = (name) => linesOf(fs.readFileSync(path.join(SYNTHETIC, name)).toString('latin1'), name);   // one character a byte: no byte is invalid

// A file that is written to be flagged by a later check may use a tag the standards do not have
// (FAM9), or put a standard tag where it does not belong. Name such tags and files here, so that
// the two tests below go on saying something about all the others.
const MADE_UP_ON_PURPOSE = new Set([]);          // tags
const PLACED_WRONG_ON_PURPOSE = new Set([]);     // file names

describe('the written files of fixtures/synthetic/', () => {
  const files = fixtureFiles().map((name) => ({ name, lines: readFixture(name) }));
  const all = files.flatMap((f) => f.lines);

  it('every standard tag they use is in the table, and the extension tags they use are not', () => {
    assert.ok(files.length >= 17, 'the files of the folder');
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

  it('every line whose parent is there sits where its file\'s own version allows it (5.5.1 unless GEDC.VERS says otherwise), bar the lines the files are written to break', () => {
    let judged = 0;
    const out = [];
    for (const f of files) {
      if (PLACED_WRONG_ON_PURPOSE.has(f.name)) continue;
      const lines = judgeable(f.lines).filter((l) => !MADE_UP_ON_PURPOSE.has(l.tag) && !MADE_UP_ON_PURPOSE.has(l.parent));
      judged += lines.length;
      out.push(...notAllowed(lines, versionOf(f.lines)));
    }
    assert.ok(judged > 100, `${judged} lines judged`);
    assert.deepEqual(out, []);
  });

  it('every tag they use is standard or a custom one in the version they say, bar the tags the files are written to break', () => {
    for (const f of files) {
      const version = versionOf(f.lines);
      for (const l of f.lines) {
        if (MADE_UP_ON_PURPOSE.has(l.tag)) continue;
        assert.ok(['standard', 'custom'].includes(tagKind(l.tag, version)), `${f.name}:${l.number} ${l.tag} is ${tagKind(l.tag, version)} in ${version}`);
      }
    }
  });

  it('say VERS 5.5.1, every one of them, so the table they are judged by is the 5.5.1 one', () => {
    for (const f of files) assert.equal(versionOf(f.lines), V551, f.name);
  });
});

// ---------------------------------------------------------------------------------------------
// A small 5.5.1 file written to show what 5.5.5 took out of it (the standard's tables of obsolete
// and duplicate records). Every line is allowed in 5.5.1; the tests above list those 5.5.5 does not
// allow. Fictional, and no other tag of 5.5.1 is in it that 5.5.5 lacks.
const FILE_551_OLD = `0 HEAD
1 SOUR Fixture
1 SUBM @U1@
1 SUBN @N1@
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
2 VERS 1
1 PLAC
2 FORM City, Country
0 @U1@ SUBM
1 NAME Jane Fixture
1 LANG English
1 ADDR 1 Fixture Street
2 CONT Fixtureville
0 @N1@ SUBN
1 SUBM @U1@
1 ANCE 1
0 @I1@ INDI
1 RESN confidential
1 NAME Jane /Fixture/
1 BLES
2 DATE 1 JAN 1900
1 ORDN
2 DATE 1 JAN 1901
1 SSN 123
1 BAPL
2 DATE 1 JAN 1902
2 TEMP Fixture Temple
1 SLGC
2 FAMC @F1@
1 ALIA @I2@
1 SUBM @U1@
1 RFN 1
1 FAMC @F1@
2 STAT proven
0 @I2@ INDI
1 NAME Joe /Fixture/
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I1@
1 SLGS
2 DATE 1 JAN 1930
0 TRLR
`;

describe('a 5.5.1 file with what 5.5.5 took out', () => {
  const file = linesOf(FILE_551_OLD, 'FILE_551_OLD');

  it('says VERS 5.5.1, and every line is allowed in 5.5.1', () => {
    assert.equal(versionOf(file), V551);
    assert.ok(judgeable(file).length > 40);
    assert.deepEqual(notAllowed(judgeable(file), V551), []);
  });

  it('judged by 5.5.5, names what a file has to change: its LDS and Ancestral File lines, and the lines below them', () => {
    assert.deepEqual(notAllowed(judgeable(file), V555).map((line) => line.replace(/^FILE_551_OLD:\d+ /, '')), [
      'SUBN under HEAD', 'VERS under CHAR', 'PLAC under HEAD', 'FORM under PLAC', 'LANG under SUBM', 'CONT under ADDR',
      'SUBN under record', 'SUBM under SUBN', 'ANCE under SUBN', 'RESN under INDI', 'BLES under INDI', 'DATE under BLES',
      'ORDN under INDI', 'DATE under ORDN', 'SSN under INDI', 'BAPL under INDI', 'DATE under BAPL', 'TEMP under BAPL',
      'SLGC under INDI', 'FAMC under SLGC', 'ALIA under INDI', 'SUBM under INDI', 'RFN under INDI', 'STAT under FAMC',
      'SLGS under FAM', 'DATE under SLGS',
    ]);
  });

  it('judged by 7.0, which kept the LDS lines and most of the others, names fewer: no header, no 5.5.1 form', () => {
    const out = notAllowed(judgeable(file), V7).map((line) => line.replace(/^FILE_551_OLD:\d+ /, ''));
    assert.ok(out.includes('CHAR under HEAD') && out.includes('FORM under GEDC') && out.includes('SUBN under record'));
    assert.ok(!out.includes('BLES under INDI') && !out.includes('SSN under INDI') && !out.includes('BAPL under INDI'));
  });
});

// ---------------------------------------------------------------------------------------------
// A small 7.0 file written for the table (the files above are all 5.5.1). Fictional, and wrong in
// no way a 7.0 reader would mind: each line sits where the 7.0 text puts it. It uses 7.0 tags that
// 5.5.1 has not (SNOTE, CREA, EXID, UID, NO, SDATE, PHRASE, TRAN, MIME, CROP, SCHMA and the like).
const FILE_7 = `0 HEAD
1 GEDC
2 VERS 7.0
1 SCHMA
2 TAG _MEMBER member
1 SOUR Fixture
2 VERS 1
2 NAME Fixture Maker
2 CORP Fixture Company
3 ADDR 1 Fixture Street
3 PHON 555 0100
3 EMAIL maker@example.test
3 WWW example.test
2 DATA Fixture Data
3 DATE 1 JAN 2020
4 TIME 10:00:00Z
3 COPR Fixture
1 DEST Fixture
1 DATE 1 JAN 2020
2 TIME 10:00:00Z
1 SUBM @U1@
1 COPR Fixture
1 LANG en
1 PLAC
2 FORM City, Country
1 NOTE about the file
2 MIME text/plain
2 LANG en
2 TRAN sur le fichier
3 LANG fr
0 @U1@ SUBM
1 NAME Jane Fixture
1 ADDR 1 Fixture Street
2 CONT Fixtureville
2 CITY Fixtureville
1 PHON 555 0100
1 LANG en
1 CHAN
2 DATE 1 JAN 2020
0 @N1@ SNOTE shared
1 MIME text/plain
1 TRAN partage
2 LANG fr
1 UID 11111111-1111-4111-8111-111111111111
0 @I1@ INDI
1 RESN PRIVACY
1 NAME Jane /Fixture/
2 TYPE BIRTH
3 PHRASE as at birth
2 NPFX Dr.
2 GIVN Jane
2 NICK Janey
2 SPFX de
2 SURN Fixture
2 NSFX Jr.
2 TRAN Jane /Fixture/
3 LANG en
3 GIVN Jane
2 NOTE about the name
2 SNOTE @N1@
2 SOUR @S1@
3 PAGE 1
1 SEX F
1 OCCU baker
2 TYPE trade
2 DATE FROM 1900 TO 1910
2 AGE 30y
3 PHRASE thirty
2 PLAC Fixtureville, Fixtureland
3 FORM City, Country
3 LANG en
3 TRAN Fixtureville, Fixtureland
4 LANG fr
3 MAP
4 LATI N18.150944
4 LONG E168.150944
3 EXID 123
4 TYPE https://example.test/ids
3 NOTE about the place
2 ADDR 1 Fixture Street
2 PHON 555 0100
2 AGNC Fixture Bakery
2 CAUS none
2 RELI none
2 RESN LOCKED
2 SDATE 1900
3 TIME 8:00
3 PHRASE early
2 ASSO @I2@
3 ROLE FRIEND
3 PHRASE a friend
2 NOTE about the work
2 SOUR @S1@
2 OBJE @O1@
3 CROP
4 TOP 1
4 LEFT 1
4 HEIGHT 10
4 WIDTH 10
3 TITL a picture
2 UID 22222222-2222-4222-8222-222222222222
1 BIRT
2 DATE 1 JAN 1900
3 TIME 8:00
3 PHRASE early
2 FAMC @F1@
2 SOUR @S1@
3 PAGE 12
3 DATA
4 DATE 1 JAN 1900
5 PHRASE the day
4 TEXT the entry
5 MIME text/plain
5 LANG en
3 EVEN BIRT
4 PHRASE a birth
4 ROLE CHIL
5 PHRASE the child
3 QUAY 3
3 OBJE @O1@
3 NOTE about the source
1 ADOP
2 FAMC @F1@
3 ADOP BOTH
4 PHRASE both
1 NO MARR
2 DATE TO 1900
3 PHRASE up to then
2 NOTE never
2 SOUR @S1@
1 BAPL
2 DATE 1 JAN 1910
2 TEMP Fixture Temple
2 PLAC Fixtureville
2 STAT COMPLETED
3 DATE 1 JAN 2000
4 TIME 9:00
2 NOTE done
2 SOUR @S1@
1 INIL
1 SLGC
2 FAMC @F1@
1 FACT skill
2 TYPE skills
1 NCHI 1
1 RESI here
1 FAMC @F1@
2 PEDI BIRTH
3 PHRASE by birth
2 STAT PROVEN
3 PHRASE proven
2 NOTE about the link
1 FAMS @F1@
2 NOTE about the link
1 SUBM @U1@
1 ALIA @I2@
2 PHRASE the same
1 ANCI @U1@
1 DESI @U1@
1 REFN 1
2 TYPE mine
1 UID 33333333-3333-4333-8333-333333333333
1 EXID 456
2 TYPE https://example.test/ids
1 NOTE about the person
2 LANG en
1 SNOTE @N1@
1 SOUR @S1@
1 OBJE @O1@
1 CHAN
2 DATE 1 JAN 2020
3 TIME 10:00:00Z
2 NOTE changed
1 CREA
2 DATE 1 JAN 2019
0 @I2@ INDI
1 NAME Joe /Fixture/
1 BAPM Y
1 BARM Y
1 BASM Y
1 BLES Y
1 BURI Y
1 CENS Y
1 CHR Y
1 CHRA Y
1 CONF Y
1 CREM Y
1 DEAT Y
1 EMIG Y
1 FCOM Y
1 GRAD Y
1 IMMI Y
1 NATU Y
1 ORDN Y
1 PROB Y
1 RETI Y
1 WILL Y
1 EVEN a general event
2 TYPE events
1 CAST a caste
1 DSCR tall
1 EDUC school
1 IDNO 1
2 TYPE card
1 NATI Fixtureland
1 NMR 1
1 PROP a house
1 SSN 123
1 TITL Duke
1 CONL
1 ENDL
0 @F1@ FAM
1 RESN PRIVACY
1 NCHI 1
2 TYPE counted
1 RESI together
1 FACT trait
2 TYPE traits
1 MARR
2 TYPE civil
2 HUSB
3 AGE 30y
4 PHRASE thirty
2 WIFE
3 AGE 25y
2 DATE 1 JAN 1899
2 PLAC Fixtureville
1 NO DIV
1 HUSB @I2@
2 PHRASE the father
1 WIFE @I1@
1 CHIL @I1@
2 PHRASE the child
1 ASSO @I2@
2 ROLE OTHER
1 SUBM @U1@
1 SLGS
2 DATE 1 JAN 1930
1 REFN 2
1 UID 44444444-4444-4444-8444-444444444444
1 EXID 789
1 NOTE about the family
1 SNOTE @N1@
1 SOUR @S1@
1 OBJE @O1@
1 CHAN
2 DATE 1 JAN 2020
1 CREA
2 DATE 1 JAN 2019
0 @F2@ FAM
1 ANUL Y
1 CENS Y
1 DIV Y
1 DIVF Y
1 ENGA Y
1 MARB Y
1 MARC Y
1 MARL Y
1 MARS Y
1 EVEN a family event
2 TYPE events
0 @O1@ OBJE
1 RESN CONFIDENTIAL
1 FILE media/fixture.jpg
2 FORM image/jpeg
3 MEDI PHOTO
4 PHRASE a print
2 TITL a picture
2 TRAN media/fixture.png
3 FORM image/png
1 REFN 3
1 UID 55555555-5555-4555-8555-555555555555
1 EXID 12
1 NOTE about the picture
1 SOUR @S1@
1 CHAN
2 DATE 1 JAN 2020
1 CREA
2 DATE 1 JAN 2019
0 @R1@ REPO
1 NAME Fixture Library
1 ADDR 35 Fixture Street
2 ADR1 35 Fixture Street
2 ADR2 Fixtureville
2 ADR3 Fixtureland
2 CITY Fixtureville
2 STAE FL
2 POST 12345
2 CTRY Fixtureland
1 PHON 555 0101
1 EMAIL library@example.test
1 FAX 555 0102
1 WWW library.example.test
1 NOTE about the library
1 REFN 4
1 UID 66666666-6666-4666-8666-666666666666
1 EXID 34
1 CHAN
2 DATE 1 JAN 2020
1 CREA
2 DATE 1 JAN 2019
0 @S1@ SOUR
1 DATA
2 EVEN BIRT, DEAT
3 DATE FROM 1800 TO 1900
4 PHRASE the century
3 PLAC Fixtureville
2 AGNC Fixture Archive
2 NOTE about the data
1 AUTH Fixture Author
1 TITL Fixture Records
1 ABBR Records
1 PUBL Fixtureville 1990
1 TEXT the words
2 MIME text/plain
2 LANG en
1 REPO @R1@
2 NOTE about the shelf
2 CALN 13B
3 MEDI BOOK
4 PHRASE a ledger
1 REFN 5
1 UID 77777777-7777-4777-8777-777777777777
1 EXID 56
1 NOTE about the source
1 OBJE @O1@
1 CHAN
2 DATE 1 JAN 2020
1 CREA
2 DATE 1 JAN 2019
0 TRLR
`;

describe('a 7.0 file written for the table', () => {
  const lines = linesOf(FILE_7, 'FILE_7');
  const used = new Set(lines.map((l) => l.tag));

  it('says VERS 7.0, and every line sits where 7.0 allows it', () => {
    assert.equal(versionOf(lines), V7);
    const judged = judgeable(lines);
    assert.ok(judged.length > 300, `${judged.length} lines judged`);   // a fixed floor, so that it cannot pass by judging nothing
    assert.deepEqual(notAllowed(judged, V7), []);
  });

  it('uses every one of the 141 tags of 7.0 at least once, and no tag that 7.0 lacks', () => {
    assert.deepEqual(definedBy(V7).filter((t) => !used.has(t)), [], 'tags of 7.0 that the file does not use');
    assert.deepEqual([...used].filter((t) => !t.startsWith('_') && !definedBy(V7).includes(t)), [], 'tags 7.0 does not have');
  });

  it('is not a 5.5.1 file: judged as one, a good many of its lines are not allowed', () => {
    const out = notAllowed(judgeable(lines), V551);
    assert.ok(out.length >= 60, `${out.length} lines`);   // the 17 tags only 7.0 has, and the places that moved
    assert.ok(out.some((line) => line.includes('SNOTE under record')));
  });

  it('declares its one extension tag in the header, which is how tagKind knows it', () => {
    assert.deepEqual([...declaredIn(lines)], ['_MEMBER']);
    assert.equal(tagKind('_MEMBER', V7, declaredIn(lines)), 'custom');
    assert.equal(tagKind('_MEMBER', V7, new Set()), 'undeclared');
    for (const t of used) {
      if (t.startsWith('_')) assert.equal(tagKind(t, V7, declaredIn(lines)), 'custom', t);
      else assert.equal(tagKind(t, V7, declaredIn(lines)), 'standard', t);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// A small 5.5.5 file written for the table. Fictional, and written from the grammar of the 5.5.5
// text: its header (GEDC with FORM and the form's own VERS, CHAR, then DEST, SOUR with CORP and its
// address, DATE, LANG, SUBM, FILE, COPR, NOTE), the submitter right after it, an address with no
// value of its own, a multimedia record with one file, and every tag 5.5.5 defines at least once,
// each under a tag the text puts it under. (The byte order mark the text demands is not a line.)
const FILE_555 = `0 HEAD
1 GEDC
2 VERS 5.5.5
2 FORM LINEAGE-LINKED
3 VERS 5.5.5
1 CHAR UTF-8
1 DEST Fixture
1 SOUR Fixture
2 VERS 1
2 NAME Fixture Maker
2 CORP Fixture Company
3 ADDR
4 ADR1 1 Fixture Street
4 ADR2 Suite 2
4 ADR3 Third floor
4 CITY Fixtureville
4 STAE FL
4 POST 12345
4 CTRY Fixtureland
3 PHON 555 0100
3 EMAIL maker@example.test
3 FAX 555 0101
3 WWW example.test
2 DATA Fixture Data
3 DATE 1 JAN 2020
3 COPR Fixture
1 DATE 1 JAN 2020
2 TIME 10:00:00
1 LANG English
1 SUBM @U1@
1 FILE fixture.ged
1 COPR Fixture
1 NOTE about the file
0 @U1@ SUBM
1 NAME Jane Fixture
1 ADDR
2 ADR1 1 Fixture Street
2 CITY Fixtureville
1 PHON 555 0100
1 OBJE @O1@
1 RIN 1
1 NOTE about the submitter
1 CHAN
2 DATE 1 JAN 2020
3 TIME 10:00:00
2 NOTE changed
0 @I1@ INDI
1 NAME Jane /Fixture/
2 TYPE birth
2 NPFX Dr.
2 GIVN Jane
2 NICK Janey
2 SPFX de
2 SURN Fixture
2 NSFX Jr.
2 NOTE about the name
2 SOUR @S1@
2 FONE Jein /Fikuschua/
3 TYPE kana
3 GIVN Jein
2 ROMN Jane /Fixture/
3 TYPE romaji
3 SURN Fixture
1 SEX F
1 BIRT
2 TYPE home
2 DATE 1 JAN 1900
2 PLAC Fixtureville, Fixtureland
3 FONE Fikuschua
4 TYPE kana
3 ROMN Fixtureville
4 TYPE romaji
3 MAP
4 LATI N18.150944
4 LONG E168.150944
3 NOTE about the place
2 ADDR
3 ADR1 1 Fixture Street
2 PHON 555 0100
2 EMAIL jane@example.test
2 FAX 555 0102
2 WWW jane.example.test
2 AGNC Fixture Registry
2 RELI none
2 CAUS none
2 AGE 0y
2 NOTE about the birth
2 SOUR @S1@
3 PAGE 12
3 EVEN BIRT
4 ROLE CHIL
3 DATA
4 DATE 1 JAN 1900
4 TEXT the entry
5 CONC  and more
5 CONT and a new line
3 QUAY 3
3 OBJE @O1@
3 NOTE about the source
2 OBJE @O1@
2 FAMC @F1@
1 CHR Y
1 DEAT Y
1 BURI
2 DATE 1 JAN 1980
1 CREM
2 DATE 1 JAN 1980
1 ADOP
2 DATE 1 JAN 1901
2 FAMC @F1@
3 ADOP BOTH
1 BAPM
2 DATE 1 JAN 1901
1 BARM
2 DATE 1 JAN 1913
1 BASM
2 DATE 1 JAN 1913
1 CHRA
2 DATE 1 JAN 1950
1 CONF
2 DATE 1 JAN 1914
1 FCOM
2 DATE 1 JAN 1908
1 NATU
2 DATE 1 JAN 1930
1 EMIG
2 DATE 1 JAN 1930
1 IMMI
2 DATE 1 JAN 1931
1 CENS
2 DATE 1 JAN 1940
1 PROB
2 DATE 1 JAN 1981
1 WILL
2 DATE 1 JAN 1979
1 GRAD
2 DATE 1 JAN 1918
1 RETI
2 DATE 1 JAN 1965
1 EVEN a general event
2 TYPE events
1 CAST a caste
1 DSCR tall
1 EDUC school
1 FACT skill
2 TYPE skills
1 IDNO 1
2 TYPE card
1 NATI Fixtureland
1 NCHI 1
1 NMR 1
1 OCCU baker
2 DATE FROM 1900 TO 1910
1 PROP a house
1 RELI none
1 RESI here
1 TITL Duke
1 FAMC @F1@
2 PEDI birth
2 NOTE about the link
1 FAMS @F1@
2 NOTE about the link
1 ASSO @I2@
2 RELA friend
2 SOUR @S1@
2 NOTE about the friend
1 REFN 1
2 TYPE mine
1 RIN 2
1 NOTE about the person
1 SOUR @S1@
1 OBJE @O1@
1 CHAN
2 DATE 1 JAN 2020
3 TIME 10:00:00
2 NOTE changed
0 @I2@ INDI
1 NAME Joe /Fixture/
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I1@
1 MARR
2 TYPE civil
2 HUSB
3 AGE 30y
2 WIFE
3 AGE 25y
2 DATE 1 JAN 1899
2 PLAC Fixtureville
1 ANUL
2 DATE 1 JAN 1901
1 CENS
2 DATE 1 JAN 1900
1 DIV
2 DATE 1 JAN 1902
1 DIVF
2 DATE 1 JAN 1901
1 ENGA
2 DATE 1 JAN 1898
1 MARB
2 DATE 1 JAN 1899
1 MARC
2 DATE 1 JAN 1899
1 MARL
2 DATE 1 JAN 1899
1 MARS
2 DATE 1 JAN 1899
1 RESI together
1 EVEN a family event
2 TYPE events
1 NCHI 1
1 REFN 3
2 TYPE theirs
1 RIN 3
1 NOTE about the family
1 SOUR @S1@
1 OBJE @O1@
1 CHAN
2 DATE 1 JAN 2020
0 @O1@ OBJE
1 FILE media/fixture.jpg
2 FORM jpg
3 TYPE photo
2 TITL a picture
1 REFN 4
2 TYPE mine
1 RIN 4
1 NOTE about the picture
1 SOUR @S1@
1 CHAN
2 DATE 1 JAN 2020
0 @R1@ REPO
1 NAME Fixture Library
1 ADDR
2 ADR1 35 Fixture Street
2 CITY Fixtureville
1 PHON 555 0101
1 EMAIL library@example.test
1 FAX 555 0102
1 WWW library.example.test
1 NOTE about the library
1 REFN 5
2 TYPE mine
1 RIN 5
1 CHAN
2 DATE 1 JAN 2020
0 @S1@ SOUR
1 DATA
2 EVEN BIRT, DEAT
3 DATE FROM 1800 TO 1900
3 PLAC Fixtureville
2 AGNC Fixture Archive
2 NOTE about the data
1 AUTH Fixture Author
1 TITL Fixture Records
1 ABBR Records
1 PUBL Fixtureville 1990
1 TEXT the words
2 CONT and a new line
1 REPO @R1@
2 NOTE about the shelf
2 CALN 13B
3 MEDI book
1 REFN 6
2 TYPE mine
1 RIN 6
1 NOTE about the source
1 OBJE @O1@
1 CHAN
2 DATE 1 JAN 2020
0 @N1@ NOTE A shared note
1 CONC  and its continuation
1 CONT on a new line
1 REFN 7
2 TYPE mine
1 RIN 7
1 SOUR @S1@
1 CHAN
2 DATE 1 JAN 2020
0 TRLR
`;

describe('a 5.5.5 file written for the table', () => {
  const lines = linesOf(FILE_555, 'FILE_555');
  const used = new Set(lines.map((l) => l.tag));

  it('says VERS 5.5.5, and every line sits where 5.5.5 allows it', () => {
    assert.equal(versionOf(lines), V555);
    const judged = judgeable(lines);
    assert.ok(judged.length > 250, `${judged.length} lines judged`);   // a fixed floor, so that it cannot pass by judging nothing
    assert.deepEqual(notAllowed(judged, V555), []);
  });

  it('uses every one of the 116 tags of 5.5.5 at least once, and no tag that 5.5.5 lacks', () => {
    assert.deepEqual(definedBy(V555).filter((t) => !used.has(t)), [], 'tags of 5.5.5 that the file does not use');
    assert.deepEqual([...used].filter((t) => !definedBy(V555).includes(t)), [], 'tags 5.5.5 does not have');
    for (const t of used) assert.equal(tagKind(t, V555), 'standard', t);
  });

  it('is a 5.5.1 file in all but one line: judged as one, only VERS under FORM is out of place', () => {
    const out = notAllowed(judgeable(lines), V551);
    assert.equal(out.length, 1, out.join(' | '));
    assert.ok(out[0].endsWith('VERS under FORM'), out[0]);
  });

  it('is not a 7.0 file: judged as one, a good many of its lines are not allowed', () => {
    const out = notAllowed(judgeable(lines), V7);
    assert.ok(out.length >= 10, `${out.length} lines`);
    assert.ok(out.some((line) => line.includes('FORM under GEDC')));
    assert.ok(out.some((line) => line.includes('CHAR under HEAD')));
  });
});
