// Scheduled Web Push dispatcher.
// cron-job.org calls every 5 minutes; Vercel Cron supplies daily fallback runs.
import webpush from 'web-push';
import { load, save } from './_lib.js';
import { recentResponders } from './_availabilityStore.js';
import { kvGet, kvSet, kvLpush, kvLtrim, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { resolveVariables } from './_variables.js';
import { setCors, readSecret, vapidContact } from './_http.js';

const DAY_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const EXACT_WINDOW_MINUTES = 6;
const VERCEL_FALLBACK_WINDOW_MINUTES = 120;

async function readArray(name) {
  const current = await kvGet(key(name));
  if (Array.isArray(current)) return current;
  const legacy = await kvGet(legacyKey(name));
  return Array.isArray(legacy) ? legacy : [];
}

export function localUTCOffset() {
  const configured = Number.parseInt(process.env.LOCAL_TZ_OFFSET || '1', 10);
  return Number.isFinite(configured) ? configured : 1;
}

function localDate(now, offsetHours) {
  return new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
}

function scheduleDays(schedule) {
  const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [schedule.day];
  return days.map(day => DAY_MAP[String(day || '').toLowerCase()]).filter(day => day !== undefined);
}

export function scheduledInstant(schedule, now = new Date(), offsetHours = localUTCOffset()) {
  const localNow = localDate(now, offsetHours);
  const [hours, minutes] = String(schedule.time || '09:00').split(':').map(Number);
  return new Date(Date.UTC(
    localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(),
    (hours || 0) - offsetHours, minutes || 0,
  ));
}

export function scheduleIsDue(schedule, now, fireWindowMinutes, offsetHours = localUTCOffset()) {
  if (!schedule.active) return false;
  const localNow = localDate(now, offsetHours);
  if (!scheduleDays(schedule).includes(localNow.getUTCDay())) return false;
  if (schedule.lastSentAt && new Date(schedule.lastSentAt).toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
    return false;
  }
  const scheduledAt = scheduledInstant(schedule, now, offsetHours);
  const minutesPast = (now.getTime() - scheduledAt.getTime()) / 60000;
  if (Math.abs(minutesPast) <= fireWindowMinutes) return true;
  if (minutesPast > 0 && minutesPast <= 30 && schedule.createdAt) {
    return (now.getTime() - new Date(schedule.createdAt).getTime()) / 60000 <= 30;
  }
  return false;
}

function availabilityActions(type) {
  if (type !== 'availability') return undefined;
  return [
    { action: 'available', title: 'Available' },
    { action: 'unavailable', title: 'Not available' },
    { action: 'maybe', title: 'Maybe' },
  ];
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (readSecret(req) !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }
  webpush.setVapidDetails(vapidContact(), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const now = new Date();
  const fireWindow = req.headers?.['x-vercel-cron'] === '1'
    ? VERCEL_FALLBACK_WINDOW_MINUTES : EXACT_WINDOW_MINUTES;
  const [schedules, templates, subscribers] = await Promise.all([
    readArray('schedules'), readArray('templates'), load(),
  ]);
  const due = schedules.filter(schedule => scheduleIsDue(schedule, now, fireWindow));
  const results = [];
  const expiredEndpoints = new Set();

  for (const schedule of due) {
    const template = templates.find(item => item.id === schedule.templateId);
    if (!template) {
      results.push({ scheduleId: schedule.id, sent: 0, failed: 0, error: 'Template not found' });
      continue;
    }
    let targetSubscribers = subscribers;
    if (schedule.audience === 'no-reply') {
      const responded = await recentResponders(7);
      targetSubscribers = subscribers.filter(item => !responded.has(item.label));
    }
    const notificationType = template.category === 'availability' ? 'availability' : 'message';
    const delivery = await Promise.allSettled(targetSubscribers.map(({ subscription, label }) => {
      const context = { label, coachName: schedule.coachName || 'Coach' };
      return webpush.sendNotification(subscription, JSON.stringify({
        title: resolveVariables(template.title, context),
        body: resolveVariables(template.body, context),
        from: schedule.coachName || 'Coach',
        tag: `sched-${schedule.id}-${now.toISOString().slice(0, 10)}`,
        url: '/?to=availability',
        type: notificationType,
        sessionId: schedule.sessionId || 'game',
        actions: availabilityActions(notificationType),
      }));
    }));
    const sent = delivery.filter(result => result.status === 'fulfilled').length;
    const failed = delivery.length - sent;
    delivery.forEach((result, index) => {
      if (result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode)) {
        expiredEndpoints.add(targetSubscribers[index].subscription.endpoint);
      }
    });
    schedule.lastSentAt = now.toISOString();
    await kvLpush(key('message_log'), {
      type: 'scheduled', scheduleId: schedule.id, scheduleName: schedule.name,
      templateId: template.id, templateName: template.name,
      title: resolveVariables(template.title, { coachName: schedule.coachName || 'Coach' }),
      body: resolveVariables(template.body, { coachName: schedule.coachName || 'Coach' }).slice(0, 200),
      sentAt: now.toISOString(), audience: schedule.audience || 'all',
      sent, failed, total: targetSubscribers.length,
      note: !targetSubscribers.length ? 'No eligible players; everyone may have responded' : undefined,
    });
    await kvLtrim(key('message_log'), 500);
    results.push({ scheduleId: schedule.id, templateId: template.id, sent, failed, total: targetSubscribers.length });
  }

  if (due.length) {
    // Re-read before writing: this reduces accidental overwrites if a coach
    // pauses or edits a schedule while a cron invocation is delivering.
    const freshest = await readArray('schedules');
    const sentTimes = new Map(due.filter(item => item.lastSentAt).map(item => [item.id, item.lastSentAt]));
    await kvSet(key('schedules'), freshest.map(item => sentTimes.has(item.id)
      ? { ...item, lastSentAt: sentTimes.get(item.id) } : item));
  }
  if (expiredEndpoints.size) {
    await save(subscribers.filter(item => !expiredEndpoints.has(item.subscription.endpoint)));
  }
  const totalSent = results.reduce((count, result) => count + (result.sent || 0), 0);
  return res.status(200).json({ ok: true, fired: results.length, totalSent, results });
}
