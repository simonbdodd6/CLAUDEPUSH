// ─── ROSTER PROJECTION RECONCILIATION ───────────────────────────────────────
//
// Canonical truth about WHO IS ON THE CLUB lives in identity: users, team
// memberships (status + playerGroupId) and player profiles. The roster record
// (`app:roster:<teamId>`) is a PROJECTION of that truth plus coach-maintained
// detail (positions, contacts, notes) — and every roster-backed screen
// (Members, Availability, Match Centre, Medical's player projection) renders
// roster rows. Historically the projection was maintained ONLY by coach
// devices: a browser fetched /api/identity, linked profiles to local rows,
// and pushed the whole list back. Two integrity holes followed:
//
//   1. NEW-JOINER LAG — invite acceptance creates user + membership +
//      profile server-side but no roster row, so a valid active player was
//      invisible on roster-backed screens until some unrelated coach device
//      happened to sync and save (proven with Baptiste Germain, and again in
//      the 2026-09-07 production audit with Isabelle Verbist).
//   2. STALE FULL REPLACE — a device holding an old snapshot saves, and the
//      newer row it never knew about is deleted by omission.
//
// The functions here close both holes at server boundaries. They are pure
// (no I/O), deterministic and idempotent; callers do the loading and saving.
//
// THE INVARIANT
//   Every ACTIVE membership that PLAYS and resolves to a live group has a
//   roster row.  Corollaries, equally load-bearing:
//   - INTENT vs OMISSION: removing a player is a MEMBERSHIP action
//     (archive / remove / permanent delete). A payload that merely omits an
//     active player's row is a stale echo and never deletes it. A row whose
//     membership is archived/removed is NOT protected and NEVER re-created —
//     archiving stays effective and nothing is resurrected.
//   - UNASSIGNED members (multi-group club, no resolvable group) get no
//     fabricated row — the model refuses to guess a group elsewhere, and a
//     row here would silently imply one. They surface the moment an admin
//     assigns a group (setPlayerGroup ensures the projection).
//   - UNLINKED rows (trialist / CSV, no account) are untouched: not
//     protected, not created, not deleted — exactly the behaviour they had.
//
// PRIVACY — a created row carries only what the established client linker
// already projects from the profile the player themselves supplied (name,
// position, email, phone, ids). Date of birth, guardian, emergency and
// medical detail exist only where a coach typed them into the roster; this
// module never fabricates or copies them.

import { isPlayingMember, resolvePlayerGroup } from './_accessScope.js';

export const ROSTER_MAX_PLAYERS = 200;

const s = v => String(v ?? '').trim();
const emailKeyOf = v => s(v).toLowerCase();
const nameKeyOf = v => s(v).toLowerCase().replace(/\s+/g, ' ');

/** The member's player profile, by the same two bridges the store uses. */
export function profileForMember(profiles, member) {
  const list = Array.isArray(profiles) ? profiles : [];
  return list.find(p => s(p.teamMemberId) === s(member.id)) ||
    list.find(p => s(p.teamId) === s(member.teamId) && s(p.userId) === s(member.userId)) ||
    null;
}

/**
 * Does this roster row belong to this member?
 *
 * The bridges mirror the client linker (userId, row id, invite legacyPlayerId,
 * email, normalised name) with its one hard guard made harder: a row already
 * claimed by a DIFFERENT account (any non-empty, non-matching userId) is never
 * this member's row, whatever the softer bridges say — two John Smiths must
 * never be conflated into one record.
 */
export function rowMatchesMember(row, member, profile = null) {
  if (!row || !member) return false;
  const uid = s(member.userId);
  const rowUid = s(row.userId);
  if (rowUid && rowUid !== uid) return false;
  if (rowUid === uid && uid) return true;
  if (s(row.id) === uid && uid) return true;
  const lid = s(profile?.legacyPlayerId);
  if (lid && (s(row.legacyPlayerId) === lid || s(row.id) === lid)) return true;
  const email = emailKeyOf(profile?.email);
  if (email && emailKeyOf(row.email) === email) return true;
  const name = nameKeyOf(profile?.displayName);
  if (name && nameKeyOf(row.name) === name) return true;
  return false;
}

/** Active memberships of THIS club that represent someone who plays. */
export function activePlayingMembers(members, teamId) {
  return (Array.isArray(members) ? members : []).filter(m =>
    m && s(m.teamId) === s(teamId) && m.status === 'active' && isPlayingMember(m));
}

