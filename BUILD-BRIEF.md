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
| R2 | **The date goes in file NAMES, and an edit log sits beside the file.** The log was cut on 2026-10-08 (P5, section 10); the date in the name stands. | "In the file's name. Also b., sure." |
| R3 | **A last-updated date inside the file only where the standard has one, with a NOTE under it that explains it.** | "c is if GEDCOM supports last updated, and can add a NOTE under the timestamp explaining it; if not, no." |
| R4 | **Its own folder and its own local git repo**, beside `sibling/`; the name is gedview. | "your recs. gedview is fine." |
| R5 | **Every assumption put to him stands** (they are the rules of sections 5–10). | "Decided: yes to everything." |
| R6 | **Indent is a toggle, on/off, in the UI.** | "Indent has a toggle on/off in the UI." |
| R7 | **The name is GEDCOM Viewer** (2026-09-28, after phase 4): in the top bar, the window's title (from 0.5.4 the file's name joins the title only by a setting), the default stamp note and the backup folder. The code keeps its own names. | "Rename gedview to GEDCOM Viewer." |

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
| `showOpenFilePicker` · `showSaveFilePicker` · `showDirectoryPicker` | there | Save writes a dated copy through `showSaveFilePicker` (10.2, from 0.5.6); `showDirectoryPicker` was Save in place until then |
| A handle from a file dropped on the page | there | a dropped file has a handle, so 10.2 step 6 can refuse the original |
| `FileSystemDirectoryHandle.resolve` | there | proved the folder held the file, until 0.5.6 |
| `crypto.subtle.digest` (sha256) | works | hashes for the log and the read-back checks |
| A sibling file loaded as a classic `<script src>` | loads | **the scripts are classic scripts** |
| `import()` of a sibling module | **refused** | no ES modules |
| `fetch()` of a sibling file | **refused** | the page cannot load a fixture by itself |
| `new Worker(siblingFile)` | **refused** | no file-based workers (a Blob worker works; none is needed) |
| `localStorage`, IndexedDB | work, and last between runs | preferences can be remembered |
| The origin-private file system | **refused** | it cannot stand in for real handles in a test |
| A directory grant on Downloads, Desktop, Documents or the home folder | **refused** by Chrome: "Can't open this folder" (the readiness review of 2026-10-08, from the Chromium source; not walked here) | a folder grant could never cover a file sitting straight in Downloads, where exports land |
| A file saved inside one of those folders through `showSaveFilePicker` | allowed by the same source (files and folders inside them are not refused); to be seen in the 0.5.6 walk | a dated copy can go beside the original wherever it is |

Firefox (the owner's default browser) and Safari have none of the three pickers (MDN's
compatibility data, checked 2026-09-28). There gedview reads, checks and edits, and Save is a download
(**Download a copy**, 10.2).

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
| I6 | **The original is never written.** A save writes a new dated file; a save that resolves to the original's own file is refused (10.2 step 6). One exception, found in the 0.5.6 build: Chrome empties a file picked in the Save dialog before the page sees it, so when the original itself is picked, the page puts it back from the bytes it read just before the dialog, read back and compared; that is the only write the original ever gets. Restated 2026-10-08; before it: every write in place preceded by a backup, read back and compared. |
| I7 | **A copy that does not read back as written is said loudly**, and the original stands regardless (10.2 step 7). Restated 2026-10-08; before it: a file that changed on disk was never overwritten, which nothing now does. |
| I8 | **The only change gedview makes on its own is the change stamp** (F1). It is listed before the save and in the Changes tab, like any other change. |
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

A move (3.4a) reorders lines, so the net change first finds the most lines that kept their order
between the two lists — every other line the two share has **moved** — and then one walk over the
two, between those, finds every other difference. Which lines of a swap are named as moved is
the smaller side; the file, not the keystrokes, is what is reported.

The Changes panel shows this list at all times. A changed record is one that holds an added or
changed line, or lost one. A record whose own level-0 line was removed is a deleted record.

---

## 10. Saving

Rewritten 2026-10-08 for 0.5.6 (P5, shape S3, the log cut; section 19). The rule above all:
**the original is never written.** A save writes a new, dated file, where the person chooses,
through the computer's own Save dialog; in a browser without that dialog it is a download. No
folder is ever asked for. There is no backup, because the original is the backup, and no log:
the copy carries the change stamps (10.4), a comparison of the original and the copy shows every
line that changed, and the Changes tab copies the list of changes as text (10.3). Until 0.5.6 is
built, the page still saves in place as 0.5 did; the old section 10 is in this file's history.

### 10.1 Names

The timestamp is local time, `YYYY-MM-DDTHHMMSS`. The stem is the file's name without its last
extension when that is `.ged` or `.gedcom` (any case); the extension is kept as written. A stem
that itself ends in `.<timestamp>` (a copy opened and saved again) has that timestamp replaced,
not stacked.

| What | Name | Example, saved at 3:12:00 pm on 2026-10-08 |
|---|---|---|
| The copy | `<stem>.<timestamp><ext>` | `RAW.2026-10-08T151200.ged` |
| A copy of that copy | the same stem, the new timestamp | `RAW.2026-10-08T160500.ged`, not `RAW.2026-10-08T151200.2026-10-08T160500.ged` |

The name is offered; the person may change it in the dialog, or rename the file after. Nothing
else is written: no `gedcom-viewer-history/`, no `.bak`, no `.edits.log` (`.gitignore` keeps
ignoring the ones already written).

### 10.2 Save, in this order, stopping at the first failure

"Changed" means the document differs from the original as it was opened. ● in the top bar and
the Save button mean changed **since the last copy** (or since the open, when none has been
written); the Changes tab counts from the original throughout.

| Step | Act | On failure |
|---|---|---|
| 1 | Nothing changed since the last copy → say so; write nothing | — |
| 2 | The page's Save dialog: every change since the original (the stamps to come among them), the note for this save, the change-stamp checkbox (F1, V1). With the stamps unticked the note box is disabled: there is nowhere for a note to go | Cancel: nothing |
| 3 | Apply the change stamps (10.4) as one undo step | — |
| 4 | Build the bytes; hash them | — |
| 5 | Ask where: `showSaveFilePicker`, the dated name offered, opening at the original (`startIn` its handle), accepting `.ged` and `.gedcom` | Cancel: the stamps are taken back; "No copy was written." |
| 6 | The chosen file must not be the original: `isSameEntry` against the original's handle (every file opened in a browser with the pickers has one: the picker's, or a dropped file's). Chrome empties the picked file before the page sees it (Chromium: create it, or truncate it when it exists), so the page reads the original whole just before the dialog, and when the picked file is the original and is now empty, writes those bytes back and reads them back | "That is the original. GEDCOM Viewer never writes over it. Pick another name." and, when it was emptied, "Your browser emptied it as it was picked, so GEDCOM Viewer put it back as it was, byte for byte." The stamps are taken back; no copy is written. If the put-back fails, the page says so loudly and offers the original as a download |
| 7 | Write the bytes; read them back; the hash equals step 4's | say so loudly and name the file; the original stands regardless |
| 8 | The copy is the last copy: ● goes, Save turns off until the next change. The facts still name the original and its sha256 as opened; the page stays on the original | — |

The notice after step 8: "Saved as RAW.2026-10-08T151200.ged." The computer's Save dialog asks
for a name and a place and nothing else; there is no "allow this site" prompt, and Chrome's
refusal to hand over Downloads, Desktop, Documents or the home folder whole does not apply to a
file saved inside one of them (section 4).

**In a browser with no pickers** (Safari, Firefox): the button reads **Download a copy**, and ⌘S
does the same. Steps 1 to 4, then the bytes are downloaded under the dated name, wherever the
browser puts downloads; no read-back is possible, and the notice says: "Downloaded as
RAW.2026-10-08T151200.ged, where your browser keeps downloads." Step 8 as above: a download
counts as the last copy, so leaving the page warns only for changes made since.

There is one button, **Save** (⌘S). Save a copy and ⇧⌘S are gone. Nothing asks for a folder, so
`grantFolder`, the folder grant held in memory and the 0.5.4 notice for a refused folder go too.

**Building the bytes:** walk `order`; a run of original lines n, n+1, n+2 … is one slice of `bytes`
from the first line's start to the last line's terminator; an added line is its text in the file's
encoding, then its terminator. The file's prefix (a byte-order mark) comes first.

### 10.3 What stands in for the backup and the log

| Was | Is |
|---|---|
| the backup, written before the file was written over | the original, never written (I6) |
| "the file changed on disk" refused (I7) | nothing on disk is ever written over, so there is nothing to refuse; the copy is written from the bytes the page read, and a change made to the original from outside, after it was opened, is not in the copy |
| the log's `note` | the note, in each changed record's `2 NOTE` under its `1 CHAN` (10.4) |
| the log's before and after lines | the original's sha256 on the facts line (P6, on demand); a copy's, in Terminal: `shasum -a 256 <copy>` |
| the log's changed, added, removed and moved lines | the Changes tab, which gains a **copy** button at its top like every box's: it puts the list below on the clipboard, and the page writes it nowhere. A comparison of the original and the copy (`diff RAW.ged RAW.2026-10-08T151200.ged` in Terminal, or any file-comparison app) shows every line that differs |

The Changes text:

```
GEDCOM Viewer  changes to RAW.ged  as of 2026-10-08T15:12:00-04:00
original  sha256 <64 hex>  4200000 bytes  123456 lines
changed  41202 -> 41202  @I42@ INDI
  - 1 NAME Jane /Fixtur/
  + 1 NAME Jane /Fixture/
removed  52310           @F45@ FAM
  - 1 CHIL @I42@
added             41248  @I42@ INDI  (change stamp)
  + 1 CHAN
moved    8120 -> 8134    @I7@ INDI  (15 lines)
```

The first number is the line's place in the original, the second its place now. A move names
what moved and how many lines, never their text. The text holds what the file holds, living
people included, and belongs beside the file, never in a repo (I9).

### 10.4 The change stamp (F1)

For each changed record whose tag may carry one (section 2), at the moment of the save:

