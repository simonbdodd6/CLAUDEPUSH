import { hasRole, requireRole, requireSession } from './_identityStore.js';
import { can, PERM } from './_permissions.js';

export { can, PERM };

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
