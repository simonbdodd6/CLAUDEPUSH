// ─── SCOPED CLUB EXPORT (CE-EXPORT-001) ──────────────────────────────────────
//
// Builds the `coacheasier.club-export.v1` document AI CEO consumes. Pure: no
// I/O, no clock, no randomness — the caller loads and the caller writes, the
// same contract _rosterProjection.js follows. That makes the whole mapping
// testable without a store and makes the output deterministic by construction.
//
// WHY AN EXPORT AND NOT A READER
//
// The store is reached with one REST credential holding read/write across
// every club, and this product's authorisation is session-based. Handing that
// credential to another system would give it the power to destroy any club's
// data and would skip every check in _accessScope. So the club's own server
// produces a narrow document, through its own gates, and hands over only that.
//
// WHAT MAY CROSS
//
// The consumer's allow-list, mirrored here so a leak is impossible at source
// rather than filtered at the far end. Anything not named is never read into
// the document: no email, phone, date of birth, medical note, credential or
// session. A player is id, name, position and status, and nothing else.
//
// GROUP-LEVEL DATA
//
// Training, availability and attendance are group-scoped in this product,
// while the export speaks in teams. A group's session is therefore attributed
// to every active team in that group — those players really do train in it —
// and keeps its own session id, so the availability and attendance rows that
// reference it still resolve. Each team's reader counts only its own squad,
// so no figure is double-counted.

export const EXPORT_CONTRACT = 'coacheasier.club-export.v1';

// The consumer's vocabulary. A value outside these is dropped rather than
// guessed at: an unknown answer is not evidence of anything.
const RESPONSES = new Set(['available', 'unavailable', 'injured', 'maybe', 'pending']);
const MARKS = new Set(['present', 'absent']);

// Legacy answers this product still holds, mapped to the shared vocabulary.
const RESPONSE_ALIASES = new Map([['yes', 'available'], ['no', 'unavailable']]);

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const byId = (a, b) => String(a.id).localeCompare(String(b.id));

function normaliseResponse(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  const mapped = RESPONSE_ALIASES.get(value) ?? value;
  return RESPONSES.has(mapped) ? mapped : null;
}

/** `id:u1` → `u1`. Attendance registers key players this way. */
function attendancePlayerId(key) {
  const raw = String(key ?? '');
  return raw.startsWith('id:') ? raw.slice(3) : raw;
}

/**
 * Build the export.
 *
 * Everything passed in has ALREADY been authorised by the caller: `groups` and
 * `teams` are only those the session may view. This function never widens that
 * — it cannot, because it is given nothing else to widen to.
 *
 *   club        { clubId, name }
 *   groups      [{ id, name, status }]        already scope-filtered
 *   teams       [{ id, groupId, name, ageGrade, status }]  already scope-filtered
 *   players     [{ id, teamId, name, position, status }]
 *   fixtures    sanitiseFixtureRecord shape, already club-owned
 *   trainingByGroup  { groupId: [slot] }
 *   availabilityByGroup { groupId: { sessionId: { key: { playerId|userId, response, respondedAt } } } }
 *   attendanceByGroup   { groupId: { occurrenceId: { date, marks: { 'id:u1': 'present' } } } }
 *   exportedAt  ISO string supplied by the caller (the contract's observedAt)
 */
