// In-memory stand-ins for the browser's file and folder handles (BUILD-BRIEF section 12): the few
// methods save.js uses, with the same names and shapes. Every read and every finished write goes
// into the folder's `journal`, in order, so a test can hold save.js to the order of 10.2; and a
// file can be made to fail, to show what save.js does then.
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

  async getDirectoryHandle(name, opts = {}) {
    const e = this.entries.get(name);
    if (e) {
      if (e.kind !== 'directory') throw fail('TypeMismatchError', `${name} is a file`);
      return e;
    }
    if (!opts.create) throw fail('NotFoundError', `there is no ${name}`);
    const d = new FakeDir(name, this);
    this.entries.set(name, d);
    return d;
  }

  // For the tests: put a file here; find a file by its path ('gedcom-viewer-history/x.bak'); list names.
  put(name, bytes) {
    const f = new FakeFile(this, name, new Uint8Array(bytes));
    this.entries.set(name, f);
    return f;
  }

  at(p) {
    const [first, ...rest] = p.split('/');
    const e = this.entries.get(first);
    if (!e) return undefined;
    return rest.length ? e.at(rest.join('/')) : e;
  }

  names() { return [...this.entries.keys()].sort(); }
}

module.exports = { FakeDir, FakeFile };
