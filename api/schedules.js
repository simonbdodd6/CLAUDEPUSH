// api/schedules.js — Scheduled send CRUD
// GET             → { schedules: [...] }
// POST  { id?, templateId, name, day, time, active, coachName? } → save / upsert
// PUT   { id, active }   → toggle active
// DELETE { id }          → remove

import { kvGet, kvSet } from './_kv.js';

const SCHEDULES_KEY = 'ce:schedules';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Schedule shape:
 * {
 *   id:          string   — unique identifier
 *   name:        string   — human label  e.g. "Weekly availability check"
 *   templateId:  string   — references a template in ce:templates
 *   day:         string   — "monday" | "tuesday" | … | "sunday"
 *   time:        string   — "HH:MM" UTC  e.g. "08:00"
 *   active:      boolean
 *   coachName:   string   — injected as {{coach_name}}
 *   lastSentAt:  ISO string | null
 *   createdAt:   ISO string
 * }
 */

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const schedules = (await kvGet(SCHEDULES_KEY)) || [];
    return res.status(200).json({ schedules });
  }

  // ── POST: create / upsert ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { id, templateId, name, day, days, time, active, coachName } = req.body || {};
    if (!templateId || !time) {
      return res.status(400).json({ error: 'templateId and time are required' });
    }
    // Normalise days: accept multi-day array (new UI) or single day (legacy)
    const daysArr = Array.isArray(days) && days.length
      ? days
      : day ? [day.charAt(0).toUpperCase() + day.slice(1, 3)] : ['Mon'];
    const dayStr  = (daysArr[0] || 'Mon').toLowerCase();

    const schedules = (await kvGet(SCHEDULES_KEY)) || [];
    const entry = {
      id:         id || `sch-${Date.now()}`,
      name:       (name || 'Untitled schedule').slice(0, 80),
      templateId,
      days:       daysArr,              // full multi-day array
      day:        dayStr,               // legacy single-day fallback
      time,
      active:     active !== false,
      coachName:  coachName || 'Coach',
      lastSentAt: null,
      createdAt:  new Date().toISOString(),
    };
    const idx = schedules.findIndex(s => s.id === entry.id);
    if (idx >= 0) {
      // preserve lastSentAt and createdAt when updating
      entry.lastSentAt = schedules[idx].lastSentAt;
      entry.createdAt  = schedules[idx].createdAt;
      schedules[idx]   = entry;
    } else {
      schedules.push(entry);
    }
    await kvSet(SCHEDULES_KEY, schedules);
    return res.status(201).json({ ok: true, schedule: entry });
  }

  // ── PUT: toggle active / patch fields ─────────────────────────────────────
  if (req.method === 'PUT') {
    const { id, ...patch } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const schedules = (await kvGet(SCHEDULES_KEY)) || [];
    const idx = schedules.findIndex(s => s.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Schedule not found' });
    schedules[idx] = { ...schedules[idx], ...patch };
    await kvSet(SCHEDULES_KEY, schedules);
    return res.status(200).json({ ok: true, schedule: schedules[idx] });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const schedules = ((await kvGet(SCHEDULES_KEY)) || []).filter(s => s.id !== id);
    await kvSet(SCHEDULES_KEY, schedules);
    return res.status(200).json({ ok: true, count: schedules.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
