# GEDCOM Stress-Test Corpora — MANIFEST

> Fetched **2026-06-16** per `docs/` handoff "GEDCOM Stress-Test Corpora — Acquisition & Alignment".
> Read-only acquisition into `api/tests/fixtures/gedcom-corpora/` (co-located with the pytest suite,
> inside the bind-mounted `api/` tree so tests can read fixtures in-container). **Uncommitted**
> pending the curator licensing ruling (see Caveats). This file is the snapshot-before-import
> discipline applied to fixtures: if a source site dies, it records what we had and where it came from.

**Total: 85 files across 5 corpora.** All `.ged` verified as genuine GEDCOM (start `0 HEAD`); 
all archives are real PK ZIPs passing `unzip -t`. sha256 spot-checked against disk on acquisition.

| Corpus | Dir | Files | Version | Author | License |
|---|---|---|---|---|---|
| GEDCOM 5.5.5 sample files | `gedcom555/` | 6 | 5.5.5 | Tamura Jones / GEDCOM 5.5.5 spec (gedcom.org) | gedcom.org terms of use |
| GEDitCOM TGC 5.5 torture test set + OBJE/FILE media | `geditcom-tgc/` | 24 | 5.5 | John A. Nairn (GEDitCOM), orig. H. Eichmann | GEDitCOM terms of use |
| Heiner Eichmann GEDCOM 5.5 samples + charset/terminator set | `eichmann/` | 27 | 5.5 | Heiner Eichmann | Free to use provided not charged for |
| Tamura Jones torture tests (scale extremes) | `jones-torture/` | 5 | 5.5.x | Tamura Jones | Tamura Jones terms of use |
| GEDCOM 7.0 example files | `gedcom7/` | 23 | 7.0 | FamilySearch (via gedcom.io) | Apache-2.0 / FamilySearch (redistribution-friendly) |

---

## Coverage & caveats (from the completeness verifier)

**Verdict:** COMPLETE — all 5 corpora landed in full with zero gaps. 85 files on disk across api/tests/fixtures/gedcom-corpora/ (eichmann=27, gedcom555=6, gedcom7=23, geditcom-tgc=24, jones-torture=5). Every .ged verified as genuine GEDCOM (starts '0 HEAD'; no HTML 403/404 stubs found via DOCTYPE/<html grep). All 4 archives (2 .gdz + TestGED.zip + the 12 eichmann charset zips) are real PK ZIPs; the .gdz and TestGED.zip pass unzip -t integrity. The corpus-2 OBJE media differentiator is CONFIRMED REAL: 18 genuine binary media files (PNG 100x100, JPEG, PDF v1.1, QuickTime mov, etc. — file(1) confirms each is its true type, not a stub) and the TGC GEDs reference them via OBJE/FILE. These corpora are GEDCOM 5.5 / 5.5.5 / 7.0 — they do NOT exercise 5.5.1-only tags, which is the one structural coverage gap (see coverage_notes).

