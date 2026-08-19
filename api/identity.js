import {
  adminAccountStatus,
  adminResetStaffPassword,
  approveJoinRequest,
  approvePlayerDetails,
  changeEmail,
  changePassword,
  claimInvite,
  createClub,
  provisionClub,
  isPlatformAdmin,
  createEmailVerificationToken,
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
  loadPlayerProfiles,
  loadUsers,
  loadTeamMembers,
  loadTeams,
  loginUser,
  rejectJoinRequest,
  removeTeamMember,
  permanentlyDeleteTeamMember,
  resetPasswordWithToken,
  resolveSessionFromRequest,
  restoreTeamMember,
  sessionCookie,
  sessionTokenFromRequest,
  setAccessProfile,
  setMemberAccessScope,
  setMedicalAccess,
  setMemberRole,
  setPlayerEligibility,
  removeScopedGrant,
  setStaffLevel,
  switchTeam,
  updateTeamBilling,
  verifyEmailToken,
} from './_identityStore.js';
import { appBaseUrl, emailVerificationEmail, passwordResetEmail, sendTransactionalEmail } from './_email.js';
import { setCors, readSecret } from './_http.js';
import { randomBytes } from 'node:crypto';
import { kvConfigured, kvGet, kvSet } from './_kv.js';
import { auditLog, enforceRateLimit, requestIp } from './_security.js';
import { assertSameTenant, requireTenantRole, requireTenantPermission, requireClubManage, can, PERM } from './_tenant.js';
import { loadClubStructure, groupById, teamById } from './_structureStore.js';
import { normalizeAccessScope, effectiveAccessScope } from './_accessScope.js';
import { isClubOwner } from './_permissions.js';
import { makeStripe } from './_stripe.js';

// Stripe client initialised once at module load.
// makeStripe() returns null when STRIPE_SECRET_KEY is not set, so every billing
// function must guard on `stripe` before attempting API calls.
const stripe = makeStripe(process.env.STRIPE_SECRET_KEY);

function stripeNotConfiguredError() {
  const e = new Error('Billing is not configured on this server — contact support');
  e.status = 503;
  return e;
}

// ── Phase 4 — Checkout and billing portal ───────────────────────────────────

async function createCheckoutSession({ team, userId, email, priceId, returnUrl }) {
  if (!stripe) throw stripeNotConfiguredError();
  if (!priceId) throw stripeNotConfiguredError();
  let customerId = team.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { teamId: team.id, userId },
    });
    customerId = customer.id;
    await updateTeamBilling(team.id, { stripeCustomerId: customerId });
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { teamId: team.id, userId },
    automatic_tax: { enabled: true },
    success_url: `${returnUrl}/?billing=success`,
    cancel_url: `${returnUrl}/?billing=cancel`,
  });
  return { checkoutUrl: session.url };
}

async function createBillingPortal({ stripeCustomerId, returnUrl }) {
  if (!stripe) throw stripeNotConfiguredError();
  const portal = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return { portalUrl: portal.url };
}

// ── Phase 5 — Stripe webhook ─────────────────────────────────────────────────
// Vercel parses the body as JSON before our handler runs, so the raw bytes
// needed for HMAC signature verification are unavailable. We re-fetch each
// event from Stripe by ID instead — if the caller supplied a fake ID that does
// not exist in our account, Stripe returns 404 and we discard the request.

function stripeStatusToPlanStatus(stripeStatus) {
  const MAP = {
    active: 'active', trialing: 'active',
    past_due: 'past_due', unpaid: 'past_due', incomplete: 'past_due',
    incomplete_expired: 'canceled', canceled: 'canceled',
    paused: 'paused',
  };
  return MAP[stripeStatus] || 'active';
}

async function findTeamIdByStripeIds({ subscriptionId, customerId }) {
  const teams = await loadTeams();
  const team = teams.find(t =>
    (subscriptionId && t.stripeSubscriptionId === subscriptionId) ||
    (customerId && t.stripeCustomerId === customerId),
  );
  return team?.id || null;
}

