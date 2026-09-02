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
import { DEFAULT_TEAM, loadTeamMembers, loadUsers,
         loadPlayerProfiles, legacyPlayerIdsForUser, rosterRowBelongsToUser } from './_identityStore.js';
import { requireTenantPermission, requireTenantSession, requireClubManage, assertSameTenant, can, PERM } from './_tenant.js';
import {
  loadClubStructure, createGroup, createTeam, renameGroup, renameTeam,
  setGroupStatus, setTeamStatus, activeGroups, INITIAL_GROUP_ID,
  setGroupDevelopmentCategory,
} from './_structureStore.js';
import { effectiveAccessScope, resolveEligibility, resolvePlayerGroup, isPlayingMember,
         operationalGroupsFor, defaultOperationalGroup, assertOperationalGroup } from './_accessScope.js';
import {
  loadMedicalRecord, activeCases, upsertCase, resolveCase, projectPlayer,
} from './_medicalStore.js';
import {
  loadPerformanceRecord, programmeById, assignmentById, assignmentsForAthlete,
  occupyingAssignments, saveProgrammeDraft, publishProgramme, createAssignmentRecord,
  updateAssignmentStatus, reviewProgression, projectAssignmentForPlayer,
  projectAssignmentForCoach, saveAuthoringProfile, authoringProfileFor,
} from './_performanceStore.js';
import { loadTeams } from './_identityStore.js';
import { canonicalRole } from './_permissions.js';
import { gateRestrictionSignal } from '../performance/domain/authoring-profile.js';
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

// ── FIXTURE-SCOPED MATCH CENTRE STORAGE ──────────────────────────────────
// A club used to hold ONE published squad and one draft per coach, so working
// on a second fixture overwrote the first. These carry the fixture in the key
// itself. Fixture ids are validated against the club's own fixture list before
// any key is built, so an id can never be forged into another club's keyspace.
//
// The id is club-supplied text, so it is percent-encoded before becoming a key
// segment: that keeps ':' out of the middle of a key and makes the segment
// boundaries exact, so a fixture named "a:squad" cannot be read as some other
// record. Encoding rather than rejecting means no fixture is locked out.
const fxSeg = fixtureId => encodeURIComponent(String(fixtureId));
function fixtureSquadKey(teamId, fixtureId) { return key(`publish:${teamId}:fixture:${fxSeg(fixtureId)}:squad`); }
function fixtureDraftKey(teamId, fixtureId, userId) { return key(`publish:${teamId}:fixture:${fxSeg(fixtureId)}:draft:${encodeURIComponent(String(userId))}`); }

// ── SIDE-SCOPED STORAGE (dual Premier / Premier Development) ─────────────
// A club structure TEAM ("side") is a real storage dimension: the same
// Seniors fixture can hold one sheet per side, drawn from the same player
// pool. The side id is a structure team id — NOT the tenant teamId — and is
// validated against the club's own structure before any key is built, then
// percent-encoded so it can never escape its segment. Legacy sideless keys
// remain readable, explicitly unassigned to either side.
function fixtureSideSquadKey(teamId, fixtureId, sideId) {
  return key(`publish:${teamId}:fixture:${fxSeg(fixtureId)}:side:${fxSeg(sideId)}:squad`);
}
function fixtureSideDraftKey(teamId, fixtureId, sideId, userId) {
  return key(`publish:${teamId}:fixture:${fxSeg(fixtureId)}:side:${fxSeg(sideId)}:draft:${encodeURIComponent(String(userId))}`);
}

/**
 * The side must be one of THIS club's ACTIVE structure teams. Same strength
 * as fixture validation: a forged, foreign, unknown or archived id is 404 and
 * never becomes part of a storage key. '' is valid and means "no side" —
 * every legacy client and single-team club stays on the sideless paths.
 */
async function assertSideBelongsToClub(teamId, sideId) {
  const id = String(sideId || '').trim();
  if (!id) return '';
  const structure = await loadClubStructure(teamId);
  const team = (structure?.teams || []).find(t => String(t.id) === id);
  if (!team || team.status !== 'active') {
    const e = new Error('Unknown team for this club');
    e.status = 404;
    throw e;
  }
  return id;
}

function sideNameFrom(structure, sideId) {
  return (structure?.teams || []).find(t => String(t.id) === String(sideId))?.name || '';
}

/**
 * The PLAYER GROUP a fixture belongs to. A legacy record with no groupId
 * belongs to the club's INITIAL group — the documented owner of all
 * pre-structure club data (production's Seniors) — never to a newer group.
 */
function fixtureGroupOf(fx) {
  return String(fx?.groupId || '').trim() || INITIAL_GROUP_ID;
}

/**
 * A side and a fixture must play in the SAME group: publishing a Seniors
 * fixture with a U18 team sheet (or vice versa) is refused before any key is
 * built. Only enforced when a side is in play — sideless legacy paths are
 * untouched.
 */
async function assertFixtureSideCoherence(teamId, fixtureId, sideId) {
  if (!fixtureId || !sideId) return;
  const club = (await kvGet(clubKey(teamId))) || {};
  const fx = (Array.isArray(club.fixtures) ? club.fixtures : [])
    .find(f => String(f?.id || '') === String(fixtureId));
  const structure = await loadClubStructure(teamId);
  const side = (structure?.teams || []).find(t => String(t.id) === String(sideId));
  if (!fx || !side || String(side.groupId || '') !== fixtureGroupOf(fx)) {
    const e = new Error("That team does not play in this fixture's group");
    e.status = 400;
    throw e;
  }
}

/**
 * Every player-facing published sheet for ONE fixture: each published
 * side-scoped record (labelled with its real team name), then the legacy
 * sideless record as an explicitly UNASSIGNED sheet — it is never
 * heuristically attributed to a side. Read-only: never rewrites anything.
 */
async function publishedSheetsForFixture(teamId, fixtureId) {
  const sheets = [];
  const structure = await loadClubStructure(teamId);
  const sideKeys = await kvScanKeys(
    `${APP_PREFIX}:publish:${teamId}:fixture:${fxSeg(fixtureId)}:side:*:squad`);
  for (const k of sideKeys) {
    const m = k.match(/:side:([^:]+):squad$/);
    if (!m) continue;
    let sideId; try { sideId = decodeURIComponent(m[1]); } catch { sideId = m[1]; }
    const squad = await kvGet(k);
    if (!squad || typeof squad !== 'object' || !squad.published) continue;
    sheets.push({ fixtureId: String(fixtureId), sideId,
                  teamName: sideNameFrom(structure, sideId) || 'Team', squad });
  }
  sheets.sort((a, b) => String(a.teamName).localeCompare(String(b.teamName)));
  const legacy = (await kvGet(fixtureSquadKey(teamId, fixtureId))) || null;
  if (legacy && typeof legacy === 'object' && legacy.published) {
    sheets.push({ fixtureId: String(fixtureId), sideId: '', teamName: '', squad: legacy });
  } else {
    // Pre-Pass-A compatibility: the CLUB-WIDE record still answers for the one
    // fixture it names, exactly as the old single-squad read did.
    const clubWide = (await kvGet(squadKey(teamId))) || null;
    if (clubWide && typeof clubWide === 'object' && clubWide.published &&
        String(clubWide.fixtureId || '') === String(fixtureId)) {
      sheets.push({ fixtureId: String(fixtureId), sideId: '', teamName: '', squad: clubWide });
    }
  }
  return sheets;
}

// ── WHAT PLAYERS SEE ─────────────────────────────────────────────────────
// One record decides this, and it is only ever written by a coach ACTING:
// publishing chooses a squad, withdrawing chooses none. Nothing is inferred
// from dates, and no stored squad is ever automatically promoted.
//
//   absent            no Pass A action has happened yet -> legacy club-wide
//                     squad still answers, exactly as it did before Pass A.
//   {mode:'fixture'}  that fixture's scoped squad, and only that one.
//   {mode:'legacy'}   the club-wide squad, published with no fixture linked.
//   {mode:'none'}     explicitly withdrawn. Players see nothing.
//
// 'none' is why withdrawal is safe: without it, clearing the record would fall
// back to whatever legacy squad happened to remain and resurrect a side the
// coach had just taken down.
function currentSquadPointerKey(teamId) { return key(`publish:${teamId}:squad:current`); }

const POINTER_MODES = new Set(['fixture', 'legacy', 'none']);

/** Reads the mode record, tolerating an early Pass A record that carried a bare id. */
async function readSquadPointer(teamId) {
  const raw = (await kvGet(currentSquadPointerKey(teamId))) || null;
  if (!raw || typeof raw !== 'object') return null;
  const fixtureId = String(raw.fixtureId || '').trim();
  const mode = POINTER_MODES.has(raw.mode) ? raw.mode : (fixtureId ? 'fixture' : null);
  if (!mode) return null;
  return { mode, fixtureId };
}

function writeSquadPointer(teamId, mode, fixtureId, userId) {
  return kvSet(currentSquadPointerKey(teamId), {
    mode,
    fixtureId: mode === 'fixture' ? String(fixtureId) : '',
    updatedAt: new Date().toISOString(),
    updatedBy: String(userId || ''),
  });
}

/**
 * Withdraw a fixture's squad.
 *
 * Deletes rather than nulls: an existing key is what marks a fixture as having
 * squad work, so a null tombstone would block that fixture's import updates
 * forever. Player-facing state moves to 'none' only when THIS fixture is what
 * players are currently seeing — withdrawing some other fixture must not blank
 * a board it was never showing.
 */
/**
 * After a withdrawal touching one fixture: players move to 'none' ONLY when
 * that fixture has nothing published left. If the OTHER side's sheet is still
 * published, the pointer keeps naming the fixture and that sheet stays on
 * show — withdrawing Premier must never take Premier Development down.
 */
async function settlePointerAfterWithdraw(teamId, fixtureId, userId) {
  const pointer = await readSquadPointer(teamId);
  if (!pointer || pointer.mode !== 'fixture' || pointer.fixtureId !== String(fixtureId)) return;
  const remaining = await publishedSheetsForFixture(teamId, fixtureId);
  if (!remaining.length) await writeSquadPointer(teamId, 'none', '', userId);
}

/** Withdraw ONE side's sheet. Real deletion; the sibling side is untouched. */
async function retireSideSquad(teamId, fixtureId, sideId, userId) {
  await kvDel(fixtureSideSquadKey(teamId, fixtureId, sideId));
  await settlePointerAfterWithdraw(teamId, fixtureId, userId);
}

async function retireFixtureSquad(teamId, fixtureId, userId) {
  await kvDel(fixtureSquadKey(teamId, fixtureId));

  const pointer = await readSquadPointer(teamId);
  const legacy = (await kvGet(squadKey(teamId))) || null;
  const legacyNamesIt = legacy && String(legacy.fixtureId || '') === fixtureId;

  // The pre-Pass-A club-wide record for this same fixture is being withdrawn too,
  // or it would keep answering for a squad that no longer exists.
  if (legacyNamesIt) await kvDel(squadKey(teamId));

  if (pointer) {
    // A still-published SIDE sheet keeps the fixture on show (settle checks).
    await settlePointerAfterWithdraw(teamId, fixtureId, userId);
  } else if (legacyNamesIt) {
    // no pointer yet: the legacy record was what players saw
    await writeSquadPointer(teamId, 'none', '', userId);
  }
}

/** Withdraw the unlinked club-wide squad. Players are left with nothing. */
async function retireLegacySquad(teamId, userId) {
  await kvDel(squadKey(teamId));
  await writeSquadPointer(teamId, 'none', '', userId);
}
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