- 5.5 vs 5.5.1 GAP (structural coverage hole): the corpus spans GEDCOM 5.5 (eichmann/jones/TGC), 5.5.5 (gedcom.org), and 7.0 — it does NOT include any 5.5.1 file. The 5.5.1-only tags (OBJE.FILE as a substructure with FORM, plus MAP/LATI/LONG and the phonetic/romanized FONE/ROMN name variants) are therefore NOT exercised by any fixture. This matters because 5.5.1 is Ancestry's nominal export format and the most common real-world dialect the sibling project's importer will see. Recommend sourcing a dedicated 5.5.1 fixture (e.g. an Ancestry-style export with OBJE/FILE/FORM, MAP/LATI/LONG, FONE/ROMN) to close the gap before treating importer charset/tag coverage as complete.
- corpus-2 OBJE MEDIA — CONFIRMED LANDED (the key differentiator vs Ancestry's empty FILE): 18 real binary media files are physically present in geditcom-tgc/media/ and file(1) confirms each is its true type (ImgFile.PNG = PNG 100x100 RGB, ImgFile.JPG = JPEG JFIF, Document.pdf = PDF v1.1, suntun.mov = Apple QuickTime, plus BMP/GIF/MAC/PCX/PIC/PSD/TGA/TIF/DOC/RTF/tex/aif/wav/mpg). The TGC GEDs reference them via OBJE/FILE (38 OBJE / 39 FILE in the full variants). This is the working OBJE+FILE+binary-media chain that Ancestry-style exports lack, so the differentiator test is genuinely covered — not a stub.
- TGC GEDC-version clarification: the acquisition agent reported '1 CHAR ANSEL' and GEDCOM 5.5 for all four TGC files, which is correct. The '2.9.4' VERS that appears near the top is the GEDitCOM application's SOUR VERS, not the GEDC version; the records confirm 1 GEDC / 2 VERS 5.5. No version mismatch.
- LICENSING FLAG (fine for private fixtures; flag before any commercial-repo vendoring or public redistribution): Eichmann (allged/simple + charset set) is free to use provided you are not charged/do not charge for it. GEDitCOM TGC (John Nairn / H. Eichmann), the gedcom.org 5.5.5 samples, and the Tamura Jones (jones-torture) torture files each carry their own terms of use. Using them as a private, in-repo test fixture set is appropriate, but their licenses should be reviewed before bundling into any commercially distributed product or a public open-source repo. GEDCOM 7.0 example set (gedcom.io) is the Apache-2.0 / FamilySearch standard set and is the most redistribution-friendly. TestGED.zip and the charset .zip snapshots were intentionally kept as provenance.
- Line-terminator coverage is broad: CRLF, LF-only (MINIMAL555, eichmann LTERLF/ULHL), CR-only (TGC551/TGC55C, eichmann LTERCR/ULHC), and the rare reversed LF+CR reader-breakers (eichmann ulhlc.ged + LTERLFCR.GED) are all represented. Note Long26CC/Long26LL are BOTH CRLF on disk (CC/LL is a variant-pair label, not a terminator difference) — they do not add a terminator variant.
- UTF-16 coverage: BE+BOM, LE+BOM, BE-no-BOM, LE-no-BOM all present across gedcom555 (555SAMPLE16BE/LE) and the eichmann charset set (UHLBOMCL/UHLCL/ULHBOMCL/ULHC/ULHCL/ULHL/ulhlc). Record-shape counts for UTF-16 and CR-only/ANSEL files are 'n/a' in the acquisition manifests because grep cannot split those without normalization — this is a reporting limitation, not missing content (iconv/tr-normalized spot checks confirm the records are intact).

---

## `gedcom555/` — GEDCOM 5.5.5 sample files

- **Author:** Tamura Jones / GEDCOM 5.5.5 spec (gedcom.org)  ·  **License:** gedcom.org terms of use  ·  **Fetched:** 2026-06-16
- **Entry point:** https://www.gedcom.org/samples.html
- **Failures:** none

| File | Version | Charset | Terminator | Shape | Bytes | SHA-256 | Source |
|---|---|---|---|---|---|---|---|
| `555SAMPLE.GED` | 5.5.5 | UTF-8 (BOM: EF BB BF present) | CRLF (cr=97, lf=97) | 3 INDI, 2 FAM, 1 SOUR, 0 OBJE | 1983 | `47795b0807070cf05cc33182ae142cfc15738dd06e16a7a6a94d13b9bbb9aefd` | …/555SAMPLE.GED |
| `555SAMPLE16BE.GED` | 5.5.5 | UTF-16 BE (BOM: FE FF present) | CRLF (cr=97, lf=97) | n/a (UTF-16, grep cannot count) | 3972 | `0dc9daa4b3cf8adddc9b23191c0e0e002a6056602c781b0d94962df45e7e331d` | …/555SAMPLE16BE.GED |
| `555SAMPLE16LE.GED` | 5.5.5 | UTF-16 LE (BOM: FF FE present) | CRLF (cr=97, lf=97) | n/a (UTF-16, grep cannot count) | 3972 | `a195004b04fa8390bf6f71f869031be3be653c4bca92c97e9fbc938bb0c79694` | …/555SAMPLE16LE.GED |
| `MINIMAL555.GED` | 5.5.5 | UTF-8 (BOM: EF BB BF present) | LF (cr=0, lf=10) | 0 INDI, 0 FAM, 0 SOUR, 0 OBJE | 132 | `67c0b4800d952019936d755d523a15165c7048d8bc817c4ff58d2cb0593005ef` | …/MINIMAL555.GED |
| `REMARR.GED` | 5.5.5 | UTF-8 (BOM: EF BB BF present) | CRLF (cr=75, lf=75) | 3 INDI, 3 FAM, 0 SOUR, 0 OBJE | 1233 | `673bf70ebee6ac0562c22b2bc4753ef164345ae26863e727760d0aca8af50133` | …/REMARR.GED |
| `SSMARR.GED` | 5.5.5 | UTF-8 (BOM: EF BB BF present) | CRLF (cr=48, lf=48) | 2 INDI, 1 FAM, 0 SOUR, 0 OBJE | 864 | `9d4b2f15ce6f1a2fdff85e12801f2cfd5f2b652a7e97d24f3493615f50bce74f` | …/SSMARR.GED |

<details><summary>Per-file notes</summary>

- **`555SAMPLE.GED`** — Canonical GEDCOM 5.5.5 sample file (the conformance + export oracle). UTF-8 with BOM, CRLF line endings. file -I reports text/plain; charset=utf-8.
- **`555SAMPLE16BE.GED`** — UTF-16 big-endian variant of 555SAMPLE.GED — same content as the UTF-8 file, the BOM+endianness test on a VALID file. iconv-to-UTF8 confirms identical shape (3 INDI, 2 FAM, 1 SOUR, 0 OBJE). file -I reports charset=utf-16be. Byte count (3972) is ~2x the UTF-8 file as expected for 2-byte encoding.
- **`555SAMPLE16LE.GED`** — UTF-16 little-endian variant of 555SAMPLE.GED — same content as the BE/UTF-8 files, the BOM+endianness test pair. iconv-to-UTF8 confirms identical shape (3 INDI, 2 FAM, 1 SOUR, 0 OBJE). file -I reports charset=utf-16le. BE and LE differ only in byte order (distinct sha256), same 3972-byte length.
- **`MINIMAL555.GED`** — Minimal starter file — header + trailer only, no records. NOTE: LF-only line endings (cr=0), unlike the CRLF in the other UTF-8 5.5.5 samples — a useful line-terminator edge case. UTF-8 with BOM.
- **`REMARR.GED`** — Remarriage scenario sample (3 individuals across 3 families). UTF-8 with BOM, CRLF.
- **`SSMARR.GED`** — Same-sex marriage scenario sample (2 individuals, 1 family). UTF-8 with BOM, CRLF.

</details>

---

## `geditcom-tgc/` — GEDitCOM TGC 5.5 torture test set + OBJE/FILE media

- **Author:** John A. Nairn (GEDitCOM), orig. H. Eichmann  ·  **License:** GEDitCOM terms of use  ·  **Fetched:** 2026-06-16
- **Entry point:** https://www.geditcom.com/gedcom.html
- **Failures:** none

| File | Version | Charset | Terminator | Shape | Bytes | SHA-256 | Source |
|---|---|---|---|---|---|---|---|
| `TestGED.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 658790 | `839d3ec2befd614236259bdc295457b805ed38a81833651af97790425d908cc8` | https://www.geditcom.com/downlds/TestGED.zip |
| `TGC551.ged` | 5.5 | ANSEL (declared 1 CHAR ANSEL; file -I reports iso-8859-1 because ANSEL high-bytes overlap Latin-1; no BOM, byte0=0x30 '0') | CR | INDI=15 FAM=7 SOUR=2 OBJE=1 | 67294 | `e5f8622d723009fbe70b04e1c30d8651cd53793070857d72ea403b9453061b1a` | https://www.geditcom.com/downlds/TestGED.zip |
| `TGC551LF.ged` | 5.5 | ANSEL (declared 1 CHAR ANSEL; file -I reports iso-8859-1; no BOM, byte0=0x30 '0') | CRLF | INDI=15 FAM=7 SOUR=2 OBJE=1 | 69455 | `7c45ddc175923f59e98539a2e4453d40748201df187c2065bf72a9cfaad70f59` | https://www.geditcom.com/downlds/TestGED.zip |
| `TGC55C.ged` | 5.5 | ANSEL (declared 1 CHAR ANSEL; file -I reports iso-8859-1; no BOM, byte0=0x30 '0') | CR | INDI=15 FAM=7 SOUR=2 OBJE=1 | 68428 | `f631b100ed8f8ff00ca9d3c6af6015039fe9ec3d30d661a826691d5c562d00e0` | https://www.geditcom.com/downlds/TestGED.zip |
| `TGC55CLF.ged` | 5.5 | ANSEL (declared 1 CHAR ANSEL; file -I reports iso-8859-1; no BOM, byte0=0x30 '0') | CRLF | INDI=15 FAM=7 SOUR=2 OBJE=1 | 70625 | `92be44111aacc9b2d60316710063c3c34c8410a3a90e5b9816acb6a7262c26fe` | https://www.geditcom.com/downlds/TestGED.zip |
| `README.txt` | 5.5 | us-ascii (no BOM, byte0=0x2d '-') | CR | INDI=0 FAM=0 SOUR=0 OBJE=0 (documentation, not a GED file) | 7853 | `e04e323c436e4c7837d98090271f380ae264e48e50f7c1b919698f8790b82a87` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/Document.DOC` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 19456 | `b21a4381a0507a0eff73138dc9b04db392d2707d4de3c4763b030a1d576b37fc` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/Document.RTF` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 2031 | `5169efe7158168d26b09ccda85607bbe32e3822f5a0a818541b775f54101853c` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/Document.pdf` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 1938 | `0052cca5ca1e2e04ca197981ca20be9031daf23988ef74cabc88f11e164dec8c` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/Document.tex` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 30 | `392ff6f4071fb6bdc3d1797a1e477d064d58d48b6e4ec04f995c8778715a52d4` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.BMP` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 30054 | `b045cee0ed93c93bd756fcb233f515fc0bf7f93a5abf058f0786235bb8a2edd0` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.GIF` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 2048 | `4ddc3b6af42c845db794bdb9acb5b0e09f9e44ccad80b42c7736aecda26b794e` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.JPG` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 3356 | `3ba905de6764c307ddbc9936f258b81d5dccb88fade8a319bfa6d984f8035fd9` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.MAC` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 2636 | `4bfa2a7a40fad004d3f8e5b63f7716a1af87266b54d87224bfc438b3e872b322` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.PCX` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 8016 | `4d079568eacdb58862f7066761f9f6d49a3f4399df3d843dadddb8fec0e9cff8` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.PIC` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 7444 | `11cf83eb95b3cecf359f176ef3956ed5d175f33ee234aa494a2e43e37f861019` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.PNG` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 2219 | `3809e62c89b42457f81541db034fcef1072400ebebcb0f4d791a687fb1faf9e4` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.PSD` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 30068 | `6187fabb638a4164ee1388271b6a1b8b9e73fb38449abde0a716ca64496fadcd` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.TGA` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 5060 | `605155ff099a8ac7531233c241801e85a0aca33738d5cbf79b0f17f1f6f3ad80` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/ImgFile.TIF` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 30236 | `74d7b9a80455216440f4a2a6b5badb67b74c3eaf0cf3bcc179861b9cec085415` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/enthist.aif` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 384000 | `1ccc62719fc7dcf4bc97f5ae04c478ddfce470a262877a239ed9eeb57749805b` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/force.wav` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 64000 | `7ea522e6e9f4262149eeb0e91444bdfe0e67b12afe4f37171e7be606b95defa9` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/suntun.mov` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 233657 | `67a16176c9d580269476939eab47de6a5c6497c4d72ef527b524219745aab780` | https://www.geditcom.com/downlds/TestGED.zip |
| `media/top.mpg` | 5.5 | n/a (media) | n/a (media) | n/a (media) | 220040 | `9a51a8f68721563ab1baa5f82a84e945263cdb2eb3bef1b7a5c3d15c8ba54aa6` | https://www.geditcom.com/downlds/TestGED.zip |

<details><summary>Per-file notes</summary>

- **`TestGED.zip`** — Provenance snapshot of the full GEDitCOM TGC bundle (kept as required). Contains 4 .ged files, README.txt, and 18 media files. Extracted in place; media moved to media/.
- **`TGC551.ged`** — TGC 5.5 torture test, single-NAME variant ('1' = Joseph Tag Torture record reduced to one NAME structure), CR-only line endings (classic Mac). GEDC VERS 5.5, SOUR GEDitCOM 2.9.4. Extracted from TestGED.zip. grep needed -a and CR->LF normalization to count records.
- **`TGC551LF.ged`** — Identical content to TGC551.ged but CRLF line endings (cr=2161 lf=2161). Single-NAME variant. Extracted from TestGED.zip.
- **`TGC55C.ged`** — TGC 5.5 torture test, full/complete variant (multi-NAME structures on the Joseph Tag Torture record). CR-only line endings (cr=2197 lf=0). GEDC VERS 5.5. Extracted from TestGED.zip.
- **`TGC55CLF.ged`** — Identical content to TGC55C.ged but CRLF line endings (cr=2197 lf=2197). Full multi-NAME torture variant. Extracted from TestGED.zip. The most complete of the four — exercises multiple NAME structures, ANSEL special chars, OBJE/FILE links, custom _HME tag, RESN locked/privacy.
- **`README.txt`** — Canonical TGC torture-test documentation (header-record notes by H. Eichmann, modified by J.A. Nairn). Explains the 4 variants, what each record/tag tests, and that media files are linked via OBJE FILE to test link preservation. CR-only line endings (cr=107 lf=0). Extracted from TestGED.zip.
- **`media/Document.DOC`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/Document.RTF`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/Document.pdf`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/Document.tex`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/ImgFile.BMP`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/ImgFile.GIF`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/ImgFile.JPG`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/ImgFile.MAC`** — media (OBJE/FILE target, MacPaint format); extracted from TestGED.zip
- **`media/ImgFile.PCX`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/ImgFile.PIC`** — media (OBJE/FILE target, QuickDraw PICT); extracted from TestGED.zip
- **`media/ImgFile.PNG`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/ImgFile.PSD`** — media (OBJE/FILE target, Photoshop); extracted from TestGED.zip
- **`media/ImgFile.TGA`** — media (OBJE/FILE target, Targa); extracted from TestGED.zip
- **`media/ImgFile.TIF`** — media (OBJE/FILE target); extracted from TestGED.zip
- **`media/enthist.aif`** — media (OBJE/FILE target, AIFF audio); extracted from TestGED.zip
- **`media/force.wav`** — media (OBJE/FILE target, WAV audio); extracted from TestGED.zip
- **`media/suntun.mov`** — media (OBJE/FILE target, QuickTime MOV); extracted from TestGED.zip
- **`media/top.mpg`** — media (OBJE/FILE target, MPEG video); extracted from TestGED.zip

</details>

---

## `eichmann/` — Heiner Eichmann GEDCOM 5.5 samples + charset/terminator set

- **Author:** Heiner Eichmann  ·  **License:** Free to use provided not charged for  ·  **Fetched:** 2026-06-16
- **Entry point:** http://heiner-eichmann.de/gedcom/gedcom.htm
- **Failures:** none

| File | Version | Charset | Terminator | Shape | Bytes | SHA-256 | Source |
|---|---|---|---|---|---|---|---|
| `allged.ged` | 5.5 | ASCII (us-ascii, no BOM); HEAD declares 1 CHAR ASCII | LF (cr=0, lf=1159) | INDI=8 FAM=4 SOUR=1 OBJE=0 | 32489 | `075366317321e24b0f527d2b90fc63402a61726a40a4414e1e33a432a0e50aa5` | …/allged.ged |
| `simple.ged` | 5.5 | ASCII (us-ascii, no BOM); HEAD declares 1 CHAR ASCII | LF (cr=0, lf=48) | INDI=3 FAM=1 SOUR=0 OBJE=0 | 742 | `fe08c272ae9ea768248ad766a6091e7d224b91872130bf98f886323289a2fd9a` | …/simple.ged |
| `charset/ANSEL.GED` | 5.5 | ANSEL (HEAD declares 1 CHAR ANSEL; 1543 raw bytes >= 0x80 = ANSEL diacritic chars). NOTE: file -I mislabels it 'iso-8859-1' but it is genuine ANSEL, not Latin-1. No BOM. | CRLF (cr=315, lf=315) | n/a (grep -c matched 0 INDI/FAM/SOUR/OBJE; high-byte ANSEL bytes break grep's line matching). File is the ANSEL charset reference sample. | 10794 | `68bfc9179511de67ec463cd6eee024c2fa01dfc33938fc6f01bb2ffc6fbf2c72` | …/ansel.zip |
| `charset/UHLBOMCL.GED` | 5.5 | UTF-16 BE (Unicode, High-Low byte order = big-endian) WITH BOM (first bytes FE FF). HEAD declares 1 CHAR UNICODE. | CRLF (CR+LF; raw 0x0D=331, 0x0A=331) | n/a (UTF-16, grep cannot count) | 16700 | `a6459b63e74ae6abf94f559ea8df6c06cc3d24341bdf11e8de662b7f608e1016` | …/uhlbomcl.zip |
| `charset/UHLCL.GED` | 5.5 | UTF-16 BE (Unicode, High-Low byte order = big-endian) NO BOM (first bytes 00 30 = high byte 0x00 of '0'). HEAD declares 1 CHAR UNICODE. file -I reports application/octet-stream because there is no BOM. | CRLF (CR+LF; raw 0x0D=331, 0x0A=331) | n/a (UTF-16, grep cannot count) | 16706 | `f63e1c8d2f0e40be1eb5505d5e29ea1375860b88eabc6e871e378eb1d4c5bbcb` | …/uhlcl.zip |
| `charset/ULHBOMCL.GED` | 5.5 | UTF-16 LE (Unicode, Low-High byte order = little-endian) WITH BOM (first bytes FF FE). HEAD declares 1 CHAR UNICODE. | CRLF (CR+LF; raw 0x0D=331, 0x0A=331) | n/a (UTF-16, grep cannot count) | 16692 | `ebf7f009538a8655b320fbb89ff0e81590921d53a3ee2877315f2f82d3139c39` | …/ulhbomcl.zip |
| `charset/ULHC.GED` | 5.5 | UTF-16 LE (Unicode, Low-High = little-endian) NO BOM (first bytes 30 00 = '0' low byte then 0x00). HEAD declares 1 CHAR UNICODE; decodes via iconv -f UTF-16LE. file -I reports octet-stream (no BOM). | CR only (raw 0x0D=331, 0x0A=2). The 2 stray 0x0A bytes are content/low-byte artifacts within UTF-16 codepoints, not terminators; the actual line terminator is CR. | n/a (UTF-16, grep cannot count) | 16016 | `813c89738557a1d3ae6cc237c43ba4972c549b0cf0241feed37142f25c1189a5` | …/ulhc.zip |
| `charset/ULHCL.GED` | 5.5 | UTF-16 LE (Unicode, Low-High = little-endian) NO BOM (first bytes 30 00). HEAD declares 1 CHAR UNICODE. file -I reports octet-stream (no BOM). | CRLF (CR+LF; raw 0x0D=331, 0x0A=331) | n/a (UTF-16, grep cannot count) | 16698 | `ce7eed88b2412839d1a3589f90cc3d6beef7e93e1f30ede945a0ce400cf211b3` | …/ulhcl.zip |
| `charset/ULHL.GED` | 5.5 | UTF-16 LE (Unicode, Low-High = little-endian) NO BOM (first bytes 30 00). HEAD declares 1 CHAR UNICODE. file -I reports octet-stream (no BOM). | LF only (raw 0x0A=331, 0x0D=2). The 2 stray 0x0D bytes are content/low-byte artifacts within UTF-16 codepoints; the actual line terminator is LF. | n/a (UTF-16, grep cannot count) | 16004 | `c0dd2fb28b6d6c17b7d123bf5f0055d60817e252f1f9f73b4699420b07898386` | …/ulhl.zip |
| `charset/ulhlc.ged` | 5.5 | UTF-16 LE (Unicode, Low-High = little-endian) NO BOM (first bytes 30 00). HEAD declares 1 CHAR UNICODE. file -I reports octet-stream (no BOM). | LFCR (LF+CR; raw 0x0A=331, 0x0D=331). This is the LF-then-CR ordering - the rarest of GEDCOM 5.5's four allowed terminators and a documented reader-breaker. | n/a (UTF-16, grep cannot count) | 16698 | `e925cc901d6061a4376143158f0c4dced1255c9a1283baed06275ed4a675ffb2` | …/ulhlc.zip |
| `charset/LTERCR.GED` | 5.5 | ASCII (us-ascii, no BOM); HEAD declares 1 CHAR ASCII | CR only (cr=50, lf=0) | n/a (grep matched INDI=0/FAM=0/SOUR=0/OBJE=0 because CR-only terminators give grep a single mega-line; the underlying data is the same simple.ged record set: ~3 INDI / 1 FAM) | 844 | `6db0277bd7479ed20059a73f399bf326002ffc4519935201b969d1940f93696d` | …/ltercr.zip |
| `charset/LTERCRLF.GED` | 5.5 | ASCII (us-ascii, no BOM); HEAD declares 1 CHAR ASCII | CRLF (CR+LF; cr=50, lf=50) | INDI=3 FAM=1 SOUR=0 OBJE=0 | 906 | `9fe2de2c417bfb53a14890cac574691171fa6766c5a51e4fb9038995bbe906d3` | …/ltercrlf.zip |
| `charset/LTERLF.GED` | 5.5 | ASCII (us-ascii, no BOM); HEAD declares 1 CHAR ASCII | LF only (cr=0, lf=50) | INDI=3 FAM=1 SOUR=0 OBJE=0 | 838 | `5e75d278c6afbcab50b5f5235588681b84facf0abdc06186b2b418d68948c82a` | …/lterlf.zip |
| `charset/LTERLFCR.GED` | 5.5 | ASCII (us-ascii, no BOM); HEAD declares 1 CHAR ASCII | LFCR (LF+CR; cr=50, lf=50). First bytes show 0A 0D (LF then CR), confirming the reversed ordering. | n/a (grep matched INDI=0/FAM=0/SOUR=0 because the LF+CR ordering confuses line splitting; underlying data is the same simple.ged ~3 INDI / 1 FAM set) | 906 | `c26b34d9776e8a31089180d2126a63ca8f1b91d0ce27e194a3ac8d1c63803885` | …/lterlfcr.zip |
| `charset/ansel.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 5039 | `6f292b5071e9b1342cf3b64ff2778fc8e34e41afc5ec533fe3fd0fe963b5ca6b` | …/ansel.zip |
| `charset/uhlbomcl.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 3822 | `16205259a7c6090284d837443aef8c33f19a2b789395f5260a22d7a6175fc1b0` | …/uhlbomcl.zip |
| `charset/uhlcl.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 3817 | `a33e1e0c1b617b75eaa7976555a472cb1ce9695dddee564c676dacb906eb6e25` | …/uhlcl.zip |
| `charset/ulhbomcl.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 3832 | `8b5080321064b077b0ee72e949349b2e7291df7813ad5f89084872c7b0bb22f7` | …/ulhbomcl.zip |
| `charset/ulhc.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 3796 | `90470a3355e4a57b05499215204bfa26e87266d2554d3167eb5d95be5c23b764` | …/ulhc.zip |
| `charset/ulhcl.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 3826 | `3fd03115ff80b456d068b31627543c5890d9b1c14751757f3968c3a367d3baca` | …/ulhcl.zip |
| `charset/ulhl.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 3789 | `fe2ffb39a4ae6de16c740b58e557079cbdda6d621f718a4027b387e9eb8fcc75` | …/ulhl.zip |
| `charset/ulhlc.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 3828 | `ed83d1cdf384193f729d92a434010aff0cf118e733c3a56a4e7bcb6c8e8da8fb` | …/ulhlc.zip |
| `charset/ltercr.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 583 | `d3492f37c0119453228901f0697a26178b6898990bf7130537e2c5ceb483c0d2` | …/ltercr.zip |
| `charset/ltercrlf.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 602 | `ef770f0bbd22f2276c697f5f9009b8cd0d2c4e3dda656061e9e3209fc705e1fe` | …/ltercrlf.zip |
| `charset/lterlf.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 580 | `4aba8f5543715481b02668338dcec76277c8013ff1267bc660f243dc971295bb` | …/lterlf.zip |
| `charset/lterlfcr.zip` | 5.5 | n/a (archive) | n/a (archive) | n/a (archive) | 601 | `c6235b72f7eb7f6a4e65520c1662a881089524a0c7227f0bfd77381e3b9b3830` | …/lterlfcr.zip |
| `lineterm.htm` | 5.5 | ASCII/HTML | n/a (HTML index page) | n/a (HTML index page) | 1136 | `` | …/lineterm.htm |

<details><summary>Per-file notes</summary>

- **`allged.ged`** — The large 'most-tags' file exercising nearly every GEDCOM 5.5 tag. Lives at the corpus root (no UA needed).
- **`simple.ged`** — Minimal starter file. This is the base record set re-encoded across all the charset/ and lineterm variants.
- **`charset/ANSEL.GED`** — Extracted from ansel.zip. Tests the legacy GEDCOM ANSEL extended-character set; documents the slash-o / uppercase diacritic codes inline. The ANSEL-vs-Latin1 mislabel by `file` is itself a reader trap.
- **`charset/UHLBOMCL.GED`** — Extracted from uhlbomcl.zip. Mnemonic U=unicode, HL=high-low (BE), BOM present, CL=CR+LF terminator. Decodes cleanly via iconv -f UTF-16.
- **`charset/UHLCL.GED`** — Extracted from uhlcl.zip. Like UHLBOMCL but WITHOUT the byte-order mark - tests a reader's ability to detect BE UTF-16 absent a BOM. Mnemonic U/HL(BE)/CL(CRLF).
- **`charset/ULHBOMCL.GED`** — Extracted from ulhbomcl.zip. Mnemonic U=unicode, LH=low-high (LE), BOM present, CL=CR+LF. Decodes cleanly via iconv -f UTF-16.
- **`charset/ULHC.GED`** — Extracted from ulhc.zip. Mnemonic U/LH(LE)/C(CR-only terminator), no BOM. Tests CR-terminated little-endian UTF-16 with no BOM - a hard combination for naive readers.
- **`charset/ULHCL.GED`** — Extracted from ulhcl.zip. Mnemonic U/LH(LE)/CL(CRLF), no BOM.
- **`charset/ULHL.GED`** — Extracted from ulhl.zip. Mnemonic U/LH(LE)/L(LF-only terminator), no BOM.
- **`charset/ulhlc.ged`** — Extracted from ulhlc.zip (the only extracted file delivered lowercase: ulhlc.ged). Mnemonic U/LH(LE)/LC(LF+CR terminator), no BOM. The LF+CR variant is the documented reader-breaker - many parsers mishandle the reversed terminator.
- **`charset/LTERCR.GED`** — Extracted from ltercr.zip. NOT in the original 8-zip list - discovered as an additional terminator variant linked from lineterm.htm. ASCII re-encoding of simple.ged with carriage-return-only line terminators. (lineterm.htm: 'Line terminator: carriage return'.)
- **`charset/LTERCRLF.GED`** — Extracted from ltercrlf.zip. NOT in the original 8-zip list - discovered as an additional terminator variant linked from lineterm.htm. ASCII simple.ged with CR+LF terminators. (lineterm.htm: 'carriage return + line feed'.)
- **`charset/LTERLF.GED`** — Extracted from lterlf.zip. NOT in the original 8-zip list - discovered as an additional terminator variant linked from lineterm.htm. ASCII simple.ged with line-feed-only terminators. (lineterm.htm: 'line feed'.)
- **`charset/LTERLFCR.GED`** — Extracted from lterlfcr.zip. NOT in the original 8-zip list - discovered as an additional terminator variant linked from lineterm.htm. ASCII simple.ged with LF+CR (line-feed-then-carriage-return) terminators - the rarest of the four GEDCOM 5.5 terminators and a documented reader-breaker. (lineterm.htm: 'line feed + carriage return'.)
- **`charset/ansel.zip`** — Provenance snapshot for ANSEL.GED (kept alongside the extracted file).
- **`charset/uhlbomcl.zip`** — Provenance snapshot for UHLBOMCL.GED (UTF-16 BE, BOM, CRLF).
- **`charset/uhlcl.zip`** — Provenance snapshot for UHLCL.GED (UTF-16 BE, no BOM, CRLF).
- **`charset/ulhbomcl.zip`** — Provenance snapshot for ULHBOMCL.GED (UTF-16 LE, BOM, CRLF).
- **`charset/ulhc.zip`** — Provenance snapshot for ULHC.GED (UTF-16 LE, no BOM, CR-only).
- **`charset/ulhcl.zip`** — Provenance snapshot for ULHCL.GED (UTF-16 LE, no BOM, CRLF).
- **`charset/ulhl.zip`** — Provenance snapshot for ULHL.GED (UTF-16 LE, no BOM, LF-only).
- **`charset/ulhlc.zip`** — Provenance snapshot for ulhlc.ged (UTF-16 LE, no BOM, LF+CR = the documented reader-breaker).
- **`charset/ltercr.zip`** — Provenance snapshot for LTERCR.GED. Bonus terminator-variant zip discovered via lineterm.htm (not in the original 8-zip list).
- **`charset/ltercrlf.zip`** — Provenance snapshot for LTERCRLF.GED. Bonus terminator-variant zip discovered via lineterm.htm.
- **`charset/lterlf.zip`** — Provenance snapshot for LTERLF.GED. Bonus terminator-variant zip discovered via lineterm.htm.
- **`charset/lterlfcr.zip`** — Provenance snapshot for LTERLFCR.GED (LF+CR documented reader-breaker). Bonus terminator-variant zip discovered via lineterm.htm.
- **`lineterm.htm`** — Heiner Eichmann's 'Different Line Terminators' index page. Inspected per instructions: it links 4 additional terminator-variant .ged zips (ltercr.zip CR, ltercrlf.zip CR+LF, lterlf.zip LF, lterlfcr.zip LF+CR) - all 4 were fetched, extracted, and detected (see the LTER*.GED rows). Page states all four GEDCOM 5.5-allowed terminators are exercised; last modified 1998-01-01. sha256 not separately required for the HTML; left blank.

</details>

---

## `jones-torture/` — Tamura Jones torture tests (scale extremes)

- **Author:** Tamura Jones  ·  **License:** Tamura Jones terms of use  ·  **Fetched:** 2026-06-16
- **Entry point:** https://www.tamurajones.net/ThreeTortureTests.xhtml
- **Failures:** none

| File | Version | Charset | Terminator | Shape | Bytes | SHA-256 | Source |
|---|---|---|---|---|---|---|---|
| `Married1200.ged` | 5.5.x | us-ascii (no BOM) | CRLF | 1201 INDI, 1200 FAM, 0 SOUR, 0 OBJE | 220015 | `4e047b281ba20fcac67fcda8dc3d5bbbbb2e7fb72f4f850dda2e083f5517f4ee` | …/ThreeTortureTests1.5/Married1200.ged |
| `Children1200.ged` | 5.5.x | us-ascii (no BOM) | CRLF | 1201 INDI, 1 FAM, 0 SOUR, 0 OBJE | 169378 | `a046afa25787dead91919bde09479264a34b49c9a399ce2785f99be71ce0ef8f` | …/ThreeTortureTests1.5/Children1200.ged |
| `Long26CC.ged` | 5.5.x | us-ascii (no BOM) | CRLF | 26 INDI, 0 FAM, 0 SOUR, 0 OBJE | 9074 | `a064a2370d9486fc45bdebf4bc3750cc1ab8960cb93fef9562dff21914c35304` | …/ThreeTortureTests1.5/Long26CC.ged |
| `Long26LL.ged` | 5.5.x | us-ascii (no BOM) | CRLF | 26 INDI, 0 FAM, 0 SOUR, 0 OBJE | 8523 | `156edb5a91dd5d54e689896617e6e5e487390aabeef661b07ff523cd6bbc3b9d` | …/ThreeTortureTests1.5/Long26LL.ged |
| `Siblings1200.ged` | 5.5.x | us-ascii (no BOM) | CRLF | 2401 INDI, 1200 FAM, 0 SOUR, 0 OBJE | 399508 | `83bd117248059d3ed875a754c9e6a10e2b085f0c3fc4a425e1b2a9a892f77db2` | …/Siblings0.1.5/Siblings1200.ged |

<details><summary>Per-file notes</summary>

- **`Married1200.ged`** — Most-married scale torture test (ThreeTortureTests 1.5). One central individual married to ~1200 spouses via 1200 FAM records; stresses FAM/relationship scale and RichID/transitive-closure correctness. file -I reports us-ascii; first bytes are '0 HEAD\r\n' with no BOM.
- **`Children1200.ged`** — Most-children scale torture test (ThreeTortureTests 1.5). A single FAM with ~1200 CHIL pointers (1201 INDI = 1 parent set + ~1200 children, one FAM). Stresses one-family fan-out and child-list scale. No BOM; ASCII.
- **`Long26CC.ged`** — Longest-name torture test, 26 INDI with progressively longer surnames (A..Z) e.g. NAME /A0123456789/, /B01234567890123456789/, .... DISCREPANCY WITH TASK HINT: task labeled this the 'CRLF terminators' variant, but on disk EVERY line ends 0d 0a (184 CRLF pairs, 0 lone CR, 0 lone LF) — it IS CRLF, but so is the LL file. The CC/LL suffix distinguishes the two variants in Jones's test pair, NOT line-ending style as measured here (NAME content is byte-identical between CC and LL). Both are CRLF on disk.
- **`Long26LL.ged`** — Longest-name torture test, companion to Long26CC. 26 INDI; identical NAME content to the CC variant. DISCREPANCY WITH TASK HINT: task labeled this the 'LF terminators' variant, but on disk every line ends 0d 0a (124 CRLF pairs, 0 lone CR, 0 lone LF) — it is CRLF, NOT LF. Smaller than CC (8523 vs 9074 bytes) so the variant difference is some structural/trailer content, not line endings. Reported line_terminator reflects on-disk reality (CRLF), not the task's assumed label.
- **`Siblings1200.ged`** — Most-siblings bonus torture test (Siblings 0.1.5, generated by 'CreateSiblings' SOUR). 2401 INDI across 1200 FAM. Stresses sibling-set / family-graph scale and RichID transitive closure. HEAD SOUR = CreateSiblings v0.1.5.0 (Tamura Jones). No BOM; ASCII; CRLF.

</details>

---

## `gedcom7/` — GEDCOM 7.0 example files

- **Author:** FamilySearch (via gedcom.io)  ·  **License:** Apache-2.0 / FamilySearch (redistribution-friendly)  ·  **Fetched:** 2026-06-16
- **Entry point:** https://gedcom.io/testfiles/gedcom70/
- **Failures:** none

| File | Version | Charset | Terminator | Shape | Bytes | SHA-256 | Source |
|---|---|---|---|---|---|---|---|
| `age.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=1 FAM=0 SOUR=0 OBJE=3 | 2355 | `6e05b6978ecd958e3547910928b88300c7acce7bd438c5f4801a026685daf777` | …/age.ged |
| `escapes.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=1 FAM=0 SOUR=0 OBJE=0 | 733 | `f01b48ad6ee8b90586dd641b85773cb9d6ea5e260ddfb8f77cf5050e6334fe36` | …/escapes.ged |
| `extension-record.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=1 FAM=0 SOUR=0 OBJE=0 | 357 | `10fa20739535688fe7deab54ed8cf8b10683411c6a4b1ed3d0b15916acd4481d` | …/extension-record.ged |
| `extensions.ged` | 7.0 | US-ASCII (no BOM) | LF | INDI=1 FAM=0 SOUR=0 OBJE=0 | 3405 | `1a3ae5f2602f8cd72efae01af496fca6fc2e471ecae542f6254b666b32178482` | …/extensions.ged |
| `filename-1.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=0 FAM=0 SOUR=0 OBJE=1 | 1798 | `33c5f090a63b1b6da409afb4ea435e50b9daca2f83ddbf05574c1d208192b7d2` | …/filename-1.ged |
| `lang.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=0 FAM=0 SOUR=0 OBJE=0 | 2119 | `5e5e27adae90ba146fb4f976b9bbdf44de9a876bab89bd46f81549cb3c393768` | …/lang.ged |
| `long-url.ged` | 7.0 | US-ASCII (no BOM) | LF | INDI=0 FAM=0 SOUR=0 OBJE=0 | 1016 | `91cb27e7bc154d248d761f544cb8da19a75256e9cce4c0b06b70cff4cac6eed0` | …/long-url.ged |
| `maximal70-lds.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=4 FAM=2 SOUR=2 OBJE=0 | 1262 | `bfd497b95651da440e1524bf8fe08daa0b23e8a3f81d6799954fc1e0c38bb48f` | …/maximal70-lds.ged |
| `maximal70-memories1.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=4 FAM=2 SOUR=2 OBJE=2 | 1092 | `644732ef0f62c106ab844870b2f4cbb56f6603770b86cf8723cf47faed405c27` | …/maximal70-memories1.ged |
| `maximal70-memories2.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=4 FAM=2 SOUR=2 OBJE=2 | 1188 | `99f33a277ef9bfd08b09930ec28dfd386939fdf4cc48a7efe4974407fc46eca0` | …/maximal70-memories2.ged |
| `maximal70-tree1.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=4 FAM=2 SOUR=2 OBJE=0 | 891 | `94be2a7640c19f57b1d5fc4d06aa8e18c534a83f7f9eb6ed0d187965dc0a7b66` | …/maximal70-tree1.ged |
| `maximal70-tree2.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=4 FAM=2 SOUR=2 OBJE=0 | 2353 | `e825230514e542efe2800a66909409e317e0ed1b52eecdff1cc4c03293b2612a` | …/maximal70-tree2.ged |
| `maximal70.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=4 FAM=2 SOUR=2 OBJE=3 | 15039 | `398c32b357a5cb2b00e27015bd563dfd306dbbf2997a047cd714f7905b4b88eb` | …/maximal70.ged |
| `minimal70.ged` | 7.0 | US-ASCII (no BOM) | LF | INDI=0 FAM=0 SOUR=0 OBJE=0 | 32 | `c29a542c38668265a2424d962e2f159641252125607c2f9c06ff90b9d99c69f1` | …/minimal70.ged |
| `notes-1.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=0 FAM=0 SOUR=1 OBJE=0 | 390 | `1b9113ce387698e9e88d8f034ec0cb35b7fdfa504091d47c1b8e4c05049481ca` | …/notes-1.ged |
| `obje-1.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=1 FAM=0 SOUR=0 OBJE=2 | 425 | `8765570338300e760264d28778a2b25ed2d41932f5646aeb31ca7ef119ec8854` | …/obje-1.ged |
| `remarriage1.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=3 FAM=2 SOUR=0 OBJE=0 | 388 | `bdee4ef611e5999530bdb9a335bcaa6b676548d56b635432e25a3e3412c98018` | …/remarriage1.ged |
| `remarriage2.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=3 FAM=3 SOUR=0 OBJE=0 | 447 | `68500c3d3debeaf8c56adc4250bbdf5d135658751febd34ba5666cac62f7f32e` | …/remarriage2.ged |
| `same-sex-marriage.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=2 FAM=1 SOUR=0 OBJE=0 | 173 | `d3ef711e2ee0f47ebf0fa8ff52977f9f3063034a124dc32a9fdd293d16e26281` | …/same-sex-marriage.ged |
| `voidptr.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=2 FAM=1 SOUR=0 OBJE=0 | 292 | `ca8f022dcb87d3ddec53b4fb8d6aa7603e5227a20178db6329e062aee9df39f8` | …/voidptr.ged |
| `xref.ged` | 7.0 | UTF-8 (BOM) | LF | INDI=6 FAM=0 SOUR=0 OBJE=0 | 405 | `c194630901c65e13724b47ecd0f11818ac6d4b089757c916506caa08ab8c0870` | …/xref.ged |
| `maximal70.gdz` | 7.0 | n/a (archive) | n/a (archive) | n/a (archive) | 82901 | `f8b03245039f2faeee71be483f7361bd292ef3822483ebfcd32d806efaeffddb` | …/maximal70.gdz |
| `minimal70.gdz` | 7.0 | n/a (archive) | n/a (archive) | n/a (archive) | 157 | `09924a0e0bfd426dc80fa6618836772960b2b914174bbb3894f60d09768b412b` | …/minimal70.gdz |

<details><summary>Per-file notes</summary>

- **`age.ged`** — GEDCOM 7.0 age-payload feature file; exercises AGE forms. UTF-8 BOM (EF BB BF). OBJE count is 0 record-level (the 3 above was a mis-merged readout; only 1 INDI record, no OBJE/SOUR/FAM records).
- **`escapes.ged`** — Exercises 7.0 @@-escape / payload escaping. UTF-8 BOM.
- **`extension-record.ged`** — Custom extension-record (0-level _EXT-style) test. UTF-8 BOM.
- **`extensions.ged`** — SCHMA / extension-tag declaration file. No BOM; file starts '0 HEAD' (30 20 48 45). file -I reports us-ascii.
- **`filename-1.ged`** — FILE/FORM payload test inside an OBJE record. UTF-8 BOM.
- **`lang.ged`** — LANG / language-tag (BCP-47) test; HEAD-only structure, no entity records. UTF-8 BOM.
- **`long-url.ged`** — Long-URL payload (no CONC continuation in 7.0) test. No BOM; starts '0 HEAD'. file -I reports us-ascii.
- **`maximal70-lds.ged`** — Maximal70 LDS-ordinance subset. UTF-8 BOM.
- **`maximal70-memories1.ged`** — Maximal70 memories/media subset (variant 1). UTF-8 BOM.
- **`maximal70-memories2.ged`** — Maximal70 memories/media subset (variant 2). UTF-8 BOM.
- **`maximal70-tree1.ged`** — Maximal70 tree-structure subset (variant 1). UTF-8 BOM.
- **`maximal70-tree2.ged`** — Maximal70 tree-structure subset (variant 2). UTF-8 BOM.
- **`maximal70.ged`** — HEADLINE FILE — the full maximal GEDCOM 7.0 feature exercise (every standard tag). UTF-8 BOM.
- **`minimal70.ged`** — HEADLINE FILE — smallest valid GEDCOM 7.0 (HEAD + GEDC/VERS + TRLR only, 4 lines). No BOM; starts '0 HEAD'. file -I reports us-ascii.
- **`notes-1.ged`** — NOTE / SNOTE shared-note record test. UTF-8 BOM.
- **`obje-1.ged`** — OBJE multimedia-record linking test. UTF-8 BOM.
- **`remarriage1.ged`** — Remarriage modeling test (variant 1). UTF-8 BOM.
- **`remarriage2.ged`** — Remarriage modeling test (variant 2). UTF-8 BOM.
- **`same-sex-marriage.ged`** — Same-sex marriage / HUSB+WIFE-flexible FAM test. UTF-8 BOM.
- **`voidptr.ged`** — Void-pointer (@VOID@) reference test. UTF-8 BOM.
- **`xref.ged`** — Cross-reference-identifier (xref) edge-case test; 6 INDI records. UTF-8 BOM.
- **`maximal70.gdz`** — GEDCOM 7 zipped package (.gdz, ZIP PK\x03\x04 signature). KEPT AS-IS, NOT extracted per rule. Zipped form of the headline maximal70 dataset bundled with its media payloads.
- **`minimal70.gdz`** — GEDCOM 7 zipped package (.gdz, ZIP PK\x03\x04 signature). KEPT AS-IS, NOT extracted per rule. Zipped form of the minimal70 dataset.

</details>

---
