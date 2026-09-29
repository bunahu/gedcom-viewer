# gedview — build brief

> Written 2026-09-28 by the scoping session (Fable), for a separate build session (Opus).
> The scoping session built nothing but the spikes in `spike/` and the counter in `tools/`.
> Read this whole file before writing anything. Every number in it was measured, and says how.

**gedview** is one web page, opened from disk in Chrome, that opens a GEDCOM file, shows it
readably, checks it for obviously malformed lines, counts what it holds, and lets the owner make
clean hand edits and save them — with a dated backup and a record of what changed.

It is **standalone**. It learns from the sibling project's cleaner and importer; it imports nothing from them,
shares no code with them, and never talks to the sibling project.

---

## 1. What the owner asked for

| # | His words (2026-09-28) | In gedview |
|---|---|---|
| 1 | "open and read GEDCOM files directly, with minimal overhead" | one page, no server, no install, no build step; open by button or by dropping the file on the page |
| 2 | "optionally indent each line according to the number at its beginning" | an Indent toggle; one indent step per level; display only |
| 3 | "the most simple validations … obvious malformed lines should appear" | the checks in section 7; structural only |
| 4 | "Most importantly — I want the ability to edit and save … directly or as a copy, with a timestamp if possible for both" | section 9 (editing) and section 10 (saving) |
| 5 | "a rough count of each of the primary entities … easily accessible and findable" | the counts bar, always on screen (section 8) |

Two purposes, his words: "read/visualize the GEDCOM better than a plaintext app" and "allow direct
edits … if it's a clean fix (remove this person/line, edit this name, etc.)".
Budget: one to two sessions.

---

## 2. Rulings

All from the owner, 2026-09-28, in the scoping session.

| # | Ruling | His words |
|---|---|---|
| R1 | **One web page, nothing behind it.** | "A (it matches what the sibling project looks like, for now, and I can customize the UI)" |
| R2 | **The date goes in file NAMES, and an edit log sits beside the file.** | "In the file's name. Also b., sure." |
| R3 | **A last-updated date inside the file only where the standard has one, with a NOTE under it that explains it.** | "c is if GEDCOM supports last updated, and can add a NOTE under the timestamp explaining it; if not, no." |
| R4 | **Its own folder and its own local git repo**, beside `sibling/`; the name is gedview. | "your recs. gedview is fine." |
| R5 | **Every assumption put to him stands** (they are the rules of sections 5–10). | "Decided: yes to everything." |
| R6 | **Indent is a toggle, on/off, in the UI.** | "Indent has a toggle on/off in the UI." |

**How R3 meets the standard** (read in the two PDFs in `sibling/gedcom/`, 5.5.5 and 7.0.18):

| Question | What the standard says |
|---|---|
| Is there a last-updated date? | Yes, **per record**: `CHAN` → `DATE` → `TIME`. "The change date is intended to only record the last change to a record." |
| Can a NOTE explain it? | Yes. The `CHAN` block takes notes of its own, beside its `DATE`. |
| On which records? | `FAM` `INDI` `OBJE` `NOTE` `REPO` `SOUR` `SUBM` (version 7: `SNOTE` in place of `NOTE`). |
| Is there one for the file as a whole? | **No.** The header's `DATE` is "the date that this GEDCOM file was created"; nothing may sit under it but `TIME`. |

So gedview stamps the **records it changed**, and never touches the header's date.

### Two picks still open — the owner states them in the opening prompt

| Pick | Variants | Scoping session's recommendation |
|---|---|---|
| **F1 — change stamps** | **V1** on by default, a checkbox in the Save dialog turns them off for that save · **V2** off by default, the checkbox turns them on · **V3** never; the log alone records changes | V1 — it is R3 as he ruled it |
| **F2 — commits in this repo** | **C1** commit as each phase passes its gates; local only, no remote · **C2** present each commit and stop for his yes | C1 — nothing here is pushed anywhere |

If the prompt states no pick, build V1 and C1, and say so in the first reply.

---

## 3. Measured baseline

Batch 20's two files, in `sibling/gedcom/batch20-2026-09-16/` (git-ignored there; **living people —
counts only, never a value**). Measured twice, independently: `tools/baseline_probe.py` (Python)
and `spike/line_model_spike.js` (JavaScript). The two agree on every number.

The table — bytes, sha256, encoding, version, lines, line endings, longest line, levels, records, distinct tags, `CONC` · `CONT` · `CHAN` lines, ids defined, trailing whitespace, tabs inside values, and every check's count — lives in `local/measured.json`, beside the real files and outside the repo, keyed by each file's sha256; `tools/check-real.js` reads it from there and holds a file whose sha256 it has to it, number for number. It left this brief on 2026-10-08, with the figures that described the owner's own files. What stays is what they showed: the raw export's line endings are **mixed** (CR LF and LF), its longest line is 256 characters where the cleaned file's is over 80,000, **no error check fires on either**, N1 finds a few U+0085 characters in the raw export and none in the cleaned file, and both hold the same records.

**Speed, JavaScript (Node 24, same engine as Chrome), raw export:** read 6 ms · find the lines
28 ms · shape + counts 52 ms · decode every line 48 ms · join for a save 60 ms. The whole file is
handled in about a fifth of a second, so **nothing needs to be incremental** and no background
worker is needed.

**Identity, proven:** the lines joined back from their own bytes hash to the recorded sha256, for
both files. One edited line changes the file's length by exactly that line's difference.

**The table describes two files, named by their sha256.** The raw export does not change. The
cleaned file will: the one on disk was written on 2026-09-16, and the sibling project's cleaner has changed
since (its reader lost 323 characters of two `_META` values to U+0085 until v3.254.9), so the
owner's next clean writes a different file. When a file's sha256 is not the one in the table,
its expected numbers are whatever `tools/baseline_probe.py` prints for it, and the gate is that
the JavaScript agrees with the probe.

**The test files** in `sibling/api/tests/fixtures/` — 52: the 50 public corpus files and 2 of the sibling project's
own (`ancestry_shapes.ged`, `ancestry_dup_citation.ged`). Counts for every one are in
`spike/baseline-fixtures.jsonl`. What they cover: UTF-8 27 · ASCII 7 · ANSEL 9 · UTF-16 9 (5 with no
byte-order mark); line endings LF 28 · CR LF 18 · CR 4 · **LF CR 2**; versions 5.5, 5.5.1, 5.5.5, 7.0.
**Not one of them fires an error check** except one pointer to nothing (`extensions.ged`), so the
error checks need files written for them (section 14).

