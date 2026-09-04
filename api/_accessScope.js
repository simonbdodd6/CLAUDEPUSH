// api/_accessScope.js — RC4.7 Phase B: three-level access scope + eligibility.
//
// WHAT A MEMBERSHIP MAY REACH (access) is deliberately separate from WHICH
// TEAMS A PLAYER MAY BE PICKED FOR (eligibility). Access is authorization;
// eligibility is selection domain data and confers no capabilities at all.
//
// The membership record (one per person per club — identity is never
// duplicated) gains two optional fields:
//
//   accessScope: {
//     clubWide: boolean,                       // all groups + teams
//     groups: [{ groupId, role?, status }],    // group + every team in it
//     teams:  [{ teamId,  role?, status }],    // that team only
//   }
//   playerEligibility: { teamIds: [], primaryTeamId: null }
//
// Grant semantics:
//  - clubWide       → every active group and team, subject to role capability.
//  - group grant    → the group's shared resources and ALL its active teams.
//  - team grant     → that team's match resources, plus read access to the
//                     group player pool (the minimum needed to pick a side).
//                     NOT the group's training/messages/administration, and
//                     NOT sibling teams.
//  - grant.role     → optional per-scope role override: capabilities at that
//                     scope come from the override instead of the club role.
//  - status         → 'active' | 'removed'. Soft removal keeps the record
//                     (history) but contributes nothing.
//
// Legacy memberships (no accessScope field) resolve through a PURE, documented
// derivation — the migration mapping — computed at authorization time. Nothing
// is written on read; persisting happens only when an admin later edits access.
//
// Fail-closed rule: anything malformed — accessScope that isn't an object,
// grants that aren't arrays, entries without ids — normalizes to NO scoped
// access, never to wider access.

import {
  PERM, ROLE_PERMISSIONS, ACCESS_PROFILE_PERMISSIONS, ACCESS_PROFILES,
  canonicalRole, accessProfileOf, hasExplicitAccessProfile, isClubOwner,
  permissionsFor,
} from './_permissions.js';
import {
  INITIAL_GROUP_ID, INITIAL_TEAM_ID,
  groupById, teamById, activeGroups, activeTeams,
} from './_structureStore.js';

const GRANT_STATUSES = ['active', 'removed'];

// ─── Normalization (fail closed) ────────────────────────────────────────────

function normalizeGrantList(list, idField) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry[idField] || '').trim();
    if (!id || seen.has(id)) continue;              // no duplicate effective grants
    seen.add(id);
    out.push({
      [idField]: id,
      role: typeof entry.role === 'string' && entry.role ? entry.role : null,
      status: GRANT_STATUSES.includes(entry.status) ? entry.status : 'active',
    });
  }
  return out;
}

/** Stored accessScope → canonical form. Malformed input → empty (deny). */
export function normalizeAccessScope(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { clubWide: false, groups: [], teams: [] };
  }
  return {
    clubWide: raw.clubWide === true,
    groups: normalizeGrantList(raw.groups, 'groupId'),
    teams: normalizeGrantList(raw.teams, 'teamId'),
  };
}

// ─── Migration mapping (pure, deterministic, documented) ────────────────────
//
//  Existing membership                        → derived scope
//  ─────────────────────────────────────────────────────────────────────
//  isOwner (founder / explicit owner role)    → clubWide  (Club Owner)
//  explicit stored accessProfile === 'full'   → clubWide  (Club Admin —
//        an explicit Full Access assignment is an unambiguous statement of
//        full administration under RC4.9C)
//  canonical role 'admin' or 'dor'            → clubWide  (their default
//        profile is full BY ROLE — Club Administrator / Director of Rugby
//        are club-wide jobs)
//  every other staff role (head_coach,        → group grant on the initial
//        assistant, manager, medical, snc,      migrated group only
//        analyst)
//  player                                     → group grant on the initial
//                                               group + eligibility for the
//                                               initial team (primary)
//  parent / guest                             → group grant on the initial
//                                               group (no capabilities)
//
//  A head coach whose 'full' profile is only DERIVED from their role (no
//  explicit assignment) is deliberately NOT club-wide: the narrowest safe
//  reading is that they ran the single migrated group.

const CLUB_WIDE_ROLES = new Set(['owner', 'admin', 'dor']);

