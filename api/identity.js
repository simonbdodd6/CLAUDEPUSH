import {
  adminAccountStatus,
  adminResetStaffPassword,
  approveJoinRequest,
  approvePlayerDetails,
  changeEmail,
  changePassword,
  claimInvite,
  createClub,
  destroyAllSessionsForUser,
  requireSession,
  tokenHashFor,
  updateNotificationPreferences,
  updateProfile,
  clearSessionCookie,
  createPasswordResetRequest,
  destroySession,
  createJoinRequest,
  devLoginUser,
  isHeadCoach,
  listIdentityState,
  loadTeamMembers,
  loginUser,
  rejectJoinRequest,
  removeTeamMember,
  resetPasswordWithToken,
  resolveSessionFromRequest,
  restoreTeamMember,
  sessionCookie,
  sessionTokenFromRequest,
  setStaffLevel,
} from './_identityStore.js';
import { appBaseUrl, passwordResetEmail, sendTransactionalEmail } from './_email.js';
import { setCors, readSecret } from './_http.js';
import { randomBytes } from 'node:crypto';
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
  setCors(res, req);
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
      if (action === 'create_club') {
        await enforceRateLimit('create_club', requestIp(req), { limit: 5, windowMs: 60 * 60 * 1000 });
        const result = await createClub(req.body || {});
        await auditLog('club_created', {
          teamId: result.team?.id, clubName: result.team?.name,
          userId: result.user?.id, email: result.user?.email, ip: requestIp(req),
        });
        if (result.session?.token) res.setHeader('Set-Cookie', sessionCookie(result.session.token));
        return res.status(201).json({ ok: true, ...publicAuthResult(result) });
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
      if (action === 'remove_member' || action === 'archive_member') {
        const session = await requireTenantRole(req, ['coach', 'admin']);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        // Removing STAFF is reserved for the head coach; any coach can manage players.
        const members = await loadTeamMembers();
        const target = members.find(m => m.id === req.body?.memberId);
        if (target && ['coach', 'admin'].includes(target.role) && !isHeadCoach(session)) {
          return res.status(403).json({ ok: false, error: 'Only the head coach can remove staff' });
        }
        const result = await removeTeamMember(req.body?.memberId, session.user.id, session.teamId, {
          archive: action === 'archive_member',
        });
        await auditLog(action, { memberId: req.body?.memberId, by: session.user.id, ip: requestIp(req) });
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'restore_member') {
        const session = await requireTenantRole(req, ['coach', 'admin']);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const result = await restoreTeamMember(req.body?.memberId, session.user.id, session.teamId);
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'set_staff_level') {
        const session = await requireTenantRole(req, ['coach', 'admin']);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        if (!isHeadCoach(session)) {
          return res.status(403).json({ ok: false, error: 'Only the head coach can change staff permissions' });
        }
        const result = await setStaffLevel(req.body?.memberId, req.body?.staffLevel, session.user.id, session.teamId);
        await auditLog('staff_level_changed', {
          memberId: req.body?.memberId, staffLevel: req.body?.staffLevel,
          by: session.user.id, ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, ...result });
      }
      // ── Self-service account management (Settings) — any authenticated user.
      // Password/email changes re-verify the CURRENT password server-side.
      if (action === 'change_password') {
        const session = await requireSession(req);
        const result = await changePassword(session.user.id, {
          currentPassword: req.body?.currentPassword, newPassword: req.body?.newPassword,
        });
        await auditLog('password_changed', { userId: session.user.id, ip: requestIp(req) });
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'change_email') {
        const session = await requireSession(req);
        const result = await changeEmail(session.user.id, {
          currentPassword: req.body?.currentPassword, newEmail: req.body?.newEmail,
        });
        await auditLog('email_changed', { userId: session.user.id, newEmail: result.user?.email, ip: requestIp(req) });
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'update_profile') {
        const session = await requireSession(req);
        const result = await updateProfile(session.user.id, req.body || {});
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'approve_details') {
        const session = await requireTenantRole(req, ['coach', 'admin']);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const result = await approvePlayerDetails(req.body?.profileId, session.user.id, session.teamId);
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'update_preferences') {
        const session = await requireSession(req);
        const result = await updateNotificationPreferences(session.user.id, req.body?.preferences || {});
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'logout_all') {
        const session = await requireSession(req);
        // Keep THIS session alive so the user is not dumped to the login
        // screen mid-action; every other device must sign in again.
        const currentHash = tokenHashFor(sessionTokenFromRequest(req));
        const result = await destroyAllSessionsForUser(session.user.id, { exceptTokenHash: currentHash });
        await auditLog('logout_all_devices', { userId: session.user.id, revoked: result.revoked, ip: requestIp(req) });
        return res.status(200).json({ ok: true, revoked: result.revoked });
      }
      // ── Production account recovery — CRON_SECRET gated, never browser-reachable
      // without the server secret. Does NOT weaken normal auth: DEV_LOGIN stays
      // off, password rules unchanged, and only active staff accounts qualify.
      if (action === 'admin_account_status' || action === 'admin_reset_coach') {
        if (!process.env.CRON_SECRET) return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured' });
        if (readSecret(req) !== process.env.CRON_SECRET) {
          await auditLog('admin_recovery_denied', { action, ip: requestIp(req) });
          return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        if (action === 'admin_account_status') {
          const status = await adminAccountStatus(req.body?.email);
          return res.status(200).json({ ok: true, ...status });
        }
        // admin_reset_coach: resets to the supplied password, or generates a
        // temporary one. All live sessions for the account are revoked.
        const temporaryPassword = String(req.body?.newPassword || '').trim() ||
          `coach-${randomBytes(6).toString('base64url')}`;
        const result = await adminResetStaffPassword({ email: req.body?.email, newPassword: temporaryPassword });
        await auditLog('admin_reset_coach', {
          email: result.user?.email, userId: result.user?.id,
          sessionsRevoked: result.sessionsRevoked, ip: requestIp(req),
        });
        return res.status(200).json({
          ok: true,
          email: result.user?.email,
          userId: result.user?.id,
          sessionsRevoked: result.sessionsRevoked,
          // Returned ONCE over this authenticated admin call so the operator
          // can hand it to the coach; it is stored only as a hash.
          temporaryPassword: req.body?.newPassword ? undefined : temporaryPassword,
        });
      }
      if (action === 'dev_login') {
        if (process.env.DEV_LOGIN !== 'true') return res.status(403).json({ ok: false, error: 'Dev login not enabled' });
        const { userId } = req.body || {};
        if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
        const result = await devLoginUser(userId);
        if (!result) return res.status(404).json({ ok: false, error: 'User not found or not active' });
        if (result.session?.token) res.setHeader('Set-Cookie', sessionCookie(result.session.token));
        return res.status(200).json({ ok: true, ...publicAuthResult(result) });
      }
      return res.status(400).json({ ok: false, error: 'Unknown identity action' });
    } catch (error) {
      return sendError(res, error);
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
