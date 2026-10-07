/**
 * Upstash stand-ins for the Build 135 tests (not a test file itself).
 *
 * installKv()     routes Upstash requests (by URL) to in-process stores whose
 *                 every command answers after a small random delay, so
 *                 concurrent writers genuinely interleave between their read
 *                 and their write — exactly the window a lost update needs.
 *                 SET honours NX and EX like Redis.
 * startKvServer() the same store behind HTTP (POST JSON command), so SEPARATE
 *                 Node processes (runWorker) can share one database — the
 *                 "separate server executions" a real deployment has.
 * Every database is keyed by its URL: tests can give production and Preview
 * different databases and see exactly which one each request reached.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';

export function makeStore() {
  const data = new Map();       // key -> string
  const lists = new Map();      // key -> string[]
  const expiry = new Map();     // key -> ms epoch
  const live = k => { const t = expiry.get(k); if (t && t <= Date.now()) { data.delete(k); lists.delete(k); expiry.delete(k); return false; } return data.has(k) || lists.has(k); };
  const range = (l, s, e) => { const end = Number(e) < 0 ? l.length + Number(e) : Number(e); return l.slice(Number(s), end + 1); };
  const log = [];
  function exec([cmd, ...a]) {
    const c = String(cmd).toUpperCase();
    log.push([c, ...a.slice(0, 1)]);
    switch (c) {
      case 'GET': return live(a[0]) && data.has(a[0]) ? data.get(a[0]) : null;
      case 'SET': {
        const nx = a.slice(2).map(x => String(x).toUpperCase()).includes('NX');
        const exAt = a.slice(2).map(x => String(x).toUpperCase()).indexOf('EX');
        if (nx && live(a[0])) return null;
        data.set(a[0], a[1]); lists.delete(a[0]);
        if (exAt >= 0) expiry.set(a[0], Date.now() + Number(a[2 + exAt + 1]) * 1000); else expiry.delete(a[0]);
        return 'OK';
      }
      case 'DEL': { let n = 0; for (const k of a) { if (data.delete(k) | lists.delete(k)) n++; expiry.delete(k); } return n; }
      case 'LPUSH': { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); return l.length; }
      case 'LRANGE': return range(lists.get(a[0]) || [], a[1], a[2]);
      case 'LTRIM': lists.set(a[0], range(lists.get(a[0]) || [], a[1], a[2])); return 'OK';
      case 'RENAME': { if (lists.has(a[0])) { lists.set(a[1], lists.get(a[0])); lists.delete(a[0]); } else { data.set(a[1], data.get(a[0])); data.delete(a[0]); } return 'OK'; }
      case 'EXPIRE': expiry.set(a[0], Date.now() + Number(a[1]) * 1000); return 1;
      case 'SCAN': {
        const i = a.findIndex(x => String(x).toUpperCase() === 'MATCH');
        const re = new RegExp('^' + String(a[i + 1] || '*').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return ['0', [...new Set([...data.keys(), ...lists.keys()])].filter(k => live(k) && re.test(k))];
      }
      default: throw new Error(`unsupported ${c}`);
    }
  }
  return { data, lists, expiry, log, exec };
}

/**
 * Install a fetch that routes Upstash calls by URL to per-URL stores, with a
 * random 0–maxDelayMs answer delay. Returns { dbFor(url), calls }.
 */
export function installKv({ maxDelayMs = 3 } = {}) {
  const dbs = new Map();
  const calls = [];
  const realFetch = globalThis.fetch;
  const dbFor = url => { const k = String(url).replace(/\/+$/, '').toLowerCase(); if (!dbs.has(k)) dbs.set(k, makeStore()); return dbs.get(k); };
  globalThis.fetch = async (url, opts = {}) => {
    if (!/^https?:\/\/(redis|kv)\./.test(String(url))) return realFetch(url, opts);
    const cmd = JSON.parse(opts.body || '[]');
    calls.push({ url: String(url), auth: opts.headers?.Authorization || opts.headers?.authorization, cmd });
    if (maxDelayMs) await new Promise(r => setTimeout(r, Math.floor(Math.random() * (maxDelayMs + 1))));
    let result, error;
    try { result = dbFor(url).exec(cmd); } catch (e) { error = e.message; }
    return { ok: true, status: 200, json: async () => (error ? { error } : { result }) };
  };
  return { dbFor, calls, setDelay: ms => { maxDelayMs = ms; }, restore: () => { globalThis.fetch = realFetch; } };
}

/** The same store behind HTTP, for multi-process tests. */
export async function startKvServer({ maxDelayMs = 3 } = {}) {
  const store = makeStore();
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    if (maxDelayMs) await new Promise(r => setTimeout(r, Math.floor(Math.random() * (maxDelayMs + 1))));
    let out;
    try { out = { result: store.exec(JSON.parse(body || '[]')) }; } catch (e) { out = { error: e.message }; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { store, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) };
}

/**
 * Run `code` (an ES module body) in a SEPARATE Node process with `env` added —
 * a second serverless instance. Resolves with its stdout; rejects on a
 * non-zero exit with the first part of stderr.
 */
export function runWorker(env, code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, VERCEL: '', VERCEL_ENV: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`worker exited ${code}: ${err.slice(0, 800)}`))));
  });
}

/** A module path a worker can import (absolute file URL). */
export const apiModule = name => new URL(`../api/${name}`, import.meta.url).href;