function derivedScopeFor(member) {
  if (isClubOwner(member) ||
      hasExplicitAccessProfile(member) && String(member.accessProfile).toLowerCase() === 'full' ||
      CLUB_WIDE_ROLES.has(canonicalRole(member))) {
    return { clubWide: true, groups: [], teams: [] };
  }
  return {
    clubWide: false,
    groups: [{ groupId: INITIAL_GROUP_ID, role: null, status: 'active' }],
    teams: [],
  };
}

/**
 * The membership's effective scope: stored accessScope when present (even an
 * explicitly-empty one — storing "no scopes" MEANS no scopes), otherwise the
 * pure legacy derivation above. Inactive memberships have no scope at all.
 */
export function effectiveAccessScope(member = {}) {
  if (!member || member.status !== 'active') {
    return { clubWide: false, groups: [], teams: [] };
  }
  if (member.accessScope !== undefined && member.accessScope !== null) {
    return normalizeAccessScope(member.accessScope);
  }
  return derivedScopeFor(member);
}

// ─── Player eligibility (selection domain — NEVER authorization) ────────────

export function normalizeEligibility(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { teamIds: [], primaryTeamId: null };
  }
  const teamIds = Array.isArray(raw.teamIds)
    ? [...new Set(raw.teamIds.map(id => String(id || '').trim()).filter(Boolean))]
    : [];
  const primary = String(raw.primaryTeamId || '').trim();
  return { teamIds, primaryTeamId: teamIds.includes(primary) ? primary : (teamIds[0] || null) };
}

/**
 * A player's effective eligibility. Legacy players (no field) are eligible for
 * the initial migrated team. Non-players have no eligibility.
 */
export function effectiveEligibility(member = {}) {
  if (!member || member.status !== 'active') return { teamIds: [], primaryTeamId: null };
  // RC4.7 Phase C.1 — DUAL ROLE. Stored eligibility is authoritative for ANY
  // role. A player who also gains staff access (coach / medical / admin) keeps
  // the squads they can be picked for; gating this on role === 'player' silently
  // suppressed a dual-role member's eligibility the moment their role changed.
  if (member.playerEligibility !== undefined && member.playerEligibility !== null) {
    return normalizeEligibility(member.playerEligibility);
  }
  // No stored eligibility: only an actual player derives the initial team.
  // Staff-only members never derive eligibility.
  if (canonicalRole(member) !== 'player') return { teamIds: [], primaryTeamId: null };
  return { teamIds: [INITIAL_TEAM_ID], primaryTeamId: INITIAL_TEAM_ID };
}

// ─── RC4.7 D1a — PLAYER GROUP (where a person PLAYS) ────────────────────────
//
// Deliberately separate from access scope (where a person may COACH/ADMIN).
// One membership can hold both: a U18 player who coaches Seniors keeps
// playerGroupId=U18 and gains Seniors staff access, and remains eligible to
// play for U18 only. Staff access must never move a player between groups, and
// club-wide administration must never make someone a player everywhere.

/** The membership's explicit player group, or '' when they are staff-only. */
export function playerGroupIdOf(member = {}) {
  return String(member?.playerGroupId || '').trim();
}

/** True when this membership represents someone who plays. */
export function isPlayingMember(member = {}) {
  return Boolean(playerGroupIdOf(member)) || canonicalRole(member) === 'player';
}

/**
 * The player's group RESOLVED against the live structure.
 *
 * Returns { groupId, group, source, needsAssignment }.
 *   source 'explicit' — member.playerGroupId, the authoritative value.
 *   source 'legacy'   — no explicit value AND the club has exactly one active
 *                       group. A temporary migration-compatibility path only.
 *   source 'none'     — cannot be determined. With several active groups the
 *                       model REFUSES to guess: needsAssignment flags it as a
 *                       data-integrity state for an admin to resolve, rather
 *                       than silently placing someone in the wrong group.
 */
export function resolvePlayerGroup(member = {}, structure = null) {
  const none = { groupId: '', group: null, source: 'none', needsAssignment: false };
  if (!member || member.status !== 'active') return none;

  const explicit = playerGroupIdOf(member);
  if (explicit) {
    const group = groupById(structure, explicit);
    // An explicit id that is unknown or archived resolves to nothing — it is
    // never quietly replaced by a different group.
    if (!group || group.status !== 'active') {
      return { groupId: '', group: null, source: 'none', needsAssignment: true };
    }
    return { groupId: group.id, group, source: 'explicit', needsAssignment: false };
  }

  if (canonicalRole(member) !== 'player') return none;   // staff-only: no player group

  const live = activeGroups(structure);
  if (live.length === 1) {
    return { groupId: live[0].id, group: live[0], source: 'legacy', needsAssignment: false };
  }
  // Zero groups, or several — never guess.
  return { groupId: '', group: null, source: 'none', needsAssignment: true };
}

