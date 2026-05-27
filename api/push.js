// api/push.js — Immediate ad-hoc push to all subscribed players
// POST { title, body, from, tag? } → sends Web Push to every stored subscription
// Used for "Send now" coach messages — scheduled sends go through api/cron.js

import webpush from 'web-push';
import { load } from './_lib.js';
import { kvLpush, kvLtrim } from './_kv.js';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:coach@boitsfortrfc.be', VAPID_PUBLIC, VAPID_PRIVATE);
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  const { title, body, from, tag, type, sessionId, targetLabel } = req.body || {};
  if (!body) return res.status(400).json({ error: 'Message body required' });

  const allSubscriptions = await load();
  if (!allSubscriptions.length) {
    return res.status(200).json({
      ok: true, sent: 0,
      note: 'No subscribers yet — players need to enable notifications first',
    });
  }

  // Filter to a specific player if targetLabel is provided
  const subscriptions = targetLabel
    ? allSubscriptions.filter(s => s.label === targetLabel)
    : allSubscriptions;

  if (targetLabel && !subscriptions.length) {
    return res.status(200).json({
      ok: true, sent: 0,
      note: `No subscription found for player "${targetLabel}" — they may not have enabled notifications yet`,
    });
  }

  const payload = JSON.stringify({
    title:     title     || "Coach's Eye",
    body,
    from:      from      || 'Coach',
    tag:       tag       || `msg-${Date.now()}`,
    url:       '/',
    type:      type      || 'message',      // 'availability' triggers YES/NO buttons
    sessionId: sessionId || 'game',         // used by SW to POST the response back
  });

  const results = await Promise.allSettled(
    subscriptions.map(({ subscription }) => webpush.sendNotification(subscription, payload))
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Push failed for sub ${i}:`, r.reason?.message || r.reason);
    }
  });

  // Append to message log (cap at 500 entries)
  try {
    await kvLpush('ce:message_log', {
      type:   'adhoc',
      title:  title || "Coach's Eye",
      body:   body.slice(0, 200),
      sentAt: new Date().toISOString(),
      sent, failed,
      total:  allSubscriptions.length,
      target: targetLabel || 'all',
    });
    await kvLtrim('ce:message_log', 500);
  } catch { /* non-critical */ }

  return res.status(200).json({ ok: true, sent, failed, total: allSubscriptions.length, target: targetLabel || 'all' });
}
