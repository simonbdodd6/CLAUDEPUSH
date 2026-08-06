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
  if (!member || member.status !== 'active' || canonicalRole(member) !== 'player') {
    return { teamIds: [], primaryTeamId: null };
  }
  if (member.playerEligibility !== undefined && member.playerEligibility !== null) {
    return normalizeEligibility(member.playerEligibility);
  }
  return { teamIds: [INITIAL_TEAM_ID], primaryTeamId: INITIAL_TEAM_ID };
}

/** Eligible teams validated against the live structure (active teams only). */
export function eligibleTeams(member, structure) {
  const { teamIds } = effectiveEligibility(member);
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