/**
 * RC4.7 — a member's eligibility RESOLVED against the live club structure.
 *
 * Explicit stored eligibility always wins and is returned untouched. When a
 * member has none, a player is treated as eligible for every active team in
 * the groups they belong to — a Seniors player is, by default, pickable for
 * Premier and Premier Development. This is a read-time derivation only: it
 * writes nothing, so no migration is needed and an admin's explicit choices
 * are never overwritten.
 *
 * `derived: true` tells the UI it is showing a default rather than a stored
 * selection.
 */
export function resolveEligibility(member = {}, structure = null) {
  if (!member || member.status !== 'active') {
    return { teamIds: [], primaryTeamId: null, derived: false };
  }

  // THE shared-squad rule: eligibility IS group membership. Every active
  // player in a group is eligible for every active team in that group —
  // a Seniors player is pickable for Premier AND Premier Development, and
  // never for another group's teams. The group comes from playerGroupId
  // (D1a), never from staff access: where a person coaches and where they
  // play are different things.
  //
  // A stored playerEligibility list is legacy data and is deliberately NOT
  // authoritative for the team set anymore: honouring it is exactly how the
  // hardcoded team_initial default left one Seniors team with 0 eligible
  // players while its sibling held the whole squad. The field is left in
  // storage untouched (no migration, still readable) and may still express a
  // PRIMARY-team preference within the group — a display preference, never a
  // restriction.
  const { groupId, source } = resolvePlayerGroup(member, structure);
  if (!structure || !groupId) return { teamIds: [], primaryTeamId: null, derived: true };

  const teamIds = activeTeams(structure, groupId).map(t => t.id);
  const storedPrimary = (member.playerEligibility !== undefined && member.playerEligibility !== null)
    ? normalizeEligibility(member.playerEligibility).primaryTeamId
    : null;
  return {
    teamIds,
    primaryTeamId: teamIds.includes(storedPrimary) ? storedPrimary : (teamIds[0] || null),
    derived: true,
    source,
  };
}

/** Eligible teams validated against the live structure (active teams only). */
export function eligibleTeams(member, structure) {
  const { teamIds } = resolveEligibility(member, structure);
  return teamIds
    .map(id => teamById(structure, id))
    .filter(team => team && team.status === 'active');
}

// ─── Scope reachability (structure-validated, archived excluded) ────────────

function activeGrants(list) {
  return list.filter(g => g.status === 'active');
}

/** True when the scope reaches this group's SHARED resources. */
export function scopeAllowsGroup(member, structure, groupId) {
  const group = groupById(structure, groupId);
  if (!group || group.status !== 'active') return false;   // unknown/archived → deny
  const scope = effectiveAccessScope(member);
  if (scope.clubWide) return true;
  return activeGrants(scope.groups).some(g => g.groupId === group.id);
}

/** True when the scope reaches this team's MATCH resources. */
export function scopeAllowsTeam(member, structure, teamId) {
  const team = teamById(structure, teamId);
  if (!team || team.status !== 'active') return false;
  const group = groupById(structure, team.groupId);
  if (!group || group.status !== 'active') return false;   // orphaned team → deny
  const scope = effectiveAccessScope(member);
  if (scope.clubWide) return true;
  if (activeGrants(scope.groups).some(g => g.groupId === team.groupId)) return true;
  return activeGrants(scope.teams).some(g => g.teamId === team.id);
}

/**
 * True when the scope may READ the group's player pool. Includes team-only
 * grants for teams inside the group — the minimum a team coach needs to pick
 * an eligible side. Grants no management and no other group resources.
 */
export function scopeAllowsGroupRoster(member, structure, groupId) {
  if (scopeAllowsGroup(member, structure, groupId)) return true;
  const group = groupById(structure, groupId);
  if (!group || group.status !== 'active') return false;
  const scope = effectiveAccessScope(member);
  const teamIdsInGroup = new Set(activeTeams(structure, group.id).map(t => t.id));
  return activeGrants(scope.teams).some(g => teamIdsInGroup.has(g.teamId));
}