Note for whoever reads the sibling project's `MANIFEST.md`: its "Shape" column was counted with grep and misses
records that have no id — `xref.ged` holds 7 INDI (it says 6), `extensions.ged` 2 (it says 1).

---

## 4. Verified facts about the platform

Chrome 153 on the owner's Mac, a page opened from disk (`file://`), tested headless with a
throwaway profile (`spike/capability-check/`). By the evening of 2026-09-28 it was Chrome 154,
where session 1 walked the page.

| Capability | Result | Consequence |
|---|---|---|
| Secure context | yes | the file-access features are offered |
| `showOpenFilePicker` · `showSaveFilePicker` · `showDirectoryPicker` | there | Save can write in place |
| A handle from a file dropped on the page | there | a dropped file can be saved in place too |
| `FileSystemDirectoryHandle.resolve` | there | the page can prove the folder holds the file |
| `crypto.subtle.digest` (sha256) | works | hashes for the log and the read-back checks |
| A sibling file loaded as a classic `<script src>` | loads | **the scripts are classic scripts** |
| `import()` of a sibling module | **refused** | no ES modules |
| `fetch()` of a sibling file | **refused** | the page cannot load a fixture by itself |
| `new Worker(siblingFile)` | **refused** | no file-based workers (a Blob worker works; none is needed) |
| `localStorage`, IndexedDB | work, and last between runs | preferences can be remembered |
| The origin-private file system | **refused** | it cannot stand in for real handles in a test |

Firefox (the owner's default browser) and Safari have none of the three pickers (MDN's
compatibility data, checked 2026-09-28). There gedview reads, checks and edits, and "Save a copy"
is a download.

**Not verified — it needs a human click:** the pickers' permission prompts and a real write in
place. That is phase 0.

---

## 5. Invariants

These are the rules the build must not break. A change that breaks one is wrong, however small.

| # | Rule |
|---|---|
| I1 | **Untouched lines are written from their own original bytes.** Open, then save with no edit, gives the identical file — same sha256. |
| I2 | **A line ends at CR LF, LF CR, LF or CR, and at nothing else.** U+0085, U+2028 and the like are characters inside a value. |
| I3 | **Nothing is normalized.** No trimming, no re-wrapping of `CONC`/`CONT`, no change of case, line ending, encoding or spacing. |
| I4 | **The indent is on the screen only.** It is never written to a file. |
| I5 | **Nothing leaves the machine.** No network request of any kind — no CDN, no web font, no analytics. |
| I6 | **Every write in place is preceded by a backup** of the file as it is on disk, read back and compared, and followed by a read-back of the file itself. |
| I7 | **A file that changed on disk** since it was opened (or last saved) is never overwritten. |
| I8 | **The only change gedview makes on its own is the change stamp** (F1). It is listed before the save and in the log, like any other change. |
| I9 | **The repo never holds a real GEDCOM, a log or a backup.** Test files are public or written for the test. |
| I10 | **Nothing is dropped silently.** A delete is explicit, previewed when it reaches beyond one line, and undoable. |
| I11 | **What cannot be written correctly is refused, loudly** — a character the file's encoding cannot hold, a line whose bytes could not be read. |

---

## 6. The rules of reading

`tools/baseline_probe.py` implements every rule in this section and the next; it is the second
opinion. Where the JavaScript and the Python disagree, find which one has the rule wrong.

### 6.1 Encoding — the bytes first, the header last

| Order | Test | Result |
|---|---|---|
| 1 | The file opens with `EF BB BF` | UTF-8; the 3 bytes are the file's prefix, not part of line 1 |
| 2 | It opens with `FF FE` / `FE FF` | UTF-16 little-endian / big-endian; 2-byte prefix |
| 3 | No mark; of the first 8 bytes taken in pairs (at least 4), every first byte is non-zero and every second is zero | UTF-16 little-endian |
| 4 | The reverse | UTF-16 big-endian |
| 5 | Otherwise one byte per unit: read the header's `1 CHAR` and `1 GEDC` → `2 VERS` | by the table below |

