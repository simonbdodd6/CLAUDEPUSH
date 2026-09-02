#!/usr/bin/env node
/**
 * BUILD U — READ-ONLY production availability integrity audit.
 *
 *   node scripts/audit-availability-integrity.mjs
 *
 * Reads Upstash credentials from .env.local (never printed). A hard tripwire
 * wraps fetch so that ONLY the Redis commands GET and SCAN can leave this
 * process — any write command aborts the audit before it is sent.
 *
 * Identity is read through the PURE loaders (loadUsers/loadTeamMembers/
 * loadPlayerProfiles). listIdentityState is deliberately NOT used: it runs
 * legacy-seed cleanup that can WRITE.
 *
 * Output is privacy-minimal: internal ids, groups, sessions, categories.
 * Display names appear ONLY for suspicious combos (first name + id), because
 * those need human follow-up.
 */
import { readFileSync } from 'node:fs';

// ── env from .env.local, values never echoed ────────────────────────────────
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)="?([^"\n]*)"?$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.UPSTASH_REDIS_REST_URL) { console.error('No Redis URL in .env.local'); process.exit(2); }
process.env.NODE_ENV = 'production';

// ── THE TRIPWIRE: only GET and SCAN may reach Redis ─────────────────────────
const realFetch = globalThis.fetch;
let reads = 0;
globalThis.fetch = async (url, init) => {
  let cmd = '';
  try { cmd = String(JSON.parse(init?.body || '[]')[0] || ''); } catch {}
  if (!['GET', 'SCAN'].includes(cmd.toUpperCase())) {
    console.error(`\nBLOCKED non-read Redis command: ${cmd} — aborting audit`);
    process.exit(3);
  }
  reads++;
  return realFetch(url, init);
};

const { kvGet, kvScanKeys } = await import('../api/_kv.js');
const { APP_PREFIX, LEGACY_PREFIX } = await import('../api/_keys.js');
const { loadUsers, loadTeamMembers, loadPlayerProfiles } = await import('../api/_identityStore.js');
const { auditAvailability } = await import('./availability-audit-lib.mjs');

// ── 1. every availability key, all three historical shapes ──────────────────
const keys = [...new Set([
  ...await kvScanKeys(`${APP_PREFIX}:availability:*`),
  ...await kvScanKeys(`${LEGACY_PREFIX}:availability:*`),
])];

function parseKey(k) {
  const body = k.replace(`${APP_PREFIX}:availability:`, '').replace(`${LEGACY_PREFIX}:availability:`, '');
  const parts = body.split(':');
  if (parts.length === 1) return { kind: 'flat', clubId: '(default)', groupId: null, sessionId: parts[0] };
  if (parts.length === 2) return { kind: 'club', clubId: parts[0], groupId: null, sessionId: parts[1] };
  if (parts.length === 4 && parts[1] === 'group') return { kind: 'group', clubId: parts[0], groupId: parts[2], sessionId: parts[3] };
  return { kind: 'unparsed', clubId: '?', groupId: null, sessionId: body };
}

const scopes = [];
for (const k of keys) {
  const store = await kvGet(k);
  if (!store || typeof store !== 'object') continue;
  scopes.push({ ...parseKey(k), key: k, store });
}

// ── 2. identity (pure reads only) ───────────────────────────────────────────
const [users, members, profiles] = await Promise.all([loadUsers(), loadTeamMembers(), loadPlayerProfiles()]);

// ── 3. classify ─────────────────────────────────────────────────────────────
const result = auditAvailability(scopes, { profiles, members });
const { combos, summary } = result;

