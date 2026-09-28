"""Two runs of headless Chrome on one throwaway profile: run 1 soaks (the page stores its results),
run 2 reads them back. Every Chrome started here is killed by this script; nothing is left running.
The throwaway profile lives in the system's temp folder and is removed at the end.

Usage: python3 run_chrome_twice.py fsa_stored.html

What it answered on 2026-09-28 (Chrome 153, macOS, the page opened from disk):
  secure context, the three file pickers, a handle from a dropped file, sha256  -> there / work
  a sibling script loaded as a classic <script src>                             -> loads
  import() of a sibling module, fetch() of a sibling file, Worker(sibling file) -> refused
  Worker from a Blob, localStorage, IndexedDB                                   -> work
  the origin-private file system (navigator.storage.getDirectory)               -> refused
"""
import html
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

page = Path(sys.argv[1]).resolve()
chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
profile = tempfile.mkdtemp(prefix="gedview-chrome-")
base = [
    chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--use-mock-keychain", "--password-store=basic", "--disable-extensions",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    f"--user-data-dir={profile}",
]


def run(extra, hold_s):
    proc = subprocess.Popen(base + extra + [page.as_uri()],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        out, _ = proc.communicate(timeout=hold_s)
    except subprocess.TimeoutExpired:
        proc.terminate()
        try:
            out, _ = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, _ = proc.communicate()
    return out.decode("utf-8", errors="replace")


# run 1: keep the page alive for a while (a remote-debugging port keeps headless Chrome open)
run(["--remote-debugging-port=0"], hold_s=14)
time.sleep(1)
# run 2: read what run 1 stored
dom = run(["--dump-dom"], hold_s=30)
t = re.search(r"<title>(.*?)</title>", dom)
m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
print("title:", t.group(1) if t else None)
print(html.unescape(m.group(1)) if m else dom[:1500])
subprocess.run(["pkill", "-f", profile], check=False)
shutil.rmtree(profile, ignore_errors=True)