| Header says | Read as | Check |
|---|---|---|
| `UTF-8` / `UTF8` | UTF-8 | — |
| nothing, and the version starts with 7 | UTF-8 | — (version 7 has no `CHAR`) |
| nothing | UTF-8 | E9 |
| `ASCII` | ASCII; a byte of 128 or more is E8 on its line | — |
| `UNICODE` / `UTF-16`, but the bytes are one per character | UTF-8 — the bytes win | E9 |
| anything else (`ANSEL`, `ANSI`, …) | **one byte = one character of the same number** (not the browser's `latin1` decoder, which is Windows-1252) | N6 |
| (bytes are UTF-16) and the header names something else | UTF-16 — the bytes win | E9 |

### 6.2 Lines

Work in units: bytes, or 16-bit units for UTF-16.

| Units met | Terminator |
|---|---|
| CR then LF | one terminator, **CR LF** |
| LF then CR, **in a file whose first line ends LF CR** | one terminator, **LF CR** |
| LF | **LF** |
| CR | **CR** |
| the file's end, with units since the last terminator | a last line with **no** terminator |

Every line keeps three numbers: where it starts, where its content ends, which terminator follows.

### 6.3 The shape of a line

After any leading spaces or tabs (their presence is N5), a line must match, with `.` matching
every character:

```
^(0|[1-9][0-9]*) (?:(@[^@ ]+@) )?([A-Za-z0-9_]+)(?: (.*))?$
   level            id              tag             value
```

**One** space separates the parts. Everything after the space that follows the tag is the value,
as written — leading spaces, trailing spaces and tabs included. (The sibling project's reader splits on any run
of whitespace; gedview must not.)

### 6.4 Records, subtrees, pointers

| Term | Meaning |
|---|---|
| Record | a level-0 line and every line after it, up to the next level-0 line |
| Subtree of a line | the lines after it with a greater level, up to the first line whose level is not greater |
| A line that did not parse, or is blank | belongs to the record and subtree it sits in; it ends nothing |
| Pointer | a line above level 0 whose whole value is `@…@` with no space and no inner `@`, other than `@VOID@` |
| Id | compared exactly, case included |

---

## 7. The checks

Structural only. Dates, places, names, duplicates and anything specific to one exporter are the
cleaner's business and stay out.

| Code | Kind | On the screen | Fires when |
|---|---|---|---|
| E1 | error | No level number | the line does not begin with a digit |
| E2 | error | Not level · tag · value | it begins with a digit and does not match 6.3 (`01 NAME`, `1NAME`, `0 @I1 INDI`, `1 NA-ME x`) |
| E3 | error | Level jumps | its level is more than one above the last line that parsed; the file's first line must be level 0 |
| E4 | error | No HEAD first / TRLR last | the first record is not `0 HEAD`; the last is not `0 TRLR`; a second `HEAD` or `TRLR` |
| E5 | error | Blank line | empty, or spaces and tabs only |
| E6 | error | Id defined twice | each definition of an id after its first |
| E7 | error | Points at nothing | a pointer whose id no record defines |
| E8 | error | Unreadable bytes | the line's bytes are not valid in the file's encoding |
| E9 | error | Header and bytes disagree | section 6.1; one finding for the file |
| N1 | note | Line break inside the value | the line holds U+000B, U+000C, U+001C–U+001E, U+0085, U+2028 or U+2029 |
| N2 | note | Control character | any other character below U+0020 except tab, or U+007F |
| N3 | note | Nothing points at it | a record with an id that no pointer names |
| N4 | note | Over 255 characters | the line, without its terminator, is longer than 255 characters, in a file whose version is below 7 or is not stated |
| N5 | note | Leading whitespace | spaces or tabs before the level |
| N6 | note | Encoding shown as it can be | section 6.1; one finding for the file |
| N7 | note | Mixed line endings | more than one kind of terminator in the file; one finding for the file |

A line may carry several findings. The whole file is re-checked after every edit (about 0.1 s);
do not build an incremental checker.

---

## 8. Counts and the record list

**The counts bar** is always on screen: one figure per level-0 tag, largest first, `HEAD` and
`TRLR` left out. Names: INDI People · FAM Families · SOUR Sources · OBJE Media · REPO Repositories ·
NOTE / SNOTE Notes · SUBM Submitters; any other tag under its own name (`_MTTAG`, `_MTCAT`).
A click opens the record list at that type.

**The file's facts**, one line, in the order the owner set on 2026-09-28: the GEDCOM version ·
the encoding · exported, the header's date, by the exporting system and its version (`HEAD.SOUR`,
`.VERS`) · the size on disk · lines · sha256 on demand, which says on hover what it is.
`GEDCOM 5.5.1 · UTF-8 · exported 16 Sep 2026 by Ancestry.com Family Trees 2025.08 · 4.2 MB ·
123,456 lines · sha256`.

**The record list** is in file order, with a filter box; a click jumps to the record.

| Record | Its label (for the screen only; never written) |
|---|---|
| INDI | the first `1 NAME` value as written, then the years of the first `1 BIRT` and `1 DEAT` dates when there |
| FAM | the labels of its `HUSB` and `WIFE` records, joined |
| SOUR | `1 TITL` |
| OBJE | `1 TITL`, else `1 FILE` → `2 TITL`, else the `1 FILE` value |
| REPO · SUBM | `1 NAME` |
| NOTE · SNOTE | the start of the record line's value |
| any other | the record line as written |

**The tag panel** lists every tag with its count; a click searches for it.

---

## 9. Editing

### 9.1 The document

| Part | What it is |
|---|---|
| `bytes` | the file as read; never changed |
| the line table | start, content end and terminator of every original line |
| `added` | the lines typed in this session: text, the original line it replaces (if any), its terminator |
| `order` | a list of numbers, one per line on screen: `n ≥ 0` is original line n; `n < 0` is an added line |
| `savedOrder` | `order` as it was at open, or at the last save |

Every edit is a splice on `order` — take some numbers out at a position, put others in. An undo
is the same splice run backwards. A compound edit (a delete with its pointers; the change stamps)
is a list of splices under one undo step.

**An edit typed back to the original is no edit:** when an added line replacing original line n
holds exactly line n's text, `order` gets n back, and the save writes line n's own bytes.

### 9.2 What can be done

| Act | Effect |
|---|---|
| Edit a line | the whole line is typed over — level, tag and value; Enter keeps it, Esc drops it |
| Add a child | a new line directly under the selected one, one level deeper |
| Add a sibling below | a new line after the selected line's subtree, at its level |
| Delete a line | the line and its subtree; asks first when there is a subtree, naming how many lines |
| Delete a record | section 9.3 |
| Undo · Redo | one step each; the history survives a save |

A new or edited line may be malformed; the checks say so at once. It may **not** hold a character
the file's encoding cannot take (I11): anything in UTF-8 and UTF-16; ASCII only in an ASCII or
one-byte file. A line with unreadable bytes (E8) can be deleted, not edited.

A new line takes the terminator most common in the file. When a line is added after a last line
that has no terminator, that line gains the common terminator and the new last line has none.

### 9.3 Removing a person (or any record)

Worked example: person `@I42@` is a child in family `@F45@` and a husband in `@F46@`.

1. The owner selects any line of `@I42@` and chooses Delete record.
2. gedview shows what will go: the record (47 lines, 41,201–41,247), and the lines elsewhere that
   point at it — `1 CHIL @I42@` in `@F45@`, `1 HUSB @I42@` in `@F46@`, and the persons' own
   `FAMC`/`FAMS` lines are inside the record already. Each pointer line is ticked; he can untick.
3. On his yes, all of it goes in one step. One undo brings all of it back.
4. A pointer line he unticked stays, and E7 now marks it.

A family left with one member, or none, is left as it is. Whether it should go is his call.
A pointer line with a subtree goes with its subtree.

### 9.4 What changed

The net change is `savedOrder` against `order`, never the history of keystrokes:

| Found | Reported as |
|---|---|
| a number in `savedOrder`, absent from `order`, and an added line in `order` that replaces it | **changed** — before → after |
| a number in `savedOrder`, absent from `order`, nothing replacing it | **removed** |
| a number in `order`, absent from `savedOrder` | **added** |

