// api/reminder.js — Monday 8 PM availability reminder
//
// Called by Vercel cron at 20:00 UTC every Monday (cron expression: 0 20 * * 1)
// Finds subscribers who haven't responded to ANY session this week
// and sends them a gentle reminder with a one-tap "All good" button.
//
// Also callable manually: GET /api/reminder?secret=CRON_SECRET

import webpush         from 'web-push';
import { load }        from './_lib.js';
import { kvGet, kvLpush, kvLtrim } from './_kv.js';
import { resolveVariables } from './_variables.js';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const CRON_SECRET   = process.env.CRON_SECRET;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:coach@boitsfortrfc.be', VAPID_PUBLIC, VAPID_PRIVATE);
}

export default async function handler(req, res) {
  // Auth
  const provided = (req.headers['authorization'] || '').replace('Bearer ', '').trim()
    || req.query?.secret || '';
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  const subscriptions = await load();
  if (!subscriptions.length) {
    return res.status(200).json({ ok: true, sent: 0, note: 'No subscribers' });
  }

  // Find who hasn't responded to any of the three sessions this week
  const [tueSubs, thuSubs, gameSubs] = await Promise.all([
    kvGet('ce:availability:tue').then(v => v || {}),
    kvGet('ce:availability:thu').then(v => v || {}),
    kvGet('ce:availability:game').then(v => v || {}),
  ]);

  // A subscriber has responded if their label appears in ANY of the three
  const responded = new Set([
    ...Object.keys(tueSubs),
    ...Object.keys(thuSubs),
    ...Object.keys(gameSubs),
  ]);

  const needReminder = subscriptions.filter(({ label }) => !responded.has(label));

  if (!needReminder.length) {
    return res.status(200).json({ ok: true, sent: 0, note: 'Everyone has already responded — no reminders needed 👏' });
  }

  const title = "Quick reminder 🏉";
  const body  = "Hi {{first_name}}! Have you set your availability for this week's training and match? Tap below or open the app.";

  const results = await Promise.allSettled(
    needReminder.map(({ subscription, label }) => {
      const payload = JSON.stringify({
        title,
        body:      resolveVariables(body, { label }),
        from:      'Coach',
        tag:       `reminder-${Date.now()}`,
        type:      'availability-reminder',
        sessionId: 'game',
      });
      return webpush.sendNotification(subscription, payload);
    })
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[reminder] Failed for ${needReminder[i]?.label}:`, r.reason?.message);
    }
  });

  // Log it
  try {
    await kvLpush('ce:message_log', {
      type:    'reminder',
      title,
      body:    body.slice(0, 200),
      sentAt:  new Date().toISOString(),
      sent, failed,
      total:   subscriptions.length,
      skipped: responded.size,
    });
    await kvLtrim('ce:message_log', 500);
  } catch { /* non-critical */ }

  console.log(`[reminder] Sent to ${sent} players, ${responded.size} had already responded`);

  return res.status(200).json({
    ok:      true,
    sent,
    failed,
    skipped: responded.size,
    note:    `${responded.size} players had already responded and were not disturbed`,
  });
}
