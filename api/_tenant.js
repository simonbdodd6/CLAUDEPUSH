import { DEFAULT_TEAM, hasRole, requireRole, requireSession } from './_identityStore.js';

export function tenantTeamId(sessionContext = {}) {
  return String(
    sessionContext?.teamMember?.teamId ||
    sessionContext?.session?.teamId ||
    DEFAULT_TEAM.id
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
