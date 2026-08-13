// api/publish.js — Published player-facing state: sessions list + squad sheet.
//
// The coach's editing state stays in their browser localStorage. When they
// explicitly publish (sessions saved or squad published), the player-visible
// subset is written here so every player device can fetch it on load.
//
// GET  /api/publish?type=all|sessions|squad
//   → any authenticated user; returns { sessions, squad }
//
// POST /api/publish { type: 'sessions', data: [...] }
//   → coach/admin only; upserts the full sessions list
//
// POST /api/publish { type: 'squad', data: { ...matchCentre, formationNames, benchPlayers } }
//   → coach/admin only; saves or clears the published squad
//
// DELETE /api/publish { type: 'squad'|'sessions' }
//   → coach/admin only; clears the named store

import { kvGet, kvSet, kvDel, kvLpush, kvLrange, kvScanKeys } from './_kv.js';
import { key, APP_PREFIX, LEGACY_PREFIX } from './_keys.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { DEFAULT_TEAM, loadTeamMembers, loadUsers } from './_identityStore.js';
import { requireTenantPermission, requireTenantSession, requireClubManage, assertSameTenant, can, PERM } from './_tenant.js';
import {
  loadClubStructure, createGroup, createTeam, renameGroup, renameTeam,
  setGroupStatus, setTeamStatus, activeGroups,
} from './_structureStore.js';
import { effectiveAccessScope, effectiveEligibility,
         operationalGroupsFor, defaultOperationalGroup, assertOperationalGroup } from './_accessScope.js';
import {
  loadMedicalRecord, activeCases, upsertCase, resolveCase, projectPlayer,
} from './_medicalStore.js';
import { canonicalRole } from './_permissions.js';
import { load, save } from './_lib.js';
import { auditLog, requestIp } from './_security.js';
import { findDuplicate } from '../src/fixture-import.js';
import { runWeeklyAvailabilityCheck } from './cron.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

// All published state and the roster are namespaced by the session's teamId
// so one club's coach can never read or overwrite another club's data.
// The un-scoped legacy keys (publish:sessions / publish:squad / roster) held
// the default team's data before scoping — reads fall back to them for the
// default team only; writes always go to the scoped key. No migration needed.
const MAX_PLAYERS = 200;

// ── Test-data identification — exported for unit testing ───────────────────
// Conservative: only records tied to the known test player account or
// explicitly labelled "TEST" are flagged. Real club data is never touched.
export const TEST_USER_IDS = new Set(['player-simon-test']);
export const TEST_LABEL_RE = /\btest\b/i;

export function isTestSession(s)       { return TEST_LABEL_RE.test(String(s?.title || '')); }
export function isTestAvailEntry(l, v) { return TEST_USER_IDS.has(v?.userId) || TEST_USER_IDS.has(v?.playerId) || TEST_LABEL_RE.test(String(l)); }
export function isTestChatMessage(m)   { return TEST_USER_IDS.has(m?.senderId); }
export function isTestRosterPlayer(p)  { return TEST_USER_IDS.has(p?.id) || TEST_LABEL_RE.test(String(p?.name || '')); }

function sessionsKey(teamId) { return key(`publish:${teamId}:sessions`); }
function squadKey(teamId)    { return key(`publish:${teamId}:squad`); }
// Per-coach PRIVATE match-day draft — scoped to teamId + the owning userId, so
// each coach has their own working squad that no other coach can overwrite. This
// is NOT player-facing; only the explicit `squad` key is the official squad.
function draftKey(teamId, userId) { return key(`publish:${teamId}:draft:${userId}`); }
function rosterKey(teamId)   { return key(`roster:${teamId}`); }
function clubKey(teamId)     { return key(`club:${teamId}`); }

async function readScoped(scopedKey, legacyName, teamId) {
  const scoped = await kvGet(scopedKey);
  if (scoped !== null && scoped !== undefined) return scoped;
  if (teamId === DEFAULT_TEAM.id) return kvGet(key(legacyName));
  return null;
}

// Per-block whitelist: players see ONLY the schedule (time + what) — the coach's
// private cues (keyFocus / per-block coach assignment / internal ids) are dropped.
function sanitiseBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(b => ({ time: String(b?.time || ''), activity: String(b?.activity || '') }))
    .filter(b => b.activity);
}

function sanitiseSessions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => ({
    id:          String(s.id          || ''),
    title:       String(s.title       || ''),
    type:        String(s.type        || 'Training'),
    date:        String(s.date        || ''),
    startTime:   String(s.startTime   || ''),
    endTime:     String(s.endTime     || ''),
    location:    String(s.location    || ''),
    coachName:   String(s.coachName   || ''),  // lead coach name (not private)
    focus:       String(s.focus       || ''),  // objectives
    deadline:    String(s.deadline    || ''),
    blocks:      sanitiseBlocks(s.blocks),       // drill schedule (time + activity only)
    published:   Boolean(s.published),
    publishedAt: s.publishedAt || null,
  })).filter(s => s.id);
}

/**
 * A client may name the fixture a squad or draft belongs to, but never decide
 * it. The club record is the source of truth, so a forged id, an unknown id or
 * another club's fixture is refused. Omitting it stays valid: every existing
 * production record predates this field and must keep saving normally.
 */
async function assertFixtureBelongsToClub(teamId, fixtureId) {
  const id = String(fixtureId || '').trim();
  if (!id) return '';                       // legacy-safe: no claim made
  const club = (await kvGet(clubKey(teamId))) || {};
  const fixtures = Array.isArray(club.fixtures) ? club.fixtures : [];
  if (!fixtures.some(f => String(f?.id || '') === id)) {
    const e = new Error('Unknown fixture for this club');
    e.status = 404;
    throw e;
  }
  return id;
}

function sanitiseSquad(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const formationNames = raw.formationNames && typeof raw.formationNames === 'object'
    ? Object.fromEntries(
        Object.entries(raw.formationNames)
          .map(([k, v]) => [String(k), String(v || '')])
          .filter(([, v]) => v)
      )
    : {};
  const benchPlayers = Array.isArray(raw.benchPlayers)
    ? raw.benchPlayers.map(n => String(n || ''))
    : [];
  return {
    published:     Boolean(raw.published),
    publishedAt:   raw.publishedAt  || null,
    opposition:    String(raw.opposition    || ''),
    competition:   String(raw.competition   || ''),
    kickoffDate:   String(raw.kickoffDate   || ''),
    kickoffTime:   String(raw.kickoffTime   || ''),
    arrivalTime:   String(raw.arrivalTime   || ''),
    venue:         String(raw.venue         || ''),
    kit:           String(raw.kit           || ''),
    announcement:  String(raw.announcement  || ''),
    gamePlan:      String(raw.gamePlan      || ''),
    formationNames,
    benchPlayers,
    // The fixture this squad belongs to. Validated at the request boundary
    // before it reaches here — sanitisation preserves an already-authorised
    // identifier, it does not authorise one. Absent on every legacy record,
    // and absent is a valid state: nothing is inferred to fill it.
    fixtureId:     String(raw.fixtureId || ''),
  };
}

// ── Roster sub-resource (formerly /api/roster, folded in to stay under the
// Vercel Hobby 12-function limit; /api/roster rewrites here with
// ?resource=roster). Coach/admin only in BOTH directions — the roster
// carries phone + medical data, so players never read it. Photos (base64
// data-URLs) are stripped and stay device-local.

function sanitiseRosterPlayers(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, MAX_PLAYERS).map(p => {
    if (!p || typeof p !== 'object') return null;
    const { photo, ...rest } = p;
    return { ...rest, id: String(p.id || ''), name: String(p.name || '') };
  }).filter(p => p && p.id && p.name);
}

