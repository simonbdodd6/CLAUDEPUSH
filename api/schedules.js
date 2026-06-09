// Scheduled push-message CRUD. Times are stored exactly as entered locally.
import { kvGet, kvSet, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { setCors } from './_http.js';
import { requireTenantRole } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

const SCHEDULES_KEY = key('schedules');
const LEGACY_SCHEDULES_KEY = legacyKey('schedules');
const DAYS = new Set(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

async function readSchedules() {
  const current = await kvGet(SCHEDULES_KEY);
  if (Array.isArray(current)) return current;
  const legacy = await kvGet(LEGACY_SCHEDULES_KEY);
  return Array.isArray(legacy) ? legacy : [];
}

function normalizeDays(days, day) {
  const incoming = Array.isArray(days) && days.length ? days : [day || 'Mon'];
  const normalized = incoming.map(value => {
    const raw = String(value).trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1, 3).toLowerCase();
  });
  return [...new Set(normalized)].filter(value => DAYS.has(value));
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });
  try {
    await requireTenantRole(req, ['coach', 'admin']);
  } catch (error) {
    return sendAuthError(res, error);
  }

  if (req.method === 'GET') {
    return res.status(200).json({ schedules: await readSchedules() });
  }

  if (req.method === 'POST') {
    const { id, templateId, name, days, day, time, audience, active, coachName, sessionId } = req.body || {};
    const normalizedDays = normalizeDays(days, day);
    if (!String(name || '').trim() || !templateId || !/^\d{2}:\d{2}$/.test(String(time || '')) || !normalizedDays.length) {
      return res.status(400).json({ error: 'name, templateId, valid days and HH:MM time are required' });
    }
    if (audience && !['all', 'no-reply'].includes(audience)) {
      return res.status(400).json({ error: 'audience must be all or no-reply' });
    }
    const schedules = await readSchedules();
    const existing = schedules.find(schedule => schedule.id === id);
    const now = new Date().toISOString();
    const schedule = {
      id: String(id || `sch-${Date.now()}`),
      name: String(name).trim().slice(0, 80),
      templateId: String(templateId),
      days: normalizedDays,
      day: normalizedDays[0].toLowerCase(),
      time: String(time),
      audience: audience || 'all',
      active: active !== false,
      coachName: String(coachName || 'Coach').slice(0, 80),
      sessionId: String(sessionId || existing?.sessionId || 'game').slice(0, 80),
      lastSentAt: existing?.lastSentAt || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const next = existing
      ? schedules.map(item => item.id === schedule.id ? schedule : item)
      : [...schedules, schedule];
    await kvSet(SCHEDULES_KEY, next);
    return res.status(200).json({ ok: true, schedule });
  }

  if (req.method === 'PUT') {
    const { id, ...patch } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const schedules = await readSchedules();
    const index = schedules.findIndex(schedule => schedule.id === id);
    if (index < 0) return res.status(404).json({ error: 'Schedule not found' });
    const permitted = ['active', 'name', 'time', 'audience', 'days', 'coachName', 'sessionId'];
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([field]) => permitted.includes(field)));
    if (safePatch.audience && !['all', 'no-reply'].includes(safePatch.audience)) {
      return res.status(400).json({ error: 'audience must be all or no-reply' });
    }
    if (safePatch.days) {
      safePatch.days = normalizeDays(safePatch.days);
      if (!safePatch.days.length) return res.status(400).json({ error: 'At least one valid day is required' });
      safePatch.day = safePatch.days[0].toLowerCase();
    }
    schedules[index] = { ...schedules[index], ...safePatch, updatedAt: new Date().toISOString() };
    await kvSet(SCHEDULES_KEY, schedules);
    return res.status(200).json({ ok: true, schedule: schedules[index] });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const schedules = (await readSchedules()).filter(schedule => schedule.id !== id);
    await kvSet(SCHEDULES_KEY, schedules);
    return res.status(200).json({ ok: true, count: schedules.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
