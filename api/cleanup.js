// api/cleanup.js — ONE-TIME account deduplication endpoint. Remove after use.
// Protected by a one-time token embedded below.
// GET  ?token=<token>               → dry-run audit (shows what would be removed)
// POST { confirm: true, token: ... }→ performs the cleanup

import { kvGet, kvSet, kvDel, kvConfigured } from './_kv.js';
import { key } from './_keys.js';
import { load as loadSubs, save as saveSubs } from './_lib.js';

const CLEANUP_TOKEN = 'ce-cleanup-7f4a9b2e1d3c5a8b';

function norm(v = '') { return String(v || '').trim().toLowerCase(); }

// Accounts to always keep, regardless of name-based matching.
function isKeptUser(u) {
  if (u.id === 'coach-demo') return true;         // Simon Coach (legacy staff)
  if (u.id === 'player-simon-test') return true;  // Simon Test Player (legacy compat)
  if (norm(u.displayName) === 'simon test player 2') return true;
  return false;
}

// Duplicate Simon accounts are any non-kept user whose display name starts with "simon".
function isDuplicateSimon(u) {
  const dn = norm(u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim());
  return dn.startsWith('simon');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Redis not configured' });

  const token = String(
    req.headers?.authorization?.replace(/^Bearer\s+/i, '').trim() ||
    req.query?.token || ''
  );
  if (token !== CLEANUP_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  let body = {};
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }

  const [users, members, profiles, sessions, convs, allSubs] = await Promise.all([
    kvGet(key('identity:users')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('identity:team_members')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('identity:player_profiles')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('identity:sessions')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('chat:convs')).then(v => Array.isArray(v) ? v : []),
    loadSubs(),
  ]);

  const kept    = users.filter(u => isKeptUser(u));
  const removed = users.filter(u => !isKeptUser(u) && isDuplicateSimon(u));
  const untouched = users.filter(u => !isKeptUser(u) && !isDuplicateSimon(u));
  const removedIds = new Set(removed.map(u => u.id));

  const dmConvsToRemove = convs.filter(c => {
    if (!String(c.id || '').startsWith('dm:')) return false;
    return c.id.split(':').slice(1).some(p => removedIds.has(p));
  });

  const report = {
    usersKept:      kept.map(u => ({ id: u.id, displayName: u.displayName })),
    usersRemoved:   removed.map(u => ({ id: u.id, displayName: u.displayName, email: u.email })),
    usersUntouched: untouched.map(u => ({ id: u.id, displayName: u.displayName })),
    membersRemoved:  members.filter(m => removedIds.has(m.userId)).length,
    profilesRemoved: profiles.filter(p => removedIds.has(p.userId)).length,
    sessionsRemoved: sessions.filter(s => removedIds.has(s.userId)).length,
    subsRemoved: allSubs.filter(s =>
      [s.userId, s.playerId, s.legacyPlayerId].some(v => v && removedIds.has(String(v)))
    ).length,
    dmConvsRemoved: dmConvsToRemove.map(c => c.id),
  };

  const isDryRun = req.method !== 'POST' || !body.confirm;
  if (isDryRun) return res.status(200).json({ ok: true, dryRun: true, ...report });

  // ── Execute cleanup ──────────────────────────────────────────────────
  const keptConvIds = new Set(dmConvsToRemove.map(c => c.id));

  await Promise.all([
    kvSet(key('identity:users'),          users.filter(u => !removedIds.has(u.id))),
    kvSet(key('identity:team_members'),   members.filter(m => !removedIds.has(m.userId))),
    kvSet(key('identity:player_profiles'),profiles.filter(p => !removedIds.has(p.userId))),
    kvSet(key('identity:sessions'),       sessions.filter(s => !removedIds.has(s.userId))),
    saveSubs(allSubs.filter(s =>
      ![s.userId, s.playerId, s.legacyPlayerId].some(v => v && removedIds.has(String(v)))
    )),
    dmConvsToRemove.length
      ? kvSet(key('chat:convs'), convs.filter(c => !keptConvIds.has(c.id)))
      : Promise.resolve(),
    ...dmConvsToRemove.map(c => kvDel(key(`chat:conv:${c.id}:msgs`))),
  ]);

  return res.status(200).json({ ok: true, cleaned: true, ...report });
}
