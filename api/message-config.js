// Merged endpoint: schedules + templates (reduces serverless function count).
// Route: GET/POST/PUT/DELETE /api/message-config?resource=schedules|templates
import { kvGet, kvSet, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { setCors } from './_http.js';
import { requireTenantRole } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

// ─── SCHEDULES ───────────────────────────────────────────────────────────────
const SCHEDULES_KEY        = key('schedules');
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

async function handleSchedules(req, res) {
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
    const existing  = schedules.find(s => s.id === id);
    const now = new Date().toISOString();
    const schedule = {
      id:          String(id || `sch-${Date.now()}`),
      name:        String(name).trim().slice(0, 80),
      templateId:  String(templateId),
      days:        normalizedDays,
      day:         normalizedDays[0].toLowerCase(),
      time:        String(time),
      audience:    audience || 'all',
      active:      active !== false,
      coachName:   String(coachName || 'Coach').slice(0, 80),
      sessionId:   String(sessionId || existing?.sessionId || 'game').slice(0, 80),
      lastSentAt:  existing?.lastSentAt || null,
      createdAt:   existing?.createdAt  || now,
      updatedAt:   now,
    };
    const next = existing
      ? schedules.map(s => s.id === schedule.id ? schedule : s)
      : [...schedules, schedule];
    await kvSet(SCHEDULES_KEY, next);
    return res.status(200).json({ ok: true, schedule });
  }
  if (req.method === 'PUT') {
    const { id, ...patch } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const schedules = await readSchedules();
    const index     = schedules.findIndex(s => s.id === id);
    if (index < 0) return res.status(404).json({ error: 'Schedule not found' });
    const permitted = ['active', 'name', 'time', 'audience', 'days', 'coachName', 'sessionId'];
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([f]) => permitted.includes(f)));
    if (safePatch.audience && !['all', 'no-reply'].includes(safePatch.audience)) {
      return res.status(400).json({ error: 'audience must be all or no-reply' });
    }
    if (safePatch.days) {
      safePatch.days = normalizeDays(safePatch.days);
      if (!safePatch.days.length) return res.status(400).json({ error: 'At least one valid day is required' });
      safePatch.day  = safePatch.days[0].toLowerCase();
    }
    schedules[index] = { ...schedules[index], ...safePatch, updatedAt: new Date().toISOString() };
    await kvSet(SCHEDULES_KEY, schedules);
    return res.status(200).json({ ok: true, schedule: schedules[index] });
  }
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const schedules = (await readSchedules()).filter(s => s.id !== id);
    await kvSet(SCHEDULES_KEY, schedules);
    return res.status(200).json({ ok: true, count: schedules.length });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── TEMPLATES ───────────────────────────────────────────────────────────────
const TEMPLATES_KEY        = key('templates');
const LEGACY_TEMPLATES_KEY = legacyKey('templates');
const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-availability', name: 'Weekly Availability', category: 'availability',
    title: "coacheseyeGPT - Availability Check",
    body: 'Hi {{first_name}}! Please confirm your availability for {{session_day}} and {{match_day}}. Tap a response below. Thanks - {{coach_name}}',
  },
  {
    id: 'tpl-training-reminder', name: 'Training Reminder', category: 'training',
    title: 'Training Reminder - {{session_day}}',
    body: "Hi {{first_name}}! Training is at {{session_time}}. Open Coach's Eye for the plan. - {{coach_name}}",
  },
];

async function readTemplates() {
  const current = await kvGet(TEMPLATES_KEY);
  if (Array.isArray(current) && current.length) return current;
  const legacy = await kvGet(LEGACY_TEMPLATES_KEY);
  if (Array.isArray(legacy) && legacy.length) return legacy;
  const seeded = DEFAULT_TEMPLATES.map(t => ({ ...t, createdAt: new Date().toISOString() }));
  await kvSet(TEMPLATES_KEY, seeded);
  return seeded;
}

async function handleTemplates(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ templates: await readTemplates() });
  }
  if (req.method === 'POST') {
    const { id, name, category, title, body } = req.body || {};
    if (!String(name || '').trim() || !String(title || '').trim() || !String(body || '').trim()) {
      return res.status(400).json({ error: 'name, title and body are required' });
    }
    const templates = await readTemplates();
    const existing  = templates.find(t => t.id === id);
    const now = new Date().toISOString();
    const template = {
      id:        String(id || `tpl-${Date.now()}`),
      name:      String(name).trim().slice(0, 80),
      category:  String(category || 'custom').slice(0, 30),
      title:     String(title).trim().slice(0, 120),
      body:      String(body).trim().slice(0, 1000),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const next = existing
      ? templates.map(t => t.id === template.id ? template : t)
      : [...templates, template];
    await kvSet(TEMPLATES_KEY, next);
    return res.status(200).json({ ok: true, template });
  }
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const templates = (await readTemplates()).filter(t => t.id !== id);
    await kvSet(TEMPLATES_KEY, templates);
    return res.status(200).json({ ok: true, count: templates.length });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });
  try {
    await requireTenantRole(req, ['coach', 'admin']);
  } catch (error) {
    return sendAuthError(res, error);
  }
  const resource = String(req.query?.resource || '');
  if (resource === 'schedules') return handleSchedules(req, res);
  if (resource === 'templates') return handleTemplates(req, res);
  return res.status(400).json({ error: 'resource query param must be schedules or templates' });
}
