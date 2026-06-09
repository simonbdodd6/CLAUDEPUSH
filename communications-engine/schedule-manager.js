// Scheduling layer — immediate sends, future sends, recurring schedules.
// Integrates with the Workflow Engine queue for timed delivery.

import { randomUUID } from 'crypto';
import { logScheduled, logCancelled } from './communication-history.js';

let _workflow = null;
async function workflow() {
  if (!_workflow) { try { _workflow = await import('../workflow-engine/index.js'); } catch { _workflow = null; } }
  return _workflow;
}

export const SCHEDULE_STATUS = {
  PENDING:   'pending',
  SENT:      'sent',
  CANCELLED: 'cancelled',
  FAILED:    'failed',
};

// In-memory schedule store (a persistent queue would back this in production)
const _schedules = new Map();

export function scheduleNow(commSpec) {
  const scheduleId = randomUUID();
  const entry = {
    scheduleId,
    type:        commSpec.type,
    audienceType: commSpec.audienceType,
    vars:        commSpec.vars ?? {},
    sendAt:      new Date().toISOString(),
    status:      SCHEDULE_STATUS.PENDING,
    recurring:   false,
    createdAt:   new Date().toISOString(),
  };
  _schedules.set(scheduleId, entry);
  logScheduled({ type: commSpec.type, scheduleId, scheduledFor: entry.sendAt, audienceType: commSpec.audienceType });
  return { scheduleId, sendAt: entry.sendAt, status: SCHEDULE_STATUS.PENDING };
}

export function scheduleAt(commSpec, sendAt) {
  const scheduleId = randomUUID();
  const sendDate = sendAt instanceof Date ? sendAt : new Date(sendAt);

  const entry = {
    scheduleId,
    type:        commSpec.type,
    audienceType: commSpec.audienceType,
    vars:        commSpec.vars ?? {},
    sendAt:      sendDate.toISOString(),
    status:      SCHEDULE_STATUS.PENDING,
    recurring:   false,
    createdAt:   new Date().toISOString(),
  };

  _schedules.set(scheduleId, entry);
  logScheduled({ type: commSpec.type, scheduleId, scheduledFor: entry.sendAt, audienceType: commSpec.audienceType });

  return { scheduleId, sendAt: entry.sendAt, status: SCHEDULE_STATUS.PENDING };
}

// Schedule a recurring communication (e.g., weekly newsletter every Monday).
export function scheduleRecurring(commSpec, schedule) {
  const {
    frequency  = 'weekly',   // daily | weekly | monthly
    dayOfWeek  = 1,          // 0=Sun, 1=Mon ... 6=Sat (for weekly)
    dayOfMonth = 1,          // 1–28 (for monthly)
    timeHour   = 8,          // 24h
    timeMinute = 0,
  } = schedule;

  const scheduleId = randomUUID();
  const entry = {
    scheduleId,
    type:        commSpec.type,
    audienceType: commSpec.audienceType,
    vars:        commSpec.vars ?? {},
    recurring:   true,
    frequency,
    dayOfWeek,
    dayOfMonth,
    timeHour,
    timeMinute,
    nextRun:     computeNextRun(frequency, dayOfWeek, dayOfMonth, timeHour, timeMinute).toISOString(),
    status:      SCHEDULE_STATUS.PENDING,
    createdAt:   new Date().toISOString(),
  };

  _schedules.set(scheduleId, entry);
  logScheduled({ type: commSpec.type, scheduleId, scheduledFor: entry.nextRun, audienceType: commSpec.audienceType, recurring: true });

  return { scheduleId, nextRun: entry.nextRun, frequency, status: SCHEDULE_STATUS.PENDING };
}

function computeNextRun(frequency, dayOfWeek, dayOfMonth, hour, minute) {
  const now = new Date();
  const next = new Date(now);

  if (frequency === 'daily') {
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
    next.setDate(now.getDate() + daysUntil);
    next.setHours(hour, minute, 0, 0);
  } else if (frequency === 'monthly') {
    next.setDate(dayOfMonth);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next;
}

export function cancelScheduled(scheduleId) {
  const entry = _schedules.get(scheduleId);
  if (!entry) return { cancelled: false, reason: 'not found' };
  if (entry.status === SCHEDULE_STATUS.SENT) return { cancelled: false, reason: 'already sent' };

  entry.status = SCHEDULE_STATUS.CANCELLED;
  logCancelled({ type: entry.type, scheduleId });
  return { cancelled: true, scheduleId };
}

export function getScheduled() {
  return [..._schedules.values()].filter(e => e.status === SCHEDULE_STATUS.PENDING);
}

export function getScheduleById(scheduleId) {
  return _schedules.get(scheduleId) ?? null;
}

export function getAllSchedules() {
  return [..._schedules.values()];
}

// Returns schedules that are due to run now (sendAt <= now).
export function getDueSchedules() {
  const now = Date.now();
  return [..._schedules.values()].filter(e =>
    e.status === SCHEDULE_STATUS.PENDING && new Date(e.sendAt ?? e.nextRun).getTime() <= now
  );
}

export function markScheduleSent(scheduleId) {
  const entry = _schedules.get(scheduleId);
  if (!entry) return false;

  if (entry.recurring) {
    // Advance to next run instead of marking done
    const next = computeNextRun(entry.frequency, entry.dayOfWeek, entry.dayOfMonth, entry.timeHour, entry.timeMinute);
    entry.lastRun  = new Date().toISOString();
    entry.nextRun  = next.toISOString();
    entry.runCount = (entry.runCount ?? 0) + 1;
  } else {
    entry.status  = SCHEDULE_STATUS.SENT;
    entry.sentAt  = new Date().toISOString();
  }

  return true;
}

// Try to enqueue in Workflow Engine if available.
export async function enqueueWithWorkflow(commSpec, sendAt, name) {
  const wf = await workflow();
  if (!wf) return null;

  try {
    const result = wf.enqueue?.({
      name: name ?? `send_${commSpec.type}`,
      workflowDef: {
        id:   `comm_${commSpec.type}`,
        name: `Send ${commSpec.type}`,
        steps: [{
          id:       'step_1_send',
          actionId: 'send_player_notification',
          params:   { subject: commSpec.vars?.subject_line, body: commSpec.vars?.message_body },
        }],
      },
      scheduledFor: sendAt instanceof Date ? sendAt : new Date(sendAt),
    });
    return result;
  } catch {
    return null;
  }
}

export function scheduleStats() {
  const all = [..._schedules.values()];
  return {
    total:     all.length,
    pending:   all.filter(e => e.status === SCHEDULE_STATUS.PENDING).length,
    sent:      all.filter(e => e.status === SCHEDULE_STATUS.SENT).length,
    cancelled: all.filter(e => e.status === SCHEDULE_STATUS.CANCELLED).length,
    recurring: all.filter(e => e.recurring).length,
  };
}
