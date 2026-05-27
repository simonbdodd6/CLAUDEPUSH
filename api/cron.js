// api/cron.js — Scheduled message dispatcher
//
// PRIMARY trigger: cron-job.org calling GET /api/cron?secret=CRON_SECRET every 5 minutes.
// FALLBACK:        Vercel Cron "0 * * * *" (hourly) defined in vercel.json.
//
// On each call it checks all active schedules, converts their stored Belgium
// local time to UTC, and fires any schedule within ±6 minutes of now.
// Daily deduplication prevents double-sends: a schedule that already fired
// today (UTC date) is skipped until tomorrow.
//
// Environment variables required:
//   CRON_SECRET              — shared secret (passed as ?secret= or Authorization: Bearer)
//   VAPID_PUBLIC_KEY         — Web Push VAPID public key
//   VAPID_PRIVATE_KEY        — Web Push VAPID private key
//   UPSTASH_REDIS_REST_URL   — Upstash Redis endpoint
//   UPSTASH_REDIS_REST_TOKEN — Upstash Redis token

import webpush        from 'web-push';
import { load }       from './_lib.js';
import { kvGet, kvSet, kvLpush, kvLtrim } from './_kv.js';
import { resolveVariables } from './_variables.js';

// All session IDs that store availability responses in Redis.
// Used when filtering for no-reply subscribers.
const AVAIL_SESSIONS = ['tue', 'thu', 'game'];
const AVAIL_KEY      = (id) => `ce:availability:${id}`;

// Return a Set of subscriber labels that responded within the last `withinDays` days.
// Values in Redis can be a plain string (old) or { response, respondedAt } (new).
async function recentResponders(withinDays = 7) {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const allData = await Promise.all(
    AVAIL_SESSIONS.map(id => kvGet(AVAIL_KEY(id)).then(v => v || {}))
  );
  const labels = new Set();
  for (const session of allData) {
    for (const [label, val] of Object.entries(session)) {
      if (typeof val === 'string') {
        // Old format — no timestamp, treat as "responded at some point" (include them)
        labels.add(label);
      } else if (val?.respondedAt) {
        if (new Date(val.respondedAt).getTime() >= cutoff) {
          labels.add(label);
        }
      }
    }
  }
  return labels;
}

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const CRON_SECRET   = process.env.CRON_SECRET;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:coach@boitsfortrfc.be', VAPID_PUBLIC, VAPID_PRIVATE);
}

const SCHEDULES_KEY = 'ce:schedules';
const TEMPLATES_KEY = 'ce:templates';

// Tolerance windows:
//   EXACT  (6 min) — used when cron-job.org calls every 5 minutes.
//                    Fires within ±6 min of the scheduled time.
//   WIDE (120 min) — used when Vercel's own daily cron calls
//                    (detected via x-vercel-cron header).
//                    4 daily crons at 07/14/18/20 UTC cover the whole day
//                    with this window.
const EXACT_WINDOW   =   6;
const WIDE_WINDOW    = 120;

const DAY_MAP = {
  sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6,
  sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6,
};

// ── Belgium UTC offset (no external library needed) ───────────────────────────
// Belgium: CET = UTC+1 (winter), CEST = UTC+2 (summer)
// CEST runs from last Sunday of March → last Sunday of October.
function belgiumUTCOffset(date) {
  const y = date.getUTCFullYear();
  // Last Sunday of March
  const mar = new Date(Date.UTC(y, 2, 31));
  mar.setUTCDate(31 - mar.getUTCDay());
  // Last Sunday of October
  const oct = new Date(Date.UTC(y, 9, 31));
  oct.setUTCDate(31 - oct.getUTCDay());
  return (date >= mar && date < oct) ? 2 : 1;
}

// Convert a "HH:MM" Belgium local time string to minutes-since-midnight UTC.
function belgiumTimeToUTCMinutes(timeStr, date) {
  const [h, m] = timeStr.split(':').map(Number);
  const offset = belgiumUTCOffset(date);
  return ((h - offset + 24) % 24) * 60 + (m || 0);
}

