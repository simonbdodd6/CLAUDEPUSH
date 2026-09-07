#!/usr/bin/env node
/**
 * ROSTER SYNC HARDENING — READ-ONLY production audit.
 *
 * Measures the drift between canonical playing memberships and the roster
 * projection, per club:
 *
 *   • active playing memberships (the canonical truth)
 *   • …with a roster row  /  …WITHOUT one (the new-joiner lag population)
 *   • group distribution of the gap
 *   • duplicate roster rows (two rows resolving to one person)
 *   • unlinked rows (no account behind them — trialist/CSV; legitimate)
 *   • rows whose member is archived/removed (cleanup candidates, NOT repaired)
 *
 * HARD WRITE TRIPWIRE: global fetch is wrapped BEFORE anything else loads;
 * any Redis command other than GET/MGET/SCAN/LRANGE/EXISTS/TTL aborts the
 * process. This script performs ZERO writes by construction.
 *
 * Usage:  node scripts/audit-roster-projection.mjs
 * (reads UPSTASH_REDIS_REST_URL/TOKEN from env or ../.env.local)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ── env (no dotenv dependency) ──────────────────────────────────────────────
if (!process.env.UPSTASH_REDIS_REST_URL) {
  try {
    for (const line of readFileSync(join(here, '..', '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* env must already be set */ }
}
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!URL_ || !TOKEN) { console.error('Missing UPSTASH env'); process.exit(2); }

// ── WRITE TRIPWIRE ──────────────────────────────────────────────────────────
const READ_ONLY = new Set(['GET', 'MGET', 'SCAN', 'LRANGE', 'EXISTS', 'TTL', 'TYPE', 'KEYS']);
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (url, options = {}) => {
  let cmd = '';
  try { cmd = String(JSON.parse(options.body || '[]')[0] || '').toUpperCase(); } catch {}
  if (!READ_ONLY.has(cmd)) {
    console.error(`\nTRIPWIRE — refused non-read Redis command: ${cmd || '(unparsable)'}\n`);
    process.exit(3);
  }
  return realFetch(url, options);
};

async function redis(...command) {
  const res = await globalThis.fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
const getJson = async k => { const raw = await redis('GET', k); try { return raw == null ? null : JSON.parse(raw); } catch { return null; } };

// Pure helpers from the REAL access-scope module (no store imports, no I/O).
const { resolvePlayerGroup, isPlayingMember } = await import(join(here, '..', 'api', '_accessScope.js'));

// ── load (raw keys; loaders like loadPlayerProfiles can WRITE when healing) ─
const [users, members, profiles, teams] = await Promise.all([
  getJson('app:identity:users'),
  getJson('app:identity:team_members'),
  getJson('app:identity:player_profiles'),
  getJson('app:identity:teams'),
]);
const teamIds = [...new Set((members || []).map(m => String(m.teamId)))];

for (const teamId of teamIds) {
  const [structure, rosterRec] = await Promise.all([
    getJson(`app:structure:${teamId}`),
    getJson(`app:roster:${teamId}`),
  ]);
  const roster = rosterRec?.players || [];
  const mine = (members || []).filter(m => String(m.teamId) === teamId);
  const active = mine.filter(m => m.status === 'active');
  const playing = active.filter(m => isPlayingMember(m));
  const inactivePlaying = mine.filter(m => m.status !== 'active' && isPlayingMember(m));

  const profFor = m => (profiles || []).find(p => p.teamMemberId === m.id ||
    (String(p.teamId) === teamId && String(p.userId) === String(m.userId))) || null;
  const rowsFor = m => {
    const prof = profFor(m);
    const lid = String(prof?.legacyPlayerId || '');
    return roster.filter(r =>
      String(r.userId || '') === String(m.userId) ||
      String(r.id || '') === String(m.userId) ||
      (lid && (String(r.legacyPlayerId || '') === lid || String(r.id || '') === lid)));
  };

  const missing = playing.filter(m => rowsFor(m).length === 0);
  const dupes = playing.filter(m => rowsFor(m).length > 1);
  const groupName = gid => (structure?.groups || []).find(g => g.id === gid)?.name || gid || '(none)';

  const linkedIds = new Set();
  for (const m of mine) rowsFor(m).forEach(r => linkedIds.add(String(r.id)));
  const unlinked = roster.filter(r => !linkedIds.has(String(r.id)) && !String(r.userId || ''));
  const strays = roster.filter(r => !linkedIds.has(String(r.id)) && String(r.userId || ''));
  const inactiveRows = roster.filter(r => {
    const uid = String(r.userId || '');
    if (!uid) return false;
    const m = mine.find(x => String(x.userId) === uid);
    return m && m.status !== 'active';
  });

  console.log(`\n═══ club ${teamId} — roster updatedAt=${rosterRec?.updatedAt || '(no record)'} by=${rosterRec?.updatedBy || ''}`);
  console.log(`memberships: ${mine.length} total, ${active.length} active, ${playing.length} active PLAYING, ${inactivePlaying.length} inactive playing`);
  console.log(`roster rows: ${roster.length} — linked ${linkedIds.size}, unlinked(no account) ${unlinked.length}, stray(userId w/o member) ${strays.length}, rows of inactive members ${inactiveRows.length}`);
  console.log(`ACTIVE PLAYING WITHOUT ROSTER ROW: ${missing.length}`);
  for (const m of missing) {
    const u = (users || []).find(x => x.id === m.userId) || {};
    const g = resolvePlayerGroup(m, structure);
    console.log(`   • ${u.displayName || m.userId} (member ${m.id}) — group ${groupName(g.groupId)} [${g.source}]${g.needsAssignment ? ' NEEDS-ASSIGNMENT' : ''}`);
  }
  if (dupes.length) {
    console.log(`DUPLICATE ROWS for ${dupes.length} member(s):`);
    for (const m of dupes) {
      const u = (users || []).find(x => x.id === m.userId) || {};
      console.log(`   • ${u.displayName || m.userId}: rows ${rowsFor(m).map(r => r.id).join(', ')}`);
    }
  }
  const byGroup = {};
  for (const m of playing) {
    const g = groupName(resolvePlayerGroup(m, structure).groupId);
    byGroup[g] = (byGroup[g] || 0) + 1;
  }
  console.log('active playing by group:', JSON.stringify(byGroup));
  if (unlinked.length) console.log('unlinked rows:', unlinked.map(r => r.name).join(' | '));
  if (strays.length) console.log('stray rows:', strays.map(r => `${r.name}(${r.userId})`).join(' | '));
  if (inactiveRows.length) console.log('rows of inactive members:', inactiveRows.map(r => r.name).join(' | '));
}
console.log(`\nteams store lists ${Array.isArray(teams) ? teams.length : 0} club(s). ZERO writes performed (tripwire armed).`);
