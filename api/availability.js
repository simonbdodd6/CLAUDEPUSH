// Availability replies from notification actions or the player app.
// Also handles dev-only seed/reset actions when DEV_LOGIN=true.
import { loadAvailability, saveAvailability, loadAvailabilityForIdentity, resolveAvailabilityForIdentities,
         loadGroupAvailability, saveGroupAvailability,
         loadGroupAvailabilityForIdentity, resolveGroupAvailabilityForIdentities } from './_availabilityStore.js';
import { loadClubStructure, activeGroups, INITIAL_GROUP_ID } from './_structureStore.js';
import { assertOperationalGroup, operationalGroupsFor, resolvePlayerGroup } from './_accessScope.js';
import { setCors } from './_http.js';
import { kvConfigured, kvGet } from './_kv.js';
import { key } from './_keys.js';
import { DEFAULT_TEAM, resolveSessionFromRequest, listIdentityState, loadTeamMembers } from './_identityStore.js';
import { requireTenantPermission, tenantTeamId, PERM } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

// ── GROUP CONTEXT (D1b Pass 3 — the storage split) ─────────────────────────
// Availability is a GROUP resource. Two derivations, never interchangeable:
//
//   PLAYER WRITES/SELF-READS derive the group from the SESSION membership's
//   playerGroupId (where the person PLAYS) — an arbitrary client group id is
//   never trusted, and coaching scope never manufactures a player group. A
//   membership that predates groups resolves through resolvePlayerGroup's
//   single-group rule, else to the INITIAL group — the documented owner of
//   all pre-structure club data. That is compatibility, not a guess: the
//   club's history genuinely belongs to its original (Seniors) group.
//
//   COACH READS/ACTIONS name a group explicitly (?group=) and are asserted
//   against the caller's staff scope; with exactly one operable group it is
//   the default, so today's Seniors-only clients keep working unchanged.

/** The group whose keyspace a PLAYER identity reads and writes. */
async function playerGroupForIdentity(clubId, identity) {
  const candidates = [identity?.userId, identity?.playerId, identity?.legacyPlayerId]
    .map(v => String(v || '').trim()).filter(Boolean);
  const [structure, members] = await Promise.all([loadClubStructure(clubId), loadTeamMembers()]);
  const member = members.find(m =>
    String(m.teamId) === String(clubId) && m.status === 'active' &&
    candidates.some(c => String(m.userId) === c));
  const { groupId } = resolvePlayerGroup(member || {}, structure);
  return groupId || INITIAL_GROUP_ID;
}

/** The group a COACH request operates on: asserted, or the single default. */
async function coachGroupForRequest(sessionContext, requestedGroup) {
  const structure = await loadClubStructure(tenantTeamId(sessionContext));
  const requested = String(requestedGroup || '').trim();
  if (requested) {
    const group = assertOperationalGroup(sessionContext, structure, requested, { as: 'staff' });
    return group.id;
  }
  const mine = operationalGroupsFor(sessionContext?.teamMember, structure, { as: 'staff' });
  if (mine.length === 1) return mine[0].id;
  const e = new Error('Choose which group to view');
  e.status = 400;
  throw e;
}

const RESPONSES = new Set(['available', 'unavailable', 'maybe']);
const REASONS   = new Set(['injury', 'work', 'holiday', 'family', 'other', '']);
const DEMO_SESSIONS = ['tue', 'thu', 'game'];

