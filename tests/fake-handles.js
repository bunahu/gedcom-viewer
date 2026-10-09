// In-memory stand-ins for the browser's file handles and its Save dialog (BUILD-BRIEF section 12):
// the few methods save.js uses, with the same names and shapes. Every read and every finished
// write goes into the folder's `journal`, in order, so a test can hold save.js to the order of
// 10.2; a file can be made to fail, to show what save.js does then; and the Save dialog empties
// the file picked in it before it hands back its handle, as Chromium's does.
'use strict';

const fail = (name, message) => Object.assign(new Error(message), { name });

class FakeFile {
  constructor(dir, name, bytes) {
    this.kind = 'file';
    this.name = name;
    this.dir = dir;
    this.bytes = bytes || new Uint8Array(0);
    this.fail = null;                                                // 'open', 'close' or 'garble'
  }

  get path() { return this.dir.path ? `${this.dir.path}/${this.name}` : this.name; }

  async getFile() {
    this.dir.journal.push(`read ${this.path}`);
    const b = this.bytes.slice();
    return { name: this.name, size: b.length, arrayBuffer: async () => b.buffer };
  }

  // Like the browser's: what is written takes the file's place only at close, all at once.
  async createWritable(opts = {}) {
    if (this.fail === 'open') throw fail('NotAllowedError', `${this.name} may not be written`);
    const file = this;
    let data = opts.keepExistingData ? file.bytes.slice() : new Uint8Array(0);
    let pos = 0;
    return {
      async seek(p) { pos = p; },
      async write(chunk) {
        const b = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
        if (pos + b.length > data.length) {
          const grown = new Uint8Array(pos + b.length);
          grown.set(data);
          data = grown;
        }
        data.set(b, pos);
        pos += b.length;
      },
      async close() {
        if (file.fail === 'close') throw fail('InvalidStateError', `${file.name} could not be finished`);
        file.bytes = file.fail === 'garble' ? data.map((x, k) => (k === 0 ? x ^ 1 : x)) : data;
        file.dir.journal.push(`${opts.keepExistingData ? 'append' : 'write'} ${file.path}`);
      },
    };
  }

  // Like the browser's: two handles are one entry when they name the same file in the same folder.
  async isSameEntry(other) {
    return !!other && other.kind === 'file' && other.dir === this.dir && other.name === this.name;
  }
}

class FakeDir {
  constructor(name, parent) {
    this.kind = 'directory';
    this.name = name;
    this.parent = parent || null;
    this.entries = new Map();
    this.journal = parent ? parent.journal : [];
    this.failNew = null;                                             // how the files made here fail
  }

  get path() { return this.parent ? (this.parent.path ? `${this.parent.path}/${this.name}` : this.name) : ''; }

  async getFileHandle(name, opts = {}) {
    const e = this.entries.get(name);
    if (e) {
      if (e.kind !== 'file') throw fail('TypeMismatchError', `${name} is a folder`);
      return e;
    }
    if (!opts.create) throw fail('NotFoundError', `there is no ${name}`);
    const f = new FakeFile(this, name);
    f.fail = this.failNew;
    this.entries.set(name, f);
    return f;
  }

  // For the tests: put a file here; find a file by its name; list names.
  put(name, bytes) {
    const f = new FakeFile(this, name, new Uint8Array(bytes));
    this.entries.set(name, f);
    return f;
  }

  at(name) { return this.entries.get(name); }

  names() { return [...this.entries.keys()].sort(); }
}

// The computer's Save dialog, as Chromium's showSaveFilePicker is: the person keeps the name it
// offers, or types `answer`, in `dir`; null is Cancel (an AbortError). The file picked is created
// when it is not there and, when it is, emptied before its handle is handed back (Chromium's
// file_system_access_manager_impl.cc: "Create file if it doesn't yet exist, and truncate file if
// it does exist"); `empties: false` is a browser that leaves it as it was. `offered` keeps every
// name the dialog was given to offer.
function saveDialog(dir, answer, { empties = true } = {}) {
  const pick = async (offered) => {
    pick.offered.push(offered);
    if (answer === null) throw fail('AbortError', 'The user aborted a request.');
    const name = answer === undefined ? offered : answer;
    const there = dir.entries.get(name);
    const file = await dir.getFileHandle(name, { create: true });
    if (!there) dir.journal.push(`create ${file.path}`);
    else if (empties) {
      file.bytes = new Uint8Array(0);
      dir.journal.push(`empty ${file.path}`);
    }
    return file;
  };
  pick.offered = [];
  return pick;
}

module.exports = { FakeDir, FakeFile, saveDialog };
