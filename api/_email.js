import { kvConfigured, kvLpush, kvLtrim } from './_kv.js';
import { key } from './_keys.js';
import { normalizeErrorReport, MAX_ENTRIES } from './_errorLog.js';

const DEFAULT_FROM = 'CoachEasier <noreply@coacheasier.com>';
// Replies to a transactional (noreply) send should reach a monitored human inbox.
// Env-configurable via EMAIL_REPLY_TO; falls back to the verified support address so
// a coach who hits "reply" is never silently dropped even before the env var is set.
const DEFAULT_REPLY_TO = 'support@coacheasier.com';

/**
 * THE APPLICATION'S OWN URL — never the caller's claim about it.
 *
 * The links built on this carry single-use tokens (password reset, email
 * verification). While the request's Host chose their origin, a request
 * reaching this function with an attacker's Host would put that host into the
 * victim's email, and the victim clicking their own reset link would hand the
 * token over. api/invite.js has always built its links from the configured URL
 * alone; this is the same rule for the ones that were still trusting the
 * request. `req` is kept so no call site changes — it is deliberately unused.
 *
 * Set APP_URL when the application is served from anywhere but production
 * (local development, a preview deployment, the end-to-end harness).
 */
export function appBaseUrl(req = {}) {            // eslint-disable-line no-unused-vars
  return process.env.APP_URL || 'https://www.coacheasier.com';
}

/**
 * A provider rejection is the one failure the recovery flow cannot show anyone:
 * the public response stays a constant { ok: true } on purpose (anti-enumeration),
 * and the console warning below lives only as long as the platform keeps runtime
 * logs — an hour on the current plan. A sender domain that stops verifying, or
 * a revoked key, therefore made every password-reset and invite email vanish
 * with nothing an operator could find afterwards. Record the rejection in the
 * existing staff-gated Production health log instead: purpose and provider
 * status only — never the recipient, subject, body or any link — through the
 * same scrubber every stored error passes. It must never throw: telemetry
 * cannot be allowed to change the caller's contract.
 */
async function recordDeliveryFailure(purpose, providerStatus) {
  try {
    if (!kvConfigured()) return;
    const entry = normalizeErrorReport({
      kind: 'api_failure',
      status: 502,
      message: `Email provider rejected a ${String(purpose || 'transactional')} email (provider HTTP ${Number(providerStatus) || 'unknown'})`,
      source: 'api/_email.js',
    }, { version: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local' });
    if (!entry) return;
    await kvLpush(key('error_log'), entry);
    await kvLtrim(key('error_log'), MAX_ENTRIES);
  } catch { /* observability must never break delivery or its error contract */ }
}

export async function sendTransactionalEmail({ to, subject, html, text, purpose = 'transactional' } = {}) {
  const recipient = String(to || '').trim();
  if (!recipient) return { ok: true, sent: false, skipped: true, reason: 'missing_recipient' };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Observability only: make a misconfigured environment visible in server logs.
    // Never logs the key, the recipient, or any payload; return shape is unchanged so
    // callers and anti-enumeration responses behave exactly as before.
    console.warn('[email] delivery skipped — RESEND_API_KEY is not configured for this environment');
    return { ok: true, sent: false, skipped: true, reason: 'email_not_configured' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      // Resend's REST field is snake_case `reply_to`. Points replies at the human inbox.
      reply_to: process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO,
      to: recipient,
      subject,
      html,
      text,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Log only the provider HTTP status (no key, no recipient, no payload body) so a
    // rejected send (e.g. unverified sender domain) is diagnosable from logs.
    console.warn('[email] provider rejected delivery', { status: response.status });
    await recordDeliveryFailure(purpose, response.status);
    const error = new Error(payload?.message || payload?.error || 'Email delivery failed');
    error.status = 502;
    throw error;
  }
  return { ok: true, sent: true, provider: 'resend', id: payload.id || null };
}

export function inviteEmail({ name, teamName = 'Boitsfort RFC', url } = {}) {
  const safeName = String(name || 'Player');
  return {
    subject: `You're invited to join ${teamName} on CoachEasier`,
    text: `Hi ${safeName},\n\nYou've been invited to join ${teamName} on CoachEasier.\n\nClaim your account here:\n${url}\n\nThis link expires soon and can only be used once.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>You're invited to join ${teamName}</h2>
        <p>Hi ${safeName},</p>
        <p>Your coach has invited you to create your CoachEasier account.</p>
        <p><a href="${url}" style="display:inline-block;background:#8F6B2A;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Claim account</a></p>
        <p style="color:#64748b;font-size:13px">This link expires soon and can only be used once.</p>
      </div>`,
  };
}

export function emailVerificationEmail({ name, url } = {}) {
  const safeName = String(name || 'there');
  return {
    subject: "Verify your CoachEasier email address",
    text: `Hi ${safeName},\n\nVerify your email to complete your CoachEasier account setup:\n${url}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Verify your email address</h2>
        <p>Hi ${safeName},</p>
        <p>Click below to verify your email and complete your CoachEasier account setup.</p>
        <p><a href="${url}" style="display:inline-block;background:#8F6B2A;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p>
        <p style="color:#64748b;font-size:13px">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
      </div>`,
  };
}

export function passwordResetEmail({ name, url } = {}) {
  const safeName = String(name || 'there');
  return {
    subject: 'Reset your CoachEasier password',
    text: `Hi ${safeName},\n\nReset your CoachEasier password here:\n${url}\n\nThis link expires soon. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Reset your CoachEasier password</h2>
        <p>Hi ${safeName},</p>
        <p>Use the secure link below to set a new password.</p>
        <p><a href="${url}" style="display:inline-block;background:#8F6B2A;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Reset password</a></p>
        <p style="color:#64748b;font-size:13px">This link expires soon. If you did not request this, ignore this email.</p>
      </div>`,
  };
}
