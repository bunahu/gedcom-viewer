#!/usr/bin/env node
// GEDCOM Viewer — does a problem report still read as built? A report from Settings → Report a
// problem ends its built part with `checksum: <8 hex>`, the first eight characters of the sha256
// of every line above it, each followed by a line feed (core.js, reportChecksumParts). This reads
// a report — a file given by path, or standard input — and says: as built (exit 0), changed after
// it was built (1), or no checksum line (2). The lines after the checksum are the reporter's own
// and are not checked.
//
//     node tools/report-check.js report.txt
//     pbpaste | node tools/report-check.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require(path.join(__dirname, '..', 'core.js'));

const text = fs.readFileSync(process.argv[2] || 0, 'utf8');
const parts = core.reportChecksumParts(text);
if (!parts.claimed) {
  console.log('no checksum line: the report cannot be read back as built');
  process.exit(2);
}
const hex = crypto.createHash('sha256').update(parts.above, 'utf8').digest('hex');
const n = parts.above.split('\n').length - 1;
if (hex.startsWith(parts.claimed)) {
  console.log(`as built: the checksum ${parts.claimed} matches its ${n} lines`);
  process.exit(0);
}
console.log(`changed after it was built: the checksum ${parts.claimed} does not match its ${n} lines, which hash to ${hex.slice(0, 8)}`);
process.exit(1);
