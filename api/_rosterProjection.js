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
import { canonicalRole } from './_permissions.js';

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

/**
 * WHO IS A PLAYER ON THE ROSTER — the one server rule (duplicate-player
 * investigation, 2026-10-07).
 *
 * An ACTIVE membership of the club whose club role is player, OR a staff
 * membership that ALSO plays — the explicit dual role, which always carries a
 * player profile: an admin's "Plays for" (set_player_group) creates one, and a
 * player who became staff keeps theirs (RC4.7 C.1).
 *
 * A staff membership holding a playerGroupId but NO player profile is not a
 * player. That shape had exactly one source: a manager or coach opening the
 * squad's PLAYER join link kept their staff role (never asked a position, no
 * profile) yet had the link's group stamped on — and the projection then
 * minted them a "TBC" row, so staff appeared in Available Players.
 */
export function isPlayerCapableMember(member, profiles = []) {
  if (!member || member.status !== 'active' || !isPlayingMember(member)) return false;
  if (canonicalRole(member) === 'player') return true;
  return Boolean(profileForMember(profiles, member));
}

/** Active memberships of THIS club that represent someone who plays. */
export function activePlayingMembers(members, teamId, profiles = []) {
  return (Array.isArray(members) ? members : []).filter(m =>
    m && s(m.teamId) === s(teamId) && isPlayerCapableMember(m, profiles));
}

/**
 * WHAT THE ROSTER READ RETURNS AS PLAYERS.
 *
 * The roster record is a projection plus coach-kept detail, and it can hold
 * rows that are not this club's players: a staff member's row (above), or a
 * row tied to an account with no membership in this club at all (another
 * club's person — the residue of the cross-club overwrite Build 132 found).
 * Those rows are WITHHELD from the read, never deleted: the write path keeps
 * them verbatim (keepWithheldRows), so nothing a coach typed is lost and a
 * later repair can still see them.
 *
 * Everything else travels exactly as before: rows of club players, unlinked
 * rows (trialist / CSV, no account), legacy compatibility ids that are not
 * accounts, and rows of removed / archived / pending members (Members keeps
 * its history views; the player surfaces already require an ACTIVE
 * membership in the operating group).
 */
export function rosterRowStanding(row, { members, users, profiles, teamId }) {
  const uid = s(row?.userId);
  if (!uid) return 'unlinked';
  const isAccount = (Array.isArray(users) ? users : []).some(u => s(u.id) === uid);
  const mine = (Array.isArray(members) ? members : []).filter(m => s(m.teamId) === s(teamId) && s(m.userId) === uid);
  if (!mine.length) return isAccount ? 'other_club' : 'unlinked';
  const active = mine.find(m => m.status === 'active');
  if (!active) return 'inactive';
  return isPlayerCapableMember(active, profiles) ? 'player' : 'staff';
}

export function withholdNonPlayerRows({ rows, members, users, profiles, teamId }) {
  const kept = [];
  const withheld = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const standing = rosterRowStanding(row, { members, users, profiles, teamId });
    if (standing === 'staff' || standing === 'other_club') withheld.push({ row, standing });
    else kept.push(row);
  }
  return {
    rows: kept,
    withheld: withheld.map(w => w.row),
    counts: { staff: withheld.filter(w => w.standing === 'staff').length,
              otherClub: withheld.filter(w => w.standing === 'other_club').length },
  };
}

/**
 * The write half: a stored row the read withheld can never be erased by a
 * save that omitted it (a device never saw it, so the omission is not an
 * edit). Re-appended verbatim unless the save carries a row with its id.
 */
