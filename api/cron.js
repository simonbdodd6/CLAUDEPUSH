// Scheduled Web Push dispatcher.
// cron-job.org calls every 5 minutes; Vercel Cron supplies daily fallback runs.
import webpush from 'web-push';
import { load, save, activeMemberIdSet, subscriptionsForMembers } from './_lib.js';
import { recentResponders } from './_availabilityStore.js';
import { kvGet, kvSet, kvLpush, kvLtrim, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { resolveVariables } from './_variables.js';
import { setCors, readSecret, vapidContact } from './_http.js';
import { OBSOLETE_LEGACY_ACCOUNT_IDS, loadNotificationPreferenceMap, notificationAllowed, loadTeamMembers, loadTeams } from './_identityStore.js';
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

// Weekly Availability fires once per scheduled local day, at the first cron run
// at/after the scheduled time. Unlike the ±window dispatcher this still delivers
// on Vercel's daily crons alone (just sooner when a 5-minute scheduler runs).
// Deduped per day via lastSentAt.
export function weeklyAvailabilityDue(slot, now, lastSentAt, offsetHours = localUTCOffset()) {
  if (!slot || !slot.day || !slot.time) return false;
  const localNow = localDate(now, offsetHours);
  const localToday = localNow.toISOString().slice(0, 10);
  if (lastSentAt) {
    const localLast = localDate(new Date(lastSentAt), offsetHours).toISOString().slice(0, 10);
    if (localLast === localToday) return false;            // already sent today
  }
  if (localNow.getUTCDay() !== DAY_MAP[String(slot.day).toLowerCase()]) return false;
  const [h, m] = String(slot.time).split(':').map(Number);
  return (localNow.getUTCHours() * 60 + localNow.getUTCMinutes()) >= ((h || 0) * 60 + (m || 0));
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
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (readSecret(req) !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

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

  // Weekly no-reply reminder — formerly /api/reminder, folded in to stay
  // under the Vercel Hobby 12-function limit. /api/reminder rewrites here
  // (vercel.json) so external schedulers keep working unchanged.
  if ((req.query?.job || req.body?.job) === 'reminder') {
    const subscribers = await load();
    // Club isolation: the weekly reminder carries no club-specific content, but
    // it must still reach ONLY active members of a club — never removed members,
    // legacy / test / demo accounts, or devices with no current membership.
    const reminderMembers = await loadTeamMembers();
    const memberSubscribers = subscriptionsForMembers(subscribers, activeMemberIdSet(reminderMembers));
    const responded = await recentResponders(7);
    const reminderPrefs = await loadNotificationPreferenceMap();
    const targets = memberSubscribers.filter(item => !responded.has(item.label))
      .filter(item => notificationAllowed(reminderPrefs, item.userId, { type: 'availability', sessionId: 'game' }));
    const title = 'Availability reminder';
    const body = "Hi {{first_name}}! Please set your availability for this week's sessions and match in Coach's Eye. - {{coach_name}}";
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

  const now = new Date();
  const fireWindow = req.headers?.['x-vercel-cron'] === '1'
    ? VERCEL_FALLBACK_WINDOW_MINUTES : EXACT_WINDOW_MINUTES;
  const [schedules, templates, subscribers] = await Promise.all([
    readArray('schedules'), readArray('templates'), load(),
  ]);
  const due = schedules.filter(schedule => scheduleIsDue(schedule, now, fireWindow));
  const automationMembers = await loadTeamMembers();
  const results = [];
  const expiredEndpoints = new Set();

  for (const schedule of due) {
    // Weekly Availability is fired from the club config (below); skip any legacy
    // client-synced sch-wk-* entries so they can never double-send.
    if (String(schedule.id || '').startsWith('sch-wk-')) continue;
    const template = templates.find(item => item.id === schedule.templateId);
    if (!template) {
      results.push({ scheduleId: schedule.id, sent: 0, failed: 0, error: 'Template not found' });
      continue;
    }
    // Club isolation: a schedule's message is club-specific content, so it may
    // only reach ACTIVE members of the team that created it. A schedule with no
    // teamId predates club tagging — skip it (fail-closed) so it can never be
    // delivered across clubs; it heals automatically when the coach re-saves it.
    if (!schedule.teamId) {
      results.push({ scheduleId: schedule.id, sent: 0, failed: 0, skipped: 'no teamId — re-save to attach club' });
      continue;
    }
    let targetSubscribers = subscriptionsForMembers(subscribers, activeMemberIdSet(automationMembers, schedule.teamId));
    if (schedule.audience === 'no-reply') {
      const responded = await recentResponders(7);
      targetSubscribers = targetSubscribers.filter(item => !responded.has(item.label));
    }
    const notificationType = template.category === 'availability' ? 'availability' : 'message';
    const schedulePrefs = await loadNotificationPreferenceMap();
    if (Object.keys(schedulePrefs).length) {
      targetSubscribers = targetSubscribers.filter(item =>
        notificationAllowed(schedulePrefs, item.userId, { type: notificationType, sessionId: schedule.sessionId || 'game' }));
    }
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

  // ── Weekly Availability automation (Overview card) ─────────────────────────
  // Fire each club's saved schedule straight from its club config — the same
  // place the coach's save reliably persists. Club isolation is enforced exactly
  // like the schedule dispatcher above: delivery is restricted to ACTIVE members
  // of that club only (subscriptionsForMembers ∩ activeMemberIdSet(teamId)).
  // Dedup is one send per club+session per day via the weekly_avail_fired map.
  try {
    const teams = await loadTeams();
    const firedMap = (await kvGet(key('weekly_avail_fired'))) || {};
    let firedChanged = false;
    const WA_SESSIONS = [['training1', 'Training session 1'], ['training2', 'Training session 2'], ['match', 'Match']];
    for (const team of (Array.isArray(teams) ? teams : [])) {
      const club = await kvGet(key(`club:${team.id}`));
      const wa = club?.weeklyAvailability;
      if (!wa || !wa.enabled) continue;
      for (const [sessionKey, label] of WA_SESSIONS) {
        const slot = wa[sessionKey];
        if (!slot || !slot.day || !slot.time) continue;
        const firedKey = `${team.id}:${sessionKey}`;
        const sessionId = sessionKey === 'match' ? 'game' : sessionKey;
        if (!weeklyAvailabilityDue(slot, now, firedMap[firedKey] || null)) continue;
        let targets = subscriptionsForMembers(subscribers, activeMemberIdSet(automationMembers, team.id));
        const waPrefs = await loadNotificationPreferenceMap();
        if (Object.keys(waPrefs).length) {
          targets = targets.filter(item => notificationAllowed(waPrefs, item.userId, { type: 'availability', sessionId }));
        }
        const title = `${club?.clubName || "Coach's Eye"} — Availability`;
        const body = `Hi {{first_name}}! Please set your availability for this week's ${label} in Coach's Eye.`;
        const delivery = await Promise.allSettled(targets.map(({ subscription, label: lbl }) =>
          webpush.sendNotification(subscription, JSON.stringify({
            title, body: resolveVariables(body, { label: lbl, coachName: 'Coach' }),
            from: 'Coach', tag: `wa-${team.id}-${sessionKey}-${now.toISOString().slice(0, 10)}`,
            url: '/?to=availability', type: 'availability', sessionId,
            actions: availabilityActions('availability'),
          }))));
        const sent = delivery.filter(result => result.status === 'fulfilled').length;
        const failed = delivery.length - sent;
        delivery.forEach((result, index) => {
          if (result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode)) {
            expiredEndpoints.add(targets[index].subscription.endpoint);
          }
        });
        firedMap[firedKey] = now.toISOString();
        firedChanged = true;
        try {
          if (club?.weeklyAvailability) { club.weeklyAvailability.lastSentAt = now.toISOString(); await kvSet(key(`club:${team.id}`), club); }
        } catch { /* display-only update */ }
        await kvLpush(key('message_log'), { type: 'weekly-availability', teamId: team.id, session: sessionKey, title, sentAt: now.toISOString(), sent, failed, total: targets.length });
        results.push({ weeklyAvailability: firedKey, sent, failed, total: targets.length });
      }
    }
    if (firedChanged) { await kvSet(key('weekly_avail_fired'), firedMap); await kvLtrim(key('message_log'), 500); }
  } catch (error) {
    results.push({ weeklyAvailability: 'error', error: String(error?.message || error) });
  }
  if (expiredEndpoints.size) {
    await save(subscribers.filter(item => !expiredEndpoints.has(item.subscription.endpoint)));
  }
  const totalSent = results.reduce((count, result) => count + (result.sent || 0), 0);
  return res.status(200).json({ ok: true, fired: results.length, totalSent, results });
}
