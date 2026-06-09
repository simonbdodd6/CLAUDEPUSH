// Weekly no-reply reminder retained as a ready-made fallback automation.
import webpush from 'web-push';
import { load, save } from './_lib.js';
import { recentResponders } from './_availabilityStore.js';
import { kvLpush, kvLtrim, kvConfigured } from './_kv.js';
import { key } from './_keys.js';
import { resolveVariables } from './_variables.js';
import { setCors, readSecret, vapidContact } from './_http.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (readSecret(req) !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }
  webpush.setVapidDetails(vapidContact(), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const subscribers = await load();
  const responded = await recentResponders(7);
  const targets = subscribers.filter(item => !responded.has(item.label));
  const title = 'Availability reminder';
  const body = "Hi {{first_name}}! Please set your availability for this week's sessions and match in coacheseyeGPT. - {{coach_name}}";
  const outcomes = await Promise.allSettled(targets.map(({ subscription, label }) =>
    webpush.sendNotification(subscription, JSON.stringify({
      title, body: resolveVariables(body, { label }), from: 'Coach',
      tag: `weekly-reminder-${new Date().toISOString().slice(0, 10)}`,
      type: 'availability', sessionId: 'game', url: '/?to=availability',
      actions: [
        { action: 'available', title: 'Available' },
        { action: 'unavailable', title: 'Not available' },
        { action: 'maybe', title: 'Maybe' },
      ],
    }))
  ));
  const sent = outcomes.filter(result => result.status === 'fulfilled').length;
  const failed = outcomes.length - sent;
  const expired = new Set();
  outcomes.forEach((result, index) => {
    if (result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode)) {
      expired.add(targets[index].subscription.endpoint);
    }
  });
  if (expired.size) await save(subscribers.filter(item => !expired.has(item.subscription.endpoint)));
  await kvLpush(key('message_log'), {
    type: 'reminder', title, body: body.slice(0, 200), sentAt: new Date().toISOString(),
    audience: 'no-reply', sent, failed, total: targets.length, skipped: responded.size,
  });
  await kvLtrim(key('message_log'), 500);
  return res.status(200).json({ ok: true, sent, failed, skipped: responded.size, total: targets.length });
}