async function processStripeEvent(event) {
  const obj = event.data?.object;
  if (!obj) return;
  switch (event.type) {
    case 'checkout.session.completed': {
      const teamId = obj.metadata?.teamId;
      if (!teamId) return;
      await updateTeamBilling(teamId, {
        plan: 'pro',
        planStatus: 'active',
        stripeCustomerId: obj.customer || null,
        stripeSubscriptionId: obj.subscription || null,
      });
      await auditLog('subscription_activated', { teamId, stripeEvent: event.type, eventId: event.id });
      break;
    }
    case 'customer.subscription.updated': {
      const teamId = await findTeamIdByStripeIds({ subscriptionId: obj.id, customerId: obj.customer });
      if (!teamId) return;
      await updateTeamBilling(teamId, {
        planStatus: stripeStatusToPlanStatus(obj.status),
        stripeSubscriptionId: obj.id,
      });
      await auditLog('subscription_updated', { teamId, stripeStatus: obj.status, stripeEvent: event.type, eventId: event.id });
      break;
    }
    case 'customer.subscription.deleted': {
      const teamId = await findTeamIdByStripeIds({ subscriptionId: obj.id, customerId: obj.customer });
      if (!teamId) return;
      await updateTeamBilling(teamId, {
        plan: 'core',
        planStatus: 'canceled',
        stripeSubscriptionId: null,
      });
      await auditLog('subscription_canceled', { teamId, stripeEvent: event.type, eventId: event.id });
      break;
    }
    default: break;
  }
}

async function handleStripeWebhook(req, res) {
  if (!stripe) return res.status(503).json({ ok: false, error: 'Billing not configured' });
  const rawId = req.body?.id;
  const rawType = req.body?.type;
  if (!rawId || !rawType) return res.status(400).json({ ok: false, error: 'Invalid webhook payload' });
  const event = await stripe.events.retrieve(rawId);
  await processStripeEvent(event);
  return res.status(200).json({ ok: true, received: true });
}

function sendError(res, error, fallbackStatus = 400) {
  // Three classes (launch blocker, 2026-08-05):
  //  1. Errors with an explicit .status — thrown intentionally with messages we
  //     wrote for users (validation, auth, storage's fixed 503 text). Pass through.
  //  2. Native engine errors (TypeError & co) — crashes, not messages. Their text
  //     is internals and once leaked an env value to unauthenticated callers.
  //     Generic 500; detail server-side only.
  //  3. Plain Errors without .status — our own domain validation ("Club name is
  //     required"). Client fault, author-written text: fallback status + message.
  const intentional = Number.isInteger(error?.status);
  const native = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError;
  if (!intentional && native) {
    console.error('identity handler error:', error);
    return res.status(500).json({ ok: false, error: 'Something went wrong on our side — please try again.' });
  }
  const status = intentional ? error.status : fallbackStatus;
  // Author-written machine codes (e.g. 'account_exists') ride along so the
  // client can pick DETERMINISTIC copy without sniffing message text.
  return res.status(status).json({ ok: false, error: error?.message || 'Identity request failed',
    ...(error?.code ? { code: error.code } : {}) });
}

