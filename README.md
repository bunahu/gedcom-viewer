# gedview

One web page, opened from disk in Chrome, that opens a GEDCOM file, shows it readably, checks it
for obviously malformed lines, and counts what it holds. It is standalone: it shares no code with
The sibling project and never talks to it. Nothing is installed, and nothing leaves the machine.

This version reads. Editing and saving — with a dated backup and a log of what changed — are
phases 3 and 4 of [BUILD-BRIEF.md](BUILD-BRIEF.md), which is the specification.

## Open it

- **In Chrome:** drag `index.html` onto a Chrome window (or, in Chrome, File → Open File… and pick
  it). Double-clicking the file opens the default browser instead.
- Then **Open**, or drop a `.ged` file anywhere on the page.
- Other browsers can read and check a file too. Saving in place (phase 4) needs Chrome.

| Key | Does |
|---|---|
| ↑ ↓ · Page Up · Page Down · Home · End | move the selected line |
| ⌘F | Search |
| ⌘L | Go to line |
| Esc | leave a box for the lines |

Remembered between visits, in the browser: Indent on or off and its width, the theme, and the
two panel widths. Never a file's name, content or place.

## The tests and the gates

Node's own test runner; nothing to install.

```
node --test tests/*.test.js
```

(The brief writes `node --test tests/`; Node 24 reads that as one file named `tests`.)

| Gate | Command | Passes when |
|---|---|---|
| Tests | `node --test tests/*.test.js` | all pass; the only skips are the tests that need the public files, when they are absent |
| The real files | `node tools/check-real.js local/RAW.ged local/CLEANED.ged` | every number equals section 3 of the brief, for a file it measured; the probe's numbers for any other |
| The second opinion | `node tools/compare.js fixtures local/RAW.ged local/CLEANED.ged` | no number differs between `core.js` and `tools/baseline_probe.py` |
| The page | `node tools/walk.js local/RAW.ged local/CLEANED.ged` | every step passes: section 15's read-only walk on each file, then the rest of the page on a fictional file |

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
| `index.html` | the markup; loads `core.js`, then `ui.js`, as classic scripts |
| `style.css` | the whole look, its properties first |
| `core.js` | reading: bytes → encoding → lines → shape → records and pointers → checks → counts → labels; never touches the page, and runs the same under Node |
| `ui.js` | the page: the grid, the panels, the right pane, the keys |
| `tests/` | the tests, and `helpers.js` they share |
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
| `--left-width` · `--right-width` | the side panel and the right pane (also dragged, and remembered) |
| `--split-width` · `--split-color` | the bars between them |
| `--list-row-height` | the rows of Records, Checks and Tags |
| `--bar-padding` · `--gap` | space in the bar at the top |
| `--radius` · `--input-padding` · `--focus-ring` | boxes and buttons, as the sibling project's |
| `--pressed-bg` · `--hover-bg` | a pressed button; anything under the pointer |
| `--drop-bg` | the wash over the page while a file is dragged over it |
