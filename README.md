# GEDCOM Viewer

One web page, at gedcom-viewer.net or opened from disk in Chrome, that opens a GEDCOM file, shows it readably, checks it
for obviously malformed lines, counts what it holds, and lets clean hand edits be made and saved
as a dated copy beside the original, which is never written. It is standalone: one
page, no server, no account. Nothing is installed, and nothing leaves the machine.
[BUILD-BRIEF.md](BUILD-BRIEF.md) is the design log, written with Claude Code as the work went; see
[How this was made](#how-this-was-made).

| Version | What it is |
|---|---|
| 0.1 | the viewer: phases 1 and 2 (read, check, count, show) |
| 0.2 | phase 3: `core.js` can edit, undo, find what changed, stamp, and make the bytes of a save |
| 0.3 | phase 4: editing and saving on the page; Open GEDCOM; the facts line; blocks that open and shut |
| 0.4 | the second round of fixes: the name GEDCOM Viewer; Edit on and off, removed lines shown and restored; a row between record types, each type shut at once; Go to Line… takes a range; the facts behind the file's name, each going to its line; Add inside and Add after |
| 0.4.1 | the brief and the README only: the walk brought to 0.4, the page opened by command, and the third round written, to build as 0.5 |
| 0.5 | the third round: the side frames hidden by their tabs and the lines scrolled sideways; a copy button on every box of text; a `_META` drawn as it reads; blocks, records and sections dragged among their siblings; Collapse all / Expand all; what each check means; Back over the lines; Bold surnames; a link selected whole; a clipped row's count; E for Edit |
| 0.5.1 | the first half of the fourth round, from the walk of 0.5: the side frames hidden by icons in the top bar, eased; a strip above the lines with Top, Back and Collapse all, which shuts the types too; Settings holding Theme, Indent and Bold surnames; Upload GEDCOM; the Tags list's order stepped by a button; a change dot in the mark column; the right frame following the typing; a `_META` under the names the file gives its parts; a shade when the lines are scrolled sideways, and a jump bringing them back; the gold line under a type's row. The editor and the saving of that round come later |
| 0.5.2 | on the web: gedcom-viewer.net serves the page, published from a version tag once the tests pass, the page's files alone; Open GEDCOM again, since online "upload" says the file goes somewhere, and it does not; the icon; a description for search engines; `privacy.html`, how the page treats a file, linked under the button; a content-security policy in both pages, which has the browser refuse every connection; the repository public, its history rewritten first, so that the real file's name became `RAW.ged` and the commits carry my GitHub handle |
| 0.5.3 | Report a problem, in Settings: a report of counts and codes, never a line of the file, in a box to read, change or cut; What happened, in your own words; Copy. The page sends nothing, and the original is kept nowhere. Its last line is a checksum, so a changed report reads as changed; `tools/report-check.js` reads one back |
| 0.5.4 | six small fixes: the lines no longer scroll sideways when one opens for typing; the tab's title no longer holds the file's name, unless File name in the tab is turned on in Settings; spell check and page translation are off where the file's words show; the privacy page says plainly what the page sends, what it cannot control, and how to check it yourself; a notice that says why Chrome may refuse a folder for Save, and what to do; the README no longer names a path on one disk |
| 0.5.5 | easier to read: text and borders reach the contrast the web's accessibility guidelines ask for (WCAG 2.2 AA) in all three looks; larger type (16 px) and rows (24 px), and a Text choice in Settings, Normal or Larger; a System choice for the theme, which follows the computer's light or dark and is what a new visitor gets, and Sunset is now called Dusk (a choice already kept still works); feedback@gedcom-viewer.net, an address that needs no GitHub account, beside the issue route for a report or a question; the line under Open GEDCOM now reads "The file does not leave your computer.", with a Privacy Policy link; less motion when the computer asks for it, and the system's own colors when it forces them; fold arrows at least 24 by 24 pixels to click; the content-security policy no longer allows inline styles; page translation is off for the file's name, facts and counts |
| 0.5.6 | saving rewritten, so the original is never written: Save, the one button (⌘S), writes a dated copy through the computer's own Save dialog, which opens beside the original; no folder is asked for, and there is no backup and no log. The copy is read back once written. Picking the original itself in the Save dialog is refused, and the original put back as it was if the browser emptied it. In a browser without that dialog, Save is Download a copy. Changes count from the original, and the Changes tab has a copy button that puts them on the clipboard as text. The dot and Save show only while the lines hold what no file holds yet, the original's and every copy's lines aside, and so does the warning on leaving. A change stamp's note says what changed in its record, unless one is typed; the Save dialog shows each stamp's lines as they will be written; the header can carry the date of the save. Save a copy and ⇧⌘S are gone |
| 1.0 | when my own walk of the whole page passes |

The version shows beside the name in the top bar, and each is a git tag (`git tag -n1` lists them).
Before 0.4 it was called gedview; the code's own names (`GedCore`, the files' headers' history)
keep traces of that.

| The frames | What is in them |
|---|---|
| the top bar | an icon that hides the left bar; the name; the file's name (a click shows its facts under it); Edit, Undo, Redo, Save; Go to Line…; Settings; an icon that hides the right frame |
| the counts bar | People 2,345, Families, and so on; a click lists that type in Records |
| the left bar | Records, Checks, Changes, Search and Tags |
| the main frame | a strip (**↑ Top**, **← Back to …** while there is somewhere to go back to, **Collapse all** or **Expand all**) and the lines under it |
| the right frame | the selected line: what can be done to it (with Edit on), its value, its record, what points at it, its findings; a `_META` drawn as it reads; what a check means |

## Open it

- **On the web:** [gedcom-viewer.net](https://gedcom-viewer.net), the same page, served by GitHub
  Pages from this repository's last tagged version; nothing is installed, and the file still never
  leaves the computer. Or, from disk:
- **In Chrome:** from wherever the folder was put, run `open -a "Google Chrome" index.html` in
  Terminal, inside the folder, or, in Chrome, File → Open File… and pick `index.html`.
  Double-clicking the file opens the default browser instead. Keep `index.html` in this folder: it loads `style.css`, `core.js`, `save.js` and `ui.js`
  from beside it, and anywhere else it opens as a bare page.
- Then **Open GEDCOM**, or drop a `.ged` file anywhere on the page. With a file open, another is
  opened with ⌘O, by dropping it, or with **Open another GEDCOM…** among the file's facts.
- Other browsers can read, check and edit a file too. In Chrome and Edge, Save opens the computer's
  Save dialog; in Safari and Firefox the same button reads Download a copy, and the dated copy is a download.

| Key | Does |
|---|---|
| ↑ ↓, Page Up, Page Down, Home, End | move the selected line |
| ← and → | ← shuts the selected line's block, or goes up to the line above it; → opens it, or goes down into it |
| ⌥-click on ▸ or ▾ | open or shut every block at that level (on a level 0: every record) |
| a click on a type's row (▾ INDI People 2,345) | shut or open every record of that type; with ⌥, every type |
| E | Edit on or off; the Edit button does the same. A bare letter rather than ⌘E, so that no browser extension's shortcut gets in the way |
| Enter, or a double-click | with Edit on: type over the selected line; Enter keeps it, Esc drops it, clicking away keeps it. With Edit off, a double-click highlights a word to copy, and a web address whole |
| ⌥ and a double-click on a pointer | selects the pointer whole, `@` to `@`, and nothing jumps; ⌥ and a drag selects across it. A plain click still jumps |
| a press on a row, moved | with Edit on: drags the line's block among its siblings (a record by its `0` line, every record of a type by its type row); a gold line shows where it would land; release to move, Esc to let go |
| ⌫ | with Edit on: delete the selected line and the lines under it (asks first when there are any) |
| ⌘Z, ⇧⌘Z | Undo, Redo, one act each |
| ⌘S | Save, as a dated copy; Download a copy in a browser without the Save dialog |
| ⌘O | open another file |
| ⌘F | Search |
| ⌘L | Go to Line…: a line number, or two (105-117) for those lines alone, until × |
| Esc | leave a box for the lines; let go of a drag |
| a two-finger swipe, or ⇧ and the wheel, over the lines | scrolls them sideways, to the end of the longest line; the line numbers stay put and cast a shade on what goes under them. Home, a jump and Top bring the lines back to their left edge |

The strip above the lines holds **↑ Top** (line 1, as a jump, so Back returns), **← Back to …**
while there is somewhere to go back to, and **Collapse all**, which shuts every record to its
first line and every type to its row; it then reads **Expand all**, which opens every block and
every type. **Settings**, in the top bar, holds the theme (System, Light, Dusk or Dark), the text size (Normal or
Larger), Indent and its width,
**Report a problem…** (below), **Bold surnames**, which shows the part of a name between slashes in bold, without
the slashes, wherever a record is named (Records, the right frame, the dialogs) and never in a
line as written, and **File name in the tab**, off unless turned on, which puts the file's name in the
tab's title (the browser keeps titles in its history, which is why it is off). The two icons at the ends of the top bar hide the left bar and the right frame,
and bring them back. In **Checks**, a click on a check's title says in the right frame what it
means and what is usually done; the ▸ ▾ at its left opens and shuts its lines. In **Tags**, the
button above the list steps through its orders: by count, by count rising, A–Z, Z–A. Every box
of text in the right frame has a **copy** button at its top right. A row longer than 2,000
characters ends with **… 81,797 more**, the count not shown; the right frame shows it whole. A
`_META` (Ancestry's Find a Grave block) is drawn as it reads, above Joined, each part under the
name the file gives it: `content` in web formatting, `transcription`, `personas` as a table,
`cemetery`, `record_source_gid`, read only, with nothing loaded from anywhere. **Open
GEDCOM** opens the computer's own file dialog; nothing is uploaded anywhere: the file is read
here, and nothing leaves the machine; `privacy.html`, linked under the button, says so in full.

**System**, the theme a new visitor gets, is Light or Dark as the computer has it, and follows the computer while
the page is open. **Larger** makes the type and every row taller together. When the computer asks for less
motion, the side frames open and shut at once. When it forces its own colors (Windows contrast themes), the
selected line, a pressed button or tab, the ring round a control, the gold line of a drag and the dots of a
change and of a finding are drawn in the system's colors.

Remembered between visits, in the browser: Indent on or off and its width, the theme, the text size, the two
panel widths and whether each side frame is hidden, Bold surnames, File name in the tab, the Tags list's order,
whether the change stamps are ticked, whether the date is noted in the header, and whether the file's facts show. Never a file's name,
content or place. Edit is off whenever a file opens.

## Edit and save

**Edit**, in the top bar, turns editing on and off; it is off whenever a file opens, so a file is
first read. With it on, select a line and press Enter (or double-click it): its row becomes a box
holding the whole line: level, tag and value. The right frame's buttons add a line inside the
selected line's block (**Add inside**: directly under it, one level deeper), add one after its
block (**Add after**, at its level), or delete the line or its whole record. Deleting a record
first shows what goes: the record, and each line elsewhere that points at it, ticked; untick what
should stay.

With Edit on, a line removed since the file was opened stays where it was, struck through in red, under
its line number in the original; click it, and the right frame offers **Restore**, which puts back it and
the removed lines beside it. With Edit off the lines are the file as it will be saved, and a red
rule marks where lines were removed.

**Moving.** With Edit on, press on a row and move a few pixels: the line's block (the line and
everything under it) follows; a `0` line takes its whole record, and a type row (▾ SOUR Sources
842) every record of that type. What would move dims, and a gold line shows where it would land:
only at a sibling's edge, so no line's level or parent changes: a fact among its person's facts,
a record among records, a type among types. `HEAD` stays first, `TRLR` last, the submitter record
directly after `HEAD` below version 7, and a `CONC` or `CONT` line never leaves its line. Release
to move; Esc, or a release where no gold line shows, moves nothing. One Undo brings it back. Two
lines of one tag under one parent, two `1 NAME`, may be reordered: the first is the one the
standard reads as preferred, and the Save dialog says so. A moved line is written from its own
bytes, so a moved block changes the file's sha256 and not its size.

While a line is typed, the right frame already shows it as typed. Until it is saved, an edit
shows:

| Where | Changed line | Added line | Removed lines | Moved lines |
|---|---|---|---|---|
| its row | tinted, a bar at its left edge, a dot in the mark column | tinted another colour, a bar, a dot | Edit on: struck through, in red; Edit off: a red rule where they were | tinted a third colour, a bar, a dot; Edit on: a rule where they were taken from |
| the right frame | **Was**, and the line as in the original | **Added** | **Removed**, and **Restore** | **Moved**, and the line's number in the original |
| Changes | the line, before → after | the line | the lines | what moved (a block by its tag, a record, a type and its count) and how many lines; never their text |
| a shut block | its count of lines takes the colour when it holds a change | | |
| the top bar | ● after the file's name; Save turns on | | |
| the Save dialog | every change, and every change stamp, before anything is written | | |

**Save** (⌘S) never writes over the file that was opened. It writes a new file, a dated copy,
through the computer's own Save dialog, which opens beside the original and offers
`<name>.<YYYY-MM-DDTHHMMSS>.ged`; the name can be changed there, or the file renamed after. No
folder is asked for. A copy opened and saved again has its timestamp replaced, not added to. The
copy is read back and compared once it is written. Then the ● goes and Save turns off: both show
only while the lines hold what no file holds yet, so undoing back to the original, or to a copy's
lines, turns them off too. **Changes** goes on counting from the original, and the facts still name it.

| Written | Where |
|---|---|
| the copy, read back and compared | where it is saved in the Save dialog: beside the original, unless another place is picked |
| nothing else: no backup and no log | the original is the backup, and stays as it was |

If the original itself is picked in the Save dialog, nothing is saved into it: "That is the
original. GEDCOM Viewer never writes over it. Pick another name." Chrome empties a file the moment
it is picked there, before the page can refuse it, so GEDCOM Viewer puts the original back as it
was, byte for byte, and says so.

In a browser without the Save dialog (Safari, Firefox), the button reads **Download a copy**, and
⌘S does the same: the copy goes wherever the browser keeps downloads, under the same dated name. A
download counts as the last copy, so leaving the page warns only for changes made since.

**Add change stamps**, ticked unless unticked, gives each changed record a `1 CHAN` with the date
and time of the save and a `2 NOTE`: what is typed in the Note box, or, left empty, what changed in
that record, by tag (`Changed: NAME, SEX. Added: BIRT. Removed: FAMS`). Under it the dialog lists
each record's lines as they will be written; unticked, they and the Note box are hidden. A record
stamped for an earlier copy is stamped again only when it changes again. **Note the date in the
header**, ticked unless unticked, writes `Last updated: 9 OCT 2026 09:33:45`, the stamps' date and
time, as a `NOTE` under `HEAD`, or a `CONT` of `HEAD`'s own `NOTE` when it has one, and sets that
line anew at the next save instead of adding another; the header's own `DATE` is never touched.
Both are one act: one Undo takes them back. **Changes** has a **copy** button at its top: it puts
the list of changes on the clipboard as text, opening with the original's name and sha256, and
writes it nowhere. `diff <original> <copy>` in Terminal shows every line that differs. The list
holds what the file holds, living people included, and belongs beside the file, never in a
repository.

**The file's facts** (GEDCOM version, encoding, exported and by what, size, lines, sha256)
show under its name when the name is clicked. Each that comes from a line of the header goes to that
line when clicked.

The **sha256** among them is a fingerprint of the file's exact bytes, as it was opened:
change one character and it changes completely; two files with the same sha256 are the same, byte
for byte. `shasum -a 256 <file>` in Terminal gives the same one, for the original or for a copy.

## Report a problem

**Settings → Report a problem…** writes a report of counts and codes (the file's size, lines,
encoding, the header's program, record counts, check findings by code and line number, the
browser, Edit and the unsaved changes, and the first twelve characters of the file's sha256) and
never a line of the file, its name or its folder. It shows in a box to read, change or cut; **What
happened** takes your own words; **Copy** puts the report as it reads, then What happened, on
the clipboard, to paste into a new issue at github.com/bunahu/gedcom-viewer/issues, or into an email to
feedback@gedcom-viewer.net, which needs no GitHub account (an issue is public and an email is not, so
nothing goes into an issue that should not be public). A question can go to that address too. The page sends
nothing, and the original is kept nowhere. The report's last line is a checksum of the lines above
it, so a report changed after it was built reads as changed, on the page and in
`node tools/report-check.js report.txt` (or `pbpaste | node tools/report-check.js`): as built,
changed, or no checksum. The lines after the checksum are yours and are not checked.

## The tests and the gates

Node's own test runner; nothing to install.

```
node --test tests/*.test.js
```

| Gate | Command | Passes when |
|---|---|---|
| Tests | `node --test tests/*.test.js` | all pass; the only skips are the tests that need the public files, when they are absent |
| The real files | `node tools/check-real.js local/RAW.ged local/CLEANED.ged` | every number equals section 3 of the brief, for a file it measured; the probe's numbers for any other; an edit and a record deleted on each, the whole file checked again within 0.3 s, and undone to its sha256 |
| The second opinion | `node tools/compare.js fixtures local/RAW.ged local/CLEANED.ged` | no number differs between `core.js` and `tools/baseline_probe.py` |
| The page | `node tools/walk.js local/RAW.ged local/CLEANED.ged` | every step passes: section 15's read-only walk on each file, and one edit in the page timed and undone; then the rest of the page and its editing on a fictional file; the third round on a fictional file of its own; the look (System and Dusk, the text size, less motion, forced colors, the policy with a `_META` that does not parse) on another; Save through the page, with the computer's Open and Save dialogs stood in for (a dated copy written and read back, the original refused and put back, the Changes text copied); Download a copy in a browser with no pickers. `--only PART` walks one part alone (read-only, rest, editing, edges, third, scroll, drags, save, copy, look) |

The tools print counts, tags, ids, line numbers, lengths and hashes only, never a value, so
they are safe to run over a file that holds living people. The walk drives Google Chrome,
headless, at the page's own `file://` address (`CHROME=path` picks another). It takes no picture
of a real file; `--shots DIR` saves pictures of its fictional file only.

**The public test files are not in git** (their licences; see `fixtures/corpora/MANIFEST.md`).
Fetch the five corpora with `fixtures/corpora/fetch_corpora.sh`. Two more Ancestry-shaped files, in
`fixtures/corpora/sibling-own/`, are not public.

**Real files go in `local/`**, which git ignores, as it ignores every backup and log.

## Publish

The page is served at [gedcom-viewer.net](https://gedcom-viewer.net) by GitHub Pages, from this
repository. A version goes live when its tag is pushed:

```
git tag -a v0.6 -m "0.6: …" && git push origin main v0.6
```

One tag per push: GitHub makes no event for a push of more than three tags at once, so
`git push --tags` after a rewrite publishes nothing, and **Run workflow** on the tag does it by hand.
`.github/workflows/publish.yml` then runs the tests and, when they pass, uploads the page's files
alone (`index.html`, `style.css`, `core.js`, `save.js`, `ui.js`, `privacy.html`, the three
icons and `LICENSE`), never the tests, the tools, the brief, or anything in `local/`. Once the page is live, the same run makes a GitHub release for the tag,
whose notes carry the tag's message and the SHA-256 of each file served, so anyone can download a
file from the site, hash it, and see that it is the one the tag holds, while that release is the
newest. **Run workflow**, on the
Actions tab, publishes what `main` holds, by hand. The domain is registered at Name.com, whose
nameservers answer for it: four A and four AAAA records at the bare name point at GitHub Pages,
and `www` is a CNAME to `bunahu.github.io`, which GitHub redirects to the bare name; HTTPS is
GitHub's, from Let's Encrypt. Served or from disk, the page is the same files, and nothing leaves
the computer either way; `privacy.html` says how.

## Files

| File | Holds |
|---|---|
| `index.html` | the markup; loads `core.js`, `save.js`, then `ui.js`, as classic scripts |
| `style.css` | the whole look, its properties first |
| `core.js` | reading: bytes → encoding → lines → shape → records and pointers → checks → counts → labels; editing: the document, the acts, undo, the net change, the change stamps, the bytes of a save; never touches the page, and runs the same under Node |
| `save.js` | saving: the dated name; Save in the order of the brief's section 10, over the file handle the Save dialog gives; the read-back; the original refused, and put back if the browser emptied it; the Changes text; the bytes a browser with no Save dialog downloads; never touches the page |
| `ui.js` | the page: the main frame, the left bar's panels, the right frame, the dialogs, the keys; the only file that knows the pickers exist |
| `privacy.html` | how the page treats a file, in full; loads `style.css` and the icons, and no script |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | the icon: three lines of a file, each a level deeper, on the palette's gold |
| `.github/workflows/publish.yml` | what puts a version on the web (Publish, above) |
| `tools/report-check.js` | reads a problem report back: as built, changed after it was built, or no checksum |
| `tests/` | the tests; `helpers.js` they share; `fake-handles.js`, in-memory files and folders for `save.js`; `contrast.js`, which reads `style.css` and measures contrast for `contrast.test.js` |
| `fixtures/synthetic/` | small files written for the checks, fictional people only |
| `tools/` | `baseline_probe.py` (the Python second opinion), `check-real.js`, `compare.js`; `walk.js`, which walks the page in headless Chrome, driven by `chrome.js` |
| `spike/` | what the scoping session measured with, and `save-spike.html` (phase 0) |

## Change the look

Every colour, size and width is a custom property in the first blocks of `style.css`; the rules
below them only use them. Change a value there and it changes everywhere it is used.
`tests/contrast.test.js` measures the colours that carry text and the edges of controls, in all three
looks, so a value that falls below its ratio fails there.

**The palette**: three blocks, light (`:root`), `.dusk` and `.dark`.
Settings, Theme, offers System (Light or Dark, as the computer has it), Light, Dusk and Dark; the page puts the class
`dusk` or `dark` on `<html>`. Two colours were retuned for contrast in 0.5.5: `--color-danger` and
`--color-text-muted`. Each block ends with a group of GEDCOM Viewer's own colours that differ by theme.

| Property | Moves |
|---|---|
| `--color-bg` | the page behind everything; the boxes |
| `--color-bg-card` | the top bar, the main frame, the right frame, the lists |
| `--color-bg-sidebar` | the left bar |
| `--color-text` | the text |
| `--color-text-muted` | quiet text: line numbers, levels, the facts line, counts' names (4.5 to 1 against the bars and the boxes, in each look) |
| `--color-border` | lines between parts; the bars you drag. An input's and a button's own edge is `--control-border` |
| `--color-accent` | the gold: the selected line, pressed buttons, the gold line of a drag |
| `--color-accent-hover` | the sepia: the title, links |
| `--color-info` | pointers (links) |
| `--color-warning` | the washes behind a search's match and a special character (a note's own text is `--mark-note`) |
| `--color-danger` | errors (E1–E9) and removed lines, as text and as the dot; a line that did not parse (4.5 to 1 against the bars and the boxes, in each look) |
| the rest (`--color-nonbio`, `--color-success`, `--color-entity-…`, `--color-affiliation`, `--color-ancestor`, `--color-assertion-mark`) | nothing yet; kept so the three blocks stay whole |

**GEDCOM Viewer's own**, drawn from the palette, so each theme carries them.

| Property | Moves |
|---|---|
| `--font-title`, `--font-size-title`, `--title-color` | the name in the top bar: its serif, its size, the colour of GEDCOM |
| `--font-size-file`, `--file-bg`, `--file-border` | the open file's name |
| `--font-body` | the type of everything but the lines (the system's own sans) |
| `--font-grid` | the lines' monospace, in the main frame and the right frame |
| `--font-size-body`, `--font-size-small`, `--font-size-grid` | the three type sizes: 16 px, 14 px and 15 px, and none anywhere is under 14 px. Settings, Text, Larger, sets these and the two row heights again (the `.text-larger` block, below the properties) |
| `--focus-color` | the ring round the control in use: gold in Dusk and Dark, a deep gold in Light; 3 to 1 against the three backgrounds. `--focus-ring` is the whole outline |
| `--control-border` | the edge of an input and of a button; 3 to 1 against the three backgrounds, in each look |
| `--tag-weight` | how strong a tag is |
| `--row-height` | the height of every row in the main frame (24 px); the page reads it each time it lays the rows out, and again when Text changes, keeping the same line in view |
| `--tab-size` | how wide a tab inside a value shows |
| `--row-tint` | a row's tint, which each state below sets; the sticky left part of a row (its number, mark and fold) lays it over the frame's own colour |
| `--row-selected`, `--row-hit`, `--row-hover` | the selected line; a search's lines; the line under the pointer |
| `--line-number-color`, `--level-color`, `--tag-color`, `--value-color` | the parts of a line |
| `--id-color` | a record's id, such as @I1@; set for each look, 4.5 to 1 against the lines' background |
| `--pointer-color` | a pointer value |
| `--raw-color` | a line that did not parse, shown as written |
| `--match-bg` | the text a search found |
| `--special-bg` | the mark for a control or line-break character inside a value (NEL, LS, ␋ …) |
| `--mark-error`, `--mark-size` | the dot beside a line with a finding; an error's count and code |
| `--mark-note` | a note's dot, count and code; set for each look, 4.5 to 1 against the bars and the boxes |
| `--fold-color`, `--fold-size`, `--fold-hit` | the ▸ ▾ that shut and open a block; the least its click area is, each way (24 px) |
| `--hidden-bg` | the count of lines a shut block hides |
| `--section-bg` | the row between two record types |
| `--mark-changed`, `--mark-added`, `--mark-removed`, `--mark-moved` | what is not yet saved: a changed line, an added one, the rule where lines were removed, a moved line and the rule where it was taken from; the ● in the bar |
| `--mark-bar` | the width of the bar at the left of a changed, added or moved row |
| `--row-changed`, `--row-added`, `--row-removed`, `--row-moved` | the tint of a changed row, an added row, a removed one (Edit on), a moved one |
| `--drop-line`, `--drop-line-width`, `--drag-dim` | the gold line where a dragged block would land; how faint what would move is drawn |
| `--more-color` | "… 81,797 more" at the end of a clipped row |
| `--icon-button` | the square buttons that carry an icon: the side frames, the Tags list's order |
| `--strip-height` | the strip above the lines: Top, Back, Collapse all |
| `--aside-shade` | the shade the number column casts while the lines are scrolled sideways |
| `--frame-ease` | how long a side frame takes to hide or show |
| `--menu-width` | the Settings menu |
| `--copy-color`, `--copy-done` | the copy button at a box's top right, and its check mark |
| `--surname-weight` | how bold a surname is, with Bold surnames on |
| `--help-max-width` | what a check means, in the right frame |
| `--prose-max-width` | the privacy page's column of text |
| `--report-height` | the Report a problem box |
| `--meta-max-height`, `--table-border` | a `_META`'s story before it scrolls; the tables in a story and its persons |
| `--edit-bg` | the box a line is typed in |
| `--off-opacity` | how faint a button is that cannot be pressed |
| `--dialog-indent`, `--dialog-level-step` | the Save dialog: how far under its checkbox a record and the Note box sit, and how much further each level of a line it will write |
| `--left-width`, `--right-width` | the left bar and the right frame (also dragged, and remembered) |
| `--split-width`, `--split-color` | the bars between them |
| `--list-row-height` | the rows of Records, Checks, Changes and Tags (26 px at the least) |
| `--bar-padding`, `--gap` | space in the top bar |
| `--radius`, `--input-padding`, `--focus-ring` | boxes and buttons |
| `--pressed-bg`, `--hover-bg` | a pressed button; anything under the pointer |
| `--drop-bg` | the wash over the page while a file is dragged over it |
| `--dialog-width`, `--shadow`, `--backdrop` | the dialogs (Save, deleting): their width, their shadow, the wash behind them |

## How this was made

I designed GEDCOM Viewer and decide what it does. Most of the code was written by Claude Code,
Anthropic's AI coding assistant, working from my specifications, and I test every release against
real and public GEDCOM files before it goes live. No AI runs in the page, and your file is never
sent to one.

The record of that help is kept on purpose. [BUILD-BRIEF.md](BUILD-BRIEF.md) is the design log:
what I asked for, what was decided and measured, and where each round of fixes came from, written
with Claude Code as the work went. Each commit written with it ends with a `Co-Authored-By: Claude`
line, so the history says who wrote what.

## License

GEDCOM Viewer is free software. Copyright (C) 2026 bunahu. It is released under the GNU General
Public License, version 3 or, at your option, any later version: the text is in [LICENSE](LICENSE),
and the page serves it beside its files. It comes with no warranty. Anyone may use it, read it,
change it and pass it on; a changed copy that is passed on, served as a page included, must carry
its source under the same terms.