export default async function handler(req, res) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader  = req.headers['authorization'] || '';
  const querySecret = req.query?.secret || '';
  const provided    = authHeader.replace('Bearer ', '').trim() || querySecret;

  if (CRON_SECRET && provided !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  // Use a wide window when called by Vercel's own 4x-daily cron,
  // exact matching when called by cron-job.org every 5 minutes.
  const isVercelCron   = req.headers['x-vercel-cron'] === '1';
  const fireWindow     = isVercelCron ? WIDE_WINDOW : EXACT_WINDOW;

  const now        = new Date();
  const currentDay = now.getUTCDay(); // 0=Sun … 6=Sat

  // Current time as minutes since midnight UTC
  const nowUTCMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Today's UTC date string for deduplication (e.g. "2025-05-28")
  const todayUTC = now.toISOString().slice(0, 10);

  const [schedules, templates, subscriptions] = await Promise.all([
    kvGet(SCHEDULES_KEY).then(v => Array.isArray(v) ? v : []),
    kvGet(TEMPLATES_KEY).then(v => Array.isArray(v) ? v : []),
    load(),
  ]);

  const due = schedules.filter(s => {
    if (!s.active) return false;

    // ── Day check ──────────────────────────────────────────────────────────
    const scheduleDays = (s.days || [])
      .map(d => DAY_MAP[d.toLowerCase()])
      .filter(n => n !== undefined);
    // Legacy single-day fallback
    if (!scheduleDays.length && s.day) {
      scheduleDays.push(DAY_MAP[s.day.toLowerCase()]);
    }
    if (!scheduleDays.includes(currentDay)) return false;

    // ── Daily deduplication ────────────────────────────────────────────────
    // Skip if we already sent this schedule today (prevents double-fires when
    // both Vercel cron and cron-job.org call within the same fire window).
    if (s.lastSentAt) {
      const lastSentDay = new Date(s.lastSentAt).toISOString().slice(0, 10);
      if (lastSentDay === todayUTC) return false;
    }

    // ── Time check (Belgium local → UTC) ─────────────────────────────────
    // s.time is stored as entered by the coach in Belgium local time ("HH:MM").
    const schedUTCMinutes = belgiumTimeToUTCMinutes(s.time || '09:00', now);

    // ① Normal window: within ±fireWindow minutes of scheduled time
    const diff        = nowUTCMinutes - schedUTCMinutes; // positive = we're past the time
    const absDiff     = Math.abs(diff);
    const wrappedDiff = Math.min(absDiff, 1440 - absDiff); // handle midnight wrap
    if (wrappedDiff <= fireWindow) return true;

    // ② Catch-up: schedule was saved AFTER its cron window already fired today.
    //    Fire immediately if the scheduled time passed within the last 30 min
    //    and the schedule was created less than 30 min ago (fresh save).
    const minsOverdue = diff; // positive = past due
    if (minsOverdue > 0 && minsOverdue <= 30 && s.createdAt) {
      const minsOld = (now - new Date(s.createdAt)) / 60000;
      if (minsOld <= 30) return true;
    }

    return false;
  });

  if (due.length === 0) {
    return res.status(200).json({ ok: true, fired: 0, note: 'No schedules due now' });
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

    // ── Audience filtering ────────────────────────────────────────────────
    // 'no-reply': only send to subscribers who haven't responded in the last 7 days
    // 'all' (default): send to everyone
    let targetSubs = subscriptions;
    if (schedule.audience === 'no-reply') {
      const responders = await recentResponders(7);
      targetSubs = subscriptions.filter(({ label }) => !responders.has(label));
      if (targetSubs.length === 0) {
        console.log(`[cron] Schedule ${schedule.id}: no-reply audience — everyone has responded, skipping`);
        results.push({ scheduleId: schedule.id, templateId: template.id, sent: 0, failed: 0, note: 'All players responded' });
        schedule.lastSentAt = now.toISOString();
        continue;
      }
    }

    const context = { coachName: schedule.coachName || 'Coach' };

    // Send one personalised push per target subscriber
    const sendResults = await Promise.allSettled(
      targetSubs.map(({ subscription, label }) => {
        const ctx     = { ...context, label: label || 'Player' };
        const title   = resolveVariables(template.title, ctx);
        const body    = resolveVariables(template.body,  ctx);
        const payload = JSON.stringify({
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

    // Update lastSentAt on the schedule object
    schedule.lastSentAt = now.toISOString();

    // Log to message history
    try {
      await kvLpush('ce:message_log', {
        type:         'scheduled',
        scheduleId:   schedule.id,
        scheduleName: schedule.name,
        templateId:   template.id,
        templateName: template.name,
        title:        resolveVariables(template.title, context),
        body:         resolveVariables(template.body,  context).slice(0, 200),
        sentAt:       now.toISOString(),
        audience:     schedule.audience || 'all',
        sent, failed,
        total: targetSubs.length,
      });
      await kvLtrim('ce:message_log', 500);
    } catch { /* non-critical */ }

    results.push({ scheduleId: schedule.id, templateId: template.id, sent, failed });
  }

  // Persist updated lastSentAt values back to Redis
  try {
    const allSchedules = await kvGet(SCHEDULES_KEY).then(v => Array.isArray(v) ? v : []);
    const updatedMap   = Object.fromEntries(due.map(s => [s.id, s.lastSentAt]));
    const merged       = allSchedules.map(s =>
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
