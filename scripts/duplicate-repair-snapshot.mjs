#!/usr/bin/env node
/**
 * DUPLICATE-PLAYER REPAIR — SNAPSHOT (Build 136E tooling). READ-ONLY.
 *
 *   UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… [APP_KEY_PREFIX=app] \
 *   node scripts/duplicate-repair-snapshot.mjs --club <clubId> --out <snapshot.json> [--prefix <p>]
 *
 * The key prefix is --prefix when given, else APP_KEY_PREFIX (as the app and
 * the audit read it), else "app". A wrong prefix is refused, never guessed:
 * the users store is then "missing" and nothing is written.
 *
 * Writes the sanitised `coacheasier-duplicate-repair-snapshot/1` document the
 * preflight consumes. Credentials come from the ENVIRONMENT ONLY — this script
 * deliberately has no .env.local fallback, so a live snapshot is always an
 * explicit, approved act. Two independent guards keep it read-only: every
 * Redis command passes guardReadOnly() in the library, and fetch itself is
 * wrapped here so that any command other than GET / SCAN / LRANGE aborts the
 * process before it is sent (the production audit's tripwire). The output
 * file is created with mode 600 and never overwritten.
 *
 * Exit codes: 0 written · 1 read/format failure (nothing written) · 2 usage · 3 tripwire.
 */
import fs from 'node:fs';
import path from 'node:path';
import { takeSnapshot, summarize, READ_ONLY_COMMANDS, StoreFormatError, TripwireError } from './duplicate-repair-snapshot-lib.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const club = opt('--club'), outPath = opt('--out');
const prefix = (opt('--prefix') || process.env.APP_KEY_PREFIX || 'app').replace(/:+$/, '') || 'app';
if (!club || !outPath || args.includes('--help')) {
  console.error('usage: node scripts/duplicate-repair-snapshot.mjs --club <clubId> --out <snapshot.json> [--prefix <p>]\n(UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in the environment — no .env.local fallback by design; the prefix is --prefix, else APP_KEY_PREFIX, else "app")');
  process.exit(2);
}
const URL_ = process.env.UPSTASH_REDIS_REST_URL, TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!URL_ || !TOKEN) { console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set — refusing to guess. Export them for this one command only.'); process.exit(2); }
const target = path.resolve(outPath);
if (fs.existsSync(target)) { console.error(`refusing to overwrite ${target}`); process.exit(2); }

// Tripwire at the transport: no non-read command leaves this process.
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (url, options = {}) => {
  let cmd = '';
  try { cmd = String(JSON.parse(options.body || '[]')[0] || '').toUpperCase(); } catch {}
  if (!READ_ONLY_COMMANDS.includes(cmd)) { console.error(`\nTRIPWIRE — refused non-read Redis command: ${cmd || '(unparsable)'}\n`); process.exit(3); }
  return realFetch(url, options);
};
async function redis(...command) {
  const res = await globalThis.fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await res.json();
  if (data.error) throw new Error(`redis ${command[0]}: ${data.error}`);
  return data.result;
}

try {
  const snapshot = await takeSnapshot({ redis, prefix, club });
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ written: target, mode: '600', keyPrefix: prefix, ...summarize(snapshot) }, null, 2));
  console.error('(read-only: no command other than GET/SCAN/LRANGE was sent; keep this file private — umask 077)');
  process.exit(0);
} catch (e) {
  if (e instanceof TripwireError) { console.error(e.message); process.exit(3); }
  console.error(e instanceof StoreFormatError ? `snapshot refused — ${e.message}` : `snapshot failed — ${e.message}`);
  console.error('nothing was written');
  process.exit(1);
}
