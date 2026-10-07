#!/usr/bin/env node
/**
 * DUPLICATE PLAYERS + STAFF IN AVAILABLE PLAYERS — READ-ONLY production audit
 * (2026-10-07 investigation).
 *
 * Rebuilds, per club and per active group, the pool the Match Centre's
 * Available Players shows in a grouped club — roster rows → client dedupe
 * (src/player-identity.js) → rows whose ACCOUNT has an ACTIVE membership in the
 * group — and reports:
 *
 *   A. DUPLICATE CANDIDATES — pool entries whose names normalise to the same
 *      person (case, spacing, accents folded). For each record: account id,
 *      whether the account record exists, masked email (+ "same email" flag),
 *      account createdAt, membership (id, role, status, joinedAt, approvedBy),
 *      player profile (id, legacyPlayerId), roster row id, live sessions (count,
 *      last seen) and how many stored values reference each id (availability,
 *      medical, publish/selections, messages). A matching name is EVIDENCE TO
 *      READ, never a verdict.
 *   B. STAFF IN THE POOL — entries whose active membership is a staff role:
 *      staffLevel, playerGroupId and who set it (accessChangedBy/At), and
 *      whether a player profile exists (no profile + accessChangedBy 'invite'
 *      = the player-link artefact).
 *   C. INTEGRITY — memberships with no account record (race orphans), and
 *      accounts holding more than one membership in one club.
 *
 * HARD WRITE TRIPWIRE: fetch is wrapped before anything runs; any Redis
 * command other than GET/SCAN/LRANGE aborts the process. ZERO writes.
 * Prints no phone, date of birth, medical or note field; emails are masked.
 *
 * Usage:  node scripts/audit-duplicate-players.mjs [clubId]
 * (reads UPSTASH_REDIS_REST_URL/TOKEN from env or ../.env.local)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
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
const PREFIX = String(process.env.APP_KEY_PREFIX || 'app').replace(/:+$/, '') || 'app';
if (!URL_ || !TOKEN) { console.error('Missing UPSTASH env'); process.exit(2); }

const READ_ONLY = new Set(['GET', 'SCAN', 'LRANGE']);
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (url, options = {}) => {
  let cmd = '';
  try { cmd = String(JSON.parse(options.body || '[]')[0] || '').toUpperCase(); } catch {}
  if (!READ_ONLY.has(cmd)) { console.error(`\nTRIPWIRE — refused non-read Redis command: ${cmd || '(unparsable)'}\n`); process.exit(3); }
  return realFetch(url, options);
};
async function redis(...command) {
  const res = await globalThis.fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await res.json();
  if (data.error) throw new Error(`redis ${command[0]}: ${data.error}`);
  return data.result;
}
const get = async k => { const raw = await redis('GET', k); if (raw == null) return null; try { return JSON.parse(raw); } catch { return raw; } };
async function scan(pattern) {
  const out = []; let cursor = '0';
  do { const [next, keys] = await redis('SCAN', cursor, 'MATCH', pattern, 'COUNT', '500'); cursor = String(next); out.push(...keys); } while (cursor !== '0');
  return [...new Set(out)];
}
const k = name => `${PREFIX}:${name}`;
const s = v => String(v ?? '').trim();
const fold = v => s(v).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const maskEmail = e => { const [u, d] = s(e).toLowerCase().split('@'); if (!d) return e ? '(invalid)' : ''; return `${u.slice(0, 1)}***@${d} #${createHash('sha256').update(s(e).toLowerCase()).digest('hex').slice(0, 6)}`; };

const { dedupeRosterPlayers } = await import(join(here, '..', 'src', 'player-identity.js'));

const [users, members, profiles, teams, sessions] = await Promise.all([
  get(k('identity:users')), get(k('identity:team_members')), get(k('identity:player_profiles')),
  get(k('identity:teams')), get(k('identity:sessions')),
].map(p => p.then(v => (Array.isArray(v) ? v : []))));
const only = process.argv[2] || '';
const userById = new Map(users.map(u => [s(u.id), u]));

// Every stored value that can carry a person's id, read once per club.
async function referenceIndex(clubId) {
  const families = {
    availability: [`${k('availability:')}${clubId}:*`],
    medical: [k(`medical:${clubId}`)],
    publish: [`${k('publish:')}${clubId}:*`, k(`publish:${clubId}`)],   // selections, sheets, attendance registers
  };
  const index = {};
  for (const [fam, patterns] of Object.entries(families)) {
    const keys = [];
    for (const p of patterns) keys.push(...(p.includes('*') ? await scan(p) : [p]));
    const texts = [];
    for (const key of keys) { const v = await redis('GET', key).catch(() => null); if (v) texts.push(String(v)); }
    index[fam] = texts;
  }
  const dmKeys = await scan(`${k('chat:conv:dm:')}*:msgs`);
  index.messages = dmKeys;
  return index;
}
const countRefs = (index, id) => {
  if (!s(id)) return {};
  const out = {};
  for (const [fam, texts] of Object.entries(index)) {
    const n = texts.reduce((acc, t) => acc + (t.split(`"${id}"`).length - 1) + (fam === 'messages' && t.includes(id) ? 1 : 0), 0);
    if (n) out[fam] = n;
  }
  return out;
};

for (const team of teams.filter(t => !only || s(t.id) === only)) {
  const clubId = s(team.id);
  const roster = (await get(k(`roster:${clubId}`)))?.players || [];
  const structure = await get(k(`structure:${clubId}`));
  const mine = members.filter(m => s(m.teamId) === clubId);
  if (!roster.length && !mine.length) continue;
  const groups = (structure?.groups || []).filter(g => g.status !== 'archived');
  const deduped = dedupeRosterPlayers(roster, { users });
  const activeOf = uid => mine.find(m => m.status === 'active' && s(m.userId) === s(uid));
  const index = await referenceIndex(clubId);
  console.log(`\n══ ${team.name || clubId} (${clubId}) — roster rows ${roster.length}, after client dedupe ${deduped.length}, memberships ${mine.length}, groups ${groups.map(g => g.name).join(', ') || '(none)'}`);

  const describe = p => {
    const uid = s(p.userId); const u = userById.get(uid); const m = activeOf(uid);
    const prof = profiles.find(x => s(x.teamId) === clubId && s(x.userId) === uid) || null;
    const sess = sessions.filter(x => s(x.userId) === uid);
    return {
      name: p.name, rowId: s(p.id), userId: uid, accountExists: Boolean(u), email: maskEmail(u?.email || p.email),
      accountCreatedAt: u?.createdAt || null, lastLoginAt: u?.lastLoginAt || null,
      membership: m ? { id: m.id, role: m.role, staffLevel: m.staffLevel || null, status: m.status, playerGroupId: m.playerGroupId || null,
        joinedAt: m.joinedAt || m.createdAt || null, approvedBy: m.approvedBy || null, accessChangedBy: m.accessChangedBy || null, accessChangedAt: m.accessChangedAt || null } : null,
      allMembershipsHere: mine.filter(x => s(x.userId) === uid).map(x => `${x.id}:${x.role}/${x.status}`),
      profile: prof ? { id: prof.id, legacyPlayerId: prof.legacyPlayerId || null, displayName: prof.displayName } : null,
      sessions: { live: sess.length, lastSeenAt: sess.map(x => x.lastSeenAt).sort().pop() || null },
      references: { rowId: countRefs(index, s(p.id)), userId: uid !== s(p.id) ? countRefs(index, uid) : '(same as row id)',
        legacyPlayerId: s(p.legacyPlayerId) && ![s(p.id), uid].includes(s(p.legacyPlayerId)) ? countRefs(index, s(p.legacyPlayerId)) : '(none/same)' },
    };
  };

  for (const g of groups.length ? groups : [{ id: '', name: '(no groups — whole roster)' }]) {
    const pool = deduped.filter(p => {
      if (!g.id) return true;
      const m = activeOf(p.userId); return m && s(m.playerGroupId) === s(g.id);
    }).filter(p => !['coach', 'admin', 'medical staff'].includes(s(p.position).toLowerCase()));
    console.log(`\n── group ${g.name}: Available Players pool = ${pool.length}`);
    const byName = new Map();
    for (const p of pool) { const key = fold(p.name); if (!byName.has(key)) byName.set(key, []); byName.get(key).push(p); }
    const dups = [...byName.values()].filter(list => list.length > 1);
    console.log(`A. duplicate-name candidates: ${dups.length}`);
    for (const list of dups) {
      const ds = list.map(describe);
      const emails = new Set(ds.map(d => d.email.split('#')[1]).filter(Boolean));
      console.log(`\n  PERSON? "${list[0].name}" — ${list.length} records; same email: ${emails.size === 1 && ds.every(d => d.email) ? 'YES' : 'no'}`);
      for (const d of ds) console.log('   ', JSON.stringify(d));
    }
    const staff = pool.filter(p => { const m = activeOf(p.userId); return m && s(m.role).toLowerCase() !== 'player'; });
    console.log(`\nB. staff memberships in the pool: ${staff.length}`);
    for (const p of staff) console.log('   ', JSON.stringify(describe(p)));
  }

  // A2 — the same check over the club's ACTIVE memberships, whatever their
  // group: a race can leave one copy unassigned or without an account, so the
  // second record need not be in the same group's pool.
  const nameOf = m => profiles.find(x => s(x.teamId) === clubId && s(x.userId) === s(m.userId))?.displayName
    || userById.get(s(m.userId))?.displayName || '';
  const byPerson = new Map();
  for (const m of mine.filter(x => x.status === 'active')) {
    const key = fold(nameOf(m)); if (!key) continue;
    if (!byPerson.has(key)) byPerson.set(key, []); byPerson.get(key).push(m);
  }
  const clubDups = [...byPerson.values()].filter(list => list.length > 1);
  console.log(`\nA2. club-wide: active memberships sharing a person's name: ${clubDups.length}`);
  for (const list of clubDups) {
    console.log(`\n  PERSON? "${nameOf(list[0])}" — ${list.length} active memberships`);
    for (const m of list) {
      const u = userById.get(s(m.userId));
      const sess = sessions.filter(x => s(x.userId) === s(m.userId));
      console.log('   ', JSON.stringify({ membershipId: m.id, userId: m.userId, accountExists: Boolean(u), email: maskEmail(u?.email),
        role: m.role, staffLevel: m.staffLevel || null, playerGroupId: m.playerGroupId || null, joinedAt: m.joinedAt || null, approvedBy: m.approvedBy || null,
        rosterRows: roster.filter(r => s(r.userId) === s(m.userId)).map(r => r.id), sessions: sess.length,
        references: countRefs(index, s(m.userId)) }));
    }
  }

  const orphans = mine.filter(m => !userById.has(s(m.userId)));
  console.log(`\nC. memberships with NO account record: ${orphans.length}`);
  for (const m of orphans) {
    const prof = profiles.find(x => s(x.teamId) === clubId && s(x.userId) === s(m.userId));
    console.log('   ', JSON.stringify({ membershipId: m.id, userId: m.userId, role: m.role, status: m.status, playerGroupId: m.playerGroupId || null,
      joinedAt: m.joinedAt || null, profileName: prof?.displayName || null, rosterRows: roster.filter(r => s(r.userId) === s(m.userId)).map(r => r.id),
      references: countRefs(index, s(m.userId)) }));
  }
  const perUser = new Map();
  for (const m of mine) perUser.set(s(m.userId), (perUser.get(s(m.userId)) || 0) + 1);
  const multi = [...perUser.entries()].filter(([, n]) => n > 1);
  console.log(`C. accounts with more than one membership in this club: ${multi.length}${multi.length ? ' — ' + multi.map(([u, n]) => `${u}×${n}`).join(', ') : ''}`);
}
console.log('\n(read-only: no command other than GET/SCAN/LRANGE was sent)');
