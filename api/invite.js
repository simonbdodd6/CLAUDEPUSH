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
import { assertSameTenant, requireTenantRole } from './_tenant.js';
import { randomBytes } from 'node:crypto';

const INVITES_KEY = 'ce:invites';
const APP_URL     = process.env.APP_URL || 'https://boitsfort-coachseye-gpt.vercel.app';
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
      return res.status(200).json({
        valid:     true,
        token:     invite.token,
        name:      invite.name,
        role:      invite.role,
        email:     invite.email || '',
        status:    invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt || null,
      });
    }

    // List all invites
    let session;
    try {
      session = await requireTenantRole(req, ['coach', 'admin']);
      if (req.query?.teamId) assertSameTenant(session, req.query.teamId);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const invites = (await kvGet(INVITES_KEY)) || [];
    return res.status(200).json({ invites: invites.filter(invite => inviteTeamId(invite) === session.teamId) });
  }

  // ── POST: create a new invite ──────────────────────────────────────────────
  if (req.method === 'POST') {
    let session;
    try {
      session = await requireTenantRole(req, ['coach', 'admin']);
      if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
      await enforceRateLimit('invite_create', `${session.user.id}:${requestIp(req)}`, { limit: 20, windowMs: 60 * 60 * 1000 });
    } catch (error) {
      return sendAuthError(res, error);
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

    const token  = makeToken();
    const invite = {
      token,
      name:      name.trim(),
      role:      normRole,
      ...(normStaffLevel ? { staffLevel: normStaffLevel } : {}),
      email:     email?.trim() || '',
      status:    'pending',
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
      session = await requireTenantRole(req, ['coach', 'admin']);
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
      session = await requireTenantRole(req, ['coach', 'admin']);
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