export function getAccessibleGroups(member, structure) {
  return activeGroups(structure).filter(g => scopeAllowsGroup(member, structure, g.id));
}

/**
 * D1b — THE OPERATIONAL GROUP CONTEXT.
 *
 * Every operational screen (Members, Availability, Training, Medical, Match
 * Centre, Messages) is read in the context of exactly ONE group. Which groups
 * an identity may operate in depends on the capacity they are acting in, and
 * the two are deliberately different lists:
 *
 *   as 'staff'  → the groups their accessScope permits (where they COACH)
 *   as 'player' → exactly one, their playerGroupId (where they PLAY)
 *
 * A dual-role member — U18 player who coaches Seniors — therefore gets U18 in
 * the player portal and Seniors in the coach shell, from the same membership,
 * with no merging. This is the D1a separation carried into operations.
 */
export function operationalGroupsFor(member, structure, { as = 'staff' } = {}) {
  if (as === 'player') {
    const { group } = resolvePlayerGroup(member, structure);
    return group ? [group] : [];
  }
  // Build AE — a member with no staff role has NO staff capacity, full stop.
  // The legacy null-scope derivation below exists for STAFF who predate scoped
  // access; letting it run for a role-'player' member handed every player a
  // phantom staff side of [initial group] in their operational payload. No
  // live route honoured it (each is permission-gated first), but the resolver
  // must not answer a question the capacity does not exist to ask.
  const role = canonicalRole(member);
  if (role === 'player' || role === 'guest') return [];
  const scoped = getAccessibleGroups(member, structure);
  if (scoped.length) return scoped;

  // BACKWARD COMPATIBILITY. A member who predates scoped access derives
  // groups: [INITIAL_GROUP_ID], which only matches a club whose structure was
  // synthesized rather than created by hand — so a legacy coach in a
  // hand-built club would otherwise resolve to NOTHING and see an empty page.
  // While the club has exactly one active group the answer is unambiguous, so
  // give them that group. With several, guessing would leak, so give none and
  // let the caller ask. This mirrors the D1a legacy player-group rule.
  const live = activeGroups(structure);
  if (live.length === 1 && effectiveAccessScope(member).clubWide === false) return live;
  return scoped;
}

/**
 * The group an identity lands in with no explicit choice.
 *
 * One accessible group is unambiguous and is selected for them — today's
 * Seniors-only club therefore sees no selector and no new friction. With
 * several, `mustChoose` is true and nothing is guessed: the caller asks.
 */
export function defaultOperationalGroup(member, structure, opts = {}) {
  const groups = operationalGroupsFor(member, structure, opts);
  return { group: groups.length === 1 ? groups[0] : null, groups, mustChoose: groups.length > 1 };
}

/**
 * SERVER-SIDE gate for any operational request that names a group.
 *
 * Client filtering is presentation; this is the boundary. A forged, foreign,
 * archived or simply unpermitted group id is refused here, so editing a
 * request parameter cannot reach another group's data.
 */
export function assertOperationalGroup(sessionContext, structure, groupId, { as = 'staff' } = {}) {
  if (!canViewClub(sessionContext)) {
    const e = new Error('Not authorized'); e.status = 401; throw e;
  }
  const group = groupById(structure, groupId);
  // Unknown and foreign are the same answer: this club cannot see that id.
  if (!group) { const e = new Error('Unknown group for this club'); e.status = 404; throw e; }
  if (group.status !== 'active') {
    const e = new Error('That group is archived'); e.status = 400; throw e;
  }
  const allowed = operationalGroupsFor(sessionContext?.teamMember, structure, { as });
  if (!allowed.some(g => g.id === group.id)) {
    const e = new Error('Not authorized for this group'); e.status = 403; throw e;
  }
  return group;
}

export function getAccessibleTeams(member, structure) {
  return activeTeams(structure).filter(t => scopeAllowsTeam(member, structure, t.id));
}

// ─── Capabilities at a scope ────────────────────────────────────────────────
// Reachability answers "may they see this scope at all"; capability answers
// "may they do THIS there". A per-scope grant role overrides the club role for
// capability computation at that scope — a club-level Coach can be a
// team-level Manager, and vice versa.

const ROLE_PROFILE = { head_coach: 'coach', assistant: 'coach', coach: 'coach', manager: 'manager' };

