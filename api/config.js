// Browser-safe public configuration. Never send private VAPID or Redis values.
// Also handles ?log=1 for authenticated coach activity log reads.
import { setCors, vapidKeyStatus } from './_http.js';
import { kvConfigured, kvHealthCheck, kvLrange, kvLpush, kvLtrim } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { requireTenantPermission, PERM } from './_tenant.js';
import { enforceRateLimit, requestIp } from './_security.js';
import { normalizeErrorReport, MAX_ENTRIES } from './_errorLog.js';

const ERROR_LOG_KEY = () => key('error_log');
const deploymentVersion = () => (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  // ── H3 error ingest ──────────────────────────────────────────────────────
  // The one POST this endpoint accepts. Anonymous by design: the failures most
  // worth seeing happen before anyone is signed in (a broken login screen, a
  // bad deploy), and requiring auth would hide exactly those.
  //
  // Safe to leave open because the cost is bounded, not because it is trusted:
  // the list is trimmed to MAX_ENTRIES on every write, so total storage cannot
  // grow however much is sent; every field is length-capped and `kind` is an
  // enum; and the response is always 202 with no detail, so it cannot be used
  // to probe the server. Reports are scrubbed in _errorLog.js BEFORE storage —
  // no query string or fragment survives, so an invitation token cannot ride
  // in on a URL (the H1 guarantee, kept).
  if (req.method === 'POST' && req.query?.report === '1') {
    if (!kvConfigured()) return res.status(202).json({ ok: true });
    try {
      await enforceRateLimit('error_report', requestIp(req), { limit: 30, windowMs: 60 * 60 * 1000 });
    } catch {
      return res.status(202).json({ ok: true });   // silently dropped, never an error loop
    }
    try {
      const entry = normalizeErrorReport(req.body, { version: deploymentVersion() });
      if (entry) {
        await kvLpush(ERROR_LOG_KEY(), entry);
        await kvLtrim(ERROR_LOG_KEY(), MAX_ENTRIES);
      }
    } catch { /* telemetry must never break the app or surface its own failure */ }
    return res.status(202).json({ ok: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── H3 error read ────────────────────────────────────────────────────────
  // Same permission gate as the activity log below: recorded failures can name
  // routes and code paths, so they are staff-only.
  if (req.query?.errors === '1') {
    if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet', errors: [] });
    try {
      await requireTenantPermission(req, PERM.REPORTS);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const asked = Number.parseInt(req.query?.limit || '25', 10);
    const limit = Number.isFinite(asked) ? Math.max(1, Math.min(asked, MAX_ENTRIES)) : 25;
    const errors = await kvLrange(ERROR_LOG_KEY(), 0, limit - 1);
    return res.status(200).json({ errors, version: deploymentVersion() });
  }

  // Activity log sub-route — requires coach auth.
  if (req.query?.log === '1') {
    if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet', log: [] });
    try {
      await requireTenantPermission(req, PERM.REPORTS);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const requested = Number.parseInt(req.query?.limit || '10', 10);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 100)) : 10;
    let log = await kvLrange(key('message_log'), 0, limit - 1);
    if (!log.length) log = await kvLrange(legacyKey('message_log'), 0, limit - 1);
    return res.status(200).json({ log });
  }

  const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const storageConfigured = kvConfigured();
  const vapidStatus = vapidKeyStatus();
  // ?health=1 — live storage probe (2026-08-05 blocker). storageConfigured only
  // checks the env vars LOOK right; this proves the URL+token actually
  // authenticate, via a read of a nonexistent key. `code` is a fixed enum
  // ('ok' | 'unconfigured' | 'bad-url' | 'unauthorized' | 'unreachable' |
  // 'error') — no env value or upstream text can appear here. Lets a deploy be
  // verified before anyone retries onboarding, instead of discovering a bad
  // credential through a failing wizard.
  const storageHealth = req.query?.health === '1' ? await kvHealthCheck() : null;
  return res.status(200).json({
    ...(storageHealth ? { storageHealth } : {}),
    // Deployment identity for the Settings → Device card. Provided by Vercel
    // at build time; never hardcoded.
    version: deploymentVersion(),
    vapidPublicKey,
    pushConfigured: Boolean(vapidStatus.ok && storageConfigured),
    // Why push is unavailable, so the coach UI can show an actionable message
    // instead of a silent failure. Key *values* are never exposed.
    pushConfigError: vapidStatus.ok ? (storageConfigured ? null : 'Message storage not configured') : vapidStatus.error,
    storageConfigured,
    // Non-secret email-readiness signal for the diagnostics surface. Reports ONLY
    // whether transactional delivery is configured for this deployment — the presence
    // of RESEND_API_KEY, never its value. Per-send outcomes (attempted / failed) stay
    // in the sendTransactionalEmail return contract and server logs, not here.
    emailConfigured: Boolean((process.env.RESEND_API_KEY || '').trim()),
    devLogin: process.env.DEV_LOGIN === 'true',
    // Dev-only convenience for the local credentials panel. Values come from
    // env and are NEVER included unless DEV_LOGIN is explicitly enabled, so
    // production responses and the static HTML never contain credentials.
    ...(process.env.DEV_LOGIN === 'true' && process.env.COACH_DEMO_EMAIL ? {
      devCredentials: {
        email: process.env.COACH_DEMO_EMAIL,
        password: process.env.COACH_DEMO_PASSWORD || '',
      },
    } : {}),
  });
}
