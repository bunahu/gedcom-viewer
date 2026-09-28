#!/usr/bin/env bash
# Re-fetch the external GEDCOM stress-test corpora into this directory.
#
# The corpus bytes are gitignored (not vendored — see MANIFEST.md for the per-corpus
# licensing; jones-torture forbids redistribution). This script reproduces them locally
# for testing. Idempotent: re-running overwrites in place.
#
# Verify integrity afterwards against MANIFEST.md (sha256 column).
set -uo pipefail
cd "$(dirname "$0")"

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
fails=0

get() { # url dest  — fail-loud (report, never silently skip)
  if curl -fsSL -A "$UA" -o "$2" "$1"; then echo "  ok    $2"; else echo "  FAIL  $1"; fails=$((fails+1)); fi
}

echo "== corpus 1: gedcom555 (GEDCOM 5.5.5, gedcom.org) =="
mkdir -p gedcom555
for f in 555SAMPLE.GED 555SAMPLE16BE.GED 555SAMPLE16LE.GED MINIMAL555.GED REMARR.GED SSMARR.GED; do
  get "https://www.gedcom.org/samples/$f" "gedcom555/$f"
done

echo "== corpus 2: geditcom-tgc (GEDitCOM TGC torture + OBJE media) =="
mkdir -p geditcom-tgc/media
get "https://www.geditcom.com/downlds/TestGED.zip" "geditcom-tgc/TestGED.zip"
if [ -f geditcom-tgc/TestGED.zip ]; then
  ( cd geditcom-tgc && unzip -o -q TestGED.zip )
  # move everything that isn't a .ged / .txt / the zip into media/
  ( cd geditcom-tgc && for f in *; do
      case "$f" in
        *.ged|*.GED|*.txt|*.TXT|TestGED.zip|media) ;;
        *) [ -f "$f" ] && mv "$f" media/ ;;
      esac
    done )
fi

echo "== corpus 3: eichmann (samples + charset/terminator zips) =="
mkdir -p eichmann/charset
get "http://heiner-eichmann.de/gedcom/allged.ged" "eichmann/allged.ged"
get "http://heiner-eichmann.de/gedcom/simple.ged" "eichmann/simple.ged"
# discover + fetch the charset and line-terminator zips dynamically (the page list can grow)
for page in charset lineterm; do
  curl -fsSL -A "$UA" "http://heiner-eichmann.de/gedcom/$page.htm" 2>/dev/null \
    | grep -oiE 'href="[^"]+\.zip"' | sed -E 's/href=//I; s/"//g' | sort -u \
    | while read -r z; do
        z="${z##*/}"
        get "http://heiner-eichmann.de/gedcom/$z" "eichmann/charset/$z"
        ( cd eichmann/charset && unzip -o -q "$z" ) 2>/dev/null || true
      done
done

echo "== corpus 4: jones-torture (Tamura Jones scale extremes — needs browser UA) =="
mkdir -p jones-torture
for f in Married1200.ged Children1200.ged Long26CC.ged Long26LL.ged; do
  get "https://www.tamurajones.net/downloads/ThreeTortureTests1.5/$f" "jones-torture/$f"
done
get "https://www.tamurajones.net/downloads/Siblings0.1.5/Siblings1200.ged" "jones-torture/Siblings1200.ged"

echo "== corpus 5: gedcom7 (GEDCOM 7.0 examples, gedcom.io / FamilySearch) =="
mkdir -p gedcom7
G7BASE="https://gedcom.io/testfiles/gedcom70"
for f in age.ged escapes.ged extension-record.ged extensions.ged filename-1.ged lang.ged \
         long-url.ged maximal70-lds.ged maximal70-memories1.ged maximal70-memories2.ged \
         maximal70-tree1.ged maximal70-tree2.ged maximal70.ged minimal70.ged notes-1.ged \
         obje-1.ged remarriage1.ged remarriage2.ged same-sex-marriage.ged voidptr.ged \
         xref.ged maximal70.gdz minimal70.gdz; do
  get "$G7BASE/$f" "gedcom7/$f"
done

echo
if [ "$fails" -eq 0 ]; then
  echo "Done — all files fetched. Verify sha256 against MANIFEST.md."
else
  echo "Done with $fails FAILURE(S) above — investigate (site may be down or moved); do not assume coverage is complete."
  exit 1
fi