| The record has | GEDCOM Viewer does |
|---|---|
| no `1 CHAN` | adds, at the record's end: `1 CHAN`, `2 DATE 8 OCT 2026`, `3 TIME 15:12:00`, `2 NOTE <the note>` |
| a `1 CHAN` | sets its `2 DATE` and `3 TIME` (adding either if missing) and adds `2 NOTE <the note>` at the end of the block; notes already there stay |

| Detail | Rule |
|---|---|
| Date | day without a leading zero, month as `JAN` … `DEC`, four-digit year |
| Time | `HH:MM:SS`, 24-hour, local; in a file whose version starts with 7, UTC with a closing `Z` |
| The note | what was typed for this save; if nothing, `Edited by hand in GEDCOM Viewer.` (R7). One line, 200 characters at most |
| A deleted record | has nothing to stamp; the Changes tab alone records it |
| `HEAD`, `TRLR`, records under other tags | never stamped; the Changes tab alone records the change |
| A record changed only by an earlier stamp | is not stamped again |
| A stamp added for an earlier copy, in this visit | is **replaced** when the record changes again: its date, time and note set anew, never added to |

The stamps are changes like any other: they show in the Save dialog before the save, in the grid
after it, in the Changes tab, and in the copy.

### 10.5 The log

Retired 2026-10-08 (P5; section 19). Its block format lives on as the Changes text (10.3), less
the `after` and `backup` lines. `*.edits.log` stays in `.gitignore` for logs already written.

---

