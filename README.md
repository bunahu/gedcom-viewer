# gedview

One web page, opened from disk in Chrome, that opens a GEDCOM file, shows it readably, checks it
for obviously malformed lines, counts what it holds, and lets clean hand edits be made and saved —
in place with a dated backup, or as a dated copy, with a log of what changed. It is standalone: it
shares no code with the sibling project and never talks to it. Nothing is installed, and nothing leaves the
machine. [BUILD-BRIEF.md](BUILD-BRIEF.md) is the specification.

| Version | What it is |
|---|---|
| 0.1 | the viewer: phases 1 and 2 (read, check, count, show) |
| 0.2 | phase 3: `core.js` can edit, undo, find what changed, stamp, and make the bytes of a save |
| 0.3 | phase 4: editing and saving on the page; Open GEDCOM; the facts line in the owner's order; blocks that open and shut |
| 1.0 | when the owner's own walk (phase 5) says it is done |

The version shows beside the name in the bar, and each is a git tag (`git tag -n1` lists them).

## Open it

- **In Chrome:** drag `index.html` onto a Chrome window (or, in Chrome, File → Open File… and pick
  it). Double-clicking the file opens the default browser instead.
- Then **Open GEDCOM**, or drop a `.ged` file anywhere on the page.
- Other browsers can read, check and edit a file too. Save, in place, needs Chrome; elsewhere Save
  a copy downloads the copy and its log.

| Key | Does |
|---|---|
| ↑ ↓ · Page Up · Page Down · Home · End | move the selected line |
| ← · → | shut the selected line's block, or go up to the line above it · open it, or go down into it |
| ⌥-click on ▸ or ▾ | open or shut every block at that level (on a level 0: every record) |
| Enter · a double-click | type over the selected line; Enter keeps it, Esc drops it, clicking away keeps it |
| ⌫ | delete the selected line and the lines under it (asks first when there are any) |
| ⌘Z · ⇧⌘Z | Undo · Redo, one act each |
| ⌘S · ⇧⌘S | Save, in place · Save a copy |
| ⌘F | Search |
| ⌘L | Go to line |
| Esc | leave a box for the lines |

Remembered between visits, in the browser: Indent on or off and its width, the theme, the two
panel widths, and whether the change stamps are ticked. Never a file's name, content or place.

## Edit and save

There is no mode to switch on. Select a line and press Enter (or double-click it): its row becomes
a box holding the whole line — level, tag and value. The right pane's buttons add a line under the
selected one (**Add child**, one level deeper), add one after it and the lines under it (**Add
sibling**, at its level), or delete the line or its whole record. Deleting a record first shows
what goes: the record, and each line elsewhere that points at it, ticked; untick what should stay.

Until it is saved, an edit shows:

| Where | Changed line | Added line | Removed lines |
|---|---|---|---|
| its row | tinted, a bar at its left edge | tinted another colour, a bar | a red rule where they were |
| the right pane | **Was**, and the line as last saved | **Added** | — |
| Changes | the line, before → after | the line | the lines |
| a shut block | its count of lines takes the colour when it holds a change | | |
| the bar | ● after the file's name; Save turns on | | |
| the Save dialog | every change, and every change stamp, before anything is written | | |

**Save** writes the file in place. The first time, it asks for the folder the file is in (Chrome
then asks to let the page edit files there). Before it writes, it checks that the file on disk is
still the one opened, and refuses if another program changed it. Then:

| Written | Where |
|---|---|
| a backup of the file as it was, read back and compared | `gedview-history/<name>.<YYYY-MM-DDTHHMMSS>.ged.bak` |
| the file, read back and compared | where it was |
| a block in the log: when, the note, the file's sha256 before and after, the backup, every change | `<name>.ged.edits.log`, beside the file; it only ever grows |

**Save a copy** writes `<name>.<YYYY-MM-DDTHHMMSS>.ged` beside the file, and leaves the file itself
as it was. **Change stamps**, ticked unless unticked, give each changed record a `1 CHAN` with the
date, time and note of the save (section 10.4 of the brief). The backup and the log hold what the
file holds, living people included, and belong beside it — never in a repo.

The **sha256** in the facts line is a fingerprint of the file's exact bytes, as it is on disk:
change one character and it changes completely; two files with the same sha256 are the same, byte
for byte. Save checks it before it writes, and a backup must match it. `shasum -a 256 <file>` in
Terminal gives the same one.

## The tests and the gates

Node's own test runner; nothing to install.

```
node --test tests/*.test.js
```

(The brief writes `node --test tests/`; Node 24 reads that as one file named `tests`.)

| Gate | Command | Passes when |
|---|---|---|
| Tests | `node --test tests/*.test.js` | all pass; the only skips are the tests that need the public files, when they are absent |
| The real files | `node tools/check-real.js local/RAW.ged local/CLEANED.ged` | every number equals section 3 of the brief, for a file it measured; the probe's numbers for any other; an edit and a record deleted on each, the whole file checked again within 0.3 s, and undone to its sha256 |
| The second opinion | `node tools/compare.js fixtures local/RAW.ged local/CLEANED.ged` | no number differs between `core.js` and `tools/baseline_probe.py` |
| The page | `node tools/walk.js local/RAW.ged local/CLEANED.ged` | every step passes: section 15's read-only walk on each file, and one edit in the page timed and undone; then the rest of the page and its editing on a fictional file; Save in place through a folder held in the page's memory; Save a copy downloaded in a browser with no pickers |