/** Rugby's full match, and the ceiling a stored value is clamped to. */
const DEFAULT_MATCH_MINUTES = 80;
const MAX_MATCH_MINUTES = 200;          // extra time + a wide margin, never unbounded
const MAX_SUBSTITUTIONS = 40;           // 8 bench + rolling/blood subs, generously

/**
 * Substitution events for one match sheet.
 *
 * A sheet identifies its players BY NAME (formationNames / benchPlayers), so an
 * event carries BOTH: the durable person key the client already uses for match
 * identity (mcPersonKey → "id:<userId or roster id>", falling back to "nm:<name>"
 * when a name matches no roster player) AND the name as displayed at the time.
 * The key is what season playing time will aggregate on; the name is a snapshot
 * so a historical sheet still reads correctly after a rename.
 *
 * Everything is bounded: a fixed set of fields, capped lengths, a capped array,
 * and a minute clamped to the match length. Nothing here authorises anything —
 * the fixture, side and tenant were already validated at the request boundary.
 */
function sanitiseSubstitutions(raw, matchMinutes) {
  if (!Array.isArray(raw)) return [];
  const cap = str => String(str || '').slice(0, 120);
  const out = [];
  for (const s of raw.slice(0, MAX_SUBSTITUTIONS)) {
    if (!s || typeof s !== 'object') continue;
    // Minute 0 is legitimate, so an ABSENT minute must be rejected distinctly:
    // Number(null) and Number('') are both 0, which would store an unanswered
    // field as a real 0th-minute event.
    const rawMinute = s.minute;
    const givenMinute = typeof rawMinute === 'number'
      || (typeof rawMinute === 'string' && rawMinute.trim() !== '');
    const minute = givenMinute ? Number(rawMinute) : NaN;
    if (!Number.isInteger(minute) || minute < 0 || minute > matchMinutes) continue;
    const offKey = cap(s.offKey), onKey = cap(s.onKey);
    if (!offKey || !onKey || offKey === onKey) continue;
    out.push({
      id:      String(s.id || '').slice(0, 40) || `sub_${out.length}`,
      minute,
      offKey,  onKey,
      offName: cap(s.offName),
      onName:  cap(s.onName),
      at:      String(s.at || '').slice(0, 40),
    });
  }
  // Chronological, with the recording order breaking ties on the same minute.
  return out.sort((a, b) => a.minute - b.minute || String(a.at).localeCompare(String(b.at)));
}

function sanitiseMatchMinutes(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_MATCH_MINUTES) return DEFAULT_MATCH_MINUTES;
  return n;
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
  const matchMinutes = sanitiseMatchMinutes(raw.matchMinutes);
  // ── WHO those names meant (identity pass) ───────────────────────────────
  // Resolved by the client at publish time from its own club roster, using the
  // canonical identity substitutions and season statistics already use. Stored
  // ALONGSIDE the names, never instead of them: the names are the historical
  // display and every sheet published before this build has only them.
  //
  // Shape mirrors the names exactly — an object keyed by slot, and an array by
  // bench index — so a reader can pair them positionally without a second
  // model. Only the durable form is accepted: a key must look like "id:<x>",
  // which is what playerMatchKey produces. An unresolved "nm:<name>" is
  // deliberately NOT storable, because freezing a guess is worse than leaving
  // the entry to the existing safe name resolution.
  const personKey = v => {
    const k = String(v || '').trim();
    return /^id:[A-Za-z0-9._:-]{1,80}$/.test(k) ? k : '';
  };
  const formationKeys = raw.formationKeys && typeof raw.formationKeys === 'object' && !Array.isArray(raw.formationKeys)
    ? Object.fromEntries(
        Object.entries(raw.formationKeys)
          .slice(0, 30)
          .map(([k, v]) => [String(k).slice(0, 8), personKey(v)])
          .filter(([, v]) => v)
      )
    : {};
  const benchKeys = Array.isArray(raw.benchKeys)
    ? raw.benchKeys.slice(0, 30).map(personKey)
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
    // The structure team (side) this sheet belongs to — Premier vs Premier
    // Development. Same contract as fixtureId: boundary-validated, absent on
    // every legacy record, and absent stays absent.
    sideId:        String(raw.sideId || ''),
    // ── Substitutions (playing-time foundation) ─────────────────────────────
    // The match record is the only place these can live: it is already keyed
    // per fixture AND side, already tenant-checked and coherence-checked at the
    // boundary, and already gated on PUBLISH_SQUADS. A separate store would
    // have had to re-earn all four.
    //
    // The fixture model carries no DURATION, so full time is stored here with
    // the match it describes rather than invented as a new fixture field.
    // Absent means the rugby default; it is never inferred from anything else.
    matchMinutes,
    substitutions: sanitiseSubstitutions(raw.substitutions, matchMinutes),
    formationKeys,
    benchKeys,
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
    // The INITIAL group owns unattributable legacy data everywhere else in
    // the product, so a whole-club-covering caller ASKING for the initial
    // group still sees orphan cases there — otherwise stamping the operating
    // group on the Medical screen would make orphans invisible to everyone.
    // Asking for any OTHER group remains a strictly narrower question and
    // never returns orphans.
    const coversWholeClub = live.length > 0
      && (!requested || requested === INITIAL_GROUP_ID)
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
    // The PLAYER GROUP this fixture belongs to (Seniors / U18 / Women's).
    // Boundary-validated where fixtures are created or imported; '' on every
    // legacy record, which by the documented compatibility rule belongs to
    // the club's INITIAL group — never guessed onto a newer group.
    groupId:       s(fx?.groupId, 40),
    // The CANONICAL club-structure team this fixture belongs to — the same
    // side identity the Match Centre's per-side sheets already use. Optional:
    // '' on every legacy record and on any club that runs one team per group.
    // Boundary-validated at create/import (an active team IN the fixture's
    // group, or refused); the free-text `team` above stays as display text.
    sideId:        s(fx?.sideId, 40),
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

// ── GROUP-SCOPED TRAINING STORAGE ────────────────────────────────────────
// Training is a GROUP resource: Seniors, U18 and Women's each hold their own
// recurring schedule, published plans and session list, so the same nominal
// session id (tue / slot_tue1-20260818) can exist in every group without
// collision. Legacy club-wide records remain readable ONLY through the
// INITIAL group — production's Seniors — exactly the availability rule:
// deterministic ownership of pre-group history, never a guess. Writes always
// land on the group key; the legacy keys stay untouched underneath.
function trainingScheduleGroupKey(teamId, groupId) {
  return key(`publish:${teamId}:group:${fxSeg(groupId)}:training_schedule`);
}
function trainingGroupStoreKey(teamId, groupId) {
  return key(`publish:${teamId}:group:${fxSeg(groupId)}:training`);
}
function sessionsGroupKey(teamId, groupId) {
  return key(`publish:${teamId}:group:${fxSeg(groupId)}:sessions`);
}

/** STAFF group for a training WRITE: asserted, or the single operable default. */
async function staffTrainingGroup(session, requestedGroup) {
  const structure = await loadClubStructure(session.teamId);
  const requested = String(requestedGroup || '').trim();
  if (requested) return assertOperationalGroup(session, structure, requested, { as: 'staff' }).id;
  const mine = operationalGroupsFor(session.teamMember, structure, { as: 'staff' });
  if (mine.length === 1) return mine[0].id;
  const e = new Error('Choose which group');
  e.status = 400;
  throw e;
}

/**
 * The group a training VIEW resolves to. An explicit ?group= is a staff ask
 * and is asserted. Otherwise: a playing member reads where they PLAY; a
 * staff-only member falls back to their first operable group (deterministic,
 * and never outside their scope); a pre-group identity lands on the INITIAL
 * group — the legacy view.
 */
async function trainingViewGroup(session, requestedGroup) {
  const structure = await loadClubStructure(session.teamId);
  const requested = String(requestedGroup || '').trim();
  if (requested) return assertOperationalGroup(session, structure, requested, { as: 'staff' }).id;
  const { groupId } = resolvePlayerGroup(session.teamMember || {}, structure);
  if (groupId) return groupId;
  const mine = operationalGroupsFor(session.teamMember, structure, { as: 'staff' });
  return mine[0]?.id || INITIAL_GROUP_ID;
}

/**
 * The group's published-training store. When a group has no scoped store yet,
 * only the INITIAL group sees the legacy club-wide one — and because a write
 * persists the WHOLE store back to the group key, the first scoped write
 * copy-forwards every legacy publication rather than shadowing them.
 */
async function readGroupTrainingStore(teamId, groupId) {
  const scoped = await kvGet(trainingGroupStoreKey(teamId, groupId));
  if (scoped && typeof scoped === 'object') return scoped;
  if (String(groupId) !== INITIAL_GROUP_ID) return {};
  return (await kvGet(trainingKey(teamId))) || {};
}

