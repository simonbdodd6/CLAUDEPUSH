import { hasRole, requireRole, requireSession } from './_identityStore.js';
import { can, PERM } from './_permissions.js';
import { loadClubStructure, assertGroupBelongsToClub, assertTeamBelongsToClub } from './_structureStore.js';
import {
  assertScopedPermission, canViewGroup, canViewTeam, canViewGroupRoster,
  getAccessibleGroups, getAccessibleTeams, effectiveAccessScope,
} from './_accessScope.js';

export { can, PERM };
export { assertGroupBelongsToClub, assertTeamBelongsToClub };

// ─── RC4.7 Phase B — scope-aware request gates ──────────────────────────────
// The club-level gates below stay authoritative for club-wide actions; these
// add the group/team dimension. groupId/teamId ALWAYS come from the request
// and are never trusted: they are validated against the club's own structure
// (unknown/archived/cross-club → deny) before any capability check.

/**
 * Session + structure + scoped capability in one call.
 * Throws 401/403/404; returns { ...sessionContext, teamId, role, structure,
 * group?, team? } on success.
 */
export async function requireScopedPermission(req, permission, { groupId = null, teamId = null } = {}) {
  const sessionContext = await requireSession(req);
  const clubId = tenantTeamId(sessionContext);
  const structure = await loadClubStructure(clubId);
  const resolved = assertScopedPermission(sessionContext, structure, permission, { groupId, teamId });
  return {
    ...sessionContext,
    teamId: clubId,
    role: tenantRole(sessionContext),
    structure,
    ...resolved,
  };
}

/** Session + structure + VIEW reachability (no capability requirement). */
export async function requireScopedView(req, { groupId = null, teamId = null, rosterOnly = false } = {}) {
  const sessionContext = await requireSession(req);
  const clubId = tenantTeamId(sessionContext);
  const structure = await loadClubStructure(clubId);
  const allowed = teamId !== null
    ? canViewTeam(sessionContext, structure, teamId)
    : rosterOnly
      ? canViewGroupRoster(sessionContext, structure, groupId)
      : canViewGroup(sessionContext, structure, groupId);
  if (!allowed) {
    const error = new Error('Not authorized for this scope');
    error.status = 403;
    throw error;
  }
  return { ...sessionContext, teamId: clubId, role: tenantRole(sessionContext), structure };
}

/**
 * Club-wide administration gate (RC4.7 Phase C): the capability AND club-wide
 * scope. A group-scoped head coach holds MANAGE_TEAMS within their group but
 * must never pass this — structure and access administration are club-level.
 */
export async function requireClubManage(req, permission = PERM.MANAGE_TEAMS) {
  const sessionContext = await requireTenantPermission(req, permission);
  if (!effectiveAccessScope(sessionContext.teamMember).clubWide) {
    const error = new Error('Only club-wide administrators can do this');
    error.status = 403;
    throw error;
  }
  return sessionContext;
}

/** The scopes this session may see — for switchers and scoped listings. */
export async function accessibleScopes(sessionContext) {
  const structure = await loadClubStructure(tenantTeamId(sessionContext));
  return {
    structure,
    groups: getAccessibleGroups(sessionContext.teamMember, structure),
    teams: getAccessibleTeams(sessionContext.teamMember, structure),
  };
}

// Permission-based gate — the standard for all route authorization.
// Asks "can this identity perform this action?", never "what is their role?".
export async function requireTenantPermission(req, permission) {
  const sessionContext = await requireSession(req);
  if (!can(sessionContext, permission)) {
    const error = new Error('Not authorized');
    error.status = 403;
    throw error;
  }
  return { ...sessionContext, teamId: tenantTeamId(sessionContext), role: tenantRole(sessionContext) };
}

export function tenantTeamId(sessionContext = {}) {
  return String(
    sessionContext?.teamMember?.teamId ||
    sessionContext?.session?.teamId ||
    ''
  );
}

export function tenantRole(sessionContext = {}) {
  return String(
    sessionContext?.teamMember?.role ||
    sessionContext?.user?.role ||
    sessionContext?.session?.role ||
    ''
  );
}

export function teamAccessError(message = 'Not authorized for this team') {
  const error = new Error(message);
  error.status = 403;
  return error;
}

export function assertSameTenant(sessionContext, targetTeamId, message = 'Not authorized for this team') {
  const sessionTeamId = tenantTeamId(sessionContext);
  const normalizedTarget = String(targetTeamId || sessionTeamId);
  if (normalizedTarget !== sessionTeamId) throw teamAccessError(message);
  return sessionTeamId;
}

export async function requireTenantSession(req) {
  const sessionContext = await requireSession(req);
  return { ...sessionContext, teamId: tenantTeamId(sessionContext), role: tenantRole(sessionContext) };
}

export async function requireTenantRole(req, roles = []) {
  const sessionContext = await requireRole(req, roles);
  return { ...sessionContext, teamId: tenantTeamId(sessionContext), role: tenantRole(sessionContext) };
}

export function canUseTenantRole(sessionContext, roles = []) {
  return hasRole(sessionContext, roles);
}