No edit moves a line, so the numbers the two lists share are in the same order in both, and one
walk over the two finds every difference.

The Changes panel shows this list at all times. A changed record is one that holds an added or
changed line, or lost one. A record whose own level-0 line was removed is a deleted record.

---

## 10. Saving

### 10.1 Names

The timestamp is local time, `YYYY-MM-DDTHHMMSS`. The stem is the file's name without its last
extension when that is `.ged` or `.gedcom` (any case); the extension is kept as written.

| What | Name | Example, saved at 3:42:00 pm on 2026-09-28 |
|---|---|---|
| Backup | `gedview-history/<stem>.<timestamp><ext>.bak` | `gedview-history/RAW.2026-09-28T154200.ged.bak` |
| Copy | `<stem>.<timestamp><ext>`; `-2`, `-3` if taken | `RAW.2026-09-28T154200.ged` |
| Log | `<file name>.edits.log` | `RAW.ged.edits.log` |

All three live in the folder of the file that was opened. A backup does not end in `.ged`, so
nothing that gathers GEDCOMs from a folder picks it up.

### 10.2 Save, in place — in this order, stopping at the first failure

| Step | Act | On failure |
|---|---|---|
| 1 | Nothing changed → say so; write nothing | — |
| 2 | No folder access yet → ask for the folder once (`showDirectoryPicker`, read-write, opening at the file) and prove it holds the file (`resolve` gives exactly the file's name). From then on reach the file **through the folder** (`getFileHandle(name)`), so the one grant covers the file, the backup and the log. | no folder, no save in place — offer Save a copy elsewhere |
| 3 | Read the file from disk; its sha256 must equal the hash at open or at the last save | "The file changed on disk since it was opened." Offer Save a copy or Reload. Write nothing. |
| 4 | Show the Save dialog: the list of changes, the note for this save, the change-stamp checkbox (F1) | — |
| 5 | Apply the change stamps (10.4) as one undo step | — |
| 6 | Build the bytes; hash them | — |
| 7 | Write the backup from the bytes read in step 3; read it back; hashes equal | stop; the file is untouched |
| 8 | Write the file; read it back; its hash equals step 6's | say so loudly and name the backup |
| 9 | Append the log block (10.5) | say so; the save itself stands |
| 10 | The new hash is the file's hash; `savedOrder` = `order` | — |

**Building the bytes:** walk `order`; a run of original lines n, n+1, n+2 … is one slice of `bytes`
from the first line's start to the last line's terminator; an added line is its text in the file's
encoding, then its terminator. The file's prefix (a byte-order mark) comes first.

### 10.3 Save a copy

Steps 1, 4, 5 and 6, then the copy is written into the same folder under its dated name, read
back and compared, and a log block is appended to the **original's** log. The original on disk is
untouched, so the document stays unsaved against it. With no folder access, the copy goes through
`showSaveFilePicker` with the dated name offered, and the log block is offered as a second file.

**In a browser with no pickers:** Save is off; Save a copy downloads the copy under its dated
name, and the log block as `<file name>.<timestamp>.edits.log`.

### 10.4 The change stamp (F1)

For each changed record whose tag may carry one (section 2), at the moment of the save:

| The record has | gedview does |
|---|---|
| no `1 CHAN` | adds, at the record's end: `1 CHAN` · `2 DATE 28 SEP 2026` · `3 TIME 15:42:00` · `2 NOTE <the note>` |
| a `1 CHAN` | sets its `2 DATE` and `3 TIME` (adding either if missing) and adds `2 NOTE <the note>` at the end of the block; notes already there stay |

| Detail | Rule |
|---|---|
| Date | day without a leading zero, month as `JAN` … `DEC`, four-digit year |
| Time | `HH:MM:SS`, 24-hour, local; in a file whose version starts with 7, UTC with a closing `Z` |
| The note | what the owner typed for this save; if he typed nothing, `Edited by hand in gedview.` One line, 200 characters at most. |
| A deleted record | has nothing to stamp; the log alone records it |
| `HEAD`, `TRLR`, records under other tags | never stamped; the log alone records the change |
| A record changed only by an earlier stamp | is not stamped again |
| A stamp gedview added since the last save in place (a copy was saved in between) | is **replaced** — its date, time and note set anew — never added to |

The stamps are changes like any other: they show in the Save dialog before the save, in the grid
after it, and in the log.

### 10.5 The log

UTF-8, LF, append-only — opened with `keepExistingData`, written at its end, never rewritten.
One block per save:

```
=== 2026-09-28T15:42:00-04:00  save  RAW.ged
note     Edited by hand in gedview.
before   sha256 <64 hex>  4200000 bytes  123456 lines
after    sha256 <64 hex>  4200092 bytes  238491 lines
backup   gedview-history/RAW.2026-09-28T154200.ged.bak
changed  41202 -> 41202  @I42@ INDI
  - 1 NAME Jane /Fixtur/
  + 1 NAME Jane /Fixture/
removed  52310           @F45@ FAM
  - 1 CHIL @I42@
added             41248  @I42@ INDI  (change stamp)
  + 1 CHAN
```

The first number is the line's place before the save, the second its place after. A copy's block
opens `=== <time>  copy  <file> -> <copy's name>` and has no `backup` line.
The log holds what the file holds — living people included — and belongs beside the file, never in
a repo (I9).

---

## 11. The screen

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ gedview 0.3  RAW.ged ●   Open GEDCOM  Save  Save a copy   Undo Redo   Indent Theme │
│ GEDCOM 5.5.1 · UTF-8 · exported 16 Sep 2026 by Ancestry.com Family Trees 2025.08 · 4.2 MB ·… │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ People 2,345   Media 1,234   Families 1,098   Sources 765   _MTTAG 23   Repositories 7   …   │
├──────────────────┬─────────────────────────────────────────────────┬────────────────────────┤
│ Records          │  41,201    0 @I42@ INDI                         │ 1 NAME                 │
│ Checks      3    │  41,202        1 NAME Jane /Fixture/            │ Jane /Fixture/         │
│ Changes     2    │  41,203            2 GIVN Jane                  │                        │
│ Search           │  41,204        1 BIRT                           │ in @I42@ INDI          │
│ Tags             │  41,205            2 DATE 1 JAN 1900            │                        │
│                  │  41,206            2 SOUR @S7@                  │                        │
└──────────────────┴─────────────────────────────────────────────────┴────────────────────────┘
```

| Part | Behaviour |
|---|---|
| The grid | only the rows in view exist in the page; every row one fixed height; a row shows at most 2,000 characters of its line |
| A row | line number · a mark (error, note, changed, added) · level · id · tag · value; level quiet, tag strong, a pointer value is a link |
| Indent on | each row is set in by its level × one step (4 characters wide to start; the width is a setting) |
| Indent off | every row flush left, as in the file |
| A pointer | a click jumps to the record it names; Back returns |
| The right pane | the selected line's whole value, wrapped; the joined value when the line is part of a `CONC`/`CONT` run (read only); its record; for a record line, the lines that point at it; its findings |
| Checks | grouped by check with counts, errors first; a click jumps to the line |
| Search | any text in the line as written; a count; next and previous; an id typed whole (`@I42@`) goes to its record first |
| Go to line | a number |
| Leaving with unsaved changes | the browser asks first |

**The look is the sibling project's.** Copy the three palettes from `sibling/frontend/src/index.css` — `:root`
(lines 13–45), `.dark` (47–76), `.sunset` (85–113) — into the top of `style.css` as the same
custom properties; body type is the sibling project's `--font-body` (the system sans, line 227); the grid is
monospace (`ui-monospace, SFMono-Regular, Menlo, monospace`). Inputs and cards as the sibling project's
(`.sibling-input`, lines 193–207): half-rem radius, one-pixel border, gold focus ring. Light is the
default; Theme steps light → sunset → dark. Errors take `--color-danger`, notes `--color-warning`.

**The owner will change the look himself.** So: every colour, size and width is a custom property
at the top of `style.css`; the markup in `index.html` is plain and named for what it is; the
README lists the properties and what each one moves.

**Words on the screen are few.** No captions, no helper text, no sub-titles. A placeholder never
holds an example value.

**Keys:** arrows, Page Up/Down, Home, End move the selection · ← shuts a block or goes up to the
line above it, → opens it or goes down into it · Enter edits · Esc drops the edit · ⌫ deletes the
line and its subtree · ⌘Z undo · ⇧⌘Z redo · ⌘S save · ⇧⌘S save a copy · ⌘F search · ⌘L go to line.

**Blocks open and shut** (the owner's ask of 2026-09-28): every line with a subtree shows ▾, or ▸
when shut; a shut line hides its subtree and shows how many lines it holds, in the changed colour
when one of them is not yet saved. ⌥-click opens or shuts every block at that level. Whatever
jumps to a hidden line opens the blocks around it. Display only (I4), and never remembered.

**Remembered between visits** (`localStorage`): indent on/off and width, theme, panel widths, the
change-stamp checkbox. Never a file's name, content or handle.

---

## 12. Files

| File | Holds | Touches the page? |
|---|---|---|
| `index.html` | the markup; loads `core.js`, `save.js`, `ui.js` as classic scripts, in that order | — |
| `style.css` | the whole look, its properties first | — |
| `core.js` | bytes → encoding → lines → shape → records and pointers → checks → counts → labels; the document, the edits, undo, the net change, the stamps, the bytes of a save | **no** |
| `save.js` | names, the save and copy pipelines, the log block — over "handles" passed to it | **no** |
| `ui.js` | the grid, panels, dialogs, keys; the only file that knows the pickers exist | yes |
| `tests/*.test.js` | Node's own test runner (`node --test`); nothing to install | — |
| `tests/helpers.js` | what the tests share: where the fixtures are, and how findings are written down | — |
| `tests/fake-handles.js` | in-memory stand-ins with the same few methods as the real file and folder handles | — |
| `fixtures/synthetic/` | small files written for the checks and the edits; committed | — |
| `fixtures/corpora/` | the public test files, copied from the sibling project; **git-ignored** (section 13) | — |
| `tools/baseline_probe.py` | the second opinion (exists) | — |
| `tools/check-real.js` | runs `core.js` over a file given by path and prints the probe's JSON shape — counts only | — |
| `tools/compare.js` | runs both over a list of files and reports every number that differs | — |
| `tools/walk.js` | section 15's read-only walk on each file given, then the rest of the page on a fictional file it writes; a real file gets counts, tags, ids and line numbers only, and no picture | drives it, from outside |
| `tools/chrome.js` | headless Chrome over its DevTools protocol, at the page's `file://` address, for `walk.js` | — |
| `local/` | **git-ignored**; the place for copies of real files | — |
| `README.md` | how to open it, how to run the tests, how to change the look | — |
| `.gitignore` | `local/` · `fixtures/corpora/*/` · `gedview-history/` · `*.edits.log` · `*.bak` · `.DS_Store` | — |

`core.js` and `save.js` each work both as a classic script in the page and under Node:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GedCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // …
  return { /* the functions */ };
});
```

`spike/line_model_spike.js` is a measured starting point for the line table, the shape read off
the bytes, and the join. It handles UTF-8 only and knows neither LF CR nor UTF-16; the rules in
section 6 are the specification, the spike is not.

---

## 13. What to take from the sibling project, and what not

**The sibling project's repo is read-only for this work. Another session is writing in it.** Never edit,
stage or commit there. Line numbers are as of v3.254.9 (`264a761`, 2026-09-28); find by name.

| Take the knowledge of | Where | Use |
|---|---|---|
| Why a line ends at CR and LF and at nothing else — the loss that taught it | `sibling/scripts/gedcom_cleaner/model.py` — `split_lines` (~110) and its comment block | section 6.2. The sibling project's rule is CR LF, LF, CR; gedview's adds LF CR as one terminator, because gedview reports a blank line as an error and the sibling project's reader skips one |
| The order of the encoding tests, and why the bytes come before the header | the same file — `_utf16_without_mark` (~129), `read_gedcom` (~149), and the comment blocks above them | section 6.1 |
| The encoding cases worth a test | `sibling/api/tests/test_gedcom_reader_encoding.py` | the same cases as JavaScript tests |
| The record line's form, `0 @id@ TAG` | `model.py` `parse_line` (~62) | section 6.3 |
| The public test files and what each is for | `sibling/api/tests/fixtures/gedcom-corpora/` and its `MANIFEST.md` | `fixtures/corpora/` |
| The palettes and form styles | `sibling/frontend/src/index.css` | section 11 |

| Do not take | Why |
|---|---|
| `str.splitlines()`, in any language's form | it breaks a line at U+0085 and seven other characters (I2); the sibling project's reader used it until v3.254.9 |
| `split(None, 1)` for the value | it eats leading spaces and treats a tab as a separator (6.3) |
| The `CONC`/`CONT` fold, the HTML unescape, the autofixes | gedview never normalizes (I3) |
| Any import of `gedcom_cleaner` | gedview is standalone |

**The public test files may not be committed.** The sibling project keeps their bytes out of git for their
licences (one forbids redistribution, one is non-commercial only, one's terms are unconfirmed);
only the GEDCOM 7 set is Apache-2.0. Copy the five folders into `fixtures/corpora/`, and the sibling project's
own two files into `fixtures/corpora/sibling-own/`; commit `MANIFEST.md` and `fetch_corpora.sh`
beside them, and ignore the folders. A test that needs them skips, saying why, when they are
absent.

---

## 14. Tests and gates

### Files to write, in `fixtures/synthetic/`

Fictional people only (`Jane /Fixture/`). One small file per row; each test names the exact
findings it expects, by code and line number.

| File | Must produce |
|---|---|
| `e1-no-level.ged` | E1 on a line that begins with a letter |
| `e2-shapes.ged` | E2 for `01 NAME`, `1NAME x`, `0 @I1 INDI`, `1 NA-ME x`, `1  NAME` |
| `e3-jump.ged` | E3 for a level 3 under a level 1; and for a file whose first line is level 1 |
| `e4-frame.ged` | E4 three ways: no `HEAD`, no `TRLR`, lines after `TRLR` |
| `e5-blank.ged` | E5 for an empty line and for a line of spaces |
| `e6-e7-ids.ged` | E6 for an id defined twice; E7 for a pointer to nothing; nothing for `@VOID@` |
| `e8-bad-bytes.ged` | E8 for an invalid UTF-8 sequence; the file still saves back byte for byte |
| `e9-says-unicode.ged` · `e9-no-char.ged` | E9, both ways |
| `n1-line-breaks.ged` | N1 for U+0085 and U+2028 inside a `CONC` line, **and the line count proves they did not split it** |
| `n5-leading.ged` | N5, and the line still parses |
| `mixed-endings.ged` | N7; identity |
| `no-final-newline.ged` | the last line has no terminator; identity; a line added after it (9.2) |
| `family.ged` | the delete of 9.3: a person who is a child in one family and a partner in another |
| `chan.ged` | records with and without a `CHAN` block, for 10.4 |

### The tests

| Test | Proves |
|---|---|
| Identity, every file in `fixtures/` | open → bytes of a save with no edit → identical (I1) |
| Counts and checks, every file | `core.js` gives the numbers in `spike/baseline-fixtures.jsonl` |
| Encoding | the cases of the sibling project's encoding test; the 5 UTF-16 files with no byte-order mark |
| LF CR | `LTERLFCR.GED` and `ulhlc.ged` read as 50 and 329 lines, no blank line |
| One edit | the saved bytes differ from the original only inside that line's range |
| Typed back | an edit returned to the original text leaves the save identical |
| An edit in a UTF-16 file | only that line is re-encoded; the rest is the original bytes |
| Encoding refusal | a non-ASCII character in an ASCII or one-byte file is refused (I11) |
| Delete with pointers | `family.ged`: the record and its pointer lines go; no E7 after; one undo restores the identical bytes |
| Undo and redo | any sequence of edits, fully undone, saves identical |
| Net change | changed / removed / added, with the right line numbers before and after |
| Stamps | both rows of 10.4; the version-7 time; a deleted record gets none; a second save with no edit writes nothing |
| Save in place, fake handles | the order of 10.2: backup before file; a failing backup leaves the file untouched; the log grows and is never rewritten |
| Changed on disk | step 3 refuses |
| Names | the three names of 10.1, with `.GED`, `.cleaned.ged`, and a taken name |
| No network | the five files of the page (`index.html`, `style.css`, `core.js`, `save.js`, `ui.js`) hold no `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `import(`, `@import`, `url(http`, `http://` or `https://` — no exceptions; an inline SVG in HTML needs no namespace |

### Gates — all of them, before a phase is called done

| Gate | Command | Passes when |
|---|---|---|
| Tests | `node --test tests/*.test.js` (Node 24 reads `node --test tests/` as one file named `tests`) | all pass; the only skips are the corpus tests on a clone without the corpora |
| The real files | `node tools/check-real.js <raw> <cleaned>` | every number equals section 3's table, for a file whose sha256 is the table's; for any other file, the probe's numbers |
| The second opinion | `node tools/compare.js` over `fixtures/` and the two real files | no number differs |
| Identity on the real files | part of `check-real.js` | the two sha256 of section 3 |
| Speed | `check-real.js` prints its timings | the raw export is read, checked and counted in under 1 s |
| The page (phases 2 and 4) | the walk in section 15; `node tools/walk.js <raw> <cleaned>` walks the read-only walk and the rest of the page | every step as written; in the editing walk, the folder picker and the permission prompts are the owner's clicks |

---

## 15. Phases

| Phase | Work | Done when |
|---|---|---|
| **0** | The owner opens `spike/save-spike.html` **in Chrome** and clicks its four buttons, on the public test file waiting in `local/spike-test/` | every line reads PASS; he says so in the opening prompt |
| **1** | `core.js`, reading half: encoding, lines, shape, records, pointers, checks, counts, labels. The synthetic files. `check-real.js`, `compare.js`. | the first five gates |
| **2** | The page, read-only: open and drop, the grid, indent, the counts bar, the facts line, records, checks, search, go to line, pointers and Back, the right pane, tags, themes | the read-only walk below |
| | *— a complete viewer; the natural end of session 1 —* | |
| **3** | `core.js`, editing half: the document, the edits, undo, the net change, the stamps, the bytes of a save | the gates |
| **4** | `save.js` and the page's editing: edit in the grid, add, delete, delete a record with its preview, the Changes panel, the Save dialog, Save, Save a copy, the download path for other browsers | the gates and the editing walk |
| **5** | The owner's own walk, on a **copy** of the raw export | he says it is done |

**If phase 0 fails** — Chrome refuses the write from a page opened off disk — nothing in the design
changes but the address: the same folder served to this machine alone
(`python3 -m http.server 8377 --bind 127.0.0.1`) and opened at `http://127.0.0.1:8377/`. That is a
step away from R1, so put it to the owner before taking it.

**The read-only walk (phase 2), on a copy of the raw export in `local/`:** it opens in under 2
seconds · the counts bar reads as section 3 · Checks shows 0 errors, and notes N1 3, N3 9, N4 93,
N7 · a click on N1 lands on a `CONC` line · Indent on and off · the scrollbar dragged to the end
and back without a blank screen · a pointer followed and Back · a search for a tag steps through
its lines · Go to the last line lands on `0 TRLR` · the cleaned file's longest line, over 80,000 characters, shows
clipped in the grid and whole in the right pane · the three themes.

**The editing walk (phase 4), same copy:** one name edited → Changes shows one line → Save →
the folder is asked for once → the dialog lists the change and the stamp → saved → the folder
holds the backup in `gedview-history/` and the log → `shasum -a 256` of the backup is
`<sha256>` → the saved file differs from the backup only in that record → Undo twice (the stamp,
then the edit), Save with the stamp box unticked → the file's sha256 is `<sha256>` again → a
record deleted with its pointers, then undone → Save a copy writes the dated name → the file
changed from outside (append a line with another program; `touch` alone changes no byte) → Save
refuses.

---

## 16. Where this could be wrong

| Claim | It is wrong if | How to find out |
|---|---|---|
| Chrome writes in place from a page opened off disk | a picker or a write throws in phase 0 | the spike names the step that failed |
| One full re-check per edit is fast enough in the page | the grid stalls after an edit on the raw export | time it in the page; the budget is 0.3 s |
| Fixed-height rows reach the last line | the file has more than about 1.4 million lines (a page's height limit) | refuse such a file with a plain message; do not show it wrongly |
| The two implementations agree | `compare.js` reports a difference | read the rule in section 6 or 7 and fix the one that departs from it |
| The stamp's place, a record's end, is where other programs expect it | a program the owner uses rejects it | the standard fixes no order; ask him which program |

---

## 17. How the owner works

The sibling project's instructions and memory do not load in this folder. These are his standing rules.

1. **Plain English beside the work.** Precise words; do not simplify unless asked.
2. **A decision goes to him in chat, as a table,** the recommendation first, with one worked
   example per option, in the words of the screen he uses. Never through a question widget.
3. **Decide what the brief or the code already settles;** state an open detail as an assumption
   and go on. Stop only for a choice that is unsafe if wrong.
4. **Never state a specific you have not checked.** Say "this is wrong if …", then run the check
   that settles that.
5. **Real files: counts only.** Never print a value from one, never copy one into the repo,
   never commit a log or a backup. In any document or commit message a person is an id, never a name.
6. **Literal scope.** Build what this brief names. A new idea is one line to him and an entry in
   section 18.
7. **A defect found in the sibling project** while reading it: tell him in chat, with the evidence. Do not fix
   it and do not file it.
8. **A test lands with the code it tests;** a fix lands with the test that would have caught it.
9. **Say the plan before each block of work,** and say when you change course.
10. **When a gate fails and the fix is not plain, stop and tell him.** Report what happened as it
    happened.
11. **Nothing is installed.** No package, no CDN. Node's own test runner, Python's own library.

---

## 18. Not in version 1

Replace-all · comparing two files · editing a split value as one text · a list of recent files ·
wrapping long lines in the grid · reading ANSEL as its own characters · moving a line · a stamp for
a record's creation (`CREA`, version 7) · anything that talks to the sibling project. (Folding a record shut was
here; the owner asked for it on 2026-09-28, at every level, and phase 4 built it.)

Raised at the close of session 1, for the owner to rule: a `CLAUDE.md` in this folder that points
every session opened here at section 17. It would be a pointer, not a copy, for sessions opened
without the build prompt.

`core.js` and `save.js` never touch the page, so if gedview is ever taken into the sibling project they move as
they are.

---

## 19. Setup and the opening prompts

| | |
|---|---|
| Folder | `~/Desktop/claude/gedcom-viewer/` — open the session **here**, not in `sibling/`; from session 2 on, in the owner's own Claude project for this folder |
| Model · effort | Opus · one step below the top |
| First act | session 1's: `git init`, the `.gitignore` of section 12, a first commit of this brief, `spike/` and `tools/` (per F2) — done, `42dfee7` |
| The sibling project | read-only; another session is its one writer |
| Before session 2 | phase 0, two minutes, if it has not been run |

### Session 1's prompt

```
Read BUILD-BRIEF.md in this folder, all of it, before anything else. You are building gedview
from that brief, and section 17 is how I work.

Phase 0: [all four PASS / not run yet / failed at step N — paste the line]
F1, change stamps: V1
F2, commits: C1

This is session 1: git init and the first commit, then phases 1 and 2. Tell me your plan for
phase 1 in a few lines, then start. Stop at the end of phase 2 and walk me through the page.
```

### Where session 1 left it

Phases 1 and 2 are built and pass every gate: `b6d1cb1` (phase 1), `bb21c71` (phase 2), then
`tools/walk.js`, kept at the owner's word. Phase 0 had not been run.

| Session 1 found | So |
|---|---|
| Node 24 reads `node --test tests/` as one file named `tests` | the tests run as `node --test tests/*.test.js` (section 14) |
| The Write and Edit tools turn a four-digit Unicode escape (a backslash, `u`, four hex digits) into the raw character. A raw U+2028 or U+2029 ends a JavaScript regular expression, and the file will not parse | write such escapes as `\u{…}` (a regular expression then needs the `u` flag), or build the character with `String.fromCharCode`; after writing, scan for raw U+2028, U+2029, U+0085 and U+FFFD, and run `node --check` |
| The Claude app's browser pane ran no page tools on a local file outside the session's project folder | `tools/walk.js` walks the page in headless Chrome, at its own `file://` address |
| In headless Chrome, a press on the scrollbar needs a hover before it and a held button while it drags; on macOS a synthetic ⌘A goes as the `selectAll` command; a list shown a moment ago is laid out at the next frame | all three are handled in `tools/chrome.js` and `tools/walk.js` |
| No script can click the folder picker or a permission prompt (section 4) | `tools/walk.js` has no editing walk yet; those steps of the editing walk are the owner's |

### Session 2's prompt

```
Read BUILD-BRIEF.md in this folder, all of it, before anything else. You are building gedview
from that brief, and section 17 is how I work.

Phase 0: [PASS, all four lines / FAILED at step N — paste the line / not run]
F1, change stamps: V1
F2, commits: C1

This is session 2: phases 3 and 4, then my walk. Phases 1 and 2 are built; section 19 says
where session 1 left them. Tell me your plan for phase 3 in a few lines, then start. Stop at
the end of phase 4 and walk me through editing and saving.
```

### Where session 2 is

Phase 0 passed, all eight lines (Chrome 154, 2026-09-28, on `local/spike-test/maximal70.ged`), so
Save writes in place from the page opened off disk. The owner's picks: F1 V1, F2 C1. He named the
state session 1 left **v0.1** (a git tag on `30c6dd6`); each phase that passes its gates is tagged
with the next number — phase 3 v0.2, phase 4 v0.3 — and v1.0 is his walk (phase 5).

Phase 3 is built and passes every gate. What it settled that the sections above left open:

| Settled | Why |
|---|---|
| An edit is typed back — the original's number returns — when its text **and its terminator** are the original's | a last line that gained a terminator (9.2) keeps its text and changes its bytes |
| That last line, gaining a terminator, is a **changed** line, listed like any other | I8, I10: nothing changes unlisted |
| An act is refused, and undone at once, when the file written out would not read back as the lines shown — an empty line whose terminator joins the one above it (CR then LF), an empty last line with none — or would be read in another encoding (the header's `CHAR` changed to one the bytes are not) | I11. So the lines and checks on the screen are always what a fresh read of the saved bytes gives; `tests/edit.test.js` holds every act to that, at random, over every test file |
| After every act the document is checked whole, by the same `analyse()` that reads a file | section 7: one checker, not incremental. On the raw export an edit takes 81 ms, a record deleted 71 ms; `check-real.js` holds it to section 16's 0.3 s |
| A version-7 stamp's date is UTC's, like its time | the two must agree |
| A stamp on a record with a `1 CHAN` that gedview stamped since the last save in place has that block's `DATE`, `TIME` and gedview's `NOTE` set anew | 10.4's last two rows, read together |
| A new line's terminator in a file that has none (one line, no ending) is LF; a tie goes LF, CR LF, CR, LF CR, in that order | 9.2 names none |

The owner's four asks of 2026-09-28, for phase 4 — the page: **Open** reads **Open GEDCOM**
everywhere; the facts line reads GEDCOM version · encoding · exported date by the exporting
system · size · lines · sha256, and the sha256 says on hover what it is; every line with lines
under it opens and shuts (section 18's "folding a record shut", now in); and an unsaved edit shows
in its row, in the right pane, in Changes and in the Save dialog.

Phase 4 is built and passes every gate, the four asks with it. What it settled:

| Settled | Why |
|---|---|
| **Save a copy writes even when nothing changed** — 10.3's step 1 is not taken for a copy | section 15's editing walk writes a copy after an undo has left nothing changed; a dated copy is what was asked for |
| A backup whose dated name is taken gets `-2`, `-3`, as a copy does | 10.1 says so for copies; no backup may be written over |
| Save reads the file on disk twice: before the dialog, and again just before the backup | the file can change while the dialog is open (I7) |
| Clicking away from a line being typed keeps it — once that click has landed, so it still selects what it was pressed on; Esc alone drops it; an add left at its offered level adds nothing | as a spreadsheet does; nothing typed is lost unasked, and no click is eaten |
| A save or copy that wrote nothing — refused, cancelled, a backup that failed — takes its stamps back | the document is then as it was before the attempt |
| A file opened through the file box, with no handle, is proved to be in the granted folder by its name and its sha256 | `resolve` needs a handle |
| With no folder granted, Save a copy asks where (`showSaveFilePicker`), then offers the log block with a second click; with no pickers, it downloads the copy, then the log | 10.3; a picker needs a fresh click |
| A line that changed only its ending (9.2's last line) shows and logs `line ending: none -> LF`; a run of lines is one log entry, `a-b` | the log must say what changed; the brief's example shows single lines |
| The version shows beside the name in the bar | the owner named the versions |
| The walk now also edits in the page (the raw export: 88–113 ms), walks editing on its fictional file and the edges of typing on two written files, saves in place through a folder held in the page's memory, and downloads a copy with the pickers taken away | only the folder picker and its permission prompt are left for a person |

### Phase 5 — the owner's walk

On a **copy** of the raw export in a folder of its own, where its backup and log will go —
`local/walk/`, which git ignores with the rest of `local/`. Chrome, `index.html` dragged onto it.

1. **Open GEDCOM**, pick the copy. The facts line reads as section 8's example.
2. Select a `1 NAME` line, press Enter, change one letter, Enter. The row is tinted with a bar, the
   right pane says **Was**, Changes says 1, ● follows the name.
3. **Save**. Chrome asks for the folder — pick the one the copy is in — then asks to let the page
   edit files there: allow. The dialog lists the change and the one stamp. Save.
4. In Finder: `gedview-history/` holds the backup, and `<name>.ged.edits.log` sits beside the copy.
   `shasum -a 256` of the backup is `<sha256>`.
5. **Undo** twice (the stamp, then the edit), **Save** with Change stamps unticked: `shasum -a 256`
   of the copy is `<sha256>` again.
6. Select a person's `0 @I…@ INDI` line, **Delete record**: the dialog lists the lines that point
   at it. Delete, look, **Undo**.
7. **Save a copy**: the dated name appears beside the copy.
8. Change the copy from outside (append a line with another program; `touch` alone changes no
   byte), edit a line in gedview, **Save**: it refuses, and says why.
9. ⌥-click a ▾ on any `0` line: every record shuts. Go to a line inside one: it opens.

He says it is done, and it is v1.0.