The tools print counts, tags, ids, line numbers, lengths and hashes only — never a value — so
they are safe to run over a file that holds living people. The walk drives Google Chrome,
headless, at the page's own `file://` address (`CHROME=path` picks another). It takes no picture
of a real file; `--shots DIR` saves pictures of its fictional file only.

**The public test files are not in git** (their licences; see `fixtures/corpora/MANIFEST.md`).
Copy the five folders from the sibling project's `api/tests/fixtures/gedcom-corpora/` into `fixtures/corpora/`,
and the sibling project's `ancestry_shapes.ged` and `ancestry_dup_citation.ged` into
`fixtures/corpora/sibling-own/` — or fetch the five with `fixtures/corpora/fetch_corpora.sh`.

**Real files go in `local/`**, which git ignores, as it ignores every backup and log.

## Files

| File | Holds |
|---|---|
| `index.html` | the markup; loads `core.js`, `save.js`, then `ui.js`, as classic scripts |
| `style.css` | the whole look, its properties first |
| `core.js` | reading: bytes → encoding → lines → shape → records and pointers → checks → counts → labels; editing: the document, the acts, undo, the net change, the change stamps, the bytes of a save; never touches the page, and runs the same under Node |
| `save.js` | saving: the dated names, Save in place, Save a copy, the log block — over file handles passed to it; never touches the page |
| `ui.js` | the page: the grid, the panels, the right pane, the dialogs, the keys; the only file that knows the pickers exist |
| `tests/` | the tests; `helpers.js` they share; `fake-handles.js`, in-memory files and folders for `save.js` |
| `fixtures/synthetic/` | small files written for the checks, fictional people only |
| `tools/` | `baseline_probe.py` (the Python second opinion), `check-real.js`, `compare.js`; `walk.js`, which walks the page in headless Chrome, driven by `chrome.js` |
| `spike/` | what the scoping session measured with, and `save-spike.html` (phase 0) |

## Change the look

Every colour, size and width is a custom property in the first blocks of `style.css`; the rules
below them only use them. Change a value there and it changes everywhere it is used.

**The sibling project's palette** — three blocks, as the sibling project has them: light (`:root`), `.sunset`, `.dark`. Theme
steps light → sunset → dark.

| Property | Moves |
|---|---|
| `--color-bg` | the page behind everything; the boxes |
| `--color-bg-card` | the bar, the grid, the right pane, the lists |
| `--color-bg-sidebar` | the side panel |
| `--color-text` | the text |
| `--color-text-muted` | quiet text: line numbers, levels, the facts line, counts' names |
| `--color-border` | lines between parts; box edges; the bars you drag |
| `--color-accent` | the gold: the focus ring, the selected line, pressed buttons |
| `--color-accent-hover` | the sepia: ids |
| `--color-info` | pointers (links) |
| `--color-warning` | notes (N1–N7) |
| `--color-danger` | errors (E1–E9); a line that did not parse |
| the rest (`--color-nonbio`, `--color-success`, `--color-entity-…`, `--color-affiliation`, `--color-ancestor`, `--color-assertion-mark`) | nothing yet; kept so the palettes stay the sibling project's |

**gedview's own** — drawn from the palette, so each theme carries them.

| Property | Moves |
|---|---|
| `--font-body` | the type of everything but the grid (The sibling project's system sans) |
| `--font-grid` | the grid's monospace, and the right pane's |
| `--font-size-body` · `--font-size-small` · `--font-size-grid` | the three type sizes |
| `--tag-weight` | how strong a tag is |
| `--row-height` | the height of every grid row; the page reads it each time it lays the grid out |
| `--tab-size` | how wide a tab inside a value shows |
| `--row-selected` · `--row-hit` · `--row-hover` | the selected line; a search's lines; the line under the pointer |
| `--line-number-color` · `--level-color` · `--id-color` · `--tag-color` · `--value-color` | the parts of a line |
| `--pointer-color` | a pointer value |
| `--raw-color` | a line that did not parse, shown as written |
| `--match-bg` | the text a search found |
| `--special-bg` | the mark for a control or line-break character inside a value (NEL, LS, ␋ …) |
| `--mark-error` · `--mark-note` · `--mark-size` | the dot beside a line with a finding |
| `--fold-color` · `--fold-size` | the ▸ ▾ that shut and open a block |
| `--hidden-bg` | the count of lines a shut block hides |
| `--mark-changed` · `--mark-added` · `--mark-removed` | what is not yet saved: a changed line, an added one, the rule where lines were removed; the ● in the bar |
| `--mark-bar` | the width of the bar at the left of a changed or added row |
| `--row-changed` · `--row-added` | the tint of a changed row, an added row |
| `--edit-bg` | the box a line is typed in |
| `--left-width` · `--right-width` | the side panel and the right pane (also dragged, and remembered) |
| `--split-width` · `--split-color` | the bars between them |
| `--list-row-height` | the rows of Records, Checks, Changes and Tags |
| `--bar-padding` · `--gap` | space in the bar at the top |
| `--radius` · `--input-padding` · `--focus-ring` | boxes and buttons, as the sibling project's |
| `--pressed-bg` · `--hover-bg` | a pressed button; anything under the pointer |
| `--drop-bg` | the wash over the page while a file is dragged over it |
| `--dialog-width` · `--shadow` · `--backdrop` | the dialogs (Save, Save a copy, deleting): their width, their shadow, the wash behind them |
