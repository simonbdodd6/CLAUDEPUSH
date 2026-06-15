// Travel App — durable file-backed store (M23.0 bridge).
//
// A zero-dependency, durable JSON store used by the Travel app's persistence
// adapters. It is product infrastructure, NOT a platform module — it implements
// the storage the frozen platform repositories were designed to be backed by.
// Each "collection" is a JSON document on disk; writes are atomic (tmp + rename)
// so a crash mid-write never corrupts a collection. Single-process MVP scope
// (one traveller); a server deployment would swap this for Postgres behind the
// same adapter surface.

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join } from 'path';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class FileStore {
  constructor(rootDir) {
    if (!rootDir) throw new Error('FileStore requires a rootDir');
    this.rootDir = rootDir;
    mkdirSync(rootDir, { recursive: true });
    this.cache = new Map(); // collection -> array (in-memory mirror)
  }

  #path(collection) {
    return join(this.rootDir, `${collection}.json`);
  }

  // Load a collection from disk (cached). Returns an array.
  read(collection) {
    if (this.cache.has(collection)) return clone(this.cache.get(collection));
    const path = this.#path(collection);
    let data = [];
    if (existsSync(path)) {
      try {
        data = JSON.parse(readFileSync(path, 'utf8'));
        if (!Array.isArray(data)) data = [];
      } catch {
        data = []; // corrupt/empty file → start clean (durable writes make this rare)
      }
    }
    this.cache.set(collection, data);
    return clone(data);
  }

  // Atomically persist a collection (tmp file + rename).
  write(collection, items) {
    const data = clone(Array.isArray(items) ? items : []);
    this.cache.set(collection, data);
    const path = this.#path(collection);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path);
    return clone(data);
  }

  // Drop the in-memory cache (forces the next read to hit disk — used by tests
  // to prove durability across a fresh process).
  reset() {
    this.cache.clear();
  }
}