/**
 * The minimal roster projection of a canonical membership — the exact shape
 * the client linker has always created, so one person has one row shape
 * regardless of which side minted it. Every value comes from the identity the
 * player registered themselves (or canonical defaults); nothing sensitive is
 * invented or copied from anywhere else.
 */
export function rosterProjectionRow(member, user = null, profile = null) {
  const name = s(profile?.displayName) || s(user?.displayName) ||
    [s(user?.firstName), s(user?.lastName)].filter(Boolean).join(' ') || s(member.userId);
  const bits = name.split(/\s+/).filter(Boolean);
  return {
    id: s(member.userId),
    userId: s(member.userId),
    legacyPlayerId: s(profile?.legacyPlayerId) || s(member.userId),
    name,
    firstName: bits[0] || '',
    lastName: bits.slice(1).join(' '),
    position: s(profile?.position) || 'TBC',
    email: s(profile?.email) || s(user?.email) || '',
    phone: s(profile?.phone) || '',
    status: 'no-reply',
    game: 'no-reply',
    trainingTuesday: 'no-reply',
    trainingThursday: 'no-reply',
    attendance: 0,
    history: [],
    blockedDates: [],
    medical: '',
    // No media-consent field: that is a DEVICE-LOCAL coach note by pinned
    // contract (media-consent-honesty) — the server never names it, and an
    // absent field already renders as "Not recorded".
    contractStatus: 'active',
    registrationStatus: 'registered',
    joinedDate: s(profile?.createdAt).slice(0, 10) || new Date().toISOString().slice(0, 10),
  };
}

/**
 * STALE-OMISSION PROTECTION — the write-boundary half of the invariant.
 *
 * `nextRows` is what the save would store (after scope merging). Any STORED
 * row it omits whose membership is an active playing member is re-kept
 * verbatim: the omission is a stale device echo, because deleting that person
 * is a membership action which would have de-activated the membership first.
 *
 * A person REPRESENTED in nextRows under a different row id (the client
 * re-keys rows to permanent ids) is an edit, not an omission — their old row
 * is not re-added, so no duplicate appears. Rows of archived/removed members
 * and unlinked rows are not protected: today's replace semantics keep
 * working for them. Protection is never sacrificed to the size cap.
 */
export function protectCanonicalRows({ storedRows, nextRows, members, profiles, teamId }) {
  const stored = Array.isArray(storedRows) ? storedRows : [];
  const next = Array.isArray(nextRows) ? nextRows : [];
  const playing = activePlayingMembers(members, teamId);
  const nextIds = new Set(next.map(r => s(r.id)));
  const kept = [];
  for (const row of stored) {
    if (nextIds.has(s(row.id))) continue;
    const member = playing.find(m => rowMatchesMember(row, m, profileForMember(profiles, m)));
    if (!member) continue;
    const prof = profileForMember(profiles, member);
    if (next.some(r => rowMatchesMember(r, member, prof))) continue;
    kept.push(row);
  }
  return { rows: kept.length ? [...next, ...kept] : next, kept };
}

/**
 * MISSING-PROJECTION RECONCILIATION — the creation half of the invariant.
 *
 * For every active playing member of the club whose group RESOLVES against
 * the live structure (explicit, or the one-group legacy derivation): if no
 * row matches them, append the minimal projection; if a row matches through
 * a soft bridge but has no userId yet (a CSV/trialist row the person grew
 * into), stamp the userId so the link is durable — and change NOTHING else
 * on it. Unresolvable (needs-assignment) members get no row. Idempotent:
 * a second run finds every member matched by userId and changes nothing.
 */
export function reconcileMissingRows({ rows, members, users, profiles, structure, teamId,
                                       maxPlayers = ROSTER_MAX_PLAYERS }) {
  const current = (Array.isArray(rows) ? rows : []).slice();
  const userById = new Map((Array.isArray(users) ? users : []).map(u => [s(u.id), u]));
  let changed = false;
  const created = [];
  for (const member of activePlayingMembers(members, teamId)) {
    if (!resolvePlayerGroup(member, structure).groupId) continue;
    const prof = profileForMember(profiles, member);
    const match = current.find(r => rowMatchesMember(r, member, prof));
    if (match) {
      if (!s(match.userId) && s(member.userId)) {
        match.userId = s(member.userId);
        changed = true;
      }
      continue;
    }
    if (current.length >= maxPlayers) continue;
    const row = rosterProjectionRow(member, userById.get(s(member.userId)) || null, prof);
    current.push(row);
    created.push(row);
    changed = true;
  }
  return { rows: current, changed, created };
}