/** Same rule for the session-definition list. */
async function readGroupSessions(teamId, groupId) {
  const scoped = await kvGet(sessionsGroupKey(teamId, groupId));
  if (Array.isArray(scoped)) return scoped;
  if (String(groupId) !== INITIAL_GROUP_ID) return [];
  const legacy = await readScoped(sessionsKey(teamId), 'publish:sessions', teamId);
  return Array.isArray(legacy) ? legacy : [];
}

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
    // No invented time. Training scheduling asks for a day and a start time;
    // a slot whose start time is missing or malformed is stored empty rather
    // than defaulted to an evening nobody chose. Every display already filters
    // empties, so an absent time renders as absent.
    startTime:     hhmm(raw?.startTime),
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
async function readTrainingSchedule(teamId, groupId = INITIAL_GROUP_ID) {
  // The group's own record wins; only the INITIAL group may fall through to
  // the legacy club-wide record (and its club-config seeding below). Any
  // OTHER group with no stored schedule starts honestly EMPTY — U18 and
  // Women's configure their own nights, they never inherit Seniors times.
  const scoped = await kvGet(trainingScheduleGroupKey(teamId, groupId));
  if (scoped && Array.isArray(scoped.slots)) {
    return { record: { ...scoped, slots: scoped.slots.map(sanitiseScheduleSlot) }, seeded: false };
  }
  if (String(groupId) !== INITIAL_GROUP_ID) {
    return { record: { slots: [], updatedAt: null, updatedBy: null, seededFrom: 'empty-group' }, seeded: true };
  }
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
    // GROUP-scoped: players read where they play, staff read their asserted
    // (or single) operational group.
    let session;
    try { session = await requireTenantSession(req); }
    catch (error) { return sendAuthError(res, error); }
    let gid;
    try { gid = await trainingViewGroup(session, req.query?.group); }
    catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
    const { record, seeded } = await readTrainingSchedule(session.teamId, gid);
    return res.status(200).json({ ok: true, ...record, seeded, groupId: gid, canEdit: can(session, PERM.MANAGE_FIXTURES) });
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

  // A write must name (or unambiguously imply) the group it edits — a
  // forged group outside the caller's scope is rejected by the assertion.
  let writeGid;
  try { writeGid = await staffTrainingGroup(session, req.body?.group ?? req.query?.group); }
  catch (error) { return res.status(error.status || 403).json({ error: error.message }); }

  const { record } = await readTrainingSchedule(session.teamId, writeGid);
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
  // Writes ALWAYS land on the group key — the legacy club-wide record stays
  // frozen underneath as pre-partition history. For the INITIAL group this is
  // the copy-forward moment: the merged record (legacy fallback + this edit)
  // becomes the group's own store.
  await kvSet(trainingScheduleGroupKey(session.teamId, writeGid), next);
  await auditLog(auditEvent, {
    teamId: session.teamId, groupId: writeGid, slotId: slotId || next.slots[next.slots.length - 1]?.id || '',
    by: session.user.id, slotCount: next.slots.length, ip: requestIp(req),
  });
  return res.status(200).json({ ok: true, ...next, groupId: writeGid, canEdit: true });
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
  // Every fixture that holds its own published squad counts as referenced too,
  // or moving to scoped storage would have quietly weakened the protection that
  // stops a fixture being edited out from under a squad.
  //
  // The VALUE decides, not the key's existence: a withdrawn squad must release
  // its fixture. Reading through kvGet also means a leftover null from any
  // earlier build releases correctly rather than blocking the fixture forever.
  const scopedSquadKeys = await kvScanKeys(`${APP_PREFIX}:publish:${teamId}:fixture:*:squad`);
  for (const k of scopedSquadKeys) {
    const stored = await kvGet(k);
    if (!stored || typeof stored !== 'object') continue;
    // Sideless (fixture:<id>:squad) AND side-scoped (fixture:<id>:side:<s>:squad)
    // records both protect their fixture from being edited out from under them.
    const m = k.match(/:fixture:([^:]+):squad$/) || k.match(/:fixture:([^:]+):side:[^:]+:squad$/);
    if (!m || !m[1]) continue;
    let id; try { id = decodeURIComponent(m[1]); } catch { id = m[1]; }
    selectionIds.add(id);
  }
  const pointer = await readSquadPointer(teamId);
  if (pointer?.mode === 'fixture' && pointer.fixtureId) selectionIds.add(pointer.fixtureId);
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

  // ── GROUP context for fixture writes ─────────────────────────────────────
  // A new or imported fixture belongs to a PLAYER GROUP. A provided groupId
  // is asserted against the caller's staff scope; with none provided, the
  // caller's single operable group is the unambiguous default. A multi-group
  // caller must say which group — fixtures are never guessed onto one.
  let fixtureGroup = '';
  if (action === 'create' || action === 'import') {
    const structure = await loadClubStructure(session.teamId);
    const requestedGroup = String(req.body?.groupId || req.body?.fixture?.groupId || '').trim();
    try {
      if (requestedGroup) {
        fixtureGroup = assertOperationalGroup(session, structure, requestedGroup, { as: 'staff' }).id;
      } else {
        const mine = operationalGroupsFor(session.teamMember, structure, { as: 'staff' });
        if (mine.length === 1) fixtureGroup = mine[0].id;
        else return res.status(400).json({ error: 'Choose which group these fixtures belong to' });
      }
    } catch (error) {
      return res.status(error.status || 403).json({ error: error.message });
    }
  }

  // ── CANONICAL TEAM (side) for fixture writes ─────────────────────────────
  // A fixture may name the club-structure team it belongs to. An explicit
  // sideId must be an ACTIVE team in the asserted group — anything else is
  // refused, never silently dropped. With no explicit sideId, a free-text
  // team name that matches exactly ONE active team in the group (case- and
  // whitespace-insensitive) adopts that team's id: deterministic, and the
  // same rule a human applies reading the import sheet. No match keeps the
  // text as display-only, exactly as before — nothing is ever guessed.
  const resolveFixtureSide = async (fx) => {
    const structure = await loadClubStructure(session.teamId);
    const inGroup = (structure?.teams || [])
      .filter(t => t.status === 'active' && String(t.groupId) === fixtureGroup);
    const explicit = String(fx.sideId || '').trim();
    if (explicit) {
      const side = inGroup.find(t => String(t.id) === explicit);
      if (!side) {
        const e = new Error('That team does not play in this group');
        e.status = 400;
        throw e;
      }
      return { sideId: side.id, team: fx.team || side.name };
    }
    const nameKey = String(fx.team || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (nameKey) {
      const matches = inGroup.filter(t =>
        String(t.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === nameKey);
      if (matches.length === 1) return { sideId: matches[0].id, team: fx.team };
    }
    return { sideId: '', team: fx.team };
  };

  // ── Single manual fixture ───────────────────────────────────────────────
  if (action === 'create') {
    const incoming = sanitiseFixtureRecord({ ...(req.body?.fixture || {}), groupId: fixtureGroup });
    try { Object.assign(incoming, await resolveFixtureSide(incoming)); }
    catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
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
      // Every imported fixture belongs to the asserted group context — a
      // season upload is one group's season.
      const fixture = sanitiseFixtureRecord({ ...(raw?.fixture || raw || {}), groupId: fixtureGroup });
      try { Object.assign(fixture, await resolveFixtureSide(fixture)); }
      catch (error) {
        summary.errors++;
        details.push({ opposition: fixture.opposition || '(none)', outcome: 'error', reason: error.message });
        continue;
      }
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
    // The dated occurrence this publication belongs to. Publications persist
    // across weeks under the protocol id, so readers use this to prove a
    // snapshot is THIS week's plan rather than a survivor from a past week.
    occurrenceKey: str(s.occurrenceKey, 80),
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
    occurrenceKey: str(s.occurrenceKey, 80),   // dated occurrence — see coachSessionSnapshot
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
    // Published training is read per GROUP: players see their playing group's
    // plans, staff see the group they are operating.
    let gid;
    try { gid = await trainingViewGroup(session, req.query?.group); }
    catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
    const store = await readGroupTrainingStore(session.teamId, gid);
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
    return res.status(200).json({ ok: true, audience, groupId: gid, sessions, count: sessions.length });
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

    let gid;
    try { gid = await staffTrainingGroup(session, req.body?.group ?? req.query?.group); }
    catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
    const store = await readGroupTrainingStore(session.teamId, gid);
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
    await kvSet(trainingGroupStoreKey(session.teamId, gid), store);

    await auditLog('training_published', {
      audience, sessionId: id, teamId: session.teamId, groupId: gid,
      publishedBy: session.user.id, revision: currentRevision,
      republished: Boolean(previous), ip: requestIp(req),
    });

    return res.status(200).json({
      ok: true,
      audience,
      sessionId: id,
      groupId: gid,
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
    let gid;
    try { gid = await staffTrainingGroup(session, req.body?.group ?? req.query?.group); }
    catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
    const store = await readGroupTrainingStore(session.teamId, gid);
    const id = String(incoming.id);
    const record = store[id] || {};
    record.currentRevision = trainingRevision(coachSessionSnapshot(incoming));
    store[id] = record;
    await kvSet(trainingGroupStoreKey(session.teamId, gid), store);
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
    let gid;
    try { gid = await staffTrainingGroup(session, req.body?.group ?? req.query?.group); }
    catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
    const store = await readGroupTrainingStore(session.teamId, gid);
    if (store[id]) {
      delete store[id][audience];
      await kvSet(trainingGroupStoreKey(session.teamId, gid), store);
      await auditLog('training_unpublished', { audience, sessionId: id, teamId: session.teamId, groupId: gid, by: session.user.id, ip: requestIp(req) });
    }
    return res.status(200).json({ ok: true, audience, sessionId: id, groupId: gid });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Season team sheets sub-resource (season statistics foundation) ───────
// READ-ONLY. The authoritative source for season playing time: the published
// Match Centre team sheets a club has actually stored, one per fixture (and
// per side). Nothing here is derived from a client's device.
//
// WHY A NEW SUB-RESOURCE. `?type=squad&fixture=` answers exactly one named
// fixture, so a season needed N round-trips and the client had no way to know
// which fixtures to ask about. This answers the season in one authorised read.
// It is folded into api/publish.js like every other sub-resource, so it costs
// no serverless function (the Hobby ceiling is 12 and we are at 11).
//
// WHAT COUNTS AS PLAYED. A fixture's stored `status` cannot answer this: the
// fixtures resource accepts only 'create' and 'import', so nothing ever writes
// 'completed' to the server — the coach's "Mark complete" button updates their
// own device and is overwritten by the next fixtures sync. The product already
// has ONE definition, in fixtureDisplayStatus: a fixture reads as Completed
// when its status says so OR its date has passed. That rule is mirrored here
// rather than invented, and cancelled/postponed fixtures are excluded.

/** Has this match been played? Mirrors the client's fixtureDisplayStatus rule. */
function fixtureHasBeenPlayed(fx, todayIso) {
  const status = String(fx?.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'postponed') return false;
  if (status === 'completed') return true;
  const date = String(fx?.date || '');
  return !!date && date < todayIso;
}

/** The minimum a season statistic needs. Tactical notes never leave the club. */
function seasonSheetProjection(squad) {
  return {
    formationNames: (squad && typeof squad.formationNames === 'object') ? squad.formationNames : {},
    benchPlayers:   Array.isArray(squad?.benchPlayers) ? squad.benchPlayers : [],
    // Absent on every sheet published before the identity pass — absent stays
    // absent, and the aggregation falls back to resolving the name.
    formationKeys:  (squad && typeof squad.formationKeys === 'object') ? squad.formationKeys : {},
    benchKeys:      Array.isArray(squad?.benchKeys) ? squad.benchKeys : [],
    substitutions:  Array.isArray(squad?.substitutions) ? squad.substitutions : [],
    matchMinutes:   Number.isInteger(squad?.matchMinutes) ? squad.matchMinutes : DEFAULT_MATCH_MINUTES,
  };
}

// ── TRAINING ATTENDANCE ──────────────────────────────────────────────────
// Who ACTUALLY TURNED UP — a different fact from who said they could.
// Availability is a player's answer beforehand; attendance is the coach's
// record afterwards. Nothing here reads, writes or infers from availability,
// and no historical availability was ever converted into an attendance record:
// a club's attendance history starts empty and fills only as coaches record it.
//
// SELF-DESCRIBING, and it has to be. The group's session list
// (publish:<team>:group:<gid>:sessions) carries only the CURRENT WEEK — the
// client syncs state.schedule, which is one week, and each sync replaces the
// last. Attendance keyed by session id alone would therefore lose the date of
// every session older than a week, and a season figure would have nothing to
// stand on. So each record stores the session's own date and title, captured
// HERE from the stored session at the moment attendance is taken — never from
// the client, which must not be able to date its own history.
function attendanceKey(teamId, groupId) {
  return key(`publish:${teamId}:group:${fxSeg(groupId)}:attendance`);
}

const ATT_PLAYER_KEY_RE = /^id:[A-Za-z0-9._:-]{1,80}$/;
const ATT_DATED_RE = /-(\d{8})$/;

/**
 * THE ATTENDANCE OCCURRENCE IDENTITY — one Tuesday, not every Tuesday.
 *
 * A recurring slot keeps ONE id for the week being viewed: the current week's
 * training is `tue` this week and `tue` again next week (see
 * availabilityEventsForWeek — `isCurrentWeek ? slot.sessionId : dated`). Keying
 * a register by that id therefore reused it every week: the second Tuesday
 * merged into the first and overwrote its stored date, so the earlier session's
 * attendance was not merely unreachable, it was destroyed.
 *
 * The occurrence is the SLOT PLUS THE DAY IT HAPPENED, so the date the server
 * already holds for that session is what makes it unique. Deterministic and
 * idempotent: an id that already carries its own date is returned unchanged,
 * so a dated session id is never dated twice.
 *
 * Returns '' when no stable occurrence can be formed — never a guess.
 */
function attendanceOccurrenceRoot(sessionId, slots) {
  const root = String(sessionId || '').trim().replace(ATT_DATED_RE, '');
  if (!root) return '';
  // A recurring slot is known by TWO names: its own id (`slot_tue`) and, for the
  // two legacy slots only, the availability session it drives (`tue`). The
  // current week is generated under the second and every other week under the
  // first, so the same real Tuesday could otherwise produce `tue-20260901` and
  // `slot_tue-20260901` — two registers for one session. The slot table is the
  // mapping between the two names and settles it without guessing.
  const match = (Array.isArray(slots) ? slots : []).find(sl => sl && String(sl.sessionId || '') === root);
  return match ? String(match.id || root) : root;
}

/**
 * THE ATTENDANCE OCCURRENCE IDENTITY — one training session, once.
 *
 * `<canonical slot root>-<YYYYMMDD>`, e.g. slot_tue-20260901. Every form the
 * product can hand us converges on it:
 *   tue                + 2026-09-01 -> slot_tue-20260901   (current week)
 *   tue-20260901                    -> slot_tue-20260901   (a Build A record)
 *   slot_tue-20260901               -> slot_tue-20260901   (any other week)
 *   adhoc_x-20260901                -> adhoc_x-20260901    (no slot: unchanged)
 *
 * A date carried BY the id wins over the one passed in — the id is the harder
 * fact, and it is what makes a past occurrence addressable at all.
 *
 * Returns '' when no stable occurrence can be formed — never a guess.
 */
function attendanceOccurrenceId(sessionId, dateIso, slots) {
  const id = String(sessionId || '').trim();
  if (!id) return '';
  const root = attendanceOccurrenceRoot(id, slots);
  if (!root) return '';
  const carried = ATT_DATED_RE.exec(id);
  const d = carried
    ? carried[1].slice(0, 4) + '-' + carried[1].slice(4, 6) + '-' + carried[1].slice(6, 8)
    : String(dateIso || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return '';
  // Range-checked WITHOUT Date: parsing would drag in a timezone, and a day is
  // exactly what must not shift here.
  const mo = Number(m[2]), day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return '';
  return root + '-' + d.replace(/-/g, '');
}

/**
 * Move any legacy register (keyed by the bare recurring id) onto its dated
 * occurrence id, using THE DATE THE RECORD ITSELF STORES. That date was written
 * server-side from the session record when attendance was taken, so the mapping
 * is exact and needs no guessing.
 *
 * Deterministic, idempotent and lossless:
 *   · a record already keyed by an occurrence id is untouched;
 *   · a record with no usable date is LEFT WHERE IT IS rather than guessed;
 *   · if the derived id is already present, the existing (dated) record wins
 *     and the legacy one is left in place — two registers are never merged
 *     merely because their old key matched.
 */
function migrateAttendanceDoc(doc, slots) {
  const src = (doc && doc.sessions) || {};
  const out = {};
  const carried = [];
  // Canonical keys are settled first, so a legacy record can never displace one.
  Object.entries(src).forEach(([k, rec]) => {
    const derived = attendanceOccurrenceId(k, rec && rec.date, slots);
    if (derived && derived === k) out[k] = rec;
  });
  Object.entries(src).forEach(([k, rec]) => {
    const derived = attendanceOccurrenceId(k, rec && rec.date, slots);
    if (derived && derived === k) return;                  // already canonical
    if (!derived || out[derived]) { out[k] = rec; carried.push(k); return; }
    out[derived] = rec;
  });
  return { sessions: out, carried };
}
const ATT_STATUS = ['present', 'absent'];
const ATT_MAX_SESSIONS = 400;      // a season of training, generously
const ATT_MAX_MARKS    = 200;      // a squad, generously

/** One session's stored attendance, sanitised. Unknown fields never survive. */
function sanitiseAttendanceSession(raw) {
  const marks = {};
  const src = (raw && typeof raw.marks === 'object' && !Array.isArray(raw.marks)) ? raw.marks : {};
  Object.entries(src).slice(0, ATT_MAX_MARKS).forEach(([k, v]) => {
    if (ATT_PLAYER_KEY_RE.test(k) && ATT_STATUS.includes(String(v))) marks[k] = String(v);
  });
  return {
    date:      String(raw?.date  || '').slice(0, 10),
    title:     String(raw?.title || '').slice(0, 120),
    sourceSessionId: String(raw?.sourceSessionId || '').slice(0, 80),
    marks,
    updatedAt: raw?.updatedAt || null,
    updatedBy: String(raw?.updatedBy || '').slice(0, 80),
  };
}

function sanitiseAttendanceDoc(raw) {
  const out = {};
  const all = (raw && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions)) ? raw.sessions : {};
  // When the cap bites, keep the MOST RECENT sessions. Insertion order would
  // drop whatever was written last — the current season — and silently losing
  // live data is far worse than losing the oldest history.
  const src = Object.fromEntries(Object.entries(all).sort((a, b) =>
    String((b[1] && b[1].date) || '').localeCompare(String((a[1] && a[1].date) || ''))
    || String(a[0]).localeCompare(String(b[0]))).slice(0, ATT_MAX_SESSIONS));
  Object.entries(src).forEach(([sid, v]) => {
    const id = String(sid).slice(0, 80);
    if (id) out[id] = sanitiseAttendanceSession(v);
  });
  return { sessions: out };
}

/**
 * WAS THIS A REAL TRAINING SESSION? — asked of a PAST occurrence.
 *
 * The stored session list holds only the current week, so a past session is not
 * in it. Nothing is invented to fill that gap; an occurrence is accepted only
 * when the server can already PROVE it happened, from two kinds of evidence:
 *
 *  1. A register already exists for it. That register was written server-side
 *     at the time, with the date taken from the session record then in force —
 *     so its existence is proof, and its own date and title are the facts.
 *
 *  2. The group's training schedule contains the slot the occurrence is rooted
 *     in, the date falls on that slot's WEEKDAY, inside the slot's effective
 *     range, and is not in the future. A slot that runs on Tuesdays did have a
 *     session on a past Tuesday; that is derivation, not invention.
 *
 * Anything else — an ad-hoc session nobody recorded, a Wednesday claimed for a
 * Tuesday slot, a date before the slot existed, a future date — is refused.
 */
function attendanceHistoricalOccurrence(sessionId, slots, storedSessions, todayIso) {
  const occId = attendanceOccurrenceId(sessionId, '', slots);
  if (!occId) return null;                      // no date carried, nothing to place it on

  // (1) an existing register is its own proof
  const existing = storedSessions && storedSessions[occId];
  if (existing && String(existing.date || '')) {
    const d = String(existing.date).slice(0, 10);
    // A register proves the session EXISTS. It does not turn a session that has
    // not happened yet into history: a ledger entry is written when a session is
    // created, which may be days before it takes place. Until its date arrives
    // it stays reachable only through the current week's list, as before.
    if (todayIso && d > todayIso) return null;
    return { occurrenceId: occId, date: d, title: String(existing.title || ''), evidence: 'register' };
  }

  const m = /^(.*)-(\d{4})(\d{2})(\d{2})$/.exec(occId);
  if (!m) return null;
  const root = m[1];
  const date = `${m[2]}-${m[3]}-${m[4]}`;
  if (!todayIso || date > todayIso) return null;               // the future is planning

  const slot = (Array.isArray(slots) ? slots : []).find(sl => sl && String(sl.id || '') === root);
  if (!slot) return null;                                      // no slot: nothing to derive from
  if (slot.effectiveFrom && date < slot.effectiveFrom) return null;
  if (slot.effectiveTo   && date > slot.effectiveTo)   return null;

  // Weekday WITHOUT a timezone: built and read in UTC, so the day cannot shift.
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = DAY[new Date(Date.UTC(Number(m[2]), Number(m[3]) - 1, Number(m[4]))).getUTCDay()];
  if (weekday !== String(slot.day || '')) return null;          // that slot did not run that day

  const FULL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
                 Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
  return { occurrenceId: occId, date, title: `${FULL[weekday]} Training`, evidence: 'schedule' };
}

/**
 * THE SESSION LEDGER — proof that a session happened, kept in the store that
 * already holds what happened AT it.
 *
 * An ad-hoc session reaches the server the moment it is created, with its own
 * durable id and its date. What it does not survive is the weekly rollover: the
 * group's session list is REPLACED on the next sync, so a week later nothing
 * remembers the session existed and its attendance can never be recorded.
 *
 * Nothing is invented to fix that and no second store is introduced. A register
 * with no marks already means exactly "this session happened; no attendance
 * decisions were recorded" — the product's existing third state. So each session
 * the server accepts is recorded as an empty register the first time it is seen.
 * Thereafter it is proof in its own right (the rule the retrospective path
 * already uses), History lists it like any other, and the canonical occurrence
 * id makes it idempotent: one session can never produce two entries however
 * many times the schedule is synced.
 *
 * Pure, and returns only what is NEW — an unchanged schedule costs no write.
 */
function attendanceLedgerAdditions(sessions, existingSessions, slots) {
  const out = {};
  (Array.isArray(sessions) ? sessions : []).forEach(sess => {
    if (!sess || String(sess.type || 'Training') !== 'Training') return;
    const occId = attendanceOccurrenceId(sess.id, sess.date, slots);
    if (!occId) return;                                        // undated: no occurrence
    if (existingSessions && existingSessions[occId]) return;    // already known
    if (out[occId]) return;
    out[occId] = {
      date:  String(sess.date || '').slice(0, 10),
      title: String(sess.title || '').slice(0, 120),
      sourceSessionId: String(sess.id || '').slice(0, 80),
      marks: {},
      updatedAt: null,
      updatedBy: '',
    };
  });
  return out;
}

// ── A PLAYER READING THEIR OWN ATTENDANCE ─────────────────────────────────
// Attendance is the coach's record OF a player, so the player it is about may
// read it. Nobody else's, and nothing else about the session.
//
// EVERY input to this path comes from the SESSION. The club, the group and the
// identity are all resolved server-side, so a forged ?group=, a swapped player
// id or an invented key reaches nothing: there is no parameter to forge.

/**
 * The attendance keys this account owns — the mirror of playerMatchKey() on the
 * client, which files a mark under 'id:' + (userId || rosterId).
 *
 * Only identifiers the SERVER already holds against this account are included.
 * Name keys ('nm:…') are deliberately excluded: a name is not an identity, and
 * two players sharing one would read each other's register.
 */
async function attendanceOwnedKeys(teamId, userId) {
  // No guard for an empty id here: `ids.delete('')` below removes it, and the
  // caller refuses an empty key set outright. A second rule saying the same
  // thing could only drift from the first — and mutation proved it changed no
  // answer, which is what redundant means.
  const uid = String(userId || '').trim();
  const ids = new Set([uid]);
  const legacyIds = legacyPlayerIdsForUser(await loadPlayerProfiles(), uid);
  legacyIds.forEach(id => ids.add(String(id)));
  const roster = (await readScoped(rosterKey(teamId), 'roster', teamId)) || null;
  (roster?.players || []).forEach(row => {
    if (rosterRowBelongsToUser(row, uid, legacyIds)) ids.add(String(row.id || ''));
  });
  // A roster row with no id would otherwise contribute the bare key 'id:'.
  // Mutation cannot tell this line apart, because sanitiseAttendanceSession
  // already refuses that key on the way into the store — but that rule lives in
  // another function, and this one should be correct on its own terms.
  ids.delete('');
  return new Set([...ids].map(id => 'id:' + id));
}

/**
 * One person's register, cut out of the group's.
 *
 * Only sessions where THIS person was actually marked survive, and each keeps
 * a single mark under `selfKey` — so the client can run the one attendance
 * aggregation over it unchanged, and there is nothing in the payload to learn
 * about anybody else.
 *
 * Two owned keys disagreeing about one session is a genuine ambiguity in the
 * stored data. It is reported, never resolved by picking a favourite: guessing
 * would invent a fact about whether somebody turned up.
 */
function attendanceSelfProjection(sessions, ownedKeys, selfKey) {
  const out = {};
  const ambiguous = [];
  Object.entries(sessions || {}).forEach(([sid, rec]) => {
    if (!rec || typeof rec !== 'object') return;
    const found = [...new Set(Object.entries(rec.marks || {})
      .filter(([k]) => ownedKeys.has(k))
      .map(([, v]) => String(v)))];
    if (!found.length) return;
    if (found.length > 1) { ambiguous.push(String(sid)); return; }
    out[String(sid)] = {
      date: rec.date || '', title: rec.title || '',
      marks: { [selfKey]: found[0] },
    };
  });
  return { sessions: out, ambiguous };
}

async function attendanceSelfHandler(req, res, staffError) {
  let session;
  try { session = await requireTenantSession(req); }
  catch (error) { return sendAuthError(res, error); }

  // Only someone who PLAYS has attendance of their own. A staff-only member
  // who cannot run training is refused with the staff answer, unchanged.
  if (!isPlayingMember(session.teamMember)) return sendAuthError(res, staffError);

  // Their OWN group, from their OWN membership. ?group= is not read here at
  // all — there is no parameter that could point this at another squad.
  const structure = await loadClubStructure(session.teamId);
  const { groupId } = resolvePlayerGroup(session.teamMember || {}, structure);
  if (!groupId) {
    return res.status(409).json({ ok: false, scope: 'self', error:
      'Your training group has not been set, so your attendance cannot be identified.' });
  }

  const selfKey = 'id:' + String(session.user.id);
  const ownedKeys = await attendanceOwnedKeys(session.teamId, session.user.id);

  const slots = ((await readTrainingSchedule(session.teamId, groupId)).record || {}).slots || [];
  const raw = sanitiseAttendanceDoc(await kvGet(attendanceKey(session.teamId, groupId)));
  const migrated = migrateAttendanceDoc(raw, slots);
  const mine = attendanceSelfProjection(migrated.sessions, ownedKeys, selfKey);
  return res.status(200).json({
    ok: true, scope: 'self', groupId, selfKey, sessions: mine.sessions,
    ...(mine.ambiguous.length ? { ambiguous: mine.ambiguous } : {}),
  });
}

async function attendanceHandler(req, res) {
  // The people who run training are the people who record who came to it.
  // Deliberately NOT a broad administrative permission, and deliberately the
  // same gate the training schedule itself uses — one answer to "may this
  // person manage training", for reading and for writing alike.
  let session;
  try { session = await requireTenantPermission(req, PERM.PUBLISH_TRAINING); }
  catch (error) {
    // A player is not staff, but attendance is a record ABOUT them, so a READ
    // falls through to the self path — which answers with their own register
    // and nobody else's. Every WRITE stays staff-only: a player must never be
    // able to mark themselves present.
    if (req.method === 'GET') return attendanceSelfHandler(req, res, error);
    return sendAuthError(res, error);
  }

  // The club comes from the session. The group is asserted against the
  // caller's own staff scope, so a forged ?group= reaches nothing: a Seniors
  // coach naming U18 is refused, exactly as the training write is.
  let gid;
  try { gid = await staffTrainingGroup(session, req.body?.group ?? req.query?.group); }
  catch (error) { return res.status(error.status || 403).json({ error: error.message }); }

  // The slot table is what maps a session's two names onto one root, so the
  // register for a Tuesday is the same register however the week was reached.
  const slots = ((await readTrainingSchedule(session.teamId, gid)).record || {}).slots || [];
  const raw = sanitiseAttendanceDoc(await kvGet(attendanceKey(session.teamId, gid)));
  // Legacy registers are lifted onto their dated occurrence id on the way out,
  // so every consumer sees one identity scheme. The lift is derived from the
  // date each record already carries, and is idempotent.
  const migrated = migrateAttendanceDoc(raw, slots);
  const stored = { sessions: migrated.sessions };

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, groupId: gid, sessions: stored.sessions,
      // Records that could not be given a stable occurrence identity — kept
      // exactly as they are rather than guessed at. Empty in normal operation.
      ...(migrated.carried.length ? { unmigrated: migrated.carried } : {}) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionId = String(req.body?.sessionId || '').trim().slice(0, 80);
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  // The session must be one this GROUP actually has. That is what stops a
  // forged or borrowed id filing attendance against another squad's session,
  // and it is where the date comes from — the stored record, not the caller.
  const groupSessions = (await kvGet(sessionsGroupKey(session.teamId, gid))) || [];
  let target = (Array.isArray(groupSessions) ? groupSessions : [])
    .find(s => String(s?.id || '') === sessionId);
  // A PAST session is not in the current week's list. Rather than refuse it, ask
  // whether the server can already prove it happened — from a register it wrote
  // itself, or from the slot the occurrence is rooted in. Exactly one path
  // follows from here: the same canonicalisation, the same store, the same
  // validation. Nothing forks.
  if (!target) {
    const past = attendanceHistoricalOccurrence(sessionId, slots, stored.sessions,
      new Date().toISOString().slice(0, 10));
    if (!past) return res.status(404).json({ error: 'That training session does not exist in this group' });
    target = { id: sessionId, date: past.date, title: past.title };
  }

  const marksIn = (req.body?.marks && typeof req.body.marks === 'object' && !Array.isArray(req.body.marks))
    ? req.body.marks : null;
  if (!marksIn) return res.status(400).json({ error: 'marks must be an object' });

  const entries = Object.entries(marksIn).slice(0, ATT_MAX_MARKS);
  for (const [k, v] of entries) {
    if (!ATT_PLAYER_KEY_RE.test(k)) return res.status(400).json({ error: 'marks must be keyed by durable player identity' });
    if (v !== null && !ATT_STATUS.includes(String(v))) {
      return res.status(400).json({ error: 'status must be present, absent or null' });
    }
  }

  // The register this write belongs to: the session PLUS the day it happened.
  const occurrenceId = attendanceOccurrenceId(target.id || sessionId, target.date, slots);
  if (!occurrenceId) {
    return res.status(400).json({ error: 'That training session has no date, so its attendance cannot be recorded against a specific occurrence' });
  }

  const existing = stored.sessions[occurrenceId] || { marks: {} };
  const marks = { ...existing.marks };
  // null CLEARS a mark — back to not-recorded, which is a real third state and
  // must never collapse into "absent".
  entries.forEach(([k, v]) => { if (v === null) delete marks[k]; else marks[k] = String(v); });

  stored.sessions[occurrenceId] = {
    date:      String(target.date  || '').slice(0, 10),
    title:     String(target.title || '').slice(0, 120),
    // The recurring session this occurrence came from, kept so a register can
    // still be traced back to its slot without re-deriving it from the key.
    sourceSessionId: String(target.id || sessionId).slice(0, 80),
    marks,
    updatedAt: new Date().toISOString(),
    updatedBy: String(session.user.id).slice(0, 80),
  };
  // Anything the migration could not place keeps its own key untouched.
  migrated.carried.forEach(k => { if (!stored.sessions[k] && raw.sessions[k]) stored.sessions[k] = raw.sessions[k]; });
  await kvSet(attendanceKey(session.teamId, gid), sanitiseAttendanceDoc(stored));
  return res.status(200).json({ ok: true, groupId: gid, sessionId, occurrenceId,
    session: stored.sessions[occurrenceId] });
}

async function seasonSheetsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Reading any fixture's team sheet already requires PUBLISH_SQUADS (see the
  // squad GET). A season of them is the same data, so it is the same gate —
  // deliberately not the broader REPORTS, which managers, medical, S&C and
  // analysts also hold.
  let session;
  try { session = await requireTenantPermission(req, PERM.PUBLISH_SQUADS); }
  catch (error) { return sendAuthError(res, error); }

  const structure = await loadClubStructure(session.teamId);

  // The GROUP is authorised against the caller's own staff scope, so a forged
  // ?group= cannot reach another squad's season. Omitting it is not a way to
  // read everything: without a group the club's fixtures are answered as they
  // already are by the fixtures resource, which every active member may read.
  const requested = String(req.query?.group || '').trim();
  let group = null;
  if (requested) {
    try { group = assertOperationalGroup(session, structure, requested, { as: 'staff' }); }
    catch (error) { return res.status(error.status || 403).json({ ok: false, error: error.message }); }
  }

  const { club, fixtures } = await readClubFixtures(session.teamId);
  const seasonStart = String(club?.seasonStart || '');
  const seasonEnd   = String(club?.seasonEnd   || '');
  const todayIso    = new Date().toISOString().slice(0, 10);

  const inSeason = fx => {
    if (!seasonStart || !seasonEnd) return true;      // no season configured → the whole record
    const d = String(fx?.date || '');
    return !d || (d >= seasonStart && d <= seasonEnd);
  };

  const mine = fixtures
    .filter(fx => !group || fixtureGroupOf(fx) === group.id)
    .filter(fx => fixtureHasBeenPlayed(fx, todayIso))
    .filter(inSeason);

  const sheets = [];
  let withoutSheet = 0;
  for (const fx of mine) {
    const published = await publishedSheetsForFixture(session.teamId, fx.id);
    if (!published.length) { withoutSheet++; continue; }
    for (const sheet of published) {
      sheets.push({
        fixtureId:  String(fx.id),
        sideId:     String(sheet.sideId || ''),
        teamName:   String(sheet.teamName || ''),
        date:       String(fx.date || ''),
        opposition: String(fx.opposition || ''),
        ...seasonSheetProjection(sheet.squad),
      });
    }
  }

  return res.status(200).json({
    ok: true,
    sheets,
    // Honest accounting, so the client never has to guess why a total is small:
    // matches played, and how many of them nobody ever published a sheet for.
    playedFixtures: mine.length,
    fixturesWithoutSheet: withoutSheet,
    season: { start: seasonStart, end: seasonEnd },
    ...(group ? { group: { id: group.id, name: group.name } } : {}),
  });
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
      // Both generations of Match Centre storage are enumerated rather than
      // assumed: fixture-scoped squads and drafts, AND the per-coach drafts on
      // the original key, which the wipe never used to remove.
      // Group-scoped training stores (schedule / published plans / sessions
      // per group) live under publish:<team>:group:* — the wipe enumerates
      // them the same way it does fixture-scoped squads, so no group's
      // training survives a club reset.
      const [scopedKeys, legacyDraftKeys, groupKeys] = await Promise.all([
        kvScanKeys(`${APP_PREFIX}:publish:${session.teamId}:fixture:*`),
        kvScanKeys(key(`publish:${session.teamId}:draft:*`)),
        kvScanKeys(`${APP_PREFIX}:publish:${session.teamId}:group:*`),
      ]);
      await Promise.all([
        kvSet(clubKey(session.teamId), null),
        kvSet(sessionsKey(session.teamId), null),
        kvSet(squadKey(session.teamId), null),
        kvDel(currentSquadPointerKey(session.teamId)),
        kvSet(rosterKey(session.teamId), null),
        ...scopedKeys.map(k => kvDel(k)),
        ...legacyDraftKeys.map(k => kvDel(k)),
        ...groupKeys.map(k => kvDel(k)),
      ]);
      return res.status(200).json({
        ok: true,
        deleted: ['club', 'sessions', 'squad', 'squad:current', 'roster',
          `fixture-scoped:${scopedKeys.length}`, `legacy-drafts:${legacyDraftKeys.length}`,
          `group-scoped:${groupKeys.length}`],
      });
    }

    if (req.body?.action === 'delete_test_data') {
      if (!can(session, PERM.DANGER_ZONE)) return res.status(403).json({ error: 'Not authorized' });
      if (String(req.body?.confirmPhrase || '') !== 'DELETE TEST DATA') {
        return res.status(400).json({ error: 'Type DELETE TEST DATA to confirm' });
      }

      const deleted = { sessions: 0, availability: 0, messages: 0, rosterPlayers: 0 };

      // 1. Published training sessions with TEST in the title — swept from the
      // legacy club list AND from every group's own list.
      const pubSessions = (await readScoped(sessionsKey(session.teamId), 'publish:sessions', session.teamId)) || [];
      const cleanSessions = pubSessions.filter(s => !isTestSession(s));
      if (cleanSessions.length < pubSessions.length) {
        deleted.sessions = pubSessions.length - cleanSessions.length;
        await kvSet(sessionsKey(session.teamId), cleanSessions);
      }
      const groupSessionKeys = await kvScanKeys(`${APP_PREFIX}:publish:${session.teamId}:group:*:sessions`);
      for (const k of groupSessionKeys) {
        const list = await kvGet(k);
        if (!Array.isArray(list)) continue;
        const clean = list.filter(s => !isTestSession(s));
        if (clean.length < list.length) {
          deleted.sessions += list.length - clean.length;
          await kvSet(k, clean);
        }
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

// ── Match-day teams sub-resource ──────────────────────────────────────────
// The MINIMAL team metadata a Match Centre coach needs in order to know which
// side they are selecting for: id, name and group of the ACTIVE teams inside
// the groups this identity may OPERATE as staff — nothing else. Gated on the
// Match Centre capability (PUBLISH_SQUADS), deliberately NOT on
// MANAGE_PLAYERS: knowing which team you are picking is not managing the
// roster, and the full structure read (with member counts and staff lists)
// stays behind its own permission. Scope-aware by construction: a group-
// scoped coach receives only their groups' teams; players and other clubs
// get nothing.
async function matchdayTeamsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  let session;
  try {
    session = await requireTenantPermission(req, PERM.PUBLISH_SQUADS);
  } catch (error) { return sendAuthError(res, error); }
  const structure = await loadClubStructure(session.teamId);
  const groups = operationalGroupsFor(session.teamMember || {}, structure, { as: 'staff' })
    .filter(g => g.status === 'active');
  const groupIds = new Set(groups.map(g => String(g.id)));
  const teams = (structure?.teams || [])
    .filter(t => t.status === 'active' && groupIds.has(String(t.groupId)))
    .map(t => ({ id: t.id, name: t.name, groupId: t.groupId }));
  return res.status(200).json({ ok: true,
    groups: groups.map(g => ({ id: g.id, name: g.name })), teams });
}

// ── Club structure sub-resource (RC4.7 Phase C) ───────────────────────────
// GET  ?resource=structure — hierarchy + member/staff counts (staff only).
// POST ?resource=structure — administration ops, club-wide admins only.
// ── PERFORMANCE (SC8) — programmes and athlete assignments ──────────────────
//
// AUTHORISATION, in one place:
//   · A PLAYER reads their OWN assignments and nothing else. The athlete id is
//     taken from the SESSION, never from the request, so changing an id in a
//     URL cannot reach another athlete.
//   · A COACH reads and writes only inside their own operational scope. The
//     athlete must resolve to a group the caller actually holds — client-side
//     hiding is presentation, this is the boundary.
//   · Both require the club to be entitled to Performance. Core clubs get 402
//     rather than a silent empty list, so the gate is never mistaken for
//     "no data".

const PERFORMANCE_ENTITLED_PLANS = ['pro', 'enterprise'];

/** The club's Performance entitlement, read from the tenant record. */
async function performanceEntitlement(clubId) {
  const teams = await loadTeams();
  const team = (teams || []).find(t => String(t?.id || '') === String(clubId || '')) || null;
  const plan = String(team?.plan || 'trial');
  const planStatus = String(team?.planStatus || 'active');
  const entitled = PERFORMANCE_ENTITLED_PLANS.includes(plan) && planStatus === 'active';
  return { plan, planStatus, entitled };
}

/**
 * Resolve the athlete a coach names, INSIDE the caller's scope.
 * Returns the membership plus its group context, or throws 403/404. A coach
 * scoped to Seniors asking for a U18 athlete gets the same answer as if the
 * athlete did not exist to them: refused.
 */
function resolveScopedAthlete(session, structure, members, athleteUserId) {
  const id = String(athleteUserId || '');
  if (!id) { const e = new Error('Athlete required'); e.status = 400; throw e; }
  const member = members.find(m => String(m.userId || '') === id && m.status === 'active');
  if (!member) { const e = new Error('Unknown athlete for this club'); e.status = 404; throw e; }
  // Capacity, not merely membership. A staff member who does not play is not
  // an athlete, so nothing may be authored or assigned FOR them — a club-wide
  // coach reached the scope check below unconditionally and could otherwise
  // programme for another coach. Same predicate the enumeration uses, so the
  // two can never disagree about who is an athlete.
  if (!isPlayingMember(member)) { const e = new Error('Unknown athlete for this club'); e.status = 404; throw e; }
  const allowed = operationalGroupsFor(session.teamMember, structure, { as: 'staff' });
  const scope = effectiveAccessScope(session.teamMember);
  const athleteGroupId = String(member.playerGroupId || '');
  if (!scope.clubWide) {
    if (!athleteGroupId || !allowed.some(g => g.id === athleteGroupId)) {
      const e = new Error('That athlete is outside your coaching scope'); e.status = 403; throw e;
    }
  }
  const group = (structure.groups || []).find(g => g.id === athleteGroupId) || null;
  return { member, groupId: athleteGroupId, groupName: group?.name || '', group };
}

/** Athlete ids the caller may see at all — the enumeration boundary. */
function scopedAthleteIds(session, structure, members) {
  const scope = effectiveAccessScope(session.teamMember);
  // WHO IS AN ATHLETE is a capacity question, not a role one. isPlayingMember
  // is Core's canonical answer: an explicit playerGroupId OR the player role.
  // Asking canonicalRole === 'player' made a coach who also plays invisible,
  // because a coach is head_coach/assistant/manager whatever else is true.
  const active = members.filter(m => m.status === 'active' && isPlayingMember(m));
  if (scope.clubWide) return new Set(active.map(m => String(m.userId)));
  const allowed = new Set(operationalGroupsFor(session.teamMember, structure, { as: 'staff' }).map(g => g.id));
  return new Set(active.filter(m => allowed.has(String(m.playerGroupId || ''))).map(m => String(m.userId)));
}

async function performanceHandler(req, res) {
  let session;
  try {
    session = await requireTenantSession(req);
  } catch (error) { return sendAuthError(res, error); }

  const clubId = session.teamId;
  const actor = { userId: String(session.user?.id || '') };
  const capacity = canonicalRole(session.teamMember) === 'player' ? 'player' : 'staff';

  const ent = await performanceEntitlement(clubId);
  if (!ent.entitled) {
    return res.status(402).json({ ok: false, error: 'Performance is not enabled for this club', code: 'performance_not_entitled' });
  }

  const [record, members, structure] = await Promise.all([
    loadPerformanceRecord(clubId),
    loadTeamMembers(),
    loadClubStructure(clubId),
  ]);
  const mine = members.filter(m => String(m.teamId) === String(clubId));

  // ── PLAYER ────────────────────────────────────────────────────────────────
  // Own assignments only, projected. No programme library, no other athlete,
  // no coach notes about them.
  if (capacity === 'player') {
    if (req.method === 'POST') {
      // The ONLY write a player may make: their own authoring profile. The
      // athlete id comes from the session, so a forged athleteUserId in the
      // body cannot overwrite anyone else's record.
      if (String(req.body?.op || '') !== 'save_athlete_profile') {
        return res.status(403).json({ ok: false, error: 'Players cannot author or assign programmes' });
      }
      try {
        const saved = await saveAuthoringProfile(clubId, actor.userId, req.body?.profile || {}, actor);
        await auditLog('performance_profile_saved', {
          athleteUserId: actor.userId, changedBy: actor.userId, teamId_club: clubId, ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, profile: saved.profile });
      } catch (error) {
        return res.status(error?.status || 400).json({ ok: false, error: error?.message || 'Could not save profile' });
      }
    }
    if (req.method !== 'GET') {
      return res.status(403).json({ ok: false, error: 'Players cannot author or assign programmes' });
    }
    const own = assignmentsForAthlete(record, actor.userId).map(projectAssignmentForPlayer);
    // Their own profile, so it follows them to a new device.
    return res.status(200).json({
      ok: true, capacity: 'player', assignments: own,
      profile: authoringProfileFor(record, actor.userId),
    });
  }

  // ── COACH / STAFF ─────────────────────────────────────────────────────────
  if (!can(session, PERM.PUBLISH_TRAINING)) {
    return res.status(403).json({ ok: false, error: 'Not authorized to author programmes' });
  }

  if (req.method === 'GET') {
    const visible = scopedAthleteIds(session, structure, mine);

    // ?athleteProfile=<userId> — the authoring projection for ONE athlete.
    // Scope is re-checked here, so a direct id in the query is refused exactly
    // as it would be on a write.
    const wantProfile = String(req.query?.athleteProfile || '').trim();
    if (wantProfile) {
      let scopedAthlete;
      try {
        scopedAthlete = resolveScopedAthlete(session, structure, mine, wantProfile);
      } catch (error) {
        return res.status(error.status || 403).json({ ok: false, error: error.message });
      }
      // MINORS GATE (interim). The restriction signal is pain-derived and the
      // athlete never consented to a coach seeing it; consent is blocked on
      // legal review for minors. Withheld here, on the SERVER, from the only
      // response that carries it — a client cannot restore what was never
      // sent. The squad classification comes from the structure record
      // resolved above, never from a group's name.
      const gated = gateRestrictionSignal(authoringProfileFor(record, wantProfile),
        { developmentCategory: scopedAthlete.group?.developmentCategory || null });
      return res.status(200).json({ ok: true, athleteUserId: wantProfile, profile: gated });
    }

    const roster = await readScoped(rosterKey(clubId), 'roster', clubId);
    const groupName = id => (structure.groups || []).find(g => g.id === id)?.name || '';
    const athletes = mine
      .filter(m => m.status === 'active' && isPlayingMember(m) && visible.has(String(m.userId)))
      .map(m => {
        const p = (roster?.players || []).find(x => String(x.userId || '') === String(m.userId)) || null;
        const gid = String(m.playerGroupId || '');
        const group = (structure.groups || []).find(g => g.id === gid) || null;
        return {
          userId: String(m.userId), memberId: m.id, name: p?.name || 'Player',
          position: p?.position || '', groupId: gid, groupName: groupName(gid),
          // Structured squad classification only — never health information.
          developmentCategory: group?.developmentCategory || 'unknown',
          // Whether a programme CAN be generated — a status, not the content.
          profileComplete: authoringProfileFor(record, String(m.userId))?.profileComplete === true,
        };
      });
    // Assignments are filtered by the SAME visibility set, so a scoped coach
    // cannot read another group's assignment even by listing.
    const assignments = (record.assignments || [])
      .filter(a => visible.has(String(a.athleteUserId)))
      .map(projectAssignmentForCoach);
    const programmes = (record.programmes || [])
      .filter(p => !p.athleteUserId || visible.has(String(p.athleteUserId)))
      .map(p => ({
        programmeId: p.programmeId, title: p.title, goal: p.goal, phase: p.phase,
        athleteUserId: p.athleteUserId, athleteName: p.athleteName, status: p.status,
        source: p.source, publishedVersion: p.publishedVersion, requiresReview: p.requiresReview,
        updatedAt: p.updatedAt, createdBy: p.createdBy,
        assignmentCount: (record.assignments || []).filter(a => a.programmeId === p.programmeId).length,
      }));
    // THE CALLER'S OWN ATHLETE DATA, kept separate from their coaching list.
    //
    // One person can hold two capacities: they coach one group and play in
    // another. `athletes`/`assignments` above are their COACHING subjects. A
    // staff member's own programme is not in there — and must never be read
    // out of there, because that list holds other people. `self` is resolved
    // from the SESSION, so it can only ever be the caller.
    //
    // A staff member who does not play simply has an empty self block: no
    // profile, no assignments. That is the honest answer, not another
    // athlete's data by accident.
    const self = {
      assignments: assignmentsForAthlete(record, actor.userId).map(projectAssignmentForPlayer),
      profile: authoringProfileFor(record, actor.userId),
    };
    return res.status(200).json({ ok: true, capacity: 'staff', entitlement: ent,
                                  athletes, programmes, assignments, self });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const op = String(req.body?.op || '');
  const b = req.body || {};
  try {
    let result;
    let auditDetail = {};

    if (op === 'save_draft' || op === 'publish_programme' || op === 'create_assignment') {
      // Every authoring op names an athlete; resolve them in scope FIRST so an
      // out-of-scope id fails before anything is written.
      if (b.athleteUserId) resolveScopedAthlete(session, structure, mine, b.athleteUserId);
    }

    if (op === 'save_athlete_profile') {
      // An athlete's profile is theirs. A coach may read the projection to
      // author with it; they may never author ANOTHER athlete's data.
      //
      // But a staff member may save their OWN. The coach Performance shell
      // offers them "My Profile", "My Programme" and "Workouts" — the athlete
      // surfaces — so refusing every staff write meant a coach could complete
      // their own profile and have it silently kept on one device while the
      // UI reported it saved. The id comes from the SESSION, exactly as it
      // does for a player, so this cannot reach anyone else's record: naming
      // someone else in the body is still refused below.
      const target = String(req.body?.athleteUserId || '').trim();
      if (target && target !== actor.userId) {
        return res.status(403).json({ ok: false, error: 'Only the athlete can update their Performance profile' });
      }
      try {
        const saved = await saveAuthoringProfile(clubId, actor.userId, req.body?.profile || {}, actor);
        await auditLog('performance_profile_saved', {
          athleteUserId: actor.userId, changedBy: actor.userId, teamId_club: clubId, ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, profile: saved.profile });
      } catch (error) {
        return res.status(error?.status || 400).json({ ok: false, error: error?.message || 'Could not save profile' });
      }
    }

    if (op === 'save_draft') {
      result = await saveProgrammeDraft(clubId, b, actor);
      auditDetail = { programmeId: result.programme.programmeId };
      return await finishPerformance(res, req, session, 'performance_draft_saved', auditDetail, { programme: result.programme });
    }

    if (op === 'publish_programme') {
      const wrapper = programmeById(record, b.programmeId);
      if (wrapper?.athleteUserId) resolveScopedAthlete(session, structure, mine, wrapper.athleteUserId);
      result = await publishProgramme(clubId, b.programmeId, b, actor);
      return await finishPerformance(res, req, session, 'performance_programme_published',
        { programmeId: b.programmeId, versionNumber: b.versionNumber }, { programme: result.programme });
    }

    if (op === 'create_assignment') {
      const scoped = resolveScopedAthlete(session, structure, mine, b.athleteUserId);
      const roster = await readScoped(rosterKey(clubId), 'roster', clubId);
      const player = (roster?.players || []).find(x => String(x.userId || '') === String(b.athleteUserId)) || null;
      result = await createAssignmentRecord(clubId, {
        ...b,
        // Server-owned context: taken from the membership and structure, never
        // from the request body, and frozen onto the assignment.
        athleteMemberId: scoped.member.id,
        athleteName: player?.name || '',
        groupId: scoped.groupId, groupName: scoped.groupName,
        developmentContextSnapshot: b.developmentContextSnapshot || {
          context: scoped.group?.developmentCategory || 'unknown', source: 'group', youthSafeguards: true,
        },
        entitlementSnapshot: { plan: ent.plan, planStatus: ent.planStatus },
      }, actor);
      return await finishPerformance(res, req, session, 'performance_assignment_created', {
        assignmentId: result.assignment.assignmentId, athleteUserId: b.athleteUserId,
        groupId: scoped.groupId, programmeId: b.programmeId, versionNumber: b.versionNumber,
        replaced: result.replaced,
      }, { assignment: result.assignment, replaced: result.replaced });
    }

    if (['pause', 'resume', 'end', 'cancel'].includes(op)) {
      const target = assignmentById(record, b.assignmentId);
      if (!target) return res.status(404).json({ ok: false, error: 'Unknown assignment' });
      resolveScopedAthlete(session, structure, mine, target.athleteUserId);
      result = await updateAssignmentStatus(clubId, b.assignmentId, op, b, actor);
      return await finishPerformance(res, req, session, `performance_assignment_${op}`, {
        assignmentId: b.assignmentId, athleteUserId: target.athleteUserId, groupId: target.groupId,
      }, { assignment: result.assignment });
    }

    if (op === 'review_progression') {
      const target = assignmentById(record, b.assignmentId);
      if (!target) return res.status(404).json({ ok: false, error: 'Unknown assignment' });
      resolveScopedAthlete(session, structure, mine, target.athleteUserId);
      result = await reviewProgression(clubId, b.assignmentId, b, actor);
      return await finishPerformance(res, req, session, 'performance_progression_reviewed', {
        assignmentId: b.assignmentId, outcome: b.outcome, athleteUserId: target.athleteUserId,
      }, { assignment: result.assignment });
    }

    return res.status(400).json({ ok: false, error: 'Unknown performance operation' });
  } catch (error) {
    return res.status(error?.status || 400).json({ ok: false, error: error?.message || 'Performance change failed', code: error?.code });
  }
}

/** One audit shape for every Performance mutation. */
async function finishPerformance(res, req, session, action, detail, payload) {
  await auditLog(action, {
    ...detail, changedBy: session.user?.id, teamId_club: session.teamId, ip: requestIp(req),
  });
  return res.status(200).json({ ok: true, ...payload });
}

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
    const clubWideStaffIds = [];
    const groups = {};
    const teams = {};
    for (const g of structure.groups) groups[g.id] = { members: 0, staff: [], staffUserIds: [] };
    for (const t of structure.teams) teams[t.id] = { members: 0, coaches: [] };

    for (const m of active) {
      const scope = effectiveAccessScope(m);
      const staffish = canonicalRole(m) !== 'player';
      // OPERATIONAL group ids for staff via the canonical resolver — the same
      // rule that gates every server surface (explicit scope, team-implied
      // groups, and the legacy null-scope → initial-group derivation). The
      // Members screen filters its staff list with these ids, so a
      // Seniors-only assistant never appears as U18/Women's staff.
      if (staffish) {
        if (scope.clubWide) clubWideStaffIds.push(String(m.userId));
        else for (const g of operationalGroupsFor(m, structure, { as: 'staff' })) {
          if (groups[g.id]) groups[g.id].staffUserIds.push(String(m.userId));
        }
      }
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
        // Counts derive from the GROUP rule (resolveEligibility), not the
        // legacy stored/team_initial default that left one Seniors team at 0
        // eligible while its sibling held the whole squad.
        for (const teamId of resolveEligibility(m, structure).teamIds) {
          if (teams[teamId]) teams[teamId].members += 1;
        }
      }
    }
    return res.status(200).json({ ok: true, structure, counts: { groups, teams }, clubWideStaff, clubWideStaffIds });
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
      // Development category drives age-appropriate programming, so it is a
      // club-administration change like any other: same club-wide MANAGE_TEAMS
      // gate above, same club_structure_changed audit entry below.
      else if (op === 'set_group_development_category') result = await setGroupDevelopmentCategory(session.teamId, b.groupId, b.developmentCategory);
      else return res.status(400).json({ ok: false, error: 'Unknown structure operation' });

      await auditLog('club_structure_changed', {
        op, groupId: b.groupId || result.group?.id || null, teamId: b.teamId || result.team?.id || null,
        developmentCategory: op === 'set_group_development_category' ? b.developmentCategory : undefined,
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
  if (String(req.query?.resource || '') === 'matchday-teams') return matchdayTeamsHandler(req, res);
  if (String(req.query?.resource || '') === 'roster') return rosterHandler(req, res);
  if (String(req.query?.resource || '') === 'medical') return medicalHandler(req, res);
  if (String(req.query?.resource || '') === 'performance') return performanceHandler(req, res);
  if (String(req.query?.resource || '') === 'club')   return clubHandler(req, res);
  if (String(req.query?.resource || '') === 'availability-check') return availabilityCheckHandler(req, res);
  if (String(req.query?.resource || '') === 'appearance-adjustments') return appearanceAdjustmentsHandler(req, res);
  if (String(req.query?.resource || '') === 'season-sheets') return seasonSheetsHandler(req, res);
  if (String(req.query?.resource || '') === 'attendance') return attendanceHandler(req, res);
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
      // ?fixture= asks for that fixture's draft. Legacy compatibility is
      // deliberately narrow: the old unscoped record is offered only when it
      // NAMES this fixture. An anonymous legacy draft is never adopted.
      let requestedFixture = '', requestedSide = '';
      try {
        requestedFixture = await assertFixtureBelongsToClub(session.teamId, req.query?.fixture);
        requestedSide    = await assertSideBelongsToClub(session.teamId, req.query?.side);
        await assertFixtureSideCoherence(session.teamId, requestedFixture, requestedSide);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      let draft = null;
      if (requestedFixture && requestedSide) {
        // One side's draft and nothing else: no fallback to the sibling side,
        // and no sideless record adopted — a legacy draft belongs to no side.
        draft = (await kvGet(fixtureSideDraftKey(session.teamId, requestedFixture, requestedSide, session.user.id))) || null;
      } else if (requestedFixture) {
        draft = (await kvGet(fixtureDraftKey(session.teamId, requestedFixture, session.user.id))) || null;
        if (!draft) {
          const legacy = (await kvGet(draftKey(session.teamId, session.user.id))) || null;
          if (legacy && String(legacy.fixtureId || '') === requestedFixture) draft = legacy;
        }
      } else {
        // No fixture named — the client that predates fixture-scoped storage
        // asks this way. Resume the coach's OWN most recently edited draft,
        // legacy or scoped. The scan is pinned to this user's key suffix, so it
        // can never surface another coach's private working squad. This is
        // "carry on where I left off", not an inference about which fixture is
        // next: nothing here is player-facing.
        const own = await kvScanKeys(
          `${APP_PREFIX}:publish:${session.teamId}:fixture:*:draft:${encodeURIComponent(session.user.id)}`);
        const candidates = [(await kvGet(draftKey(session.teamId, session.user.id))) || null];
        for (const k of own) candidates.push((await kvGet(k)) || null);
        draft = candidates.filter(Boolean)
          .sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')))[0] || null;
      }
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
      // Both keyspaces: the legacy unscoped draft and every fixture-scoped one.
      // Without the second pattern this list would have quietly emptied the
      // moment drafts became fixture-scoped.
      const [legacyKeys, scopedKeys, members, users] = await Promise.all([
        kvScanKeys(key(`publish:${teamId}:draft:*`)),
        kvScanKeys(key(`publish:${teamId}:fixture:*:draft:*`)),
        loadTeamMembers(),
        loadUsers(),
      ]);
      const keys = [...new Set([...legacyKeys, ...scopedKeys])];
      const userById = new Map(users.map(u => [String(u.id), u]));
      const memberByUser = new Map(
        members.filter(m => String(m.teamId) === String(teamId)).map(m => [String(m.userId), m])
      );
      const drafts = [];
      for (const k of keys) {
        const rec = await kvGet(k);
        if (!rec || typeof rec !== 'object') continue;
        let userId = String(rec.userId || '');
        if (!userId) {
          const tail = k.split(':draft:')[1] || '';
          try { userId = decodeURIComponent(tail); } catch { userId = tail; }
        }
        const member = memberByUser.get(userId);
        if (!member || !['coach', 'admin', 'medical'].includes(member.role)) continue; // current staff only
        const user = userById.get(userId);
        drafts.push({
          userId,
          coachName: String(user?.displayName || user?.email || 'Coach'),
          role: member.role,
          // A coach can hold one draft per fixture per SIDE — each row says
          // exactly which, so panels can filter without mixing records.
          fixtureId: String(rec.fixtureId || ''),
          sideId: String(rec.sideId || ''),
          updatedAt: rec.updatedAt || null,
          squad: sanitiseSquad(rec),
        });
      }
      // SCAN order is arbitrary, and a coach can now hold several drafts, so the
      // rows are ordered explicitly: most recently edited first, then by coach.
      // Pass B filters this panel to the selected fixture; until then the order
      // is at least stable rather than varying between identical requests.
      drafts.sort((a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
        || String(a.userId).localeCompare(String(b.userId)));
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
      // Session definitions are a GROUP list — resolved exactly like the
      // schedule view: players by playing group, staff by asserted/first group.
      let gid;
      try { gid = await trainingViewGroup(session, req.query?.group); }
      catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
      result.sessions = await readGroupSessions(session.teamId, gid);
      result.trainingGroupId = gid;
    }
    if (type === 'all' || type === 'squad') {
      // Asking for ONE named fixture is a Match Centre capability, so it is
      // gated on publishing rights. A player supplying ?fixture= is answered
      // with the player-facing squad, never with the fixture they named — they
      // cannot browse or enumerate sides that are not on show.
      const mayReadAnyFixture = can(session, PERM.PUBLISH_SQUADS);
      let asked = '', askedSide = '';
      if (mayReadAnyFixture) {
        try {
          asked = await assertFixtureBelongsToClub(session.teamId, req.query?.fixture);
          askedSide = await assertSideBelongsToClub(session.teamId, req.query?.side);
          await assertFixtureSideCoherence(session.teamId, asked, askedSide);
        } catch (error) {
          return res.status(error.status || 400).json({ error: error.message });
        }
      }
      const legacySquadFor = async fixtureId => {
        // The pre-Pass-A squad lives on the club-wide key and already carries a
        // fixtureId. It answers for that ONE fixture and no other.
        const legacy = (await readScoped(squadKey(session.teamId), 'publish:squad', session.teamId)) || null;
        return legacy && String(legacy.fixtureId || '') === fixtureId ? legacy : null;
      };
      if (asked && askedSide) {
        // A coach asks for ONE side's sheet and gets exactly that — no
        // fallback to the sibling side, no fallback to the sideless record: a
        // legacy squad is never heuristically attributed to a side.
        result.squad = (await kvGet(fixtureSideSquadKey(session.teamId, asked, askedSide))) || null;
      } else if (asked) {
        result.squad = (await kvGet(fixtureSquadKey(session.teamId, asked))) || await legacySquadFor(asked);
      } else {
        // PLAYER-FACING READ. Exactly one mode is active at a time; within
        // 'fixture' mode each SIDE publishes and withdraws independently, so
        // the answer is a LIST of sheets. `squad` is kept for older cached
        // clients: it carries the sheet only when exactly ONE exists — with
        // two sheets on show a single `squad` could only masquerade as one of
        // them, so it is null and `publishedSheets` is the whole truth.
        const pointer = await readSquadPointer(session.teamId);
        let sheets = [];
        if (!pointer) {
          // Nothing has been published or withdrawn under Pass A: the club-wide
          // record still answers, exactly as it did before.
          const legacy = (await readScoped(squadKey(session.teamId), 'publish:squad', session.teamId)) || null;
          if (legacy) sheets = [{ fixtureId: String(legacy.fixtureId || ''), sideId: '', teamName: '', squad: legacy }];
        } else if (pointer.mode === 'none') {
          sheets = [];                               // withdrawn, and stays withdrawn
        } else if (pointer.mode === 'legacy') {
          const legacy = (await readScoped(squadKey(session.teamId), 'publish:squad', session.teamId)) || null;
          if (legacy) sheets = [{ fixtureId: String(legacy.fixtureId || ''), sideId: '', teamName: '', squad: legacy }];
        } else {
          // A pointer naming a fixture the club no longer has is stale. Players
          // see nothing — it is never repaired by choosing a different fixture,
          // and it does not fall through to the legacy record either.
          let live = '';
          try { live = await assertFixtureBelongsToClub(session.teamId, pointer.fixtureId); } catch { live = ''; }
          sheets = live ? await publishedSheetsForFixture(session.teamId, live) : [];
        }
        result.publishedSheets = sheets;
        result.squad = sheets.length === 1 ? sheets[0].squad : null;
      }
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
        draft.sideId    = await assertSideBelongsToClub(session.teamId, draft.sideId);
        await assertFixtureSideCoherence(session.teamId, draft.fixtureId, draft.sideId);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      if (draft.sideId && !draft.fixtureId) {
        return res.status(400).json({ error: 'A team sheet needs its fixture' });
      }
      draft.userId = session.user.id;
      draft.updatedAt = new Date().toISOString();
      // A draft lands in the narrowest keyspace it names: fixture+side, then
      // fixture, then the legacy unscoped key — so preparing the Premier XV
      // cannot overwrite Premier Development's, and neither touches Mons'
      // sheet for another fixture. An unlinked draft belongs to no fixture and
      // no side and must never be adopted by one.
      const draftDest = draft.fixtureId && draft.sideId
        ? fixtureSideDraftKey(session.teamId, draft.fixtureId, draft.sideId, session.user.id)
        : draft.fixtureId
          ? fixtureDraftKey(session.teamId, draft.fixtureId, session.user.id)
          : draftKey(session.teamId, session.user.id);
      await kvSet(draftDest, draft);
      return res.status(200).json({ ok: true, draft });
    }

    if (type === 'sessions') {
      const sessions = sanitiseSessions(data);
      let gid;
      try { gid = await staffTrainingGroup(session, req.body?.group ?? req.query?.group); }
      catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
      await kvSet(sessionsGroupKey(session.teamId, gid), sessions);
      // Note each session in the ledger the first time it is seen, so it can
      // still be found after this list is replaced next week. Read-only when
      // nothing is new, which is the common case.
      try {
        const slots = ((await readTrainingSchedule(session.teamId, gid)).record || {}).slots || [];
        const doc = sanitiseAttendanceDoc(await kvGet(attendanceKey(session.teamId, gid)));
        const additions = attendanceLedgerAdditions(sessions, doc.sessions, slots);
        if (Object.keys(additions).length) {
          await kvSet(attendanceKey(session.teamId, gid),
            sanitiseAttendanceDoc({ sessions: { ...doc.sessions, ...additions } }));
        }
      } catch (e) {
        // The schedule write has already succeeded and is what the coach asked
        // for; failing to note the session must not fail their save.
        console.error('[attendance ledger]', e && e.message);
      }
      return res.status(200).json({ ok: true, sessions, groupId: gid });
    }

    if (type === 'squad') {
      const squad = sanitiseSquad(data);
      if (!squad) return res.status(400).json({ error: 'data must be an object' });
      try {
        squad.fixtureId = await assertFixtureBelongsToClub(session.teamId, squad.fixtureId);
        squad.sideId    = await assertSideBelongsToClub(session.teamId, squad.sideId);
        await assertFixtureSideCoherence(session.teamId, squad.fixtureId, squad.sideId);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      // A side sheet only exists in the context of a fixture — a sided squad
      // with no fixture has nowhere unambiguous to live.
      if (squad.sideId && !squad.fixtureId) {
        return res.status(400).json({ error: 'A team sheet needs its fixture' });
      }
      if (!squad.published) {
        // Withdrawing removes exactly what was named: one side's sheet, one
        // sideless fixture record, or the legacy global squad. Players move to
        // nothing only when nothing published remains on show.
        if (squad.fixtureId && squad.sideId) {
          await retireSideSquad(session.teamId, squad.fixtureId, squad.sideId, session.user.id);
        } else if (squad.fixtureId) {
          await retireFixtureSquad(session.teamId, squad.fixtureId, session.user.id);
        } else {
          await retireLegacySquad(session.teamId, session.user.id);
        }
        return res.status(200).json({ ok: true, squad: null });
      }
      squad.publishedAt = squad.publishedAt || new Date().toISOString();
      if (squad.fixtureId && squad.sideId) {
        // One key per fixture+side: publishing Premier can never overwrite
        // Premier Development. The pointer names the FIXTURE context only —
        // which sheets are on show is answered per side by the records.
        await kvSet(fixtureSideSquadKey(session.teamId, squad.fixtureId, squad.sideId), squad);
        await writeSquadPointer(session.teamId, 'fixture', squad.fixtureId, session.user.id);
      } else if (squad.fixtureId) {
        await kvSet(fixtureSquadKey(session.teamId, squad.fixtureId), squad);
        // The publish IS the decision about what players see. No dates, no
        // "newest wins" — publishing Amstelveense leaves Mons stored and
        // retrievable, it just stops being the one on show.
        await writeSquadPointer(session.teamId, 'fixture', squad.fixtureId, session.user.id);
      } else {
        // An unlinked publish is still a publish. It keeps the legacy key and
        // is given NO fixture identity, but it must take over the player-facing
        // slot — otherwise a pointer left by an earlier fixture would keep
        // showing last week's side while this call answered 200.
        await kvSet(squadKey(session.teamId), squad);
        await writeSquadPointer(session.teamId, 'legacy', '', session.user.id);
      }
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
      let asked = '', askedSide = '';
      try {
        asked = await assertFixtureBelongsToClub(session.teamId, req.body?.fixtureId || req.query?.fixture);
        askedSide = await assertSideBelongsToClub(session.teamId, req.body?.sideId || req.query?.side);
        await assertFixtureSideCoherence(session.teamId, asked, askedSide);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      if (asked && askedSide) {
        await retireSideSquad(session.teamId, asked, askedSide, session.user.id);
      } else if (asked) {
        await retireFixtureSquad(session.teamId, asked, session.user.id);
      } else {
        await retireLegacySquad(session.teamId, session.user.id);
      }
      return res.status(200).json({ ok: true });
    }
    if (type === 'sessions') {
      let gid;
      try { gid = await staffTrainingGroup(session, req.body?.group ?? req.query?.group); }
      catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
      // An explicit empty list, not null — so the INITIAL group's clear does
      // NOT fall back to (and appear to resurrect) the legacy sessions.
      await kvSet(sessionsGroupKey(session.teamId, gid), []);
      return res.status(200).json({ ok: true, groupId: gid });
    }
    return res.status(400).json({ error: 'type must be sessions or squad' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