const DEMO_PLAYERS = [
  { name: 'Simon Test Player', userId: 'player-simon-test', playerId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', response: 'available',   reason: '' },
  { name: 'Jake Smith',        userId: 'jake-smith',        playerId: 'jake-smith',        legacyPlayerId: '',           response: 'unavailable', reason: 'injury' },
  { name: 'Tom Williams',      userId: 'tom-williams',      playerId: 'tom-williams',       legacyPlayerId: '',           response: 'maybe',       reason: 'work' },
  { name: 'Ben Jones',         userId: 'ben-jones',         playerId: 'ben-jones',          legacyPlayerId: '',           response: 'no-reply',    reason: '' },
];

function validSessionId(sessionId) {
  return /^[a-z0-9_-]{1,80}$/i.test(String(sessionId || ''));
}

// Session IDs the coach has saved via /api/publish, scoped by team with a
// fallback to the pre-scoping legacy key for the default team. Falls back
// to the historic tue/thu/game trio when nothing is published yet, so
// behaviour is unchanged for existing deployments.
async function activeSessionIds(teamId = DEFAULT_TEAM.id) {
  let published = await kvGet(key(`publish:${teamId}:sessions`));
  if (!Array.isArray(published) && teamId === DEFAULT_TEAM.id) {
    published = await kvGet(key('publish:sessions'));
  }
  const ids = (Array.isArray(published) ? published : [])
    .map(s => String(s?.id || ''))
    .filter(id => validSessionId(id))
    .slice(0, 30);
  return ids.length ? ids : DEMO_SESSIONS;
}

function availabilityIdentityFromSession(sessionContext = {}) {
  const user = sessionContext?.user || {};
  const profile = sessionContext?.playerProfile || {};
  const userId = user.id || '';
  if (!userId) return null;
  return {
    key: userId,
    userId,
    playerId: profile.userId || userId,
    legacyPlayerId: profile.legacyPlayerId || '',
    label: profile.displayName || user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.name || user.email || userId,
  };
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  // ── Dev-only seed/reset actions ─────────────────────────────────────────────
  if (req.method === 'POST' && process.env.DEV_LOGIN === 'true') {
    const { action, sessions: rawSessions, players: rawPlayers } = req.body || {};
    if (action === 'reset_availability' || action === 'seed_availability') {
      const sessions = Array.isArray(rawSessions) && rawSessions.length ? rawSessions : DEMO_SESSIONS;
      const players  = Array.isArray(rawPlayers) && rawPlayers.length ? rawPlayers : DEMO_PLAYERS;
      // RC4.9B: DEV_LOGIN alone is NOT authorisation. These actions seed and wipe a
      // whole club's availability, so they also require the danger-zone permission —
      // a player (or anonymous caller) could otherwise clear their club's board on
      // any environment where DEV_LOGIN was left enabled.
      let devTenant;
      try { devTenant = await requireTenantPermission(req, PERM.DANGER_ZONE); }
      catch (error) { return sendAuthError(res, error); }
      const devTeamId = devTenant.teamId || DEFAULT_TEAM.id;

      if (action === 'reset_availability') {
        await Promise.all(sessions.map(sid => saveAvailability(devTeamId, sid, {})));
        return res.status(200).json({ ok: true, action: 'reset_availability', cleared: sessions });
      }

      if (action === 'seed_availability') {
        const counts = {};
        for (const sid of sessions) {
          const existing = await loadAvailability(devTeamId, sid);
          for (const p of players) {
            if (p.response === 'no-reply') continue;
            const k = p.userId || p.name;
            if (!k) continue;
            existing[k] = {
              response:       p.response || 'available',
              reason:         p.reason   || '',
              respondedAt:    new Date().toISOString(),
              label:          p.name || k,
              userId:         p.userId         || '',
              playerId:       p.playerId        || p.userId || '',
              legacyPlayerId: p.legacyPlayerId  || '',
            };
          }
          await saveAvailability(devTeamId, sid, existing);
          counts[sid] = Object.keys(existing).length;
        }
        return res.status(200).json({ ok: true, action: 'seed_availability', sessions: counts });
      }
    }
  }

  // ── Dev-only seed GET status ────────────────────────────────────────────────
  if (req.method === 'GET' && req.query?._dev === 'status' && process.env.DEV_LOGIN === 'true') {
    const sessions = String(req.query.sessions || DEMO_SESSIONS.join(',')).split(',').filter(Boolean);
    // Diagnostic read of a whole club's board — coach-level (REPORTS), never a player.
    let devTenant;
    try { devTenant = await requireTenantPermission(req, PERM.REPORTS); }
    catch (error) { return sendAuthError(res, error); }
    const devTeamId = devTenant.teamId || DEFAULT_TEAM.id;
    const data = {};
    await Promise.all(sessions.map(async sid => {
      const entries = await loadAvailability(devTeamId, sid);
      data[sid] = Object.entries(entries).map(([k, val]) => ({
        key: k,
        label:       typeof val === 'string' ? k : (val.label || k),
        response:    typeof val === 'string' ? val : (val.response || ''),
        reason:      typeof val === 'string' ? '' : (val.reason || ''),
        respondedAt: typeof val === 'string' ? null : (val.respondedAt || null),
      }));
    }));
    return res.status(200).json({ ok: true, sessions: data });
  }

  if (req.method === 'GET') {
    // Player self-GET: returns the logged-in player's own responses across all sessions.
    if (req.query?.myResponse === '1') {
      const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
      const identity = availabilityIdentityFromSession(sessionContext);
      if (!identity) return res.status(200).json({ responses: {} });
      // Read by IDENTITY across every stored session, not a published session-id
      // list. The player's app can POST under a sessionId the published list no
      // longer contains (stale schedule, republished/custom ids) — constraining
      // the read to that list made this self-read return {} even though the answer
      // was persisted. Scanning by identity finds the latest saved answer wherever
      // it lives. Write path and storage format are unchanged.
      // GROUP-scoped self-read: a player's answers live in THEIR group's
      // keyspace (with the initial group's legacy fallback inside the loader).
      const clubId = tenantTeamId(sessionContext);
      const myGroup = await playerGroupForIdentity(clubId, identity);
      const found = await loadGroupAvailabilityForIdentity(clubId, myGroup, identity);
      const result = {};
      for (const [sid, v] of Object.entries(found)) result[sid] = { response: v.response, reason: v.reason || '' };
      return res.status(200).json({ responses: result });
    }

    // Coach board read — resolves every roster player's availability through the
    // SAME shared resolution layer as the player self-read (one resolver, one
    // interpretation). Returns { resolved: { <identifier>: { sessionId: {response,
    // reason} } } } indexed by each player's userId + legacyPlayerId (lowercased),
    // so the coach board attaches answers by identity regardless of which (stale /
    // republished / custom) sessionId they were saved under.
    if (req.query?.resolveRoster === '1') {
      let tenant;
      try { tenant = await requireTenantPermission(req, PERM.REPORTS); }
      catch (error) { return sendAuthError(res, error); }
      // GROUP-scoped board: the caller names (or single-defaults to) an
      // operable group and reads exactly that group's records. A Seniors
      // answer can never surface on the U18 board, and vice versa.
      let boardGroup;
      try { boardGroup = await coachGroupForRequest(tenant, req.query?.group); }
      catch (error) { return sendAuthError(res, error); }
      const roster = await listIdentityState(tenant.teamId).catch(() => ({ player_profiles: [] }));
      const identities = (roster.player_profiles || []).map(p => ({
        userId: p.userId, playerId: p.userId, legacyPlayerId: p.legacyPlayerId || '',
      }));
      const resolvedList = await resolveGroupAvailabilityForIdentities(tenant.teamId, boardGroup, identities);
      const resolved = {};
      resolvedList.forEach(({ identity, answers }) => {
        if (!answers || !Object.keys(answers).length) return;
        const shaped = {};
        for (const [sid, v] of Object.entries(answers)) shaped[sid] = { response: v.response, reason: v.reason || '', respondedAt: v.respondedAt || null };
        [identity.userId, identity.legacyPlayerId].filter(Boolean).forEach(id => { resolved[String(id).toLowerCase()] = shaped; });
      });
      return res.status(200).json({ resolved });
    }

    let rawTenant;
    try {
      rawTenant = await requireTenantPermission(req, PERM.REPORTS);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const sessionId = req.query?.sessionId || 'game';
    if (!validSessionId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });
    // GROUP-scoped read (legacy flat keys reachable only through the initial
    // group's documented fallback inside the loader).
    let listGroup;
    try { listGroup = await coachGroupForRequest(rawTenant, req.query?.group); }
    catch (error) { return sendAuthError(res, error); }
    const responses = await loadGroupAvailability(rawTenant.teamId, listGroup, sessionId);
    const list = Object.entries(responses).map(([k, value]) => ({
      key:            k,
      label:          typeof value === 'string' ? k     : value?.label          || k,
      userId:         typeof value === 'string' ? ''    : value?.userId         || '',
      playerId:       typeof value === 'string' ? ''    : value?.playerId       || '',
      // legacyPlayerId is the invite id (inv-…). A player answering while
      // authenticated is stored under their permanent user_ id, but the coach's
      // roster record is often keyed by this invite id — so it is frequently the
      // ONLY shared identifier. The player self-read already matches on it; the
      // coach read must expose it too or the coach sees "No Reply".
      legacyPlayerId: typeof value === 'string' ? ''    : value?.legacyPlayerId || '',
      response:       typeof value === 'string' ? value : value?.response,
      reason:         typeof value === 'string' ? ''    : value?.reason         || '',
      respondedAt:    typeof value === 'string' ? null  : value?.respondedAt,
    }));
    return res.status(200).json({ sessionId, responses: list, count: list.length });
  }

  if (req.method === 'POST') {
    const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
    const { action: postAction, response, sessionId, reason, sessions: clearSessions } = req.body || {};

    // ── Coach-gated clear_week action ──────────────────────────────────────────
    if (postAction === 'clear_week') {
      let coachSession;
      try { coachSession = await requireTenantPermission(req, PERM.MANAGE_PLAYERS); }
      catch (error) { return sendAuthError(res, error); }

      // ── D1b — clearing is a GROUP action, never a club-wide wipe ──
      // MANAGE_PLAYERS alone is held by every manager and coach profile, so on
      // its own it let a U18 manager blank the Seniors board. The group must be
      // one this caller may actually operate in, and only that group is
      // cleared — there is deliberately no "clear every group".
      const structure = await loadClubStructure(coachSession.teamId);
      const requested = String(req.body?.group || '').trim();
      let group;
      try {
        if (requested) {
          group = assertOperationalGroup(coachSession, structure, requested, { as: 'staff' });
        } else {
          const mine = operationalGroupsFor(coachSession.teamMember, structure, { as: 'staff' });
          if (mine.length !== 1) {
            return res.status(400).json({ error: 'Choose which group to clear' });
          }
          group = mine[0];
        }
      } catch (error) {
        return res.status(error.status || 403).json({ error: error.message });
      }

      const ids = Array.isArray(clearSessions) && clearSessions.length ? clearSessions : await activeSessionIds(coachSession.teamId);
      const validIds = ids.filter(id => validSessionId(id));
      // The storage split (D1b Pass 3): reads and writes both live on the
      // GROUP key now, so clearing writes empty group records — clearing U18
      // can never blank the Seniors board. For the INITIAL group an empty
      // group-scoped record also shadows the legacy club/flat fallback, so
      // its history disappears from the board without being destroyed.
      await Promise.all(validIds.map(sid => saveGroupAvailability(coachSession.teamId, group.id, sid, {})));
      return res.status(200).json({ ok: true, action: 'clear_week', cleared: validIds, group: { id: group.id, name: group.name } });
    }

    if (!validSessionId(sessionId) || !RESPONSES.has(response)) {
      return res.status(400).json({ error: 'valid sessionId and response (available, unavailable or maybe) are required' });
    }
    const safeReason = REASONS.has(reason) ? (reason || '') : '';

    // ── TENANT WALL — the session-less write fallback is CLOSED ────────────
    // An availability answer is a WRITE into one club's keyspace, so it
    // requires an authenticated session: the club AND the group both derive
    // from the caller's own server-side membership, never from the request
    // body. The old compatibility path (identity looked up from a client-
    // supplied push-subscription `endpoint`, club defaulting to the DEFAULT
    // team) let an expired/missing session silently write into the default
    // tenant — a real stray production record proved it. An old client
    // posting with a lapsed session now gets a clear 401 (and writes
    // nothing anywhere) instead of polluting another club's board.
    const identity = availabilityIdentityFromSession(sessionContext);
    if (!identity) {
      return res.status(401).json({ ok: false, error: 'Your session has expired — please sign in to save your availability', code: 'session_required' });
    }
    const writeTeamId = tenantTeamId(sessionContext);
    if (!writeTeamId) {
      return res.status(403).json({ ok: false, error: 'Your account is not an active member of a club', code: 'no_membership' });
    }
    const writeGroup = await playerGroupForIdentity(writeTeamId, identity);
    const responses = await loadGroupAvailability(writeTeamId, writeGroup, sessionId);
    responses[identity.key] = {
      response,
      reason: safeReason,
      respondedAt: new Date().toISOString(),
      label: identity.label,
      userId: identity.userId,
      playerId: identity.playerId,
      legacyPlayerId: identity.legacyPlayerId,
    };
    await saveGroupAvailability(writeTeamId, writeGroup, sessionId, responses);
    return res.status(200).json({ ok: true, label: identity.label, userId: identity.userId, playerId: identity.playerId, response, reason: safeReason, sessionId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