// ── 4. report, privacy-minimal ──────────────────────────────────────────────
console.log('════════ AVAILABILITY DATA INTEGRITY AUDIT (READ-ONLY) ════════');
console.log(`redis keys scanned: ${keys.length}   stores read: ${scopes.length}`);
console.log(`records examined:   ${summary.records}`);
console.log(`person/session combos: ${summary.combos}`);
console.log(`clubs seen: ${[...new Set(scopes.map(s => s.clubId))].join(', ')}`);
console.log(`groups seen: ${[...new Set(scopes.filter(s => s.groupId).map(s => s.groupId))].join(', ') || '(none group-scoped)'}`);
console.log(`sessions seen: ${[...new Set(scopes.map(s => s.sessionId))].join(', ')}`);
const stamps = combos.flatMap(c => c.records.map(r => r.respondedAt).filter(Boolean)).sort();
console.log(`stamped answers span: ${stamps[0] || '(none)'} → ${stamps[stamps.length - 1] || ''}`);
console.log('───────────────────────────────────────────────────────────────');
console.log(`clean:               ${summary.clean}`);
console.log(`benign-legacy:       ${summary.benignLegacy}`);
console.log(`SUSPICIOUS:          ${summary.suspicious}`);
console.log(`  contradictory:     ${summary.contradictory}`);
console.log(`  duplicate aliases: ${summary.duplicateAliases}`);
console.log(`  group mismatches:  ${summary.groupMismatches}`);
console.log(`  unstamped shadows: ${summary.unstamped}`);
console.log(`  stale shadows:     ${summary.staleShadows}`);
console.log(`  orphan identities: ${summary.orphans}`);
console.log(`  malformed:         ${summary.malformed}`);

const firstName = uid => {
  const u = users.find(x => x.id === uid) || {};
  const p = profiles.find(x => x.userId === uid) || {};
  return String(p.displayName || u.displayName || '').split(' ')[0] || '(unknown)';
};

const interesting = combos.filter(c => c.severity !== 'clean');
if (interesting.length) {
  console.log('─────────────────────── NON-CLEAN COMBOS ──────────────────────');
  for (const c of interesting) {
    const name = c.severity === 'suspicious' ? ` (${firstName(c.personKey)})` : '';
    console.log(`\n[${c.severity.toUpperCase()}] ${c.kind}${c.groupId ? ':' + c.groupId : ''} session=${c.sessionId} person=${c.personKey}${name}`);
    console.log(`  classes: ${c.classes.join(', ')}`);
    for (const r of c.records) console.log(`  record key=${r.key} response=${r.response || '(invalid)'} stamped=${r.respondedAt || 'NO'}`);
    if (c.resolverAnswer) console.log(`  Build R resolves: ${c.resolverAnswer.response} @ ${c.resolverAnswer.respondedAt || '(unstamped)'}${c.resolverAgreesWithNewest === false ? '  ⚠ NOT the newest stamped answer' : ''}`);
    for (const w of c.why) console.log(`  why: ${w}`);
  }
}

// ── 5. Colin — the known case ───────────────────────────────────────────────
console.log('──────────────────────────── COLIN ────────────────────────────');
const colins = profiles.filter(p => /colin/i.test(String(p.displayName || '')));
if (!colins.length) console.log('no roster profile matching "Colin" found');
for (const p of colins) {
  const his = combos.filter(c => c.aliases.includes(String(p.userId).toLowerCase())
    || (p.legacyPlayerId && c.aliases.includes(String(p.legacyPlayerId).toLowerCase())));
  console.log(`Colin userId=${p.userId} legacy=${p.legacyPlayerId || '(none)'} — ${his.length} combos:`);
  for (const c of his) {
    console.log(`  ${c.kind}${c.groupId ? ':' + c.groupId : ''} ${c.sessionId}: ${c.records.length} record(s), severity=${c.severity}, resolver=${c.resolverAnswer?.response || '(none)'}${c.records.length === 1 ? ' — aliases cleaned' : ''}`);
  }
}
console.log('───────────────────────────────────────────────────────────────');
console.log(`Redis commands issued: ${reads} (every one GET or SCAN — writes are tripwired)`);
console.log('Production writes: 0   Repairs: 0   Migrations: 0');
