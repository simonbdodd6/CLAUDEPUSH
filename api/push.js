// Immediate Web Push delivery for coach "Send now" actions.
import webpush from 'web-push';
import { load, save, clubMemberSubscriptions } from './_lib.js';
import { recentResponders } from './_availabilityStore.js';
import { kvLpush, kvLtrim, kvConfigured } from './_kv.js';
import { key } from './_keys.js';
import { resolveVariables } from './_variables.js';
import { setCors, vapidContact, vapidKeyStatus } from './_http.js';
import { requireTenantPermission, tenantTeamId, PERM } from './_tenant.js';
import { loadNotificationPreferenceMap, notificationAllowed, loadTeamMembers } from './_identityStore.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

// Returns { ok: true } or { ok: false, error } — never throws, so a malformed
// key in the environment produces a clear diagnostic instead of an opaque 500.
export function configurePush() {
  const status = vapidKeyStatus();
  if (!status.ok) return status;
  try {
    webpush.setVapidDetails(vapidContact(), process.env.VAPID_PUBLIC_KEY.trim(), process.env.VAPID_PRIVATE_KEY.trim());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `VAPID key validation failed: ${e?.message || e}` };
  }
}

function actionsFor(type) {
  return type === 'availability' || type === 'availability-reminder'
    ? [
        { action: 'available', title: 'Available' },
        { action: 'unavailable', title: 'Not available' },
        { action: 'maybe', title: 'Maybe' },
      ]
    : undefined;
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Dev-only direct test: bypasses Redis lookup and auth, sends to a subscription
  // object provided in the request body so every stage can be isolated.
  if (req.body?.action === 'test_device') {
    if (process.env.DEV_LOGIN !== 'true') return res.status(403).json({ ok: false, error: 'Dev only' });
    const devPushConfig = configurePush();
    if (!devPushConfig.ok) return res.status(500).json({ ok: false, error: devPushConfig.error });
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ ok: false, error: 'subscription.endpoint required' });
    const sentAt = new Date().toISOString();
    const payload = JSON.stringify({
      title: 'Push Diagnostics Test',
      body: `Diagnostics test — ${sentAt}`,
      tag: 'push-diag-test',
      type: 'message',
    });
    try {
      const result = await webpush.sendNotification(subscription, payload);
      return res.status(200).json({
        ok: true,
        sentAt,
        payload,
        statusCode: result.statusCode,
        body: result.body || '',
        headers: result.headers ? Object.fromEntries(Object.entries(result.headers)) : {},
      });
    } catch (e) {
      return res.status(200).json({
        ok: false,
        sentAt,
        payload,
        statusCode: e.statusCode || null,
        body: e.body || '',
        error: e.message || String(e),
        headers: e.headers ? Object.fromEntries(Object.entries(e.headers)) : {},
      });
    }
  }

  let sessionContext;
  try {
    sessionContext = await requireTenantPermission(req, PERM.MESSAGING);
  } catch (error) {
    return sendAuthError(res, error);
  }
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });
  const pushConfig = configurePush();
  if (!pushConfig.ok) {
    console.error('[push] not configured:', pushConfig.error);
    return res.status(500).json({ error: pushConfig.error, pushConfigured: false });
  }

  const { title, body, from, tag, type = 'message', sessionId = 'game', targetLabel, targetUserId, targetPlayerId, audience = 'all' } = req.body || {};
  if (!String(body || '').trim()) return res.status(400).json({ error: 'Message body required' });
  if (!['all', 'no-reply'].includes(audience)) return res.status(400).json({ error: 'audience must be all or no-reply' });

  const allSubscriptions = await load();

  // ── Club isolation ────────────────────────────────────────────────────────
  // Push subscriptions are stored in ONE global list with no teamId, while the
  // roster / sessions / squad / club are all namespaced per team. Without this
  // filter the send reaches every subscribed device — including users who are
  // not members of the sender's club. Restrict delivery to ACTIVE members of the
  // sender's team by intersecting subscriptions with identity:team_members for
  // this teamId (subscription.userId === team_member.userId for joined players).
  const teamId = tenantTeamId(sessionContext);
  const teamMembers = await loadTeamMembers();
  const clubSubscriptions = clubMemberSubscriptions(allSubscriptions, teamMembers, teamId);

  // Case-insensitive label match so "Nick Player" finds "nick player" sub
  const targetLower = targetLabel ? targetLabel.toLowerCase().trim() : null;
  const targetId = String(targetUserId || targetPlayerId || '').trim();
  let subscriptions = targetLower || targetId
    ? clubSubscriptions.filter(item => {
      if (targetId && [item.userId, item.playerId, item.legacyPlayerId].some(value => String(value || '') === targetId)) return true;
      return targetLower && (item.label || '').toLowerCase().trim() === targetLower;
    })
    : clubSubscriptions;
  if (audience === 'no-reply') {
    const responded = await recentResponders(7);
    subscriptions = subscriptions.filter(item =>
      ![item.label, item.userId, item.playerId, item.legacyPlayerId].some(value => value && responded.has(value))
    );
  }

  // Respect per-user notification preferences (Settings). Users with no
  // stored preferences are unaffected — opt-out only.
  const prefMap = await loadNotificationPreferenceMap();
  if (Object.keys(prefMap).length) {
    subscriptions = subscriptions.filter(item =>
      notificationAllowed(prefMap, item.userId, { type, sessionId }));
  }

  if (!subscriptions.length) {
    const allLabels = clubSubscriptions.map(s => s.label || s.userId || s.playerId);
    return res.status(200).json({ ok: true, sent: 0, failed: 0, total: 0,
      note: targetLabel
        ? `No subscription found for "${targetLabel}". Subscribed players: ${allLabels.join(', ') || 'none'}`
        : 'No subscribers yet' });
  }

  const sendResults = await Promise.allSettled(subscriptions.map(({ subscription, label }) => {
    const context = { label, coachName: from || 'Coach' };
    const payload = JSON.stringify({
      title: resolveVariables(title || "Coach's Eye", context),
      body: resolveVariables(body, context),
      from: from || 'Coach',
      tag: tag || `msg-${Date.now()}`,
      url: '/?to=availability',
      type,
      sessionId,
      actions: actionsFor(type),
    });
    return webpush.sendNotification(subscription, payload);
  }));
  const sent = sendResults.filter(result => result.status === 'fulfilled').length;
  const failed = sendResults.length - sent;

  // Remove endpoints permanently rejected by push services so repeated sends
  // do not continually count a deleted phone/browser as a delivery failure.
  const expired = new Set();
  sendResults.forEach((result, index) => {
    if (result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode)) {
      expired.add(subscriptions[index].subscription.endpoint);
    }
  });
  if (expired.size) {
    await save(allSubscriptions.filter(item => !expired.has(item.subscription.endpoint)));
  }

  await kvLpush(key('message_log'), {
    type: 'adhoc',
    title: String(title || "Coach's Eye").slice(0, 120),
    body: String(body).slice(0, 200),
    sentAt: new Date().toISOString(),
    audience,
    sent,
    failed,
    total: subscriptions.length,
    target: targetLabel || 'all',
  });
  await kvLtrim(key('message_log'), 500);
  return res.status(200).json({
    ok: true, sent, failed, total: subscriptions.length,
    target: targetUserId || targetPlayerId || targetLabel || 'all',
    results: sendResults.map((r, i) => ({
      label: subscriptions[i]?.label || '',
      userId: subscriptions[i]?.userId || '',
      status: r.status,
      statusCode: r.status === 'fulfilled' ? (r.value?.statusCode ?? 201) : (r.reason?.statusCode ?? null),
      error: r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : null,
    })),
  });
}