export function keepWithheldRows({ storedRows, nextRows, members, users, profiles, teamId }) {
  const next = Array.isArray(nextRows) ? nextRows : [];
  const ids = new Set(next.map(r => s(r.id)));
  const { withheld } = withholdNonPlayerRows({ rows: storedRows, members, users, profiles, teamId });
  const kept = withheld.filter(r => !ids.has(s(r.id)));
  return { rows: kept.length ? [...next, ...kept] : next, kept };
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
/**
 * A BLANK NEVER ERASES WHAT THE CLUB HOLDS (Build 133).
 *
 * Build 132 reproduced a club switch in which a device that had not yet read
 * the new club's roster pushed a minimal copy of it (name, userId, position
 * "TBC") and this record — replaced wholesale by a club-wide save — lost every
 * player's date of birth, notes, guardian and emergency contact. The client no
 * longer pushes before it has read; this is the server's own rule, so no
 * device, stale or new, can do it again:
 *
 *   for every submitted row that is a STORED row (same id, or the same
 *   account's row under another id), a field the submission leaves blank —
 *   absent, null, empty or whitespace — keeps its stored value, and a
 *   placeholder position (TBC/TBA/unknown) never replaces a real one.
 *
 * A same-account row submitted under a different id keeps the STORED id
 * (medical cases, appearances and availability are keyed by it), unless the
 * submission also carries a row with that id. A stored row claimed by a
 * DIFFERENT account never lends its fields (two John Smiths stay two people).
 * Pure; returns the merged rows and how many fields were preserved.
 *
 * Known consequence, by design: a roster save cannot CLEAR a field by sending
 * it empty. Clearing is not something the roster form offers today.
 */
const PLACEHOLDER_POSITIONS = new Set(['', 'tbc', 'tba', 'unknown', '—', '-']);
const isBlankValue = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const isPlaceholderPosition = v => PLACEHOLDER_POSITIONS.has(s(v).toLowerCase());

export function preserveStoredFields({ storedRows, nextRows }) {
  const stored = Array.isArray(storedRows) ? storedRows : [];
  const next = Array.isArray(nextRows) ? nextRows : [];
  const byId = new Map(stored.map(r => [s(r.id), r]));
  const byUser = new Map();
  for (const r of stored) { const u = s(r.userId); if (u && !byUser.has(u)) byUser.set(u, r); }
  const submittedIds = new Set(next.map(r => s(r.id)));
  const used = new Set();
  let preserved = 0;
  const rows = next.map(row => {
    if (!row || typeof row !== 'object') return row;
    let base = byId.get(s(row.id)) || null;
    let viaAccount = false;
    if (!base && s(row.userId)) { base = byUser.get(s(row.userId)) || null; viaAccount = !!base; }
    if (!base || used.has(base)) return row;
    if (s(base.userId) && s(row.userId) && s(base.userId) !== s(row.userId)) return row;
    used.add(base);
    const merged = { ...row };
    for (const [k, v] of Object.entries(base)) {
      if (k === 'id' || k === 'photo') continue;
      const incoming = row[k];
      if (isBlankValue(incoming) && !isBlankValue(v)) { merged[k] = v; preserved++; continue; }
      if (k === 'position' && isPlaceholderPosition(incoming) && !isPlaceholderPosition(v)) { merged[k] = v; preserved++; }
    }
    if (viaAccount && !submittedIds.has(s(base.id))) merged.id = base.id;
    return merged;
  });
  return { rows, preserved };
}

/**
 * ONE ROW PER ACCOUNT, at the write (duplicate-player investigation).
 *
 * A save could carry the same person twice — the same account under the same
 * id, or under two ids (an invite id and the user_ id) — and both rows were
 * stored. Rows are collapsed only when they name the SAME ACCOUNT (userId) AND
 * the same person (normalised name, or one of them unnamed): a matching name
 * alone never merges anyone, and a userId shared by two different names is a
 * corruption to report, not to guess at — both are kept. The surviving row is
 * the one holding a STORED id for that account (availability, medical and
 * appearances are keyed by it), else the first; blanks are filled from the
 * others, nothing filled is overwritten. Exact same-id repeats of an unlinked
 * row collapse the same way. Pure.
 */
export function collapseDuplicateRows({ rows, storedRows = [] }) {
  const list = Array.isArray(rows) ? rows : [];
  const storedIds = new Set((Array.isArray(storedRows) ? storedRows : []).map(r => s(r.id)));
  const groups = new Map();
  const order = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') { order.push({ solo: row }); continue; }
    const k = s(row.userId) ? `u:${s(row.userId)}` : `i:${s(row.id)}`;
    if (!groups.has(k)) { groups.set(k, []); order.push({ k }); }
    groups.get(k).push(row);
  }
  let collapsed = 0;
  const out = [];
  for (const entry of order) {
    if (!entry.k) { out.push(entry.solo); continue; }
    const g = groups.get(entry.k);
    const names = new Set(g.map(r => nameKeyOf(r.name)).filter(Boolean));
    if (g.length === 1 || names.size > 1) { out.push(...g); continue; }
    const keep = g.find(r => storedIds.has(s(r.id))) || g[0];
    const merged = { ...keep };
    for (const other of g) {
      if (other === keep) continue;
      for (const [f, v] of Object.entries(other)) {
        if (isBlankValue(merged[f]) && !isBlankValue(v)) merged[f] = v;
        else if (f === 'position' && isPlaceholderPosition(merged[f]) && !isPlaceholderPosition(v)) merged[f] = v;
      }
      collapsed++;
    }
    out.push(merged);
  }
  return { rows: out, collapsed };
}

export function protectCanonicalRows({ storedRows, nextRows, members, profiles, teamId }) {
  const stored = Array.isArray(storedRows) ? storedRows : [];
  const next = Array.isArray(nextRows) ? nextRows : [];
  const playing = activePlayingMembers(members, teamId, profiles);
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
  for (const member of activePlayingMembers(members, teamId, profiles)) {
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