## 11. The screen

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▯ GEDCOM Viewer 0.5.2 (RAW.ged ▸) ● Edit Undo Redo Save Save a copy [Go to Line…] │
│                                                                      Settings ▾  ▯          │
│ (a click on the name: GEDCOM 5.5.1 · UTF-8 · exported 16 Sep 2026 by Ancestry.com… · sha256) │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ People 2,345   Media 1,234   Families 1,098   Sources 765   _MTTAG 23   Repositories 7   …   │
├──────────────────┬─────────────────────────────────────────────────┬────────────────────────┤
│ Records          │ ↑ Top  ← Back to 41,190              Collapse all │ 1 NAME            [copy] │
│ Checks      3    │  41,201    0 @I42@ INDI                         │ Jane /Fixture/         │
│ Changes     2    │  41,202        1 NAME Jane /Fixture/            │                        │
│ Search           │  41,203            2 GIVN Jane                  │ in @I42@ INDI          │
│ Tags             │  41,204        1 BIRT                           │                        │
│                  │  41,205            2 DATE 1 JAN 1900            │                        │
└──────────────────┴─────────────────────────────────────────────────┴────────────────────────┘
```

| Part | Behaviour |
|---|---|
| The grid | only the rows in view exist in the page; every row one fixed height; a row shows at most 2,000 characters of its line, and then **… 81,797 more** (3.10); it scrolls sideways to the end of the longest line, the line number, mark and fold staying at the left edge (3.1) |
| A row | line number · a mark (error, note, changed, added) · level · id · tag · value; level quiet, tag strong, a pointer value is a link |
| Indent on | each row is set in by its level × one step (4 characters wide to start; the width is a setting) |
| Indent off | every row flush left, as in the file |
| A pointer | a click jumps to the record it names; **← Back to 41,190**, over the lines at the main frame's top left, returns (3.7). ⌥ makes a link plain text (3.9) |
| The right pane | the selected line's whole value, wrapped; the joined value when the line is part of a `CONC`/`CONT` run (read only); a `_META` drawn as it reads (3.3); its record; for a record line, the lines that point at it; its findings. Every box of text has a copy button (3.2). The › on its bar hides it (3.1) |
| Checks | grouped by check with counts, errors first; the ▸ ▾ at a check's left opens its lines, a click on its title says what it means (3.6); a click on a line jumps to it |
| Search | any text in the line as written; a count; next and previous; an id typed whole (`@I42@`) goes to its record first |
| Go to Line… | a number goes to that line; two (`105-117`) show those lines alone, with a Go button while something is typed and × to show every line again (the owner, 2026-09-28: nothing on the screen points the range out) |
| The file's name | a chip after the name GEDCOM Viewer; a click shows the file's facts under it, and hides them (remembered). Each fact that comes from a header line goes to it when clicked: the version to `GEDC`'s `VERS`, the encoding to `CHAR`, the date to `DATE`, the exporter to `SOUR`. Open GEDCOM leaves the top bar while a file is open: ⌘O, a drop, or Open another GEDCOM… among the facts |
| Edit | off whenever a file opens: the file is read, and a double-click highlights a word (a click redraws the rows' looks only, so a highlight holds, to copy). On (E): Enter or a double-click types over a line; the right frame offers Edit line · Add inside · Add after · Delete line · Delete record; ⌫ deletes; a press on a row moved a few pixels drags its block among its siblings (3.4a); and each line removed since the last save stays where it was, struck through in red under its line number as saved — a click on it offers Restore, which puts its run of removed lines back as one step |
| Types | in a file bunched by record type — each type's records in one run — a row between two types (`▾ INDI People 2,345`); a click shuts or opens every record of that type, ⌥-click every type; dragged, it takes its type past another (3.4a). A file not bunched has none. **Collapse all** shuts every record to its `0` line, then reads **Expand all** (3.5) |
| Bold surnames | a toggle beside Indent: wherever a record's label shows, the name between slashes in bold and without them; never a line as written (3.8) |
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
line above it, → opens it or goes down into it · E Edit on or off (3.11; ⌘E before 0.5) · Enter
edits · Esc drops the edit, or lets go of a drag · ⌫ deletes the line and its subtree · ⌘Z undo ·
⇧⌘Z redo · ⌘S save · ⇧⌘S save a copy · ⌘O open another file · ⌘F search · ⌘L go to line.

**Blocks open and shut** (the owner's ask of 2026-09-28): every line with a subtree shows ▾, or ▸
when shut; a shut line hides its subtree and shows how many lines it holds, in the changed colour
when one of them is not yet saved. ⌥-click opens or shuts every block at that level. Whatever
jumps to a hidden line opens the blocks around it. Display only (I4), and never remembered.

**Remembered between visits** (`localStorage`): indent on/off and width, theme, panel widths and
whether each side frame is hidden, Bold surnames, the change-stamp checkbox, whether the file's
facts show. Never a file's name, content or handle; and Edit is off whenever a file opens.

---

## 12. Files

| File | Holds | Touches the page? |
|---|---|---|
| `index.html` | the markup; loads `core.js`, `save.js`, `ui.js` as classic scripts, in that order | — |
| `style.css` | the whole look, its properties first | — |
| `core.js` | bytes → encoding → lines → shape → records and pointers → checks → counts → labels; the document, the edits, undo, the net change, the stamps, the bytes of a save | **no** |
| `save.js` | the dated name, the save of 10.2 over the handle the dialog gives, the read-back, the Changes text (10.3); the bytes a browser with no pickers downloads | **no** |
| `ui.js` | the grid, panels, dialogs, keys; the only file that knows the pickers exist | yes |
| `privacy.html` | how the page treats a file, in full; loads `style.css` and the icons, and no script (0.5.2) | — |
| `favicon.svg` · `favicon.ico` · `apple-touch-icon.png` | the icon (0.5.2) | — |
| `.github/workflows/publish.yml` | on a version tag: the tests, then the page's files alone to GitHub Pages (0.5.2) | — |
| `tools/report-check.js` | reads a problem report back: as built, changed after it was built, or no checksum (P8; 0.5.3) | — |
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
| `.gitignore` | `local/` · `fixtures/corpora/*/` · `gedcom-viewer-history/` (and `gedview-history/`, its name before R7) · `*.edits.log` · `*.bak` · `.DS_Store` | — |

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
| Save, fake handles | the order of 10.2: the original's own handle refused at step 6 and nothing written; a copy that reads back wrong said loudly, the original untouched; the stamps taken back on a cancel; the dated name, and a stem's old timestamp replaced; the Changes text of 10.3 |
| The original picked in the Save dialog | step 6 refuses, and puts the file back when the browser emptied it (10.2) |
| Names | the dated name of 10.1, with `.GED`, `.cleaned.ged`, and a stem's old timestamp replaced |
| No network | the five files of the page (`index.html`, `style.css`, `core.js`, `save.js`, `ui.js`) hold no `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `import(`, `@import`, `url(http`, `http://` or `https://` — no exceptions; an inline SVG in HTML needs no namespace; `index.html` and `privacy.html` each carry a content-security policy — `default-src 'none'`, `connect-src 'none'`, scripts the page's own alone; styles may be inline in `index.html`, since Chrome styles its own XML parse-error block inline in the inert document a malformed `_META` is read in, and a style can reach nothing outside the page — ahead of anything they load, which the browser enforces and the test reads (0.5.2) |

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
holds the backup in `gedcom-viewer-history/` and the log → `shasum -a 256` of the backup is
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
| The original is never written | a moved or renamed original is picked at its new place in the Save dialog, which `isSameEntry` may not recognise, and Chrome empties the picked file first | the Replace prompt of the computer's dialog is the only guard there; the page's put-back covers the original at the place it was opened from; walk it with a moved copy before calling it closed |
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
wrapping long lines in the grid · reading ANSEL as its own characters · a stamp for a record's
creation (`CREA`, version 7) · anything that talks to the sibling project. (Folding a record shut was here; the
owner asked for it on 2026-09-28, at every level, and phase 4 built it. Moving a line was here
too; he asked on 2026-09-29 for lines and blocks dragged in the main frame — the third round,
section 19.)

Raised at the close of session 1, for the owner to rule: a `CLAUDE.md` in this folder that points
every session opened here at section 17. It would be a pointer, not a copy, for sessions opened
without the build prompt.

Raised 2026-09-29, for the owner to rule: `index.html` moved away from its four files opens as a
bare page with nothing working and nothing said. The page could carry a line of its own that
`ui.js` removes as it starts, so a page opened away from its files says so.

Raised 2026-09-29, for the owner to rule, with the third round: ⌥↑ and ⌥↓ to move the selected
block past the block above or below it — the short moves, without a drag across a long file.

Raised by the owner on 2026-09-30, holding 3.4b: a table of which tag may sit under which, taken
from the standard (5.5.1 and 7.0) — the validation that would let a moved block land in every legal
place. The same table could check a file's own lines against the standard (a `BIRT` under a `FAM`,
say), which section 7 does not do today: its checks are structural only.

Raised 2026-10-08, with P5: after a save the page could move onto the copy, as Save As does in a
desktop app, so that the next save derives from it and Changes count from it; version 1 stays on
the original (10.2 step 8).

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

Brought to v0.4 on 2026-09-29: Edit is a mode, removed lines are struck and restored, a row sits
between record types, Go to Line… takes a range, and the change stamps are shown before and after.
Findings come back by step number.

On a **copy** of the raw export in a folder of its own, `local/walk/` (git ignores all of `local/`),
where the dated copies will go. Open the page with
`open -a "Google Chrome" ~/Desktop/claude/gedcom-viewer/index.html` — `index.html` stays where it
is, beside the four files it loads.

**A. Open and read** — Edit stays off.

| # | Do | Expect |
|---|---|---|
| 1 | **Open GEDCOM** → `local/walk/RAW.ged` | opens in under 2 seconds; Open GEDCOM leaves the top bar; the file's name shows as a chip |
| 2 | Read the counts bar; click **People** | the counts of the measured table (`local/measured.json`), People first; Records lists the people |
| 3 | Click the file's name | GEDCOM 5.5.1 · UTF-8 · exported 16 Sep 2026 by Ancestry.com Family Trees 2025.08 · its size · its lines · sha256. **GEDCOM 5.5.1** goes to line 18, **exported…** to line 15; **sha256** shows `<sha256>` and says on hover what it is |
| 4 | **Checks** | 0 errors. Notes: Line break inside the value 3 · Nothing points at it 9 · Over 255 characters 93 · Mixed line endings, once, for the whole file |
| 4a | Click the title **Over 255 characters**; then the ▸ at its left | the right frame says what N4 means and what is usually done; the ▸ opens its 93 lines, and a click on one goes to it (3.6) |
| 5 | Click a **Line break inside the value** | a `CONC` line in media record `@O780@` or `@O1530@`, the character marked in the value |
| 6 | **Indent** on, then off | rows set in by level, with a width box beside the button; then flush left |
| 7 | ▾ on a `0 @I…@ INDI` line, then ▸; ← and → on a selected line; ⌥-click ▾ on a `0` line; Go to Line… a line inside a shut record | the record shuts and opens; ⌥ shuts every record; the record gone into opens |
| 8 | Click the row **▾ INDI People …** between the types; again; ⌥-click it | every person shuts; opens; ⌥ shuts every type |
| 8a | **Collapse all**, in the strip above the lines; then **Expand all** | every record and every type one row; then every block and every type open (3.5) |
| 8b | The icon at the top bar's left end; the one at its right end; again each | the left bar eases shut, and the right frame; the same icons bring them back. Close the tab and open the page again with one hidden: still hidden (3.1) |
| 9 | Drag the scrollbar to the end and back | no blank screen on the way |

**B. Find and move**

| # | Do | Expect |
|---|---|---|
| 10 | **Go to Line…** (⌘L) the last line's number | `0 TRLR` |
| 11 | Go to Line… `105-117`, **Go** | only those 13 lines; **×** shows every line again |
| 12 | Click the `@F…@` of a `1 FAMS` line; **← Back to …**, in the strip above the lines; then **↑ Top** | the family; Back names the line it returns to, and returns; Top goes to line 1, and Back returns from there too (3.7) |
| 13 | **Search** (⌘F) a word: **Next**, **Previous**. **Tags**: click `_MTTAG` | a count, and each match in turn; the tag's lines |
| 14 | **Records**: part of a surname in the filter; click a result | that record |
| 14a | **Settings → Bold surnames**; look at Records and the right frame; then at the line itself | the surname in bold, without its slashes, wherever the record is named; the line still reads `/Surname/`. Off again, or leave it: it is remembered (3.8) |
| 15 | Select a `CONC` line; then a `0 @…@` record line | the right frame's **Joined** holds the whole value; for the record line, the lines that point at it |
| 15a | **Search** `@O780@`, Enter; then its `1 _META` line, 11 lines down (its place by number depends on the copy's order) | the right frame draws it as it reads — `content` (70 paragraphs, some in bold), then **Joined**; on another `_META`, `transcription`, `personas` as a table, `cemetery`, `record_source_gid` where the value holds them (3.3). Two-finger swipe the lines sideways: the 20 `CONC` lines readable to their ends, the line numbers staying put and casting a shade; ↑ Top, Home or any jump brings the lines back to the left edge (3.1) |
| 15b | The copy button at the top right of the Story box, and of the value box of any line; paste somewhere | the box's text, exactly; the icon a check mark for a moment (3.2) |
| 16 | Double-click a word; then a word of a web address in a `_META` or a `NOTE`; then, holding ⌥, double-click a `@F…@` pointer | the word highlights, and stays highlighted to copy; the address whole; the pointer whole, and nothing jumps (3.9) |
| 17 | The file's name → **Open another GEDCOM…** → `local/CLEANED.ged`; Go to Line… the number of its longest line. Then reopen `local/walk/RAW.ged` | **What it tests:** a line far longer than any screen neither slows nor breaks the main frame. This one is over 80,000 characters, the `_META` of one media record, which the cleaner joined into one line. The main frame shows its first 2,000 characters (from v0.5, ending **… 81,797 more**); the right frame shows it whole |

**C. Edit a line**

| # | Do | Expect |
|---|---|---|
| 18 | **E** (or click Edit). Select a person's `1 NAME` line; Enter (or double-click); change one letter; Enter | Edit on — ⌘E is no longer a key of the page's (3.11); the row tinted, a bar at its left; the right frame's **Was** holds the old line; **Changes 1**; ● after the file's name; Save turns on |
| 19 | Start typing over another line; Esc | nothing changes |
| 19a | Press on that person's `1 BIRT` line and drag it up to the top edge of the `1 NAME` line; release | on the way, the block dims and a gold line shows only at a sibling's edge; released, the BIRT block stands first, tinted in the moved colour, a dot in the mark column; **Changes 2**: `moved: BIRT · n lines`; the right frame says **Moved · line … as saved**; a rule marks where it came from — for a block that was last in its record, on the top edge of the next record's first line (3.4a) |
| 19b | Press on the row **▾ SOUR Sources …** and drag it up to the row **▾ INDI People …**; release. Then ⇧⌘S, read the dialog, Cancel | the sources stand before the people; **Changes 3**: `moved: section SOUR · … records · … lines`; the dialog lists the move as one entry, and **Change stamps · 1 record** — the person of 19a, not the sources (3.4a). Try dragging a person down to the families: the gold line stops at the last edge among the people |
| 19c | **Undo**, twice | the sources back, then the BIRT block back; **Changes 1** — the name of step 18 alone |

**D. Save, as a dated copy, with the change stamp** (rewritten 2026-10-08 for 0.5.6, P5)

| # | Do | Expect |
|---|---|---|
| 20 | **Save** (⌘S) | the dialog lists 1 change and **Change stamps, 1 record**, with a note box (left empty; the note is *Edited by hand in GEDCOM Viewer.*). Save. The computer's Save dialog opens in `walk`, offering `RAW.<today>T<now>.ged`; keep the name; Save |
| 21 | Go to that person's record | it ends with `1 CHAN`, `2 DATE` today, `3 TIME` now, `2 NOTE` the note; ● gone; Save off; Changes 2, the edit and the stamp, counted from the original; the facts still name RAW.ged and its sha256 |
| 22 | `shasum -a 256 local/walk/RAW.ged local/walk/RAW.*.ged` | RAW.ged is `<sha256>`, the file as opened, untouched; the copy differs |
| 23 | `diff local/walk/RAW.ged local/walk/RAW.<stamp>.ged`; then, in the viewer, Changes, **copy**, and paste into TextEdit | the diff shows the NAME line before and after and the four stamp lines; the pasted text opens with the original's name and sha256 and lists the same change and the stamp |

**E. Back to the original**

| # | Do | Expect |
|---|---|---|
| 24 | **Undo** twice (the stamp, then the edit); **Save** with **Change stamps** unticked | the dialog says there is no change from the original, since the two undos leave the lines as opened, and the note box is dimmed. Save; keep the offered name. The new copy's sha256 is `<sha256>`: an edit undone saves the original's bytes again (I1) |

The box remembers how it was left: tick it again before a save that should stamp.

**F. Delete a record, and bring it back**

| # | Do | Expect |
|---|---|---|
| 25 | Select the `0 @I…@ INDI` line of a person in a family; the right frame's **Delete record** | a dialog: the record's lines, and each line elsewhere that points at it (the family's `CHIL`, `HUSB` or `WIFE`), ticked |
| 26 | **Delete** | the lines stay where they were, struck through in red; Changes lists them. Edit off: a red rule where they were. Edit on again |
| 27 | Click a struck line → **Restore**. In **Changes**, click the family's removed line → **Restore** | each comes back; Changes 0 |
| 28 | **Delete record** again; **Undo** once | all of it back in one step; Changes 0 |

**G. Add lines**

| # | Do | Expect |
|---|---|---|
| 29 | Select a `0 @I…@ INDI` line → **Add inside**; type `NOTE test` after the offered `1 `; Enter | a new line under it, tinted another colour; the right frame says **Added** |
| 30 | Enter on that line; take out the space after `1`; Enter | Checks: 1 error, **Not level · tag · value**, at once |
| 31 | ⌫ on it | gone, and not struck (it was never saved); Changes 0; 0 errors |
| 32 | Select a `1 NAME` line → **Add after**; Esc | a box after the name's block, at level 1; Esc adds nothing |

**H. Save a copy**

| # | Do | Expect |
|---|---|---|
| 33 | Edit any line, then **Save**; in the computer's dialog type the original's name, `RAW.ged`, in `walk`, and confirm Replace | refused: "That is the original. GEDCOM Viewer never writes over it. Pick another name. Your browser emptied it as it was picked, so GEDCOM Viewer put it back as it was, byte for byte." No copy; `shasum` of RAW.ged unchanged; its modified time is new |

**I. What must refuse, and a clean fix**

| # | Do | Expect |
|---|---|---|
| 34 | `printf '0 NOTE changed from outside\n' >> local/walk/RAW.ged`; in the viewer, edit any line; **Save**, keep the offered name | a dated copy is written from the page's lines: the outside line is not in it (`tail -1` of the copy is `0 TRLR`); the facts' sha256 is still the file as opened |
| 35 | With a further edit unsaved, reload the tab (⌘R) | Chrome asks first; leave |
| 36 | Reopen the walk copy | one line more than the file had; Checks: 1 error, **No HEAD first / TRLR last**; the counts bar gains Notes 1 |
| 37 | Edit on; Go to Line… the line after the last; ⌫; **Save** | the dialog: 1 line removed, **Change stamps, none needed**; no folder is asked for. Keep the offered name. The copy's sha256 is `<sha256>` again |

**J. Real use**

| # | Do | Expect |
|---|---|---|
| 38 | One fix he would really make, Change stamps ticked; read a long source or media record in the right frame | anything awkward goes on the findings list |

**K. The look, and what is remembered**

| # | Do | Expect |
|---|---|---|
| 39 | **Theme**: light → sunset → dark | each reads well |
| 40 | Close the tab; open the page again | Indent, theme, panel widths and whether a side frame is hidden, Bold surnames, and the facts' open or shut as left; Edit off |

`local/walk/` then holds the copy, a dated copy, the backups and the log — all real data, all
ignored by git; delete the folder when the walk is over. He says it is done, and it is v1.0.

### The owner's second round (2026-09-28, after phase 4): v0.4

Asked, from his first look at v0.3: GEDCOM Viewer as the name (R7); Edit as a mode ("let's pick
and choose one"); a line removed kept in sight, struck through, and restorable; a row between
record types, and every record of a type shut at once; Go to Line… taking a range, with Go and ×;
Open GEDCOM out of the top bar while a file is open; the file's facts behind its name, each going
to its line; Add child and Add sibling renamed; the name and the file's name to stand out; and a
double-click that edits, and a highlight that holds. Built as section 11 now says. Settled:

| Settled | Why |
|---|---|
| **Edit is a mode**, a button beside Undo; off whenever a file opens | his words for it; a file is read before it is changed, and Edit off frees the double-click to highlight a word |
| Removed lines show only with Edit on; with it off, the lines are the file as it will be saved, and a red rule marks where lines went | one switch, not two (he offered a Show Deletions button as the other way) |
| A line typed and removed again before any save is not shown struck: it was never in the file | the struck lines are the net change's (9.4) |
| Restore puts back the whole run of removed lines a struck line is in, as one step, and is a change like any other | a record's lines come back together; a line alone could land in no record |
| The row between types appears only when every type is in one run | his condition: "if the GEDCOM is well-formed"; a file of interleaved types would be all rows |
| Add child → **Add inside**, Add sibling → **Add after** | child and sibling mean people in genealogy; inside and after mean the block |
| The name: a serif, GEDCOM in the palette's sepia; the file's name: a chip, its facts behind a ▸ | "stylize that title … stand out better" |
| The main frame redraws only the rows' looks on a click | it redrew every row, so a highlight vanished and a double-click's second click landed on text just replaced |
| The frames are the top bar, the counts bar, the left bar, the main frame, the right frame | his words; the README uses them |

### The owner's third round (2026-09-29, from walk steps 1–17): v0.5

0.4.1 (2026-09-30) is this brief and the README, nothing else: the walk brought to 0.4, the page
opened by command, and this round written. The round is built as 0.5 (session 3, 2026-09-30;
"Where session 3 is", below, says what it settled).

Steps 1–17 of the phase-5 walk passed; of step 17 he asked what it tested (3.10). What he asked
for from them, in his words:

| # | His words | Below |
|---|---|---|
| 1 | "minimize the sidebars — left and right — and … hover-scroll left and right. This came up when I tried to intuitively read the _META tag starting on Line 202,541 and couldn't." | 3.1 |
| 2 | "the 'Joined' _META I would like to be able to copy and paste, with the one-click copy button/icon you use here in Claude Mac" | 3.2 |
| 3 | "That whole _META block — I'd like to see it interpreted correctly in the right sidebar (i.e. rich text in a box). If that's not deterministically doable, then skip it — I'd want to be able to rewrite that in plain text." | 3.3 |
| 4 | "drag and drop lines — and blocks — in the main panel"; then, 2026-09-30, "reordering of blocks among siblings … the reordering of each section" | 3.4 — 3.4a in 0.5, 3.4b held |
| 5 | "There should be a Collapse All / Expand All button." | 3.5 |
| 6 | "helper text for the checks on 4 in the right sidebar, when their title is clicked on in the left sidebar" | 3.6 |
| 7 | "The back button should be somewhere more prominent, and nearer the middle frame if possible." (step 12) | 3.7 |
| 8 | "Instead of /Surname/ in the panels, try bolding the Surname instead. Make that a toggle on/off as well, to see if I like it. But the raw text should stay /Surname/ no matter what." | 3.8 |
| 9 | "16 worked except for a highlighted word - considering how to highlight a link easily, when needed." | 3.9 |
| 10 | "17 worked, I think? Not sure the goal of the main frame being clipped, Not sure what 17 did." | 3.10 |
| 11 | "18. Hitting ⌘E in Chrome opened Claude as a frame on the right side, I wasn't able to edit." | 3.11 |

His picks, made on 2026-09-30: **P2 = B** (3.2, every box of text carries a copy button) and
**P3 = L1** (3.9, ⌥ makes a link plain text). P1 went with 3.4's first form; the part he ruled
in, 3.4a, needs no pick.

**3.1 Hide a side frame; scroll the lines sideways**

| Part | Rule |
|---|---|
| Hide | Each split bar carries a small tab — ‹ on the left bar's, › on the right frame's. A click hides that frame, and the same tab, flipped, brings it back; a double-click on the split bar does the same. Hidden or shown is remembered between visits, as the widths are |
| Sideways | The main frame scrolls left and right — a two-finger swipe on the trackpad, or Shift with the wheel, with the pointer over it. Its width is the file's longest line as the grid shows it (at most `ROW_CHARS`, 2,000 characters), plus the indent while Indent is on. The line number, the mark and the fold stay in view at the left edge |
| No swipe back | A sideways swipe at the frame's edge must never take Chrome back a page: `overscroll-behavior-x: none` on the grid and on the page. A swipe back would leave the page with edits unsaved |
| The `_META` line of his step 1 | a `1 _META` and its 20 `CONC` lines, each up to 256 characters: every one readable by scrolling, and the whole value in 3.3's box |

**3.2 A copy button on a value**

A small icon at the box's top right (two overlapping squares, as in the Claude app). One click copies
the box's text exactly as the box shows it — for Joined, the `CONC` runs joined and each `CONT` a
line break; for 3.3's parts, the text as drawn. The icon turns into a check mark for 1.5 seconds.
`navigator.clipboard.writeText` (the page opened from disk is a secure context, section 4; the click
is the user action it needs). If the clipboard refuses, the box's text is selected so ⌘C copies it,
and a notice says so.

| P2 | Which boxes |
|---|---|
| **A** | Joined only — what he named |
| **B** — ruled by the owner, 2026-09-30 | every box of text in the right frame: the line's value, Was, Joined, and each of 3.3's parts — one control, the same everywhere |

**3.3 The `_META` drawn as it reads**

Deterministic: yes. Measured on the raw export on 2026-09-29, element and tag names and counts only:
718 `_META` lines, every one at level 1 in an `OBJE` record, every one a `<metadataxml>` XML
document, and 718 of 718 parse. The root holds at most these parts:

| Part | In batch 20 | Drawn as |
|---|---|---|
| `content` — a story | 73; its `<line>` children hold web formatting once the XML is read: `p` `br` `strong` `em` `span` `table` `tr` `td` `th` `tbody` `thead` `dl` `dt` `dd` `ul` `li` `font` `div` `sup` `blockquote` `pre` `hr` `h1` `address`, links (`a`, 154), images (`img`, 3), and Word's hidden settings (`w:…`, `o:…`, `m:…`, `xml`, comments; one `style`) | its lines joined with a line break and read as HTML in an inert document (`DOMParser`), then rebuilt from an allowlist only — `p` `br` `strong`/`b` `em`/`i` `u` `sup` `sub` `div` `blockquote` `pre` `hr` `h1`–`h6` `address` `ul` `ol` `li` `dl` `dt` `dd` `table` `thead` `tbody` `tr` `td` `th` (with `colspan` and `rowspan` kept). `span` and `font` give up their text and go. Every other attribute goes (style, class, width, colour, face, size). Comments, `style`, `script`, `xml` and every namespaced element (`w:`, `o:`, `m:`) go with their content. A link is its text, then its address in plain text — never a live link. An image is `[image]`, and is never loaded (I5) |
| `transcription` | 471; 12 hold text | plain text, its line breaks kept |
| `personas` → `persona` — Find a Grave's people | 79 | a table: Name · Born · Birthplace · Died · Death place (`pname` `bdate` `bplace` `ddate` `dplace`) |
| `cemetery` | 433; 62 hold text | one labelled line |
| `record_source_gid` | 124 | one labelled line |

Where: in the right frame, above Joined, whenever the selected line is a `_META` or a line of its
`CONC`/`CONT` run — each part under its own heading (Story, Transcription, Persons, Cemetery, Record
id); an empty part shows nothing. Read only. A value that is not `<metadataxml>`, or does not parse
as XML, gets none of this — Joined alone, as today — so another program's `_META` is never guessed
at. Every step is fixed, so a value is always drawn the same way.

That `_META` line: a story of 70 paragraphs, 11 bold passages, 531 words — 5,059 characters as
written. His fallback ("rewrite that in plain text") is therefore not needed; editing a split value
as one text stays in section 18.

**3.4 Moving blocks by dragging**

His words on 2026-09-30, first: "P1: Hold on this for right now. I want to allow all legal places for
a line to land, but that requires validation we haven't done yet. e.g., 1 BIRT could land under any
0 INDI places, but a NOTE could change depth validly. Also, I want to be able to drag and drop whole
blocks (e.g. reorder _MTCAT boxes)." Then: "Yes, let's allow reordering of blocks among siblings.
Let's also allow for the reordering of each section (e.g. allow drag-and-drop of Sources above
People wholesale)."

So 3.4 comes in two parts, and P1 (M1 or M2) is withdrawn:

| Part | In | What |
|---|---|---|
| **3.4a** | 0.5 | a block, a record or a section reordered among its siblings. It needs no new validation: every line keeps its parent and its level |
| **3.4b** | held | a block moved to another parent, landing wherever the standard allows its tag — a `1 BIRT` under any `0 INDI`; a `NOTE` at another depth. It waits for the table of which tag may sit under which (section 18) |

**3.4a Reordering among siblings**

What the standard says about order, read on 2026-09-30. GEDCOM 7.0.18: the header comes first and
`TRLR` last, with the records between them in any order; substructures of different types may be
reordered, but several of one type stand in order of preference, the first the most preferred.
GEDCOM 5.5.5: the submitter record follows directly after the header; otherwise the order of
different records is not significant; and several lines of one kind are, again, in order of
preference.

| Part | Rule |
|---|---|
| What moves | a block — a line and everything under it; a whole record; a whole section — every record of one type, dragged by its type row (▾ SOUR Sources 842) in a file bunched by type |
| Where it may land | only among its siblings — between two lines with the same parent — so no line's level or parent changes: a fact among its person's facts, a citation among its fact's citations, a record among records, a section among sections. In a file bunched by type, a record lands only among the records of its own type, so the file stays bunched and keeps its type rows |
| Fixed | `HEAD` stays first and `TRLR` last. In a file below version 7, the submitter record (`SUBM`) stays directly after `HEAD`. A `CONC` or `CONT` line is part of its line's value: it never moves alone, and nothing lands between a line and its `CONC`/`CONT` lines |
| Same kind | reordering two lines of one tag under one parent — two `1 NAME`, two `1 BIRT` — changes which the standard reads as preferred: the first. That is allowed, and meant; the Save dialog says so beside such a move |
| When | Edit on only |
| How | press on a row — a type row, for a section — and move a few pixels: what would move dims, and a gold line shows where it would land, only at a sibling's edge. Near the frame's top or bottom edge the frame scrolls; shut blocks and sections make a long move short. Release to move; Esc, or a release where no gold line shows, moves nothing. A click on a type row that does not move still shuts or opens it |
| Changes, the Save dialog, the log | a move is listed as **moved**: the record, or the section's type and its count of records; the lines' places before and after; how many lines — never their text, and one entry per move however many lines it carries. 9.4 gains that kind: a run of lines that is, line for line, a run gone from elsewhere, with the same text and endings. A moved line then edited is also listed as changed, in its new place |
| With Edit on | a rule marks where a move took lines from; nothing is struck, since nothing left the file |
| The bytes | a moved line is written from its own bytes, as an untouched line is (I1). A move never re-encodes anything, so a line with unreadable bytes (E8) moves with its block |
| Stamps | a record whose own lines were reordered is stamped (10.4). A record moved whole, or with its section, is not: nothing in it changed, only its place in the file |
| Back | moved back to exactly where it was, it is no change at all; Undo reverses a move in one step |
| Refused | by I11, any move the file could not read back as shown |
| Ids and pointers | unchanged: an id moves with its record |

Example: in batch 20's export, drag the row ▾ SOUR Sources 842 up to the edge of ▾ INDI People
…, and release. The source records now stand before the people. Changes shows one entry —
Sources, 842 records, moved — and no record is stamped; the log's block has one line for it. Save
writes the same bytes in a new order: the sha256 changes, the size does not.

**3.5 Collapse all / Expand all**

One button in the top bar, beside Indent. While any record is open it reads **Collapse all**, and
shuts every record to its `0` line; the type rows stay open, so each record is one row. Then it
reads **Expand all**, and opens every block and every type. (⌥-click on a type row still shuts
every type.)

**3.6 What each check means**

In Checks, a click on a check's title shows in the right frame what the check means, why it matters
and what is usually done about it, under the check's name and code. The ▸ or ▾ at the row's left
opens or shuts its list of lines — today a click anywhere on the title does that. The texts,
verbatim; he may change any of them:

| Code | Name | Text |
|---|---|---|
| E1 | No level number | This line doesn't begin with a level number, so no program can tell where it belongs in the tree. It is usually the tail of a value that broke onto a line of its own, or text pasted in by mistake. Join it to the line it came from as a CONC or CONT line, or delete it. |
| E2 | Not level · tag · value | This line begins with a number but isn't in GEDCOM's shape — a level, an optional @id@, a tag, then the value, one space apart. Typical causes: a leading zero (01), no space after the level, an id missing its closing @, or a character in the tag other than a letter, digit or underscore. Other programs may skip it or misread it. Retype it in the right shape. |
| E3 | Level jumps | This line is more than one level deeper than the line above it — a 3 straight under a 1 — so the level between is missing; or the file doesn't open at level 0. Programs attach such a line wherever they guess. Correct its level, or add the missing line above it. |
| E4 | No HEAD first / TRLR last | A GEDCOM file opens with 0 HEAD and ends with 0 TRLR, once each. Here one is missing or doubled, or there are records after TRLR, which many programs never read. Move or delete the stray lines. |
| E5 | Blank line | An empty line, or one of spaces only. The standard allows none, and some programs stop reading at the first. Delete it. |
| E6 | Id defined twice | Two records carry this same id. A pointer to it could mean either, so programs choose one — often the last — and the other record's links go wrong. Give one of them a new id, and repoint the lines that meant it. |
| E7 | Points at nothing | This line points at an id that no record in the file has — the record was deleted, or the id mistyped — so the link is lost on import. Point it at the right record, or delete the line. |
| E8 | Unreadable bytes | This line holds bytes that aren't valid in the file's encoding. They are kept exactly as they are and shown as best they can be. GEDCOM Viewer lets you delete such a line but not edit it, so nothing is changed by a guess. Delete it, or correct it in the program that made the file. |
| E9 | Header and bytes disagree | The header's 1 CHAR line names one encoding and the file's bytes are in another — or a file that needs a CHAR line has none. GEDCOM Viewer reads the bytes as they are; a program that trusts the header may garble every accented letter. Correct the CHAR line to match the bytes. |
| N1 | Line break inside the value | This value holds a character that some programs treat as the end of a line, though GEDCOM does not — NEL (U+0085), LS (U+2028) and the like; it's shown marked. A program that breaks there cuts the value in two and can lose the rest of it. Keeping it is usually safe; delete it if the value reads the same without it. |
| N2 | Control character | This value holds an invisible control character other than a tab, shown marked. It is usually left over from copy and paste, and some programs drop or reject it. Delete it. |
| N3 | Nothing points at it | No line in the file points at this record — a person in no family, a source no fact cites, a picture attached to no one. That isn't wrong: it may be kept on purpose. But it's often what is left behind after something else was removed. Look before you delete it. |
| N4 | Over 255 characters | GEDCOM 5.5 allows a line of at most 255 characters; a longer value is meant to continue on CONC lines. A program that keeps to the letter may cut this line short. GEDCOM 7 has no such limit, so this is not noted in version-7 files. |
| N5 | Leading whitespace | There are spaces or tabs before the level number. The standard allows none, and a strict program may reject the line. Delete them. |
| N6 | Encoding shown as it can be | This file is in an encoding GEDCOM Viewer can't show as its own letters — ANSEL, for one. Each byte is shown as the character with the same number, so accented letters may look wrong on screen; but every line you don't edit is written back byte for byte. A line you edit may hold plain ASCII only. |
| N7 | Mixed line endings | Lines in this file end in more than one way — most with LF and some with CR LF, for instance. Every line keeps its own ending when saved, and a new line takes the file's most common one. Most programs don't mind; a few treat it as damage. |

**3.7 Back, where the eye is**

| Part | Rule |
|---|---|
| Where | at the top left of the main frame, over the lines, and only while there is somewhere to go back to: **← Back to 41,205**, naming the line it returns to. The top bar's Back button goes |
| What | as today: a jump remembers the line it left, and Back returns to the last one, then the one before |

**3.8 Surnames in bold, on a toggle**

| Part | Rule |
|---|---|
| The toggle | **Bold surnames**, a button beside Indent; off until first pressed; remembered between visits |
| On | wherever GEDCOM Viewer shows a record's label — the name it makes for the screen (section 8): Records, the right frame, the Delete record dialog, the Save dialog's stamps, a family's label — the part of a name between slashes is bold and loses its slashes. `Jane /Fixture/` reads Jane **Fixture**; `/Fixture/ Jr.` reads **Fixture** Jr.; a name with no slashes reads as written; `//` shows no surname |
| Never | a line as written. The main frame, the value boxes, Joined, Search, Checks, Changes' before and after, the log and the file keep `/Fixture/`, toggle or not |
| The filter | the Records filter matches a name as written or as shown: `Fixture` finds it either way |

**3.9 Selecting a link**

A pointer jumps on a click (`.ptr`, `ui.js`), so the first click of a double-click leaves the line
before the second can highlight anything — what step 16 met.

| Case | Rule |
|---|---|
| A web address in a value (`http…`, `https…`, `www.…`) | a double-click selects the whole address, not one word of it |
| A pointer (`@F12@`) | P3 |

| P3 | Selecting a pointer |
|---|---|
| **L1** — ruled by the owner, 2026-09-30 | **⌥ makes a link plain text.** Holding ⌥, a double-click selects the whole pointer, `@` to `@`, and a drag selects across it; nothing jumps. A plain click still jumps at once. ⌥ is already this page's key for the other thing a click can do |
| **L2** | **A double-click selects; a single click jumps a moment later**: it waits a quarter of a second to see whether a second click follows. Nothing to learn; every jump is a beat slower |

**3.10 A clipped row says so**

He could not tell what step 17 did: the main frame showed the start of a long line, and nothing
said the rest was elsewhere. A row clipped at `ROW_CHARS` now ends with a muted **… 81,797 more** —
the characters not shown — and the right frame shows the whole value. Step 17 of the walk now says
what it tests.

**3.11 Edit's key**

| Part | Rule |
|---|---|
| Why | the Claude extension in his Chrome takes ⌘E to open its panel, and a key an extension takes never reaches the page. The Edit button was never affected — it runs the same code (`setEditing`) — so the walk goes on with it |
| The key | **E**, alone, whenever no box is being typed in. Chrome lets an extension's shortcut be only a key with Ctrl or Alt (⌘ counts as Ctrl on a Mac) — "Extension command shortcuts must include either Ctrl or Alt", in Chrome's `commands` reference, read 2026-09-30 — so a bare letter always reaches the page. ⌘E is dropped |
| The others | ⌘S, ⇧⌘S, ⌘O, ⌘Z, ⇧⌘Z, ⌘F and ⌘L stay; each also has its button or box. If the walk finds one taken the same way, it goes as ⌘E did |
| Where it is written | the README's keys and the walk say **E**; until 0.5, step 18 reads "click **Edit**" |

**Tests and the walk.** Each part lands with its tests (section 17, rule 8): the `_META` drawing over
the fixtures and over each `_META` shape above (written fictional files), with a test that nothing
is loaded and nothing outside the allowlist survives; the copy button with the clipboard refused;
the side frames hidden and restored across a reload; bold surnames on and off, and no line as written touched by them; the clip's
count; the two kinds of link selected whole; moves among siblings at random over every test file,
each checked against a fresh read and undone to the file's own sha256, every fixed place (`HEAD`,
`TRLR`, `SUBM` below version 7, a `CONC` run) refused, a section moved with its bytes the same
bytes in a new order, a record moved whole left unstamped; E turning Edit on and off, and not while
a box is typed in. The phase-5 walk gains a step for each part, in the group it belongs to. Its
steps 1–17 are walked; he stopped at 18 on ⌘E (3.11), and walks 18–40 on 0.5.

### Where session 3 is

The third round is built as 0.5 (2026-09-30) and passes every gate: the tests (140), the two
real files through `check-real.js` and `compare.js`, and the walk, which gained a part of its
own for the round (`node tools/walk.js … --only third` walks it alone). What it settled:

| Settled | Why |
|---|---|
| A moved line shows in its row like a changed one — a tint and a bar, in a colour of its own — and the right frame says **Moved · line N as saved**; with Edit on a rule in that colour marks where the lines were taken from | round 2's rule that an unsaved edit shows in its row, in the right frame, in Changes and in the Save dialog; 3.4a names the rule |
| When two sibling blocks swap, the net change names the smaller side as moved; a section moved past a larger one is the one named | 9.4 reports the file against the file as saved, never the keystrokes; the lines that kept their order are the most that could have (patience sorting) |
| In the Changes panel a moved run sits at its new place, and reads what moved and how many lines; the Save dialog and the log say the same, and add, for two lines of one tag under one parent, that the first is read as preferred | 3.4a: never their text |
| The move act refuses a range that is not whole sibling blocks, a landing that is not a sibling's edge, and a move that would leave a `CONC`/`CONT` line continuing another line, as well as the fixed places | 3.4a's rules, read as one; `landings()` gives the page the edges a block may land at |
| In the page a record lands only among the records of its own type, and a type row only at another type's edge; core.js allows any sibling edge, so a file not bunched by type is not held to it | 3.4a: the file stays bunched |
| The XML of a `_META`, and the HTML of its story, are read in the page by DOMParser in an inert document (nothing loads) and handed to core.js as plain nodes; the rebuild from the allowlist is pure, tested under Node with a small markup reader of the tests' own, and the page's path is walked in Chrome on a written `_META` of every shape | Node has no DOMParser and nothing is installed (17.11); what survives is decided in one place |
| A link's address is written after its text only when it is not the text already; a `colspan` or `rowspan` survives as a small plain number | 3.3's allowlist, applied |
| The Save dialog's change-stamp rows show each record's label beside its id | 3.8 names them among the places a label shows |
| The Records filter matches a label as written and as shown, toggle or not | 3.8 |
| With Edit on a double-click types over the line, as before; a web address is selected whole with Edit off, or with ⌥ | 3.9: ⌥ makes a link plain text; Edit on is for typing |
| The row's left part (line number, mark, fold) stays at the left edge by `position: sticky`; the rows' layer and each row clip with `overflow: clip`, since `overflow: hidden` would make them the scroll container the part sticks to | 3.1 |
| Chrome 154, headless, with synthetic input: a raw key-down of a printable key sent into a text box with no character leaves the tab unable to finish its next navigation; after a key-down whose default the page prevented (E now, ⌘E before), a synthetic Escape sent into a box that was typed in leaves the renderer dispatching key events named Unidentified without end; and once a few dozen synthetic clicks have gone into a tab, a drag of a row let go with a synthetic Escape leaves the renderer, a moment later, answering nothing — not even the debugger — on the 0.4.1 page's key sequences as on 0.5's. A hand does none of it: the owner dragged and let go at steps 19a–19c without trouble. The walk types with the character, clears a box by setting its value, leaves a typed-in box by a click, sends Escape as its key-down alone, walks each part in a Chrome of its own, keeps the drag let go with Escape for the last act of the drags' part, walks a part again when its page stops answering, and says where the page was when it did | found while walking 3.11 and 3.4a; `tools/chrome.js` says so at `press` |
| Back sits in a strip of its own above the lines while it shows, so no line's number is under it | 3.7 puts it at the main frame's top left; laid over the rows it hid the first two lines' numbers after a jump to the top of a file, and its width grows with the line it names |
| The version is 0.5, tagged | as the owner named the versions |

The phase-5 walk below gained a step for each part, lettered after the step it follows, so
that 18–40 keep their numbers.

### The owner's fourth round (2026-09-30, from his walk of 0.5, steps 4a–24): 0.5.1, then 0.6

His findings, by step, in his words; and what each became.

| # | His words | Became |
|---|---|---|
| 8a | "Each block is collapsed, but I'd like all of the sections to collapse/expand as well. Right now I still manually have to collapse each." | 0.5.1: Collapse all shuts every record and every type; Expand all opens everything |
| 8b | "It hides far too much - instantaneously (bad), then hard to reopen. I'd like an icon similar to screenshot 1 (Claude Mac's own icon), which is what I initially described." | 0.5.1: the tabs on the bars are gone; an icon at each end of the top bar (a square with a line at one side, as the Claude app's) hides and shows its frame, eased over 200 ms; a double-click on a bar does nothing |
| 12 | "OK. I want a permanent 'Back to Top' as well." | 0.5.1: a strip above the lines, always: **↑ Top**, then **← Back to …** while there is one, then Collapse all. Top is a jump, so Back returns from it |
| 15a | "Why is it called 'Story?' That's the part that didn't make sense to me. And 202,541 is not a _META line at all. Redo?" | "Story" was session 3's word for the XML's `content`; 0.5.1 draws each part under the name the file gives it: `content`, `transcription`, `personas`, `cemetery`, `record_source_gid`. 202,541 was the `_META`'s line in the raw export; his walk copy was saved at step 20 with the type rows reordered (19b), so that line now sits 6,539 lines lower, at 209,080 — the step now says to search `@O780@` instead of a number |
| 18 | "I think I'd like the edit mode to make the middle look more like a live code editor (it's all text, can be rewritten/modified in bulk, not just line-by-line). I'd also like the right sidebar to dynamically update as I change the name in the main panel. And the change dot(s) should be on the row(s) that have changed, too." | 0.5.1: the right frame follows the typing; a change dot in the mark column (changed, added, moved, in their colours), beside a finding's. The editor: P4, below |
| 19a | "I noticed that moving a 2nd one above NAME (like FAMS) is recorded, but no blue line is created. What's the purpose of the blue line - is it intentional? Make sure the 2nd recording is also still factual (original line -> new line). Related - when I move a whole INDI block to the top of the INDI section, the line appears ABOVE the INDI header, not below it as it should." | The rule marks where a block was taken from (3.4a, "a rule marks where a move took lines from"), with Edit on. For FAMS, the record's last line, that place is the record's end: the rule sits on the top edge of the next record's first row, one row under the first rule. The second move's record is factual: lines 10→4 and 7→5 in the test that reproduces it. The gold line: 0.5.1 puts it under a type's row for a record dragged to the top of its type, and keeps it at the next type's row for the end |
| 20–23 | "I want to change the plan on Saving in general. The original uploaded GEDCOM is always left as-is (unchanged); so any new save is 'Save As' effectively. When saved, it should be 1) the original .ged file name but with a timestamp appended (but the user can rename it like any other file), and 2) a published log of changes to the original one. I'm not sure if the sha256 is needed/warranted - explain to me its purpose. I don't want to overburden the user with multiple files they'll never need or use; if they have the original file unchanged, then that can simplify how we track the changes (basically the log is the changes, the new file is just the new file - no baggage/history other than what's required)." | P5 and P6, below; 0.6 |
| 24 | "Don't understand what this is supposed to do." | Step 24 proved that a save with the stamps unticked, after the edit was undone, wrote the original file back byte for byte (its sha256 again). It goes with P5: nothing is written over any more |
| — | "Clean up the top bar with a Settings button which expands into a dropdown, with the smaller buttons (Theme, Indent, etc.) all living there." | 0.5.1: Settings, a menu under its button: Theme as three choices, Indent and its width, Bold surnames |
| — | "Remove the Open GEDCOM from the header entirely - it's already in the middle of the center pane. Change it to Upload GEDCOM and have it just open the upload frame on the computer like most things do." | 0.5.1: no Open in the top bar; **Upload GEDCOM** in the empty frame and **Upload another GEDCOM…** among the facts, both opening the computer's file dialog. "Upload" is his word for the screen; nothing is uploaded anywhere (I5), and the README says so. 0.5.2: **Open GEDCOM** and **Open another GEDCOM…** again, at his word, once the page was on the web, where "upload" reads as the file going somewhere; `privacy.html` says it goes nowhere |
| — | "Tags - give me some sort of icon (two arrows in a circle?) that, when pressed, cycles through different orderings of the tags - most to least, alphabetical, etc. Avoid naming them anywhere visible - if they need explanation I will let you know." | 0.5.1: a button with two arrows in a circle above the list; by count, by count rising, A–Z, Z–A; no name anywhere visible; remembered |
| — | "I tried to delete line 8 and everything went haywire (see last screenshot)." | The screenshot shows every row's text slid left under the number column — the tails "/ Trees" and "Parkway" are the ends of lines 3, 4 and 12 — which is 3.1's sideways scroll after a two-finger swipe, with nothing on screen saying so. Deleting line 8 (a leaf, `3 _ENV`) on his copy in headless Chrome removes it, strikes it, and leaves the lines at their left edge. 0.5.1: the number column casts a shade on the lines going under it while they are scrolled sideways, and Home, a jump and Top bring them back to the left edge. P7 asks whether sideways scrolling should stay at all |

**P4 — Edit as a text editor** (step 18). Three ways; the recommendation first.

| P4 | Variant | Worked example |
|---|---|---|
| **E1** — recommended | **A block edited as text, in place.** With Edit on, Enter (or a double-click) on a line with lines under it opens the whole block — the line and everything under it; a record from its `0` line — as one box of text in the main frame, as tall as the block; lines are retyped, added, removed or pasted in bulk; ⌘Enter keeps it, Esc drops it, a click away keeps it. One act: the block's lines replaced as one step; a line left as it was keeps its own bytes, so Changes still shows each line changed, added or removed. A line with no lines under it opens as today, one line | Select `0 @I42@ INDI`, Enter: a box holding the person's 47 lines. Retype the NAME, delete the two `_APID` lines, paste three lines of a new `BIRT`. ⌘Enter: Changes reads 1 changed · 2 removed · 3 added, each line marked in its row |
| **E2** | **The whole file as text.** Edit on turns the main frame into one text box holding every line; retype anywhere; Enter is a new line; ⌘Enter keeps all of it. The document is rebuilt from the text as one act | The raw export is 8 MB of text in one box: Chrome lays it out in seconds and lags on every keystroke; the virtual grid, the folds, the type rows, the marks and the line numbers all go while Edit is on. Not for a file of this size |
| **E3** | **Every row editable in place.** Each row of the grid is its own box; Enter at a row's end makes a new row, ⌫ at its start joins it to the one above; what is typed lands line by line as today | Reads as an editor; is an editor only row by row. Pasting ten lines into one row still refuses (a line holds no line break), and a block cannot be retyped as one text |

**P5 — Saving, nothing written over** (steps 20–24). The original is never written; every save is a dated copy beside it, and a log of the changes to the original. Three shapes; the recommendation first.

| P5 | Variant | Worked example |
|---|---|---|
| **S1** — recommended | **Save opens the computer's Save dialog** with the dated name offered — `RAW.2026-09-30T154200.ged`, in the original's folder — and the copy may be renamed there, or in Finder after. The log, `RAW.ged.edits.log`, is appended beside the original, through the folder asked for once, the first time (as today). One button, **Save**; no backup folder; no file is ever written over | Save, keep the name, Save: the copy is written and read back; one block is appended to the log: when, the note, the original's sha256 and the copy's, the copy's name, then every change from the original to the copy — the lines before and after, moves by what moved. Save again later: another dated copy, another block, each block complete from the original |
| **S2** | **Save writes the dated copy at once**, no dialog, into the original's folder through the one folder grant; the copy is renamed in Finder when wanted; the log as S1 | Save: "Saved as RAW.2026-09-30T154200.ged, beside the file." Nothing to click through; nothing to name |
| **S3** | **No folder grant at all**: Save opens the Save dialog for the copy, then a second one for the log block (its own file, `RAW.2026-09-30T154200.edits.log`) | Two dialogs per save; one log file per copy, never appended to; the original's folder is never asked for |

What stays under every shape: the change stamps (F1, V1) on the records changed, in the copy only; the copy read back and compared after writing; Changes counted from the original (what the log will say), ● and Save meaning "changed since the last copy".

**P6 — the sha256.** Its purpose: a fingerprint of a file's exact bytes — change one character and it changes completely. Today it does three jobs: (a) the backup must match the original before the original is written over; (b) the file on disk must still be the file that was opened, before it is written over; (c) the copy or file written must read back as written. With nothing written over, (a) and (b) go. (c) stays and costs nothing. In the log, the original's sha256 names which file the changes were made to — the one line that lets anyone later confirm the log belongs to that file — and the copy's names what came out.

| P6 | Keep it where | Worked example |
|---|---|---|
| **H1** — recommended | **In the log, and among the facts on demand** (as now: "sha256", a click shows it, hover says what it is). Nowhere else on the screen | `shasum -a 256 RAW.ged` in Terminal gives `<sha256>`; the log's `before` line says the same; a copy that was renamed is still known by its `after` line |
| **H2** | **In the log only** | the facts line loses its last item; the log keeps both lines |
| **H3** | **Nowhere** | the copy is read back and compared all the same, silently; the log names files by name and time only |

**P7 — sideways scrolling** (3.1; "everything went haywire").

| P7 | Variant | Worked example |
|---|---|---|
| **K1** — recommended | **Keep it, with the cue** (0.5.1): the number column casts a shade on the lines going under it, and Home, a jump and Top bring the lines back to the left edge | a two-finger swipe to the right slides the lines under the numbers, which now visibly cast a shadow; ⌘L 1 or ↑ Top brings them back |
| **K2** | **Drop it**: a row shows its first 2,000 characters and stops at the frame's edge (as before 0.5), with its "… 81,797 more"; the right frame shows the whole value, a `_META` drawn as it reads | the lines never move sideways; a `CONC` line of 248 characters is read whole in the right frame, not in the main frame |
| **K3** | **Wrap** long lines in the main frame (section 18's "wrapping long lines in the grid") | every row the height of its line; the virtual grid's one-height-per-row goes, and with it the fast scrollbar drag |

0.5.1 is built, gated and tagged (2026-09-30). 0.6 is the editor (P4), the saving (P5, P6) and P7's answer, after his picks; the phase-5 walk's steps 20–24 and 33–37 are then rewritten for it.

0.5.2 (2026-10-08) put the page on the web, at the owner's word. He bought gedcom-viewer.net at Name.com and ruled, by number: the repository public, on GitHub (`bunahu/gedcom-viewer`), its history rewritten first — the real file's name became `RAW.ged` and `CLEANED.ged` throughout this brief, and every commit's and tag's identity his GitHub handle; GitHub Pages, at the bare name, `www` redirecting to it; the nameservers staying at Name.com (four A and four AAAA records at the bare name, `www` a CNAME to `bunahu.github.io`); a version live when its tag is pushed, after the tests, the page's files alone — `.github/workflows/publish.yml`; no email at the domain for now, and a way to send feedback, errors and diagnostics wanted later; **Open GEDCOM** again; the icon (three lines of a file, each a level deeper, on the gold), a description for search engines, `privacy.html` (how the page treats a file, in full, linked under the button; no script), and a content-security policy in both pages, which has the browser refuse every connection and every script, image and font but the pages' own — `tests/page.test.js` reads it; the license the GNU GPL, version 3 or later, with his handle as the holder (picked 2026-10-08; `LICENSE`, served beside the page). The walk found the one allowance the policy needs: a malformed `_META` in the cleaned file has Chrome build its XML parse-error block, styled inline, inside the inert document, and a strict `style-src` logged that to the console; so `index.html` lets styles be inline, which opens no way out of the page.

The walk also met Chrome 154 headless once more, at the drags: once a few dozen synthetic clicks have gone into a tab, a drag of a row let go with a synthetic Escape leaves the renderer, a moment later, answering nothing — not even the debugger. Sixty harmless clicks first: a hang every time; none first: ten rounds clean; nothing in the page's drag changes it (pointer capture, the selection, the dimming, the rows' layer and its width, the GPU, each switched off in turn). So the drags are a part of their own, walked in a fresh Chrome, with the drag let go with Escape last; a part whose page stops answering is walked once more, and says where the page was, by the debugger, instead of waiting (`tools/chrome.js`, `press`).

**P8 — Report a problem** (the owner's ask of 2026-10-08, after 0.5.2: a button that builds a
diagnostic the user reads, and may change or cut, before it goes anywhere; the original never goes).
Three ways; the recommendation first. Under every way the page sends nothing: what leaves is what
the user copies or saves, and only that.

| P8 | Variant | Worked example |
|---|---|---|
| **R1** — recommended | **Copy, with a checksum.** Settings → **Report a problem…** opens a dialog: a line saying that nothing is sent and that the box holds counts and codes only, never a line of the file; the report in a box, as text, to read, change or cut; a second box, **What happened**, the user's own words, with a line beside it saying so; **Copy**. The report's last line is a checksum of every line above it (the first eight characters of their sha256), so a report changed after it was built no longer matches, and `tools/report-check.js` says so; the original is kept nowhere. Under the boxes, in words: paste it into a new issue at github.com/bunahu/gedcom-viewer/issues, as the privacy page says — words, not a link, since the page holds no web address (section 14, No network) | The box reads `GEDCOM Viewer 0.5.3 — a problem report. Counts and codes only; no line of the file.` · `Where: gedcom-viewer.net · Chrome 154 · macOS` · `File: 4.2 MB · 123,456 lines · UTF-8, header says UTF-8 · GEDCOM 5.5.1 · exported by Ancestry.com Family Trees 2025.08 · sha256 7f3a9c0d2e1b…` · `Lines: LF 123,000 · CR LF 456 · longest 2,048 characters · CONC 3,498 · CONT 1,605` · `Records: INDI 2,345 · OBJE 1,234 · FAM 1,098 · SOUR 765 · REPO 7` · `Checks: E7 2 (lines 18,204 and 91,377) · N1 3 · N3 9 · N4 93` · `Edit: off · unsaved changes: 0` · `What happened:` and the user's words · `checksum: 1a2b3c4d`. The user cuts the browser line, types what happened, presses Copy: the clipboard holds the box as it reads, and the checksum no longer matches the lines above it, which is all the report says about editing. Cut the checksum too, and the report is simply unverified — at worst, useless |
| **R2** | **Save as a file.** The same dialog, but **Save report** writes `gedcom-viewer-report.<YYYY-MM-DDTHHMMSS>.txt` the way Save a copy writes its copy — Chrome's Save dialog, a download elsewhere — to attach to the issue | The same text, as a file beside the GEDCOM; the reporter attaches it to the issue instead of pasting. Two steps where R1 has one, and a file to find afterwards |
| **R3** | **One click to a pre-filled issue.** A button opens GitHub's new-issue page with the report in the address | One click and the issue is ready; but the report travels in a web address, the page gains an outbound link, and the No-network gate must learn an exception. Not recommended |

What stays under every way: the report is built in `core.js`, by a function the tests hold to its
word — a fixture's every line is searched for in the report, and none is found; the checksum rule is
the one `tools/report-check.js` applies — and the walk gains a step: open the dialog, cut a line,
Copy, and the checksum no longer matches. Never the file's name or folder (the name is a family's
name), never a value, never an id; the browser's name is one line the user may cut. The privacy
page's "Reporting a problem" says the button exists and what it does. Assumed, unless he says
otherwise: the entry lives in Settings, as the smaller controls do; this is 0.5.3, tagged when his
walk of it passes.

On "is anyone using this?", asked the same day: GitHub counts visits to the repository (Insights →
Traffic: views, unique visitors, clones, referrers, for 14 days) and nothing about the site at the
domain, which GitHub Pages does not count. That is all he wants for now; nothing is added to the
page.

R1 picked and built the same day, as 0.5.3: `core.js` writes the report (`report`, `withChecksum`,
`reportChecksumParts`), `ui.js` the dialog under Settings (Help · **Report a problem…**),
`tools/report-check.js` reads one back, `tests/report.test.js` holds it to its word, and the walk's
third-round part gained the step (140 steps pass; 148 tests). Tagged and put on the site the same
day, at his word, ahead of his walk.

### Session 3's prompt

```
Read BUILD-BRIEF.md in this folder, all of it, before anything else; section 17 is how I work,
and section 19 says where things stand (v0.4.1, and my third round).

Phase 0: PASS, all eight lines
F1, change stamps: V1
F2, commits: C1
P2, copy buttons: B
P3, selecting a link: L1
3.4, dragging: 3.4a (siblings and sections) in 0.5; 3.4b held

This is session 3: build the third round (v0.5), then walk me through it. My walk passed steps
1–17 and stopped at 18, where ⌘E opened the Claude extension's panel instead of Edit (3.11);
steps 18–40 are not walked yet, and I'll walk them on 0.5. Tell me your plan in a few lines,
then start.
```

### The readiness review (2026-10-08): the punch list, triaged, and the rulings so far

A separate Claude session, outside this folder, reviewed 0.5.2 in code and 0.5.3 on the site for
privacy, usability, accessibility, AI tells and launch, and wrote a punch list of 21 items. The
review itself stays outside the repository: it names people and a private canvas. Its punch list
was checked here against the code, item by item, before anything was built.

Checked and true: the tab title carries the file's name (`ui.js` updateBar); Save asks for the
folder that directly holds the file, which Chrome refuses to grant for Downloads, Desktop,
Documents and the home folder; spell check is off only in the line editor and the report box;
`style.css` has no media query at all; Save is disabled without the pickers, and a download clears
nothing, so the dot stays and leaving warns; the theme ignores the system; 14, 13 and 12.5 px type
and 22 px rows; no h1, and the lines a div with an aria-label; browser errors raw in five places;
no GitHub release exists, only tags. The contrast ratios were not re-measured here.

What the review could not see from outside:

- Item 1, ask for the file rather than the folder, meets I6: the backup and the log are written
  through the folder handle (10.2 steps 7 and 8, 10.5). A grant on the file alone can write, read
  back and check the disk, but has no folder to put a backup in. Answered below: P5 replaces the write itself.
- Item 3 has two triggers, not one: the focus, and the caret placed at the end of the value, each
  of which scrolls the grid sideways. The fix keeps `scrollLeft` across both.
- Item 5's sample file cannot be fetched (I5; `connect-src 'none'`; the No-network gate). It ships
  as one of the page's own script files, named in `publish.yml` and `tests/page.test.js`.
- Every new setting is named on `privacy.html`'s list of what the page stores: items 1, 2, 12, 17.
- Item 16's mailto fails `tests/page.test.js` ("links out go to GitHub alone") until the test
  allows it.
- Item 6: the dated copy name stays (10.1), since a copy named as the original would land on it;
  the screen says where the copy went; after a copy is written, leaving warns only for changes
  made since, in every browser.
- Item 11 is the owner's writing: a session lists the most-seen strings, he rewrites them, a
  session applies them and updates the tests. After items 13 and 21, which change labels.
- Item 20 needs a release per tag, and `contents: write` in `publish.yml`.
- The policy's `'unsafe-inline'` for styles stays; `tests/page.test.js` says why. `privacy.html`
  gains a half-sentence on it.

The order, as releases, one tag per push, each tagged at the owner's word after his walk:

| Release | Items | Built by |
|---|---|---|
| 0.5.4 | 3 the scroll; 2 the title, with a setting; 9 spell check off and `translate="no"`; 4 the privacy wording (P4, P5) and the half-sentence; the README's local path; from 1, a plain notice when Chrome refuses a folder | Sonnet |
| 0.5.5 | 7 contrast; 12 type, with a text-size setting; 15's row height and fold area; 17 System theme and Sunset renamed; reduced motion and forced colors from 19; the policy's style allowance dropped; `translate="no"` on the file's name, the facts and the counts | Sonnet |
| 0.5.6 | P5 (S3, the log cut) and P6 (the facts line alone): the original never written, every save a dated copy; absorbs 1 and 6; section 10 rewritten for it | Opus |
| 0.6 | 5 the first screen with the sample; 8 drawers; 13 Viewing and Editing; 21 | Opus |
| alongside | 10 the README; 11 the strings; 16 the email | the owner writes, Sonnet applies |
| later | 14 tag meanings; Move up and down from 15; treegrid and h1 from 19; 20 hashes; 18 the default look | — |

Rulings (2026-10-08): the sample file is baked in; the dated copy names are kept; the
Co-Authored-By trailers are kept, and the README's disclosure section will say so; Parchment stays
the default for now, to be looked at again after the contrast work; the email will be a dedicated
address, to come; a GitHub release per tag, with the SHA-256 of each page file in its notes: yes
(item 20, when it is built).

Saving, the same day: item 1 was framed against the save in place, which P5 (above, 2026-09-30)
already replaces: the original is never written, every save a dated copy. Under P5 there is no
backup, so I6 falls away with the write it guarded, and no folder is asked for. He picked **S3**:
Save opens the computer's Save dialog with the dated name; the log is offered after, as a second
dialog, and may be skipped; in a browser without the pickers the same two are downloads. Items 1
and 6 of the punch list are absorbed by it; 0.5.6 builds P5 (S3) and P6 (H1), and rewrites
section 10. The log is cut, the same day: the note typed at save time already goes into each changed record's CHAN NOTE (10.4), so the copy carries when and why and a comparison of the two files carries what; the Changes tab's copy button stands in (10.3).

The policy's `'unsafe-inline'` for styles: dropped in 0.5.5 after an experiment, at his word. A
`_META` whose XML does not parse gets nothing drawn, so Chrome's refusal of the style on its own
error block costs one line in the console; the page then writes a line of its own beside it,
saying what happened and that nothing was sent. `tests/page.test.js` loses its one allowance,
and `privacy.html` the half-sentence of 0.5.4. Built: the experiment showed a second source of
refusals, the style attributes and elements in the HTML of a `_META` that does parse (2 on the walk's
sample, 322 on a story of forty styled spans), so `core.js` gained `stripStyles`, which takes them out
of the text before the browser reads it; the allowlist dropped them anyway, and the drawn result
hashes the same. 0 refusals after; the console line for a broken `_META` stays.

0.5.4 was built the same day (Sonnet; 155 tests; the walk's parts rest, editing, edges, third,
scroll, drags, save and copy at 118 steps), walked by him, and tagged.

0.5.5 was built the same day (Sonnet; 183 tests, among them `tests/contrast.test.js`, which measures
the palette's pairs and fails on the old values; the walk at 139 steps): every pair in the review's
table at its ratio in all three looks, three of the review's suggested values corrected by
measurement; 16, 15 and 14 px type and 24 px rows, with Text (Normal or Larger); System as the theme
for a new visitor, and Sunset renamed Dusk at the owner's pick; reduced motion and forced colours;
`'unsafe-inline'` out of the policy; `translate="no"` on the file's name, the facts and the counts;
feedback@gedcom-viewer.net beside the issue route (item 16); the empty screen's line as he wrote it.
Left measured and open: the gold wash behind a selected tab or line leaves text there under 4.5 to 1
in Dusk and Dark, and the sepia of links and the title under it in all three; a lighter wash changes
the look, so it waits for item 18. Walked by him, and tagged.

### P5 built as 0.5.6: saving rewritten (2026-10-08)

Section 10 is rewritten in place for S3 with the log cut; the old text stands in this file's
history. Restated with it: I6 and I7 (section 5), R2's log (section 2), three rows and two new ones
in section 4, `save.js` in section 12, its tests in section 14, the walk's steps 20 to 24 and 33 to
37 above, and section 18's note on staying on the original. What goes: the folder grant and
`grantFolder`, the 0.5.4 notice for a refused folder, Save a copy and ⇧⌘S, `gedcom-viewer-history/`
and the `.bak`, the log and its block, `save.js`'s save-in-place and copy pipelines and their tests,
the walk's `save` and `copy` parts, the README's Save paragraphs and table, privacy.html's Saving
bullet. What comes: one **Save** (⌘S) through the computer's Save dialog with the dated name
offered, the original's own file refused, the copy read back; **Download a copy** in a browser
without the pickers, and a download counted as the last copy; the Changes tab's **copy** button and
its text. 0.5.6 is Opus work, from section 10 and this entry; tagged after his walk of it.
