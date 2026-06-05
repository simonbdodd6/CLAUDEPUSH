import {
  approveJoinRequest,
  claimInvite,
  clearSessionCookie,
  createPasswordResetRequest,
  destroySession,
  createJoinRequest,
  joinViaGroupInvite,
  listIdentityState,
  loginUser,
  rejectJoinRequest,
  resetPasswordWithToken,
  resolveSessionFromRequest,
  sessionCookie,
  sessionTokenFromRequest,
} from './_identityStore.js';
import { appBaseUrl, passwordResetEmail, sendTransactionalEmail } from './_email.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { auditLog, enforceRateLimit, requestIp } from './_security.js';
import { assertSameTenant, requireTenantRole } from './_tenant.js';

function sendError(res, error, fallbackStatus = 400) {
  const status = error?.status || fallbackStatus;
  return res.status(status).json({ ok: false, error: error?.message || 'Identity request failed' });
}

function publicAuthResult(result = {}) {
  if (!result.session) return result;
  const { token, ...safeSession } = result.session;
  return { ...result, session: safeSession };
}

function rateIdentity(req, value = '') {
  return `${requestIp(req)}:${String(value || '').trim().toLowerCase()}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ ok: false, error: 'Identity storage not configured yet' });

  if (req.method === 'GET') {
    try {
      if (req.query?.action === 'session') {
        const result = await resolveSessionFromRequest(req);
        if (!result) return res.status(401).json({ ok: false, error: 'No active session' });
        return res.status(200).json({ ok: true, ...result });
      }
      const tenant = await requireTenantRole(req, ['coach', 'admin']);
      if (req.query?.teamId) assertSameTenant(tenant, req.query.teamId);
      const state = await listIdentityState(tenant.teamId);
      return res.status(200).json({ ok: true, ...state });
    } catch (error) {
      return sendError(res, error);
    }
  }

  if (req.method === 'POST') {
    const action = req.body?.action || 'join';
    try {
      if (action === 'join') {
        const result = await createJoinRequest(req.body || {});
        return res.status(201).json({ ok: true, ...result });
      }
      if (action === 'login') {
        const email = req.body?.email || '';
        await enforceRateLimit('login', rateIdentity(req, email), { limit: 5, windowMs: 15 * 60 * 1000 });
        try {
          const result = await loginUser(req.body || {});
          await auditLog('login_success', {
            email: result.user?.email || String(email).trim().toLowerCase(),
            userId: result.user?.id || null,
            role: result.user?.role || result.teamMember?.role || null,
            ip: requestIp(req),
          });
          if (result.session?.token) res.setHeader('Set-Cookie', sessionCookie(result.session.token));
          return res.status(200).json({ ok: true, ...publicAuthResult(result) });
        } catch (error) {
          await auditLog('login_failure', {
            email: String(email || '').trim().toLowerCase(),
            ip: requestIp(req),
            reason: error?.message || 'login_failed',
          });
          throw error;
        }
      }
      if (action === 'claim_invite') {
        const result = await claimInvite(req.body || {});
        await auditLog('invite_claimed', {
          email: result.user?.email || null,
          userId: result.user?.id || null,
          role: result.user?.role || result.teamMember?.role || null,
          inviteStatus: result.invite?.status || null,
          ip: requestIp(req),
        });
        if (result.session?.token) res.setHeader('Set-Cookie', sessionCookie(result.session.token));
        return res.status(201).json({ ok: true, ...publicAuthResult(result) });
      }
      if (action === 'join_group_invite') {
        const result = await joinViaGroupInvite(req.body || {});
        return res.status(201).json({ ok: true, ...result });
      }
      if (action === 'request_password_reset') {
        await enforceRateLimit('password_reset_request', rateIdentity(req, req.body?.email), { limit: 5, windowMs: 60 * 60 * 1000 });
        const result = await createPasswordResetRequest({ email: req.body?.email });
        await auditLog('password_reset_requested', {
          email: String(req.body?.email || '').trim().toLowerCase(),
          userId: result.user?.id || null,
          knownAccount: Boolean(result.user?.id),
          ip: requestIp(req),
        });
        let emailDelivery = { ok: true, sent: false, skipped: true, reason: 'account_not_found' };
        if (result.token && result.user?.email) {
          const resetUrl = `${appBaseUrl(req)}/?reset=${encodeURIComponent(result.token)}`;
          const message = passwordResetEmail({ name: result.user.displayName || result.user.email, url: resetUrl });
          emailDelivery = await sendTransactionalEmail({ to: result.user.email, ...message });
        }
        return res.status(200).json({ ok: true, emailDelivery, expiresAt: result.expiresAt });
      }
      if (action === 'reset_password') {
        await enforceRateLimit('password_reset_submit', rateIdentity(req, String(req.body?.token || '').slice(0, 12)), { limit: 5, windowMs: 60 * 60 * 1000 });
        try {
          const result = await resetPasswordWithToken({ token: req.body?.token, password: req.body?.password });
          await auditLog('password_reset_completed', {
            userId: result.user?.id || null,
            email: result.user?.email || null,
            ip: requestIp(req),
          });
          return res.status(200).json({ ok: true, ...result });
        } catch (error) {
          await auditLog('password_reset_failed', {
            ip: requestIp(req),
            reason: error?.message || 'reset_failed',
          });
          throw error;
        }
      }
      if (action === 'session') {
        const result = await resolveSessionFromRequest(req);
        if (!result) return res.status(401).json({ ok: false, error: 'No active session' });
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'logout') {
        await destroySession(sessionTokenFromRequest(req));
        res.setHeader('Set-Cookie', clearSessionCookie());
        return res.status(200).json({ ok: true });
      }
      if (action === 'approve') {
        const session = await requireTenantRole(req, ['coach', 'admin']);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const result = await approveJoinRequest(req.body?.memberId, session.user.id, session.teamId);
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'reject') {
        const session = await requireTenantRole(req, ['coach', 'admin']);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const result = await rejectJoinRequest(req.body?.memberId, session.user.id, session.teamId);
        return res.status(200).json({ ok: true, ...result });
      }
      return res.status(400).json({ ok: false, error: 'Unknown identity action' });
    } catch (error) {
      return sendError(res, error);
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
