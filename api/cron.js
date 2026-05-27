// api/cron.js — Hourly scheduled message dispatcher
//
// Triggered every hour by Vercel Cron (vercel.json) OR by cron-job.org as backup.
// Checks all active schedules → resolves templates → personalises per subscriber → sends.
//
// Security: requests must carry the CRON_SECRET header (or query param)
//           so random internet traffic can't trigger mass sends.
//
// Environment variables required:
//   CRON_SECRET              — shared secret between Vercel cron and this function
//   VAPID_PUBLIC_KEY         — Web Push VAPID public key
//   VAPID_PRIVATE_KEY        — Web Push VAPID private key
//   UPSTASH_REDIS_REST_URL   — Upstash Redis endpoint
//   UPSTASH_REDIS_REST_TOKEN — Upstash Redis token

import webpush        from 'web-push';
import { load }       from './_lib.js';
import { kvGet, kvSet, kvLpush, kvLtrim } from './_kv.js';
import { resolveVariables } from './_variables.js';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const CRON_SECRET   = process.env.CRON_SECRET;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:coach@boitsfortrfc.be', VAPID_PUBLIC, VAPID_PRIVATE);
}

const SCHEDULES_KEY = 'ce:schedules';
const TEMPLATES_KEY = 'ce:templates';

const DAY_MAP = {
  sunday:0, monday:1, tuesday:2, wednesday:3,
  thursday:4, friday:5, saturday:6,
};

export default async function handler(req, res) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  // Accept secret via Authorization header OR ?secret= query param
  const authHeader = req.headers['authorization'] || '';
  const querySecret = req.query?.secret || '';
  const provided = authHeader.replace('Bearer ', '').trim() || querySecret;

  if (CRON_SECRET && provided !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only GET/POST accepted (Vercel cron uses GET)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  const now        = new Date();
  const currentDay = now.getUTCDay(); // 0=Sun … 6=Sat

  // Vercel free plan runs this cron once daily at 07:00 UTC.
  // We match on DAY only — all active schedules for today fire at this run.
  // For a weekly rugby club schedule (Monday availability, Tuesday training,
  // Saturday match reminder) this is exactly the right cadence.

  const [schedules, templates, subscriptions] = await Promise.all([
    kvGet(SCHEDULES_KEY).then(v => Array.isArray(v) ? v : []),
    kvGet(TEMPLATES_KEY).then(v => Array.isArray(v) ? v : []),
    load(),
  ]);

  const due = schedules.filter(s => {
    if (!s.active) return false;
    const schedDay = DAY_MAP[s.day?.toLowerCase()];
    return schedDay === currentDay;
  });

  if (due.length === 0) {
    return res.status(200).json({ ok: true, fired: 0, note: 'No schedules due today' });
  }

  if (subscriptions.length === 0) {
    return res.status(200).json({ ok: true, fired: 0, note: 'No subscribers' });
  }

  const results = [];

  for (const schedule of due) {
    const template = templates.find(t => t.id === schedule.templateId);
    if (!template) {
      results.push({ scheduleId: schedule.id, error: 'Template not found', sent: 0 });
      continue;
    }

    const context = { coachName: schedule.coachName || 'Coach' };

    // Send one personalised push per subscriber
    const sendResults = await Promise.allSettled(
      subscriptions.map(({ subscription, label }) => {
        const ctx      = { ...context, label: label || 'Player' };
        const title    = resolveVariables(template.title, ctx);
        const body     = resolveVariables(template.body,  ctx);
        const payload  = JSON.stringify({
          title,
          body,
          from:  schedule.coachName || 'Coach',
          tag:   `sched-${schedule.id}-${Date.now()}`,
          url:   '/',
        });
        return webpush.sendNotification(subscription, payload);
      })
    );

    const sent   = sendResults.filter(r => r.status === 'fulfilled').length;
    const failed = sendResults.filter(r => r.status === 'rejected').length;

    sendResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[cron] Push failed sub ${i} (schedule ${schedule.id}):`, r.reason?.message);
      }
    });

    // Update lastSentAt on the schedule
    schedule.lastSentAt = now.toISOString();

    // Log to message history
    try {
      await kvLpush('ce:message_log', {
        type:       'scheduled',
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        templateId: template.id,
        templateName: template.name,
        title:      resolveVariables(template.title, context),
        body:       resolveVariables(template.body,  context).slice(0, 200),
        sentAt:     now.toISOString(),
        sent, failed,
        total: subscriptions.length,
      });
      await kvLtrim('ce:message_log', 500);
    } catch { /* non-critical */ }

    results.push({ scheduleId: schedule.id, templateId: template.id, sent, failed });
  }

  // Persist updated lastSentAt values back to Redis
  try {
    const allSchedules = await kvGet(SCHEDULES_KEY).then(v => Array.isArray(v) ? v : []);
    const updatedMap = Object.fromEntries(due.map(s => [s.id, s.lastSentAt]));
    const merged = allSchedules.map(s =>
      updatedMap[s.id] ? { ...s, lastSentAt: updatedMap[s.id] } : s
    );
    await kvSet(SCHEDULES_KEY, merged);
  } catch (err) {
    console.error('[cron] Failed to persist lastSentAt:', err.message);
  }

  const totalSent = results.reduce((acc, r) => acc + (r.sent || 0), 0);
  console.log(`[cron] Fired ${results.length} schedule(s), sent ${totalSent} push(es)`);

  return res.status(200).json({ ok: true, fired: results.length, totalSent, results });
}
