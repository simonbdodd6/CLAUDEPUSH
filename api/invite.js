// api/invite.js — Team invite link management
//
// POST { name, role, email? }
//   → creates a single-use invite token stored in Redis
//   → returns { token, url }
//
// GET ?token=xxx
//   → validates token, returns { valid, name, role, status }
//
// GET (no token)
//   → returns full invite list (coach dashboard)
//
// PATCH { token }
//   → marks invite as accepted (called when a player joins via the link)
//
// DELETE { token }
//   → revokes / removes the invite

import { kvGet, kvSet } from './_kv.js';
import { key } from './_keys.js';
import { setCors } from './_http.js';
import { DEFAULT_TEAM } from './_identityStore.js';
import { inviteEmail, sendTransactionalEmail } from './_email.js';
import { auditLog, enforceRateLimit, requestIp } from './_security.js';
import { assertSameTenant, requireTenantPermission, can, PERM } from './_tenant.js';
import { loadClubStructure, groupById, teamById } from './_structureStore.js';
import { effectiveAccessScope, getAccessibleGroups, canManageGroup, canManageTeam } from './_accessScope.js';
import { randomBytes } from 'node:crypto';

const INVITES_KEY = 'ce:invites';
const APP_URL     = process.env.APP_URL || 'https://www.coacheasier.com';
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14;


function sendAuthError(res, error) {
  const status = error?.status || 403;
  return res.status(status).json({ ok: false, error: error?.message || 'Not authorized' });
}

// Valid roles — maps to what the joining user will see in the app
const VALID_ROLES = ['player', 'coach', 'admin', 'medical'];

function makeToken() {
  return randomBytes(24).toString('base64url');
}

function inviteUrl(req, token) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (host) {
    const proto = req.headers?.['x-forwarded-proto'] || 'https';
    return `${proto}://${host}/?inv=${encodeURIComponent(token)}`;
  }
  return `${APP_URL}/?inv=${encodeURIComponent(token)}`;
}

function inviteExpired(invite = {}) {
  return Boolean(invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now());
}

function inviteTeamId(invite = {}) {
  return String(invite.teamId || DEFAULT_TEAM.id);
}

// ── RC4.7 Phase C — scoped invites ──────────────────────────────────────────
// An invite may carry the scope it will grant on claim: whole club, one
// group, or one team. The CREATOR must hold manage rights over that scope —
// an invitation can never grant wider access than its author could assign,
// so no invite elevates itself. The claim path applies the STORED scope only.

function scopeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Validate the requested invite scope against the club structure AND the
 * creator's own authority. Returns null (unscoped, legacy behaviour — only
 * club-wide admins may mint those) or {clubWide} | {groupId} | {teamId}.
 */
async function resolveInviteScope(session, body = {}, role = 'player') {
  const structure = await loadClubStructure(session.teamId);
  const raw = body.scope && typeof body.scope === 'object' ? body.scope : {};
  const level = String(raw.level || (raw.teamId ? 'team' : raw.groupId ? 'group' : '')).toLowerCase();
  const actorClubWide = effectiveAccessScope(session.teamMember).clubWide;
  const isStaffRole = ['coach', 'admin', 'medical'].includes(role);
  const invitePerm = isStaffRole ? PERM.MANAGE_COACHES : PERM.MANAGE_PLAYERS;

  if (role === 'admin' && level && level !== 'club') {
    throw scopeError('Club Admin is a whole-club role — choose whole-club scope');
  }

  if (level === 'team') {
    const team = teamById(structure, raw.teamId);
    if (!team) throw scopeError('Unknown team for this club', 404);
    if (team.status === 'archived') throw scopeError(`"${team.name}" is archived — restore it before inviting`);
    const group = groupById(structure, team.groupId);
    if (!group || group.status === 'archived') throw scopeError('That team\'s group is archived');
    if (!canManageTeam(session, structure, team.id, invitePerm)) {
      throw scopeError('You are not allowed to invite people to that team', 403);
    }
    return { teamId: team.id };
  }
  if (level === 'group') {
    const group = groupById(structure, raw.groupId);
    if (!group) throw scopeError('Unknown group for this club', 404);
    if (group.status === 'archived') throw scopeError(`"${group.name}" is archived — restore it before inviting`);
    if (!canManageGroup(session, structure, group.id, invitePerm)) {
      throw scopeError('You are not allowed to invite people to that group', 403);
    }
    return { groupId: group.id };
  }
  if (level === 'club') {
    if (!actorClubWide) throw scopeError('Only club-wide administrators can create whole-club invites', 403);
    return { clubWide: true };
  }

  // No scope requested. Club-wide admins keep the legacy unscoped invite
  // (claims derive the initial group, unchanged). A scoped coach MUST pick a
  // scope — defaulting to their only group when unambiguous.
  if (actorClubWide) return null;
  const accessible = getAccessibleGroups(session.teamMember, structure);
  if (accessible.length === 1 &&
      canManageGroup(session, structure, accessible[0].id, invitePerm)) {
    return { groupId: accessible[0].id };
  }
  throw scopeError('Choose which group or team this invite is for');
}

