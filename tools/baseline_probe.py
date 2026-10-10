#!/usr/bin/env python3
"""gedview's second opinion: an independent count of a GEDCOM file's shape, in Python.

The viewer's core is JavaScript. This script reads the same files by the same RULES (BUILD-BRIEF
sections 5 and 6) in another language, so the two can be compared number for number. Where they
disagree, one of them has the rule wrong - find out which before changing either.

It prints COUNTS, LENGTHS, TAGS, IDS and HASHES only. It never prints a value, so it is safe to
run over a file that holds living people.

    python3 tools/baseline_probe.py FILE [FILE ...]          one readable block per file
    python3 tools/baseline_probe.py --json FILE [FILE ...]   one JSON object per line

Stdlib only. Reads; never writes.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

LF, CR = 0x0A, 0x0D

# level [@id@] TAG [value] - ONE space between the parts; the value is everything after it.
SHAPE = re.compile(r"^(0|[1-9][0-9]*) (?:(@[^@ ]+@) )?([A-Za-z0-9_]+)(?: (.*))?$", re.S)
POINTER = re.compile(r"^@[^@ ]+@$")
LINE_BREAK_CHARS = {0x0B, 0x0C, 0x1C, 0x1D, 0x1E, 0x85, 0x2028, 0x2029}
CHANGE_DATE_RECORDS = {"FAM", "INDI", "OBJE", "NOTE", "SNOTE", "REPO", "SOUR", "SUBM"}


def detect(raw: bytes) -> dict:
    """The bytes first, the header last (the order the sibling project's reader settled on in its issue 752)."""
    if raw.startswith(b"\xef\xbb\xbf"):
        return {"codec": "utf-8", "unit": 1, "bom": 3, "how": "byte-order mark"}
    if raw.startswith(b"\xff\xfe"):
        return {"codec": "utf-16-le", "unit": 2, "bom": 2, "how": "byte-order mark"}
    if raw.startswith(b"\xfe\xff"):
        return {"codec": "utf-16-be", "unit": 2, "bom": 2, "how": "byte-order mark"}
    head = raw[:8]
    head = head[: len(head) - len(head) % 2]
    if len(head) >= 4:
        first, second = head[0::2], head[1::2]
        if all(first) and not any(second):
            return {"codec": "utf-16-le", "unit": 2, "bom": 0, "how": "byte pattern"}
        if all(second) and not any(first):
            return {"codec": "utf-16-be", "unit": 2, "bom": 0, "how": "byte pattern"}
    return {"codec": None, "unit": 1, "bom": 0, "how": "header"}


def units(raw: bytes, enc: dict):
    """The file as a list of code units (bytes, or 16-bit units) after the byte-order mark."""
    body = raw[enc["bom"]:]
    if enc["unit"] == 1:
        return list(body)
    order = "little" if enc["codec"] == "utf-16-le" else "big"
    even = len(body) - len(body) % 2
    return [int.from_bytes(body[i:i + 2], order) for i in range(0, even, 2)]


def split_lines(u: list[int]):
    """(start, end, terminator) per line, in units. A line ends at CR LF, LF CR, LF or CR - and at
    nothing else. LF CR is ONE terminator only in a file whose first line ends that way."""
    first = next((i for i, x in enumerate(u) if x in (LF, CR)), None)
    lfcr_file = (first is not None and u[first] == LF
                 and first + 1 < len(u) and u[first + 1] == CR)
    out, pos, start, n = [], 0, 0, len(u)
    while pos < n:
        x = u[pos]
        if x == CR and pos + 1 < n and u[pos + 1] == LF:
            out.append((start, pos, "CRLF")); pos += 2; start = pos
        elif x == LF and lfcr_file and pos + 1 < n and u[pos + 1] == CR:
            out.append((start, pos, "LFCR")); pos += 2; start = pos
        elif x == LF:
            out.append((start, pos, "LF")); pos += 1; start = pos
        elif x == CR:
            out.append((start, pos, "CR")); pos += 1; start = pos
        else:
            pos += 1
    if start < n:
        out.append((start, n, "none"))
    return out


def decode(u: list[int], enc: dict) -> tuple[str, bool]:
    """(text, clean). clean is False when the bytes are not valid in the file's encoding."""
    if enc["unit"] == 2:
        order = "little" if enc["codec"] == "utf-16-le" else "big"
        data = b"".join(x.to_bytes(2, order) for x in u)
        try:
            return data.decode(enc["codec"]), True
        except UnicodeDecodeError:
            return data.decode(enc["codec"], errors="replace"), False
    data = bytes(u)
    if enc["codec"] == "utf-8":
        try:
            return data.decode("utf-8"), True
        except UnicodeDecodeError:
            return data.decode("utf-8", errors="replace"), False
    if enc["codec"] == "ascii":
        return data.decode("latin-1"), all(b < 0x80 for b in data)
    return data.decode("latin-1"), True      # one byte per character, shown as it can be


def probe(path: Path) -> dict:
    raw = path.read_bytes()
    enc = detect(raw)
    u = units(raw, enc)
    spans = split_lines(u)

    # the header's own statement, read once the lines can be read at all
    probe_enc = dict(enc, codec=enc["codec"] or "latin-1")
    declared = version = None
    under_gedc = False
    for s, e, _ in spans[:80]:
        text, _ok = decode(u[s:e], probe_enc)
        t = text.lstrip(" \t")
        if t.startswith("0 ") and not t.startswith("0 HEAD"):
            break                                        # the header is over
        if t.startswith("1 "):
            under_gedc = t.rstrip() == "1 GEDC" or t.startswith("1 GEDC ")
        if t.startswith("1 CHAR "):
            declared = t[7:].strip()
        elif t.startswith("2 VERS ") and under_gedc and version is None:
            version = t[7:].strip()
    # flags = the header and the bytes DISAGREE (check E9, an error);
    # notes = an encoding the viewer can show only as it can (check N6, a note)
    flags: list[str] = []
    notes: list[str] = []
    norm = (declared or "").strip().upper()
    major7 = (version or "").startswith("7")
    if enc["codec"] is None:
        if norm in ("UTF-8", "UTF8"):
            enc["codec"] = "utf-8"
        elif norm == "" and major7:
            enc["codec"] = "utf-8"                      # version 7 is always UTF-8 and has no CHAR
        elif norm == "":
            enc["codec"] = "utf-8"; flags.append("no CHAR line; read as UTF-8")
        elif norm == "ASCII":
            enc["codec"] = "ascii"
        elif norm in ("UNICODE", "UTF-16"):
            enc["codec"] = "utf-8"
            flags.append(f"header says {declared} but the bytes are one per character; read as UTF-8")
        else:
            enc["codec"] = "one-byte"
            notes.append(f"header says {declared}; shown one byte per character, bytes kept as they are")
    elif enc["unit"] == 2 and norm not in ("UNICODE", "UTF-16", ""):
        flags.append(f"header says {declared} but the bytes are UTF-16")
    elif enc["codec"] == "utf-8" and norm not in ("UTF-8", "UTF8", "") :
        flags.append(f"header says {declared} but the file opens with a UTF-8 byte-order mark")

    terms: Counter = Counter(t for _, _, t in spans)
    levels: Counter = Counter()
    top: Counter = Counter()
    tags: Counter = Counter()
    defined: Counter = Counter()
    pointed: Counter = Counter()
    c: Counter = Counter()
    n1_chars = 0
    prev = -1
    records: list[tuple[str, str | None]] = []
    longest = 0
    for s, e, _t in spans:
        text, clean = decode(u[s:e], enc)
        longest = max(longest, len(text))
        if not clean:
            c["E8 bytes not valid in the file's encoding"] += 1
        if text.strip(" \t") == "":
            c["E5 blank line"] += 1
            continue
        body = text.lstrip(" \t")
        if body != text:
            c["N5 leading whitespace"] += 1
        if len(text) > 255 and not (version or "").startswith("7"):
            c["N4 line over 255 characters"] += 1
        breaks = sum(1 for ch in text if ord(ch) in LINE_BREAK_CHARS)
        if breaks:
            c["N1 lines holding a line-break character"] += 1
            n1_chars += breaks
        if any((ord(ch) < 0x20 and ch != "\t" and ord(ch) not in LINE_BREAK_CHARS) or ord(ch) == 0x7F
               for ch in text):
            c["N2 other control character"] += 1
        if not body[0].isdigit() or not body[0].isascii():
            c["E1 no level number"] += 1
            continue
        m = SHAPE.match(body)
        if not m:
            c["E2 wrong line shape"] += 1
            continue
        level, xref, tag, value = int(m.group(1)), m.group(2), m.group(3), m.group(4) or ""
        levels[level] += 1
        tags[tag] += 1
        if level > prev + 1:
            c["E3 level jumps by more than one"] += 1
        prev = level
        if level == 0:
            top[tag] += 1
            records.append((tag, xref))
            if xref:
                defined[xref] += 1
        elif POINTER.match(value) and value != "@VOID@":
            pointed[value] += 1

    frame = 0
    if not records or records[0] != ("HEAD", None):
        frame += 1
    if not records or records[-1] != ("TRLR", None):
        frame += 1
    frame += max(0, top["HEAD"] - 1) + max(0, top["TRLR"] - 1)
    c["E4 file frame"] = frame
    c["E6 id defined twice"] = sum(v - 1 for v in defined.values() if v > 1)
    c["E7 pointer to nothing"] = sum(v for k, v in pointed.items() if k not in defined)
    c["E9 encoding contradiction"] = len(flags)
    c["N3 record nothing points at"] = sum(1 for k in defined if k not in pointed)
    # N6 only when a byte is above 127: read one byte per character, every other byte shows as itself
    c["N6 encoding shown as it can be"] = len(notes) if any(b >= 0x80 for b in raw) else 0

    names = ["E1 no level number", "E2 wrong line shape", "E3 level jumps by more than one",
             "E4 file frame", "E5 blank line", "E6 id defined twice", "E7 pointer to nothing",
             "E8 bytes not valid in the file's encoding", "E9 encoding contradiction",
             "N1 lines holding a line-break character", "N2 other control character",
             "N3 record nothing points at", "N4 line over 255 characters", "N5 leading whitespace",
             "N6 encoding shown as it can be"]
    return {
        "file": path.name,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "encoding": enc["codec"], "told_by": enc["how"], "byte_order_mark": enc["bom"],
        "header_says": declared, "version": version,
        "encoding_flags": flags, "encoding_notes": notes,
        "lines": len(spans),
        "terminators": {k: terms.get(k, 0) for k in ("CRLF", "LFCR", "LF", "CR", "none")},
        "longest_line": longest,
        "levels": {str(k): v for k, v in sorted(levels.items())},
        "records": dict(top.most_common()),
        "records_that_can_carry_a_change_date": sum(v for k, v in top.items() if k in CHANGE_DATE_RECORDS),
        "distinct_tags": len(tags),
        "CONC": tags.get("CONC", 0), "CONT": tags.get("CONT", 0), "CHAN": tags.get("CHAN", 0),
        "ids_defined": len(defined),
        "checks": {k: c.get(k, 0) for k in names},
        "N1_characters": n1_chars,
    }


def main(argv: list[str]) -> int:
    as_json = "--json" in argv
    files = [a for a in argv if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 2
    for f in files:
        r = probe(Path(f))
        if as_json:
            print(json.dumps(r, ensure_ascii=True, sort_keys=True))
            continue
        print(f"\n=== {r['file']}")
        print(f"bytes {r['bytes']:,} · sha256 {r['sha256']}")
        print(f"encoding {r['encoding']} (told by {r['told_by']}; mark {r['byte_order_mark']} bytes; "
              f"header says {r['header_says']}) · version {r['version']}")
        for fl in r["encoding_flags"]:
            print(f"  ! {fl}")
        for nt in r["encoding_notes"]:
            print(f"  · {nt}")
        print(f"lines {r['lines']:,} · terminators {r['terminators']} · longest line {r['longest_line']:,}")
        print(f"levels {r['levels']}")
        print(f"records {r['records']}")
        print(f"distinct tags {r['distinct_tags']} · CONC {r['CONC']:,} · CONT {r['CONT']:,} · "
              f"CHAN {r['CHAN']:,} · ids defined {r['ids_defined']:,}")
        for k, v in r["checks"].items():
            print(f"  {k:<46} {v:,}")
        print(f"  {'N1 characters':<46} {r['N1_characters']:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