// RC4.9B — after a permanent deletion, any still-unclaimed invitation for that
// person must stop working, or the deleted member could simply re-join through
// an old link. Claimed invites keep their record (audit history) untouched.
const IDENTITY_INVITES_KEY = 'ce:invites';
async function revokeInvitesForDeletedMember(member = {}, displayName = '', memberEmail = '') {
  const invites = (await kvGet(IDENTITY_INVITES_KEY)) || [];
  if (!Array.isArray(invites) || !invites.length) return 0;
  const name = String(displayName || '').trim().toLowerCase();
  const email = String(memberEmail || '').trim().toLowerCase();
  let revoked = 0;
  invites.forEach(invite => {
    if (!invite || invite.teamId !== member.teamId) return;
    if (invite.status !== 'pending') return;               // never touch claimed/group history
    const matchesEmail = invite.email && email && String(invite.email).toLowerCase() === email;
    const matchesName  = name && String(invite.name || '').trim().toLowerCase() === name;
    if (!matchesEmail && !matchesName) return;
    invite.status = 'revoked';
    invite.revokedAt = new Date().toISOString();
    invite.revokedReason = 'member_deleted';
    revoked++;
  });
  if (revoked) await kvSet(IDENTITY_INVITES_KEY, invites);
  return revoked;
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
      const tenant = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
      if (req.query?.teamId) assertSameTenant(tenant, req.query.teamId);
      const state = await listIdentityState(tenant.teamId);
      return res.status(200).json({ ok: true, ...state });
    } catch (error) {
      return sendError(res, error);
    }
  }

  if (req.method === 'POST') {
    // Stripe sends a stripe-signature header; handle before reading body.action
    // so a webhook payload cannot be confused with a normal identity action.
    if (req.headers['stripe-signature']) {
      try { return await handleStripeWebhook(req, res); }
      catch (error) { return sendError(res, error, 500); }
    }

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
        // PUBLIC club self-signup is CLOSED: only a platform administrator
        // (or an explicit PUBLIC_CLUB_SIGNUP=true launch flag) may create a
        // club. Rate limiting alone previously left this open to anyone.
        if (process.env.PUBLIC_CLUB_SIGNUP !== 'true') {
          const creatorContext = await resolveSessionFromRequest(req).catch(() => null);
          if (!isPlatformAdmin(creatorContext?.user)) {
            return res.status(403).json({ ok: false,
              error: 'Club creation is not open yet — contact CoachEasier to set up your club' });
          }
        }
        await enforceRateLimit('create_club', requestIp(req), { limit: 5, windowMs: 60 * 60 * 1000 });
        const result = await createClub(req.body || {});
        await auditLog('club_created', {
          teamId: result.team?.id, clubName: result.team?.name,
          userId: result.user?.id, email: result.user?.email, ip: requestIp(req),
        });
        if (result.session?.token) res.setHeader('Set-Cookie', sessionCookie(result.session.token));
        return res.status(201).json({ ok: true, ...publicAuthResult(result) });
      }
      if (action === 'provision_club') {
        // Platform administrators only — a club-wide admin, coach or player
        // of ANY club is refused; authority lives on the user record.
        const provisioner = await resolveSessionFromRequest(req).catch(() => null);
        if (!isPlatformAdmin(provisioner?.user)) {
          return res.status(403).json({ ok: false, error: 'Platform administrators only' });
        }
        await enforceRateLimit('provision_club', requestIp(req), { limit: 10, windowMs: 60 * 60 * 1000 });
        const result = await provisionClub(req.body || {});
        await auditLog('club_provisioned', {
          teamId: result.team.id, clubName: result.team.name,
          adminEmail: result.invite.email, provisionedBy: provisioner.user.id, ip: requestIp(req),
        });
        const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
        const proto = req.headers?.['x-forwarded-proto'] || 'https';
        const inviteUrl = host
          ? `${proto}://${host}/?inv=${encodeURIComponent(result.invite.token)}`
          : `/?inv=${encodeURIComponent(result.invite.token)}`;
        return res.status(201).json({ ok: true,
          team: { id: result.team.id, name: result.team.name, teamCode: result.team.teamCode },
          adminEmail: result.invite.email, inviteUrl });
      }
      if (action === 'claim_invite') {
        // SECURITY: throttle claims (mirrors login) so the invite-claim path can't
        // be scripted for account-takeover / enumeration attempts.
        await enforceRateLimit('claim_invite', rateIdentity(req, req.body?.email || req.body?.token), { limit: 5, windowMs: 15 * 60 * 1000 });
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
        // Deliver internally only. A token exists solely for a real account
        // (createPasswordResetRequest returns a null token for unknown emails). The
        // provider outcome and the token expiry stay SERVER-SIDE — never in the public
        // response — so a direct caller cannot infer whether the email belongs to an
        // account, whether delivery is configured, or whether it succeeded.
        if (result.token && result.user?.email) {
          try {
            const resetUrl = `${appBaseUrl(req)}/?reset=${encodeURIComponent(result.token)}`;
            const message = passwordResetEmail({ name: result.user.displayName || result.user.email, url: resetUrl });
            const delivery = await sendTransactionalEmail({ to: result.user.email, ...message });
            if (!delivery.sent) console.warn('[reset] email not delivered', { reason: delivery.reason || 'unknown' });
          } catch {
            // A provider rejection must NOT become an enumeration oracle via HTTP status
            // or a thrown error — swallow to the constant response below.
            // sendTransactionalEmail already logs the provider status (no PII/secret).
            console.warn('[reset] delivery error suppressed for anti-enumeration');
          }
        }
        // Constant public contract — identical status, keys and values for EVERY accepted
        // request, regardless of account existence / delivery config / delivery outcome.
        // UI copy ("If that email has an account…") is unchanged and reads only { ok }.
        return res.status(200).json({ ok: true });
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
      if (action === 'switch_team') {
        const result = await switchTeam(sessionTokenFromRequest(req), req.body?.teamId);
        res.setHeader('Set-Cookie', sessionCookie(result.session.token));
        return res.status(200).json({ ok: true, teamId: result.teamId });
      }
      if (action === 'logout') {
        await destroySession(sessionTokenFromRequest(req));
        res.setHeader('Set-Cookie', clearSessionCookie());
        return res.status(200).json({ ok: true });
      }
      if (action === 'approve') {
        const session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const result = await approveJoinRequest(req.body?.memberId, session.user.id, session.teamId);
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'reject') {
        const session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const result = await rejectJoinRequest(req.body?.memberId, session.user.id, session.teamId);
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'remove_member' || action === 'archive_member') {
        const session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        // Removing STAFF requires the manage-coaches permission (head coach,
        // club admin, DoR, owner); managing players needs only manage-players.
        const members = await loadTeamMembers();
        const target = members.find(m => m.id === req.body?.memberId);
        if (target && ['coach', 'admin'].includes(target.role) && !can(session, PERM.MANAGE_COACHES)) {
          return res.status(403).json({ ok: false, error: 'You are not allowed to remove staff' });
        }
        const result = await removeTeamMember(req.body?.memberId, session.user.id, session.teamId, {
          archive: action === 'archive_member',
        });
        await auditLog(action, { memberId: req.body?.memberId, by: session.user.id, ip: requestIp(req) });
        return res.status(200).json({ ok: true, ...result });
      }
      // RC4.9B — irreversible member deletion. Archive stays the normal action;
      // this needs the highest member-management permission AND the danger-zone
      // permission, plus a typed confirmation that matches the member's name (or
      // the word DELETE) so it can never fire from a stray click or replayed call.
      if (action === 'delete_member_permanently') {
        // RC4.9C — gated ONLY on the PLAYER_DELETE permission, which every access
        // profile (full / coach / manager) grants for its assigned teams. The
        // session is already scoped to one team, so "assigned team" is enforced
        // by the membership lookup itself: no membership → no permissions there.
        const session = await requireTenantPermission(req, PERM.PLAYER_DELETE);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const memberId = String(req.body?.memberId || '');
        const members = await loadTeamMembers();
        const target = members.find(m => m.id === memberId && m.teamId === session.teamId);
        if (!target) return res.status(404).json({ ok: false, error: 'Team member not found' });
        const profiles = await loadPlayerProfiles();
        const targetUser = (await loadUsers()).find(u => u.id === target.userId) || {};
        const targetName = profiles.find(p => p.userId === target.userId)?.displayName
          || targetUser.displayName || '';
        const targetEmail = targetUser.email || '';
        const confirm = String(req.body?.confirm || '').trim();
        const confirmOk = confirm === 'DELETE' ||
          (targetName && confirm.toLowerCase() === targetName.toLowerCase());
        if (!confirmOk) {
          return res.status(400).json({ ok: false, error: 'Type DELETE or the member\'s name to confirm this permanent deletion' });
        }
        const result = await permanentlyDeleteTeamMember(memberId, session.user.id, session.teamId);
        // Any unused invitation tied to this person can no longer be claimed.
        const invitesRevoked = await revokeInvitesForDeletedMember(target, targetName, targetEmail);
        await auditLog('member_deleted_permanently', {
          memberId, deletedMemberId: memberId, userId: result.userId, teamId: session.teamId,
          performedBy: session.user.id, timestamp: result.deletedAt,
          sessionsRevoked: result.sessionsRevoked, invitesRevoked, ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, ...result, invitesRevoked });
      }
      // RC4.9C — assign or change a member's ACCESS PROFILE (full/coach/manager).
      // Requires ASSIGN_ACCESS, which only Full Access holders and the club owner
      // have. Granting Full Access additionally requires an explicit confirmation.
      if (action === 'set_access_profile') {
        const session = await requireTenantPermission(req, PERM.ASSIGN_ACCESS);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const memberId = String(req.body?.memberId || '');
        const nextProfile = String(req.body?.accessProfile || '').toLowerCase();
        if (nextProfile === 'full' && req.body?.confirmFullAccess !== true) {
          return res.status(400).json({
            ok: false,
            error: 'Granting Full Access needs explicit confirmation (confirmFullAccess)',
          });
        }
        const result = await setAccessProfile(memberId, nextProfile, session.user.id, session.teamId);
        await auditLog('access_profile_changed', {
          affectedUserId: result.teamMember.userId,
          memberId,
          previousProfile: result.previousProfile,
          newProfile: result.newProfile,
          assignedTeams: result.assignedTeams,
          changedBy: session.user.id,
          changedAt: result.changedAt,
          teamId: session.teamId,
          clubId: session.teamId,
          ip: requestIp(req),
        });
        return res.status(200).json({
          ok: true,
          teamMember: result.teamMember,
          previousProfile: result.previousProfile,
          newProfile: result.newProfile,
          assignedTeams: result.assignedTeams,
          changedAt: result.changedAt,
        });
      }
      // ── RC4.7 Phase C — scoped access administration ────────────────────
      // All three actions are club-wide-administrator only (requireClubManage),
      // validate every group/team id against THIS club's structure, and reject
      // archived targets. Nothing from the client is trusted: role, scope and
      // eligibility are re-validated server-side on every call.
      if (action === 'set_member_access') {
        const session = await requireClubManage(req, PERM.ASSIGN_ACCESS);
        const memberId = String(req.body?.memberId || '');
        const structure = await loadClubStructure(session.teamId);

        // Owner protection is enforced by the store (role) and the post-save
        // club-wide check below (scope).
        let result = { teamMember: null };

        if (req.body?.role !== undefined) {
          result = await setMemberRole(memberId,
            { role: req.body.role, staffLevel: req.body.staffLevel }, session.user.id, session.teamId);
        }

        if (req.body?.accessScope !== undefined) {
          const scope = normalizeAccessScope(req.body.accessScope);
          // Every referenced id must be a REAL, ACTIVE scope in this club.
          for (const grant of scope.groups) {
            const group = groupById(structure, grant.groupId);
            if (!group) return res.status(404).json({ ok: false, error: 'Unknown group for this club' });
            if (group.status === 'archived') return res.status(400).json({ ok: false, error: `"${group.name}" is archived — restore it before granting access` });
          }
          for (const grant of scope.teams) {
            const team = teamById(structure, grant.teamId);
            if (!team) return res.status(404).json({ ok: false, error: 'Unknown team for this club' });
            if (team.status === 'archived') return res.status(400).json({ ok: false, error: `"${team.name}" is archived — restore it before granting access` });
            const group = groupById(structure, team.groupId);
            if (!group || group.status === 'archived') return res.status(400).json({ ok: false, error: 'That team\'s group is archived' });
          }
          result = await setMemberAccessScope(memberId, scope, session.user.id, session.teamId);
          // The owner must remain club-wide — reject a save that would demote them.
          if (isClubOwner(result.teamMember) && !effectiveAccessScope(result.teamMember).clubWide) {
            await setMemberAccessScope(memberId, { clubWide: true, groups: [], teams: [] }, session.user.id, session.teamId);
            return res.status(400).json({ ok: false, error: "The club owner always has whole-club access" });
          }
        }

        await auditLog('member_access_changed', {
          memberId, changedBy: session.user.id, teamId: session.teamId,
          role: req.body?.role ?? null,
          scoped: req.body?.accessScope !== undefined,
          ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, teamMember: result.teamMember });
      }
      if (action === 'set_medical_access') {
        const session = await requireClubManage(req, PERM.ASSIGN_ACCESS);
        const memberId = String(req.body?.memberId || '');
        const result = await setMedicalAccess(memberId, req.body?.medicalAccess === true,
          session.user.id, session.teamId);
        await auditLog('medical_access_changed', {
          memberId, enabled: req.body?.medicalAccess === true,
          changedBy: session.user.id, teamId: session.teamId, ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, teamMember: result.teamMember });
      }
      if (action === 'set_member_eligibility') {
        const session = await requireClubManage(req, PERM.MANAGE_PLAYERS);
        const memberId = String(req.body?.memberId || '');
        const structure = await loadClubStructure(session.teamId);
        const teamIds = Array.isArray(req.body?.teamIds) ? req.body.teamIds.map(String) : [];
        for (const id of teamIds) {
          const team = teamById(structure, id);
          if (!team) return res.status(404).json({ ok: false, error: 'Unknown team for this club' });
          if (team.status === 'archived') return res.status(400).json({ ok: false, error: `"${team.name}" is archived — players cannot be eligible for it` });
        }
        const result = await setPlayerEligibility(memberId,
          { teamIds, primaryTeamId: req.body?.primaryTeamId }, session.user.id, session.teamId);
        await auditLog('player_eligibility_changed', {
          memberId, changedBy: session.user.id, teamId: session.teamId,
          teams: teamIds.length, ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, teamMember: result.teamMember });
      }
      if (action === 'remove_member_scope') {
        const session = await requireClubManage(req, PERM.ASSIGN_ACCESS);
        const memberId = String(req.body?.memberId || '');
        const groupId = req.body?.groupId ? String(req.body.groupId) : null;
        const teamId = req.body?.teamId ? String(req.body.teamId) : null;
        if (!groupId && !teamId) {
          return res.status(400).json({ ok: false, error: 'Choose the group or team access to remove' });
        }
        const result = await removeScopedGrant(memberId, { groupId, teamId }, session.user.id, session.teamId);
        if (isClubOwner(result.teamMember) && !effectiveAccessScope(result.teamMember).clubWide) {
          await setMemberAccessScope(memberId, { clubWide: true, groups: [], teams: [] }, session.user.id, session.teamId);
          return res.status(400).json({ ok: false, error: "The club owner always has whole-club access" });
        }
        await auditLog('member_scope_removed', {
          memberId, groupId, teamId, changedBy: session.user.id,
          teamId_club: session.teamId, ip: requestIp(req),
        });
        return res.status(200).json({ ok: true, teamMember: result.teamMember });
      }
      if (action === 'restore_member') {
        const session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        const result = await restoreTeamMember(req.body?.memberId, session.user.id, session.teamId);
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'set_staff_level') {
        const session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
        if (req.body?.teamId) assertSameTenant(session, req.body.teamId);
        if (!can(session, PERM.MANAGE_COACHES)) {
          return res.status(403).json({ ok: false, error: 'You are not allowed to change staff permissions' });
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
        const session = await requireTenantPermission(req, PERM.MANAGE_PLAYERS);
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
      if (action === 'send_verification_email') {
        await enforceRateLimit('send_verification_email', requestIp(req), { limit: 5, windowMs: 60 * 60 * 1000 });
        const sessionCtx = await requireSession(req);
        const result = await createEmailVerificationToken(sessionCtx.user.id);
        await auditLog('email_verification_sent', { userId: sessionCtx.user.id, ip: requestIp(req) });
        let emailDelivery = { ok: true, sent: false, skipped: true, reason: 'already_verified' };
        if (result.token && result.user?.email) {
          const verifyUrl = `${appBaseUrl(req)}/?verify=${encodeURIComponent(result.token)}`;
          const message = emailVerificationEmail({ name: result.user.displayName || result.user.email, url: verifyUrl });
          emailDelivery = await sendTransactionalEmail({ to: result.user.email, ...message });
        }
        return res.status(200).json({ ok: true, emailDelivery, expiresAt: result.expiresAt, alreadyVerified: result.alreadyVerified });
      }
      if (action === 'verify_email') {
        await enforceRateLimit('verify_email', rateIdentity(req, String(req.body?.token || '').slice(0, 12)), { limit: 10, windowMs: 60 * 60 * 1000 });
        const result = await verifyEmailToken(req.body?.token);
        await auditLog('email_verified', { userId: result.user?.id, ip: requestIp(req) });
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === 'create_checkout') {
        const tenant = await requireTenantPermission(req, PERM.MANAGE_SUBSCRIPTIONS);
        const teams = await loadTeams();
        const team = teams.find(t => t.id === tenant.teamId);
        if (!team) return res.status(404).json({ ok: false, error: 'Team not found' });
        if (team.plan === 'pro' && team.planStatus === 'active') {
          return res.status(409).json({ ok: false, error: 'Team already has an active Pro subscription' });
        }
        const result = await createCheckoutSession({
          team,
          userId: tenant.user.id,
          email: tenant.user.email || '',
          priceId: process.env.STRIPE_PRO_PRICE_ID || null,
          returnUrl: appBaseUrl(req),
        });
        await auditLog('checkout_initiated', { teamId: tenant.teamId, userId: tenant.user.id, ip: requestIp(req) });
        return res.status(200).json({ ok: true, checkoutUrl: result.checkoutUrl });
      }
      if (action === 'create_billing_portal') {
        const tenant = await requireTenantPermission(req, PERM.MANAGE_SUBSCRIPTIONS);
        const teams = await loadTeams();
        const team = teams.find(t => t.id === tenant.teamId);
        if (!team?.stripeCustomerId) {
          return res.status(409).json({ ok: false, error: 'No billing account found — start a subscription first' });
        }
        const result = await createBillingPortal({
          stripeCustomerId: team.stripeCustomerId,
          returnUrl: `${appBaseUrl(req)}/?section=settings`,
        });
        await auditLog('billing_portal_accessed', { teamId: tenant.teamId, userId: tenant.user.id, ip: requestIp(req) });
        return res.status(200).json({ ok: true, portalUrl: result.portalUrl });
      }
      return res.status(400).json({ ok: false, error: 'Unknown identity action' });
    } catch (error) {
      return sendError(res, error);
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
