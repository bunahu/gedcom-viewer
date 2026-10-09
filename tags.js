// GEDCOM Viewer. Copyright (C) 2026 bunahu. Free software under the GNU General Public License, version 3 or later: see LICENSE.
/* GEDCOM Viewer - tags.js
 *
 * Every tag the two standards define: what it means in plain words, and under which tags it may
 * sit. The standards are GEDCOM 5.5.1 (the release of 15 November 2019) and FamilySearch GEDCOM
 * 7.0 (the text of 7.0.18, 17 February 2026). BUILD-BRIEF section 18 says what the table is for: a
 * plain meaning for a tag, a check that marks a tag the standards do not know or do not allow
 * where it stands, and the places a moved block may land.
 *
 * It never touches the page and it needs nothing. The same file runs as a classic script in the
 * page, where it sets window.GedTags, and under Node, where the tests require it, as core.js does.
 * It holds data and two lookups, and it makes no request.
 *
 * TAGS is the table, with one entry for each tag:
 *   tag       the tag as written: capital letters A to Z, digits and underscore
 *   versions  the standards that define it: '5.5.1', '7.0', or both, in that order
 *   meaning   one short line, in plain words
 *   under     for each version in `versions`, the tags it may sit directly under in that version.
 *             'record' stands for a line at level 0 and 'HEAD' for the header: INDI sits under
 *             'record', and BIRT sits under INDI.
 * The lists are kept per version because the standards differ. NOTE is a record in 5.5.1 and
 * SNOTE is the one in 7.0; CHAN may sit under SUBN in 5.5.1 and under SNOTE in 7.0.
 *
 * meaning(tag)
 *   The plain line, or null when the tag is not in the table.
 * allowedUnder(tag, parentTag, version)
 *   true or false, or null when the tag is not in the table. The version is '5.5.1' or '7.0'.
 *   A tag that is in the table but not defined by that version gives false there (SNOTE under
 *   'record' is false in 5.5.1). Any other version gives null.
 *
 * What is in the table: the tags the standards define, and nothing else. A tag that begins with an
 * underscore (_APID, _META, _MTTAG and the like) is an extension. Both standards let anyone add
 * those, so none is in the table, and both lookups answer null for it: "not in the standard", which
 * the check that uses this table must not treat as a mistake. A tag that is well formed but made
 * up (FAM9) is not in the table either; the underscore is how the caller tells the two apart. Tags
 * are matched as written. The standards write them in capitals, so a lower case tag is not in the
 * table. A standard tag under an extension, or under a made-up tag, gives false, since no standard
 * puts it there; whether to mark such a line is for the caller.
 *
 * The table knows the one tag directly above a line, and nothing higher. It cannot tell which
 * DATE a TIME may sit under (5.5.1 allows it in the header's date and in a change date, and no
 * other); it says that TIME may sit under DATE.
 *
 * The places are read from the grammar of each standard: the record and substructure rules of
 * Chapter 2 in 5.5.1 (its Appendix A is only a glossary), and the structure organization of
 * Chapter 3 in 7.0. A tag defined by both has two lists, which are often the same.
 * tests/tags.test.js counts the table against the tag lists the standards print themselves.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GedTags = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const V551 = '5.5.1';
  const V7 = '7.0';
  // In a row below, `in551` and `in7` name the tags the tag may sit directly under, as words with
  // spaces between. A version that does not define the tag has null. SAME, for 7.0, means the
  // same list as for 5.5.1.
  const SAME = 'same';

  // Every event and fact (a person's, and then a family's) carries the same detail lines, so a tag
  // such as DATE, PLAC or ADDR lists all of them as parents. These names keep the rows short.
  const PERSON_EVENTS = `ADOP BAPM BARM BASM BIRT BLES BURI CENS CHR CHRA CONF CREM DEAT EMIG EVEN
    FCOM GRAD IMMI NATU ORDN PROB RETI WILL`;
  const PERSON_FACTS = 'CAST DSCR EDUC FACT IDNO NATI NCHI NMR OCCU PROP RELI RESI SSN TITL';
  // The family events that are not also in the two lists above.
  const FAMILY_EVENTS = 'ANUL DIV DIVF ENGA MARB MARC MARL MARR MARS';
  const EVENTS = `${PERSON_EVENTS} ${PERSON_FACTS} ${FAMILY_EVENTS}`;
  // The ceremonies of the Latter-day Saint church. 7.0 brought INIL back.
  const LDS_551 = 'BAPL CONL ENDL SLGC SLGS';
  const LDS_7 = `${LDS_551} INIL`;

  // CONC and CONT carry a long value on to the next line. 5.5.1 draws them under a few tags only
  // (NOTE, TEXT, ADDR and the like), but its first chapter lets any long value be broken this way,
  // and files do it under many more. So the places here are every tag that can hold a value other
  // than a pointer or Y, and not just the few the grammar draws them under: to call a long PAGE or
  // OCCU line out of place would be wrong more often than right. 7.0 draws the line tighter: only a
  // payload of type Text or Special can hold a line break, so those are its tags. CONC is not in
  // 7.0 at all: that standard reserves the tag and defines nothing for it.
  const CONTINUABLE_551 = `ABBR ADDR ADOP ADR1 ADR2 ADR3 AFN AGE AGNC ANCE AUTH CALN CAST CAUS
    CHAR CITY COPR CORP CTRY DATA DATE DESC DEST DSCR EDUC EMAIL EVEN FACT FAMF FAX FILE FONE FORM
    GIVN IDNO LANG LATI LONG MEDI NAME NATI NCHI NICK NMR NOTE NPFX NSFX OCCU ORDI PAGE PEDI PHON
    PLAC POST PROP PUBL QUAY REFN RELA RELI RESN RFN RIN ROLE ROMN SEX SOUR SPFX SSN STAE STAT
    SURN TEMP TEXT TIME TITL TYPE VERS WWW`;
  const CONTINUABLE_7 = `ABBR ADDR ADR1 ADR2 ADR3 AGNC AUTH CALN CAST CAUS CITY COPR CORP CTRY
    DATA DEST DSCR EDUC EMAIL EVEN EXID FACT FAX GIVN IDNO NAME NATI NICK NOTE NPFX NSFX OCCU PAGE
    PHON PHRASE POST PROP PUBL REFN RELI RESI SNOTE SOUR SPFX SSN STAE SURN TEMP TEXT TITL TRAN
    TYPE UID VERS WWW`;

  const ROWS = [
    { tag: 'ABBR',
      meaning: 'A short title for a source, used to file and find it.',
      in551: 'SOUR', in7: SAME },
    { tag: 'ADDR',
      meaning: 'An address, written as it would be on an envelope.',
      in551: `${EVENTS} CORP REPO SUBM`, in7: SAME },
    { tag: 'ADOP',
      meaning: 'Adoption of a person. Under a family link: which parent adopted them.',
      in551: 'FAMC INDI', in7: SAME },
    { tag: 'ADR1',
      meaning: 'The first line of an address, repeated on its own for sorting.',
      in551: 'ADDR', in7: SAME },
    { tag: 'ADR2',
      meaning: 'The second line of an address, repeated on its own for sorting.',
      in551: 'ADDR', in7: SAME },
    { tag: 'ADR3',
      meaning: 'The third line of an address, repeated on its own for sorting.',
      in551: 'ADDR', in7: SAME },
    { tag: 'AFN',
      meaning: 'A number for a person in Ancestral File, an old FamilySearch database.',
      in551: 'INDI', in7: null },
    { tag: 'AGE',
      meaning: 'How old the person was at the event.',
      in551: `${PERSON_EVENTS} ${PERSON_FACTS} HUSB WIFE`, in7: SAME },
    { tag: 'AGNC',
      meaning: 'The office, church or person in charge of an event or a record.',
      in551: `${EVENTS} DATA`, in7: SAME },
    { tag: 'ALIA',
      meaning: 'Points to another record that may describe the same person.',
      in551: 'INDI', in7: SAME },
    { tag: 'ANCE',
      meaning: 'How many generations of ancestors the file holds.',
      in551: 'SUBN', in7: null },
    { tag: 'ANCI',
      meaning: 'Marks an interest in researching more ancestors of this person.',
      in551: 'INDI', in7: SAME },
    { tag: 'ANUL',
      meaning: 'Annulment: a marriage declared void from the start.',
      in551: 'FAM', in7: SAME },
    { tag: 'ASSO',
      meaning: 'Points to someone linked to this one, such as a friend or godparent.',
      in551: 'INDI', in7: `${EVENTS} FAM INDI` },
    { tag: 'AUTH',
      meaning: 'Who wrote or compiled a source.',
      in551: 'SOUR', in7: SAME },
    { tag: 'BAPL',
      meaning: 'LDS baptism: a Latter-day Saint baptism, done at age 8 or older.',
      in551: 'INDI', in7: SAME },
    { tag: 'BAPM',
      meaning: 'Baptism, in infancy or later, not LDS.',
      in551: 'INDI', in7: SAME },
    { tag: 'BARM',
      meaning: 'Bar mitzvah: a Jewish coming-of-age ceremony for a boy of about 13.',
      in551: 'INDI', in7: SAME },
    { tag: 'BASM',
      meaning: 'Bat mitzvah: a Jewish coming-of-age ceremony for a girl of about 13.',
      in551: 'INDI', in7: SAME },
    { tag: 'BIRT',
      meaning: 'Birth: when and where a person was born.',
      in551: 'INDI', in7: SAME },
    { tag: 'BLES',
      meaning: 'Blessing: a religious blessing, often given at a naming.',
      in551: 'INDI', in7: SAME },
    { tag: 'BURI',
      meaning: 'Burial: when and where the remains were laid to rest.',
      in551: 'INDI', in7: SAME },
    { tag: 'CALN',
      meaning: 'The call number a repository uses to find a source on its shelves.',
      in551: 'REPO', in7: SAME },
    { tag: 'CAST',
      meaning: 'Caste: the rank or group a person had in society.',
      in551: 'INDI', in7: SAME },
    { tag: 'CAUS',
      meaning: 'The cause of an event, such as the cause of a death.',
      in551: EVENTS, in7: SAME },
    { tag: 'CENS',
      meaning: 'Census: a count of the people living in an area.',
      in551: 'FAM INDI', in7: SAME },
    { tag: 'CHAN',
      meaning: 'When this record was last changed.',
      in551: 'FAM INDI NOTE OBJE REPO SOUR SUBM SUBN', in7: 'FAM INDI OBJE REPO SNOTE SOUR SUBM' },
    { tag: 'CHAR',
      meaning: 'The character set the file is written in, such as UTF-8.',
      in551: 'HEAD', in7: null },
    { tag: 'CHIL',
      meaning: 'Points to a child in a family.',
      in551: 'FAM', in7: SAME },
    { tag: 'CHR',
      meaning: 'Christening: the baptism or naming of a child, not LDS.',
      in551: 'INDI', in7: SAME },
    { tag: 'CHRA',
      meaning: 'Christening of an adult: baptism or naming, not LDS.',
      in551: 'INDI', in7: SAME },
    { tag: 'CITY',
      meaning: 'The city in an address.',
      in551: 'ADDR', in7: SAME },
    { tag: 'CONC',
      meaning: 'Carries on the text above it, joined with nothing in between.',
      in551: CONTINUABLE_551, in7: null },
    { tag: 'CONF',
      meaning: 'Confirmation: the church rite that gives full membership, not LDS.',
      in551: 'INDI', in7: SAME },
    { tag: 'CONL',
      meaning: 'LDS confirmation: joining the Latter-day Saint church after baptism.',
      in551: 'INDI', in7: SAME },
    { tag: 'CONT',
      meaning: 'Carries on the text above it, on a new line.',
      in551: CONTINUABLE_551, in7: CONTINUABLE_7 },
    { tag: 'COPR',
      meaning: 'A copyright statement.',
      in551: 'HEAD DATA', in7: SAME },
    { tag: 'CORP',
      meaning: 'The company that made the program that wrote the file.',
      in551: 'SOUR', in7: SAME },
    { tag: 'CREA',
      meaning: 'When this record was first made.',
      in551: null, in7: 'FAM INDI OBJE REPO SNOTE SOUR SUBM' },
    { tag: 'CREM',
      meaning: 'Cremation: when and where a body was cremated.',
      in551: 'INDI', in7: SAME },
    { tag: 'CROP',
      meaning: 'The part of a picture to show.',
      in551: null, in7: 'OBJE' },
    { tag: 'CTRY',
      meaning: 'The country in an address.',
      in551: 'ADDR', in7: SAME },
    { tag: 'DATA',
      meaning: 'What a source holds, or the data source a file came from.',
      in551: 'SOUR', in7: SAME },
    { tag: 'DATE',
      meaning: 'A date: of an event, of a change, or of the file itself.',
      in551: `HEAD ${EVENTS} ${LDS_551} CHAN DATA STAT`,
      in7: `HEAD ${EVENTS} ${LDS_7} CHAN CREA DATA NO STAT` },
    { tag: 'DEAT',
      meaning: 'Death: when and where a person died.',
      in551: 'INDI', in7: SAME },
    { tag: 'DESC',
      meaning: 'How many generations of descendants the file holds.',
      in551: 'SUBN', in7: null },
    { tag: 'DESI',
      meaning: 'Marks an interest in researching more descendants of this person.',
      in551: 'INDI', in7: SAME },
    { tag: 'DEST',
      meaning: 'The program or system the file is meant for.',
      in551: 'HEAD', in7: SAME },
    { tag: 'DIV',
      meaning: 'Divorce: a marriage ended by a court.',
      in551: 'FAM', in7: SAME },
    { tag: 'DIVF',
      meaning: 'Divorce filed: a divorce was applied for.',
      in551: 'FAM', in7: SAME },
    { tag: 'DSCR',
      meaning: 'Physical description: hair, eyes, height and so on.',
      in551: 'INDI', in7: SAME },
    { tag: 'EDUC',
      meaning: 'Education: the schooling a person reached.',
      in551: 'INDI', in7: SAME },
    { tag: 'EMAIL',
      meaning: 'An email address.',
      in551: `${EVENTS} CORP REPO SUBM`, in7: SAME },
    { tag: 'EMIG',
      meaning: 'Emigration: leaving the home country to live elsewhere.',
      in551: 'INDI', in7: SAME },
    { tag: 'ENDL',
      meaning: 'LDS endowment: a Latter-day Saint temple ceremony.',
      in551: 'INDI', in7: SAME },
    { tag: 'ENGA',
      meaning: 'Engagement: an agreement between two people to marry.',
      in551: 'FAM', in7: SAME },
    { tag: 'EVEN',
      meaning: 'A general event, named by TYPE. Under a source: the kind of event it records.',
      in551: 'DATA FAM INDI SOUR', in7: SAME },
    { tag: 'EXID',
      meaning: 'An id given by an outside group or website for this thing.',
      in551: null, in7: 'FAM INDI OBJE PLAC REPO SNOTE SOUR SUBM' },
    { tag: 'FACT',
      meaning: 'A general fact or trait, named by TYPE.',
      in551: 'INDI', in7: 'FAM INDI' },
    { tag: 'FAM',
      meaning: 'A family: a couple, and their children if any.',
      in551: 'record', in7: SAME },
    { tag: 'FAMC',
      meaning: 'Points to a family in which the person is a child.',
      in551: 'ADOP BIRT CHR INDI SLGC', in7: SAME },
    { tag: 'FAMF',
      meaning: 'The name of a family file kept at an LDS temple.',
      in551: 'SUBN', in7: null },
    { tag: 'FAMS',
      meaning: 'Points to a family in which the person is a partner or parent.',
      in551: 'INDI', in7: SAME },
    { tag: 'FAX',
      meaning: 'A fax number.',
      in551: `${EVENTS} CORP REPO SUBM`, in7: SAME },
    { tag: 'FCOM',
      meaning: 'First communion: first taking part in communion at church.',
      in551: 'INDI', in7: SAME },
    { tag: 'FILE',
      meaning: 'A file name: a picture or other media file, or the name of this file itself.',
      in551: 'HEAD OBJE', in7: 'OBJE' },
    { tag: 'FONE',
      meaning: 'A name or place respelled to show how it sounds.',
      in551: 'NAME PLAC', in7: null },
    { tag: 'FORM',
      meaning: 'A format: of a media file, of place names, or of the GEDCOM itself.',
      in551: 'FILE GEDC PLAC', in7: 'FILE PLAC TRAN' },
    { tag: 'GEDC',
      meaning: 'Says which GEDCOM version the file follows.',
      in551: 'HEAD', in7: SAME },
    { tag: 'GIVN',
      meaning: 'The given name part of a name.',
      in551: 'FONE NAME ROMN', in7: 'NAME TRAN' },
    { tag: 'GRAD',
      meaning: 'Graduation: receiving a diploma or degree.',
      in551: 'INDI', in7: SAME },
    { tag: 'HEAD',
      meaning: 'The header: facts about the whole file. It comes first.',
      in551: 'record', in7: SAME },
    { tag: 'HEIGHT',
      meaning: 'How many pixels tall to show of a picture.',
      in551: null, in7: 'CROP' },
    { tag: 'HUSB',
      meaning: 'The husband in a family. Under a family event: details about the husband, such as age.',
      in551: 'ANUL CENS DIV DIVF ENGA EVEN FAM MARB MARC MARL MARR MARS RESI',
      in7: 'ANUL CENS DIV DIVF ENGA EVEN FACT FAM MARB MARC MARL MARR MARS NCHI RESI' },
    { tag: 'IDNO',
      meaning: 'An identity number, such as a national ID. TYPE says which kind.',
      in551: 'INDI', in7: SAME },
    { tag: 'IMMI',
      meaning: 'Immigration: arriving in a new country to live.',
      in551: 'INDI', in7: SAME },
    { tag: 'INDI',
      meaning: 'An individual: one person.',
      in551: 'record', in7: SAME },
    { tag: 'INIL',
      meaning: 'LDS initiatory: a Latter-day Saint temple ceremony.',
      in551: null, in7: 'INDI' },
    { tag: 'LANG',
      meaning: 'A language: the one the text is written in, or one a person speaks.',
      in551: 'HEAD SUBM', in7: 'HEAD NOTE PLAC SNOTE SUBM TEXT TRAN' },
    { tag: 'LATI',
      meaning: 'Latitude: how far north or south a place is.',
      in551: 'MAP', in7: SAME },
    { tag: 'LEFT',
      meaning: 'How many pixels to cut from the left of a picture.',
      in551: null, in7: 'CROP' },
    { tag: 'LONG',
      meaning: 'Longitude: how far east or west a place is.',
      in551: 'MAP', in7: SAME },
    { tag: 'MAP',
      meaning: 'Where a place is on a map, as latitude and longitude.',
      in551: 'PLAC', in7: SAME },
    { tag: 'MARB',
      meaning: 'Marriage banns: public notice that two people plan to marry.',
      in551: 'FAM', in7: SAME },
    { tag: 'MARC',
      meaning: 'Marriage contract: a formal agreement made before a marriage.',
      in551: 'FAM', in7: SAME },
    { tag: 'MARL',
      meaning: 'Marriage license: official permission to marry.',
      in551: 'FAM', in7: SAME },
    { tag: 'MARR',
      meaning: 'Marriage: a wedding or other joining of two partners as a family.',
      in551: 'FAM', in7: SAME },
    { tag: 'MARS',
      meaning: 'Marriage settlement: an agreement about property before a marriage.',
      in551: 'FAM', in7: SAME },
    { tag: 'MEDI',
      meaning: 'The kind of medium: book, film, photo and so on.',
      in551: 'CALN FORM', in7: SAME },
    { tag: 'MIME',
      meaning: 'The kind of text in a note or other text: plain or HTML.',
      in551: null, in7: 'NOTE SNOTE TEXT TRAN' },
    { tag: 'NAME',
      meaning: 'A name: of a person, a submitter, a repository or a program.',
      in551: 'INDI REPO SOUR SUBM', in7: SAME },
    { tag: 'NATI',
      meaning: 'Nationality: the national or tribal origin of a person.',
      in551: 'INDI', in7: SAME },
    { tag: 'NATU',
      meaning: 'Naturalization: becoming a citizen of a country.',
      in551: 'INDI', in7: SAME },
    { tag: 'NCHI',
      meaning: 'How many children a person or a family has.',
      in551: 'FAM INDI', in7: SAME },
    { tag: 'NICK',
      meaning: 'A nickname.',
      in551: 'FONE NAME ROMN', in7: 'NAME TRAN' },
    { tag: 'NMR',
      meaning: 'How many families a person has been a partner or parent in.',
      in551: 'INDI', in7: SAME },
    { tag: 'NO',
      meaning: 'Something that did not happen, such as NO MARR for no marriage.',
      in551: null, in7: 'FAM INDI' },
    { tag: 'NOTE',
      meaning: 'A note: extra information for whoever reads the data.',
      in551: `record HEAD ${EVENTS} ${LDS_551} ASSO CHAN DATA FAM FAMC FAMS FONE INDI NAME OBJE
        PLAC REPO ROMN SOUR SUBM SUBN`,
      in7: `HEAD ${EVENTS} ${LDS_7} ASSO CHAN DATA FAM FAMC FAMS INDI NAME NO OBJE PLAC REPO SOUR
        SUBM` },
    { tag: 'NPFX',
      meaning: 'A name prefix, such as Dr. or Lt.',
      in551: 'FONE NAME ROMN', in7: 'NAME TRAN' },
    { tag: 'NSFX',
      meaning: 'A name suffix, such as Jr. or III.',
      in551: 'FONE NAME ROMN', in7: 'NAME TRAN' },
    { tag: 'OBJE',
      meaning: 'A picture, sound or other media object, or a link to one.',
      in551: `record ${EVENTS} FAM INDI SOUR SUBM`, in7: SAME },
    { tag: 'OCCU',
      meaning: 'Occupation: the job or profession of a person.',
      in551: 'INDI', in7: SAME },
    { tag: 'ORDI',
      meaning: 'Whether LDS temple work should be processed: yes or no.',
      in551: 'SUBN', in7: null },
    { tag: 'ORDN',
      meaning: 'Ordination: receiving the authority to act in religious matters.',
      in551: 'INDI', in7: SAME },
    { tag: 'PAGE',
      meaning: 'Where to look in a source: a page, film, line or the like.',
      in551: 'SOUR', in7: SAME },
    { tag: 'PEDI',
      meaning: 'How a child is linked to a family: birth, adopted, foster or sealed.',
      in551: 'FAMC', in7: SAME },
    { tag: 'PHON',
      meaning: 'A phone number.',
      in551: `${EVENTS} CORP REPO SUBM`, in7: SAME },
    { tag: 'PHRASE',
      meaning: 'The words as a source gave them, when a standard form cannot hold them.',
      in551: null,
      in7: 'ADOP AGE ALIA ASSO CHIL DATE EVEN HUSB MEDI PEDI ROLE SDATE STAT TYPE WIFE' },
    { tag: 'PLAC',
      meaning: 'A place, written from smallest to largest: town, county, state, country.',
      in551: `HEAD ${EVENTS} ${LDS_551}`, in7: `HEAD ${EVENTS} ${LDS_7}` },
    { tag: 'POST',
      meaning: 'The postal code in an address.',
      in551: 'ADDR', in7: SAME },
    { tag: 'PROB',
      meaning: 'Probate: a court proving that a will is valid.',
      in551: 'INDI', in7: SAME },
    { tag: 'PROP',
      meaning: 'Property: land or goods a person owned.',
      in551: 'INDI', in7: SAME },
    { tag: 'PUBL',
      meaning: 'When and where a source was published or made.',
      in551: 'SOUR', in7: SAME },
    { tag: 'QUAY',
      meaning: 'How reliable the evidence is, from 0 (weakest) to 3 (strongest).',
      in551: 'SOUR', in7: SAME },
    { tag: 'REFN',
      meaning: 'A reference number or word you chose to identify a record.',
      in551: 'FAM INDI NOTE OBJE REPO SOUR', in7: 'FAM INDI OBJE REPO SNOTE SOUR SUBM' },
    { tag: 'RELA',
      meaning: 'How two people are related, in words, such as godfather.',
      in551: 'ASSO', in7: null },
    { tag: 'RELI',
      meaning: 'Religion: the denomination of a person or an event.',
      in551: `${EVENTS} INDI`, in7: SAME },
    { tag: 'REPO',
      meaning: 'A repository: a library, archive or person that keeps sources. Also a link to one.',
      in551: 'record SOUR', in7: SAME },
    { tag: 'RESI',
      meaning: 'Residence: where a person or a family lived.',
      in551: 'FAM INDI', in7: SAME },
    { tag: 'RESN',
      meaning: 'A restriction: the data is confidential, locked or private.',
      in551: `${EVENTS} FAM INDI`, in7: `${EVENTS} FAM INDI OBJE` },
    { tag: 'RETI',
      meaning: 'Retirement: leaving a job after years of work.',
      in551: 'INDI', in7: SAME },
    { tag: 'RFN',
      meaning: 'A permanent number that identifies a record within a known file.',
      in551: 'INDI SUBM', in7: null },
    { tag: 'RIN',
      meaning: 'A record number given by the program that wrote the file.',
      in551: 'FAM INDI NOTE OBJE REPO SOUR SUBM SUBN', in7: null },
    { tag: 'ROLE',
      meaning: 'The part someone played in an event, such as witness or godparent.',
      in551: 'EVEN', in7: 'ASSO EVEN' },
    { tag: 'ROMN',
      meaning: 'A name or place written again in Latin letters.',
      in551: 'NAME PLAC', in7: null },
    { tag: 'SCHMA',
      meaning: 'A list that says what each underscore tag in the file means.',
      in551: null, in7: 'HEAD' },
    { tag: 'SDATE',
      meaning: 'A date used only to put lines in order.',
      in551: null, in7: EVENTS },
    { tag: 'SEX',
      meaning: 'The sex of a person, written as one letter such as M or F.',
      in551: 'INDI', in7: SAME },
    { tag: 'SLGC',
      meaning: 'LDS sealing of a child to the parents, a temple ceremony.',
      in551: 'INDI', in7: SAME },
    { tag: 'SLGS',
      meaning: 'LDS sealing of a couple, a temple ceremony.',
      in551: 'FAM', in7: SAME },
    { tag: 'SNOTE',
      meaning: 'A shared note: one note that many lines can point to.',
      in551: null,
      in7: `record HEAD ${EVENTS} ${LDS_7} ASSO CHAN DATA FAM FAMC FAMS INDI NAME NO OBJE PLAC
        REPO SOUR SUBM` },
    { tag: 'SOUR',
      meaning: 'A source: where a fact came from. Also a link to one, or the program that made the file.',
      in551: `record HEAD ${EVENTS} ${LDS_551} ASSO FAM FONE INDI NAME NOTE OBJE ROMN`,
      in7: `record HEAD ${EVENTS} ${LDS_7} ASSO FAM INDI NAME NO NOTE OBJE SNOTE` },
    { tag: 'SPFX',
      meaning: 'A surname prefix, such as de or van.',
      in551: 'FONE NAME ROMN', in7: 'NAME TRAN' },
    { tag: 'SSN',
      meaning: 'A US Social Security number.',
      in551: 'INDI', in7: SAME },
    { tag: 'STAE',
      meaning: 'The state or region in an address.',
      in551: 'ADDR', in7: SAME },
    { tag: 'STAT',
      meaning: 'The status of an LDS ceremony, or of the link between a child and a family.',
      in551: `${LDS_551} FAMC`, in7: `${LDS_7} FAMC` },
    { tag: 'SUBM',
      meaning: 'A submitter: who gave the data to the file. Also a link to one.',
      in551: 'record HEAD FAM INDI SUBN', in7: 'record HEAD FAM INDI' },
    { tag: 'SUBN',
      meaning: 'A submission: instructions for an LDS system that handles temple work.',
      in551: 'record HEAD', in7: null },
    { tag: 'SURN',
      meaning: 'The surname, or family name, part of a name.',
      in551: 'FONE NAME ROMN', in7: 'NAME TRAN' },
    { tag: 'TAG',
      meaning: 'Says what one underscore tag means, by a web address.',
      in551: null, in7: 'SCHMA' },
    { tag: 'TEMP',
      meaning: 'The LDS temple where a ceremony was done.',
      in551: `${LDS_551} SUBN`, in7: LDS_7 },
    { tag: 'TEXT',
      meaning: 'The exact words found in a source.',
      in551: 'DATA SOUR', in7: SAME },
    { tag: 'TIME',
      meaning: 'A time of day on a 24-hour clock.',
      in551: 'DATE', in7: 'DATE SDATE' },
    { tag: 'TITL',
      meaning: 'A title: of a source or media file, or one a person holds, such as Duke.',
      in551: 'FILE INDI OBJE SOUR', in7: SAME },
    { tag: 'TOP',
      meaning: 'How many pixels to cut from the top of a picture.',
      in551: null, in7: 'CROP' },
    { tag: 'TRAN',
      meaning: 'The same thing again in another language, script or file type.',
      in551: null, in7: 'FILE NAME NOTE PLAC SNOTE' },
    { tag: 'TRLR',
      meaning: 'The trailer: it ends the file.',
      in551: 'record', in7: SAME },
    { tag: 'TYPE',
      meaning: 'A word that says what kind of thing the line above it is.',
      in551: `${EVENTS} FONE FORM NAME REFN ROMN`, in7: `${EVENTS} EXID NAME REFN` },
    { tag: 'UID',
      meaning: 'A unique id for a record or an event that stays the same through edits.',
      in551: null, in7: `${EVENTS} FAM INDI OBJE REPO SNOTE SOUR SUBM` },
    { tag: 'VERS',
      meaning: 'A version number: of the program, or of GEDCOM.',
      in551: 'CHAR GEDC SOUR', in7: 'GEDC SOUR' },
    { tag: 'WIDTH',
      meaning: 'How many pixels wide to show of a picture.',
      in551: null, in7: 'CROP' },
    { tag: 'WIFE',
      meaning: 'The wife in a family. Under a family event: details about the wife, such as age.',
      in551: 'ANUL CENS DIV DIVF ENGA EVEN FAM MARB MARC MARL MARR MARS RESI',
      in7: 'ANUL CENS DIV DIVF ENGA EVEN FACT FAM MARB MARC MARL MARR MARS NCHI RESI' },
    { tag: 'WILL',
      meaning: 'A will: the document that says who gets what a person leaves.',
      in551: 'INDI', in7: SAME },
    { tag: 'WWW',
      meaning: 'A web address.',
      in551: `${EVENTS} CORP REPO SUBM`, in7: SAME },
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
    if (!BY_TAG.has(tag) || (version !== V551 && version !== V7)) return null;
    const sits = SITS.get(`${tag} ${version}`);
    return sits ? sits.has(parentTag) : false;
  }

  return { TAGS, meaning, allowedUnder };
});
