#!/usr/bin/env node
/**
 * DUPLICATE-PLAYER REPAIR — PREFLIGHT (Build 136E tooling). READ-ONLY, LOCAL.
 *
 *   node scripts/duplicate-repair-preflight.mjs --snapshot <file> --confirmations <file>
 *                                               [--out <manifest.json>] [--now <iso>] [--max-age-hours <n>]
 *
 * Consumes an EXPLICITLY SUPPLIED sanitised snapshot and the recorded human
 * confirmations, prints the proposed before/after manifest, and exits 1 when
 * anything blocks. It never reads credentials, never opens a connection, and
 * has no write path: there is nothing in this file or its library that could
 * change a record. Applying the manifest is a separate, separately
 * authorised step whose first act must be a fresh re-read (see the manifest's
 * writeProtocol and docs/operations/build-136e-repair-preflight.md).
 *
 * Exit codes: 0 manifest ok (no blockers) · 1 blocked · 2 usage / unreadable input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildManifest, DEFAULT_MAX_AGE_HOURS } from './duplicate-repair-lib.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const snapshotPath = opt('--snapshot'), confirmationsPath = opt('--confirmations'), outPath = opt('--out');
const nowArg = opt('--now'), maxAgeArg = opt('--max-age-hours');
if (!snapshotPath || !confirmationsPath || args.includes('--help')) {
  console.error('usage: node scripts/duplicate-repair-preflight.mjs --snapshot <file> --confirmations <file> [--out <manifest.json>] [--now <iso>] [--max-age-hours <n>]');
  process.exit(2);
}
const readJson = (p, what) => {
  try { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); }
  catch (e) { console.error(`cannot read ${what} ${p}: ${e.message}`); process.exit(2); }
};
const now = nowArg ? Date.parse(nowArg) : Date.now();
if (!Number.isFinite(now)) { console.error('--now must be an ISO date'); process.exit(2); }
const maxAgeHours = maxAgeArg == null ? DEFAULT_MAX_AGE_HOURS : Number(maxAgeArg);
if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) { console.error('--max-age-hours must be a positive number'); process.exit(2); }

const manifest = buildManifest(readJson(snapshotPath, 'snapshot'), readJson(confirmationsPath, 'confirmations'), { now, maxAgeHours });
const text = JSON.stringify(manifest, null, 2);
if (outPath) {
  fs.writeFileSync(path.resolve(outPath), text + '\n', { mode: 0o600 });
  console.error(`manifest written to ${outPath} (mode 600)`);
}
console.log(text);
console.error(manifest.ok
  ? `\nPREFLIGHT OK — ${manifest.summary.pairsReady} pair(s) ready, ${manifest.summary.pairsNoActionByDecision} with no action by decision, ${manifest.summary.staffClear} staff mark(s) to clear. NOTHING WAS WRITTEN. A fresh re-read is mandatory before any write.`
  : `\nPREFLIGHT BLOCKED — ${manifest.blockers.length} blocker(s):\n${manifest.blockers.map(b => '  ✗ ' + b).join('\n')}\nNOTHING WAS WRITTEN.`);
process.exit(manifest.ok ? 0 : 1);