function permissionsAtScope(member, grantRole) {
  if (!grantRole) return permissionsFor(member);
  const role = String(grantRole).toLowerCase();
  if (ACCESS_PROFILES.includes(role)) {
    return new Set(ACCESS_PROFILE_PERMISSIONS[role] || []);
  }
  const profile = ROLE_PROFILE[role];
  if (profile) return new Set(ACCESS_PROFILE_PERMISSIONS[profile] || []);
  return new Set(ROLE_PERMISSIONS[role] || []);            // unknown role → its matrix or empty
}

function grantRoleForGroup(member, groupId) {
  const scope = effectiveAccessScope(member);
  return activeGrants(scope.groups).find(g => g.groupId === String(groupId))?.role || null;
}

function grantRoleForTeam(member, structure, teamId) {
  const scope = effectiveAccessScope(member);
  const direct = activeGrants(scope.teams).find(g => g.teamId === String(teamId))?.role;
  if (direct) return direct;
  const team = teamById(structure, teamId);
  return team ? grantRoleForGroup(member, team.groupId) : null;
}

// ─── The helpers every route composes (all default to deny) ─────────────────

export function canViewClub(sessionContext = {}) {
  const member = sessionContext?.teamMember;
  return Boolean(sessionContext?.user?.id && member && member.status === 'active');
}

export function canManageClub(sessionContext = {}) {
  if (!canViewClub(sessionContext)) return false;
  const member = sessionContext.teamMember;
  return effectiveAccessScope(member).clubWide && permissionsFor(member).has(PERM.MANAGE_TEAMS);
}

export function canViewGroup(sessionContext = {}, structure, groupId) {
  if (!canViewClub(sessionContext)) return false;
  return scopeAllowsGroup(sessionContext.teamMember, structure, groupId);
}

export function canManageGroup(sessionContext = {}, structure, groupId, permission = PERM.MANAGE_PLAYERS) {
  if (!canViewGroup(sessionContext, structure, groupId)) return false;
  const member = sessionContext.teamMember;
  return permissionsAtScope(member, grantRoleForGroup(member, groupId)).has(permission);
}

export function canViewTeam(sessionContext = {}, structure, teamId) {
  if (!canViewClub(sessionContext)) return false;
  return scopeAllowsTeam(sessionContext.teamMember, structure, teamId);
}

export function canManageTeam(sessionContext = {}, structure, teamId, permission = PERM.MANAGE_FIXTURES) {
  if (!canViewTeam(sessionContext, structure, teamId)) return false;
  const member = sessionContext.teamMember;
  return permissionsAtScope(member, grantRoleForTeam(member, structure, teamId)).has(permission);
}

export function canViewGroupRoster(sessionContext = {}, structure, groupId) {
  if (!canViewClub(sessionContext)) return false;
  return scopeAllowsGroupRoster(sessionContext.teamMember, structure, groupId);
}

export function canManageGroupMembers(sessionContext = {}, structure, groupId) {
  return canManageGroup(sessionContext, structure, groupId, PERM.MANAGE_PLAYERS);
}

/** Match selections are TEAM-scoped staff work. Eligibility never grants it. */
export function canEditMatchSelection(sessionContext = {}, structure, teamId) {
  return canManageTeam(sessionContext, structure, teamId, PERM.PUBLISH_SQUADS);
}

/**
 * Route-level guard: validate the id against the club structure, then check
 * reachability + capability. Throws 404 for unknown ids, 403 for reachable
 * denials. Exactly one of groupId / teamId is required.
 */
export function assertScopedPermission(sessionContext, structure, permission, { groupId = null, teamId = null } = {}) {
  if (!canViewClub(sessionContext)) {
    const error = new Error('Not authorized');
    error.status = 401;
    throw error;
  }
  if (teamId !== null) {
    const team = teamById(structure, teamId);
    if (!team) { const e = new Error('Unknown team for this club'); e.status = 404; throw e; }
    if (!canManageTeam(sessionContext, structure, teamId, permission)) {
      const e = new Error('Not authorized for this team'); e.status = 403; throw e;
    }
    return { team };
  }
  if (groupId !== null) {
    const group = groupById(structure, groupId);
    if (!group) { const e = new Error('Unknown group for this club'); e.status = 404; throw e; }
    if (!canManageGroup(sessionContext, structure, groupId, permission)) {
      const e = new Error('Not authorized for this group'); e.status = 403; throw e;
    }
    return { group };
  }
  const error = new Error('A group or team scope is required');
  error.status = 400;
  throw error;
}
