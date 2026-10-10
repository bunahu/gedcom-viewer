// GEDCOM Viewer. Copyright (C) 2026 bunahu. Free software under the GNU General Public License, version 3 or later: see LICENSE.
/* GEDCOM Viewer - tags.js
 *
 * Every tag the three standards define: what it means in plain words, and under which tags it may
 * sit. The standards are GEDCOM 5.5.1 (the release of 15 November 2019), The GEDCOM 5.5.5
 * Specification with Annotations (Tamura Jones, first release 2 October 2019) and FamilySearch
 * GEDCOM 7.0 (the text of 7.0.18, 17 February 2026). BUILD-BRIEF sections 18 and 19 say what the
 * table is for: a plain meaning for a tag, a check that marks a tag the standards do not know or do
 * not allow where it stands, and the places a moved block may land.
 *
 * It never touches the page and it needs nothing. The same file runs as a classic script in the
 * page, where it sets window.GedTags, and under Node, where the tests require it, as core.js does.
 * It holds data and a few lookups, and it makes no request.
 *
 * TAGS is the table, with one entry for each tag:
 *   tag       the tag as written: capital letters A to Z, digits and underscore
 *   versions  the standards that define it, in this order: '5.5.1', '5.5.5', '7.0'
 *   meaning   one short line, in plain words
 *   under     for each version in `versions`, the tags it may sit directly under in that version.
 *             'record' stands for a line at level 0 and 'HEAD' for the header: INDI sits under
 *             'record', and BIRT sits under INDI.
 * VERSIONS names the three, in that order.
 * The lists are kept per version because the standards differ. NOTE is a record in 5.5.1 and
 * 5.5.5, and SNOTE is the one in 7.0; CHAN may sit under SUBN in 5.5.1 and under SNOTE in 7.0.
 * 5.5.5 defines the tags of 5.5.1 less 21, and adds none: AFN ALIA ANCE ANCI DESC DESI FAMF ORDI
 * RESN RFN STAT SUBN (the Ancestral File tags, and others nobody used), BAPL CONL ENDL SLGC SLGS
 * TEMP (the LDS ordinances) and BLES ORDN SSN (which EVEN and IDNO replace). Its sentence on
 * retired tags names 14 of the 21; its tables of obsolete and duplicate records retire the other
 * 7. An address (ADDR) holds no text in 5.5.5, only ADR1 to CTRY, so CONT does not sit under it.
 *
 * The lookups:
 *   meaning(tag)
 *     The plain line, or null when the tag is not in the table.
 *   allowedUnder(tag, parentTag, version)
 *     true or false, or null when the tag is not in the table. The version is '5.5.1', '5.5.5' or
 *     '7.0'. A tag that is in the table but not defined by that version gives false there (SNOTE
 *     under 'record' is false in 5.5.1). Any other version gives null.
 *   versionFor(declared)
 *     The version to judge a file by, from what it declares in HEAD.GEDC.VERS: '5.5.1', '5.5.5'
 *     or '7.0'. '5.5.5' and '7.0' are read as themselves, and any other 7.x as '7.0' (the text
 *     numbers its patches, 7.0.18, while a file says 7.0; a later 7.x has no table of its own).
 *     '5.5', which differs little from 5.5.1, and anything else, or nothing, are read as '5.5.1'.
 *   tagKind(tag, version, declared)
 *     What a tag is in a file of that version: 'standard' (in the table for that version), 'custom'
 *     (the version lets anyone add it, and it is well formed), 'undeclared' (7.0 only: well
 *     formed as an extension, but the header's SCHMA does not declare it) or 'malformed' (none of
 *     those; that includes a tag only another version defines, which meaning() can tell apart).
 *     `declared` is a Set or an array of the extension tags the file's HEAD.SCHMA declares, or
 *     nothing; only 7.0 reads it. The version must be one of the three, else null. The lookup
 *     judges the tag alone, so a caller must not ask it about a line below an extension: 7.0 calls
 *     such a line an extension-defined substructure, and a standard tag there is not wrong.
 *   customMeaning(tag)
 *     For a well known tag no standard defines, { tag, meaning, vendor }: a plain line and who
 *     writes it. Otherwise null. CUSTOM_TAGS is the list, in order of tag. It is no registry: a
 *     tag that is not on it is no less legal. Each is on it because a source says what it is; the
 *     comment above each names the source, and the legend above CUSTOM_ROWS explains the names.
 *
 * What is in TAGS: the tags the standards define, and nothing else. A tag that begins with an
 * underscore (_APID, _META, _MTTAG and the like) is an extension. Every version lets anyone add
 * those, so none is in TAGS, and meaning() and allowedUnder() answer null for it: "not in the
 * standard", which a check using them must not treat as a mistake; tagKind() is the one that
 * says whether it is well formed. A tag that is well formed but made up (FAM9) is not in TAGS
 * either, and tagKind() calls it malformed. Tags are matched as written. The standards write
 * them in capitals, so a lower case tag is not in the table. A standard tag under an extension,
 * or under a made-up tag, gives false, since no standard puts it there; whether to mark such a
 * line is for the caller.
 *
 * The table knows the one tag directly above a line, and nothing higher. It cannot tell which
 * DATE a TIME may sit under (5.5.1 allows it in the header's date and in a change date, and no
 * other); it says that TIME may sit under DATE. In the same way CONC and CONT are allowed under
 * VERS and FORM in 5.5.5, though the standard bars them in the header's basic lines (GEDC with
 * its VERS and FORM, and CHAR): the same two tags sit elsewhere too (SOUR.VERS, FILE.FORM).
 *
 * The places are read from the grammar of each standard: the record and substructure rules of
 * Chapter 2 in 5.5.1 and 5.5.5 (their Appendix A is only a glossary), and the structure
 * organization of Chapter 3 in 7.0. A tag defined by several has a list for each, often the same.
 * tests/tags.test.js counts the table against the tag lists the standards print themselves. The
 * meanings are written here, in plain words; the standards' texts are not copied. As the Apache
 * License of the 7.0 text asks of a work derived from it, its notice follows.
 *   This work comprises, is based on, or is derived from the FAMILYSEARCH GEDCOM (TM)
 *   Specification, (c) 1984-2026 Intellectual Reserve, Inc. All rights reserved. "FAMILYSEARCH
 *   GEDCOM (TM)" and "FAMILYSEARCH (R)" are trademarks of Intellectual Reserve, Inc. and may not
 *   be used except as allowed by the Apache 2.0 license that governs this work or as expressly
 *   authorized in writing and in advance by Intellectual Reserve, Inc.
 *
 * What makes a tag, version by version (tagKind). The short quotes are the standards' own words.
 *   5.5.1  A tag is a run of letters, digits and underscores ("The alpha characters include the
 *          underscore"), "a maximum of 31 characters" long. A tag the standard does not define
 *          "must begin with an underscore character". The text also says "TAGS are always
 *          UPPERCASE", but no rule bars a lower case user-defined tag, so one is allowed here. The
 *          line for a user-defined tag (NEW_TAG) says Size=1:15, against the 31 of the grammar
 *          chapter; 31 is the limit used, since a mark on a long vendor tag would be wrong more
 *          often than right. The rule that the first 15 characters be unique cannot be checked on
 *          one tag, and is not. An underscore alone is a tag by this grammar.
 *   5.5.5  "GEDCOM tags are case-sensitive." A tag is an optional underscore and then letters and
 *          digits ("Tags need not start with a letter, but may start with a digit"), and the
 *          underscore may only be the first character and may not stand alone ("Tags may not
 *          contain additional underscores"), at most 31 code units: "All characters of the tag are
 *          significant." "All user-defined tags must start with an underscore" and "should be
 *          UPPERCASE as well", which a lower case one breaks as advice, not as a rule, so it is
 *          allowed here. Two more bars: a user-defined tag that is a standard tag with an
 *          underscore in front ("It is illegal to use _CITY for anything"), and one that would
 *          "bring back" a tag 5.5.5 retired (_SSN, _BLES). Both are malformed here; 5.5.5 lets
 *          the tags only 7.0 defines (SNOTE) be carried as _SNOTE.
 *   7.0    stdTag = ucletter *tagchar, extTag = underscore 1*tagchar, tagchar = ucletter / DIGIT
 *          / underscore: capital letters only, no limit on length, underscores anywhere after the
 *          first character. A tag that fits stdTag but is not defined is prohibited ("All other
 *          non-standard structures are prohibited"). Each extension tag is "either a documented
 *          extension tag or an undocumented extension tag": documented when the header's SCHMA
 *          maps it to a URI in a TAG line, and the text says "It is recommended that applications
 *          not use undocumented extension tags". Both are allowed; the second is 'undeclared'.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GedTags = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const V551 = '5.5.1';
  const V555 = '5.5.5';
  const V7 = '7.0';
  const VERSIONS = Object.freeze([V551, V555, V7]);
  // In a row below, `in551`, `in555` and `in7` name the tags the tag may sit directly under, as
  // words with spaces between. A version that does not define the tag has null. SAME, for 5.5.5
  // and for 7.0, means the same list as for 5.5.1.
  const SAME = 'same';

  // The words of `list` that are not in `drop`.
  const without = (list, drop) => list.split(' ').filter((w) => !drop.split(' ').includes(w)).join(' ');

  // Every event and fact (a person's, and then a family's) carries the same detail lines, so a tag
  // such as DATE, PLAC or ADDR lists all of them as parents. These names keep the rows short.
  const PERSON_EVENTS = `ADOP BAPM BARM BASM BIRT BLES BURI CENS CHR CHRA CONF CREM DEAT EMIG EVEN
    FCOM GRAD IMMI NATU ORDN PROB RETI WILL`;
  const PERSON_FACTS = 'CAST DSCR EDUC FACT IDNO NATI NCHI NMR OCCU PROP RELI RESI SSN TITL';
  // The family events that are not also in the two lists above.
  const FAMILY_EVENTS = 'ANUL DIV DIVF ENGA MARB MARC MARL MARR MARS';
  const EVENTS = `${PERSON_EVENTS} ${PERSON_FACTS} ${FAMILY_EVENTS}`;
  // 5.5.5 retired the blessing (BLES) and ordination (ORDN) events, which it leaves to the generic
  // EVEN, and the social security number (SSN), which it leaves to IDNO.
  const PERSON_EVENTS_555 = without(PERSON_EVENTS, 'BLES ORDN');
  const PERSON_FACTS_555 = without(PERSON_FACTS, 'SSN');
  const EVENTS_555 = `${PERSON_EVENTS_555} ${PERSON_FACTS_555} ${FAMILY_EVENTS}`;
  // The ceremonies of the Latter-day Saint church. 5.5.5 has none; 7.0 brought INIL back.
  const LDS_551 = 'BAPL CONL ENDL SLGC SLGS';
  const LDS_7 = `${LDS_551} INIL`;

  // CONC and CONT carry a long value on to the next line. 5.5.1 draws them under a few tags only
  // (NOTE, TEXT, ADDR and the like), but its first chapter lets any long value be broken this way,
  // and files do it under many more. So the places here are every tag that can hold a value other
  // than a pointer or Y, and not just the few the grammar draws them under: to call a long PAGE or
  // OCCU line out of place would be wrong more often than right. 5.5.5 says the same in its
  // grammar chapter ("always available for use with any line value") and bars them in the
  // header's basic lines, so CHAR, which is only there, is out; ADDR holds no value in 5.5.5 and
  // is out too. 7.0 draws the line tighter: only a payload of type Text or Special can hold a line
  // break, so those are its tags. CONC is not in 7.0 at all: that standard reserves the tag and
  // defines nothing for it.
  const CONTINUABLE_551 = `ABBR ADDR ADOP ADR1 ADR2 ADR3 AFN AGE AGNC ANCE AUTH CALN CAST CAUS
    CHAR CITY COPR CORP CTRY DATA DATE DESC DEST DSCR EDUC EMAIL EVEN FACT FAMF FAX FILE FONE FORM
    GIVN IDNO LANG LATI LONG MEDI NAME NATI NCHI NICK NMR NOTE NPFX NSFX OCCU ORDI PAGE PEDI PHON
    PLAC POST PROP PUBL QUAY REFN RELA RELI RESN RFN RIN ROLE ROMN SEX SOUR SPFX SSN STAE STAT
    SURN TEMP TEXT TIME TITL TYPE VERS WWW`;
  const CONTINUABLE_555 = `ABBR ADOP ADR1 ADR2 ADR3 AGE AGNC AUTH CALN CAST CAUS CITY COPR CORP
    CTRY DATA DATE DEST DSCR EDUC EMAIL EVEN FACT FAX FILE FONE FORM GIVN IDNO LANG LATI LONG MEDI
    NAME NATI NCHI NICK NMR NOTE NPFX NSFX OCCU PAGE PEDI PHON PLAC POST PROP PUBL QUAY REFN RELA
    RELI RIN ROLE ROMN SEX SOUR SPFX STAE SURN TEXT TIME TITL TYPE VERS WWW`;
  const CONTINUABLE_7 = `ABBR ADDR ADR1 ADR2 ADR3 AGNC AUTH CALN CAST CAUS CITY COPR CORP CTRY
    DATA DEST DSCR EDUC EMAIL EVEN EXID FACT FAX GIVN IDNO NAME NATI NICK NOTE NPFX NSFX OCCU PAGE
    PHON PHRASE POST PROP PUBL REFN RELI RESI SNOTE SOUR SPFX SSN STAE SURN TEMP TEXT TITL TRAN
    TYPE UID VERS WWW`;

  const ROWS = [
    { tag: 'ABBR',
      meaning: 'A short title for a source, used to file and find it.',
      in551: 'SOUR', in555: SAME, in7: SAME },
    { tag: 'ADDR',
      meaning: 'An address, written as it would be on an envelope.',
      in551: `${EVENTS} CORP REPO SUBM`, in555: `${EVENTS_555} CORP REPO SUBM`, in7: SAME },
    { tag: 'ADOP',
      meaning: 'Adoption of a person. Under a family link: which parent adopted them.',
      in551: 'FAMC INDI', in555: SAME, in7: SAME },
    { tag: 'ADR1',
      meaning: 'The first line of an address, repeated on its own for sorting.',
      in551: 'ADDR', in555: SAME, in7: SAME },
    { tag: 'ADR2',
      meaning: 'The second line of an address, repeated on its own for sorting.',
      in551: 'ADDR', in555: SAME, in7: SAME },
    { tag: 'ADR3',
      meaning: 'The third line of an address, repeated on its own for sorting.',
      in551: 'ADDR', in555: SAME, in7: SAME },
    { tag: 'AFN',
      meaning: 'A number for a person in Ancestral File, an old FamilySearch database.',
      in551: 'INDI', in555: null, in7: null },
    { tag: 'AGE',
      meaning: 'How old the person was at the event.',
      in551: `${PERSON_EVENTS} ${PERSON_FACTS} HUSB WIFE`,
      in555: `${PERSON_EVENTS_555} ${PERSON_FACTS_555} HUSB WIFE`,
      in7: SAME },
    { tag: 'AGNC',
      meaning: 'The office, church or person in charge of an event or a record.',
      in551: `${EVENTS} DATA`, in555: `${EVENTS_555} DATA`, in7: SAME },
    { tag: 'ALIA',
      meaning: 'Points to another record that may describe the same person.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'ANCE',
      meaning: 'How many generations of ancestors the file holds.',
      in551: 'SUBN', in555: null, in7: null },
    { tag: 'ANCI',
      meaning: 'Marks an interest in researching more ancestors of this person.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'ANUL',
      meaning: 'Annulment: a marriage declared void from the start.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'ASSO',
      meaning: 'Points to someone linked to this one, such as a friend or godparent.',
      in551: 'INDI', in555: SAME, in7: `${EVENTS} FAM INDI` },
    { tag: 'AUTH',
      meaning: 'Who wrote or compiled a source.',
      in551: 'SOUR', in555: SAME, in7: SAME },
    { tag: 'BAPL',
      meaning: 'LDS baptism: a Latter-day Saint baptism, done at age 8 or older.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'BAPM',
      meaning: 'Baptism, in infancy or later, not LDS.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'BARM',
      meaning: 'Bar mitzvah: a Jewish coming-of-age ceremony for a boy of about 13.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'BASM',
      meaning: 'Bat mitzvah: a Jewish coming-of-age ceremony for a girl of about 13.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'BIRT',
      meaning: 'Birth: when and where a person was born.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'BLES',
      meaning: 'Blessing: a religious blessing, often given at a naming.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'BURI',
      meaning: 'Burial: when and where the remains were laid to rest.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'CALN',
      meaning: 'The call number a repository uses to find a source on its shelves.',
      in551: 'REPO', in555: SAME, in7: SAME },
    { tag: 'CAST',
      meaning: 'Caste: the rank or group a person had in society.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'CAUS',
      meaning: 'The cause of an event, such as the cause of a death.',
      in551: EVENTS, in555: EVENTS_555, in7: SAME },
    { tag: 'CENS',
      meaning: 'Census: a count of the people living in an area.',
      in551: 'FAM INDI', in555: SAME, in7: SAME },
    { tag: 'CHAN',
      meaning: 'When this record was last changed.',
      in551: 'FAM INDI NOTE OBJE REPO SOUR SUBM SUBN',
      in555: 'FAM INDI NOTE OBJE REPO SOUR SUBM',
      in7: 'FAM INDI OBJE REPO SNOTE SOUR SUBM' },
    { tag: 'CHAR',
      meaning: 'The character set the file is written in, such as UTF-8.',
      in551: 'HEAD', in555: SAME, in7: null },
    { tag: 'CHIL',
      meaning: 'Points to a child in a family.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'CHR',
      meaning: 'Christening: the baptism or naming of a child, not LDS.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'CHRA',
      meaning: 'Christening of an adult: baptism or naming, not LDS.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'CITY',
      meaning: 'The city in an address.',
      in551: 'ADDR', in555: SAME, in7: SAME },
    { tag: 'CONC',
      meaning: 'Carries on the text above it, joined with nothing in between.',
      in551: CONTINUABLE_551, in555: CONTINUABLE_555, in7: null },
    { tag: 'CONF',
      meaning: 'Confirmation: the church rite that gives full membership, not LDS.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'CONL',
      meaning: 'LDS confirmation: joining the Latter-day Saint church after baptism.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'CONT',
      meaning: 'Carries on the text above it, on a new line.',
      in551: CONTINUABLE_551, in555: CONTINUABLE_555, in7: CONTINUABLE_7 },
    { tag: 'COPR',
      meaning: 'A copyright statement.',
      in551: 'HEAD DATA', in555: SAME, in7: SAME },
    { tag: 'CORP',
      meaning: 'The company that made the program that wrote the file.',
      in551: 'SOUR', in555: SAME, in7: SAME },
    { tag: 'CREA',
      meaning: 'When this record was first made.',
      in551: null, in555: null, in7: 'FAM INDI OBJE REPO SNOTE SOUR SUBM' },
    { tag: 'CREM',
      meaning: 'Cremation: when and where a body was cremated.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'CROP',
      meaning: 'The part of a picture to show.',
      in551: null, in555: null, in7: 'OBJE' },
    { tag: 'CTRY',
      meaning: 'The country in an address.',
      in551: 'ADDR', in555: SAME, in7: SAME },
    { tag: 'DATA',
      meaning: 'What a source holds, or the data source a file came from.',
      in551: 'SOUR', in555: SAME, in7: SAME },
    { tag: 'DATE',
      meaning: 'A date: of an event, of a change, or of the file itself.',
      in551: `HEAD ${EVENTS} ${LDS_551} CHAN DATA STAT`,
      in555: `HEAD ${EVENTS_555} CHAN DATA`,
      in7: `HEAD ${EVENTS} ${LDS_7} CHAN CREA DATA NO STAT` },
    { tag: 'DEAT',
      meaning: 'Death: when and where a person died.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'DESC',
      meaning: 'How many generations of descendants the file holds.',
      in551: 'SUBN', in555: null, in7: null },
    { tag: 'DESI',
      meaning: 'Marks an interest in researching more descendants of this person.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'DEST',
      meaning: 'The program or system the file is meant for.',
      in551: 'HEAD', in555: SAME, in7: SAME },
    { tag: 'DIV',
      meaning: 'Divorce: a marriage ended by a court.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'DIVF',
      meaning: 'Divorce filed: a divorce was applied for.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'DSCR',
      meaning: 'Physical description: hair, eyes, height and so on.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'EDUC',
      meaning: 'Education: the schooling a person reached.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'EMAIL',
      meaning: 'An email address.',
      in551: `${EVENTS} CORP REPO SUBM`, in555: `${EVENTS_555} CORP REPO SUBM`, in7: SAME },
    { tag: 'EMIG',
      meaning: 'Emigration: leaving the home country to live elsewhere.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'ENDL',
      meaning: 'LDS endowment: a Latter-day Saint temple ceremony.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'ENGA',
      meaning: 'Engagement: an agreement between two people to marry.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'EVEN',
      meaning: 'A general event, named by TYPE. Under a source: the kind of event it records.',
      in551: 'DATA FAM INDI SOUR', in555: SAME, in7: SAME },
    { tag: 'EXID',
      meaning: 'An id given by an outside group or website for this thing.',
      in551: null, in555: null, in7: 'FAM INDI OBJE PLAC REPO SNOTE SOUR SUBM' },
    { tag: 'FACT',
      meaning: 'A general fact or trait, named by TYPE.',
      in551: 'INDI', in555: SAME, in7: 'FAM INDI' },
    { tag: 'FAM',
      meaning: 'A family: a couple, and their children if any.',
      in551: 'record', in555: SAME, in7: SAME },
    { tag: 'FAMC',
      meaning: 'Points to a family in which the person is a child.',
      in551: 'ADOP BIRT CHR INDI SLGC', in555: 'ADOP BIRT CHR INDI', in7: SAME },
    { tag: 'FAMF',
      meaning: 'The name of a family file kept at an LDS temple.',
      in551: 'SUBN', in555: null, in7: null },
    { tag: 'FAMS',
      meaning: 'Points to a family in which the person is a partner or parent.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'FAX',
      meaning: 'A fax number.',
      in551: `${EVENTS} CORP REPO SUBM`, in555: `${EVENTS_555} CORP REPO SUBM`, in7: SAME },
    { tag: 'FCOM',
      meaning: 'First communion: first taking part in communion at church.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'FILE',
      meaning: 'A file name: a picture or other media file, or the name of this file itself.',
      in551: 'HEAD OBJE', in555: SAME, in7: 'OBJE' },
    { tag: 'FONE',
      meaning: 'A name or place respelled to show how it sounds.',
      in551: 'NAME PLAC', in555: SAME, in7: null },
    { tag: 'FORM',
      meaning: 'A format: of a media file, of place names, or of the GEDCOM itself.',
      in551: 'FILE GEDC PLAC', in555: 'FILE GEDC', in7: 'FILE PLAC TRAN' },
    { tag: 'GEDC',
      meaning: 'Says which GEDCOM version the file follows.',
      in551: 'HEAD', in555: SAME, in7: SAME },
    { tag: 'GIVN',
      meaning: 'The given name part of a name.',
      in551: 'FONE NAME ROMN', in555: SAME, in7: 'NAME TRAN' },
    { tag: 'GRAD',
      meaning: 'Graduation: receiving a diploma or degree.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'HEAD',
      meaning: 'The header: facts about the whole file. It comes first.',
      in551: 'record', in555: SAME, in7: SAME },
    { tag: 'HEIGHT',
      meaning: 'How many pixels tall to show of a picture.',
      in551: null, in555: null, in7: 'CROP' },
    { tag: 'HUSB',
      meaning: 'The husband in a family. Under a family event: details about the husband, such as age.',
      in551: 'ANUL CENS DIV DIVF ENGA EVEN FAM MARB MARC MARL MARR MARS RESI',
      in555: SAME,
      in7: 'ANUL CENS DIV DIVF ENGA EVEN FACT FAM MARB MARC MARL MARR MARS NCHI RESI' },
    { tag: 'IDNO',
      meaning: 'An identity number, such as a national ID. TYPE says which kind.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'IMMI',
      meaning: 'Immigration: arriving in a new country to live.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'INDI',
      meaning: 'An individual: one person.',
      in551: 'record', in555: SAME, in7: SAME },
    { tag: 'INIL',
      meaning: 'LDS initiatory: a Latter-day Saint temple ceremony.',
      in551: null, in555: null, in7: 'INDI' },
    { tag: 'LANG',
      meaning: 'A language: the one the text is written in, or one a person speaks.',
      in551: 'HEAD SUBM', in555: 'HEAD', in7: 'HEAD NOTE PLAC SNOTE SUBM TEXT TRAN' },
    { tag: 'LATI',
      meaning: 'Latitude: how far north or south a place is.',
      in551: 'MAP', in555: SAME, in7: SAME },
    { tag: 'LEFT',
      meaning: 'How many pixels to cut from the left of a picture.',
      in551: null, in555: null, in7: 'CROP' },
    { tag: 'LONG',
      meaning: 'Longitude: how far east or west a place is.',
      in551: 'MAP', in555: SAME, in7: SAME },
    { tag: 'MAP',
      meaning: 'Where a place is on a map, as latitude and longitude.',
      in551: 'PLAC', in555: SAME, in7: SAME },
    { tag: 'MARB',
      meaning: 'Marriage banns: public notice that two people plan to marry.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'MARC',
      meaning: 'Marriage contract: a formal agreement made before a marriage.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'MARL',
      meaning: 'Marriage license: official permission to marry.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'MARR',
      meaning: 'Marriage: a wedding or other joining of two partners as a family.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'MARS',
      meaning: 'Marriage settlement: an agreement about property before a marriage.',
      in551: 'FAM', in555: SAME, in7: SAME },
    { tag: 'MEDI',
      meaning: 'The kind of medium: book, film, photo and so on.',
      in551: 'CALN FORM', in555: 'CALN', in7: SAME },
    { tag: 'MIME',
      meaning: 'The kind of text in a note or other text: plain or HTML.',
      in551: null, in555: null, in7: 'NOTE SNOTE TEXT TRAN' },
    { tag: 'NAME',
      meaning: 'A name: of a person, a submitter, a repository or a program.',
      in551: 'INDI REPO SOUR SUBM', in555: SAME, in7: SAME },
    { tag: 'NATI',
      meaning: 'Nationality: the national or tribal origin of a person.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'NATU',
      meaning: 'Naturalization: becoming a citizen of a country.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'NCHI',
      meaning: 'How many children a person or a family has.',
      in551: 'FAM INDI', in555: SAME, in7: SAME },
    { tag: 'NICK',
      meaning: 'A nickname.',
      in551: 'FONE NAME ROMN', in555: SAME, in7: 'NAME TRAN' },
    { tag: 'NMR',
      meaning: 'How many families a person has been a partner or parent in.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'NO',
      meaning: 'Something that did not happen, such as NO MARR for no marriage.',
      in551: null, in555: null, in7: 'FAM INDI' },
    { tag: 'NOTE',
      meaning: 'A note: extra information for whoever reads the data.',
      in551: `record HEAD ${EVENTS} ${LDS_551} ASSO CHAN DATA FAM FAMC FAMS FONE INDI NAME OBJE
        PLAC REPO ROMN SOUR SUBM SUBN`,
      in555: `record HEAD ${EVENTS_555} ASSO CHAN DATA FAM FAMC FAMS FONE INDI NAME OBJE PLAC REPO
        ROMN SOUR SUBM`,
      in7: `HEAD ${EVENTS} ${LDS_7} ASSO CHAN DATA FAM FAMC FAMS INDI NAME NO OBJE PLAC REPO SOUR
        SUBM` },
    { tag: 'NPFX',
      meaning: 'A name prefix, such as Dr. or Lt.',
      in551: 'FONE NAME ROMN', in555: SAME, in7: 'NAME TRAN' },
    { tag: 'NSFX',
      meaning: 'A name suffix, such as Jr. or III.',
      in551: 'FONE NAME ROMN', in555: SAME, in7: 'NAME TRAN' },
    { tag: 'OBJE',
      meaning: 'A picture, sound or other media object, or a link to one.',
      in551: `record ${EVENTS} FAM INDI SOUR SUBM`,
      in555: `record ${EVENTS_555} FAM INDI SOUR SUBM`,
      in7: SAME },
    { tag: 'OCCU',
      meaning: 'Occupation: the job or profession of a person.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'ORDI',
      meaning: 'Whether LDS temple work should be processed: yes or no.',
      in551: 'SUBN', in555: null, in7: null },
    { tag: 'ORDN',
      meaning: 'Ordination: receiving the authority to act in religious matters.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'PAGE',
      meaning: 'Where to look in a source: a page, film, line or the like.',
      in551: 'SOUR', in555: SAME, in7: SAME },
    { tag: 'PEDI',
      meaning: 'How a child is linked to a family: birth, adopted, foster or sealed.',
      in551: 'FAMC', in555: SAME, in7: SAME },
    { tag: 'PHON',
      meaning: 'A phone number.',
      in551: `${EVENTS} CORP REPO SUBM`, in555: `${EVENTS_555} CORP REPO SUBM`, in7: SAME },
    { tag: 'PHRASE',
      meaning: 'The words as a source gave them, when a standard form cannot hold them.',
      in551: null,
      in555: null,
      in7: 'ADOP AGE ALIA ASSO CHIL DATE EVEN HUSB MEDI PEDI ROLE SDATE STAT TYPE WIFE' },
    { tag: 'PLAC',
      meaning: 'A place, written from smallest to largest: town, county, state, country.',
      in551: `HEAD ${EVENTS} ${LDS_551}`, in555: EVENTS_555, in7: `HEAD ${EVENTS} ${LDS_7}` },
    { tag: 'POST',
      meaning: 'The postal code in an address.',
      in551: 'ADDR', in555: SAME, in7: SAME },
    { tag: 'PROB',
      meaning: 'Probate: a court proving that a will is valid.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'PROP',
      meaning: 'Property: land or goods a person owned.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'PUBL',
      meaning: 'When and where a source was published or made.',
      in551: 'SOUR', in555: SAME, in7: SAME },
    { tag: 'QUAY',
      meaning: 'How reliable the evidence is, from 0 (weakest) to 3 (strongest).',
      in551: 'SOUR', in555: SAME, in7: SAME },
    { tag: 'REFN',
      meaning: 'A reference number or word you chose to identify a record.',
      in551: 'FAM INDI NOTE OBJE REPO SOUR',
      in555: SAME,
      in7: 'FAM INDI OBJE REPO SNOTE SOUR SUBM' },
    { tag: 'RELA',
      meaning: 'How two people are related, in words, such as godfather.',
      in551: 'ASSO', in555: SAME, in7: null },
    { tag: 'RELI',
      meaning: 'Religion: the denomination of a person or an event.',
      in551: `${EVENTS} INDI`, in555: `${EVENTS_555} INDI`, in7: SAME },
    { tag: 'REPO',
      meaning: 'A repository: a library, archive or person that keeps sources. Also a link to one.',
      in551: 'record SOUR', in555: SAME, in7: SAME },
    { tag: 'RESI',
      meaning: 'Residence: where a person or a family lived.',
      in551: 'FAM INDI', in555: SAME, in7: SAME },
    { tag: 'RESN',
      meaning: 'A restriction: the data is confidential, locked or private.',
      in551: `${EVENTS} FAM INDI`, in555: null, in7: `${EVENTS} FAM INDI OBJE` },
    { tag: 'RETI',
      meaning: 'Retirement: leaving a job after years of work.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'RFN',
      meaning: 'A permanent number that identifies a record within a known file.',
      in551: 'INDI SUBM', in555: null, in7: null },
    { tag: 'RIN',
      meaning: 'A record number given by the program that wrote the file.',
      in551: 'FAM INDI NOTE OBJE REPO SOUR SUBM SUBN',
      in555: 'FAM INDI NOTE OBJE REPO SOUR SUBM',
      in7: null },
    { tag: 'ROLE',
      meaning: 'The part someone played in an event, such as witness or godparent.',
      in551: 'EVEN', in555: SAME, in7: 'ASSO EVEN' },
    { tag: 'ROMN',
      meaning: 'A name or place written again in Latin letters.',
      in551: 'NAME PLAC', in555: SAME, in7: null },
    { tag: 'SCHMA',
      meaning: 'A list that says what each underscore tag in the file means.',
      in551: null, in555: null, in7: 'HEAD' },
    { tag: 'SDATE',
      meaning: 'A date used only to put lines in order.',
      in551: null, in555: null, in7: EVENTS },
    { tag: 'SEX',
      meaning: 'The sex of a person, written as one letter such as M or F.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'SLGC',
      meaning: 'LDS sealing of a child to the parents, a temple ceremony.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'SLGS',
      meaning: 'LDS sealing of a couple, a temple ceremony.',
      in551: 'FAM', in555: null, in7: SAME },
    { tag: 'SNOTE',
      meaning: 'A shared note: one note that many lines can point to.',
      in551: null,
      in555: null,
      in7: `record HEAD ${EVENTS} ${LDS_7} ASSO CHAN DATA FAM FAMC FAMS INDI NAME NO OBJE PLAC
        REPO SOUR SUBM` },
    { tag: 'SOUR',
      meaning: 'A source: where a fact came from. Also a link to one, or the program that made the file.',
      in551: `record HEAD ${EVENTS} ${LDS_551} ASSO FAM FONE INDI NAME NOTE OBJE ROMN`,
      in555: `record HEAD ${EVENTS_555} ASSO FAM FONE INDI NAME NOTE OBJE ROMN`,
      in7: `record HEAD ${EVENTS} ${LDS_7} ASSO FAM INDI NAME NO NOTE OBJE SNOTE` },
    { tag: 'SPFX',
      meaning: 'A surname prefix, such as de or van.',
      in551: 'FONE NAME ROMN', in555: SAME, in7: 'NAME TRAN' },
    { tag: 'SSN',
      meaning: 'A US Social Security number.',
      in551: 'INDI', in555: null, in7: SAME },
    { tag: 'STAE',
      meaning: 'The state or region in an address.',
      in551: 'ADDR', in555: SAME, in7: SAME },
    { tag: 'STAT',
      meaning: 'The status of an LDS ceremony, or of the link between a child and a family.',
      in551: `${LDS_551} FAMC`, in555: null, in7: `${LDS_7} FAMC` },
    { tag: 'SUBM',
      meaning: 'A submitter: who gave the data to the file. Also a link to one.',
      in551: 'record HEAD FAM INDI SUBN', in555: 'record HEAD', in7: 'record HEAD FAM INDI' },
    { tag: 'SUBN',
      meaning: 'A submission: instructions for an LDS system that handles temple work.',
      in551: 'record HEAD', in555: null, in7: null },
    { tag: 'SURN',
      meaning: 'The surname, or family name, part of a name.',
      in551: 'FONE NAME ROMN', in555: SAME, in7: 'NAME TRAN' },
    { tag: 'TAG',
      meaning: 'Says what one underscore tag means, by a web address.',
      in551: null, in555: null, in7: 'SCHMA' },
    { tag: 'TEMP',
      meaning: 'The LDS temple where a ceremony was done.',
      in551: `${LDS_551} SUBN`, in555: null, in7: LDS_7 },
    { tag: 'TEXT',
      meaning: 'The exact words found in a source.',
      in551: 'DATA SOUR', in555: SAME, in7: SAME },
    { tag: 'TIME',
      meaning: 'A time of day on a 24-hour clock.',
      in551: 'DATE', in555: SAME, in7: 'DATE SDATE' },
    { tag: 'TITL',
      meaning: 'A title: of a source or media file, or one a person holds, such as Duke.',
      in551: 'FILE INDI OBJE SOUR', in555: 'FILE INDI SOUR', in7: SAME },
    { tag: 'TOP',
      meaning: 'How many pixels to cut from the top of a picture.',
      in551: null, in555: null, in7: 'CROP' },
    { tag: 'TRAN',
      meaning: 'The same thing again in another language, script or file type.',
      in551: null, in555: null, in7: 'FILE NAME NOTE PLAC SNOTE' },
    { tag: 'TRLR',
      meaning: 'The trailer: it ends the file.',
      in551: 'record', in555: SAME, in7: SAME },
    { tag: 'TYPE',
      meaning: 'A word that says what kind of thing the line above it is.',
      in551: `${EVENTS} FONE FORM NAME REFN ROMN`,
      in555: `${EVENTS_555} FONE FORM NAME REFN ROMN`,
      in7: `${EVENTS} EXID NAME REFN` },
    { tag: 'UID',
      meaning: 'A unique id for a record or an event that stays the same through edits.',
      in551: null, in555: null, in7: `${EVENTS} FAM INDI OBJE REPO SNOTE SOUR SUBM` },
    { tag: 'VERS',
      meaning: 'A version number: of the program, or of GEDCOM.',
      in551: 'CHAR GEDC SOUR', in555: 'FORM GEDC SOUR', in7: 'GEDC SOUR' },
    { tag: 'WIDTH',
      meaning: 'How many pixels wide to show of a picture.',
      in551: null, in555: null, in7: 'CROP' },
    { tag: 'WIFE',
      meaning: 'The wife in a family. Under a family event: details about the wife, such as age.',
      in551: 'ANUL CENS DIV DIVF ENGA EVEN FAM MARB MARC MARL MARR MARS RESI',
      in555: SAME,
      in7: 'ANUL CENS DIV DIVF ENGA EVEN FACT FAM MARB MARC MARL MARR MARS NCHI RESI' },
    { tag: 'WILL',
      meaning: 'A will: the document that says who gets what a person leaves.',
      in551: 'INDI', in555: SAME, in7: SAME },
    { tag: 'WWW',
      meaning: 'A web address.',
      in551: `${EVENTS} CORP REPO SUBM`, in555: `${EVENTS_555} CORP REPO SUBM`, in7: SAME },
  ];

  // 'INDI record HEAD' becomes ['record', 'HEAD', 'INDI']: 'record' first, then 'HEAD', then the
  // rest in alphabetical order, each tag once.
  const rank = (p) => (p === 'record' ? 0 : p === 'HEAD' ? 1 : 2);
  function parents(text) {
    return [...new Set(text.split(/\s+/).filter(Boolean))]
      .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  }

  function entry(row) {
    const versions = [];
    const under = {};
    if (row.in551 !== null) {
      versions.push(V551);
      under[V551] = Object.freeze(parents(row.in551));
    }
    if (row.in555 !== null) {
      versions.push(V555);
      under[V555] = Object.freeze(parents(row.in555 === SAME ? row.in551 : row.in555));
    }
    if (row.in7 !== null) {
      versions.push(V7);
      under[V7] = Object.freeze(parents(row.in7 === SAME ? row.in551 : row.in7));
    }
    return Object.freeze({
      tag: row.tag,
      versions: Object.freeze(versions),
      meaning: row.meaning,
      under: Object.freeze(under),
    });
  }

  const TAGS = Object.freeze(ROWS.map(entry));
  const BY_TAG = new Map(TAGS.map((e) => [e.tag, e]));
  const SITS = new Map();
  for (const e of TAGS) for (const v of e.versions) SITS.set(`${e.tag} ${v}`, new Set(e.under[v]));

  function meaning(tag) {
    const e = BY_TAG.get(tag);
    return e ? e.meaning : null;
  }

  function allowedUnder(tag, parentTag, version) {
    if (!BY_TAG.has(tag) || !VERSIONS.includes(version)) return null;
    const sits = SITS.get(`${tag} ${version}`);
    return sits ? sits.has(parentTag) : false;
  }

  function versionFor(declared) {
    const s = typeof declared === 'string' ? declared.trim() : '';
    if (s === V555) return V555;
    if (/^7\.\d+(\.\d+)*$/.test(s)) return V7;
    return V551;
  }

  // A tag that 5.5.5 bars as a user-defined tag once an underscore is taken off its front: one the
  // standard defines, or one 5.5.1 defined and 5.5.5 retired. (A tag only 7.0 defines is free.)
  function isReserved555(name) {
    const e = BY_TAG.get(name);
    return Boolean(e) && (e.versions.includes(V551) || e.versions.includes(V555));
  }

  function tagKind(tag, version, declared) {
    if (!VERSIONS.includes(version)) return null;
    if (typeof tag !== 'string') return 'malformed';
    const e = BY_TAG.get(tag);
    if (e && e.versions.includes(version)) return 'standard';
    if (version === V551) return /^_[A-Za-z0-9_]{0,30}$/.test(tag) ? 'custom' : 'malformed';
    if (version === V555) {
      return /^_[A-Za-z0-9]{1,30}$/.test(tag) && !isReserved555(tag.slice(1)) ? 'custom' : 'malformed';
    }
    if (!/^_[A-Z0-9_]+$/.test(tag)) return 'malformed';
    const known = declared && typeof declared.has === 'function' ? declared.has(tag)
      : Array.isArray(declared) && declared.includes(tag);
    return known ? 'custom' : 'undeclared';
  }

  // Well known extension tags. A tag is on the list only when a source below says what it is, and
  // never from a guess: each line is written here, in plain words, from what the sources say. A tag
  // that is not on the list is no less legal. A tag may mean different things in different
  // programs: the line says what it means where the sources agree, and `vendor` names the programs
  // the sources name. The sources, read on 10 October 2026 as web pages:
  //   Legacy       the help file of Legacy Family Tree: the pages "Custom GEDCOM Tags" (what Legacy
  //                writes) and "User-Defined GEDCOM Tags" (tags of other programs, each with the
  //                programs that write it), read as a web copy at legacyfamilytree.se. The support
  //                articles at legacyfamilytree.com send readers to the same lists in the help file.
  //   Gramps       the GEDCOM importer of Gramps 5.2 (gramps/plugins/lib/libgedcom.py): the comments
  //                on what a non-standard tag is and which program writes it.
  //   Gramps forum gramps.discourse.group: "Importing tags from Ancestry" (November 2024 to March
  //                2025, with a sample Ancestry export) and "Better Ancestry citations" (29 August
  //                2025, on _APID).
  //   FHUG         the Family Historian User Group knowledge base, "GEDCOM Extension List" (the
  //                page was last updated 24 September 2026).
  //   Behold       Louis Kessler's Behold blog: 8 August 2005 (the _MREL and _FREL of Family Tree
  //                Maker), 22 November 2011 ("A Plethora of Extra GEDCOM Tags") and 24 December
  //                2011 ("The Place Record in GEDCOM").
  //   Jones        Tamura Jones, "The _UID tag" (Modern Software Experience, 9 January 2012).
  //   GEDCOM 5.5.5 the annotations in The GEDCOM 5.5.5 Specification with Annotations: its text on
  //                user-defined records, places, witnesses and call names, and on _EMAIL.
  //   Ancestris    the Ancestris documentation, User Guide, "Tags" (the program's own custom tags).
  //   README       this project's README, on _META, which it describes from Ancestry exports it
  //                has read. No page outside the project was found that describes _META.
  const CUSTOM_ROWS = [
    // Legacy; Gramps.
    { tag: '_AKA',
      meaning: 'An also-known-as name, written under a NAME line.',
      vendor: 'PAF, Ancestral Quest' },
    // Gramps; Gramps forum.
    { tag: '_APID',
      meaning: 'Where on Ancestry the cited record is: a collection number, two colons, an entry number.',
      vendor: 'Ancestry' },
    // Legacy; FHUG; Gramps.
    { tag: '_DATE',
      meaning: 'The date of a media item, usually a picture or video.',
      vendor: 'Legacy, Family Historian, Family Tree Maker' },
    // Legacy; FHUG; GEDCOM 5.5.5.
    { tag: '_EMAIL',
      meaning: 'An email address, from before the standard had an EMAIL tag.',
      vendor: 'Legacy, PAF, Family Origins, Family Historian' },
    // Behold, 22 November 2011.
    { tag: '_EVDEF',
      meaning: 'A record that defines one kind of event or fact.',
      vendor: 'RootsMagic' },
    // Legacy; Behold, 22 November 2011.
    { tag: '_EVENT_DEFN',
      meaning: 'A record that defines one kind of event or fact: its wording and the fields it shows.',
      vendor: 'Legacy' },
    // Behold, 8 August 2005; Legacy; Gramps.
    { tag: '_FREL',
      meaning: 'How a child is related to the father, such as Natural.',
      vendor: 'Family Tree Maker, Legacy' },
    // Gramps.
    { tag: '_JUST',
      meaning: 'The reason given for the quality rating of a citation.',
      vendor: 'Family Tree Maker' },
    // Gramps.
    { tag: '_LINK',
      meaning: 'A web address attached to a source citation.',
      vendor: 'Family Tree Maker' },
    // GEDCOM 5.5.5; Behold, 24 December 2011.
    { tag: '_LOC',
      meaning: 'A place kept as a record of its own, from the German GEDCOM EL extension.',
      vendor: 'German programs (GEDCOM EL)' },
    // Legacy; Gramps.
    { tag: '_MARNM',
      meaning: 'A married name, written under a NAME line.',
      vendor: 'PAF, Ancestral Quest' },
    // README.
    { tag: '_META',
      meaning: 'Ancestry details for a Find a Grave record: its story, transcription, people and cemetery.',
      vendor: 'Ancestry' },
    // Legacy; Gramps.
    { tag: '_MILT',
      meaning: 'Military service, as an event.',
      vendor: 'Family Tree Maker' },
    // Behold, 8 August 2005; Legacy; Gramps.
    { tag: '_MREL',
      meaning: 'How a child is related to the mother, such as Natural.',
      vendor: 'Family Tree Maker, Legacy' },
    // Gramps forum.
    { tag: '_MTCAT',
      meaning: 'The group an Ancestry tag belongs to, such as Relationship, Reference or Custom.',
      vendor: 'Ancestry' },
    // Gramps forum.
    { tag: '_MTTAG',
      meaning: 'An Ancestry tag, such as Died Young. Its record holds the name; people point to it.',
      vendor: 'Ancestry' },
    // Gramps.
    { tag: '_PHOTO',
      meaning: 'Points to the main photo of a person.',
      vendor: 'Family Tree Maker' },
    // Behold, 24 December 2011; FHUG; GEDCOM 5.5.5.
    { tag: '_PLAC',
      meaning: 'A place kept as a record of its own, with its name and its map position.',
      vendor: 'RootsMagic, Family Historian' },
    // GEDCOM 5.5.5.
    { tag: '_PLACE',
      meaning: 'A place kept as a record of its own.',
      vendor: 'several programs' },
    // Legacy; Behold, 24 December 2011.
    { tag: '_PLAC_DEFN',
      meaning: 'A record that defines a place: its name, and an abbreviation of it.',
      vendor: 'Legacy' },
    // Legacy; Gramps.
    { tag: '_PRIM',
      meaning: 'Says whether a picture or other media item is the main one: Y or N.',
      vendor: 'Legacy, PAF, Ancestral Quest, Family Origins' },
    // Legacy; Ancestris; Gramps.
    { tag: '_PRIV',
      meaning: 'Marks an event or an address as private.',
      vendor: 'Legacy, Ancestris' },
    // GEDCOM 5.5.5; Gramps.
    { tag: '_RUFNAME',
      meaning: 'The part of a given name a person is called by, the call name.',
      vendor: 'German programs' },
    // FHUG.
    { tag: '_SDATE',
      meaning: 'A date used only to sort an event or fact, written beside its own DATE.',
      vendor: 'Family Historian; read by some other programs' },
    // Legacy; FHUG.
    { tag: '_STAT',
      meaning: 'The status of a marriage, such as Never Married; Legacy also marks a child as Twin.',
      vendor: 'Legacy, Family Historian' },
    // Legacy.
    { tag: '_TODO',
      meaning: 'A to-do item: a research task kept for later.',
      vendor: 'Legacy, Family Origins' },
    // Legacy; FHUG.
    { tag: '_TYPE',
      meaning: 'The kind of a media item, such as Photo or Video; in Family Historian, of a source.',
      vendor: 'Legacy, PAF, Ancestral Quest, Family Origins, Family Historian' },
    // Jones; Legacy.
    { tag: '_UID',
      meaning: 'A unique ID, usually a UUID, that lets a record be matched from one file to another.',
      vendor: 'PAF, Legacy, RootsMagic, Family Historian, MyHeritage and many more' },
    // GEDCOM 5.5.5; Gramps.
    { tag: '_WITN',
      meaning: 'A witness to an event: a pointer to a person, or the names as plain text.',
      vendor: 'several programs' },
  ];

  const CUSTOM_TAGS = Object.freeze(CUSTOM_ROWS.map((row) => Object.freeze({ ...row })));
  const CUSTOM_BY_TAG = new Map(CUSTOM_TAGS.map((e) => [e.tag, e]));

  function customMeaning(tag) {
    return CUSTOM_BY_TAG.get(tag) || null;
  }

  return { TAGS, VERSIONS, CUSTOM_TAGS, meaning, allowedUnder, versionFor, tagKind, customMeaning };
});