export function buildClubExport({
  club = {},
  groups = [],
  teams = [],
  players = [],
  fixtures = [],
  trainingByGroup = {},
  availabilityByGroup = {},
  attendanceByGroup = {},
  exportedAt = null,
} = {}) {
  const clubId = str(club.clubId, 80);
  if (!clubId) throw new Error('buildClubExport requires a clubId');

  const outGroups = groups
    .map(g => ({ id: str(g.id, 40), name: str(g.name, 120), status: str(g.status, 20) || 'active' }))
    .sort(byId);

  const groupIds = new Set(outGroups.map(g => g.id));
  const outTeams = teams
    .filter(t => groupIds.has(str(t.groupId, 40)))
    .map(t => ({
      id: str(t.id, 40),
      groupId: str(t.groupId, 40),
      name: str(t.name, 120),
      ageGrade: str(t.ageGrade, 20),
      status: str(t.status, 20) || 'active',
    }))
    .sort(byId);

  const teamIds = new Set(outTeams.map(t => t.id));
  const teamsInGroup = groupId => outTeams.filter(t => t.groupId === groupId && t.status !== 'archived');

  // Players: identity needed to run a squad. Nothing is read from the member
  // record beyond these four fields, so nothing else can escape.
  const outPlayers = players
    .filter(p => teamIds.has(str(p.teamId, 40)))
    .map(p => ({
      id: str(p.id, 80),
      teamId: str(p.teamId, 40),
      name: str(p.name, 120),
      position: str(p.position, 40),
      status: str(p.status, 20) || 'active',
    }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId) || byId(a, b));

  const sessions = [];

  // Fixtures → match sessions. A fixture names its side directly when the club
  // runs several teams in a group; otherwise it belongs to the group's teams.
  for (const fx of fixtures) {
    const id = str(fx.id, 40);
    const date = str(fx.date, 20);
    if (!id || !date) continue;                      // undated fixtures are not facts
    const sideId = str(fx.sideId, 40);
    const targets = sideId && teamIds.has(sideId)
      ? outTeams.filter(t => t.id === sideId)
      : teamsInGroup(str(fx.groupId, 40));
    for (const team of targets) {
      sessions.push({
        id, teamId: team.id, kind: 'match', date,
        opponent: str(fx.opposition, 80),
        venue: str(fx.venue, 120),
      });
    }
  }

  // Training slots → training sessions, attributed to every team in the group.
  for (const [groupId, slots] of Object.entries(trainingByGroup)) {
    for (const slot of Array.isArray(slots) ? slots : []) {
      const id = str(slot.id, 40);
      // A slot describes a recurring night; only an occurrence with a real date
      // is a session that happened. The attendance register carries that date.
      const date = str(slot.date, 20);
      if (!id || !date) continue;
      for (const team of teamsInGroup(groupId)) {
        sessions.push({ id, teamId: team.id, kind: 'training', date });
      }
    }
  }

  // Attendance registers are the record of training that actually took place,
  // and each one stores its own date. They are the authoritative session list
  // for training, so any occurrence with a register becomes a session.
  const attendance = [];
  const squadIds = new Set(outPlayers.map(p => p.id));
  for (const [groupId, registers] of Object.entries(attendanceByGroup)) {
    for (const [occurrenceId, register] of Object.entries(registers || {})) {
      const id = str(occurrenceId, 60);
      const date = str(register?.date, 20);
      if (!id || !date) continue;
      for (const team of teamsInGroup(groupId)) {
        if (!sessions.some(s => s.id === id && s.teamId === team.id)) {
          sessions.push({ id, teamId: team.id, kind: 'training', date });
        }
      }
      for (const [playerKey, mark] of Object.entries(register?.marks || {})) {
        const playerId = attendancePlayerId(playerKey);
        if (!MARKS.has(String(mark)) || !squadIds.has(playerId)) continue;
        attendance.push({ sessionId: id, playerId, mark: String(mark) });
      }
    }
  }

  // Availability answers, one row per player per session.
  const availability = [];
  const sessionIds = new Set(sessions.map(s => s.id));
  for (const records of Object.values(availabilityByGroup)) {
    for (const [sessionId, store] of Object.entries(records || {})) {
      const id = str(sessionId, 60);
      if (!sessionIds.has(id)) continue;             // an answer to nothing is not a fact
      for (const entry of Object.values(store || {})) {
        const playerId = str(entry?.playerId || entry?.userId, 80);
        const response = normaliseResponse(entry?.response);
        if (!response || !squadIds.has(playerId)) continue;
        availability.push({
          sessionId: id,
          playerId,
          response,
          respondedAt: str(entry?.respondedAt, 40) || null,
        });
      }
    }
  }

  const sortSession = (a, b) =>
    String(a.date).localeCompare(String(b.date)) || a.teamId.localeCompare(b.teamId) || byId(a, b);
  const sortPair = (a, b) =>
    String(a.sessionId).localeCompare(String(b.sessionId)) || String(a.playerId).localeCompare(String(b.playerId));

  return {
    contract: EXPORT_CONTRACT,
    club: { clubId, name: str(club.name, 120), exportedAt: str(exportedAt, 40) || null },
    groups: outGroups,
    teams: outTeams,
    players: outPlayers,
    sessions: sessions.sort(sortSession),
    availability: availability.sort(sortPair),
    attendance: attendance.sort(sortPair),
  };
}