async function rosterHandler(req, res) {
  let session;
  try {
    session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
  } catch (error) {
    return sendAuthError(res, error);
  }

  if (req.method === 'GET') {
    const stored = (await readScoped(rosterKey(session.teamId), 'roster', session.teamId)) || null;
    const all = stored?.players || [];

    // ── D1b — OPERATIONAL group filtering, server-side ──
    // Club administration legitimately reads the whole club, so a caller only
    // gets a group-filtered roster when they ASK for a group. A named group is
    // authorised against the caller's own capacity, so a forged ?group= cannot
    // reach another squad. Omitting it preserves the existing club-wide read
    // that Club Admin depends on.
    const requested = String(req.query?.group || '').trim();
    if (!requested) {
      return res.status(200).json({
        ok: true, players: all,
        updatedAt: stored?.updatedAt || null, updatedBy: stored?.updatedBy || null,
      });
    }

    const structure = await loadClubStructure(session.teamId);
    const asCapacity = canonicalRole(session.teamMember) === 'player' ? 'player' : 'staff';
    let group;
    try {
      group = assertOperationalGroup(session, structure, requested, { as: asCapacity });
    } catch (error) {
      return res.status(error.status || 403).json({ ok: false, error: error.message });
    }

    // playerGroupId on the MEMBERSHIP is the authority — never a team name,
    // age text or roster label.
    const members = await loadTeamMembers();
    const mine = members.filter(m => String(m.teamId) === String(session.teamId));
    const groupOf = p => mine.find(m => String(m.userId || '') === String(p.userId || '') && p.userId)?.playerGroupId || '';
    const players = all.filter(p => String(groupOf(p)) === group.id);

    return res.status(200).json({
      ok: true, players,
      group: { id: group.id, name: group.name },
      unassigned: all.filter(p => !groupOf(p)).length,   // honest, never silently placed
      updatedAt: stored?.updatedAt || null, updatedBy: stored?.updatedBy || null,
    });
  }

  if (req.method === 'POST') {
    const players = sanitiseRosterPlayers(req.body?.players);
    if (!players) return res.status(400).json({ error: 'players array required' });
    const record = {
      players,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };
    await kvSet(rosterKey(session.teamId), record);
    return res.status(200).json({ ok: true, count: players.length, updatedAt: record.updatedAt });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Medical sub-resource (RC4.7) ──────────────────────────────────────────
// The club's SHARED caseload. Authorisation is MEDICAL_ACCESS and nothing
// else: MANAGE_PLAYERS and PUBLISH_SQUADS are deliberately NOT accepted as
// substitutes, because medical information is a separate authorisation that
// coach and manager access never implies. A player granted Medical reaches
// this; a plain player does not.
//
// The response carries a medical-scoped projection of the roster — enough to
// identify who a case belongs to, and nothing else. Phone numbers, emails,
// emergency contacts and guardian details never appear here.

async function medicalHandler(req, res) {
  let session;
  try {
    session = await requireTenantPermission(req, PERM.MEDICAL_ACCESS);
  } catch (error) {
    return sendAuthError(res, error);
  }

  if (req.method === 'GET') {
    const [record, roster, members, structure] = await Promise.all([
      loadMedicalRecord(session.teamId),
      readScoped(rosterKey(session.teamId), 'roster', session.teamId),
      loadTeamMembers(),
      loadClubStructure(session.teamId),
    ]);
    const mine = members.filter(m => String(m.teamId) === String(session.teamId));

    // ── D1b — GROUP ISOLATION, enforced here rather than in the browser ──
    // A caller may name a group; if they do it is authorised against their own
    // capacity. A player reads their own group only, so a forged ?group= can
    // never reach another squad's medical data. With one group in the club the
    // whole thing collapses to today's behaviour.
    const asCapacity = canonicalRole(session.teamMember) === 'player' ? 'player' : 'staff';
    const requested = String(req.query?.group || '').trim();
    let scope;
    try {
      scope = requested
        ? assertOperationalGroup(session, structure, requested, { as: asCapacity })
        : defaultOperationalGroup(session.teamMember, structure, { as: asCapacity }).group;
    } catch (error) {
      return res.status(error.status || 403).json({ ok: false, error: error.message });
    }
    const allowed = operationalGroupsFor(session.teamMember, structure, { as: asCapacity });
    // No group resolved and none accessible → nothing to show, not everything.
    const visibleGroupIds = new Set(scope ? [scope.id] : allowed.map(g => g.id));

    // ── ORPHANED CASES ──
    // Cases written before the group was resolvable carry playerGroupId ''.
    // '' is not a real group, so the filter below hid them from every reader.
    // They are shown ONLY to a caller whose own accessible groups cover EVERY
    // active group in the club — with nothing left unseen, there is no squad
    // the case could be wrongly disclosed to. This is coverage, not a role
    // check: a club-wide admin qualifies today because Seniors is the only
    // group, and stops qualifying the moment U18 exists unless they hold both.
    // The case itself is never rewritten or attributed.
    const live = activeGroups(structure);
    // `requested`, not `scope`: asking for a group explicitly is a narrower
    // question and never returns orphans, but simply defaulting into your only
    // group still counts as covering the club.
    const coversWholeClub = live.length > 0 && !requested
      && live.every(g => allowed.some(a => a.id === g.id));

    const groupName = id => (structure.groups || []).find(g => g.id === id)?.name || '';
    const memberFor = p => mine.find(m => String(m.userId || '') === String(p.userId || '') && p.userId) || null;
    const inScope = gid => {
      const id = String(gid || '');
      if (!id) return coversWholeClub;          // orphan: whole-club coverage only
      return visibleGroupIds.size === 0 ? false : visibleGroupIds.has(id);
    };

    const players = (roster?.players || [])
      .map(p => ({ p, member: memberFor(p) }))
      .filter(({ member }) => inScope(member?.playerGroupId))
      .map(({ p, member }) => projectPlayer(p, member, groupName(member?.playerGroupId)));

    const cases = record.cases.filter(c => inScope(c.playerGroupId));

    return res.status(200).json({
      ok: true,
      cases,                        // full history for THIS group
      active: activeCases({ cases }),
      players,
      group: scope ? { id: scope.id, name: scope.name } : null,
      groups: allowed.map(g => ({ id: g.id, name: g.name })),
      updatedAt: record.updatedAt,
    });
  }

  if (req.method === 'POST') {
    const action = String(req.body?.action || '');
    const structureForWrite = await loadClubStructure(session.teamId);
    try {
      if (action === 'resolve_case') {
        const resolved = await resolveCase(session.teamId, req.body?.caseId, { userId: session.user.id });
        return res.status(200).json({ ok: true, case: resolved });
      }
      if (action === 'upsert_case') {
        // Only the medical field allow-list survives pickWritable(); the group
        // is resolved HERE and never taken from the request body, so a medical
        // write can never reassign which group a player belongs to.
        const members = await loadTeamMembers();
        const member = members.find(m => String(m.teamId) === String(session.teamId)
          && String(m.userId || '') === String(req.body?.userId || '') && req.body?.userId) || null;

        let groupId = member?.playerGroupId || '';
        if (!groupId) {
          // A roster row added by hand and never linked to an account has no
          // userId, so no membership matches. Previously the case was stored
          // ungrouped and the group filter then hid it from EVERYONE — the
          // physio's injuries vanished the moment they were saved.
          //
          // With exactly one active group the answer is not a guess: there is
          // only one group the player could be in. With several it IS a guess,
          // so refuse and say so rather than file the case under the wrong
          // squad. Nothing is ever inferred from age, team name or position.
          const live = activeGroups(structureForWrite);
          if (live.length === 1) {
            groupId = live[0].id;
          } else {
            return res.status(400).json({
              error: live.length === 0
                ? 'This club has no active group to record a medical case against'
                : 'That player is not linked to a squad — add them to a group before recording a medical case',
            });
          }
        }

        const saved = await upsertCase(session.teamId, {
          ...req.body,
          playerGroupId: groupId,
        }, { userId: session.user.id });
        return res.status(200).json({ ok: true, case: saved });
      }
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Medical update failed' });
    }
    return res.status(400).json({ error: 'Unknown medical action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Fixture record (RC4.10B) ──────────────────────────────────────────────
// The canonical whitelist for a stored fixture. Previously this dropped
// `status`, so marking a fixture completed was silently lost on the next club
// sync — taking its appearance history with it. Every field the product writes
// is now preserved, and 'neutral' joins home/away.
const MAX_FIXTURES = 200;
const FIXTURE_STATUSES = new Set(['scheduled', 'completed', 'cancelled', 'postponed']);
const HOME_AWAY = new Set(['home', 'away', 'neutral']);

export function sanitiseFixtureRecord(fx) {
  const s = (v, max) => String(v ?? '').trim().slice(0, max);
  const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '';
  const homeAway = String(fx?.homeAway || '').toLowerCase();
  const status = String(fx?.status || '').toLowerCase();
  return {
    id:            s(fx?.id || `fx_${Math.random().toString(36).slice(2, 9)}`, 40),
    team:          s(fx?.team, 80),
    opposition:    s(fx?.opposition, 80),
    date:          s(fx?.date, 20),
    time:          hhmm(fx?.time),
    venue:         s(fx?.venue, 120),
    competition:   s(fx?.competition, 80),
    homeAway:      HOME_AWAY.has(homeAway) ? homeAway : '',
    status:        FIXTURE_STATUSES.has(status) ? status : 'scheduled',
    arrivalTime:   hhmm(fx?.arrivalTime),
    meetingPoint:  s(fx?.meetingPoint, 160),
    notes:         s(fx?.notes, 1000),
    externalId:    s(fx?.externalId, 80),
    referee:       s(fx?.referee, 80),
    transportNotes: s(fx?.transportNotes, 500),
    createdAt:     s(fx?.createdAt, 40),
    updatedAt:     s(fx?.updatedAt, 40),
  };
}

/** Fixtures that already carry downstream data must never be silently replaced. */
export function fixtureHasDownstreamData(fx = {}, context = {}) {
  const reasons = [];
  if (String(fx.status || '').toLowerCase() === 'completed') reasons.push('completed status');
  if (String(fx.notes || '').trim()) reasons.push('notes');
  if (context.availabilityIds?.has?.(fx.id)) reasons.push('availability responses');
  if (context.selectionIds?.has?.(fx.id)) reasons.push('squad selection');
  if (context.appearanceIds?.has?.(fx.id)) reasons.push('appearance history');
  if (context.messageIds?.has?.(fx.id)) reasons.push('messages');
  return reasons;
}

// ── Training schedule sub-resource (RC4.10C) ──────────────────────────────
// The club's RECURRING training nights, as a first-class tenant-scoped record.
// Previously this existed only as `club.trainingDays`, derived by regex-scraping
// a session title for a weekday and its free-text date for a time — write-only,
// never read back, and carrying no venue, end time, arrival time or date range.
//
// SCOPE: this milestone stores and edits the schedule. It does NOT generate
// recurring sessions, does NOT touch availability keying, and never creates a
// new availability session — the fixed tue/thu/game ids are left exactly alone.

function trainingScheduleKey(teamId) { return key(`publish:${teamId}:training_schedule`); }

const MAX_SCHEDULE_SLOTS = 14;
const SCHEDULE_DAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
// The two slots that still back the legacy availability sessions. Everything
// else is schedule information only until a later milestone connects it.
const LEGACY_SLOT_SESSION = { tue: 'tue', thu: 'thu' };

function sanitiseScheduleSlot(raw, index = 0) {
  const s = (v, max) => String(v ?? '').trim().slice(0, max);
  const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '';
  const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const day = s(raw?.day, 3);
  return {
    id:            s(raw?.id || `slot_${Date.now().toString(36)}_${index}`, 40),
    day:           SCHEDULE_DAYS.has(day) ? day : 'Tue',
    startTime:     hhmm(raw?.startTime) || '19:00',
    endTime:       hhmm(raw?.endTime),
    venue:         s(raw?.venue, 120),
    arrivalTime:   hhmm(raw?.arrivalTime),
    effectiveFrom: isoDate(raw?.effectiveFrom),
    effectiveTo:   isoDate(raw?.effectiveTo),
    active:        raw?.active === false ? false : true,
    // Set only for the two legacy slots, so the client knows which slot still
    // drives an existing availability session. Never invented for new slots.
    sessionId:     LEGACY_SLOT_SESSION[String(raw?.sessionId || '')] || '',
  };
}

/**
 * Read the schedule, seeding it once from existing club data if absent.
 * Idempotent: the seed only runs when no record exists, and it derives from the
 * live tue/thu sessions and club.trainingDays without modifying either.
 */
async function readTrainingSchedule(teamId) {
  const stored = await kvGet(trainingScheduleKey(teamId));
  if (stored && Array.isArray(stored.slots)) {
    return { record: { ...stored, slots: stored.slots.map(sanitiseScheduleSlot) }, seeded: false };
  }
  const club = (await kvGet(clubKey(teamId))) || {};
  const sessions = (await readScoped(sessionsKey(teamId), 'publish:sessions', teamId)) || [];
  const trainingDays = Array.isArray(club.trainingDays) ? club.trainingDays : [];

  const DAY_FROM_TEXT = text => {
    const m = String(text || '').match(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/i);
    return m ? m[0].slice(0, 1).toUpperCase() + m[0].slice(1, 3).toLowerCase() : '';
  };
  const TIME_FROM_TEXT = text => (String(text || '').match(/([01]\d|2[0-3]):[0-5]\d/) || [''])[0];

  const slots = [];
  ['tue', 'thu'].forEach((sessionId, i) => {
    const session = sessions.find(s => s.id === sessionId);
    const configured = trainingDays[i] || {};
    const day = DAY_FROM_TEXT(session?.title) || DAY_FROM_TEXT(session?.date)
      || (SCHEDULE_DAYS.has(String(configured.day)) ? configured.day : '')
      || (sessionId === 'tue' ? 'Tue' : 'Thu');
    const startTime = TIME_FROM_TEXT(session?.date) || TIME_FROM_TEXT(configured.time) || '19:00';
    slots.push(sanitiseScheduleSlot({
      id: `slot_${sessionId}`, day, startTime,
      venue: session?.location || '', active: true, sessionId,
    }, i));
  });
  return { record: { slots, updatedAt: null, updatedBy: null, seededFrom: 'club-config' }, seeded: true };
}

async function trainingScheduleHandler(req, res) {
  if (req.method === 'GET') {
    // Any active member may VIEW the schedule — players need training times.
    let session;
    try { session = await requireTenantSession(req); }
    catch (error) { return sendAuthError(res, error); }
    const { record, seeded } = await readTrainingSchedule(session.teamId);
    return res.status(200).json({ ok: true, ...record, seeded, canEdit: can(session, PERM.MANAGE_FIXTURES) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Writes need MANAGE_FIXTURES — Full, Coach and Manager access, for the team
  // the session is scoped to. A caller cannot name another club's team.
  let session;
  try { session = await requireTenantPermission(req, PERM.MANAGE_FIXTURES); }
  catch (error) { return sendAuthError(res, error); }
  if (req.body?.teamId) {
    try { assertSameTenant(session, req.body.teamId); }
    catch (error) { return sendAuthError(res, error); }
  }

  const { record } = await readTrainingSchedule(session.teamId);
  const slots = record.slots;
  const action = String(req.body?.action || 'save');
  const slotId = String(req.body?.slotId || '');
  const index = slots.findIndex(s => s.id === slotId);
  let auditEvent = 'training_schedule_updated';

  if (action === 'add') {
    if (slots.length >= MAX_SCHEDULE_SLOTS) {
      return res.status(409).json({ error: `Schedule limit reached (${MAX_SCHEDULE_SLOTS} slots)` });
    }
    slots.push(sanitiseScheduleSlot({ ...(req.body?.slot || {}), id: '', sessionId: '' }, slots.length));
    auditEvent = 'training_schedule_slot_added';
  } else if (action === 'update') {
    if (index < 0) return res.status(404).json({ error: 'Schedule slot not found' });
    // sessionId is server-owned: an update can never attach a slot to an
    // availability session, so no new availability rows can appear.
    slots[index] = sanitiseScheduleSlot({ ...slots[index], ...(req.body?.slot || {}), id: slots[index].id, sessionId: slots[index].sessionId }, index);
    auditEvent = 'training_schedule_slot_updated';
  } else if (action === 'deactivate' || action === 'activate') {
    if (index < 0) return res.status(404).json({ error: 'Schedule slot not found' });
    slots[index] = { ...slots[index], active: action === 'activate' };
    auditEvent = action === 'activate' ? 'training_schedule_slot_activated' : 'training_schedule_slot_deactivated';
  } else if (action === 'delete') {
    if (index < 0) return res.status(404).json({ error: 'Schedule slot not found' });
    // Deleting is only safe for slots that do NOT back an availability session.
    // The tue/thu slots can be deactivated, never removed, so existing responses
    // and their session ids always keep a schedule record to point at.
    if (slots[index].sessionId) {
      return res.status(409).json({
        error: 'This night is linked to existing availability — deactivate it instead of deleting',
        sessionId: slots[index].sessionId,
      });
    }
    slots.splice(index, 1);
    auditEvent = 'training_schedule_slot_deleted';
  } else if (action !== 'save') {
    return res.status(400).json({ error: "action must be add, update, activate, deactivate, delete or save" });
  }

  const next = {
    slots: slots.slice(0, MAX_SCHEDULE_SLOTS).map(sanitiseScheduleSlot),
    updatedAt: new Date().toISOString(),
    updatedBy: session.user.id,
  };
  await kvSet(trainingScheduleKey(session.teamId), next);
  await auditLog(auditEvent, {
    teamId: session.teamId, slotId: slotId || next.slots[next.slots.length - 1]?.id || '',
    by: session.user.id, slotCount: next.slots.length, ip: requestIp(req),
  });
  return res.status(200).json({ ok: true, ...next, canEdit: true });
}

// ── Fixtures sub-resource (RC4.10B manual entry + bulk import) ────────────
// Fixtures live in the club record, which is already tenant-scoped, so a club
// can only ever read or write its OWN fixtures — a caller cannot name another
// club's team. Writes require MANAGE_FIXTURES (Full / Coach / Manager).

async function readClubFixtures(teamId) {
  const club = (await kvGet(clubKey(teamId))) || {};
  return { club, fixtures: Array.isArray(club.fixtures) ? club.fixtures.map(sanitiseFixtureRecord) : [] };
}

async function writeClubFixtures(teamId, club, fixtures) {
  await kvSet(clubKey(teamId), { ...club, fixtures: fixtures.slice(0, MAX_FIXTURES) });
}

/** Everything downstream that would make replacing a fixture destructive. */
async function downstreamContext(teamId) {
  const squad = (await kvGet(squadKey(teamId))) || null;
  const selectionIds = new Set();
  if (squad?.fixtureId) selectionIds.add(String(squad.fixtureId));
  const adjustments = (await kvGet(key(`appearance_adj:${teamId}`))) || [];
  const appearanceIds = new Set(
    (Array.isArray(adjustments) ? adjustments : []).map(a => String(a.fixtureId || '')).filter(Boolean));
  return { selectionIds, appearanceIds };
}

const nowIso = () => new Date().toISOString();

async function fixturesHandler(req, res) {
  if (req.method === 'GET') {
    // Any active member may VIEW the fixture list; only staff may change it.
    let session;
    try { session = await requireTenantSession(req); }
    catch (error) { return sendAuthError(res, error); }
    const { fixtures } = await readClubFixtures(session.teamId);
    return res.status(200).json({ ok: true, fixtures, count: fixtures.length });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let session;
  try { session = await requireTenantPermission(req, PERM.MANAGE_FIXTURES); }
  catch (error) { return sendAuthError(res, error); }
  if (req.body?.teamId) {
    try { assertSameTenant(session, req.body.teamId); }
    catch (error) { return sendAuthError(res, error); }
  }

  const action = String(req.body?.action || 'create');
  const { club, fixtures } = await readClubFixtures(session.teamId);

  // ── Single manual fixture ───────────────────────────────────────────────
  if (action === 'create') {
    const incoming = sanitiseFixtureRecord(req.body?.fixture || {});
    if (!incoming.opposition) return res.status(400).json({ error: 'Opponent is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incoming.date)) return res.status(400).json({ error: 'A valid date is required' });
    if (req.body?.fixture?.time && !incoming.time) return res.status(400).json({ error: 'Kick-off time must be HH:MM' });

    // Repeated submits must not create duplicates.
    const dupe = findDuplicate(incoming, fixtures);
    if (dupe && !req.body?.allowDuplicate) {
      return res.status(409).json({
        ok: false, error: 'A matching fixture already exists', duplicateOf: dupe.match.id, reason: dupe.reason,
      });
    }
    incoming.createdAt = nowIso();
    incoming.updatedAt = incoming.createdAt;
    if (fixtures.length >= MAX_FIXTURES) {
      return res.status(409).json({ error: `Fixture limit reached (${MAX_FIXTURES})` });
    }
    const next = [...fixtures, incoming];
    await writeClubFixtures(session.teamId, club, next);
    await auditLog('fixture_created', {
      fixtureId: incoming.id, teamId: session.teamId, opposition: incoming.opposition,
      date: incoming.date, createdBy: session.user.id, ip: requestIp(req),
    });
    return res.status(201).json({ ok: true, fixture: incoming, count: next.length });
  }

  // ── Bulk import commit (only ever called AFTER review + confirmation) ───
  if (action === 'import') {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ error: 'Import must be confirmed after review' });
    }
    const rows = Array.isArray(req.body?.fixtures) ? req.body.fixtures : [];
    if (!rows.length) return res.status(400).json({ error: 'No fixtures to import' });
    if (rows.length > MAX_FIXTURES) {
      return res.status(413).json({ error: `Too many rows — import at most ${MAX_FIXTURES} fixtures at a time` });
    }
    // An import runs against a single snapshot and is written once, so a
    // partial failure can never leave a half-import behind.
    const context = await downstreamContext(session.teamId);
    const working = [...fixtures];
    const summary = { imported: 0, updated: 0, skipped: 0, blocked: 0, errors: 0 };
    const details = [];

    for (const raw of rows) {
      const decision = String(raw?.decision || 'new').toLowerCase();  // new | update | skip
      const fixture = sanitiseFixtureRecord(raw?.fixture || raw || {});
      if (!fixture.opposition || !/^\d{4}-\d{2}-\d{2}$/.test(fixture.date)) {
        summary.errors++;
        details.push({ opposition: fixture.opposition || '(none)', outcome: 'error', reason: 'missing opponent or date' });
        continue;
      }
      if (decision === 'skip') {
        summary.skipped++;
        details.push({ opposition: fixture.opposition, outcome: 'skipped' });
        continue;
      }
      const dupe = findDuplicate(fixture, working);
      if (decision === 'update') {
        if (!dupe) {
          summary.errors++;
          details.push({ opposition: fixture.opposition, outcome: 'error', reason: 'no existing fixture to update' });
          continue;
        }
        const blockers = fixtureHasDownstreamData(dupe.match, context);
        if (blockers.length) {
          // Never silently overwrite real match history.
          summary.blocked++;
          details.push({ opposition: fixture.opposition, outcome: 'blocked', reason: blockers.join(', ') });
          continue;
        }
        const idx = working.findIndex(f => f.id === dupe.match.id);
        working[idx] = { ...dupe.match, ...fixture, id: dupe.match.id, createdAt: dupe.match.createdAt || nowIso(), updatedAt: nowIso() };
        summary.updated++;
        details.push({ opposition: fixture.opposition, outcome: 'updated' });
        continue;
      }
      // decision === 'new'
      if (dupe && !raw?.allowDuplicate) {
        summary.skipped++;
        details.push({ opposition: fixture.opposition, outcome: 'skipped', reason: `duplicate (${dupe.reason})` });
        continue;
      }
      if (working.length >= MAX_FIXTURES) {
        summary.errors++;
        details.push({ opposition: fixture.opposition, outcome: 'error', reason: 'fixture limit reached' });
        continue;
      }
      fixture.createdAt = nowIso();
      fixture.updatedAt = fixture.createdAt;
      working.push(fixture);
      summary.imported++;
      details.push({ opposition: fixture.opposition, outcome: 'imported' });
    }

    await writeClubFixtures(session.teamId, club, working);
    await auditLog('fixtures_imported', {
      teamId: session.teamId, importedBy: session.user.id,
      imported: summary.imported, updated: summary.updated, skipped: summary.skipped,
      blocked: summary.blocked, errors: summary.errors, ip: requestIp(req),
    });
    return res.status(200).json({ ok: true, summary, details, count: working.length });
  }

  return res.status(400).json({ error: "action must be 'create' or 'import'" });
}

// ── Training publication sub-resource (RC4.10A two audiences) ─────────────
// Training publishes to TWO independent audiences:
//   coach  — the complete operational plan (block leaders, key notes, staff
//            notes, setup, cues, progressions…). Staff only, both in the UI and
//            over the API.
//   player — a player-safe subset. Never carries staff-only content.
//
// Each audience keeps its OWN snapshot, timestamp, publisher and revision, so
// publishing to one never touches the other. A snapshot is a point-in-time copy:
// editing the planner afterwards cannot leak into an already published view —
// the audience simply reports "changes not republished" until it is republished.

function trainingKey(teamId) { return key(`publish:${teamId}:training`); }

const MAX_TRAINING_BLOCKS = 40;

// Deterministic content fingerprint — the session's current revision. Derived
// from content rather than an incrementing counter so a missed bump can never
// leave a stale publication looking current.
function trainingRevision(value) {
  const json = JSON.stringify(value ?? null);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

const str = (v, max = 400) => String(v ?? '').slice(0, max);

// COACH audience — every operational field the planner stores.
function coachBlock(b = {}) {
  return {
    id:            str(b.id, 60),
    time:          str(b.time, 20),
    activity:      str(b.activity, 200),
    durationMins:  Number.isFinite(Number(b.durationMins)) ? Number(b.durationMins) : null,
    tag:           str(b.tag, 60),
    coach:         str(b.coach, 120),          // block leader / responsible coach
    keyFocus:      str(b.keyFocus, 2000),      // key coaching notes
    organisation:  str(b.organisation, 2000),  // organisation and setup
    equipment:     str(b.equipment, 1000),
    groups:        str(b.groups, 1000),        // group allocations
    cues:          str(b.cues, 2000),          // coaching cues
    progressions:  str(b.progressions, 2000),
    regressions:   str(b.regressions, 2000),
    staffNotes:    str(b.staffNotes, 2000),    // staff-only
    playerNotes:   str(b.playerNotes, 1000),   // player-safe, also sent to players
    playerEquipment: str(b.playerEquipment, 500),
  };
}

// PLAYER audience — an explicit allow-list. Anything not named here can never
// reach a player, so a new planner field is private by default.
function playerBlock(b = {}) {
  return {
    time:            str(b.time, 20),
    activity:        str(b.activity, 200),
    durationMins:    Number.isFinite(Number(b.durationMins)) ? Number(b.durationMins) : null,
    playerNotes:     str(b.playerNotes, 1000),
    playerEquipment: str(b.playerEquipment, 500),
  };
}

function coachSessionSnapshot(s = {}) {
  return {
    id:         str(s.id, 60),
    title:      str(s.title, 200),
    theme:      str(s.theme || s.focus, 500),
    type:       str(s.type, 60) || 'Training',
    date:       str(s.date, 20),
    startTime:  str(s.startTime, 20),
    endTime:    str(s.endTime, 20),
    location:   str(s.location, 200),
    coachName:  str(s.coachName || s.leadCoach, 120),
    focus:      str(s.focus, 1000),
    arrivalInstructions: str(s.arrivalInstructions, 1000),
    preparation:         str(s.preparation, 1000),
    playerEquipment:     str(s.playerEquipment, 500),
    playerNotes:         str(s.playerNotes, 2000),
    staffNotes:          str(s.staffNotes, 2000),   // staff-only
    blocks: (Array.isArray(s.blocks) ? s.blocks : []).slice(0, MAX_TRAINING_BLOCKS).map(coachBlock),
  };
}

function playerSessionSnapshot(s = {}) {
  return {
    id:        str(s.id, 60),
    title:     str(s.title, 200),
    theme:     str(s.theme || s.focus, 500),
    type:      str(s.type, 60) || 'Training',
    date:      str(s.date, 20),
    startTime: str(s.startTime, 20),
    endTime:   str(s.endTime, 20),
    location:  str(s.location, 200),
    arrivalInstructions: str(s.arrivalInstructions, 1000),
    preparation:         str(s.preparation, 1000),
    playerEquipment:     str(s.playerEquipment, 500),
    playerNotes:         str(s.playerNotes, 2000),
    blocks: (Array.isArray(s.blocks) ? s.blocks : []).slice(0, MAX_TRAINING_BLOCKS).map(playerBlock),
  };
}

/** Publication status for one audience, given the session's current revision. */
function audienceStatus(entry, currentRevision) {
  if (!entry || !entry.publishedAt) return 'draft';
  if (currentRevision && entry.revision && entry.revision !== currentRevision) return 'stale';
  return 'published';
}

async function trainingHandler(req, res) {
  const audienceParam = String(req.query?.audience || req.body?.audience || '').toLowerCase();

  if (req.method === 'GET') {
    const audience = audienceParam === 'coach' ? 'coach' : 'player';
    let session;
    try {
      // The full staff plan requires publish-training rights; the player-safe
      // view is readable by any active member of the club.
      session = audience === 'coach'
        ? await requireTenantPermission(req, PERM.PUBLISH_TRAINING)
        : await requireTenantSession(req);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const store = (await kvGet(trainingKey(session.teamId))) || {};
    const sessions = [];
    for (const [id, rec] of Object.entries(store)) {
      const entry = rec?.[audience];
      if (!entry || !entry.publishedAt) continue;
      sessions.push({
        id,
        ...entry.snapshot,
        publishedAt: entry.publishedAt,
        publishedBy: entry.publishedBy,
        publishedRevision: entry.revision,
        status: audienceStatus(entry, rec.currentRevision),
      });
    }
    return res.status(200).json({ ok: true, audience, sessions, count: sessions.length });
  }

  // ── POST: publish one session to ONE audience ───────────────────────────
  if (req.method === 'POST') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.PUBLISH_TRAINING);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const audience = audienceParam;
    if (!['coach', 'player'].includes(audience)) {
      return res.status(400).json({ error: "audience must be 'coach' or 'player'" });
    }
    const incoming = req.body?.session;
    if (!incoming || typeof incoming !== 'object' || !String(incoming.id || '')) {
      return res.status(400).json({ error: 'session object with an id is required' });
    }

    const store = (await kvGet(trainingKey(session.teamId))) || {};
    const id = String(incoming.id);
    const record = store[id] || {};

    // The revision is computed from the FULL operational content, so an edit to
    // a staff-only field correctly marks BOTH audiences stale.
    const full = coachSessionSnapshot(incoming);
    const currentRevision = trainingRevision(full);
    const snapshot = audience === 'coach' ? full : playerSessionSnapshot(incoming);

    const previous = record[audience] || null;
    record.currentRevision = currentRevision;
    record[audience] = {
      snapshot,
      revision: currentRevision,
      publishedAt: new Date().toISOString(),
      publishedBy: session.user.id,
    };
    // Publishing to one audience must never disturb the other's snapshot.
    store[id] = record;
    await kvSet(trainingKey(session.teamId), store);

    await auditLog('training_published', {
      audience, sessionId: id, teamId: session.teamId,
      publishedBy: session.user.id, revision: currentRevision,
      republished: Boolean(previous), ip: requestIp(req),
    });

    return res.status(200).json({
      ok: true,
      audience,
      sessionId: id,
      currentRevision,
      publishedAt: record[audience].publishedAt,
      publishedBy: record[audience].publishedBy,
      coach:  { status: audienceStatus(record.coach, currentRevision),  publishedAt: record.coach?.publishedAt || null,  publishedBy: record.coach?.publishedBy || null,  revision: record.coach?.revision || null },
      player: { status: audienceStatus(record.player, currentRevision), publishedAt: record.player?.publishedAt || null, publishedBy: record.player?.publishedBy || null, revision: record.player?.revision || null },
    });
  }

  // ── PUT: refresh the current revision (called as the planner is edited) ──
  // Records that the draft moved on WITHOUT touching either published snapshot,
  // which is what turns an audience's status into "changes not republished".
  if (req.method === 'PUT') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.PUBLISH_TRAINING);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const incoming = req.body?.session;
    if (!incoming || !String(incoming.id || '')) {
      return res.status(400).json({ error: 'session object with an id is required' });
    }
    const store = (await kvGet(trainingKey(session.teamId))) || {};
    const id = String(incoming.id);
    const record = store[id] || {};
    record.currentRevision = trainingRevision(coachSessionSnapshot(incoming));
    store[id] = record;
    await kvSet(trainingKey(session.teamId), store);
    return res.status(200).json({
      ok: true,
      sessionId: id,
      currentRevision: record.currentRevision,
      coach:  { status: audienceStatus(record.coach, record.currentRevision) },
      player: { status: audienceStatus(record.player, record.currentRevision) },
    });
  }

  // ── DELETE: withdraw one audience's publication ─────────────────────────
  if (req.method === 'DELETE') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.PUBLISH_TRAINING);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const audience = audienceParam;
    if (!['coach', 'player'].includes(audience)) {
      return res.status(400).json({ error: "audience must be 'coach' or 'player'" });
    }
    const id = String(req.body?.sessionId || '');
    const store = (await kvGet(trainingKey(session.teamId))) || {};
    if (store[id]) {
      delete store[id][audience];
      await kvSet(trainingKey(session.teamId), store);
      await auditLog('training_unpublished', { audience, sessionId: id, teamId: session.teamId, by: session.user.id, ip: requestIp(req) });
    }
    return res.status(200).json({ ok: true, audience, sessionId: id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Appearance adjustments sub-resource (RC4.8A admin corrections) ────────
// The source of truth for appearances remains completed Match Centre
// selections, calculated client-side. Authorised club admins may record
// AUDITED historical adjustments (pre-CoachEasier matches, imported legacy
// records, approved corrections). Adjustments are separate, append-only
// records — the calculated total is never overwritten; a mistaken adjustment
// is corrected by a counter-adjustment so the audit trail stays complete.

function adjustmentsKey(teamId) { return key(`appearance_adj:${teamId}`); }

const MAX_ADJUSTMENTS = 500;
const ADJ_ID_RE = /^[a-z0-9_-]{1,80}$/i;

function sanitiseAdjustment(body, session) {
  const playerId = String(body?.playerId || '').trim();
  const seasonId = String(body?.seasonId || '').trim();
  const reason   = String(body?.reason || '').trim().slice(0, 240);
  const source   = String(body?.source || '').trim().slice(0, 160);
  const amount   = Number(body?.amount);
  if (!ADJ_ID_RE.test(playerId)) return { error: 'playerId is required' };
  if (!seasonId || seasonId.length > 40) return { error: 'seasonId is required (max 40 chars)' };
  if (!reason) return { error: 'reason is required — every correction must say why' };
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 200) {
    return { error: 'amount must be a non-zero whole number between -200 and 200' };
  }
  return {
    record: {
      id:        `adj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      teamId:    session.teamId,
      seasonId,
      amount,
      reason,
      ...(source ? { source } : {}),
      createdBy: session.user.id,
      createdAt: new Date().toISOString(),
    },
  };
}

async function appearanceAdjustmentsHandler(req, res) {
  // Reads: anyone who can see reports (coach board / audit trail).
  // Writes: club admins only (MANAGE_TEAMS — the club-config permission).
  if (req.method === 'GET') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.REPORTS);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const all = (await kvGet(adjustmentsKey(session.teamId))) || [];
    const playerId = String(req.query?.playerId || '').trim();
    const seasonId = String(req.query?.seasonId || '').trim();
    const adjustments = all
      .filter(a => (!playerId || a.playerId === playerId) && (!seasonId || a.seasonId === seasonId));
    return res.status(200).json({ ok: true, adjustments, count: adjustments.length });
  }

  if (req.method === 'POST') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.MANAGE_TEAMS);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const { record, error } = sanitiseAdjustment(req.body, session);
    if (error) return res.status(400).json({ error });
    const all = (await kvGet(adjustmentsKey(session.teamId))) || [];
    if (all.length >= MAX_ADJUSTMENTS) {
      return res.status(409).json({ error: `Adjustment limit reached (${MAX_ADJUSTMENTS}) — contact support` });
    }
    all.unshift(record);
    await kvSet(adjustmentsKey(session.teamId), all);
    await auditLog('appearance_adjustment_created', {
      teamId: session.teamId, playerId: record.playerId, seasonId: record.seasonId,
      amount: record.amount, by: session.user.id, ip: requestIp(req),
    });
    return res.status(201).json({ ok: true, adjustment: record });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Club config sub-resource (first-run setup) ────────────────────────────
// One record per team: club name, team name, season and first-fixture info
// captured by the coach's first-run wizard. Any team member can read it
// (players need the club name for their own UI); only coach/admin can write.

const VALID_DAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

function sanitiseClubConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clubName = String(raw.clubName || '').trim().slice(0, 80);
  if (!clubName) return null;
  const trainingDays = (Array.isArray(raw.trainingDays) ? raw.trainingDays : [])
    .map(d => ({
      day:  String(d?.day || '').slice(0, 3),
      time: /^\d{2}:\d{2}$/.test(String(d?.time || '')) ? String(d.time) : '19:00',
    }))
    .filter(d => VALID_DAYS.has(d.day))
    .slice(0, 7);
  const sanitiseFixture = sanitiseFixtureRecord;
  const fx = raw.firstFixture && typeof raw.firstFixture === 'object' ? raw.firstFixture : {};
  const hexColour = v => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toLowerCase() : '';
  // Logos are client-resized data-URLs; cap well under Upstash value limits.
  const logo = String(raw.logoDataUrl || '');
  const logoDataUrl = logo.startsWith('data:image/') && logo.length <= 200000 ? logo : '';
  const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  return {
    clubName,
    teamName:   String(raw.teamName   || '').trim().slice(0, 80),
    sport:      String(raw.sport      || '').trim().slice(0, 40),
    seasonName: String(raw.seasonName || '').trim().slice(0, 80),
    seasonStart: isoDate(raw.seasonStart),
    seasonEnd:   isoDate(raw.seasonEnd),
    matchDay:   VALID_DAYS.has(String(raw.matchDay || '')) ? String(raw.matchDay) : '',
    colours: {
      primary:   hexColour(raw.colours?.primary),
      secondary: hexColour(raw.colours?.secondary),
    },
    logoDataUrl,
    trainingDays,
    weeklyAvailability: sanitiseWeeklyAvailability(raw.weeklyAvailability),
    firstFixture: sanitiseFixture(fx),
    fixtures: (Array.isArray(raw.fixtures) ? raw.fixtures : [])
      .map(sanitiseFixture)
      .filter(f => f.opposition)
      .slice(0, MAX_FIXTURES),
  };
}

// Weekly Availability automation schedule (Overview card). Persisted in the club
// config so the cron can read it; null when the coach hasn't configured it.
function sanitiseWeeklyAvailability(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const DAYS3 = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const slot = (s, defDay, defTime) => ({
    day:  DAYS3.has(String(s?.day)) ? String(s.day) : defDay,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s?.time || '')) ? String(s.time) : defTime,
  });
  // Beta: the weekly reminder is HOUR-based only — snap any minutes to :00.
  const hourSlot = (s, defDay, defTime) => { const r = slot(s, defDay, defTime); return { day: r.day, time: `${r.time.slice(0, 2)}:00` }; };
  return {
    enabled: Boolean(raw.enabled),
    // Beta: ONE weekly reminder slot, day + hour only. Older configs migrate from
    // training1 so the coach's existing day/hour carries over. training1/2/match
    // kept for back-compat.
    reminder:  hourSlot(raw.reminder || raw.training1, 'Mon', '09:00'),
    training1: slot(raw.training1, 'Mon', '09:00'),
    training2: slot(raw.training2, 'Wed', '09:00'),
    match:     slot(raw.match,     'Thu', '18:00'),
    lastSentAt: typeof raw.lastSentAt === 'string' ? raw.lastSentAt.slice(0, 40) : null,
  };
}

async function clubHandler(req, res) {
  if (req.method === 'GET') {
    let session;
    try {
      session = await requireTenantSession(req);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const club = (await kvGet(clubKey(session.teamId))) || null;
    return res.status(200).json({ ok: true, club });
  }

  if (req.method === 'POST') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.MANAGE_TEAMS);
    } catch (error) {
      return sendAuthError(res, error);
    }

    // Danger Zone: wipe THIS team's operational data. Requires the club name
    // typed back as confirmation. Identity accounts and chat history are NOT
    // deleted — players keep their logins; this resets the club setup.
    if (req.body?.action === 'delete_club_data') {
      if (!can(session, PERM.DANGER_ZONE)) return res.status(403).json({ error: 'Not authorized' });
      const existing = (await kvGet(clubKey(session.teamId))) || null;
      const expected = String(existing?.clubName || '').trim();
      if (expected && String(req.body?.confirmName || '').trim() !== expected) {
        return res.status(400).json({ error: 'Type the exact club name to confirm deletion' });
      }
      await Promise.all([
        kvSet(clubKey(session.teamId), null),
        kvSet(sessionsKey(session.teamId), null),
        kvSet(squadKey(session.teamId), null),
        kvSet(rosterKey(session.teamId), null),
      ]);
      return res.status(200).json({ ok: true, deleted: ['club', 'sessions', 'squad', 'roster'] });
    }

    if (req.body?.action === 'delete_test_data') {
      if (!can(session, PERM.DANGER_ZONE)) return res.status(403).json({ error: 'Not authorized' });
      if (String(req.body?.confirmPhrase || '') !== 'DELETE TEST DATA') {
        return res.status(400).json({ error: 'Type DELETE TEST DATA to confirm' });
      }

      const deleted = { sessions: 0, availability: 0, messages: 0, rosterPlayers: 0 };

      // 1. Published training sessions with TEST in the title
      const pubSessions = (await readScoped(sessionsKey(session.teamId), 'publish:sessions', session.teamId)) || [];
      const cleanSessions = pubSessions.filter(s => !isTestSession(s));
      if (cleanSessions.length < pubSessions.length) {
        deleted.sessions = pubSessions.length - cleanSessions.length;
        await kvSet(sessionsKey(session.teamId), cleanSessions);
      }

      // 2. Availability records — strip per-player entries that match test markers.
      // RC4.7A: sweep ONLY the caller's club keyspace. The flat legacy keys hold
      // default-club beta data, so they are included only for the default club —
      // this action can never touch another club's records.
      const isDefaultTeam = session.teamId === DEFAULT_TEAM.id;
      const availKeys = [...new Set([
        ...(await kvScanKeys(`${APP_PREFIX}:availability:${session.teamId}:*`)),
        ...(isDefaultTeam ? (await kvScanKeys(`${APP_PREFIX}:availability:*`)).filter(k => {
          const suffix = k.slice(`${APP_PREFIX}:availability:`.length);
          return suffix && !suffix.includes(':'); // flat legacy only, never other teams' scoped keys
        }) : []),
        ...(isDefaultTeam ? await kvScanKeys(`${LEGACY_PREFIX}:availability:*`) : []),
      ])];
      for (const k of availKeys) {
        const rec = await kvGet(k);
        if (!rec || typeof rec !== 'object') continue;
        const clean = {};
        let changed = false;
        for (const [label, value] of Object.entries(rec)) {
          if (isTestAvailEntry(label, value)) { changed = true; deleted.availability++; }
          else clean[label] = value;
        }
        if (changed) await kvSet(k, clean);
      }

      // 3. Chat messages — remove messages sent by test accounts in every conversation
      const convs = (await kvGet(key('chat:convs'))) || [];
      for (const conv of convs) {
        if (!conv?.id) continue;
        const msgsKey = key(`chat:conv:${conv.id}:msgs`);
        const msgs = await kvLrange(msgsKey, 0, 499);
        const cleanMsgs = msgs.filter(m => !isTestChatMessage(m));
        if (cleanMsgs.length < msgs.length) {
          deleted.messages += msgs.length - cleanMsgs.length;
          await kvDel(msgsKey);
          // Re-push oldest-first so newest ends up at index 0 (LPUSH prepends)
          for (const m of cleanMsgs) await kvLpush(msgsKey, m);
        }
      }

      // 4. Roster — remove test player entries
      const roster = await kvGet(rosterKey(session.teamId));
      if (Array.isArray(roster?.players)) {
        const cleanPlayers = roster.players.filter(p => !isTestRosterPlayer(p));
        if (cleanPlayers.length < roster.players.length) {
          deleted.rosterPlayers = roster.players.length - cleanPlayers.length;
          await kvSet(rosterKey(session.teamId), {
            ...roster,
            players:   cleanPlayers,
            updatedAt: new Date().toISOString(),
            updatedBy: session.user.id,
          });
        }
      }

      return res.status(200).json({ ok: true, deleted });
    }

    const club = sanitiseClubConfig(req.body?.club);
    if (!club) return res.status(400).json({ error: 'club.clubName is required' });
    const existing = (await kvGet(clubKey(session.teamId))) || null;
    const record = {
      ...club,
      // Keep an existing weekly schedule if a save doesn't carry one, and always
      // carry the cron-managed automation diagnostics (debug) forward so a coach
      // schedule edit can't wipe the "last automation check / result" fields.
      weeklyAvailability: (() => {
        const wa = club.weeklyAvailability ?? existing?.weeklyAvailability ?? null;
        if (!wa) return null;
        // Carry the scheduler-managed runtime fields forward (a coach schedule
        // edit must not wipe the automation diagnostics or last-auto-send time).
        return {
          ...wa,
          lastAutoSentAt: wa.lastAutoSentAt ?? existing?.weeklyAvailability?.lastAutoSentAt ?? null,
          debug: wa.debug ?? existing?.weeklyAvailability?.debug ?? null,
        };
      })(),
      setupCompletedAt: existing?.setupCompletedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };
    await kvSet(clubKey(session.teamId), record);
    return res.status(200).json({ ok: true, club: record });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// POST /api/publish?resource=availability-check  (coach/admin only)
// Runs the REAL weekly-availability scheduler due-check for this coach's club —
// the exact path the cron uses — so automation can be tested on demand without
// waiting for Vercel/pinger timing. It does NOT call manual Send Now: a session
// only sends if it is genuinely due (and dedups per session/day like the cron).
async function availabilityCheckHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let session;
  try {
    session = await requireTenantPermission(req, PERM.MANAGE_TEAMS);
  } catch (error) {
    return sendAuthError(res, error);
  }
  const [subscribers, automationMembers] = await Promise.all([load(), loadTeamMembers()]);
  const report = await runWeeklyAvailabilityCheck({
    now: new Date(), source: 'coach: Run check now',
    onlyTeamId: session.teamId, subscribers, automationMembers,
  });
  if (report.expired?.length) {
    await save(subscribers.filter(item => !report.expired.includes(item.subscription.endpoint)));
  }
  const club = (await kvGet(clubKey(session.teamId))) || null;
  return res.status(200).json({ ok: true, report, weeklyAvailability: club?.weeklyAvailability || null });
}

// ── Club structure sub-resource (RC4.7 Phase C) ───────────────────────────
// GET  ?resource=structure — hierarchy + member/staff counts (staff only).
// POST ?resource=structure — administration ops, club-wide admins only.
async function structureHandler(req, res) {
  if (req.method === 'GET') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
    } catch (error) { return sendAuthError(res, error); }
    const structure = await loadClubStructure(session.teamId);
    const [members, users] = await Promise.all([loadTeamMembers(), loadUsers()]);
    const active = members.filter(m => m.teamId === session.teamId && m.status === 'active');
    const nameOf = userId => {
      const u = users.find(x => x.id === userId);
      return u?.displayName || u?.firstName || 'Member';
    };

    const clubWideStaff = [];
    const groups = {};
    const teams = {};
    for (const g of structure.groups) groups[g.id] = { members: 0, staff: [] };
    for (const t of structure.teams) teams[t.id] = { members: 0, coaches: [] };

    for (const m of active) {
      const scope = effectiveAccessScope(m);
      const staffish = canonicalRole(m) !== 'player';
      if (scope.clubWide) {
        if (staffish) clubWideStaff.push(nameOf(m.userId));
        continue;   // club-wide members are listed once, not in every group
      }
      for (const grant of scope.groups.filter(x => x.status === 'active')) {
        if (!groups[grant.groupId]) continue;
        groups[grant.groupId].members += 1;
        if (staffish) groups[grant.groupId].staff.push(nameOf(m.userId));
      }
      for (const grant of scope.teams.filter(x => x.status === 'active')) {
        if (!teams[grant.teamId]) continue;
        if (staffish) teams[grant.teamId].coaches.push(nameOf(m.userId));
      }
      if (canonicalRole(m) === 'player') {
        for (const teamId of effectiveEligibility(m).teamIds) {
          if (teams[teamId]) teams[teamId].members += 1;
        }
      }
    }
    return res.status(200).json({ ok: true, structure, counts: { groups, teams }, clubWideStaff });
  }

  if (req.method === 'POST') {
    let session;
    try {
      session = await requireClubManage(req, PERM.MANAGE_TEAMS);
    } catch (error) { return sendAuthError(res, error); }
    const op = String(req.body?.op || '');
    const b = req.body || {};
    try {
      let result;
      if (op === 'create_group')      result = await createGroup(session.teamId, { name: b.name, type: b.type });
      else if (op === 'create_team')  result = await createTeam(session.teamId, { groupId: b.groupId, name: b.name, ageGrade: b.ageGrade, genderCategory: b.genderCategory });
      else if (op === 'rename_group') result = await renameGroup(session.teamId, b.groupId, b.name);
      else if (op === 'rename_team')  result = await renameTeam(session.teamId, b.teamId, b.name);
      else if (op === 'archive_group')  result = await setGroupStatus(session.teamId, b.groupId, 'archived');
      else if (op === 'restore_group')  result = await setGroupStatus(session.teamId, b.groupId, 'active');
      else if (op === 'archive_team')   result = await setTeamStatus(session.teamId, b.teamId, 'archived');
      else if (op === 'restore_team')   result = await setTeamStatus(session.teamId, b.teamId, 'active');
      else return res.status(400).json({ ok: false, error: 'Unknown structure operation' });

      await auditLog('club_structure_changed', {
        op, groupId: b.groupId || result.group?.id || null, teamId: b.teamId || result.team?.id || null,
        changedBy: session.user.id, teamId_club: session.teamId, ip: requestIp(req),
      });
      return res.status(200).json({ ok: true, structure: result.structure, group: result.group || null, team: result.team || null });
    } catch (error) {
      return res.status(error?.status || 400).json({ ok: false, error: error?.message || 'Structure change failed' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  if (String(req.query?.resource || '') === 'structure') return structureHandler(req, res);
  if (String(req.query?.resource || '') === 'roster') return rosterHandler(req, res);
  if (String(req.query?.resource || '') === 'medical') return medicalHandler(req, res);
  if (String(req.query?.resource || '') === 'club')   return clubHandler(req, res);
  if (String(req.query?.resource || '') === 'availability-check') return availabilityCheckHandler(req, res);
  if (String(req.query?.resource || '') === 'appearance-adjustments') return appearanceAdjustmentsHandler(req, res);
  if (String(req.query?.resource || '') === 'training') return trainingHandler(req, res);
  if (String(req.query?.resource || '') === 'fixtures') return fixturesHandler(req, res);
  if (String(req.query?.resource || '') === 'training-schedule') return trainingScheduleHandler(req, res);

  // ── GET: any authenticated user reads published player-facing state ────────
  if (req.method === 'GET') {
    const type = String(req.query?.type || 'all');

    // Private per-coach draft — coach/admin only, and a coach only ever reads
    // THEIR OWN draft (keyed by the session user id). Players never reach this.
    if (type === 'draft') {
      let session;
      try {
        session = await requireTenantPermission(req, PERM.PUBLISH_SQUADS);
      } catch (error) {
        return sendAuthError(res, error);
      }
      const draft = (await kvGet(draftKey(session.teamId, session.user.id))) || null;
      return res.status(200).json({ ok: true, draft });
    }

    // Coach Draft Compare (Phase 2): list EVERY coach's draft for this team,
    // read-only. Coach/admin only — players never see other coaches' drafts.
    // Each entry is joined with the team member (role) and user (name); only
    // current staff of THIS team are included. This is a read path only — it
    // never writes, and the owner-scoped save/publish paths are untouched.
    if (type === 'drafts') {
      let session;
      try {
        session = await requireTenantPermission(req, PERM.PUBLISH_SQUADS);
      } catch (error) {
        return sendAuthError(res, error);
      }
      const teamId = session.teamId;
      const [keys, members, users] = await Promise.all([
        kvScanKeys(key(`publish:${teamId}:draft:*`)),
        loadTeamMembers(),
        loadUsers(),
      ]);
      const userById = new Map(users.map(u => [String(u.id), u]));
      const memberByUser = new Map(
        members.filter(m => String(m.teamId) === String(teamId)).map(m => [String(m.userId), m])
      );
      const drafts = [];
      for (const k of keys) {
        const rec = await kvGet(k);
        if (!rec || typeof rec !== 'object') continue;
        const userId = String(rec.userId || k.split(':draft:')[1] || '');
        const member = memberByUser.get(userId);
        if (!member || !['coach', 'admin', 'medical'].includes(member.role)) continue; // current staff only
        const user = userById.get(userId);
        drafts.push({
          userId,
          coachName: String(user?.displayName || user?.email || 'Coach'),
          role: member.role,
          updatedAt: rec.updatedAt || null,
          squad: sanitiseSquad(rec),
        });
      }
      return res.status(200).json({ ok: true, drafts });
    }

    let session;
    try {
      session = await requireTenantSession(req);
    } catch (error) {
      return sendAuthError(res, error);
    }

    const result = { ok: true };

    if (type === 'all' || type === 'sessions') {
      result.sessions = (await readScoped(sessionsKey(session.teamId), 'publish:sessions', session.teamId)) || [];
    }
    if (type === 'all' || type === 'squad') {
      result.squad = (await readScoped(squadKey(session.teamId), 'publish:squad', session.teamId)) || null;
    }
    return res.status(200).json(result);
  }

  // ── POST: coach writes published state ────────────────────────────────────
  if (req.method === 'POST') {
    const { type, data } = req.body || {};
    let session;
    try {
      session = await requireTenantPermission(req, (type === 'squad' || type === 'draft') ? PERM.PUBLISH_SQUADS : PERM.PUBLISH_TRAINING);
    } catch (error) {
      return sendAuthError(res, error);
    }

    // Save THIS coach's private draft. Owner is taken from the session — never
    // the body — so a coach can only ever write their own draft, and doing so
    // never touches the official published squad (that needs `type: 'squad'`).
    if (type === 'draft') {
      const draft = sanitiseSquad(data);
      if (!draft) return res.status(400).json({ error: 'data must be an object' });
      try {
        draft.fixtureId = await assertFixtureBelongsToClub(session.teamId, draft.fixtureId);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      draft.userId = session.user.id;
      draft.updatedAt = new Date().toISOString();
      await kvSet(draftKey(session.teamId, session.user.id), draft);
      return res.status(200).json({ ok: true, draft });
    }

    if (type === 'sessions') {
      const sessions = sanitiseSessions(data);
      await kvSet(sessionsKey(session.teamId), sessions);
      return res.status(200).json({ ok: true, sessions });
    }

    if (type === 'squad') {
      const squad = sanitiseSquad(data);
      if (!squad) return res.status(400).json({ error: 'data must be an object' });
      try {
        squad.fixtureId = await assertFixtureBelongsToClub(session.teamId, squad.fixtureId);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      if (!squad.published) {
        await kvSet(squadKey(session.teamId), null);
        return res.status(200).json({ ok: true, squad: null });
      }
      squad.publishedAt = squad.publishedAt || new Date().toISOString();
      await kvSet(squadKey(session.teamId), squad);
      return res.status(200).json({ ok: true, squad });
    }

    return res.status(400).json({ error: 'type must be sessions or squad' });
  }

  // ── DELETE: coach clears published state ──────────────────────────────────
  if (req.method === 'DELETE') {
    const type = req.body?.type || req.query?.type;
    let session;
    try {
      session = await requireTenantPermission(req, type === 'squad' ? PERM.PUBLISH_SQUADS : PERM.PUBLISH_TRAINING);
    } catch (error) {
      return sendAuthError(res, error);
    }
    if (type === 'squad') {
      await kvSet(squadKey(session.teamId), null);
      return res.status(200).json({ ok: true });
    }
    if (type === 'sessions') {
      await kvSet(sessionsKey(session.teamId), []);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'type must be sessions or squad' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
