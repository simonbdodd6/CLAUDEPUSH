// Scheduled Web Push dispatcher.
// cron-job.org calls every 5 minutes; Vercel Cron supplies daily fallback runs.
import webpush from 'web-push';
import { load, save } from './_lib.js';
import { recentResponders } from './_availabilityStore.js';
import { kvGet, kvSet, kvDel, kvLpush, kvLtrim, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { resolveVariables } from './_variables.js';
import { setCors, readSecret, vapidContact } from './_http.js';
import { OBSOLETE_LEGACY_ACCOUNT_IDS } from './_identityStore.js';
import { OBSOLETE_DM_PARTICIPANT_IDS } from './chat.js';

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

// ─── One-time account cleanup ────────────────────────────────────────
// Protected by embedded token (not CRON_SECRET) so it can be called
// without production secrets. Remove CLEANUP_TOKEN after use.
const CLEANUP_TOKEN = 'ce-cleanup-7f4a9b2e1d3c5a8b';

function _normName(v = '') { return String(v || '').trim().toLowerCase(); }

function _isKeptUser(u) {
  if (u.id === 'coach-demo') return true;         // Simon Coach
  if (u.id === 'player-simon-test') return true;  // Simon Test Player
  if (_normName(u.displayName) === 'simon test player 2') return true;
  return false;
}

async function handleCleanup(req, res, dryRun) {
  const [users, members, profiles, sessions, convs, allSubs] = await Promise.all([
    kvGet(key('identity:users')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('identity:team_members')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('identity:player_profiles')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('identity:sessions')).then(v => Array.isArray(v) ? v : []),
    kvGet(key('chat:convs')).then(v => Array.isArray(v) ? v : []),
    load(),
  ]);

  // Keep only the 3 canonical accounts — remove all others (QA artifacts etc.)
  const kept    = users.filter(u => _isKeptUser(u));
  const removed = users.filter(u => !_isKeptUser(u));
  const removedIds = new Set(removed.map(u => u.id));

  const dmConvsRemoved = convs.filter(c =>
    String(c.id || '').startsWith('dm:') &&
    c.id.split(':').slice(1).some(p => removedIds.has(p))
  );

  const report = {
    usersKept:      kept.map(u => ({ id: u.id, displayName: u.displayName })),
    usersRemoved:   removed.map(u => ({ id: u.id, displayName: u.displayName, email: u.email })),
    membersRemoved:  members.filter(m => removedIds.has(m.userId)).length,
    profilesRemoved: profiles.filter(p => removedIds.has(p.userId)).length,
    sessionsRemoved: sessions.filter(s => removedIds.has(s.userId)).length,
    subsRemoved: allSubs.filter(s =>
      [s.userId, s.playerId, s.legacyPlayerId].some(v => v && removedIds.has(String(v)))
    ).length,
    dmConvsRemoved: dmConvsRemoved.map(c => c.id),
  };

  if (dryRun) return res.status(200).json({ ok: true, dryRun: true, ...report });

  const removedConvIds = new Set(dmConvsRemoved.map(c => c.id));
  await Promise.all([
    kvSet(key('identity:users'),           users.filter(u => !removedIds.has(u.id))),
    kvSet(key('identity:team_members'),    members.filter(m => !removedIds.has(m.userId))),
    kvSet(key('identity:player_profiles'), profiles.filter(p => !removedIds.has(p.userId))),
    kvSet(key('identity:sessions'),        sessions.filter(s => !removedIds.has(s.userId))),
    save(allSubs.filter(s =>
      ![s.userId, s.playerId, s.legacyPlayerId].some(v => v && removedIds.has(String(v)))
    )),
    dmConvsRemoved.length
      ? kvSet(key('chat:convs'), convs.filter(c => !removedConvIds.has(c.id)))
      : Promise.resolve(),
    ...dmConvsRemoved.map(c => kvDel(key(`chat:conv:${c.id}:msgs`))),
  ]);

  return res.status(200).json({ ok: true, cleaned: true, ...report });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  // Cleanup/audit actions use embedded token — no CRON_SECRET required.
  const reqAction = req.query?.action || req.body?.action;
  if (reqAction === 'cleanup-audit' || reqAction === 'cleanup') {
    const token = String(
      req.headers?.authorization?.replace(/^Bearer\s+/i, '').trim() ||
      req.query?.token || req.body?.token || ''
    );
    if (token !== CLEANUP_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    const dryRun = reqAction === 'cleanup-audit' || req.body?.confirm !== true;
    return handleCleanup(req, res, dryRun);
  }

  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (readSecret(req) !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  // Debug action: read raw Redis identity + chat state without triggering any cleanup.
  if ((req.query?.action || req.body?.action) === 'debug') {
    const [users, teamMembers, playerProfiles, convs] = await Promise.all([
      kvGet(key('identity:users')),
      kvGet(key('identity:team_members')),
      kvGet(key('identity:player_profiles')),
      kvGet(key('chat:convs')),
    ]);
    const safeUsers = (Array.isArray(users) ? users : []).map(u => ({ id: u.id, displayName: u.displayName, email: u.email }));
    const safeConvs = (Array.isArray(convs) ? convs : []).map(c => ({ id: c.id, type: c.type, name: c.name }));
    const obsoleteUserIds = new Set(OBSOLETE_LEGACY_ACCOUNT_IDS);
    return res.status(200).json({
      ok: true,
      keyPrefix: process.env.APP_KEY_PREFIX || 'app',
      users: safeUsers,
      teamMemberCount: Array.isArray(teamMembers) ? teamMembers.length : 0,
      profileCount: Array.isArray(playerProfiles) ? playerProfiles.length : 0,
      conversations: safeConvs,
      diagnosis: {
        obsoleteUsersStillPresent: safeUsers.filter(u => obsoleteUserIds.has(u.id)).map(u => u.id),
        obsoleteDmsStillPresent: safeConvs.filter(c => c.id?.startsWith('dm:') && c.id.split(':').slice(1).some(p => OBSOLETE_DM_PARTICIPANT_IDS.has(p))).map(c => c.id),
        clean: safeUsers.every(u => !obsoleteUserIds.has(u.id)),
      },
    });
  }

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