/** Display names for an invite's scope — used by list + claim surfaces. */
async function inviteScopeNames(invite, structureCache = null) {
  if (!invite?.scope || typeof invite.scope !== 'object') return null;
  const structure = structureCache || await loadClubStructure(inviteTeamId(invite));
  if (invite.scope.clubWide) return { level: 'club', label: 'Whole club' };
  if (invite.scope.teamId) {
    const team = teamById(structure, invite.scope.teamId);
    const group = team ? groupById(structure, team.groupId) : null;
    return { level: 'team', label: team ? `${group ? group.name + ' · ' : ''}${team.name}` : 'Team' };
  }
  if (invite.scope.groupId) {
    const group = groupById(structure, invite.scope.groupId);
    return { level: 'group', label: group ? group.name : 'Group' };
  }
  return null;
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: validate token OR list all invites ────────────────────────────────
  if (req.method === 'GET') {
    const token = req.query?.token;

    if (token) {
      // Validate a specific token
      const invites = (await kvGet(INVITES_KEY)) || [];
      const invite  = invites.find(i => i.token === token);
      if (!invite) {
        return res.status(404).json({ valid: false, error: 'Invite not found or expired' });
      }
      if (invite.status === 'revoked') {
        return res.status(410).json({ valid: false, error: 'This invite has been revoked' });
      }
      if (inviteExpired(invite)) {
        return res.status(410).json({ valid: false, error: 'This invite link has expired' });
      }
      const clubConfig = (await kvGet(key(`club:${inviteTeamId(invite)}`))) || null;
      return res.status(200).json({
        valid:     true,
        token:     invite.token,
        role:      invite.role,
        status:    invite.status,
        group:     invite.kind === 'group',
        teamName:  clubConfig?.clubName || '',
        // Where this invite lands the claimer — display label only, no ids.
        scope:     await inviteScopeNames(invite),
        expiresAt: invite.expiresAt || null,
        // SECURITY: the invitee's name + email are intentionally NOT returned to an
        // unauthenticated token holder (PII disclosure). Claiming still binds to the
        // invite's stored email server-side, so functionality is unaffected.
      });
    }

    // List all invites
    let session;
    try {
      session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
      if (req.query?.teamId) assertSameTenant(session, req.query.teamId);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const invites = (await kvGet(INVITES_KEY)) || [];
    const mine = invites.filter(invite => inviteTeamId(invite) === session.teamId);
    const structure = mine.some(i => i.scope) ? await loadClubStructure(session.teamId) : null;
    const withLabels = [];
    for (const invite of mine) {
      withLabels.push({ ...invite, scopeLabel: (await inviteScopeNames(invite, structure))?.label || null });
    }
    return res.status(200).json({ invites: withLabels });
  }

  // ── POST: create a new invite ──────────────────────────────────────────────
  if (req.method === 'POST') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
      if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
      await enforceRateLimit('invite_create', `${session.user.id}:${requestIp(req)}`, { limit: 20, windowMs: 60 * 60 * 1000 });
    } catch (error) {
      return sendAuthError(res, error);
    }

    // ── Group invite: one permanent, reusable link per club ──────────────────
    // Players self-register their own details (no coach-set name, no expiry, no
    // single-use). Idempotent: returns the existing group link if one exists.
    if (req.body?.group === true || String(req.body?.kind || '') === 'group') {
      // Role-aware reusable link: ONE permanent group link PER ROLE per club. The
      // default player link is unchanged (role 'player'); coach/admin/medical links
      // are separate records and require the staff-invite permission, exactly like a
      // single staff invite. The claim flow is untouched — it already reads the
      // invite's role and creates the right team_member (no player profile for staff).
      const groupRole = String(req.body?.role || 'player').toLowerCase();
      if (!VALID_ROLES.includes(groupRole)) {
        return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      }
      if (['coach', 'admin', 'medical'].includes(groupRole) && !can(session, PERM.MANAGE_COACHES)) {
        return res.status(403).json({ error: 'You are not allowed to invite staff' });
      }
      // RC4.7 Phase C — the link may carry a scope; the creator must hold
      // manage rights over it (resolveInviteScope enforces both directions).
      let linkScope;
      try {
        linkScope = await resolveInviteScope(session, req.body, groupRole);
      } catch (error) { return sendAuthError(res, error); }
      const groupStaffLevel = ['head', 'assistant', 'manager'].includes(String(req.body?.staffLevel || '').toLowerCase())
        ? String(req.body.staffLevel).toLowerCase() : null;
      const invites = (await kvGet(INVITES_KEY)) || [];
      const scopeFingerprint = JSON.stringify(linkScope ?? null);
      let invite = invites.find(i => inviteTeamId(i) === session.teamId && i.kind === 'group'
        && (i.role || 'player') === groupRole && i.status !== 'revoked'
        && JSON.stringify(i.scope ?? null) === scopeFingerprint);
      if (!invite) {
        invite = {
          token:      makeToken(),
          kind:       'group',
          name:       '',
          role:       groupRole,
          ...(groupStaffLevel ? { staffLevel: groupStaffLevel } : {}),
          email:      '',
          status:     'open',
          teamId:     session.teamId,
          createdAt:  new Date().toISOString(),
          expiresAt:  null,            // permanent
          createdBy:  session.user.id,
          acceptedAt: null,
          acceptedCount: 0,
        };
        if (linkScope) invite.scope = linkScope;
        invites.unshift(invite);
        await kvSet(INVITES_KEY, invites.slice(0, 200));
        await auditLog('invite_group_created', { createdBy: session.user.id, teamId: session.teamId, role: groupRole, scoped: Boolean(linkScope), ip: requestIp(req) });
      }
      return res.status(200).json({ ok: true, token: invite.token, url: inviteUrl(req, invite.token), group: true, role: invite.role });
    }

    const { name, role, email, sendEmail = true, staffLevel } = req.body || {};
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const normRole = (role || 'player').toLowerCase();
    if (!VALID_ROLES.includes(normRole)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    const normStaffLevel = ['head', 'assistant', 'manager'].includes(String(staffLevel || '').toLowerCase())
      ? String(staffLevel).toLowerCase() : null;
    if (normStaffLevel && !['coach', 'admin'].includes(normRole)) {
      return res.status(400).json({ error: 'staffLevel only applies to coach/admin invites' });
    }
    // Inviting STAFF requires the manage-coaches permission — unchanged from
    // pre-Phase-C. A group-scoped Head Coach still passes (their role grants
    // it); resolveInviteScope then confines the invite to the scope they
    // actually manage, so this cannot be used to reach another group.
    if (['coach', 'admin', 'medical'].includes(normRole) && !can(session, PERM.MANAGE_COACHES)) {
      return res.status(403).json({ error: 'You are not allowed to invite staff' });
    }
    // RC4.7 Phase C — resolve + authorize the scope this invite will grant.
    let inviteScope;
    try {
      inviteScope = await resolveInviteScope(session, req.body, normRole);
    } catch (error) { return sendAuthError(res, error); }

    const token  = makeToken();
    const invite = {
      token,
      name:      name.trim(),
      role:      normRole,
      ...(normStaffLevel ? { staffLevel: normStaffLevel } : {}),
      email:     email?.trim() || '',
      status:    'pending',
      ...(inviteScope ? { scope: inviteScope } : {}),
      teamId:    session.teamId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      createdBy: session.user.id,
      acceptedAt: null,
    };

    const invites = (await kvGet(INVITES_KEY)) || [];
    invites.unshift(invite);
    // Keep last 200 invites
    const trimmed = invites.slice(0, 200);
    await kvSet(INVITES_KEY, trimmed);

    const url = inviteUrl(req, token);
    let emailDelivery = { ok: true, sent: false, skipped: true, reason: email ? 'email_not_requested' : 'missing_recipient' };
    if (sendEmail !== false && email?.trim()) {
      // Club name comes from the coach's first-run setup; fall back to the
      // structural team record so old deployments keep working.
      const clubConfig = (await kvGet(key(`club:${session.teamId}`))) || null;
      const teamName = clubConfig?.clubName || DEFAULT_TEAM.name;
      const message = inviteEmail({ name: invite.name, teamName, url });
      emailDelivery = await sendTransactionalEmail({ to: invite.email, ...message });
      invite.emailDelivery = emailDelivery;
      if (emailDelivery.sent) invite.emailSentAt = new Date().toISOString();
      await kvSet(INVITES_KEY, trimmed);
    }
    console.log(`[invite] Created ${normRole} invite for "${name.trim()}" — ${token}`);
    await auditLog('invite_created', {
      createdBy: session.user.id,
      role: normRole,
      email: invite.email || '',
      name: invite.name,
      expiresAt: invite.expiresAt,
      emailSent: Boolean(emailDelivery.sent),
      ip: requestIp(req),
    });

    return res.status(201).json({ ok: true, token, url, invite, emailDelivery });
  }

  // ── PATCH: mark invite as accepted, or re-send the invite email ──────────
  if (req.method === 'PATCH') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const { token, action } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const invites = (await kvGet(INVITES_KEY)) || [];
    const idx     = invites.findIndex(i => i.token === token);
    if (idx < 0) return res.status(404).json({ error: 'Invite not found' });
    try {
      assertSameTenant(session, inviteTeamId(invites[idx]));
    } catch (error) {
      return sendAuthError(res, error);
    }

    if (action === 'resend') {
      const invite = invites[idx];
      if (invite.status !== 'pending') return res.status(400).json({ error: 'Only pending invites can be re-sent' });
      if (inviteExpired(invite)) return res.status(410).json({ error: 'Invite has expired — create a new one' });
      if (!invite.email) return res.status(400).json({ error: 'Invite has no email address — copy the link instead' });
      try {
        await enforceRateLimit('invite_resend', `${session.user.id}:${requestIp(req)}`, { limit: 20, windowMs: 60 * 60 * 1000 });
      } catch (error) {
        return sendAuthError(res, error);
      }
      const clubConfig = (await kvGet(key(`club:${session.teamId}`))) || null;
      const teamName = clubConfig?.clubName || DEFAULT_TEAM.name;
      const url = inviteUrl(req, invite.token);
      const message = inviteEmail({ name: invite.name, teamName, url });
      const emailDelivery = await sendTransactionalEmail({ to: invite.email, ...message });
      invite.emailDelivery = emailDelivery;
      if (emailDelivery.sent) invite.emailSentAt = new Date().toISOString();
      await kvSet(INVITES_KEY, invites);
      await auditLog('invite_resent', { token: invite.token.slice(-8), email: invite.email, by: session.user.id, ip: requestIp(req) });
      return res.status(200).json({ ok: true, invite, emailDelivery });
    }

    invites[idx].status     = 'accepted';
    invites[idx].acceptedAt = new Date().toISOString();
    await kvSet(INVITES_KEY, invites);

    console.log(`[invite] Accepted: ${invites[idx].name} (${invites[idx].role})`);
    return res.status(200).json({ ok: true, invite: invites[idx] });
  }

  // ── DELETE: revoke an invite ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    let session;
    try {
      session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const invites = (await kvGet(INVITES_KEY)) || [];
    const idx     = invites.findIndex(i => i.token === token);
    if (idx < 0) return res.status(404).json({ error: 'Invite not found' });
    try {
      assertSameTenant(session, inviteTeamId(invites[idx]));
    } catch (error) {
      return sendAuthError(res, error);
    }

    // Soft-revoke (keep record for audit, just change status)
    invites[idx].status = 'revoked';
    invites[idx].revokedAt = new Date().toISOString();
    invites[idx].revokedBy = session.user.id;
    await kvSet(INVITES_KEY, invites);

    console.log(`[invite] Revoked: ${invites[idx].name} (${invites[idx].role})`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
