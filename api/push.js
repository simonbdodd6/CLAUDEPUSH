// Immediate Web Push delivery for coach "Send now" actions.
import webpush from 'web-push';
import { load, save } from './_lib.js';
import { recentResponders } from './_availabilityStore.js';
import { kvLpush, kvLtrim, kvConfigured } from './_kv.js';
import { key } from './_keys.js';
import { resolveVariables } from './_variables.js';
import { setCors, vapidContact } from './_http.js';

function configurePush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(vapidContact(), publicKey, privateKey);
  return true;
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
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });
  if (!configurePush()) return res.status(500).json({ error: 'VAPID keys not configured' });

  const { title, body, from, tag, type = 'message', sessionId = 'game', targetLabel, audience = 'all' } = req.body || {};
  if (!String(body || '').trim()) return res.status(400).json({ error: 'Message body required' });
  if (!['all', 'no-reply'].includes(audience)) return res.status(400).json({ error: 'audience must be all or no-reply' });

  const allSubscriptions = await load();
  let subscriptions = targetLabel
    ? allSubscriptions.filter(item => item.label === targetLabel)
    : allSubscriptions;
  if (audience === 'no-reply') {
    const responded = await recentResponders(7);
    subscriptions = subscriptions.filter(item => !responded.has(item.label));
  }

  if (!subscriptions.length) {
    return res.status(200).json({ ok: true, sent: 0, failed: 0, total: 0, note: 'No eligible subscribed players' });
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
  return res.status(200).json({ ok: true, sent, failed, total: subscriptions.length, target: targetLabel || 'all' });
}
